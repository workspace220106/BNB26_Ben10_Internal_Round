'use strict';

/**
 * Cryptographic primitives for ModelLedger.
 *
 * Everything the ledger stores is a hash or a signature — never raw prompts,
 * never source files. That is what makes verification privacy-preserving:
 * a verifier can confirm "this prompt produced this record" by re-hashing,
 * but cannot read the prompt out of the ledger.
 */

const crypto = require('crypto');

const ZERO_HASH = '0'.repeat(64);

/** SHA-256 of a string or Buffer, hex encoded. */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a secret (prompt, source file) with a per-record salt so that the
 * ledger cannot be brute-forced. Short prompts like "a cat" have very low
 * entropy — an unsalted hash would be trivially reversible with a dictionary,
 * which would defeat the privacy guarantee.
 *
 * Returns `salt$digest`. Verification needs the salt, which is published;
 * the security comes from the attacker not knowing the plaintext, while the
 * salt forces them to attack each record individually.
 */
function saltedHash(secret, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}$${sha256(`${salt}:${secret}`)}`;
}

/** Check a plaintext against a `salt$digest` produced by saltedHash. */
function verifySaltedHash(secret, stored) {
  if (typeof stored !== 'string' || !stored.includes('$')) return false;
  const [salt] = stored.split('$');
  return timingSafeEqual(saltedHash(secret, salt), stored);
}

/** Constant-time string comparison; avoids leaking match position. */
function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Merkle tree ─────────────────────────────────────────────────────────────

/**
 * Build a Merkle tree over the given leaf hashes.
 *
 * Each level hashes pairs; an odd node is promoted unchanged rather than
 * duplicated. Duplicating the last node is the classic Bitcoin CVE-2012-2459
 * mistake: it lets two different leaf sets produce the same root, which would
 * let someone forge an inclusion proof for an artifact that was never anchored.
 *
 * Returns { root, levels } where levels[0] is the leaves.
 */
function buildMerkleTree(leaves) {
  if (!leaves.length) return { root: ZERO_HASH, levels: [[]] };

  const levels = [leaves.slice()];
  let current = leaves.slice();

  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(sha256(current[i] + current[i + 1]));
      } else {
        next.push(current[i]); // promote, do not duplicate
      }
    }
    levels.push(next);
    current = next;
  }

  return { root: current[0], levels };
}

/** Convenience: just the Merkle root for a set of leaves. */
function merkleRoot(leaves) {
  return buildMerkleTree(leaves).root;
}

/**
 * Produce an inclusion proof for `leaf`: the sibling hashes needed to
 * recompute the root. This is how a verifier confirms an artifact is in a
 * block without being given the other artifacts in that block — the other
 * registrants' filenames and models stay private.
 */
function merkleProof(leaves, leaf) {
  const { levels } = buildMerkleTree(leaves);
  let index = leaves.indexOf(leaf);
  if (index === -1) return null;

  const proof = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    if (siblingIndex < level.length) {
      proof.push({ hash: level[siblingIndex], position: isRight ? 'left' : 'right' });
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Recompute a root from a leaf plus its inclusion proof. */
function verifyMerkleProof(leaf, proof, root) {
  let computed = leaf;
  for (const step of proof) {
    computed = step.position === 'left'
      ? sha256(step.hash + computed)
      : sha256(computed + step.hash);
  }
  return computed === root;
}

// ─── Attestation signatures ──────────────────────────────────────────────────

/**
 * Ed25519 keypair for an attester (a model provider, or a self-registering
 * user). Returned PEM-encoded so keys can be stored as text.
 */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * The exact bytes an attester signs. Canonicalised so that the verifier
 * reconstructs the identical payload from stored fields — any drift here
 * silently breaks every signature, so keys are sorted and values normalised.
 */
function attestationPayload(claim) {
  const fields = [
    'sha256', 'model_name', 'model_version', 'model_provider',
    'prompt_hash', 'generation_params', 'creator',
  ];
  const canonical = {};
  for (const f of fields) {
    canonical[f] = claim[f] === undefined || claim[f] === null ? '' : String(claim[f]);
  }
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/** Sign a provenance claim with an attester's private key. */
function signAttestation(claim, privateKeyPem) {
  const payload = Buffer.from(attestationPayload(claim));
  return crypto.sign(null, payload, privateKeyPem).toString('base64');
}

/**
 * Verify a signature over a provenance claim.
 * Returns false rather than throwing on malformed keys or signatures — a
 * forged attestation is an expected input here, not an exceptional one.
 */
function verifyAttestation(claim, signatureB64, publicKeyPem) {
  try {
    const payload = Buffer.from(attestationPayload(claim));
    return crypto.verify(null, payload, publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

module.exports = {
  ZERO_HASH,
  sha256,
  saltedHash,
  verifySaltedHash,
  timingSafeEqual,
  buildMerkleTree,
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  generateKeyPair,
  attestationPayload,
  signAttestation,
  verifyAttestation,
};
