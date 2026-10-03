'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  GitBranch, Upload, FileCheck2, Search, ArrowRight, ArrowDown, CheckCircle2, Info,
} from 'lucide-react';
import {
  getLedgerArtifacts, getTransformTypes, registerTransformation,
  formatBytes, type Artifact,
} from '@/lib/api';
import { Panel, Verdict, Hash, KV, Spinner, Empty } from '@/components/ui';

/** How much provenance each class of edit carries forward. */
const PRESERVES: Record<string, { label: string; color: string; note: string }> = {
  full: {
    label: 'Preserves provenance',
    color: 'var(--color-verified)',
    note: 'A mechanical change. The content is the same work in a different container, so the original claim still describes it.',
  },
  partial: {
    label: 'Partially preserves',
    color: 'var(--color-caution)',
    note: 'A second model contributed pixels. The original claim no longer fully describes the result, and the chain records both systems.',
  },
  unknown: {
    label: 'Unknown effect',
    color: 'var(--color-ink-faint)',
    note: 'The ledger cannot reason about what this did to the content, so it records the link without asserting the claim survives.',
  },
};

export default function DerivePage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center"><Spinner className="w-6 h-6" /></div>}>
      <Derive />
    </Suspense>
  );
}

function Derive() {
  const searchParams = useSearchParams();
  const presetParent = searchParams.get('parent');

  const [parent, setParent] = useState<Artifact | null>(null);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Artifact[]>([]);
  const [types, setTypes] = useState<{ key: string; label: string; preserves: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    transform_type: 're-encoding',
    transform_description: '',
    transformer_model: '',
    transformer_provider: '',
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    artifact: Artifact; transformation: { transform_type: string };
    block: { index: number; hash: string }; preserves: string;
  } | null>(null);

  useEffect(() => { getTransformTypes().then(setTypes).catch(() => {}); }, []);

  // Preselect the parent when arriving from an artifact page.
  useEffect(() => {
    if (!presetParent) return;
    getLedgerArtifacts({ limit: 100 })
      .then(({ artifacts }) => {
        const found = artifacts.find(a => a.id === presetParent);
        if (found) setParent(found);
      })
      .catch(() => {});
  }, [presetParent]);

  useEffect(() => {
    if (parent) return;
    const timer = setTimeout(() => {
      getLedgerArtifacts({ search, limit: 8 })
        .then(({ artifacts }) => setCandidates(artifacts))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search, parent]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

  const submit = async () => {
    if (!parent || !file) { toast.error('Select a parent artifact and the derived file.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('parent_id', parent.id);
      Object.entries(form).forEach(([k, v]) => { if (v.trim()) fd.append(k, v); });
      const data = await registerTransformation(fd);
      setResult(data);
      toast.success(`Derivation anchored in block #${data.block.index}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Could not register the derivation.');
    } finally {
      setBusy(false);
    }
  };

  const selectedType = types.find(t => t.key === form.transform_type);
  const preserves = PRESERVES[selectedType?.preserves ?? 'unknown'];

  if (result) {
    return (
      <div className="max-w-[760px] mx-auto px-4 py-10 space-y-4">
        <div className="stamp" style={{ borderColor: 'var(--color-verified)', color: 'var(--color-verified)' }}>
          <div className="relative flex items-center gap-5">
            <CheckCircle2 className="w-9 h-9 shrink-0" />
            <div>
              <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--color-verified)' }}>
                Derivation recorded
              </h1>
              <p className="text-[13px] text-[var(--color-ink-dim)] max-w-lg leading-relaxed">
                The derived file has a completely different content hash, but verification will
                now resolve it back to its original through this link.
              </p>
            </div>
          </div>
        </div>

        <Panel title="Receipt">
          <KV items={[
            { k: 'Derived artifact', v: <Hash value={result.artifact.id} /> },
            { k: 'Output hash', v: <Hash value={result.artifact.sha256} /> },
            { k: 'Transform', v: result.transformation.transform_type },
            { k: 'Block', v: <span className="mono tnum">#{result.block.index}</span> },
            { k: 'Verdict', v: <Verdict level={result.artifact.trust_level} score={result.artifact.trust_score} /> },
          ]} />
        </Panel>

        <div className="flex flex-wrap gap-2">
          <Link href={`/artifact/${result.artifact.id}`} className="btn btn-primary">
            View chain of custody <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button className="btn btn-ghost" onClick={() => { setResult(null); setFile(null); }}>
            Record another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-10">
      <header className="mb-8">
        <p className="eyebrow mb-2">Transformation</p>
        <h1 className="text-2xl font-semibold mb-2">Record a derivation</h1>
        <p className="text-sm text-[var(--color-ink-dim)] leading-relaxed">
          Re-encoding, resizing or upscaling changes a file&rsquo;s hash completely, which breaks a
          plain lookup. Recording the transformation links the new hash to the original so
          provenance survives the edit.
        </p>
      </header>

      <div className="space-y-4">
        {/* Parent */}
        <Panel title="Step 1 · Original artifact">
          {parent ? (
            <div className="flex items-center gap-3">
              <FileCheck2 className="w-5 h-5 text-[var(--color-ink-faint)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{parent.filename}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Verdict level={parent.trust_level} score={parent.trust_score} />
                  <Hash value={parent.sha256} />
                </div>
              </div>
              <button className="btn btn-ghost text-xs" onClick={() => setParent(null)}>Change</button>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-ink-ghost)]" />
                <input
                  className="field pl-8"
                  placeholder="Search the ledger by filename, model or creator"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {candidates.length === 0 ? (
                <Empty icon={Search} title="No matching artifacts" />
              ) : (
                <ul className="space-y-1.5">
                  {candidates.map(a => (
                    <li key={a.id}>
                      <button
                        className="w-full flex items-center justify-between gap-3 panel-inset p-2.5 text-left hover:border-[var(--color-line-strong)] transition-colors"
                        onClick={() => setParent(a)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm truncate">{a.filename}</span>
                          <span className="mono text-[11px] text-[var(--color-ink-faint)]">{a.model_name}</span>
                        </span>
                        <Verdict level={a.trust_level} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        {parent && (
          <div className="flex justify-center">
            <ArrowDown className="w-4 h-4 text-[var(--color-ink-ghost)]" />
          </div>
        )}

        {/* Transform */}
        {parent && (
          <Panel title="Step 2 · What was done">
            <label className="label block mb-1.5">Transformation type</label>
            <select
              className="field mb-2"
              value={form.transform_type}
              onChange={e => setForm(f => ({ ...f, transform_type: e.target.value }))}
            >
              {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>

            <div
              className="flex items-start gap-2 p-2.5 mb-4 rounded-[3px] border"
              style={{
                borderColor: `color-mix(in srgb, ${preserves.color} 28%, transparent)`,
                background: `color-mix(in srgb, ${preserves.color} 6%, transparent)`,
              }}
            >
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: preserves.color }} />
              <div>
                <p className="mono text-[10px] uppercase tracking-wider" style={{ color: preserves.color }}>
                  {preserves.label}
                </p>
                <p className="text-xs text-[var(--color-ink-dim)] mt-0.5 leading-relaxed">{preserves.note}</p>
              </div>
            </div>

            <label className="label block mb-1.5">Description</label>
            <input
              className="field mb-3"
              placeholder="e.g. PNG to JPEG for web publication"
              value={form.transform_description}
              onChange={e => setForm(f => ({ ...f, transform_description: e.target.value }))}
            />

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Tool or model used</label>
                <input
                  className="field"
                  placeholder="Real-ESRGAN"
                  value={form.transformer_model}
                  onChange={e => setForm(f => ({ ...f, transformer_model: e.target.value }))}
                />
              </div>
              <div>
                <label className="label block mb-1.5">Its provider</label>
                <input
                  className="field"
                  placeholder="xinntao"
                  value={form.transformer_provider}
                  onChange={e => setForm(f => ({ ...f, transformer_provider: e.target.value }))}
                />
              </div>
            </div>
          </Panel>
        )}

        {/* Output */}
        {parent && (
          <Panel title="Step 3 · Derived file">
            {file ? (
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-5 h-5 text-[var(--color-ink-faint)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="mono text-[11px] text-[var(--color-ink-faint)]">
                    {formatBytes(file.size)} · {file.type || 'unknown type'}
                  </p>
                </div>
                <button className="btn btn-ghost text-xs" onClick={() => setFile(null)}>Clear</button>
              </div>
            ) : (
              <div {...getRootProps()} className="dropzone" data-active={isDragActive}>
                <input {...getInputProps()} />
                <Upload className="w-5 h-5 mx-auto mb-2.5 text-[var(--color-ink-ghost)]" />
                <p className="text-sm mb-1">Drop the transformed file</p>
                <p className="text-xs text-[var(--color-ink-ghost)]">
                  Its hash becomes the output of this transformation
                </p>
              </div>
            )}
          </Panel>
        )}

        {parent && (
          <button className="btn btn-primary w-full" onClick={submit} disabled={busy || !file}>
            {busy ? <><Spinner /> Anchoring…</> : <><GitBranch className="w-4 h-4" /> Record derivation</>}
          </button>
        )}
      </div>
    </div>
  );
}
