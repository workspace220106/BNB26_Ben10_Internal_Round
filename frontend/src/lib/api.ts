import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL: API_URL, timeout: 60_000 });

// ─── Types ───────────────────────────────────────────────────────────────────

export type TrustLevel = 'trusted' | 'self-asserted' | 'unverifiable';
export type VerifyResult = 'VERIFIED' | 'SELF_ASSERTED' | 'NOT_FOUND' | 'TAMPERED';

export interface Artifact {
  id: string;
  filename: string;
  filetype: string;
  filesize: number;
  sha256: string;
  model_name: string;
  model_version?: string | null;
  model_provider?: string | null;
  prompt_hash?: string | null;
  prompt_recorded?: boolean;
  generation_params?: string | null;
  creator?: string | null;
  trust_level: TrustLevel;
  trust_score?: number;
  trust_reasons?: string[];
  status: 'registered' | 'derived';
  block_id?: number | null;
  block_index?: number | null;
  block_hash?: string | null;
  registered_at: string;
  metadata?: string | null;
}

export interface TrustFactor {
  key: string;
  label: string;
  weight: number;
  /** null when the factor does not apply to this artifact (e.g. lineage on an original). */
  met: boolean | null;
  not_applicable?: boolean;
  partial?: number;
  detail: string;
}

export interface TrustGate {
  type: string;
  message: string;
  ceiling: number;
}

export interface Attestation {
  id: string;
  attester_id: string;
  attester_name: string;
  kind: 'provider' | 'community';
  key_fingerprint: string;
  signed_at: string;
  signature_valid: boolean;
  key_revoked: boolean;
  counts_as_independent: boolean;
}

export interface Conflict {
  artifact_id: string;
  claims_model: string;
  claims_provider?: string;
  creator?: string;
  registered_at: string;
}

export interface TrustReport {
  score: number;
  raw_score: number;
  ceiling: number;
  earned: number;
  available: number;
  level: TrustLevel;
  factors: TrustFactor[];
  gates: TrustGate[];
  attestations: Attestation[];
  conflicts: Conflict[];
  lineage: {
    transformation: Transformation;
    parent_id: string | null;
    parent_filename: string | null;
    link_valid: boolean;
  }[];
  lineage_breaks: { type: string; message: string }[];
  chain_valid: boolean;
}

export interface Block {
  id: number;
  block_index: number;
  timestamp: string;
  artifact_ids: string[];
  merkle_root: string;
  prev_hash: string;
  hash: string;
  nonce: number;
}

export interface Transformation {
  id: string;
  artifact_id: string;
  parent_id?: string | null;
  transform_type: string;
  transform_description: string;
  transformer_model?: string | null;
  transformer_provider?: string | null;
  input_hash: string;
  output_hash: string;
  trust_level: string;
  created_at: string;
}

export interface InclusionProof {
  leaf: string;
  proof: { hash: string; position: 'left' | 'right' }[];
  merkle_root: string;
  block_index: number;
  block_hash: string;
  valid: boolean;
  confirmations: number;
}

export interface VerificationResult {
  verification_id: string;
  result: VerifyResult;
  matched_via?: 'content_hash' | 'transformation_output' | null;
  trust_score: number;
  trust_level?: TrustLevel;
  trust_reasons?: string[];
  trust?: TrustReport;
  hash: string;
  artifact?: Artifact;
  transformations?: Transformation[];
  block?: Block | null;
  inclusion_proof?: InclusionProof | null;
  chain_valid?: boolean;
  issues?: string[];
  message?: string;
}

export interface LedgerStats {
  totalArtifacts: number;
  totalBlocks: number;
  totalTransformations: number;
  totalVerifications: number;
  totalAttesters: number;
  chainIntegrity: 'VALID' | 'COMPROMISED';
  chainIssues: ChainIssue[];
  difficulty: number;
  latestBlock: Block | null;
  byTrust: { trust_level: TrustLevel; c: number }[];
  byStatus: { status: string; c: number }[];
  byResult: { result: VerifyResult; c: number }[];
  activity: {
    day: string; total: number; verified: number;
    self_asserted: number; tampered: number; not_found: number;
  }[];
  recentArtifacts: Artifact[];
}

export interface ChainIssue {
  type: string;
  block_index?: number;
  message: string;
  expected?: string;
  found?: string;
}

export interface Attester {
  id: string;
  name: string;
  kind: 'provider' | 'community';
  key_fingerprint: string;
  registered_at: string;
  revoked_at?: string | null;
  attestation_count: number;
}

export interface Scenario {
  key: string;
  title: string;
  category: 'fabricated' | 'conflicting' | 'incomplete' | 'tamper' | 'control';
  threat: string;
  expectation: string;
}

export interface ScenarioRun extends Scenario {
  steps: { label: string; detail: string }[];
  before: Partial<TrustReport>;
  after: Partial<TrustReport>;
  secondary?: Partial<TrustReport>;
  chain_issues?: ChainIssue[];
  breaks?: { type: string; message: string }[];
  defended: boolean;
  conclusion: string;
  sandboxed?: boolean;
  note?: string;
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export async function registerArtifact(fd: FormData) {
  const { data } = await api.post('/api/artifacts/register', fd);
  return data;
}

export async function previewTrust(claim: Record<string, unknown>) {
  const { data } = await api.post('/api/artifacts/preview-trust', claim);
  return data as TrustReport;
}

export async function getArtifact(id: string) {
  const { data } = await api.get(`/api/artifacts/${id}`);
  return data as {
    artifact: Artifact; trust: TrustReport; block: Block | null;
    inclusion_proof: InclusionProof | null;
    derived_from: Transformation[]; derivatives: Transformation[];
  };
}

export async function getArtifactChain(id: string) {
  const { data } = await api.get(`/api/artifacts/${id}/chain`);
  return data as {
    artifact: Artifact; root: Artifact;
    ancestors: { transformation: Transformation; artifact: Artifact | null; link_valid: boolean }[];
    descendants: { transformation: Transformation; artifact: Artifact | null }[];
    breaks: { type: string; message: string }[];
    intact: boolean;
  };
}

export async function verifyArtifact(fd: FormData) {
  const { data } = await api.post('/api/artifacts/verify', fd);
  return data as VerificationResult;
}

export async function verifyHash(hash: string) {
  const { data } = await api.post('/api/artifacts/verify-hash', { hash });
  return data as VerificationResult;
}

export async function provePrompt(id: string, prompt: string) {
  const { data } = await api.post(`/api/artifacts/${id}/prove-prompt`, { prompt });
  return data as { matches: boolean; message: string };
}

export async function registerTransformation(fd: FormData) {
  const { data } = await api.post('/api/transformations', fd);
  return data;
}

export async function getTransformTypes() {
  const { data } = await api.get('/api/transformations/types');
  return data.types as { key: string; preserves: string; label: string }[];
}

export async function getAttesters() {
  const { data } = await api.get('/api/attesters');
  return data.attesters as Attester[];
}

export async function attest(body: Record<string, unknown>) {
  const { data } = await api.post('/api/attesters/attest', body);
  return data;
}

export async function getLedgerStats() {
  const { data } = await api.get('/api/ledger/stats');
  return data as LedgerStats;
}

export async function getLedgerArtifacts(params: {
  page?: number; limit?: number; search?: string; trust?: string; status?: string;
}) {
  const { data } = await api.get('/api/ledger/artifacts', { params });
  return data as { artifacts: Artifact[]; pagination: { page: number; total: number; pages: number } };
}

export async function getBlocks(params: { page?: number; limit?: number }) {
  const { data } = await api.get('/api/ledger', { params });
  return data as { blocks: Block[]; pagination: { page: number; total: number; pages: number } };
}

export async function validateChain() {
  const { data } = await api.get('/api/ledger/validate');
  return data as { valid: boolean; total_blocks: number; issues: ChainIssue[] };
}

export async function getScenarios() {
  const { data } = await api.get('/api/adversarial/scenarios');
  return data.scenarios as Scenario[];
}

export async function runScenario(key: string) {
  const { data } = await api.post(`/api/adversarial/run/${key}`);
  return data as ScenarioRun;
}

export async function runAllScenarios() {
  const { data } = await api.post('/api/adversarial/run-all');
  return data as { results: ScenarioRun[]; passed: number; total: number };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Hashes are compared by their ends far more often than their middles, so
 * truncation keeps both and drops the centre.
 */
export function shortHash(hash: string, head = 8, tail = 6): string {
  if (!hash) return '';
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function trustColor(level?: string): string {
  switch (level) {
    case 'trusted': return 'var(--color-verified)';
    case 'self-asserted': return 'var(--color-caution)';
    case 'unverifiable': return 'var(--color-ink-faint)';
    default: return 'var(--color-ink-faint)';
  }
}

export function resultColor(result?: string): string {
  switch (result) {
    case 'VERIFIED': return 'var(--color-verified)';
    case 'SELF_ASSERTED': return 'var(--color-caution)';
    case 'TAMPERED': return 'var(--color-danger)';
    default: return 'var(--color-ink-faint)';
  }
}

export function fileKind(mimetype: string): string {
  if (!mimetype) return 'file';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('text/')) return 'text';
  if (mimetype.includes('pdf')) return 'pdf';
  return 'file';
}
