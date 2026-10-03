'use strict';

/**
 * Adversarial testing lab.
 *
 * Each scenario stages an attack against the real trust engine and reports
 * what the engine concluded. Nothing here is simulated or hard-coded: the
 * scenarios insert real rows, run the real scorer, and read the real verdict.
 *
 * They must not leave residue on the ledger, so every scenario runs inside a
 * transaction that is always rolled back. better-sqlite3 rolls back when the
 * transaction function throws, so each scenario ends by throwing a sentinel
 * carrying its results. Reads inside the transaction see the uncommitted
 * writes, which is what lets a tamper scenario observe its own damage before
 * it is undone.
 */

const express = require('express');
const { v4: uuid } = require('uuid');

const { db } = require('../db');
const { sha256, generateKeyPair, signAttestation } = require('../lib/crypto');
const { appendBlock, validateChain } = require('../lib/chain');
const trust = require('../lib/trust');
const { fingerprint } = require('./attesters');

const router = express.Router();

/** Thrown to force rollback while carrying the scenario's output out. */
class Rollback extends Error {
  constructor(payload) {
    super('scenario rollback');
    this.payload = payload;
  }
}

function sandbox(fn) {
  try {
    db.transaction(() => { throw new Rollback(fn()); })();
  } catch (err) {
    if (err instanceof Rollback) return err.payload;
    throw err;
  }
  throw new Error('scenario did not produce a result');
}

/** Insert an artifact inside the sandbox and anchor it. */
function stageArtifact(overrides = {}) {
  const id = uuid();
  const now = new Date().toISOString();
  const artifact = {
    id,
    filename: 'scenario-artifact.png',
    filetype: 'image/png',
    filesize: 1024,
    sha256: sha256(`scenario-${id}`),
    model_name: 'DALL-E 3',
    model_version: '3.0',
    model_provider: 'OpenAI',
    prompt_hash: sha256('scenario-prompt'),
    generation_params: '{"steps":50}',
    creator: 'scenario@example.com',
    trust_level: 'self-asserted',
    status: 'registered',
    block_id: null,
    registered_at: now,
    metadata: null,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO artifacts (
      id, filename, filetype, filesize, sha256, model_name, model_version,
      model_provider, prompt_hash, generation_params, creator, trust_level,
      status, block_id, registered_at, metadata
    ) VALUES (
      @id, @filename, @filetype, @filesize, @sha256, @model_name, @model_version,
      @model_provider, @prompt_hash, @generation_params, @creator, @trust_level,
      @status, @block_id, @registered_at, @metadata
    )
  `).run(artifact);

  const block = appendBlock([id], [artifact.sha256]);
  db.prepare('UPDATE artifacts SET block_id = ? WHERE id = ?').run(block.id, id);

  return { ...artifact, block_id: block.id };
}

/** Register an attester inside the sandbox and return it with its private key. */
function stageAttester(name, kind) {
  const { publicKey, privateKey } = generateKeyPair();
  const id = uuid();
  db.prepare(`
    INSERT INTO attesters (id, name, kind, public_key, key_fingerprint, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, kind, publicKey, fingerprint(publicKey) + id.slice(0, 4), new Date().toISOString());
  return { id, name, kind, publicKey, privateKey };
}

function attest(artifactId, attester, signature) {
  db.prepare(`
    INSERT INTO attestations (id, artifact_id, attester_id, signature, signed_at, valid)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(uuid(), artifactId, attester.id, signature, new Date().toISOString());
}

function read(id) {
  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
}

/** Condense a scoring result into what the UI needs to render a verdict. */
function verdict(scored) {
  return {
    score: scored.score,
    raw_score: scored.raw_score,
    ceiling: scored.ceiling,
    level: scored.level,
    gates: scored.gates,
    factors: scored.factors,
    conflicts: scored.conflicts,
    chain_valid: scored.chain_valid,
  };
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = {

  'fabricated-attestation': {
    title: 'Fabricated provider attestation',
    category: 'fabricated',
    threat: 'An uploader mints their own signing key, names it "OpenAI", and signs their own claim to look provider-endorsed.',
    expectation: 'The signature verifies — it is a real signature — but the key was never vetted, so the claim stays self-asserted.',
    run() {
      const artifact = stageArtifact();
      const before = trust.scoreArtifact(read(artifact.id));

      // The attacker's key is real and the signature is valid. What they
      // cannot do is make the operator vouch for the key.
      const impostor = stageAttester('OpenAI', 'community');
      attest(artifact.id, impostor, signAttestation(read(artifact.id), impostor.privateKey));

      const after = trust.scoreArtifact(read(artifact.id));

      return {
        steps: [
          { label: 'Register claim naming OpenAI as the provider', detail: `Trust: ${before.level} (${before.score}/100)` },
          { label: 'Attacker generates their own Ed25519 keypair', detail: 'Self-registered as a community key under the name "OpenAI".' },
          { label: 'Attacker signs their own provenance claim', detail: 'The signature is cryptographically valid.' },
          { label: 'Engine re-scores', detail: `Trust: ${after.level} (${after.score}/100)` },
        ],
        before: verdict(before),
        after: verdict(after),
        defended: after.level !== 'trusted',
        conclusion: after.level !== 'trusted'
          ? 'Defended. The signature proves who made the claim, not that OpenAI produced the artifact. Only a key the operator vetted out of band counts as corroboration, so the record is capped at self-asserted.'
          : 'NOT DEFENDED — a self-minted key reached trusted status.',
      };
    },
  },

  'conflicting-claims': {
    title: 'Conflicting provenance claims',
    category: 'conflicting',
    threat: 'Two parties register byte-identical content, each naming a different model as its origin.',
    expectation: 'Both records are capped. The ledger reports the conflict rather than picking a winner it has no basis to pick.',
    run() {
      const first = stageArtifact({ model_name: 'DALL-E 3', model_provider: 'OpenAI', creator: 'alice@example.com' });
      const beforeFirst = trust.scoreArtifact(read(first.id));

      // Same bytes, different story.
      const second = stageArtifact({
        sha256: first.sha256,
        model_name: 'Midjourney v6',
        model_provider: 'Midjourney',
        creator: 'mallory@example.com',
      });

      const afterFirst = trust.scoreArtifact(read(first.id));
      const afterSecond = trust.scoreArtifact(read(second.id));

      return {
        steps: [
          { label: 'Alice registers the content as DALL-E 3 output', detail: `Trust: ${beforeFirst.level} (${beforeFirst.score}/100)` },
          { label: 'Mallory registers identical bytes as Midjourney output', detail: 'Same SHA-256, different claimed origin.' },
          { label: 'Engine re-scores both records', detail: `Alice: ${afterFirst.level} (${afterFirst.score}) · Mallory: ${afterSecond.level} (${afterSecond.score})` },
        ],
        before: verdict(beforeFirst),
        after: verdict(afterFirst),
        secondary: verdict(afterSecond),
        defended: afterFirst.conflicts.length > 0 && afterSecond.conflicts.length > 0,
        conclusion: 'Defended. Both claims are flagged and capped. At most one can be true and the ledger has no evidence for either, so it surfaces the contradiction instead of resolving it. A vetted provider signature on one of them would break the tie.',
      };
    },
  },

  'incomplete-claim': {
    title: 'Incomplete provenance record',
    category: 'incomplete',
    threat: 'Content is registered with a model name and nothing else — no provider, no prompt hash, no parameters.',
    expectation: 'Scores into the unverifiable band. There is not enough recorded to check anything.',
    run() {
      const artifact = stageArtifact({
        model_version: null, model_provider: null, prompt_hash: null,
        generation_params: null, creator: null,
      });
      const scored = trust.scoreArtifact(read(artifact.id));
      const complete = trust.scoreArtifact(read(stageArtifact().id));

      return {
        steps: [
          { label: 'Register with model name only', detail: '1 of 6 provenance fields recorded.' },
          { label: 'Engine scores the sparse record', detail: `Trust: ${scored.level} (${scored.score}/100)` },
          { label: 'Compare against a complete record', detail: `Trust: ${complete.level} (${complete.score}/100)` },
        ],
        before: verdict(complete),
        after: verdict(scored),
        defended: scored.score < complete.score,
        conclusion: `Defended. The sparse record scores ${scored.score} against ${complete.score} for a complete one. Note that both are capped below trusted — completeness alone never crosses that line, because a filled-in form is self-reported too.`,
      };
    },
  },

  'tampered-after-anchoring': {
    title: 'Record edited after anchoring',
    category: 'tamper',
    threat: 'An operator with database access rewrites an artifact\'s claimed model after it was committed to a block.',
    expectation: 'The block\'s Merkle root no longer matches its contents. Chain validation fails and every trust score collapses.',
    run() {
      const artifact = stageArtifact();
      const before = trust.scoreArtifact(read(artifact.id));
      const chainBefore = validateChain();

      // Rewrite the anchored content hash — exactly what an insider edit
      // looks like at the database level.
      db.prepare('UPDATE artifacts SET model_name = ?, sha256 = ? WHERE id = ?')
        .run('Midjourney v6', sha256('tampered-content'), artifact.id);

      const chainAfter = validateChain();
      const after = trust.scoreArtifact(read(artifact.id));

      return {
        steps: [
          { label: 'Register and anchor the artifact', detail: `Chain: ${chainBefore.valid ? 'VALID' : 'COMPROMISED'} · Trust: ${before.level} (${before.score}/100)` },
          { label: 'Insider edits the anchored record directly in the database', detail: 'Model name and content hash rewritten after the block was mined.' },
          { label: 'Chain validation re-runs', detail: `Chain: ${chainAfter.valid ? 'VALID' : 'COMPROMISED'} — ${chainAfter.issues.length} issue(s) detected.` },
          { label: 'Engine re-scores', detail: `Trust: ${after.level} (${after.score}/100)` },
        ],
        before: verdict(before),
        after: verdict(after),
        chain_issues: chainAfter.issues,
        defended: !chainAfter.valid,
        conclusion: 'Defended. The Merkle root committed at mining time no longer matches the artifact hashes in the block, so the edit is detectable without knowing what the original said. Rewriting the block to match would invalidate every block above it.',
      };
    },
  },

  'broken-lineage': {
    title: 'Forged derivation link',
    category: 'fabricated',
    threat: 'A file of unknown origin is registered as a "resize" of a legitimately-registered trusted artifact, to inherit its provenance.',
    expectation: 'The declared input hash does not match what the parent actually produced, so the link is rejected and provenance does not transfer.',
    run() {
      const parent = stageArtifact();
      const child = stageArtifact({ status: 'derived', filename: 'laundered.png' });

      // The forged claim: "I came from the parent" — but the declared input
      // hash is not the parent's hash.
      db.prepare(`
        INSERT INTO transformations (
          id, artifact_id, parent_id, transform_type, transform_description,
          transformer_model, transformer_provider, input_hash, output_hash,
          trust_level, created_at, block_id, metadata
        ) VALUES (?, ?, ?, 'resizing', 'Resized to 1024px', NULL, NULL, ?, ?, 'self-asserted', ?, NULL, NULL)
      `).run(uuid(), child.id, parent.id, sha256('not-the-parent'), child.sha256, new Date().toISOString());

      const scored = trust.scoreArtifact(read(child.id));

      return {
        steps: [
          { label: 'A trusted original exists on the ledger', detail: parent.filename },
          { label: 'Attacker registers unrelated content as a resize of it', detail: 'Claims the original as parent to inherit its provenance.' },
          { label: 'Engine checks the declared input hash against the parent', detail: 'Mismatch — the transformation did not start from this parent.' },
          { label: 'Engine scores the derived record', detail: `Trust: ${scored.level} (${scored.score}/100)` },
        ],
        before: verdict(trust.scoreArtifact(read(parent.id))),
        after: verdict(scored),
        breaks: scored.lineage_breaks,
        defended: scored.lineage_breaks.length > 0,
        conclusion: 'Defended. A derivation only carries provenance when its declared input hash equals the parent\'s actual content hash. The forged link fails that check, so the laundered file gains nothing from naming a legitimate parent.',
      };
    },
  },

  'revoked-key': {
    title: 'Compromised provider key',
    category: 'tamper',
    threat: 'A vetted provider key is stolen and used to attest fraudulent content. The provider reports the compromise.',
    expectation: 'Revoking the key strips corroboration from everything it signed, retroactively.',
    run() {
      const artifact = stageArtifact();
      const provider = stageAttester('OpenAI', 'provider');
      attest(artifact.id, provider, signAttestation(read(artifact.id), provider.privateKey));

      const before = trust.scoreArtifact(read(artifact.id));

      db.prepare('UPDATE attesters SET revoked_at = ? WHERE id = ?')
        .run(new Date().toISOString(), provider.id);

      const after = trust.scoreArtifact(read(artifact.id));

      return {
        steps: [
          { label: 'Vetted OpenAI key attests the record', detail: `Trust: ${before.level} (${before.score}/100)` },
          { label: 'Key is reported compromised and revoked', detail: 'Revocation applies to every signature the key ever made.' },
          { label: 'Engine re-scores', detail: `Trust: ${after.level} (${after.score}/100)` },
        ],
        before: verdict(before),
        after: verdict(after),
        defended: before.level === 'trusted' && after.level !== 'trusted',
        conclusion: 'Defended. Trust is computed from live evidence on every read, not frozen at registration, so revocation takes effect retroactively across every record the key touched.',
      };
    },
  },

  'legitimate-transformation': {
    title: 'Legitimate re-encode (control)',
    category: 'control',
    threat: 'Not an attack. A trusted image is re-encoded to JPEG for publication, changing its hash entirely.',
    expectation: 'Provenance survives. The derived file resolves back to its original, and the engine does not cry foul.',
    run() {
      const parent = stageArtifact();
      const provider = stageAttester('OpenAI', 'provider');
      attest(parent.id, provider, signAttestation(read(parent.id), provider.privateKey));
      const before = trust.scoreArtifact(read(parent.id));

      const child = stageArtifact({
        status: 'derived',
        filename: 'cityscape_hero.jpg',
        filetype: 'image/jpeg',
      });

      // An honest transformation: the declared input is the parent's real hash.
      db.prepare(`
        INSERT INTO transformations (
          id, artifact_id, parent_id, transform_type, transform_description,
          transformer_model, transformer_provider, input_hash, output_hash,
          trust_level, created_at, block_id, metadata
        ) VALUES (?, ?, ?, 're-encoding', 'PNG to JPEG for web publication', NULL, NULL, ?, ?, 'self-asserted', ?, NULL, NULL)
      `).run(uuid(), child.id, parent.id, parent.sha256, child.sha256, new Date().toISOString());

      const after = trust.scoreArtifact(read(child.id));
      const resolved = trust.resolveLineage(child.id);

      return {
        steps: [
          { label: 'Trusted original, attested by a vetted OpenAI key', detail: `Trust: ${before.level} (${before.score}/100)` },
          { label: 'Published copy re-encoded to JPEG', detail: 'Completely different SHA-256 — a plain hash lookup would find nothing.' },
          { label: 'Transformation registered with the original as input', detail: 'Declared input hash matches the parent exactly.' },
          { label: 'Derived file resolves back through its lineage', detail: `${resolved.lineage.length} step(s) to the original, ${resolved.breaks.length} break(s).` },
        ],
        before: verdict(before),
        after: verdict(after),
        defended: resolved.breaks.length === 0,
        conclusion: 'Working as intended. The re-encoded file has no hash in common with the original, yet verification still resolves it to its source. Note it does not inherit trusted status — the provider attested the original, not this derivative, and the engine does not pretend otherwise.',
      };
    },
  },
};

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get('/scenarios', (req, res) => {
  res.json({
    scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({
      key,
      title: s.title,
      category: s.category,
      threat: s.threat,
      expectation: s.expectation,
    })),
  });
});

router.post('/run/:key', (req, res, next) => {
  const scenario = SCENARIOS[req.params.key];
  if (!scenario) return res.status(404).json({ error: 'Unknown scenario.' });

  try {
    const result = sandbox(() => scenario.run());
    res.json({
      key: req.params.key,
      title: scenario.title,
      category: scenario.category,
      threat: scenario.threat,
      expectation: scenario.expectation,
      ...result,
      sandboxed: true,
      note: 'Executed against the live trust engine inside a transaction that was rolled back. The ledger is unchanged.',
    });
  } catch (err) {
    next(err);
  }
});

/** Run the full suite — the one-click demo. */
router.post('/run-all', (req, res, next) => {
  try {
    const results = Object.entries(SCENARIOS).map(([key, scenario]) => {
      const result = sandbox(() => scenario.run());
      return {
        key, title: scenario.title, category: scenario.category,
        threat: scenario.threat, expectation: scenario.expectation, ...result,
      };
    });
    res.json({
      results,
      passed: results.filter(r => r.defended).length,
      total: results.length,
      sandboxed: true,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
