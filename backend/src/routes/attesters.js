'use strict';

/**
 * Attester registry.
 *
 * An attester is a party whose signature the ledger will check. Two kinds:
 *
 *   provider  — a key the operator has vetted as belonging to the named model
 *               provider, out of band. A valid signature from one of these is
 *               the only thing that lifts a claim to 'trusted'.
 *   community — a real key with no vetting behind it. Signatures verify, and
 *               they do establish that the same party made two claims, but
 *               they corroborate nothing about which model made the artifact.
 *
 * The vetting is the part that cannot be done in software, and pretending
 * otherwise would be the central dishonesty this project is meant to avoid.
 * In this deployment, provider keys are seeded by the operator.
 */

const express = require('express');
const { v4: uuid } = require('uuid');

const { db } = require('../db');
const { generateKeyPair, signAttestation, verifyAttestation, sha256, attestationPayload } = require('../lib/crypto');

const router = express.Router();

function fingerprint(publicKeyPem) {
  return sha256(publicKeyPem).slice(0, 32);
}

router.get('/', (req, res) => {
  res.json({
    attesters: db.prepare(`
      SELECT id, name, kind, key_fingerprint, registered_at, revoked_at,
             (SELECT COUNT(*) FROM attestations WHERE attester_id = attesters.id) AS attestation_count
      FROM attesters ORDER BY kind DESC, name ASC
    `).all(),
  });
});

/**
 * Register a community key. Anyone may do this; it carries no vetting.
 * Provider keys are not issued through this endpoint by design — an open
 * endpoint that mints trusted keys would make the trusted tier meaningless.
 */
router.post('/', express.json(), (req, res) => {
  const { name, public_key } = req.body || {};
  if (!name || !public_key) {
    return res.status(400).json({ error: 'name and public_key are required.' });
  }
  if (!String(public_key).includes('BEGIN PUBLIC KEY')) {
    return res.status(400).json({ error: 'public_key must be a PEM-encoded SPKI public key.' });
  }

  const fp = fingerprint(public_key);
  if (db.prepare('SELECT id FROM attesters WHERE key_fingerprint = ?').get(fp)) {
    return res.status(409).json({ error: 'This key is already registered.' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO attesters (id, name, kind, public_key, key_fingerprint, registered_at)
    VALUES (?, ?, 'community', ?, ?, ?)
  `).run(id, String(name).trim(), public_key, fp, new Date().toISOString());

  res.status(201).json({
    attester: db.prepare('SELECT id, name, kind, key_fingerprint, registered_at FROM attesters WHERE id = ?').get(id),
    note: 'Registered as a community key. Community signatures prove who made a claim, but do not corroborate which model produced the artifact, so they cannot raise a record to trusted.',
  });
});

/**
 * Demo endpoint: mint a keypair so the attestation flow can be exercised
 * without the operator provisioning real provider keys first.
 *
 * The private key is returned once and never stored — the ledger has no
 * business holding an attester's signing key.
 */
router.post('/keypair', express.json(), (req, res) => {
  if (process.env.ALLOW_DEMO_KEYS === 'false') {
    return res.status(403).json({ error: 'Demo key generation is disabled on this deployment.' });
  }
  const { publicKey, privateKey } = generateKeyPair();
  res.json({
    public_key: publicKey,
    private_key: privateKey,
    fingerprint: fingerprint(publicKey),
    note: 'The private key is returned once and is not stored. Keep it to sign attestations.',
  });
});

/** The exact canonical bytes a client must sign, so signing can happen off-server. */
router.post('/payload', express.json(), (req, res) => {
  res.json({ payload: attestationPayload(req.body || {}) });
});

/**
 * Attach an attestation to an existing artifact.
 *
 * The signature is verified before it is stored — the ledger records failed
 * attempts as invalid rather than silently dropping them, because a forged
 * attestation is itself evidence worth keeping.
 */
router.post('/attest', express.json(), (req, res) => {
  const { artifact_id, attester_id, signature, private_key } = req.body || {};
  if (!artifact_id || !attester_id) {
    return res.status(400).json({ error: 'artifact_id and attester_id are required.' });
  }

  const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifact_id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });

  const attester = db.prepare('SELECT * FROM attesters WHERE id = ?').get(attester_id);
  if (!attester) return res.status(404).json({ error: 'Attester not found.' });
  if (attester.revoked_at) return res.status(409).json({ error: 'This attester key has been revoked.' });

  // Convenience for the demo console: sign server-side if the caller hands
  // over the private key. Real integrations sign locally and send only the
  // signature, which is why `signature` is accepted directly.
  let sig = signature;
  if (!sig && private_key) {
    try {
      sig = signAttestation(artifact, private_key);
    } catch {
      return res.status(400).json({ error: 'Could not sign with the supplied private key.' });
    }
  }
  if (!sig) return res.status(400).json({ error: 'Provide a signature, or a private_key to sign with.' });

  const valid = verifyAttestation(artifact, sig, attester.public_key);

  const id = uuid();
  db.prepare(`
    INSERT INTO attestations (id, artifact_id, attester_id, signature, signed_at, valid)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, artifact_id, attester_id, sig, new Date().toISOString(), valid ? 1 : 0);

  const scored = require('../lib/trust').scoreArtifact(
    db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifact_id)
  );
  db.prepare('UPDATE artifacts SET trust_level = ?, trust_score = ? WHERE id = ?')
    .run(scored.level, scored.score, artifact_id);

  res.status(valid ? 201 : 202).json({
    attestation_id: id,
    signature_valid: valid,
    trust: scored,
    message: valid
      ? (scored.level === 'trusted'
        ? 'Signature verified against a vetted provider key. This record is now independently corroborated.'
        : 'Signature verified, but this key does not establish the named provider, so the record stays self-asserted.')
      : 'Signature does not verify against this attester key. Recorded as an invalid attestation.',
  });
});

/** Revoke a key. Every record it signed immediately loses that corroboration. */
router.post('/:id/revoke', express.json(), (req, res) => {
  const attester = db.prepare('SELECT * FROM attesters WHERE id = ?').get(req.params.id);
  if (!attester) return res.status(404).json({ error: 'Attester not found.' });

  db.prepare('UPDATE attesters SET revoked_at = ? WHERE id = ?')
    .run(new Date().toISOString(), req.params.id);

  const affected = db.prepare(
    'SELECT DISTINCT artifact_id FROM attestations WHERE attester_id = ?'
  ).all(req.params.id);

  const trustLib = require('../lib/trust');
  for (const { artifact_id } of affected) {
    const artifact = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifact_id);
    if (!artifact) continue;
    const scored = trustLib.scoreArtifact(artifact);
    db.prepare('UPDATE artifacts SET trust_level = ?, trust_score = ? WHERE id = ?')
      .run(scored.level, scored.score, artifact_id);
  }

  res.json({
    revoked: true,
    affected_artifacts: affected.length,
    message: `Key revoked. ${affected.length} record(s) lost their corroboration and were rescored.`,
  });
});

module.exports = router;
module.exports.fingerprint = fingerprint;
