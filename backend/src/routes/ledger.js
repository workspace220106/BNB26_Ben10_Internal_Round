'use strict';

const express = require('express');
const { db } = require('../db');
const { validateChain, getLatestBlock, DIFFICULTY } = require('../lib/chain');
const trust = require('../lib/trust');

const router = express.Router();

function paginate(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 12));
  return { page, limit, offset: (page - 1) * limit };
}

// ─── GET /api/ledger/stats ───────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  const chain = validateChain();

  const count = sql => db.prepare(sql).get().c;
  const totalArtifacts = count('SELECT COUNT(*) c FROM artifacts');
  const totalBlocks = count('SELECT COUNT(*) c FROM blocks');
  const totalTransformations = count('SELECT COUNT(*) c FROM transformations');
  const totalVerifications = count('SELECT COUNT(*) c FROM verifications');

  const recentArtifacts = db.prepare(
    'SELECT * FROM artifacts ORDER BY registered_at DESC LIMIT 6'
  ).all();

  // Verification outcomes over the last 14 days, for the activity chart.
  const activity = db.prepare(`
    SELECT substr(verified_at, 1, 10) AS day,
           COUNT(*) AS total,
           SUM(CASE WHEN result = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN result = 'SELF_ASSERTED' THEN 1 ELSE 0 END) AS self_asserted,
           SUM(CASE WHEN result = 'TAMPERED' THEN 1 ELSE 0 END) AS tampered,
           SUM(CASE WHEN result = 'NOT_FOUND' THEN 1 ELSE 0 END) AS not_found
    FROM verifications
    GROUP BY day
    ORDER BY day DESC
    LIMIT 14
  `).all().reverse();

  res.json({
    totalArtifacts,
    totalBlocks,
    totalTransformations,
    totalVerifications,
    totalAttesters: count('SELECT COUNT(*) c FROM attesters'),
    chainIntegrity: chain.valid ? 'VALID' : 'COMPROMISED',
    chainIssues: chain.issues,
    difficulty: DIFFICULTY,
    latestBlock: getLatestBlock(),
    byTrust: db.prepare('SELECT trust_level, COUNT(*) c FROM artifacts GROUP BY trust_level').all(),
    byStatus: db.prepare('SELECT status, COUNT(*) c FROM artifacts GROUP BY status').all(),
    byResult: db.prepare('SELECT result, COUNT(*) c FROM verifications GROUP BY result').all(),
    activity,
    recentArtifacts,
  });
});

// ─── GET /api/ledger/artifacts ───────────────────────────────────────────────

router.get('/artifacts', (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const { search, trust: trustFilter, status } = req.query;

  const where = [];
  const params = {};

  if (search) {
    where.push('(filename LIKE @search OR model_name LIKE @search OR creator LIKE @search OR sha256 LIKE @search)');
    params.search = `%${search}%`;
  }
  if (trustFilter) {
    where.push('trust_level = @trust');
    params.trust = trustFilter;
  }
  if (status) {
    where.push('status = @status');
    params.status = status;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM artifacts ${clause}`).get(params).c;
  const artifacts = db.prepare(`
    SELECT * FROM artifacts ${clause} ORDER BY registered_at DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({
    artifacts,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ─── GET /api/ledger/validate ────────────────────────────────────────────────

router.get('/validate', (req, res) => {
  res.json(validateChain());
});

// ─── GET /api/ledger/blocks/:index ───────────────────────────────────────────

router.get('/blocks/:index', (req, res) => {
  const block = db.prepare('SELECT * FROM blocks WHERE block_index = ?').get(Number(req.params.index));
  if (!block) return res.status(404).json({ error: 'Block not found.' });

  let ids = [];
  try { ids = JSON.parse(block.artifact_ids); } catch { /* reported by validateChain */ }

  const artifacts = ids.length
    ? db.prepare(`SELECT * FROM artifacts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];

  res.json({ block: { ...block, artifact_ids: ids }, artifacts });
});

// ─── GET /api/ledger ─────────────────────────────────────────────────────────
// Block list. Mounted last so it does not shadow the named routes above.

router.get('/', (req, res) => {
  const { page, limit, offset } = paginate({ ...req.query, limit: req.query.limit || 10 });

  const total = db.prepare('SELECT COUNT(*) c FROM blocks').get().c;
  const blocks = db.prepare(
    'SELECT * FROM blocks ORDER BY block_index DESC LIMIT ? OFFSET ?'
  ).all(limit, offset).map(b => ({
    ...b,
    artifact_ids: (() => { try { return JSON.parse(b.artifact_ids); } catch { return []; } })(),
  }));

  res.json({
    blocks,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

module.exports = router;
