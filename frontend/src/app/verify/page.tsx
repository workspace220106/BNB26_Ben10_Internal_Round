'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Upload, Hash as HashIcon, Search, FileCheck2, ArrowRight, GitBranch,
  Lock, Blocks, CheckCircle2, AlertTriangle, HelpCircle, ShieldAlert, Eye,
} from 'lucide-react';
import {
  verifyArtifact, verifyHash, provePrompt, formatBytes, formatDate, shortHash,
  type VerificationResult,
} from '@/lib/api';
import {
  Panel, Verdict, Hash, KV, ScoreDial, EvidenceTable, GateList, Spinner,
} from '@/components/ui';

/** Copy for each verdict. The subtitles do the real explaining. */
const VERDICTS = {
  VERIFIED: {
    icon: CheckCircle2,
    color: 'var(--color-verified)',
    title: 'Verified',
    subtitle: 'The named provider signed this exact record, and the signature still matches.',
  },
  SELF_ASSERTED: {
    icon: AlertTriangle,
    color: 'var(--color-caution)',
    title: 'Self-asserted',
    subtitle: 'A record exists and has not been altered since it was anchored — but only the uploader vouches for its origin.',
  },
  NOT_FOUND: {
    icon: HelpCircle,
    color: 'var(--color-ink-faint)',
    title: 'No record',
    subtitle: 'Nobody has registered a provenance claim for this content here. That is not evidence either way about how it was made.',
  },
  TAMPERED: {
    icon: ShieldAlert,
    color: 'var(--color-danger)',
    title: 'Tampered',
    subtitle: 'The record and its evidence contradict each other. Treat every claim attached to it as unreliable.',
  },
} as const;

export default function VerifyPage() {
  const [mode, setMode] = useState<'file' | 'hash'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [hashInput, setHashInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setResult(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (mode === 'file') {
        if (!file) { toast.error('Select a file first.'); return; }
        const fd = new FormData();
        fd.append('file', file);
        setResult(await verifyArtifact(fd));
      } else {
        const h = hashInput.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(h)) {
          toast.error('Enter a 64-character hexadecimal SHA-256 hash.');
          return;
        }
        setResult(await verifyHash(h));
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Verification failed. Is the API running?');
    } finally {
      setLoading(false);
    }
  };

  const ready = mode === 'file' ? Boolean(file) : /^[a-f0-9]{64}$/.test(hashInput.trim().toLowerCase());

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-10">
      <header className="mb-8">
        <p className="eyebrow mb-2">Verification</p>
        <h1 className="text-2xl font-semibold mb-2">Check an artifact against the ledger</h1>
        <p className="text-sm text-[var(--color-ink-dim)] max-w-2xl">
          The file is hashed in memory and the digest is compared against the ledger. The file
          itself is never stored, and never leaves this request.
        </p>
      </header>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <Panel
        title="Input"
        actions={
          <div className="segmented">
            <button data-active={mode === 'file'} onClick={() => { setMode('file'); setResult(null); }}>
              <Upload className="w-3 h-3" /> File
            </button>
            <button data-active={mode === 'hash'} onClick={() => { setMode('hash'); setResult(null); }}>
              <HashIcon className="w-3 h-3" /> Hash
            </button>
          </div>
        }
      >
        {mode === 'file' ? (
          file ? (
            <div className="flex items-center gap-3 panel-inset p-3">
              <FileCheck2 className="w-5 h-5 text-[var(--color-ink-faint)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{file.name}</p>
                <p className="mono text-[11px] text-[var(--color-ink-faint)]">
                  {formatBytes(file.size)} · {file.type || 'unknown type'}
                </p>
              </div>
              <button className="btn btn-ghost text-xs" onClick={() => { setFile(null); setResult(null); }}>
                Clear
              </button>
            </div>
          ) : (
            <div {...getRootProps()} className="dropzone" data-active={isDragActive}>
              <input {...getInputProps()} />
              <Search className="w-6 h-6 mx-auto mb-3 text-[var(--color-ink-ghost)]" />
              <p className="text-sm mb-1">
                {isDragActive ? 'Drop to hash' : 'Drop a file, or click to browse'}
              </p>
              <p className="text-xs text-[var(--color-ink-ghost)]">
                Hashed locally in memory — never written to disk
              </p>
            </div>
          )
        ) : (
          <div>
            <label htmlFor="hash" className="label block mb-2">SHA-256 content hash</label>
            <input
              id="hash"
              className="field mono"
              placeholder="64 hexadecimal characters"
              value={hashInput}
              spellCheck={false}
              onChange={e => { setHashInput(e.target.value); setResult(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && ready) run(); }}
            />
            <p className="text-xs text-[var(--color-ink-ghost)] mt-2">
              Lets a verifier check a record without handling the file at all.
            </p>
          </div>
        )}

        <button className="btn btn-primary w-full mt-4" onClick={run} disabled={loading || !ready}>
          {loading ? <><Spinner /> Checking…</> : <><Search className="w-4 h-4" /> Verify provenance</>}
        </button>
      </Panel>

      {loading && (
        <div className="panel mt-4 h-1 scanning" aria-label="Verifying" />
      )}

      {result && <Result result={result} />}
    </div>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────────

function Result({ result }: { result: VerificationResult }) {
  const cfg = VERDICTS[result.result];
  const Icon = cfg.icon;
  const trust = result.trust;

  return (
    <div className="mt-6 space-y-4">

      {/* Verdict stamp */}
      <div className="stamp" style={{ borderColor: cfg.color, color: cfg.color }}>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <Icon className="w-9 h-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold mb-1" style={{ color: cfg.color }}>{cfg.title}</h2>
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed max-w-xl">
              {result.message ?? cfg.subtitle}
            </p>
            {result.matched_via === 'transformation_output' && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
                <GitBranch className="w-3 h-3" />
                Matched as the output of a registered transformation, not as an original.
              </p>
            )}
          </div>
          {result.result !== 'NOT_FOUND' && (
            <div className="shrink-0">
              <ScoreDial score={result.trust_score} level={result.trust_level ?? 'unverifiable'} />
            </div>
          )}
        </div>
      </div>

      {/* Queried hash */}
      <Panel title="Queried digest">
        <Hash value={result.hash} full />
      </Panel>

      {result.result === 'NOT_FOUND' ? (
        <Panel title="Next step">
          <p className="text-sm text-[var(--color-ink-dim)] mb-4">
            If this is your content, registering it anchors a claim now so the record exists
            before anyone disputes it.
          </p>
          <Link href="/register" className="btn btn-secondary">
            <Upload className="w-4 h-4" /> Register this artifact
          </Link>
        </Panel>
      ) : (
        <>
          {trust && trust.gates.length > 0 && (
            <Panel title="Limits applied">
              <GateList gates={trust.gates} />
            </Panel>
          )}

          {trust && (
            <Panel title={`Evidence · ${trust.earned} of ${trust.available} weighted points`}>
              <EvidenceTable factors={trust.factors} />
            </Panel>
          )}

          {result.artifact && <ArtifactPanel result={result} />}

          {trust && trust.conflicts.length > 0 && (
            <Panel title="Conflicting claims">
              <p className="text-[13px] text-[var(--color-ink-dim)] mb-3">
                Other records claim this exact content came from a different model. At most one
                can be true, and the ledger has no evidence favouring either.
              </p>
              <div className="space-y-2">
                {trust.conflicts.map(c => (
                  <Link
                    key={c.artifact_id}
                    href={`/artifact/${c.artifact_id}`}
                    className="flex items-center justify-between gap-3 panel-inset p-2.5 hover:border-[var(--color-line-strong)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        claims <span className="text-[var(--color-caution)]">{c.claims_model}</span>
                        {c.claims_provider && <span className="text-[var(--color-ink-faint)]"> · {c.claims_provider}</span>}
                      </p>
                      <p className="mono text-[11px] text-[var(--color-ink-ghost)]">
                        {c.creator ?? 'anonymous'} · {formatDate(c.registered_at)}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--color-ink-ghost)] shrink-0" />
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {result.inclusion_proof && <InclusionPanel proof={result.inclusion_proof} block={result.block} />}

          {result.artifact?.prompt_recorded && <PromptProof artifactId={result.artifact.id} />}
        </>
      )}
    </div>
  );
}

function ArtifactPanel({ result }: { result: VerificationResult }) {
  const a = result.artifact!;
  return (
    <Panel
      title="Claimed record"
      actions={
        <Link href={`/artifact/${a.id}`} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline normal-case tracking-normal">
          Full record <ArrowRight className="w-3 h-3" />
        </Link>
      }
    >
      <KV items={[
        { k: 'Filename', v: a.filename },
        { k: 'Model', v: `${a.model_name}${a.model_version ? ` · ${a.model_version}` : ''}` },
        { k: 'Provider', v: a.model_provider },
        { k: 'Creator', v: a.creator },
        { k: 'Status', v: a.status === 'derived' ? 'Derived from another artifact' : 'Original registration' },
        {
          k: 'Prompt',
          v: a.prompt_recorded
            ? <span className="inline-flex items-center gap-1.5 text-[var(--color-verified)]">
                <Lock className="w-3 h-3" /> hashed, not stored
              </span>
            : 'not recorded',
        },
        { k: 'Registered', v: formatDate(a.registered_at) },
        { k: 'Block', v: a.block_index !== null ? `#${a.block_index}` : 'unanchored' },
      ]} />
    </Panel>
  );
}

/**
 * The Merkle inclusion proof, rendered as the sibling chain the verifier would
 * actually walk. Shown because "trust us, it's in there" is exactly what this
 * system exists to replace.
 */
function InclusionPanel({
  proof, block,
}: { proof: NonNullable<VerificationResult['inclusion_proof']>; block?: VerificationResult['block'] }) {
  return (
    <Panel title="Inclusion proof">
      <div className="flex items-start gap-2.5 mb-4">
        <Blocks className="w-4 h-4 mt-0.5 text-[var(--color-ink-faint)] shrink-0" />
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          {proof.proof.length === 0
            ? <>This artifact is the only leaf in block #{proof.block_index}, so its hash is the Merkle root directly.</>
            : <>Hashing this digest against {proof.proof.length} sibling{proof.proof.length === 1 ? '' : 's'} reproduces
              the root committed in block #{proof.block_index}. The siblings are hashes only — inclusion is
              proved without revealing which artifacts they belong to.</>}
        </p>
      </div>

      {proof.proof.length > 0 && (
        <ol className="space-y-1.5 mb-4">
          {proof.proof.map((step, i) => (
            <li key={i} className="flex items-center gap-2.5 panel-inset px-2.5 py-1.5">
              <span className="mono text-[10px] text-[var(--color-ink-ghost)] w-4 shrink-0">{i + 1}</span>
              <span className="mono text-[10px] text-[var(--color-ink-faint)] w-10 shrink-0 uppercase">
                {step.position}
              </span>
              <span className="mono text-[11px] text-[var(--color-ink-dim)] truncate">
                {shortHash(step.hash, 16, 12)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <KV items={[
        {
          k: 'Recomputes to root',
          v: proof.valid
            ? <span className="inline-flex items-center gap-1.5 text-[var(--color-verified)]">
                <CheckCircle2 className="w-3 h-3" /> matches
              </span>
            : <span className="text-[var(--color-danger)]">does not match</span>,
        },
        { k: 'Merkle root', v: <Hash value={proof.merkle_root} /> },
        { k: 'Block hash', v: <Hash value={proof.block_hash} /> },
        { k: 'Confirmations', v: <span className="mono tnum">{proof.confirmations}</span> },
        ...(block ? [{ k: 'Nonce', v: <span className="mono tnum">{block.nonce}</span> }] : []),
      ]} />
    </Panel>
  );
}

/**
 * Privacy-preserving proof, made tangible: paste the original prompt and the
 * server confirms the match without ever having stored the text.
 */
function PromptProof({ artifactId }: { artifactId: string }) {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<{ matches: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setState(null);
    try {
      setState(await provePrompt(artifactId, prompt));
    } catch {
      toast.error('Could not check the prompt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Prove the prompt — without revealing it">
      <div className="flex items-start gap-2.5 mb-4">
        <Eye className="w-4 h-4 mt-0.5 text-[var(--color-ink-faint)] shrink-0" />
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          Only a salted hash of the prompt was stored. If you hold the original, entering it
          here re-derives that hash and confirms the claim. Anyone who does not already know
          the prompt learns nothing — and the salt means a short prompt cannot be guessed out
          of the ledger by dictionary attack.
        </p>
      </div>

      <textarea
        className="field resize-none h-20 mb-3"
        placeholder="Paste the original prompt to test it"
        value={prompt}
        onChange={e => { setPrompt(e.target.value); setState(null); }}
      />

      <button className="btn btn-secondary" onClick={check} disabled={busy || !prompt.trim()}>
        {busy ? <><Spinner /> Checking…</> : <><Lock className="w-4 h-4" /> Test prompt</>}
      </button>

      {state && (
        <div
          className="mt-3 p-3 rounded-[3px] border text-[13px] leading-relaxed"
          style={{
            borderColor: `color-mix(in srgb, ${state.matches ? 'var(--color-verified)' : 'var(--color-danger)'} 30%, transparent)`,
            background: `color-mix(in srgb, ${state.matches ? 'var(--color-verified)' : 'var(--color-danger)'} 7%, transparent)`,
            color: state.matches ? 'var(--color-verified)' : 'var(--color-danger)',
          }}
        >
          {state.message}
        </div>
      )}
    </Panel>
  );
}
