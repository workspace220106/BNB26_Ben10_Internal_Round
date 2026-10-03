'use strict';

/**
 * The trust engine.
 *
 * The central claim of the problem statement is that a digital signature
 * proves *who made a provenance claim*, not *that the claimed model produced
 * the artifact*. This module takes that seriously.
 *
 * Nothing a registrant types about themselves can make their own claim
 * trusted. Only corroboration from a party other than the claimant can:
 * a signature from a key the ledger operator has vetted as belonging to the
 * named model provider. Everything else — a complete form, a plausible
 * parameter blob, an early timestamp — is evidence that a *claim* exists and
 * has not been edited since, which is a strictly weaker statement.
 *
 * So the scoring has two parts:
 *   1. Additive evidence factors, which build a score out of what is present.
 *   2. Gates, which cap or collapse that score regardless of how much
 *      self-reported detail was supplied.
 *
 * The gates are the important half. Without them this would be a form
 * completeness meter wearing a trust score's clothes.
 */

const { db } = require('./../db');
const { verifyAttestation } = require('./crypto');

const LEVELS = {
  TRUSTED: 'trusted',
  SELF_ASSERTED: 'self-asserted',
  UNVERIFIABLE: 'unverifiable',
};

/** Score bands. Kept here so the UI and the engine cannot drift apart. */
const BANDS = {
  trusted: { min: 75, max: 100 },
  'self-asserted': { min: 40, max: 74 },
  unverifiable: { min: 0, max: 39 },
};

/**
 * The ceiling an unattested claim can reach. Set one point below the
 * 'trusted' band on purpose: no amount of self-reported completeness should
 * be able to cross into trusted territory.
 */
const UNATTESTED_CEILING = BANDS['self-asserted'].max;

/**
 * Factor weights. Attestation carries the largest share because it is the
 * only factor that corroborates a claim rather than merely recording one.
 *
 * These are relative, not absolute: the final score is renormalised over
 * whichever factors applied, so the numbers express priority between factors
 * rather than a fixed points budget.
 */
const WEIGHTS = {
  attested: 35,
  anchored: 15,
  completeness: 30,
  lineage: 10,
  unconflicted: 10,
};

function levelForScore(score) {
  if (score >= BANDS.trusted.min) return LEVELS.TRUSTED;
  if (score >= BANDS['self-asserted'].min) return LEVELS.SELF_ASSERTED;
  return LEVELS.UNVERIFIABLE;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Resolve every attestation on an artifact and re-verify each signature
 * against the artifact's *current* field values.
 *
 * Re-verifying rather than trusting the stored `valid` flag is deliberate:
 * if someone edits the model name after a provider signed the original claim,
 * the signature stops matching and the artifact silently loses its trusted
 * status. That is exactly the tamper case we want to catch.
 */
function evaluateAttestations(artifact) {
  const rows = db.prepare(`
    SELECT a.id, a.signature, a.signed_at,
           t.id AS attester_id, t.name AS attester_name, t.kind,
           t.public_key, t.key_fingerprint, t.revoked_at
    FROM attestations a
    JOIN attesters t ON t.id = a.attester_id
    WHERE a.artifact_id = ?
  `).all(artifact.id);

  return rows.map(row => {
    const signatureValid = verifyAttestation(artifact, row.signature, row.public_key);
    return {
      id: row.id,
      attester_id: row.attester_id,
      attester_name: row.attester_name,
      kind: row.kind,
      key_fingerprint: row.key_fingerprint,
      signed_at: row.signed_at,
      signature_valid: signatureValid,
      key_revoked: Boolean(row.revoked_at),
      // Only a vetted provider key, unrevoked, with a signature that still
      // matches the live record, counts as independent corroboration.
      counts_as_independent:
        signatureValid && !row.revoked_at && row.kind === 'provider' &&
        namesMatch(row.attester_name, artifact.model_provider),
    };
  });
}

/**
 * An attestation only corroborates the claim it is attached to. A key
 * belonging to "Stability AI" signing an artifact that claims to come from
 * OpenAI proves nothing about the OpenAI claim — so the attester's identity
 * must match the provider named in the record.
 */
function namesMatch(a, b) {
  if (!a || !b) return false;
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

/**
 * Walk an artifact's derivation chain back to its root, following
 * transformations from child to parent.
 *
 * Returns the ordered lineage plus any breaks found. A break means the chain
 * of custody has a hole in it: the claimed input to a transformation does not
 * match what the parent actually produced, so provenance cannot be carried
 * across that step.
 */
function resolveLineage(artifactId, { maxDepth = 64 } = {}) {
  const lineage = [];
  const breaks = [];
  const seen = new Set();

  let currentId = artifactId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    // A cycle would otherwise spin until maxDepth and report a confusing
    // lineage; call it out explicitly instead.
    if (seen.has(currentId)) {
      breaks.push({
        type: 'LINEAGE_CYCLE',
        artifact_id: currentId,
        message: 'Derivation chain contains a cycle — an artifact claims to be derived from its own descendant.',
      });
      break;
    }
    seen.add(currentId);

    const transform = db.prepare(`
      SELECT * FROM transformations WHERE artifact_id = ? ORDER BY created_at ASC LIMIT 1
    `).get(currentId);

    if (!transform) break; // reached a root artifact

    const parent = transform.parent_id
      ? db.prepare('SELECT * FROM artifacts WHERE id = ?').get(transform.parent_id)
      : null;

    if (!parent) {
      breaks.push({
        type: 'ORPHAN_DERIVATION',
        artifact_id: currentId,
        transformation_id: transform.id,
        message: 'Artifact claims to be derived from a parent that is not on the ledger.',
      });
      lineage.push({ transform, parent: null, link_valid: false });
      break;
    }

    // The transformation says "I took input X and produced output Y". If X is
    // not the parent's actual hash, the two records describe different files.
    const linkValid = transform.input_hash === parent.sha256;
    if (!linkValid) {
      breaks.push({
        type: 'LINEAGE_HASH_MISMATCH',
        artifact_id: currentId,
        transformation_id: transform.id,
        message: 'Transformation input hash does not match the parent artifact — provenance does not carry across this step.',
        expected: parent.sha256,
        found: transform.input_hash,
      });
    }

    lineage.push({ transform, parent, link_valid: linkValid });
    currentId = parent.id;
    depth++;
  }

  if (depth >= maxDepth) {
    breaks.push({
      type: 'LINEAGE_TOO_DEEP',
      message: `Derivation chain exceeds ${maxDepth} steps; traversal stopped.`,
    });
  }

  return { lineage, breaks, root: lineage.length ? lineage[lineage.length - 1].parent : null };
}

/**
 * Detect other ledger records that claim the same content hash but disagree
 * about where it came from.
 *
 * Two registrations of the same bytes naming different models cannot both be
 * true. We cannot tell which one is lying, and saying so is the honest
 * output — the UI surfaces the conflict rather than silently picking a winner.
 */
function findConflicts(artifact) {
  const others = db.prepare(`
    SELECT id, model_name, model_provider, creator, registered_at
    FROM artifacts
    WHERE sha256 = ? AND id != ?
  `).all(artifact.sha256, artifact.id);

  return others
    .filter(o => !namesMatch(o.model_name, artifact.model_name))
    .map(o => ({
      artifact_id: o.id,
      claims_model: o.model_name,
      claims_provider: o.model_provider,
      creator: o.creator,
      registered_at: o.registered_at,
    }));
}

/**
 * Score an artifact's provenance.
 *
 * `context` lets callers pass work that has already been done (chain
 * validation is the expensive one) so a page rendering twenty artifacts does
 * not re-walk the chain twenty times.
 */
function scoreArtifact(artifact, context = {}) {
  const factors = [];
  const chain = context.chain || require('./chain').validateChain();
  const attestations = context.attestations || evaluateAttestations(artifact);
  const lineage = context.lineage || resolveLineage(artifact.id);
  const conflicts = context.conflicts || findConflicts(artifact);

  // Earned points and the total available are tracked separately so the score
  // can be renormalised over the factors that actually apply. A factor that
  // cannot be evaluated (lineage, on an original) is excluded from both rather
  // than granted for free — awarding points for an absent check would put a
  // floor under every record and make the unverifiable band unreachable.
  let earned = 0;
  let available = 0;

  const add = (key, label, weight, met, detail) => {
    factors.push({ key, label, weight, met: Boolean(met), detail });
    available += weight;
    if (met) earned += weight;
  };

  // ── 1. Independent attestation (35) ──────────────────────────────────────
  // The only factor that can establish provenance rather than merely record
  // a claim about it.
  const independent = attestations.filter(a => a.counts_as_independent);
  const brokenSignatures = attestations.filter(a => !a.signature_valid);
  const revokedKeys = attestations.filter(a => a.signature_valid && a.key_revoked);

  add(
    'attested',
    'Signed by the named provider',
    WEIGHTS.attested,
    independent.length > 0,
    independent.length
      ? `Attested by ${independent.map(a => a.attester_name).join(', ')} using a vetted provider key.`
      : attestations.length
        ? 'Attestations exist, but none is a valid signature from a vetted key belonging to the named provider.'
        : 'No provider has signed this claim. The origin is asserted by the uploader alone.'
  );

  // ── 2. Ledger anchoring ──────────────────────────────────────────────────
  // Proves the claim existed at a point in time and has not been edited since.
  const anchored = Boolean(artifact.block_id);
  add(
    'anchored',
    'Anchored on the ledger',
    WEIGHTS.anchored,
    anchored,
    anchored
      ? `Committed in block #${artifact.block_index ?? artifact.block_id} and covered by that block's Merkle root.`
      : 'Not yet committed to a block — this record could still be altered without leaving a trace.'
  );

  // ── 3. Record completeness ───────────────────────────────────────────────
  // Weak evidence on its own: a complete form is easy to fabricate. It earns
  // points because an incomplete record cannot even be checked, not because
  // a complete one is true. Scored proportionally rather than pass/fail.
  const presentFields = [
    artifact.model_name, artifact.model_version, artifact.model_provider,
    artifact.prompt_hash, artifact.generation_params, artifact.creator,
  ].filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  const completeness = presentFields.length / 6;
  const completenessPoints = Math.round(completeness * WEIGHTS.completeness);
  earned += completenessPoints;
  available += WEIGHTS.completeness;
  factors.push({
    key: 'completeness',
    label: 'Generation record completeness',
    weight: WEIGHTS.completeness,
    met: completeness >= 0.8,
    detail: `${presentFields.length} of 6 provenance fields recorded (model, version, provider, prompt hash, parameters, creator).`,
    partial: completenessPoints,
  });

  // ── 4. Lineage integrity ─────────────────────────────────────────────────
  // Only applicable to derived artifacts. An original has no chain of custody
  // to check, so the factor is reported as not-applicable and left out of the
  // denominator entirely.
  const isDerived = lineage.lineage.length > 0;
  const lineageIntact = isDerived && lineage.breaks.length === 0;
  if (isDerived) {
    add(
      'lineage',
      'Derivation chain intact',
      WEIGHTS.lineage,
      lineageIntact,
      lineageIntact
        ? `Traced through ${lineage.lineage.length} transformation(s) back to a registered original.`
        : `Derivation chain is broken: ${lineage.breaks.map(b => b.type).join(', ')}.`
    );
  } else {
    factors.push({
      key: 'lineage',
      label: 'Derivation chain intact',
      weight: WEIGHTS.lineage,
      met: null,
      not_applicable: true,
      detail: 'Registered as an original — no derivation chain to verify.',
    });
  }

  // ── 5. No conflicting claims ─────────────────────────────────────────────
  add(
    'unconflicted',
    'No conflicting claims',
    WEIGHTS.unconflicted,
    conflicts.length === 0,
    conflicts.length === 0
      ? 'No other ledger record claims this content came from a different model.'
      : `${conflicts.length} other record(s) claim this exact content came from a different model.`
  );

  // ── Gates ────────────────────────────────────────────────────────────────
  // Applied after scoring. These can only lower the result.
  const gates = [];

  if (artifact.revoked_at) {
    gates.push({
      type: 'REVOKED',
      message: 'This provenance record was revoked by its registrant.',
      ceiling: BANDS.unverifiable.max,
    });
  }

  if (!chain.valid) {
    gates.push({
      type: 'CHAIN_COMPROMISED',
      message: `Ledger integrity check failed (${chain.issues.length} issue(s)). Anchoring proves nothing while the chain is broken.`,
      ceiling: BANDS.unverifiable.max,
    });
  }

  if (brokenSignatures.length) {
    gates.push({
      type: 'INVALID_SIGNATURE',
      message: `${brokenSignatures.length} attestation signature(s) do not match this record. The record was altered after it was signed, or the signature was forged.`,
      ceiling: BANDS.unverifiable.max,
    });
  }

  if (revokedKeys.length) {
    gates.push({
      type: 'REVOKED_KEY',
      message: 'Signed with a key that has since been revoked.',
      ceiling: UNATTESTED_CEILING,
    });
  }

  if (conflicts.length) {
    gates.push({
      type: 'CONFLICTING_CLAIMS',
      message: 'Another record claims different provenance for identical content. At most one can be true, and the ledger cannot say which.',
      ceiling: UNATTESTED_CEILING,
    });
  }

  if (isDerived && !lineageIntact) {
    gates.push({
      type: 'BROKEN_LINEAGE',
      message: 'Provenance cannot be carried across a broken derivation step.',
      ceiling: UNATTESTED_CEILING,
    });
  }

  // The central gate: self-assertion cannot reach 'trusted', no matter how
  // thorough the paperwork.
  if (!independent.length) {
    gates.push({
      type: 'UNATTESTED',
      message: 'No independent party corroborates this claim, so it cannot rise above self-asserted however complete it is.',
      ceiling: UNATTESTED_CEILING,
    });
  }

  const ceiling = gates.reduce((lo, g) => Math.min(lo, g.ceiling), 100);
  // Renormalise over the factors that applied, so excluding an inapplicable
  // factor neither rewards nor penalises the record.
  const rawScore = available > 0
    ? clamp(Math.round((earned / available) * 100), 0, 100)
    : 0;
  const finalScore = Math.min(rawScore, ceiling);

  return {
    score: finalScore,
    raw_score: rawScore,
    ceiling,
    earned,
    available,
    level: levelForScore(finalScore),
    factors,
    gates,
    attestations,
    conflicts,
    lineage: lineage.lineage.map(l => ({
      transformation: l.transform,
      parent_id: l.parent ? l.parent.id : null,
      parent_filename: l.parent ? l.parent.filename : null,
      link_valid: l.link_valid,
    })),
    lineage_breaks: lineage.breaks,
    chain_valid: chain.valid,
  };
}

/**
 * Predict the trust outcome for a claim that has not been registered yet,
 * so the registration form can tell the user what they are about to get and
 * why — before they commit it to the ledger.
 */
function previewScore(claim) {
  const stub = {
    id: '__preview__',
    sha256: claim.sha256 || '',
    model_name: claim.model_name || '',
    model_version: claim.model_version || '',
    model_provider: claim.model_provider || '',
    prompt_hash: claim.prompt_hash || (claim.prompt ? 'preview' : ''),
    generation_params: claim.generation_params || '',
    creator: claim.creator || '',
    block_id: null,
  };

  const result = scoreArtifact(stub, {
    attestations: claim.attestations || [],
    lineage: { lineage: [], breaks: [], root: null },
    conflicts: [],
  });

  // Registration always anchors, so credit that factor in the preview even
  // though the stub has no block yet.
  const anchoring = result.factors.find(f => f.key === 'anchored');
  if (anchoring && !anchoring.met) {
    anchoring.met = true;
    anchoring.detail = 'Will be committed to a block on registration.';
    result.earned += WEIGHTS.anchored;
  }

  const projectedRaw = result.available > 0
    ? clamp(Math.round((result.earned / result.available) * 100), 0, 100)
    : 0;
  const projected = Math.min(projectedRaw, result.ceiling);

  return { ...result, raw_score: projectedRaw, score: projected, level: levelForScore(projected) };
}

module.exports = {
  LEVELS,
  BANDS,
  WEIGHTS,
  UNATTESTED_CEILING,
  levelForScore,
  scoreArtifact,
  previewScore,
  evaluateAttestations,
  resolveLineage,
  findConflicts,
  namesMatch,
};
