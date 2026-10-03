'use strict';

/**
 * The ledger itself: block construction, proof-of-work, and chain validation.
 *
 * This is a single-operator chain, not a distributed consensus network — the
 * proof-of-work is here to make silent rewriting expensive and visible, not to
 * resolve forks between competing miners. Stated plainly because a provenance
 * system that overclaims its own guarantees is worse than one that does not.
 */

const { db } = require('../db');
const { sha256, merkleRoot, merkleProof, verifyMerkleProof, ZERO_HASH } = require('./crypto');

/** Leading hex zeros required on a block hash. Two keeps mining ~instant. */
const DIFFICULTY = Number(process.env.CHAIN_DIFFICULTY || 2);
const TARGET_PREFIX = '0'.repeat(DIFFICULTY);

/**
 * A block's hash commits to its height, time, Merkle root, predecessor and
 * nonce. Note it does NOT commit to artifact_ids directly — those are covered
 * by the Merkle root, which is what lets us prove inclusion of one artifact
 * without revealing the others.
 */
function computeBlockHash({ block_index, timestamp, merkle_root, prev_hash, nonce }) {
  return sha256(`${block_index}|${timestamp}|${merkle_root}|${prev_hash}|${nonce}`);
}

/** Grind nonces until the hash meets the difficulty target. */
function mine(header) {
  let nonce = 0;
  for (;;) {
    const hash = computeBlockHash({ ...header, nonce });
    if (hash.startsWith(TARGET_PREFIX)) return { hash, nonce };
    nonce++;
  }
}

function getLatestBlock() {
  return db.prepare('SELECT * FROM blocks ORDER BY block_index DESC LIMIT 1').get() || null;
}

function getBlockById(id) {
  return db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) || null;
}

/**
 * Anchor a set of artifact hashes in a new block.
 *
 * `leaves` are the artifact SHA-256 hashes (the Merkle leaves); `artifactIds`
 * are the ledger ids recorded alongside. Caller is responsible for keeping the
 * two in the same order, since the inclusion proof depends on leaf position.
 */
function appendBlock(artifactIds, leaves) {
  const latest = getLatestBlock();
  const header = {
    block_index: latest ? latest.block_index + 1 : 0,
    timestamp: new Date().toISOString(),
    merkle_root: merkleRoot(leaves),
    prev_hash: latest ? latest.hash : ZERO_HASH,
  };

  const { hash, nonce } = mine(header);

  const info = db.prepare(`
    INSERT INTO blocks (block_index, timestamp, artifact_ids, merkle_root, prev_hash, hash, nonce)
    VALUES (@block_index, @timestamp, @artifact_ids, @merkle_root, @prev_hash, @hash, @nonce)
  `).run({
    ...header,
    artifact_ids: JSON.stringify(artifactIds),
    hash,
    nonce,
  });

  return { id: info.lastInsertRowid, ...header, hash, nonce, artifact_ids: artifactIds };
}

/**
 * Walk the whole chain and report every inconsistency found.
 *
 * Returns all issues rather than failing on the first one: a verifier looking
 * at a compromised ledger needs to see the blast radius, not just the earliest
 * symptom. Each issue names the block so the UI can point at it.
 */
function validateChain() {
  const blocks = db.prepare('SELECT * FROM blocks ORDER BY block_index ASC').all();
  const issues = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prev = i > 0 ? blocks[i - 1] : null;

    // 1. Does the stored hash actually match the block's contents?
    const recomputed = computeBlockHash(block);
    if (recomputed !== block.hash) {
      issues.push({
        type: 'HASH_MISMATCH',
        block_index: block.block_index,
        message: `Block #${block.block_index} stored hash does not match its contents — the block was edited after mining.`,
        expected: recomputed,
        found: block.hash,
      });
    }

    // 2. Does it link to its predecessor?
    const expectedPrev = prev ? prev.hash : ZERO_HASH;
    if (block.prev_hash !== expectedPrev) {
      issues.push({
        type: 'BROKEN_LINK',
        block_index: block.block_index,
        message: prev
          ? `Block #${block.block_index} does not link to block #${prev.block_index} — a block was replaced or removed.`
          : `Genesis block #${block.block_index} must link to the zero hash.`,
        expected: expectedPrev,
        found: block.prev_hash,
      });
    }

    // 3. Does it still satisfy the difficulty it claims?
    if (!block.hash.startsWith(TARGET_PREFIX)) {
      issues.push({
        type: 'INSUFFICIENT_WORK',
        block_index: block.block_index,
        message: `Block #${block.block_index} hash does not meet the difficulty target.`,
        expected: `${TARGET_PREFIX}…`,
        found: block.hash.slice(0, 8),
      });
    }

    // 4. Heights must be contiguous — a gap means a block was deleted.
    if (block.block_index !== i) {
      issues.push({
        type: 'INDEX_GAP',
        block_index: block.block_index,
        message: `Expected block at height ${i} but found #${block.block_index} — a block is missing.`,
      });
    }

    // 5. Does the Merkle root still cover exactly the artifacts claimed?
    let artifactIds = [];
    try {
      artifactIds = JSON.parse(block.artifact_ids);
    } catch {
      issues.push({
        type: 'CORRUPT_PAYLOAD',
        block_index: block.block_index,
        message: `Block #${block.block_index} artifact list is not readable.`,
      });
    }

    if (artifactIds.length) {
      const placeholders = artifactIds.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT id, sha256 FROM artifacts WHERE id IN (${placeholders})`
      ).all(...artifactIds);

      if (rows.length !== artifactIds.length) {
        issues.push({
          type: 'MISSING_ARTIFACT',
          block_index: block.block_index,
          message: `Block #${block.block_index} anchors ${artifactIds.length} artifact(s) but only ${rows.length} remain in the ledger.`,
        });
      } else {
        // Re-derive the root from the live artifact hashes. If someone edited
        // an artifact's content hash after it was anchored, this catches it.
        const byId = new Map(rows.map(r => [r.id, r.sha256]));
        const leaves = artifactIds.map(id => byId.get(id));
        const recomputedRoot = merkleRoot(leaves);
        if (recomputedRoot !== block.merkle_root) {
          issues.push({
            type: 'MERKLE_MISMATCH',
            block_index: block.block_index,
            message: `Block #${block.block_index} Merkle root does not match its artifacts — an anchored artifact's hash was altered.`,
            expected: block.merkle_root,
            found: recomputedRoot,
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, total_blocks: blocks.length, issues };
}

/**
 * Inclusion proof for one artifact against its block, plus the number of
 * blocks mined on top of it. Depth matters: rewriting a block means redoing
 * the work for every block above it, so a deeply buried record is harder to
 * forge than a freshly written one.
 */
function getInclusionProof(artifactId) {
  const artifact = db.prepare('SELECT id, sha256, block_id FROM artifacts WHERE id = ?').get(artifactId);
  if (!artifact || !artifact.block_id) return null;

  const block = getBlockById(artifact.block_id);
  if (!block) return null;

  let artifactIds;
  try {
    artifactIds = JSON.parse(block.artifact_ids);
  } catch {
    return null;
  }

  const placeholders = artifactIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, sha256 FROM artifacts WHERE id IN (${placeholders})`
  ).all(...artifactIds);
  const byId = new Map(rows.map(r => [r.id, r.sha256]));
  const leaves = artifactIds.map(id => byId.get(id)).filter(Boolean);

  const proof = merkleProof(leaves, artifact.sha256);
  if (!proof) return null;

  const latest = getLatestBlock();

  return {
    leaf: artifact.sha256,
    // Siblings are given as hashes only — the verifier confirms inclusion
    // without learning which artifacts those siblings belong to.
    proof,
    merkle_root: block.merkle_root,
    block_index: block.block_index,
    block_hash: block.hash,
    valid: verifyMerkleProof(artifact.sha256, proof, block.merkle_root),
    confirmations: latest ? latest.block_index - block.block_index + 1 : 0,
  };
}

module.exports = {
  DIFFICULTY,
  computeBlockHash,
  mine,
  appendBlock,
  getLatestBlock,
  getBlockById,
  validateChain,
  getInclusionProof,
};
