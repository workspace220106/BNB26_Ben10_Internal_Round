'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');

const { db, DB_PATH } = require('./db');
const { DIFFICULTY, validateChain } = require('./lib/chain');

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set('trust proxy', 1); // behind Render/Railway's proxy, so req.ip is real

app.use(helmet({
  // The API serves JSON to a separate origin; CSP here would only restrict
  // responses nobody renders as a document.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/**
 * Allow the configured frontend origins. FRONTEND_URL accepts a
 * comma-separated list so preview deployments can be added without a rebuild.
 */
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No origin: curl, server-to-server, same-origin. Not a browser CORS case.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Vercel preview deployments get a generated subdomain per commit.
    if (process.env.ALLOW_VERCEL_PREVIEWS === 'true' && /^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  const chain = validateChain();
  res.json({
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    database: DB_PATH,
    chain: {
      blocks: chain.total_blocks,
      integrity: chain.valid ? 'VALID' : 'COMPROMISED',
      difficulty: DIFFICULTY,
    },
    version: require('../package.json').version,
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'ModelLedger API',
    description: 'Provenance ledger for AI-generated artifacts.',
    endpoints: [
      'POST   /api/artifacts/register',
      'POST   /api/artifacts/preview-trust',
      'POST   /api/artifacts/verify',
      'POST   /api/artifacts/verify-hash',
      'POST   /api/artifacts/:id/prove-prompt',
      'GET    /api/artifacts/:id',
      'GET    /api/artifacts/:id/chain',
      'POST   /api/transformations',
      'GET    /api/transformations/types',
      'GET    /api/attesters',
      'POST   /api/attesters/attest',
      'GET    /api/ledger',
      'GET    /api/ledger/stats',
      'GET    /api/ledger/artifacts',
      'GET    /api/ledger/validate',
      'GET    /api/adversarial/scenarios',
      'POST   /api/adversarial/run/:key',
    ],
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/artifacts', require('./routes/artifacts'));
app.use('/api/transformations', require('./routes/transformations'));
app.use('/api/attesters', require('./routes/attesters'));
app.use('/api/adversarial', require('./routes/adversarial'));
app.use('/api/ledger', require('./routes/ledger'));

// ─── Errors ──────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `File exceeds the ${process.env.MAX_UPLOAD_MB || 50}MB limit.`
      : err.message;
    return res.status(413).json({ error: message });
  }
  if (err && /not allowed by CORS/.test(err.message)) {
    return res.status(403).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({
    error: 'Internal server error.',
    // Stack traces are useful locally and a disclosure risk in production.
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  const chain = validateChain();
  console.log(`ModelLedger API on :${PORT}`);
  console.log(`  database   ${DB_PATH}`);
  console.log(`  chain      ${chain.total_blocks} block(s), integrity ${chain.valid ? 'VALID' : 'COMPROMISED'}, difficulty ${DIFFICULTY}`);
  console.log(`  cors       ${allowedOrigins.join(', ')}`);
});

/** Close the database cleanly so WAL contents are checkpointed on redeploy. */
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
