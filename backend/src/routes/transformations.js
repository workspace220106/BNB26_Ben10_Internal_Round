'use strict';

/**
 * Transformations are how provenance survives editing.
 *
 * A resized, re-encoded or upscaled file has a different content hash, so a
 * naive hash lookup loses the link to the original. Registering the
 * transformation records that link explicitly: "input hash X became output
 * hash Y by this process". Verification then resolves the derived file back
 * to its ancestor — but only when the declared input actually matches what
 * the parent produced, which is checked here and again at scoring time.
 */

const express = require('express');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const { db } = require('../db');
const { sha256 } = require('../lib/crypto');
const { appendBlock } = require('../lib/chain');
const trust = require('../lib/trust');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024 },
});

/** Transform types we recognise, with how much provenance each preserves. */
const TRANSFORM_TYPES = {
  're-encoding': { preserves: 'full', label: 'Re-encoding / format change' },
  'resizing': { preserves: 'full', label: 'Resize' },
  'compression': { preserves: 'full', label: 'Compression' },
  'upscaling': { preserves: 'partial', label: 'AI upscaling' },
  'inpainting': { preserves: 'partial', label: 'Inpainting / generative edit' },
  'style-transfer': { preserves: 'partial', label: 'Style transfer' },
  'color-grade': { preserves: 'full', label: 'Colour grade' },
  'crop': { preserves: 'full', label: 'Crop' },
  'watermark': { preserves: 'full', label: 'Watermarking' },
  'composite': { preserves: 'partial', label: 'Composite with other content' },
  'other': { preserves: 'unknown', label: 'Other' },
};

router.get('/types', (req, res) => {
  res.json({
    types: Object.entries(TRANSFORM_TYPES).map(([key, v]) => ({ key, ...v })),
  });
});

/**
 * Register a derived artifact.
 *
 * Accepts either an uploaded derived file (hashed here) or a declared
 * output_hash for callers integrating server-side.
 */
router.post('/', upload.single('file'), (req, res, next) => {
  try {
    const {
      parent_id, transform_type, transform_description,
      transformer_model, transformer_provider, output_hash: declaredOutputHash,
      filename, metadata,
    } = req.body;

    if (!parent_id) return res.status(400).json({ error: 'parent_id is required.' });
    if (!transform_type) return res.status(400).json({ error: 'transform_type is required.' });

    const parent = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(parent_id);
    if (!parent) return res.status(404).json({ error: 'Parent artifact not found on the ledger.' });

    const outputHash = req.file
      ? sha256(req.file.buffer)
      : String(declaredOutputHash || '').trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(outputHash)) {
      return res.status(400).json({ error: 'Provide the derived file, or a valid 64-character output_hash.' });
    }

    if (outputHash === parent.sha256) {
      return res.status(409).json({
        error: 'The derived content is byte-identical to its parent — there is no transformation to record.',
      });
    }

    const existing = db.prepare('SELECT id FROM artifacts WHERE sha256 = ?').get(outputHash);
    if (existing) {
      return res.status(409).json({
        error: 'This derived content is already registered on the ledger.',
        artifact_id: existing.id,
      });
    }

    const now = new Date().toISOString();
    const childId = uuid();
    const transformationId = uuid();

    // The derived file becomes a first-class artifact in its own right. It
    // inherits the original's model claim (it is still, ultimately, output of
    // that model) but is marked 'derived' so nobody mistakes it for the
    // original, and the transformer is recorded alongside.
    const child = {
      id: childId,
      filename: req.file ? req.file.originalname : (filename || `${parent.filename} (derived)`),
      filetype: req.file ? (req.file.mimetype || 'application/octet-stream') : parent.filetype,
      filesize: req.file ? req.file.size : 0,
      sha256: outputHash,
      model_name: parent.model_name,
      model_version: parent.model_version,
      model_provider: parent.model_provider,
      prompt_hash: parent.prompt_hash,
      generation_params: parent.generation_params,
      creator: parent.creator,
      trust_level: trust.LEVELS.SELF_ASSERTED,
      status: 'derived',
      block_id: null,
      registered_at: now,
      metadata: metadata || null,
    };

    const block = db.transaction(() => {
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
      `).run(child);

      db.prepare(`
        INSERT INTO transformations (
          id, artifact_id, parent_id, transform_type, transform_description,
          transformer_model, transformer_provider, input_hash, output_hash,
          trust_level, created_at, block_id, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `).run(
        transformationId, childId, parent_id, transform_type,
        transform_description || TRANSFORM_TYPES[transform_type]?.label || transform_type,
        transformer_model || null, transformer_provider || null,
        parent.sha256, outputHash,
        // A transformation declared by a tool the ledger cannot check is
        // self-asserted by construction.
        trust.LEVELS.SELF_ASSERTED, now, metadata || null
      );

      const mined = appendBlock([childId], [outputHash]);
      db.prepare('UPDATE artifacts SET block_id = ? WHERE id = ?').run(mined.id, childId);
      db.prepare('UPDATE transformations SET block_id = ? WHERE id = ?').run(mined.id, transformationId);
      return mined;
    })();

    const stored = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(childId);
    const scored = trust.scoreArtifact(stored);
    db.prepare('UPDATE artifacts SET trust_level = ?, trust_score = ?, trust_reasons = ? WHERE id = ?')
      .run(scored.level, scored.score, JSON.stringify(scored.factors.filter(f => f.met).map(f => f.detail)), childId);

    res.status(201).json({
      artifact: { ...stored, trust_level: scored.level, trust_score: scored.score },
      transformation: db.prepare('SELECT * FROM transformations WHERE id = ?').get(transformationId),
      trust: scored,
      block: { index: block.block_index, hash: block.hash, merkle_root: block.merkle_root },
      preserves: TRANSFORM_TYPES[transform_type]?.preserves || 'unknown',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  res.json({
    transformations: db.prepare(
      'SELECT * FROM transformations ORDER BY created_at DESC LIMIT ?'
    ).all(limit),
  });
});

module.exports = router;
module.exports.TRANSFORM_TYPES = TRANSFORM_TYPES;
