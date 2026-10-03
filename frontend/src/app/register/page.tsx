'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Upload, FileCheck2, Lock, Cpu, User, ArrowRight, CheckCircle2, Blocks, Info,
} from 'lucide-react';
import {
  registerArtifact, previewTrust, getAttesters, attest,
  formatBytes, type TrustReport, type Attester,
} from '@/lib/api';
import {
  Panel, Verdict, Hash, KV, ScoreDial, EvidenceTable, GateList, Spinner,
} from '@/components/ui';

type Step = 'upload' | 'describe' | 'mining' | 'done';

const EMPTY = {
  model_name: '', model_version: '', model_provider: '',
  prompt: '', generation_params: '', creator: '',
};

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [preview, setPreview] = useState<TrustReport | null>(null);
  const [result, setResult] = useState<{
    artifact: { id: string; sha256: string; trust_level: string; trust_score: number };
    trust: TrustReport;
    block: { index: number; hash: string; merkle_root: string; nonce: number };
  } | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setStep('describe'); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

  /**
   * Live trust preview. Debounced because it fires on every keystroke and the
   * answer only changes when the user pauses.
   */
  useEffect(() => {
    if (step !== 'describe') return;
    const timer = setTimeout(() => {
      previewTrust({
        ...form,
        prompt_hash: form.prompt ? 'preview' : '',
        sha256: 'preview',
      }).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [form, step]);

  const submit = async () => {
    if (!file || !form.model_name.trim()) {
      toast.error('A file and a model name are required.');
      return;
    }
    if (form.generation_params.trim()) {
      try { JSON.parse(form.generation_params); }
      catch { toast.error('Generation parameters must be valid JSON.'); return; }
    }

    setStep('mining');
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => { if (v.trim()) fd.append(k, v); });
      const data = await registerArtifact(fd);
      setResult(data);
      setStep('done');
      toast.success(`Anchored in block #${data.block.index}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Registration failed.');
      setStep('describe');
    }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setForm(EMPTY);
    setResult(null); setPreview(null);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-10">
      <header className="mb-8">
        <p className="eyebrow mb-2">Registration</p>
        <h1 className="text-2xl font-semibold mb-2">Anchor a provenance claim</h1>
        <p className="text-sm text-[var(--color-ink-dim)] max-w-2xl">
          The file is hashed and the digest is committed to a block. The file itself is never
          stored — the ledger holds the fingerprint, not the content.
        </p>
      </header>

      <Steps current={step} />

      {step === 'upload' && (
        <Panel title="Artifact">
          <div {...getRootProps()} className="dropzone" data-active={isDragActive}>
            <input {...getInputProps()} />
            <Upload className="w-6 h-6 mx-auto mb-3 text-[var(--color-ink-ghost)]" />
            <p className="text-sm mb-1">
              {isDragActive ? 'Drop to hash' : 'Drop your AI-generated file, or click to browse'}
            </p>
            <p className="text-xs text-[var(--color-ink-ghost)]">
              Images, audio, video, text or code · up to 50 MB
            </p>
          </div>
        </Panel>
      )}

      {step === 'describe' && file && (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
          <div className="space-y-4">
            <Panel title="Artifact">
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-5 h-5 text-[var(--color-ink-faint)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="mono text-[11px] text-[var(--color-ink-faint)]">
                    {formatBytes(file.size)} · {file.type || 'unknown type'}
                  </p>
                </div>
                <button className="btn btn-ghost text-xs" onClick={reset}>Change</button>
              </div>
            </Panel>

            <Panel title={<><Cpu className="w-3 h-3 inline mr-1.5" />Model claim</>}>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <Field
                  label="Model name" required
                  placeholder="DALL-E 3"
                  value={form.model_name}
                  onChange={v => setForm(f => ({ ...f, model_name: v }))}
                />
                <Field
                  label="Version"
                  placeholder="3.0"
                  value={form.model_version}
                  onChange={v => setForm(f => ({ ...f, model_version: v }))}
                />
              </div>
              <Field
                label="Provider"
                placeholder="OpenAI"
                hint="Must match the attesting key's identity for a provider signature to count."
                value={form.model_provider}
                onChange={v => setForm(f => ({ ...f, model_provider: v }))}
              />
            </Panel>

            <Panel title={<><Lock className="w-3 h-3 inline mr-1.5" />Generation context</>}>
              <div className="flex items-start gap-2 mb-4 p-2.5 panel-inset">
                <Info className="w-3.5 h-3.5 mt-0.5 text-[var(--color-ink-faint)] shrink-0" />
                <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">
                  The prompt is salted and hashed before anything is written. The text itself is
                  discarded — you will be able to prove it later, and nobody else will be able to
                  read it.
                </p>
              </div>

              <div className="mb-3">
                <label className="label block mb-1.5">Prompt</label>
                <textarea
                  className="field resize-none h-20"
                  placeholder="The prompt used to generate this artifact"
                  value={form.prompt}
                  onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                />
              </div>

              <Field
                label="Generation parameters (JSON)" mono
                placeholder='{"steps": 50, "cfg_scale": 7.5, "seed": 42}'
                value={form.generation_params}
                onChange={v => setForm(f => ({ ...f, generation_params: v }))}
              />
            </Panel>

            <Panel title={<><User className="w-3 h-3 inline mr-1.5" />Creator</>}>
              <Field
                label="Identifier"
                placeholder="you@example.com"
                value={form.creator}
                onChange={v => setForm(f => ({ ...f, creator: v }))}
              />
            </Panel>

            <button
              className="btn btn-primary w-full"
              onClick={submit}
              disabled={!form.model_name.trim()}
            >
              <Blocks className="w-4 h-4" /> Hash and anchor
              <ArrowRight className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>

          {/* Live preview — shows the ceiling before the user commits. */}
          <div className="lg:sticky lg:top-20 space-y-4">
            <Panel title="Projected verdict">
              {preview ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <ScoreDial score={preview.score} level={preview.level} size="sm" />
                    <div className="min-w-0">
                      <Verdict level={preview.level} />
                      <p className="text-xs text-[var(--color-ink-faint)] mt-2 leading-relaxed">
                        Updates as you type. Registering anchors the claim; it does not
                        corroborate it.
                      </p>
                    </div>
                  </div>
                  <EvidenceTable factors={preview.factors} />
                </>
              ) : (
                <p className="text-xs text-[var(--color-ink-ghost)]">
                  Enter a model name to see the projected verdict.
                </p>
              )}
            </Panel>

            {preview && preview.gates.length > 0 && (
              <Panel title="Why it is capped">
                <GateList gates={preview.gates} />
              </Panel>
            )}
          </div>
        </div>
      )}

      {step === 'mining' && (
        <Panel>
          <div className="py-12 text-center">
            <div className="w-10 h-10 mx-auto mb-5 flex items-center justify-center text-[var(--color-accent)]">
              <Spinner className="w-8 h-8" />
            </div>
            <p className="text-sm mb-1">Mining block</p>
            <p className="text-xs text-[var(--color-ink-faint)]">
              Hashing content, building the Merkle tree, grinding nonces to the difficulty target
            </p>
            <div className="panel-inset h-1 mt-6 max-w-xs mx-auto scanning" />
          </div>
        </Panel>
      )}

      {step === 'done' && result && (
        <Done result={result} onReset={reset} />
      )}
    </div>
  );
}

// ─── Completion ──────────────────────────────────────────────────────────────

interface RegistrationReceipt {
  artifact: { id: string; sha256: string; trust_level: string; trust_score: number };
  trust: TrustReport;
  block: { index: number; hash: string; merkle_root: string; nonce: number };
}

function Done({ result, onReset }: { result: RegistrationReceipt; onReset: () => void }) {
  return (
    <div className="space-y-4">
      <div className="stamp" style={{ borderColor: 'var(--color-verified)', color: 'var(--color-verified)' }}>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <CheckCircle2 className="w-9 h-9 shrink-0" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--color-verified)' }}>
              Anchored in block #{result.block.index}
            </h2>
            <p className="text-[13px] text-[var(--color-ink-dim)] max-w-xl leading-relaxed">
              The claim is now on the record and cannot be altered without breaking the chain.
              Its verdict reflects the evidence behind it, which is a separate question.
            </p>
          </div>
          <ScoreDial score={result.artifact.trust_score} level={result.artifact.trust_level} />
        </div>
      </div>

      <Panel title="Receipt">
        <KV items={[
          { k: 'Artifact ID', v: <Hash value={result.artifact.id} /> },
          { k: 'Content hash', v: <Hash value={result.artifact.sha256} /> },
          { k: 'Block', v: <span className="mono tnum">#{result.block.index}</span> },
          { k: 'Block hash', v: <Hash value={result.block.hash} /> },
          { k: 'Merkle root', v: <Hash value={result.block.merkle_root} /> },
          { k: 'Nonce', v: <span className="mono tnum">{result.block.nonce}</span> },
          { k: 'Verdict', v: <Verdict level={result.artifact.trust_level} score={result.artifact.trust_score} /> },
        ]} />
      </Panel>

      {result.trust.gates.length > 0 && (
        <Panel title="Why it is capped">
          <GateList gates={result.trust.gates} />
          <AttestPrompt artifactId={result.artifact.id} />
        </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/artifact/${result.artifact.id}`} className="btn btn-primary">
          View full record <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link href={`/derive?parent=${result.artifact.id}`} className="btn btn-secondary">
          Register a derivation
        </Link>
        <button className="btn btn-ghost" onClick={onReset}>Register another</button>
      </div>
    </div>
  );
}

/**
 * Offers the demo attestation path. This is the one place the system shows
 * what *would* lift a record to trusted, which otherwise stays abstract.
 */
function AttestPrompt({ artifactId }: { artifactId: string }) {
  const [attesters, setAttesters] = useState<Attester[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    if (open && !attesters.length) getAttesters().then(setAttesters).catch(() => {});
  }, [open, attesters.length]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await attest({ artifact_id: artifactId, attester_id: chosen, private_key: key });
      if (res.signature_valid) toast.success(res.message);
      else toast.error(res.message);
      if (res.trust?.level === 'trusted') setTimeout(() => window.location.reload(), 900);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Attestation failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost text-xs mt-3" onClick={() => setOpen(true)}>
        How would this become trusted?
      </button>
    );
  }

  return (
    <div className="mt-4 panel-inset p-3">
      <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed mb-3">
        Only a signature from a vetted provider key can lift this record. In a real deployment
        the provider signs at generation time and never shares the key. This demo exposes the
        seeded keys so the flow can be exercised — run{' '}
        <code className="mono text-[11px] text-[var(--color-ink)]">npm run seed</code> and read{' '}
        <code className="mono text-[11px] text-[var(--color-ink)]">backend/data/demo-keys.json</code>.
      </p>

      <label className="label block mb-1.5">Attester</label>
      <select className="field mb-3" value={chosen} onChange={e => setChosen(e.target.value)}>
        <option value="">Select a registered attester…</option>
        {attesters.map(a => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.kind}{a.revoked_at ? ' (revoked)' : ''}
          </option>
        ))}
      </select>

      <label className="label block mb-1.5">Private key (PEM)</label>
      <textarea
        className="field mono resize-none h-20 mb-3"
        placeholder="-----BEGIN PRIVATE KEY-----"
        value={key}
        onChange={e => setKey(e.target.value)}
      />

      <button className="btn btn-secondary text-xs" onClick={submit} disabled={busy || !chosen || !key.trim()}>
        {busy ? <><Spinner /> Signing…</> : 'Sign attestation'}
      </button>
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Steps({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Artifact' },
    { key: 'describe', label: 'Claim' },
    { key: 'mining', label: 'Anchor' },
    { key: 'done', label: 'Receipt' },
  ];
  const index = steps.findIndex(s => s.key === current);

  return (
    <ol className="flex items-center gap-1 mb-6" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'active' : 'todo';
        return (
          <li key={s.key} className="flex items-center gap-1 flex-1 last:flex-none">
            <span
              className="mono text-[10px] tracking-wider uppercase px-2 py-1 rounded-[3px] border whitespace-nowrap"
              style={{
                color: state === 'todo' ? 'var(--color-ink-ghost)'
                  : state === 'done' ? 'var(--color-verified)' : 'var(--color-ink)',
                borderColor: state === 'active' ? 'var(--color-line-strong)' : 'transparent',
                background: state === 'active' ? 'var(--color-surface-2)' : 'transparent',
              }}
            >
              {state === 'done' ? '✓ ' : `${i + 1}. `}{s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className="h-px flex-1 min-w-4"
                style={{ background: i < index ? 'var(--color-verified-dim)' : 'var(--color-line)' }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label, value, onChange, placeholder, required, hint, mono,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; hint?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="label block mb-1.5">
        {label}{required && <span className="text-[var(--color-danger)] ml-1">*</span>}
      </label>
      <input
        className={`field ${mono ? 'mono' : ''}`}
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1.5">{hint}</p>}
    </div>
  );
}
