'use strict';

/**
 * Seed the ledger with a demo-ready state.
 *
 * Idempotent: safe to run against the existing database. It will not duplicate
 * attesters or artifacts, and it rescores everything through the current trust
 * engine so records registered under an older scoring rule are brought up to
 * date.
 *
 * Run with --reset to drop all ledger data and rebuild from scratch.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const { db } = require('./db');
const { sha256, saltedHash, generateKeyPair, signAttestation } = require('./lib/crypto');
const { appendBlock } = require('./lib/chain');
const trust = require('./lib/trust');
const { fingerprint } = require('./routes/attesters');

const RESET = process.argv.includes('--reset');

/**
 * Where demo private keys are written. Real provider keys would never live on
 * the ledger host — these exist only so the attestation flow can be exercised
 * in a demo without provisioning external signers.
 */
const KEYS_PATH = path.join(__dirname, '..', 'data', 'demo-keys.json');

/** Vetted provider keys. 'provider' kind is what makes a claim trustable. */
const PROVIDERS = ['OpenAI', 'Stability AI', 'Meta AI', 'Anthropic'];

const DEMO_ARTIFACTS = [
  {
    filename: 'cityscape_hero.png', filetype: 'image/png', filesize: 2_048_000,
    model_name: 'DALL-E 3', model_version: '3.0', model_provider: 'OpenAI',
    prompt: 'a neon cityscape at dusk, rain-slicked streets, cinematic wide angle',
    generation_params: '{"steps":50,"cfg_scale":7.5,"seed":42}',
    creator: 'alice@example.com', attest: 'OpenAI',
  },
  {
    filename: 'portrait_v1.jpg', filetype: 'image/jpeg', filesize: 1_500_000,
    model_name: 'Stable Diffusion XL', model_version: '1.0', model_provider: 'Stability AI',
    prompt: 'studio portrait of an elderly watchmaker, soft rim lighting',
    generation_params: '{"steps":30,"cfg_scale":8,"seed":1337}',
    creator: 'bob@example.com', attest: 'Stability AI',
  },
  {
    filename: 'music_bg_track.mp3', filetype: 'audio/mpeg', filesize: 4_200_000,
    model_name: 'MusicGen', model_version: '1.5', model_provider: 'Meta AI',
    prompt: 'ambient synthwave loop, 90bpm, melancholic',
    generation_params: '{"duration":30,"top_k":250,"temperature":1}',
    creator: 'carol@example.com', attest: 'Meta AI',
  },
  {
    filename: 'article_draft.txt', filetype: 'text/plain', filesize: 8_500,
    model_name: 'GPT-4', model_version: 'gpt-4-turbo', model_provider: 'OpenAI',
    prompt: 'draft a 600-word explainer on provenance for AI-generated media',
    generation_params: null, creator: 'dave@example.com',
    // Deliberately unattested: shows a complete record that still cannot
    // reach trusted, which is the system's core distinction.
  },
  {
    filename: 'product_shot.webp', filetype: 'image/webp', filesize: 890_000,
    // Bare claim: a model name and nothing else. Nothing here can be checked,
    // so it lands in the unverifiable band.
    model_name: 'Midjourney', model_version: null, model_provider: null,
    prompt: null, generation_params: null, creator: null,
  },
  {
    filename: 'narration_vo.wav', filetype: 'audio/wav', filesize: 6_100_000,
    model_name: 'ElevenLabs', model_version: 'v2', model_provider: 'ElevenLabs',
    prompt: 'calm documentary narration, british accent',
    generation_params: '{"stability":0.6,"similarity_boost":0.8}',
    creator: 'erin@example.com',
  },
];

function reset() {
  console.log('Resetting ledger data…');
  db.exec(`
    DELETE FROM attestations;
    DELETE FROM attesters;
    DELETE FROM verifications;
    DELETE FROM transformations;
    DELETE FROM artifacts;
    DELETE FROM blocks;
    DELETE FROM sqlite_sequence WHERE name IN ('blocks');
  `);
}

function seedAttesters() {
  const keys = {};
  for (const name of PROVIDERS) {
    const existing = db.prepare('SELECT id FROM attesters WHERE name = ? AND kind = ?').get(name, 'provider');
    if (existing) {
      console.log(`  attester ${name} already registered`);
      continue;
    }
    const { publicKey, privateKey } = generateKeyPair();
    const id = uuid();
    db.prepare(`
      INSERT INTO attesters (id, name, kind, public_key, key_fingerprint, registered_at)
      VALUES (?, ?, 'provider', ?, ?, ?)
    `).run(id, name, publicKey, fingerprint(publicKey), new Date().toISOString());
    keys[name] = { attester_id: id, private_key: privateKey };
    console.log(`  attester ${name} registered (vetted provider key)`);
  }

  if (Object.keys(keys).length) {
    // Merge rather than overwrite, so re-running does not orphan earlier keys.
    const previous = fs.existsSync(KEYS_PATH)
      ? JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'))
      : {};
    fs.writeFileSync(KEYS_PATH, JSON.stringify({ ...previous, ...keys }, null, 2));
    console.log(`  demo signing keys written to ${KEYS_PATH}`);
  }
  return keys;
}

function loadKeys() {
  if (!fs.existsSync(KEYS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')); } catch { return {}; }
}

function seedArtifacts(keys) {
  const prompts = {};

  for (const spec of DEMO_ARTIFACTS) {
    const existing = db.prepare('SELECT id FROM artifacts WHERE filename = ?').get(spec.filename);
    if (existing) {
      console.log(`  artifact ${spec.filename} already present`);
      continue;
    }

    const id = uuid();
    const contentHash = sha256(`${spec.filename}:${spec.filesize}:${spec.model_name}`);
    const promptHash = spec.prompt ? saltedHash(spec.prompt) : null;
    if (spec.prompt) prompts[spec.filename] = spec.prompt;

    const artifact = {
      id,
      filename: spec.filename,
      filetype: spec.filetype,
      filesize: spec.filesize,
      sha256: contentHash,
      model_name: spec.model_name,
      model_version: spec.model_version || null,
      model_provider: spec.model_provider || null,
      prompt_hash: promptHash,
      generation_params: spec.generation_params || null,
      creator: spec.creator || null,
      trust_level: 'self-asserted',
      status: 'registered',
      block_id: null,
      registered_at: new Date(Date.now() - DEMO_ARTIFACTS.indexOf(spec) * 86_400_000).toISOString(),
      metadata: null,
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

    const block = appendBlock([id], [contentHash]);
    db.prepare('UPDATE artifacts SET block_id = ? WHERE id = ?').run(block.id, id);

    // Attach a provider attestation where the scenario calls for one.
    if (spec.attest) {
      const key = keys[spec.attest];
      const attester = db.prepare('SELECT * FROM attesters WHERE name = ? AND kind = ?').get(spec.attest, 'provider');
      if (key && attester) {
        const stored = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
        db.prepare(`
          INSERT INTO attestations (id, artifact_id, attester_id, signature, signed_at, valid)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(uuid(), id, attester.id, signAttestation(stored, key.private_key), new Date().toISOString());
      }
    }

    console.log(`  artifact ${spec.filename} registered in block #${block.block_index}`);
  }

  if (Object.keys(prompts).length) {
    const promptsPath = path.join(__dirname, '..', 'data', 'demo-prompts.json');
    fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 2));
    console.log(`  demo prompts written to ${promptsPath} (for testing privacy-preserving proof)`);
  }
}

/** A short derivation chain so the lineage view has something to draw. */
function seedTransformations() {
  if (db.prepare('SELECT COUNT(*) c FROM transformations').get().c > 0) {
    console.log('  transformations already present');
    return;
  }

  const parent = db.prepare("SELECT * FROM artifacts WHERE filename = 'portrait_v1.jpg'").get();
  if (!parent) return;

  const steps = [
    { type: 'upscaling', description: '4x super-resolution upscale', model: 'Real-ESRGAN', provider: 'xinntao', filename: 'portrait_v1_4x.png', filetype: 'image/png' },
    { type: 're-encoding', description: 'Colour grade and JPEG re-encode for publication', model: null, provider: null, filename: 'portrait_final.jpg', filetype: 'image/jpeg' },
  ];

  let current = parent;
  for (const step of steps) {
    const childId = uuid();
    const outputHash = sha256(`${step.filename}:${current.sha256}`);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO artifacts (
        id, filename, filetype, filesize, sha256, model_name, model_version,
        model_provider, prompt_hash, generation_params, creator, trust_level,
        status, block_id, registered_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'self-asserted', 'derived', NULL, ?, NULL)
    `).run(
      childId, step.filename, step.filetype, Math.round(current.filesize * 1.4), outputHash,
      current.model_name, current.model_version, current.model_provider,
      current.prompt_hash, current.generation_params, current.creator, now
    );

    db.prepare(`
      INSERT INTO transformations (
        id, artifact_id, parent_id, transform_type, transform_description,
        transformer_model, transformer_provider, input_hash, output_hash,
        trust_level, created_at, block_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'self-asserted', ?, NULL, NULL)
    `).run(
      uuid(), childId, current.id, step.type, step.description,
      step.model, step.provider, current.sha256, outputHash, now
    );

    const block = appendBlock([childId], [outputHash]);
    db.prepare('UPDATE artifacts SET block_id = ? WHERE id = ?').run(block.id, childId);

    console.log(`  transformation ${step.type} → ${step.filename}`);
    current = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(childId);
  }
}

/** Rescore every artifact through the current engine. */
function rescoreAll() {
  const artifacts = db.prepare('SELECT * FROM artifacts').all();
  const update = db.prepare('UPDATE artifacts SET trust_level = ?, trust_score = ?, trust_reasons = ? WHERE id = ?');
  const counts = {};

  for (const artifact of artifacts) {
    const scored = trust.scoreArtifact(artifact);
    update.run(
      scored.level,
      scored.score,
      JSON.stringify(scored.factors.filter(f => f.met).map(f => f.detail)),
      artifact.id
    );
    counts[scored.level] = (counts[scored.level] || 0) + 1;
  }

  console.log(`  rescored ${artifacts.length} artifact(s): ` +
    Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
}

function main() {
  console.log('Seeding ModelLedger…\n');
  if (RESET) reset();

  const newKeys = seedAttesters();
  const keys = { ...loadKeys(), ...newKeys };

  seedArtifacts(keys);
  seedTransformations();
  rescoreAll();

  const { validateChain } = require('./lib/chain');
  const chain = validateChain();
  console.log(`\nDone. ${chain.total_blocks} block(s), chain integrity ${chain.valid ? 'VALID' : 'COMPROMISED'}.`);
  db.close();
}

main();
