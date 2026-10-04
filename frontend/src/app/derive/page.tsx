'use client';

import { Suspense, useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  Upload,
  FileCheck2,
  Search,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Maximize2,
  Crop,
  Wand2,
  Palette,
  Volume2,
  Layers,
  Sparkles,
  ExternalLink,
  Check,
  Copy,
  Hash as HashIcon,
  Fingerprint,
  RotateCcw,
} from 'lucide-react';
import {
  getLedgerArtifacts,
  getTransformTypes,
  registerTransformation,
  getArtifact,
  formatBytes,
  fileKind,
  type Artifact,
} from '@/lib/api';
import { Panel, Verdict, Hash, KV, Spinner, Empty, FadeIn, Tabs, VerdictBadge } from '@/components/ui';

// ─── Transformation Types Metadata ───────────────────────────────────────────

const TRANSFORM_ICONS: Record<string, typeof Layers> = {
  're-encoding': Layers,
  resizing: Maximize2,
  cropping: Crop,
  inpainting: Wand2,
  'style-transfer': Palette,
  'audio-mastering': Volume2,
};

const PRESERVES_META: Record<string, { label: string; color: string; note: string }> = {
  full: {
    label: 'Preserves Provenance',
    color: 'var(--color-verified)',
    note: 'Mechanical transformation. The resulting media retains the original provenance lineage and model attribution.',
  },
  partial: {
    label: 'Partially Preserves',
    color: 'var(--color-caution)',
    note: 'Generative contribution involved. The ledger records both the original creator and the second system.',
  },
  unknown: {
    label: 'Unknown Effect',
    color: 'var(--color-ink-faint)',
    note: 'The ledger records the link without asserting full provenance survival.',
  },
};

export default function DerivePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 text-[var(--color-accent)]" />
          <p className="text-xs mono text-[var(--color-ink-dim)]">Loading Derivation Lab…</p>
        </div>
      }
    >
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

  // Child artifact input state
  const [inputMode, setInputMode] = useState<'file' | 'hash'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [childHash, setChildHash] = useState<string>('');
  const [isHashingChild, setIsHashingChild] = useState<boolean>(false);
  const [declaredOutputHash, setDeclaredOutputHash] = useState('');
  const [declaredFilename, setDeclaredFilename] = useState('');

  // Form metadata
  const [form, setForm] = useState({
    transform_type: 're-encoding',
    transform_description: '',
    transformer_model: '',
    transformer_provider: '',
  });

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    artifact: Artifact;
    transformation: { transform_type: string };
    block: { index: number; hash: string };
    preserves: string;
  } | null>(null);

  // Load available transform types from API
  useEffect(() => {
    getTransformTypes()
      .then(data => setTypes(data))
      .catch(() => {});
  }, []);

  // Pre-select parent if passed via ?parent query param
  useEffect(() => {
    if (!presetParent) return;
    getArtifact(presetParent)
      .then(({ artifact }) => {
        if (artifact) setParent(artifact);
      })
      .catch(() => {});
  }, [presetParent]);

  // Search candidate parent artifacts
  useEffect(() => {
    if (parent) return;
    const timer = setTimeout(() => {
      getLedgerArtifacts({ search, limit: 8 })
        .then(({ artifacts }) => setCandidates(artifacts))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search, parent]);

  // Compute child hash when file is dropped
  const computeChildHash = async (selectedFile: File) => {
    setIsHashingChild(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setChildHash(hex);
    } catch {
      setChildHash('');
    } finally {
      setIsHashingChild(false);
    }
  };

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      const f = accepted[0];
      setFile(f);
      computeChildHash(f);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  // Effective output hash (from dropped file or manual input)
  const effectiveChildHash = useMemo(() => {
    if (inputMode === 'file') return childHash;
    return declaredOutputHash.trim().toLowerCase();
  }, [inputMode, childHash, declaredOutputHash]);

  // Cryptographic Link Validity Evaluation
  const linkValidity = useMemo(() => {
    if (!parent) return { status: 'idle', message: 'Select a parent artifact to establish the origin.' };
    if (!effectiveChildHash) return { status: 'idle', message: 'Upload the derived file or provide its SHA-256 digest.' };

    if (!/^[a-f0-9]{64}$/.test(effectiveChildHash)) {
      return { status: 'invalid', message: 'Derived digest must be a valid 64-character hexadecimal SHA-256 hash.' };
    }

    if (parent.sha256.toLowerCase() === effectiveChildHash.toLowerCase()) {
      return {
        status: 'invalid',
        message: 'Invalid link: Derived hash matches parent hash exactly. A transformation must yield distinct output bytes.',
      };
    }

    return {
      status: 'valid',
      message: 'Valid cryptographic link. Distinct fingerprints confirmed. Lineage chain will connect without mutation.',
    };
  }, [parent, effectiveChildHash]);

  // Submit handler
  const submit = async () => {
    if (!parent) {
      toast.error('Select a parent artifact first.');
      return;
    }
    if (linkValidity.status !== 'valid') {
      toast.error(linkValidity.message);
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      if (inputMode === 'file' && file) {
        fd.append('file', file);
      } else {
        fd.append('output_hash', effectiveChildHash);
        if (declaredFilename.trim()) {
          fd.append('filename', declaredFilename.trim());
        }
      }
      fd.append('parent_id', parent.id);
      Object.entries(form).forEach(([k, v]) => {
        if (v.trim()) fd.append(k, v);
      });

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

  const selectedType = types.find(t => t.key === form.transform_type) || {
    key: form.transform_type,
    label: form.transform_type,
    preserves: 'full',
  };
  const preservesInfo = PRESERVES_META[selectedType.preserves] || PRESERVES_META.unknown;

  // ── Success State View ──
  if (result) {
    return (
      <FadeIn className="max-w-[840px] mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="panel p-6 bg-[rgba(16,185,129,0.05)] border-[rgba(16,185,129,0.35)] shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.4)] flex items-center justify-center text-[var(--color-verified)] shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="mono text-[10px] text-[var(--color-verified)] uppercase tracking-wider font-semibold">
                LINEAGE CHAIN ESTABLISHED
              </span>
              <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-0.5">
                Derivation Anchored in Block #{result.block.index}
              </h1>
              <p className="text-xs text-[var(--color-ink-dim)] mt-1 max-w-lg leading-relaxed">
                The derived file has a distinct content hash, but verification will now resolve it
                back to its original parent artifact through this cryptographic custody link.
              </p>
            </div>
          </div>
        </div>

        {/* Visual Lineage Receipt */}
        <Panel title="Anchored Lineage Receipt">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="panel-inset p-3 bg-[var(--color-surface-2)]">
                <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-1">
                  PARENT ARTIFACT (ORIGIN)
                </span>
                <p className="text-sm font-semibold truncate text-[var(--color-ink)]">
                  {parent?.filename}
                </p>
                <div className="mt-1">
                  <Hash value={parent?.sha256 || ''} full />
                </div>
              </div>

              <div className="panel-inset p-3 bg-[var(--color-surface-2)]">
                <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-1">
                  DERIVED CHILD ARTIFACT
                </span>
                <p className="text-sm font-semibold truncate text-[var(--color-ink)]">
                  {result.artifact.filename}
                </p>
                <div className="mt-1">
                  <Hash value={result.artifact.sha256} full />
                </div>
              </div>
            </div>

            <KV
              items={[
                { k: 'Transformation Link', v: result.transformation.transform_type },
                {
                  k: 'Mined Block',
                  v: (
                    <Link
                      href="/ledger"
                      className="mono font-bold text-[var(--color-accent)] hover:underline flex items-center gap-1"
                    >
                      <span>Block #{result.block.index}</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                  ),
                },
                {
                  k: 'Inherited Verdict',
                  v: (
                    <VerdictBadge
                      level={result.artifact.trust_level}
                      score={result.artifact.trust_score}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Panel>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            className="btn btn-ghost text-xs flex items-center gap-1.5"
            onClick={() => {
              setResult(null);
              setFile(null);
              setChildHash('');
              setDeclaredOutputHash('');
              setParent(null);
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Record Another Derivation</span>
          </button>

          <div className="flex items-center gap-3">
            <Link href="/ledger" className="btn btn-secondary text-xs">
              <span>View in Block Explorer</span>
            </Link>
            <Link
              href={`/artifact/${result.artifact.id}`}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <span>View Chain of Custody</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </FadeIn>
    );
  }

  // ── Main Guided Form View ──
  return (
    <FadeIn className="max-w-[1040px] mx-auto px-4 sm:px-6 py-10">
      {/* ── Page Header ── */}
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 mb-2 px-2.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <p className="eyebrow text-[10px] text-[var(--color-accent)] tracking-widest uppercase">
            LINEAGE AUDIT // CHAIN OF CUSTODY REGISTRATION
          </p>
        </div>
        <h1 className="font-display font-serif text-3xl sm:text-4xl font-normal tracking-tight mb-2 text-[var(--color-ink)]">
          Register a Derivation
        </h1>
        <p className="text-sm text-[var(--color-ink-dim)] max-w-2xl leading-relaxed">
          Transformations link a new content hash to the parent artifact it originated from. When an
          investigator verifies the derived file later, the ledger resolves it back to the original claim.
        </p>
      </header>

      {/* ── Visual "Parent to Child" Flow Architecture ── */}
      <div className="panel p-4 mb-8 bg-gradient-to-r from-[var(--color-surface-2)] via-[var(--color-surface-1)] to-[var(--color-surface-2)] border-[var(--color-line)] shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Node 1: Parent */}
          <div
            className={`p-3 rounded border transition-all ${
              parent
                ? 'bg-[rgba(6,182,212,0.06)] border-[rgba(6,182,212,0.3)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-line-subtle)]'
            }`}
          >
            <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-accent)] block mb-1">
              [ORIGIN // PARENT]
            </span>
            <p className="text-xs font-semibold text-[var(--color-ink)] truncate">
              {parent ? parent.filename : 'No parent selected'}
            </p>
            <p className="mono text-[10px] text-[var(--color-ink-faint)] truncate mt-0.5">
              {parent ? parent.sha256.slice(0, 16) + '…' : 'Awaiting selection'}
            </p>
          </div>

          {/* Node 2: Transformation Connector */}
          <div className="flex flex-col items-center justify-center text-center px-2">
            <span className="mono text-[10px] uppercase text-[var(--color-ink-ghost)] mb-1 flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-[var(--color-accent)]" />
              {form.transform_type}
            </span>
            <div className="flex items-center gap-2 w-full justify-center">
              <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-verified)]" />
              <div className="w-6 h-6 rounded-full bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-accent)] shrink-0">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-verified)]" />
            </div>
            <span className="mono text-[9px] text-[var(--color-verified)] mt-1">
              {preservesInfo.label}
            </span>
          </div>

          {/* Node 3: Child */}
          <div
            className={`p-3 rounded border transition-all ${
              effectiveChildHash
                ? linkValidity.status === 'valid'
                  ? 'bg-[rgba(16,185,129,0.06)] border-[rgba(16,185,129,0.3)]'
                  : 'bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.3)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-line-subtle)]'
            }`}
          >
            <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-verified)] block mb-1">
              [OUTPUT // DERIVED]
            </span>
            <p className="text-xs font-semibold text-[var(--color-ink)] truncate">
              {file ? file.name : declaredFilename || 'No derived file'}
            </p>
            <p className="mono text-[10px] text-[var(--color-ink-faint)] truncate mt-0.5">
              {effectiveChildHash ? effectiveChildHash.slice(0, 16) + '…' : 'Awaiting output hash'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Step 1: Parent Artifact Selector ── */}
        <Panel
          title="Step 1 · Pick Parent Artifact"
          actions={
            parent && (
              <button
                className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1 font-mono"
                onClick={() => setParent(null)}
              >
                <span>Change Parent</span>
              </button>
            )
          }
        >
          {parent ? (
            <div className="panel-inset p-4 bg-[var(--color-surface-2)] border-[var(--color-line)] rounded-lg flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-accent)] shrink-0">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--color-ink)] truncate">
                      {parent.filename}
                    </p>
                    <span className="mono text-[10px] text-[var(--color-ink-faint)] px-1.5 py-0.5 rounded bg-[var(--color-surface-3)]">
                      {fileKind(parent.filetype)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-ink-faint)] mt-0.5">
                    Model: <span className="text-[var(--color-ink-dim)]">{parent.model_name}</span>
                    {parent.model_provider && ` (${parent.model_provider})`} · Creator:{' '}
                    <span className="text-[var(--color-ink-dim)]">{parent.creator || 'anonymous'}</span>
                  </p>
                  <div className="mt-2">
                    <Hash value={parent.sha256} full />
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <VerdictBadge level={parent.trust_level} score={parent.trust_score} />
                <button
                  className="btn btn-secondary text-xs px-2.5 py-1.5"
                  onClick={() => setParent(null)}
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-ink-ghost)]" />
                <input
                  className="field pl-9 text-xs"
                  placeholder="Search registered artifacts by filename, model, or SHA-256 hash…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {candidates.length === 0 ? (
                <Empty
                  icon={Search}
                  title="No candidate artifacts found"
                  hint="Type a search query or anchor a new artifact on /register."
                  action={
                    search ? (
                      <button
                        type="button"
                        className="btn btn-secondary text-xs mt-3"
                        onClick={() => setSearch('')}
                      >
                        Clear search query
                      </button>
                    ) : (
                      <Link href="/register" className="btn btn-secondary text-xs mt-3">
                        Register an artifact first
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="grid sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {candidates.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      className="panel-inset p-3 text-left hover:border-[var(--color-accent-line)] hover:bg-[var(--color-surface-2)] transition-all rounded-lg group flex items-start justify-between gap-3"
                      onClick={() => setParent(a)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[var(--color-ink)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {a.filename}
                        </p>
                        <p className="text-[11px] text-[var(--color-ink-faint)] truncate mt-0.5">
                          {a.model_name}
                          {a.model_provider ? ` · ${a.model_provider}` : ''}
                        </p>
                        <p className="mono text-[10px] text-[var(--color-ink-ghost)] truncate mt-1">
                          {a.sha256.slice(0, 18)}…
                        </p>
                      </div>
                      <VerdictBadge level={a.trust_level} score={a.trust_score} showIcon={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* ── Step 2: Transformation Type as Icon Cards ── */}
        <Panel title="Step 2 · Transformation Type & Pipeline">
          <div className="space-y-4">
            <label className="label block mb-1">Select Transformation Operation</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  key: 're-encoding',
                  label: 'Re-encoding',
                  icon: Layers,
                  desc: 'Format conversion (PNG, JPEG, WebP)',
                  preserves: 'full',
                },
                {
                  key: 'resizing',
                  label: 'Resizing / Upscale',
                  icon: Maximize2,
                  desc: 'Geometric scaling & super-res',
                  preserves: 'full',
                },
                {
                  key: 'cropping',
                  label: 'Cropping',
                  icon: Crop,
                  desc: 'Framing or aspect ratio trim',
                  preserves: 'full',
                },
                {
                  key: 'inpainting',
                  label: 'Inpainting',
                  icon: Wand2,
                  desc: 'Generative context refill',
                  preserves: 'partial',
                },
                {
                  key: 'style-transfer',
                  label: 'Style Transfer',
                  icon: Palette,
                  desc: 'Neural texture / aesthetic shift',
                  preserves: 'partial',
                },
                {
                  key: 'audio-mastering',
                  label: 'Audio Mastering',
                  icon: Volume2,
                  desc: 'EQ, normalisation & bitrate',
                  preserves: 'full',
                },
              ].map(t => {
                const IconComponent = t.icon;
                const isSelected = form.transform_type === t.key;
                const preservesBadge = PRESERVES_META[t.preserves] || PRESERVES_META.unknown;

                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, transform_type: t.key }))}
                    className={`panel-inset p-3.5 text-left rounded-lg transition-all border ${
                      isSelected
                        ? 'bg-[var(--color-surface-3)] border-[var(--color-accent)] shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-[var(--color-surface-2)] border-[var(--color-line-subtle)] hover:border-[var(--color-line)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center ${
                          isSelected
                            ? 'bg-[var(--color-accent)] text-[#07090d]'
                            : 'bg-[var(--color-surface-3)] text-[var(--color-ink-dim)]'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span
                        className="mono text-[9px] uppercase px-1.5 py-0.5 rounded font-medium"
                        style={{
                          color: preservesBadge.color,
                          backgroundColor: `color-mix(in srgb, ${preservesBadge.color} 10%, transparent)`,
                        }}
                      >
                        {t.preserves}
                      </span>
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        isSelected ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-dim)]'
                      }`}
                    >
                      {t.label}
                    </p>
                    <p className="text-[10px] text-[var(--color-ink-ghost)] mt-1 leading-snug">
                      {t.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Preserves Provenance Policy Alert */}
            <div
              className="p-3 rounded-lg border flex items-start gap-2.5"
              style={{
                borderColor: `color-mix(in srgb, ${preservesInfo.color} 30%, transparent)`,
                background: `color-mix(in srgb, ${preservesInfo.color} 5%, transparent)`,
              }}
            >
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: preservesInfo.color }} />
              <div>
                <p className="mono text-[10px] uppercase font-bold tracking-wider" style={{ color: preservesInfo.color }}>
                  {preservesInfo.label}
                </p>
                <p className="text-xs text-[var(--color-ink-dim)] mt-0.5 leading-relaxed">
                  {preservesInfo.note}
                </p>
              </div>
            </div>

            {/* Additional Parameters */}
            <div className="grid sm:grid-cols-3 gap-3 pt-2">
              <div className="sm:col-span-1">
                <label className="label block mb-1">Description</label>
                <input
                  className="field text-xs"
                  placeholder="e.g. 4x Super-resolution to 2048px"
                  value={form.transform_description}
                  onChange={e => setForm(f => ({ ...f, transform_description: e.target.value }))}
                />
              </div>

              <div>
                <label className="label block mb-1">Tool / Model Used</label>
                <input
                  className="field text-xs"
                  placeholder="e.g. Real-ESRGAN, FFmpeg"
                  value={form.transformer_model}
                  onChange={e => setForm(f => ({ ...f, transformer_model: e.target.value }))}
                />
              </div>

              <div>
                <label className="label block mb-1">Tool Provider</label>
                <input
                  className="field text-xs"
                  placeholder="e.g. xinntao, VideoLAN"
                  value={form.transformer_provider}
                  onChange={e => setForm(f => ({ ...f, transformer_provider: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Step 3: Derived Artifact Output ── */}
        <Panel
          title="Step 3 · Derived Artifact Output"
          actions={
            <Tabs<'file' | 'hash'>
              tabs={[
                { id: 'file', label: 'File Upload', icon: Upload },
                { id: 'hash', label: 'Direct SHA-256 Digest', icon: HashIcon },
              ]}
              activeTab={inputMode}
              onChange={setInputMode}
            />
          }
        >
          {inputMode === 'file' ? (
            file ? (
              <div className="panel-inset p-4 bg-[var(--color-surface-2)] rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-accent)] shrink-0">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-ink)] truncate">
                      {file.name}
                    </p>
                    <p className="mono text-xs text-[var(--color-ink-faint)]">
                      {formatBytes(file.size)} · {file.type || 'binary'}
                    </p>
                    <div className="mt-1">
                      <Hash value={childHash || 'Computing…'} full />
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-ghost text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-danger)]"
                  onClick={() => {
                    setFile(null);
                    setChildHash('');
                  }}
                >
                  Clear File
                </button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`dropzone p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
                  isDragActive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
                    : 'border-[var(--color-line-strong)] hover:border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--color-ink-ghost)]" />
                <p className="text-sm font-medium text-[var(--color-ink)] mb-1">
                  {isDragActive ? 'Drop derived file…' : 'Drop transformed output file here'}
                </p>
                <p className="text-xs text-[var(--color-ink-ghost)]">
                  Its calculated cryptographic hash becomes the output of this lineage node
                </p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="label block mb-1">Output SHA-256 Digest</label>
                <input
                  className="field mono text-xs"
                  placeholder="64-character hexadecimal SHA-256 hash"
                  value={declaredOutputHash}
                  onChange={e => setDeclaredOutputHash(e.target.value)}
                />
                <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                  Directly declare the output hash if the derived file is hosted elsewhere.
                </p>
              </div>

              <div>
                <label className="label block mb-1">Derived Filename (optional)</label>
                <input
                  className="field text-xs"
                  placeholder={parent ? `${parent.filename} (derived)` : 'output.png'}
                  value={declaredFilename}
                  onChange={e => setDeclaredFilename(e.target.value)}
                />
              </div>
            </div>
          )}
        </Panel>

        {/* ── Live Fingerprint Comparison & Link Validity Bar ── */}
        <div
          className={`panel p-5 border rounded-lg transition-all ${
            linkValidity.status === 'valid'
              ? 'bg-[rgba(16,185,129,0.06)] border-[rgba(16,185,129,0.4)] shadow-[0_0_16px_rgba(16,185,129,0.12)]'
              : linkValidity.status === 'invalid'
              ? 'bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.4)]'
              : 'bg-[var(--color-surface-2)] border-[var(--color-line)]'
          }`}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {linkValidity.status === 'valid' ? (
                <CheckCircle2 className="w-5 h-5 text-[var(--color-verified)]" />
              ) : linkValidity.status === 'invalid' ? (
                <XCircle className="w-5 h-5 text-[var(--color-danger)]" />
              ) : (
                <Fingerprint className="w-5 h-5 text-[var(--color-accent)]" />
              )}
              <span
                className="mono text-xs font-bold tracking-wider uppercase"
                style={{
                  color:
                    linkValidity.status === 'valid'
                      ? 'var(--color-verified)'
                      : linkValidity.status === 'invalid'
                      ? 'var(--color-danger)'
                      : 'var(--color-ink-dim)',
                }}
              >
                {linkValidity.status === 'valid'
                  ? 'PASS: VALID CRYPTOGRAPHIC LINK'
                  : linkValidity.status === 'invalid'
                  ? 'FAIL: INVALID DERIVATION LINK'
                  : 'AWAITING PARENT & DERIVED FINGERPRINTS'}
              </span>
            </div>
            <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
              SHA-256 INTEGRITY PRE-CHECK
            </span>
          </div>

          {/* Fingerprint Side-by-Side Comparison */}
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="p-3 bg-black/40 rounded border border-[rgba(255,255,255,0.05)]">
              <span className="mono text-[10px] text-[var(--color-accent)] block mb-1 uppercase font-semibold">
                PARENT INPUT DIGEST
              </span>
              <p className="mono text-xs text-[var(--color-ink)] break-all">
                {parent ? parent.sha256 : '—'}
              </p>
            </div>

            <div className="p-3 bg-black/40 rounded border border-[rgba(255,255,255,0.05)]">
              <span className="mono text-[10px] text-[var(--color-verified)] block mb-1 uppercase font-semibold">
                DERIVED OUTPUT DIGEST
              </span>
              <p className="mono text-xs text-[var(--color-ink)] break-all">
                {effectiveChildHash || '—'}
              </p>
            </div>
          </div>

          <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">
            {linkValidity.message}
          </p>
        </div>

        {/* ── Submit Action ── */}
        <div className="flex justify-end pt-2">
          <button
            className="btn btn-primary px-8 py-3 text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
            onClick={submit}
            disabled={busy || linkValidity.status !== 'valid'}
          >
            {busy ? (
              <>
                <Spinner className="w-4 h-4" />
                <span>Anchoring Lineage to Block…</span>
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4" />
                <span>Anchor Derivation Link</span>
                <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
              </>
            )}
          </button>
        </div>
      </div>
    </FadeIn>
  );
}
