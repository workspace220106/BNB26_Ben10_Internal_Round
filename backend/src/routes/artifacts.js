'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const { db } = require('../db');
const { sha256, saltedHash, verifySaltedHash } = require('../lib/crypto');
const { appendBlock, validateChain, getBlockById, getInclusionProof } = require('../lib/chain');
const trust = require('../lib/trust');

const router = express.Router();

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024;

/**
 * Files are held in memory and hashed, never written to disk and never
 * persisted. The ledger only ever stores the digest — that is what lets a
 * verifier check an artifact without the operator holding a copy of it.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/** Shape a DB row into the API's artifact representation. */
function presentArtifact(row, scored) {
  if (!row) return null;
  const block = row.block_id ? getBlockById(row.block_id) : null;
  return {
    ...row,
    block_index: block ? block.block_index : null,
    block_hash: block ? block.hash : null,
    // prompt_hash is published as a boolean-ish marker plus the digest; the
    // prompt itself never leaves the registrant's machine.
    prompt_recorded: Boolean(row.prompt_hash),
    trust_score: scored ? scored.score : row.trust_score,
    trust_level: scored ? scored.level : row.trust_level,
    trust_reasons: scored
      ? scored.factors.filter(f => f.met).map(f => f.detail)
      : safeParse(row.trust_reasons, []),
  };
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

/** Persist the engine's verdict so list views can render without rescoring. */
function persistScore(artifactId, scored) {
  db.prepare(`
    UPDATE artifacts SET trust_level = ?, trust_score = ?, trust_reasons = ? WHERE id = ?
  `).run(
    scored.level,
    scored.score,
    JSON.stringify(scored.factors.filter(f => f.met).map(f => f.detail)),
    artifactId
  );
}

// ─── POST /api/artifacts/register ────────────────────────────────────────────

router.post('/register', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A file is required.' });

    const {
      model_name, model_version, model_provider,
      prompt, generation_params, creator, metadata,
      attester_id, signature,
    } = req.body;

    if (!model_name || !String(model_name).trim()) {
      return res.status(400).json({ error: 'model_name is required.' });
    }

    if (generation_params) {
      try { JSON.parse(generation_params); }
      catch { return res.status(400).json({ error: 'generation_params must be valid JSON.' }); }
    }

    const contentHash = sha256(req.file.buffer);

    // Salted so that a low-entropy prompt ("a cat on a skateboard") cannot be
    // recovered from the ledger by dictionary attack.
    const promptHash = prompt ? saltedHash(prompt) : null;

    const id = uuid();
    const registeredAt = new Date().toISOString();

    const artifact = {
      id,
      filename: req.file.originalname,
      filetype: req.file.mimetype || 'application/octet-stream',
      filesize: req.file.size,
      sha256: contentHash,
      model_name: String(model_name).trim(),
      model_version: model_version || null,
      model_provider: model_provider || null,
      prompt_hash: promptHash,
      generation_params: generation_params || null,
      creator: creator || null,
      trust_level: trust.LEVELS.SELF_ASSERTED,
      status: 'registered',
      block_id: null,
      registered_at: registeredAt,
      metadata: metadata || null,
    };

    const result = db.transaction(() => {
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

      // An attestation supplied at registration is recorded before scoring,
      // so a provider-signed upload comes out trusted on its first read.
      if (attester_id && signature) {
        const attester = db.prepare('SELECT * FROM attesters WHERE id = ?').get(attester_id);
        if (attester) {
          db.prepare(`
            INSERT INTO attestations (id, artifact_id, attester_id, signature, signed_at, valid)
            VALUES (?, ?, ?, ?, ?, 1)
          `).run(uuid(), id, attester_id, signature, registeredAt);
        }
      }

      const block = appendBlock([id], [contentHash]);
      db.prepare('UPDATE artifacts SET block_id = ? WHERE id = ?').run(block.id, id);

      return block;
    })();

    const stored = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
    const scored = trust.scoreArtifact(stored);
    persistScore(id, scored);

    res.status(201).json({
      artifact: { ...presentArtifact(stored, scored), trust_score: scored.score },
      trust: scored,
      block: {
        index: result.block_index,
        hash: result.hash,
        merkle_root: result.merkle_root,
        prev_hash: result.prev_hash,
        nonce: result.nonce,
      },
      inclusion_proof: getInclusionProof(id),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/artifacts/preview-trust ───────────────────────────────────────
// Lets the registration form show what the claim will score, and why, before
// anything is written to the ledger.

router.post('/preview-trust', express.json(), (req, res) => {
  res.json(trust.previewScore(req.body || {}));
});

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * Resolve a content hash to a verdict.
 *
 * Four outcomes, and the distinction between them is the point of the system:
 *   VERIFIED      — on the ledger, corroborated by the named provider.
 *   SELF_ASSERTED — on the ledger, but only the uploader vouches for it.
 *   TAMPERED      — the record and its evidence disagree.
 *   NOT_FOUND     — no record. Says nothing about whether the content is AI.
 */
function verifyByHash(hash, req) {
  const chain = validateChain();

  // Match the content hash directly, or as the output of a transformation —
  // that is how provenance survives re-encoding and resizing: the derived
  // file has a different hash, but the ledger knows where it came from.
  let artifact = db.prepare('SELECT * FROM artifacts WHERE sha256 = ? ORDER BY registered_at ASC LIMIT 1').get(hash);
  let matchedVia = artifact ? 'content_hash' : null;

  if (!artifact) {
    const transform = db.prepare(
      'SELECT * FROM transformations WHERE output_hash = ? ORDER BY created_at ASC LIMIT 1'
    ).get(hash);
    if (transform) {
      artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(transform.artifact_id);
      matchedVia = 'transformation_output';
    }
  }

  const verificationId = uuid();
  const verifiedAt = new Date().toISOString();

  if (!artifact) {
    db.prepare(`
      INSERT INTO verifications (id, artifact_id, provided_hash, result, trust_score, issues, verified_at, verifier_ip)
      VALUES (?, NULL, ?, 'NOT_FOUND', 0, NULL, ?, ?)
    `).run(verificationId, hash, verifiedAt, req.ip || null);

    return {
      verification_id: verificationId,
      result: 'NOT_FOUND',
      trust_score: 0,
      hash,
      chain_valid: chain.valid,
      message: 'No provenance record exists for this content. This is not evidence that the content is authentic, or that it is not AI-generated — only that nobody has registered a claim about it here.',
    };
  }

  const scored = trust.scoreArtifact(artifact, { chain });
  persistScore(artifact.id, scored);

  // Tampering is a different statement from low trust: it means the evidence
  // actively contradicts itself, rather than simply being thin.
  const tamperGates = ['CHAIN_COMPROMISED', 'INVALID_SIGNATURE', 'BROKEN_LINEAGE', 'REVOKED'];
  const tampered = scored.gates.some(g => tamperGates.includes(g.type));

  const result = tampered
    ? 'TAMPERED'
    : scored.level === trust.LEVELS.TRUSTED
      ? 'VERIFIED'
      : 'SELF_ASSERTED';

  const issues = [
    ...scored.gates.map(g => g.message),
    ...chain.issues.map(i => i.message),
    ...scored.lineage_breaks.map(b => b.message),
  ];

  db.prepare(`
    INSERT INTO verifications (id, artifact_id, provided_hash, result, trust_score, issues, verified_at, verifier_ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    verificationId, artifact.id, hash, result, scored.score,
    issues.length ? JSON.stringify(issues) : null, verifiedAt, req.ip || null
  );

  return {
    verification_id: verificationId,
    result,
    matched_via: matchedVia,
    trust_score: scored.score,
    trust_level: scored.level,
    trust_reasons: scored.factors.filter(f => f.met).map(f => f.detail),
    trust: scored,
    hash,
    artifact: presentArtifact(artifact, scored),
    transformations: db.prepare(
      'SELECT * FROM transformations WHERE artifact_id = ? OR parent_id = ? ORDER BY created_at ASC'
    ).all(artifact.id, artifact.id),
    block: artifact.block_id ? getBlockById(artifact.block_id) : null,
    inclusion_proof: getInclusionProof(artifact.id),
    chain_valid: chain.valid,
    issues,
  };
}

router.post('/verify', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A file is required.' });
    res.json(verifyByHash(sha256(req.file.buffer), req));
  } catch (err) {
    next(err);
  }
});

router.post('/verify-hash', express.json(), (req, res, next) => {
  try {
    const hash = String(req.body?.hash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      return res.status(400).json({ error: 'Provide a 64-character hexadecimal SHA-256 hash.' });
    }
    res.json(verifyByHash(hash, req));
  } catch (err) {
    next(err);
  }
});

/**
 * Prove a prompt produced a record without revealing it.
 *
 * The holder of the original prompt sends it; the server re-derives the salted
 * hash and compares. The prompt is never stored, and a verifier who does not
 * already know the prompt learns nothing from the ledger.
 */
router.post('/:id/prove-prompt', express.json(), (req, res) => {
  const artifact = db.prepare('SELECT prompt_hash FROM artifacts WHERE id = ?').get(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });
  if (!artifact.prompt_hash) {
    return res.status(409).json({ error: 'No prompt hash was recorded for this artifact.' });
  }

  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }

  const matches = verifySaltedHash(prompt, artifact.prompt_hash);
  res.json({
    matches,
    message: matches
      ? 'This prompt reproduces the hash recorded at registration. The claim is confirmed without the prompt being stored or disclosed.'
      : 'This prompt does not reproduce the recorded hash.',
  });
});

// ─── GET /api/artifacts/:id ──────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });

  const scored = trust.scoreArtifact(artifact);
  persistScore(artifact.id, scored);

  res.json({
    artifact: presentArtifact(artifact, scored),
    trust: scored,
    block: artifact.block_id ? getBlockById(artifact.block_id) : null,
    inclusion_proof: getInclusionProof(artifact.id),
    derived_from: db.prepare('SELECT * FROM transformations WHERE artifact_id = ? ORDER BY created_at ASC').all(artifact.id),
    derivatives: db.prepare('SELECT * FROM transformations WHERE parent_id = ? ORDER BY created_at ASC').all(artifact.id),
  });
});

/**
 * The full chain of custody for an artifact: every ancestor back to the
 * original, and every descendant derived from it.
 */
router.get('/:id/chain', (req, res) => {
  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });

  const { lineage, breaks, root } = trust.resolveLineage(artifact.id);

  // Walk forward too, so the UI can draw the whole tree rather than one branch.
  const descendants = [];
  const queue = [artifact.id];
  const seen = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    const children = db.prepare('SELECT * FROM transformations WHERE parent_id = ?').all(current);
    for (const child of children) {
      if (seen.has(child.artifact_id)) continue;
      seen.add(child.artifact_id);
      const childArtifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(child.artifact_id);
      descendants.push({ transformation: child, artifact: childArtifact || null });
      queue.push(child.artifact_id);
    }
  }

  res.json({
    artifact: presentArtifact(artifact),
    root: root ? presentArtifact(root) : presentArtifact(artifact),
    ancestors: lineage.map(l => ({
      transformation: l.transform,
      artifact: l.parent ? presentArtifact(l.parent) : null,
      link_valid: l.link_valid,
    })),
    descendants,
    breaks,
    intact: breaks.length === 0,
  });
});

module.exports = router;
module.exports.verifyByHash = verifyByHash;
module.exports.presentArtifact = presentArtifact;
module.exports.persistScore = persistScore;
