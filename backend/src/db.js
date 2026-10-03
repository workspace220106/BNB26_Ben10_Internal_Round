'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'modelledger.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL lets readers run while a block is being written. synchronous=NORMAL is
// the right trade here: on a crash we can lose the last commit, and losing an
// unconfirmed registration is acceptable where halving write latency is not.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

/**
 * Schema. Every statement is CREATE IF NOT EXISTS / additive ALTER, so this
 * runs safely against the existing database rather than discarding the
 * artifacts already anchored in it.
 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filetype TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      model_name TEXT NOT NULL,
      model_version TEXT,
      model_provider TEXT,
      prompt_hash TEXT,
      generation_params TEXT,
      creator TEXT,
      trust_level TEXT NOT NULL DEFAULT 'self-asserted',
      status TEXT NOT NULL DEFAULT 'registered',
      block_id INTEGER,
      registered_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_index INTEGER NOT NULL UNIQUE,
      timestamp TEXT NOT NULL,
      artifact_ids TEXT NOT NULL,
      merkle_root TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      nonce INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transformations (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      parent_id TEXT,
      transform_type TEXT NOT NULL,
      transform_description TEXT NOT NULL,
      transformer_model TEXT,
      transformer_provider TEXT,
      input_hash TEXT NOT NULL,
      output_hash TEXT NOT NULL,
      trust_level TEXT NOT NULL DEFAULT 'self-asserted',
      created_at TEXT NOT NULL,
      block_id INTEGER,
      metadata TEXT,
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      artifact_id TEXT,
      provided_hash TEXT NOT NULL,
      result TEXT NOT NULL,
      trust_score INTEGER NOT NULL,
      issues TEXT,
      verified_at TEXT NOT NULL,
      verifier_ip TEXT
    );

    /*
     * Attesters are the parties whose signature means something. A key that
     * is 'recognized' belongs to a model provider the ledger operator has
     * vetted out of band; 'community' keys are real keys with no vetting.
     * This distinction is the whole basis of the trusted/self-asserted split.
     */
    CREATE TABLE IF NOT EXISTS attesters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'community',
      public_key TEXT NOT NULL,
      key_fingerprint TEXT NOT NULL UNIQUE,
      registered_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attestations (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      attester_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      valid INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id),
      FOREIGN KEY (attester_id) REFERENCES attesters(id)
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_sha256 ON artifacts(sha256);
    CREATE INDEX IF NOT EXISTS idx_artifacts_block ON artifacts(block_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_trust ON artifacts(trust_level);
    CREATE INDEX IF NOT EXISTS idx_transformations_artifact ON transformations(artifact_id);
    CREATE INDEX IF NOT EXISTS idx_transformations_parent ON transformations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_transformations_output ON transformations(output_hash);
    CREATE INDEX IF NOT EXISTS idx_attestations_artifact ON attestations(artifact_id);
    CREATE INDEX IF NOT EXISTS idx_verifications_artifact ON verifications(artifact_id);
  `);

  // Columns added after the first release. SQLite has no ADD COLUMN IF NOT
  // EXISTS, so check the table info and ignore what is already there.
  const columns = new Set(db.prepare('PRAGMA table_info(artifacts)').all().map(c => c.name));
  const additions = {
    trust_score: 'INTEGER',
    trust_reasons: 'TEXT',
    prompt_salt: 'TEXT',
    perceptual_hash: 'TEXT',
    revoked_at: 'TEXT',
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!columns.has(name)) db.exec(`ALTER TABLE artifacts ADD COLUMN ${name} ${type}`);
  }
}

migrate();

module.exports = { db, DB_PATH };
