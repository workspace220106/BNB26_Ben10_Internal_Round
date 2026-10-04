'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileCheck2,
  Lock,
  Cpu,
  User,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Blocks,
  Info,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  FileCode,
  ExternalLink,
  ChevronRight,
  Layers,
  Fingerprint,
} from 'lucide-react';
import {
  registerArtifact,
  previewTrust,
  getAttesters,
  getDemoKeys,
  attest,
  formatBytes,
  type TrustReport,
  type Attester,
} from '@/lib/api';
import {
  Panel,
  Verdict,
  Hash,
  KV,
  ScoreDial,
  EvidenceTable,
  GateList,
  Spinner,
  FadeIn,
  VerdictBadge,
} from '@/components/ui';

type StepNumber = 1 | 2 | 3 | 'mining' | 'done';

const EMPTY_FORM = {
  model_name: '',
  model_version: '',
  model_provider: '',
  prompt: '',
  generation_params: '',
  creator: '',
};

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [file, setFile] = useState<File | null>(null);
  const [clientHash, setClientHash] = useState<string>('');
  const [isHashing, setIsHashing] = useState<boolean>(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState<TrustReport | null>(null);
  const [result, setResult] = useState<{
    artifact: { id: string; sha256: string; trust_level: string; trust_score: number };
    trust: TrustReport;
    block: { index: number; hash: string; merkle_root: string; nonce: number };
  } | null>(null);

  // Compute SHA-256 fingerprint in-browser with scramble animation
  const computeFileHash = async (selectedFile: File) => {
    setIsHashing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setClientHash(hex);
    } catch {
      setClientHash('');
    } finally {
      setIsHashing(false);
    }
  };

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      const selected = accepted[0];
      setFile(selected);
      computeFileHash(selected);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  // Debounced live trust preview
  useEffect(() => {
    if (!form.model_name.trim()) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      previewTrust({
        ...form,
        prompt_hash: form.prompt ? 'preview' : '',
        sha256: clientHash || 'preview',
      })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [form, clientHash]);

  // Provenance completeness score (0 to 100)
  const calculateCompleteness = () => {
    let score = 0;
    if (form.model_name.trim()) score += 30;
    if (form.model_provider.trim()) score += 20;
    if (form.model_version.trim()) score += 15;
    if (form.prompt.trim()) score += 15;
    if (form.generation_params.trim()) score += 10;
    if (form.creator.trim()) score += 10;
    return Math.min(100, score);
  };

  const completeness = calculateCompleteness();

  const getCompletenessHint = () => {
    if (completeness < 30) {
      return {
        band: 'Unverifiable (<30)',
        note: 'Requires at least a model name to be recognized on the ledger.',
        color: 'var(--color-ink-faint)',
      };
    }
    if (completeness < 65) {
      return {
        band: 'Self-Asserted (~50)',
        note: 'With this much recorded, you will land in Self-Asserted.',
        color: 'var(--color-caution)',
      };
    }
    return {
      band: 'Self-Asserted Capped (65–74)',
      note: 'Comprehensive claim recorded. Will anchor at top of Self-Asserted (requires vetted provider key for Trusted 100).',
      color: 'var(--color-accent)',
    };
  };

  const completenessHint = getCompletenessHint();

  // Submission handler
  const handleSubmit = async () => {
    if (!file || !form.model_name.trim()) {
      toast.error('A file and a model name are required.');
      return;
    }
    if (form.generation_params.trim()) {
      try {
        JSON.parse(form.generation_params);
      } catch {
        toast.error('Generation parameters must be valid JSON.');
        return;
      }
    }

    setCurrentStep('mining');
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => {
        if (v.trim()) fd.append(k, v);
      });
      const data = await registerArtifact(fd);
      setResult(data);
      setCurrentStep('done');
      toast.success(`Anchored in block #${data.block.index}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Registration failed.');
      setCurrentStep(3);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setFile(null);
    setClientHash('');
    setForm(EMPTY_FORM);
    setResult(null);
    setPreview(null);
  };

  return (
    <FadeIn className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
      {/* ── Page Header ── */}
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 mb-2 px-2.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <p className="eyebrow text-[10px] text-[var(--color-accent)] tracking-widest uppercase">
            PROVENANCE INTAKE // CLAIM REGISTRATION
          </p>
        </div>
        <h1 className="font-display font-serif text-3xl sm:text-4xl font-normal tracking-tight mb-2 text-[var(--color-ink)]">
          Anchor a Provenance Claim
        </h1>
        <p className="text-sm text-[var(--color-ink-dim)] max-w-2xl leading-relaxed">
          The file is hashed locally in memory and its digest is committed into a mined block.
          File bytes are never permanently stored — the ledger records the immutable cryptographic
          fingerprint, not the media.
        </p>
      </header>

      {/* ── Guided 3-Step Stepper Bar ── */}
      {currentStep !== 'done' && (
        <div className="panel p-4 mb-8 bg-[var(--color-surface-1)] border-[var(--color-line)]">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 relative">
            {[
              { num: 1, title: 'Upload Artifact', subtitle: 'Compute SHA-256' },
              { num: 2, title: 'Provenance Details', subtitle: 'Model & Context' },
              { num: 3, title: 'Review & Anchor', subtitle: 'Commit to Block' },
            ].map(s => {
              const isActive = currentStep === s.num;
              const isPast =
                (typeof currentStep === 'number' && currentStep > s.num) ||
                currentStep === 'mining';

              return (
                <div
                  key={s.num}
                  className={`flex items-center gap-3 p-2.5 rounded transition-all border ${
                    isActive
                      ? 'bg-[var(--color-surface-3)] border-[var(--color-accent-line)] shadow-sm'
                      : isPast
                      ? 'bg-[var(--color-surface-2)] border-[var(--color-line-subtle)] text-[var(--color-verified)]'
                      : 'bg-transparent border-transparent text-[var(--color-ink-ghost)]'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold shrink-0 ${
                      isActive
                        ? 'bg-[var(--color-accent)] text-[#07090d]'
                        : isPast
                        ? 'bg-[var(--color-verified-dim)] text-[var(--color-verified)] border border-[var(--color-verified-line)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-ink-ghost)]'
                    }`}
                  >
                    {isPast ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <p
                      className={`text-xs font-medium truncate ${
                        isActive ? 'text-[var(--color-ink)]' : isPast ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-ink-ghost)]'
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="text-[10px] text-[var(--color-ink-ghost)] truncate">
                      {s.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: Upload & Scramble Fingerprint ── */}
      {currentStep === 1 && (
        <FadeIn>
          <div className="space-y-6">
            <Panel title="Step 1 · Select AI-Generated Artifact">
              <div
                {...getRootProps()}
                className={`dropzone p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
                  isDragActive
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
                    : 'border-[var(--color-line-strong)] hover:border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                }`}
              >
                <input {...getInputProps()} />
                <div className="w-12 h-12 rounded-full bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center mx-auto mb-3 text-[var(--color-accent)]">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium mb-1 text-[var(--color-ink)]">
                  {isDragActive
                    ? 'Drop file to compute hash…'
                    : file
                    ? 'Replace selected artifact'
                    : 'Drag & drop your AI-generated artifact here'}
                </p>
                <p className="text-xs text-[var(--color-ink-faint)] max-w-sm mx-auto">
                  Images, audio, video, text or code (PNG, JPG, MP3, WAV, TXT, etc.) · up to 50 MB
                </p>
              </div>

              {/* Live Scrambled Fingerprint Card */}
              {file && (
                <div className="mt-5 panel-inset p-4 bg-[var(--color-surface-2)] border-[var(--color-line)] rounded-lg space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded bg-[var(--color-surface-3)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-accent)] shrink-0">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-ink)] truncate">
                          {file.name}
                        </p>
                        <p className="mono text-xs text-[var(--color-ink-faint)]">
                          {formatBytes(file.size)} · {file.type || 'binary/raw'}
                        </p>
                      </div>
                    </div>

                    <button
                      className="btn btn-ghost text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-danger)]"
                      onClick={handleReset}
                    >
                      Clear File
                    </button>
                  </div>

                  {/* Scramble Hash Display */}
                  <div className="pt-2 border-t border-[var(--color-line-subtle)]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="mono text-[10px] text-[var(--color-ink-ghost)] uppercase tracking-wider flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                        LOCAL SHA-256 DIGEST:
                      </span>
                      {isHashing ? (
                        <span className="text-[10px] text-[var(--color-accent)] mono flex items-center gap-1">
                          <Spinner className="w-3 h-3" /> Computing…
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--color-verified)] mono flex items-center gap-1">
                          <Check className="w-3 h-3" /> Ready
                        </span>
                      )}
                    </div>
                    <ScrambleHashDisplay hash={clientHash} isHashing={isHashing} />
                  </div>
                </div>
              )}
            </Panel>

            {/* Stepper Navigation */}
            <div className="flex justify-end">
              <button
                className="btn btn-primary px-5 py-2.5 flex items-center gap-2"
                onClick={() => setCurrentStep(2)}
                disabled={!file || isHashing}
              >
                <span>Continue to Provenance Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Step 2: Provenance Details & Completeness Meter ── */}
      {currentStep === 2 && file && (
        <FadeIn>
          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            {/* Form Fields */}
            <div className="space-y-5">
              {/* Group 1: Model Claim */}
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    1. Model Attribution Claim
                  </span>
                }
              >
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1.5">
                      Model name <span className="text-[var(--color-danger)]">*</span>
                    </label>
                    <input
                      className="field"
                      placeholder="e.g. DALL-E 3, Midjourney v6"
                      value={form.model_name}
                      onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                      autoFocus
                    />
                    <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                      Identifies the generative architecture.
                    </p>
                  </div>

                  <div>
                    <label className="label block mb-1.5">Version</label>
                    <input
                      className="field"
                      placeholder="e.g. 3.0, 6.0, XL"
                      value={form.model_version}
                      onChange={e => setForm(f => ({ ...f, model_version: e.target.value }))}
                    />
                    <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                      Release or checkpoint identifier.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label block mb-1.5">Provider Organization</label>
                  <input
                    className="field"
                    placeholder="e.g. OpenAI, Stability AI, Midjourney"
                    value={form.model_provider}
                    onChange={e => setForm(f => ({ ...f, model_provider: e.target.value }))}
                  />
                  <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                    Must match a vetted provider attestation key for trusted corroboration.
                  </p>
                </div>
              </Panel>

              {/* Group 2: Salted Generation Context */}
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    2. Salted Generation Context
                  </span>
                }
              >
                <div className="p-3 mb-4 rounded bg-[rgba(6,182,212,0.06)] border border-[rgba(6,182,212,0.2)] flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">
                    <strong>Zero-Disclosure Proof:</strong> The prompt is salted and hashed before
                    anchoring. The raw text is discarded — preserving trade secrets and prompt
                    privacy while allowing you to cryptographically prove the exact prompt later.
                  </p>
                </div>

                <div className="mb-3">
                  <label className="label block mb-1.5">Generation Prompt</label>
                  <textarea
                    className="field resize-none h-20 text-xs"
                    placeholder="Describe the prompt used to synthesize this artifact…"
                    value={form.prompt}
                    onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label">Generation parameters (JSON)</label>
                    <button
                      type="button"
                      className="text-[10px] mono text-[var(--color-accent)] hover:underline"
                      onClick={() =>
                        setForm(f => ({
                          ...f,
                          generation_params: JSON.stringify(
                            { steps: 50, cfg_scale: 7.5, seed: 42891 },
                            null,
                            2
                          ),
                        }))
                      }
                    >
                      Fill sample params
                    </button>
                  </div>
                  <textarea
                    className="field mono text-xs resize-none h-20"
                    placeholder='{"steps": 50, "cfg_scale": 7.5, "seed": 42}'
                    value={form.generation_params}
                    onChange={e => setForm(f => ({ ...f, generation_params: e.target.value }))}
                  />
                  <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                    Valid JSON object with sampler settings, seeds, or guidance scales.
                  </p>
                </div>
              </Panel>

              {/* Group 3: Attributed Identity */}
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    3. Attributed Identity
                  </span>
                }
              >
                <div>
                  <label className="label block mb-1.5">Creator / Uploader Identifier</label>
                  <input
                    className="field"
                    placeholder="e.g. alice@example.com, artist.eth"
                    value={form.creator}
                    onChange={e => setForm(f => ({ ...f, creator: e.target.value }))}
                  />
                  <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
                    Human identity associated with this initial claim.
                  </p>
                </div>
              </Panel>

              {/* Stepper Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  className="btn btn-secondary text-xs px-4 py-2 flex items-center gap-1.5"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to File</span>
                </button>

                <button
                  className="btn btn-primary px-5 py-2 flex items-center gap-2"
                  onClick={() => setCurrentStep(3)}
                  disabled={!form.model_name.trim()}
                >
                  <span>Review & Anchor</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sidebar: Provenance Completeness Meter & Live Preview */}
            <div className="lg:sticky lg:top-24 space-y-4">
              {/* Completeness Meter */}
              <div className="panel p-4 bg-[var(--color-surface-1)] border-[var(--color-line)] shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow text-[10px] text-[var(--color-accent)] uppercase">
                    PROVENANCE COMPLETENESS
                  </span>
                  <span className="mono text-xs font-bold text-[var(--color-ink)]">
                    {completeness}%
                  </span>
                </div>

                <div className="h-2 w-full bg-[var(--color-surface-3)] rounded-full overflow-hidden mb-3">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-verified)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${completeness}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                <div className="panel-inset p-3 bg-[var(--color-surface-2)] border-[var(--color-line-subtle)] text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--color-ink)]">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>{completenessHint.band}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-ink-dim)] leading-relaxed">
                    {completenessHint.note}
                  </p>
                </div>
              </div>

              {/* Projected Trust Verdict Preview */}
              <Panel title="Projected Trust Verdict">
                {preview ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <ScoreDial score={preview.score} level={preview.level} size="sm" />
                      <div className="min-w-0">
                        <VerdictBadge level={preview.level} score={preview.score} />
                        <p className="text-xs text-[var(--color-ink-faint)] mt-1.5 leading-relaxed">
                          Updates live as you type. Anchoring seals this claim; independent attestation
                          elevates it.
                        </p>
                      </div>
                    </div>
                    <EvidenceTable factors={preview.factors} />
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-[var(--color-ink-ghost)]">
                    Enter a model name to preview trust projection.
                  </div>
                )}
              </Panel>

              {/* Why Capped Gates */}
              {preview && preview.gates.length > 0 && (
                <Panel title="Ceiling Constraints Applied">
                  <GateList gates={preview.gates} />
                </Panel>
              )}
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Step 3: Review & Commit ── */}
      {currentStep === 3 && file && (
        <FadeIn>
          <div className="max-w-2xl mx-auto space-y-6">
            <Panel title="Review Claim Before Anchoring">
              <div className="space-y-4">
                {/* Artifact Summary */}
                <div className="panel-inset p-4 bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-1">
                      ARTIFACT ASSET
                    </span>
                    <p className="text-base font-semibold text-[var(--color-ink)] truncate">
                      {file.name}
                    </p>
                    <p className="mono text-xs text-[var(--color-ink-faint)]">
                      {formatBytes(file.size)} · {file.type || 'binary'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-1">
                      PROJECTED VERDICT
                    </span>
                    <VerdictBadge level={preview?.level ?? 'self-asserted'} score={preview?.score ?? 61} />
                  </div>
                </div>

                {/* Fingerprint */}
                <div className="panel-inset p-3 bg-[var(--color-surface-2)]">
                  <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-1">
                    SHA-256 CONTENT FINGERPRINT
                  </span>
                  <div className="mono text-xs text-[var(--color-accent)] break-all bg-black/40 p-2 rounded">
                    {clientHash}
                  </div>
                </div>

                {/* Key KV Metadata */}
                <div>
                  <span className="label text-[10px] text-[var(--color-ink-ghost)] block mb-2">
                    DECLARED PROVENANCE METADATA
                  </span>
                  <KV
                    items={[
                      { k: 'Model Claim', v: form.model_name },
                      { k: 'Version', v: form.model_version || '—' },
                      { k: 'Provider', v: form.model_provider || '—' },
                      { k: 'Creator', v: form.creator || 'anonymous' },
                      {
                        k: 'Salted Prompt',
                        v: form.prompt ? (
                          <span className="mono text-xs text-[var(--color-verified)]">
                            Salted hash will be committed
                          </span>
                        ) : (
                          'not provided'
                        ),
                      },
                      {
                        k: 'Parameters',
                        v: form.generation_params ? (
                          <span className="mono text-xs">JSON recorded</span>
                        ) : (
                          'not provided'
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            </Panel>

            {/* Stepper Navigation */}
            <div className="flex items-center justify-between">
              <button
                className="btn btn-secondary text-xs px-4 py-2 flex items-center gap-1.5"
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>

              <button
                className="btn btn-primary px-6 py-2.5 text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                onClick={handleSubmit}
              >
                <Blocks className="w-4 h-4" />
                <span>Mine Block & Anchor Claim</span>
              </button>
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Mining / Anchoring Overlay State ── */}
      {currentStep === 'mining' && (
        <FadeIn>
          <div className="panel max-w-lg mx-auto p-12 text-center bg-[var(--color-surface-1)] border-[var(--color-line)] shadow-2xl">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-full bg-[var(--color-surface-2)] border border-[var(--color-accent-line)] text-[var(--color-accent)] animate-pulse">
              <Spinner className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-ink)] mb-2">
              Mining Proof-of-Work Block…
            </h2>
            <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed max-w-sm mx-auto mb-6">
              Hashing content, assembling Merkle tree leaves, and grinding block nonces against
              the target difficulty.
            </p>
            <div className="panel-inset h-1.5 w-48 mx-auto rounded-full overflow-hidden bg-[var(--color-surface-3)]">
              <div className="h-full bg-[var(--color-accent)] animate-[scanning_1.4s_ease-in-out_infinite]" />
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Success Receipt State ── */}
      {currentStep === 'done' && result && (
        <FadeIn>
          <DoneReceipt result={result} onReset={handleReset} />
        </FadeIn>
      )}
    </FadeIn>
  );
}

// ─── Scramble / Typing Animation for Hash ─────────────────────────────────────

function ScrambleHashDisplay({ hash, isHashing }: { hash: string; isHashing: boolean }) {
  const [displayedText, setDisplayedText] = useState(hash);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hash || isHashing) return;

    // Fast character reveal effect
    let frame = 0;
    const totalFrames = 8;
    const hexChars = '0123456789abcdef';

    const interval = setInterval(() => {
      frame++;
      if (frame >= totalFrames) {
        setDisplayedText(hash);
        clearInterval(interval);
      } else {
        const progress = frame / totalFrames;
        const revealedCount = Math.floor(hash.length * progress);
        const scrambled =
          hash.slice(0, revealedCount) +
          Array.from({ length: hash.length - revealedCount }, () =>
            hexChars[Math.floor(Math.random() * hexChars.length)]
          ).join('');
        setDisplayedText(scrambled);
      }
    }, 28);

    return () => clearInterval(interval);
  }, [hash, isHashing]);

  const copy = () => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopied(true);
    toast.success('SHA-256 digest copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-black/50 p-2.5 rounded border border-[rgba(255,255,255,0.06)]">
      <span className="mono text-xs text-[var(--color-accent)] break-all select-all font-medium">
        {displayedText || 'Computing SHA-256 fingerprint…'}
      </span>
      <button
        type="button"
        className="btn btn-ghost text-xs p-1 text-[var(--color-ink-ghost)] hover:text-[var(--color-ink)] shrink-0"
        onClick={copy}
        title="Copy Hash"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[var(--color-verified)]" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Success Receipt Component ───────────────────────────────────────────────

function DoneReceipt({
  result,
  onReset,
}: {
  result: {
    artifact: { id: string; sha256: string; trust_level: string; trust_score: number };
    trust: TrustReport;
    block: { index: number; hash: string; merkle_root: string; nonce: number };
  };
  onReset: () => void;
}) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Big Stamp */}
      <div className="panel p-6 bg-[rgba(16,185,129,0.04)] border-[rgba(16,185,129,0.35)] shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.4)] flex items-center justify-center text-[var(--color-verified)] shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="mono text-[10px] text-[var(--color-verified)] uppercase tracking-wider font-semibold">
                BLOCKCHAIN COMMIT CONFIRMED
              </span>
              <h2 className="text-2xl font-bold text-[var(--color-ink)] mt-0.5">
                Anchored in Block #{result.block.index}
              </h2>
              <p className="text-xs text-[var(--color-ink-dim)] mt-1 max-w-lg leading-relaxed">
                The artifact claim is permanently sealed on the Merkle chain. It cannot be mutated
                without invalidating block #{result.block.index} and all succeeding blocks.
              </p>
            </div>
          </div>
          <ScoreDial score={result.artifact.trust_score} level={result.artifact.trust_level} size="lg" />
        </div>
      </div>

      {/* Cryptographic Receipt */}
      <Panel
        title="Anchored Blockchain Receipt"
        actions={
          <Link
            href="/ledger"
            className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1 font-mono"
          >
            <span>View in Block Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        }
      >
        <KV
          items={[
            { k: 'Artifact ID', v: <Hash value={result.artifact.id} full /> },
            { k: 'Content SHA-256', v: <Hash value={result.artifact.sha256} full /> },
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
            { k: 'Block Hash', v: <Hash value={result.block.hash} full /> },
            { k: 'Merkle Root', v: <Hash value={result.block.merkle_root} full /> },
            { k: 'PoW Nonce', v: <span className="mono tnum">{result.block.nonce}</span> },
            {
              k: 'Initial Verdict',
              v: <VerdictBadge level={result.artifact.trust_level} score={result.artifact.trust_score} />,
            },
          ]}
        />
      </Panel>

      {/* Ceiling Gates if any */}
      {result.trust.gates.length > 0 && (
        <Panel title="Ceiling Constraints on Initial Claim">
          <GateList gates={result.trust.gates} />
          <AttestPrompt artifactId={result.artifact.id} />
        </Panel>
      )}

      {/* Navigation Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button className="btn btn-ghost text-xs flex items-center gap-1.5" onClick={onReset}>
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Register Another Artifact</span>
        </button>

        <div className="flex items-center gap-3">
          <Link href={`/derive?parent=${result.artifact.id}`} className="btn btn-secondary text-xs">
            <span>Register a Derivation</span>
          </Link>
          <Link
            href={`/artifact/${result.artifact.id}`}
            className="btn btn-primary text-xs flex items-center gap-1.5"
          >
            <span>Open Full Evidence Dossier</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Attestation Prompt for Provider Key ─────────────────────────────────────

function AttestPrompt({ artifactId }: { artifactId: string }) {
  const [attesters, setAttesters] = useState<Attester[]>([]);
  const [demoKeys, setDemoKeys] = useState<Record<string, { attester_id: string; private_key: string }>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    if (open) {
      if (!attesters.length) getAttesters().then(setAttesters).catch(() => {});
      getDemoKeys().then(setDemoKeys).catch(() => {});
    }
  }, [open, attesters.length]);

  const selectedAttester = attesters.find(a => a.id === chosen);
  const matchingDemoKey = selectedAttester ? demoKeys[selectedAttester.name] : null;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await attest({
        artifact_id: artifactId,
        attester_id: chosen,
        private_key: key,
      });
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
      <button
        className="btn btn-ghost text-xs mt-3 text-[var(--color-accent)] hover:underline flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        <span>How would this claim cross into Trusted (100)?</span>
        <ChevronRight className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="mt-4 panel-inset p-4 bg-[var(--color-surface-2)] rounded-lg">
      <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed mb-3">
        Only an out-of-band vetted provider key can lift this claim to Trusted (100). For demo
        purposes, seed provider keys are available to simulate generation-time signing:
      </p>

      <div className="space-y-3">
        <div>
          <label className="label block mb-1">Vetted Provider Authority</label>
          <select
            className="field text-xs mb-2"
            value={chosen}
            onChange={e => {
              setChosen(e.target.value);
              setKey('');
            }}
          >
            <option value="">Select a registered provider…</option>
            {attesters.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.kind}
                {a.revoked_at ? ' (revoked)' : ''}
              </option>
            ))}
          </select>
        </div>

        {matchingDemoKey && (
          <div className="p-2 bg-[var(--color-surface-3)] rounded flex items-center justify-between text-xs">
            <span className="text-[var(--color-verified)] text-[11px]">
              Seeded demo key ready for {selectedAttester?.name}
            </span>
            <button
              type="button"
              className="btn btn-secondary text-[11px] px-2 py-0.5"
              onClick={() => setKey(matchingDemoKey.private_key)}
            >
              Auto-fill key
            </button>
          </div>
        )}

        <div>
          <label className="label block mb-1">Private Key (Ed25519 PEM)</label>
          <textarea
            className="field mono text-xs resize-none h-20"
            placeholder="-----BEGIN PRIVATE KEY-----"
            value={key}
            onChange={e => setKey(e.target.value)}
          />
        </div>

        <button
          className="btn btn-secondary text-xs px-4 py-2 flex items-center gap-1.5"
          onClick={submit}
          disabled={busy || !chosen || !key.trim()}
        >
          {busy ? <Spinner className="w-3 h-3" /> : <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-verified)]" />}
          <span>Sign Provider Attestation</span>
        </button>
      </div>
    </div>
  );
}
