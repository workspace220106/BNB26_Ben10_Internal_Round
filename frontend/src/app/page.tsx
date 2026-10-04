'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useInView, motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Search, Upload, GitBranch, ShieldAlert, Blocks, Check, Minus, X,
  FileCheck2, ShieldCheck, Key, Lock, Cpu, Sparkles, Sliders, Play, RefreshCw,
  AlertTriangle, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { getLedgerStats, relativeTime, type LedgerStats } from '@/lib/api';
import { Verdict, Hash, FadeIn, Card } from '@/components/ui';

export default function HomePage() {
  const [stats, setStats] = useState<LedgerStats | null>(null);

  useEffect(() => {
    getLedgerStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="overflow-hidden">
      {/* ── Section 1: Hero with Chain of Custody Graphic ────────────────── */}
      <section className="relative border-b border-[var(--color-line)] pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-8 items-center">

            {/* Left Column: Authoritative Editorial Copy */}
            <FadeIn duration={0.3}>
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-[4px] border border-[var(--color-accent-line)] bg-[var(--color-accent-dim)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                  <p className="eyebrow text-[10px] tracking-wider text-[var(--color-accent)]">
                    CASE FILE // CRYPTOGRAPHIC PROVENANCE LAB
                  </p>
                </div>

                <h1 className="font-display font-serif text-4xl sm:text-5xl lg:text-[3.85rem] font-normal leading-[1.08] tracking-[-0.015em] mb-6 text-[var(--color-ink)]">
                  A signature proves who made a claim.
                  <br />
                  <span className="text-[var(--color-ink-faint)]">
                    It does not prove the model made the file.
                  </span>
                </h1>

                <p className="text-base text-[var(--color-ink-dim)] leading-relaxed max-w-xl mb-9">
                  ModelLedger records where AI-generated content came from and what happened to it afterwards — then tells you how much of that record is actually supported by evidence. Claims that nobody independent corroborates stay marked as assertions, however complete they look.
                </p>

                {/* CTA Action Row: Primary CTA is brightest element */}
                <div className="flex flex-wrap items-center gap-3.5">
                  <Link
                    href="/verify"
                    className="btn bg-[#00f0ff] hover:bg-[#38f8ff] text-[#05070b] font-bold text-sm px-6 py-3 rounded-[4px] shadow-[0_0_25px_rgba(0,240,255,0.55),0_0_50px_rgba(0,240,255,0.25)] hover:shadow-[0_0_35px_rgba(0,240,255,0.85),0_0_70px_rgba(0,240,255,0.45)] transition-all duration-200 flex items-center gap-2.5 ring-1 ring-cyan-200 hover:scale-[1.02] cursor-pointer"
                  >
                    <Search className="w-4 h-4 stroke-[2.5]" />
                    <span>Verify an artifact</span>
                  </Link>

                  <Link href="/register" className="btn btn-secondary text-sm px-5 py-2.5">
                    <Upload className="w-4 h-4" />
                    <span>Register</span>
                  </Link>

                  <Link href="/adversarial" className="btn btn-ghost text-sm px-4 py-2.5 group">
                    <ShieldAlert className="w-4 h-4 text-[var(--color-caution)]" />
                    <span>Try to break it</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* Right Column: Hero Visual - Animated Chain of Custody */}
            <FadeIn delay={0.15} duration={0.35}>
              <ChainOfCustodyHero />
            </FadeIn>

          </div>
        </div>
      </section>

      {/* ── Section 2: Animated Stats Strip ───────────────────────────────── */}
      <section className="border-b border-[var(--color-line)] bg-[var(--color-surface)]/70 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-[var(--color-line)]">
          {[
            { label: 'Artifacts', value: stats?.totalArtifacts, sub: 'committed records' },
            { label: 'Blocks', value: stats?.totalBlocks, sub: 'difficulty target 00' },
            { label: 'Transformations', value: stats?.totalTransformations, sub: 'lineage derivations' },
            { label: 'Verifications', value: stats?.totalVerifications, sub: 'forensic audits' },
            { label: 'Vetted attesters', value: stats?.totalAttesters, sub: 'trusted keys' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="p-5 flex flex-col justify-between">
              <div>
                <span className="label text-[10px] block mb-1 text-[var(--color-ink-faint)] uppercase">{label}</span>
                <div className="score text-2xl sm:text-3xl text-[var(--color-ink)] font-semibold">
                  <CountUp value={value} />
                </div>
              </div>
              <span className="mono text-[10px] text-[var(--color-ink-ghost)] mt-1">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: Three Verdicts Cards with Hover Evidence Checklist ── */}
      <section className="max-w-[1400px] mx-auto px-4 py-16 lg:py-24">
        <FadeIn delay={0.1}>
          <div className="rule mb-3">
            <h2 className="text-xl font-semibold tracking-tight">Three verdicts, and why the difference matters</h2>
          </div>
          <p className="text-sm text-[var(--color-ink-dim)] mb-10 max-w-2xl leading-relaxed">
            Most systems collapse to a binary: present or absent. The useful distinction is narrower — between a claim somebody independent will stand behind, and a claim only its author will. Hover over any verdict to inspect its evidence criteria.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                level: 'trusted',
                icon: ShieldCheck,
                range: '75–100',
                rangeLabel: '75–100 / 100',
                pct: 95,
                headline: 'Independently corroborated',
                color: 'var(--color-verified)',
                border: 'var(--color-verified-line)',
                bg: 'var(--color-verified-bg)',
                glow: 'var(--color-verified-glow)',
                example: 'Occurs when a model provider (e.g. OpenAI, Stability) signs the canonical digest using a vetted key.',
                summary: 'The named provider signed this exact record with a key the operator vetted out of band. If the record is edited afterwards, the signature stops matching and this status is lost automatically.',
                checklist: [
                  { met: true, text: 'Vetted provider key signature verified (+40)' },
                  { met: true, text: 'Anchored in mined block with valid PoW (+20)' },
                  { met: true, text: 'Content hash matches Merkle inclusion root (+20)' },
                  { met: true, text: 'Salted zero-disclosure prompt verified (+15)' },
                  { met: true, text: 'Zero conflicting claims from other models (+5)' },
                ],
              },
              {
                level: 'self-asserted',
                icon: Minus,
                range: '40–74',
                rangeLabel: '40–74 / 100',
                pct: 62,
                headline: 'On the record, uncorroborated',
                color: 'var(--color-caution)',
                border: 'var(--color-caution-line)',
                bg: 'var(--color-caution-bg)',
                glow: 'var(--color-caution-glow)',
                example: 'Occurs when a creator anchors content directly, but no vetted provider key has independently countersigned.',
                summary: 'Anchored and unedited since, so the claim is at least old and stable. But only the uploader vouches for it. A complete, plausible, fully-filled record still lands here — and that ceiling is deliberate.',
                checklist: [
                  { met: true, text: 'Anchored in mined block with valid PoW (+20)' },
                  { met: true, text: 'Content hash committed in Merkle root (+20)' },
                  { met: true, text: 'Salted prompt hash recorded on ledger (+15)' },
                  { met: null, text: 'No vetted provider signature (hard capped at 74)' },
                  { met: null, text: 'Author-asserted claim only (no out-of-band corroboration)' },
                ],
              },
              {
                level: 'unverifiable',
                icon: X,
                range: '0–39',
                rangeLabel: '0–39 / 100',
                pct: 20,
                headline: 'Nothing checkable or compromised',
                color: 'var(--color-danger)',
                border: 'var(--color-danger-line)',
                bg: 'var(--color-danger-bg)',
                glow: 'var(--color-danger-glow)',
                example: 'Occurs when a signature does not match, a lineage derivation is severed, or conflicting models claim identical bytes.',
                summary: 'Too little recorded to evaluate, or the evidence contradicts itself: a broken signature, a severed derivation chain, or a ledger that failed its own integrity check.',
                checklist: [
                  { met: false, text: 'Broken or forged signature detected (capped at 39)' },
                  { met: false, text: 'Severed derivation chain or missing parent input' },
                  { met: false, text: 'Conflicting claims for identical content hash' },
                  { met: false, text: 'Block hash mismatch or ledger difficulty failure' },
                ],
              },
            ].map((v) => (
              <VerdictDetailCard key={v.level} item={v} />
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── Section 4: "How It Works" 4-Step Horizontal Timeline ──────────── */}
      <section className="border-y border-[var(--color-line)] bg-[var(--color-surface)]/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-16 lg:py-24">
          <FadeIn delay={0.15}>
            <div className="rule mb-4">
              <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
            </div>
            <p className="text-sm text-[var(--color-ink-dim)] mb-12 max-w-2xl leading-relaxed">
              ModelLedger operates as a cryptographic pipeline designed to establish verifiable origin without storing content files or compromising secret prompt strings.
            </p>

            <div className="relative">
              {/* Desktop connecting track */}
              <div className="hidden md:block absolute top-7 inset-x-12 h-px bg-gradient-to-r from-[var(--color-accent)] via-emerald-500/50 to-[var(--color-accent)] -z-0 opacity-40" />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
                {[
                  {
                    step: '01',
                    title: 'Register',
                    icon: Upload,
                    copy: 'Compute SHA-256 in memory and commit a salted prompt hash — raw media and prompts are never stored.',
                    href: '/register',
                  },
                  {
                    step: '02',
                    title: 'Anchor in block',
                    icon: Blocks,
                    copy: 'Batch artifact digests into Merkle trees and mine a block with PoW nonces to prevent silent rewriting.',
                    href: '/ledger',
                  },
                  {
                    step: '03',
                    title: 'Derive / transform',
                    icon: GitBranch,
                    copy: 'Register resizes, crops, and re-encodes linking child hashes back to ancestor origins across pipelines.',
                    href: '/derive',
                  },
                  {
                    step: '04',
                    title: 'Verify',
                    icon: ShieldCheck,
                    copy: 'Re-hash queried files, verify Merkle inclusion, and test provider signatures for independent corroboration.',
                    href: '/verify',
                  },
                ].map(({ step, title, icon: Icon, copy, href }) => (
                  <Link
                    key={step}
                    href={href}
                    className="panel p-5 panel-hover flex flex-col justify-between group transition-all duration-200"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] flex items-center justify-center text-[var(--color-accent)] group-hover:border-[var(--color-accent-line)] group-hover:shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="mono text-xs font-semibold text-[var(--color-ink-faint)] tracking-wider">
                          {step}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold mb-2 text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                        {title}
                      </h3>
                      <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">
                        {copy}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--color-line-subtle)] flex items-center justify-between text-[11px] mono text-[var(--color-accent)] font-medium">
                      <span>Explore workflow</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Section 5: Recent Ledger Activity (Pre-CTA) ───────────────────── */}
      {stats && stats.recentArtifacts && stats.recentArtifacts.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 py-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[var(--color-verified)] animate-pulse" />
                <h2 className="text-lg font-semibold tracking-tight">Recently registered on-chain</h2>
              </div>
              <p className="text-xs text-[var(--color-ink-faint)]">
                Live chronological records anchored into proof-of-work blocks
              </p>
            </div>
            <Link href="/ledger" className="btn btn-secondary text-xs">
              View all blocks &amp; records <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <Card inset>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Artifact Name</th>
                    <th>Claimed Model</th>
                    <th>SHA-256 Digest</th>
                    <th>Verdict</th>
                    <th className="text-right">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentArtifacts.map(a => (
                    <tr key={a.id} className="hover:bg-[var(--color-surface-2)] transition-colors">
                      <td>
                        <Link
                          href={`/artifact/${a.id}`}
                          className="font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-2"
                        >
                          <span>{a.filename}</span>
                          {a.status === 'derived' && (
                            <span className="mono text-[9px] text-[var(--color-accent)] inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[var(--color-accent-dim)] border border-[var(--color-accent-line)]">
                              <GitBranch className="w-2.5 h-2.5" /> derived
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="text-xs">
                        {a.model_name}
                        {a.model_provider && (
                          <span className="text-[var(--color-ink-ghost)]"> · {a.model_provider}</span>
                        )}
                      </td>
                      <td><Hash value={a.sha256} /></td>
                      <td><Verdict level={a.trust_level} score={a.trust_score} /></td>
                      <td className="text-right mono text-xs text-[var(--color-ink-faint)]">
                        {relativeTime(a.registered_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {/* ── Section 6: Final CTA Band ─────────────────────────────────────── */}
      <section className="border-t border-[var(--color-line)] bg-gradient-to-b from-[var(--color-surface)]/80 to-[var(--color-base)] py-20">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="panel p-8 sm:p-12 relative overflow-hidden border-[var(--color-line-strong)]">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.15),transparent_70%)] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-[radial-gradient(ellipse_at_bottom_left,rgba(239,68,68,0.12),transparent_70%)] pointer-events-none" />

            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-0.5 rounded bg-[var(--color-danger-bg)] border border-[var(--color-danger-line)]">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                <span className="mono text-[10px] text-[var(--color-danger)] uppercase tracking-wider font-semibold">
                  LIVE TESTBED EXPERIMENT
                </span>
              </div>

              <h2 className="font-display font-serif text-3xl sm:text-5xl font-normal tracking-tight text-[var(--color-ink)] mb-4">
                Don&apos;t take our word for it.
                <br />
                <span className="italic text-[var(--color-accent)]">Try to break it.</span>
              </h2>

              <p className="text-sm sm:text-base text-[var(--color-ink-dim)] leading-relaxed mb-8">
                Run our live adversarial attack suite — seven real cryptographic and lineage attacks staged against the trust engine in database rollback transactions. Forged attestations, laundered lineage, stolen keys, and insider tamper attempts are tested on the fly.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/adversarial"
                  className="btn btn-primary text-sm px-6 py-3 font-semibold shadow-lg shadow-cyan-500/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Adversarial Suite</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>

                <Link href="/ledger" className="btn btn-secondary text-sm px-5 py-3">
                  <Blocks className="w-4 h-4" />
                  <span>Inspect Chain PoW</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Component: Hero Chain of Custody Animated Graphic ──────────────────────

function ChainOfCustodyHero() {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [isScrambling, setIsScrambling] = useState(false);

  const VERDICTS_CYCLE = [
    {
      level: 'trusted',
      label: 'TRUSTED',
      score: 94,
      color: 'var(--color-verified)',
      border: 'var(--color-verified-line)',
      bg: 'var(--color-verified-bg)',
      glow: 'var(--color-verified-glow)',
      icon: ShieldCheck,
      status: 'OpenAI vetted key signed canonical record',
      gate: 'All 5 checks passed — no caps applied',
      badgeCls: 'verdict-trusted',
      hashOut: '2c5356e75bcc4094c561ac55ed6d76ad048bb8e79ac05d30d16ac9b8c9d2bb24',
    },
    {
      level: 'self-asserted',
      label: 'SELF-ASSERTED',
      score: 62,
      color: 'var(--color-caution)',
      border: 'var(--color-caution-line)',
      bg: 'var(--color-caution-bg)',
      glow: 'var(--color-caution-glow)',
      icon: AlertTriangle,
      status: 'Anchored; author-asserted claim only',
      gate: 'No provider key — capped at 74',
      badgeCls: 'verdict-self-asserted',
      hashOut: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
    {
      level: 'unverifiable',
      label: 'UNVERIFIABLE',
      score: 18,
      color: 'var(--color-danger)',
      border: 'var(--color-danger-line)',
      bg: 'var(--color-danger-bg)',
      glow: 'var(--color-danger-glow)',
      icon: X,
      status: 'Severed derivation custody chain detected',
      gate: 'Parent hash mismatch — capped at 39',
      badgeCls: 'verdict-tampered',
      hashOut: 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setIsScrambling(true);
      setTimeout(() => {
        setCycleIndex(prev => (prev + 1) % VERDICTS_CYCLE.length);
        setIsScrambling(false);
      }, 300);
    }, 4000);
    return () => clearInterval(timer);
  }, [VERDICTS_CYCLE.length]);

  const current = VERDICTS_CYCLE[cycleIndex];
  const CurrentIcon = current.icon;

  return (
    <div className="panel p-5 relative overflow-hidden border-[var(--color-line-strong)] bg-[#0a0e16]/95 backdrop-blur-xl shadow-2xl">
      {/* Decorative top bar */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[var(--color-line)] text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span className="mono text-[10px] text-[var(--color-ink-dim)] uppercase tracking-wider font-medium">
            LIVE CUSTODY AUDIT SIMULATION
          </span>
        </div>
        <div className="mono text-[10px] text-[var(--color-ink-ghost)]">
          DIFFICULTY: TARGET 00
        </div>
      </div>

      {/* Main Flow Grid */}
      <div className="space-y-3.5 relative">

        {/* Step 1: Original Artifact Card */}
        <div className="panel-inset p-3 flex items-center justify-between gap-3 border border-[var(--color-line)]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Synthetic Artwork Thumbnail */}
            <div className="w-12 h-12 rounded bg-gradient-to-br from-cyan-900/60 via-slate-800 to-indigo-950 border border-[var(--color-line-strong)] relative overflow-hidden flex items-center justify-center shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="opacity-80">
                <circle cx="12" cy="12" r="8" stroke="var(--color-accent)" strokeWidth="1.2" strokeDasharray="3 2" />
                <path d="M7 15L12 9L17 15" stroke="var(--color-verified)" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="12" cy="9" r="1.5" fill="var(--color-accent)" />
              </svg>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-cyan-500/50" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="mono text-[11px] font-semibold text-[var(--color-ink)] truncate">cityscape_v2.png</span>
                <span className="mono text-[9px] px-1 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-accent)] border border-[var(--color-line)]">
                  ORIGINAL
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-ink-faint)]">Claimed: DALL-E 3 · OpenAI</p>
              <div className="mt-1">
                <ScrambleHash
                  target="00c170257e1f78b0d7c8ce0476063546f1e311d13923b6474baada7be6ab3b05"
                  isScrambling={isScrambling}
                />
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="mono text-[9px] text-[var(--color-ink-ghost)] block">BLOCK #04</span>
            <span className="mono text-[10px] text-[var(--color-verified)] font-medium">MERKLE ROOT OK</span>
          </div>
        </div>

        {/* Dynamic SVG Flow Line 1 */}
        <div className="flex items-center justify-center my-0.5 h-5 relative">
          <div className="w-px h-full bg-gradient-to-b from-cyan-500/60 to-cyan-500/20" />
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_6px_var(--color-accent)]"
          />
        </div>

        {/* Step 2: Lineage Transformation Nodes */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="panel-inset p-2.5 border border-[var(--color-line)] bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between mb-1">
              <span className="mono text-[10px] font-medium text-[var(--color-ink)] flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-[var(--color-accent)]" /> RESIZE
              </span>
              <span className="mono text-[9px] text-[var(--color-verified)]">full link</span>
            </div>
            <p className="text-[10px] text-[var(--color-ink-faint)] truncate">2048x2048 → 1024x1024</p>
            <div className="mt-1.5">
              <ScrambleHash target="e4b910ca5f928e3d..." isScrambling={isScrambling} />
            </div>
          </div>

          <div className="panel-inset p-2.5 border border-[var(--color-line)] bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between mb-1">
              <span className="mono text-[10px] font-medium text-[var(--color-ink)] flex items-center gap-1">
                <Sliders className="w-3 h-3 text-[var(--color-caution)]" /> RE-ENCODE
              </span>
              <span className="mono text-[9px] text-[var(--color-verified)]">q:85 · sRGB</span>
            </div>
            <p className="text-[10px] text-[var(--color-ink-faint)] truncate">PNG → WebP lossy</p>
            <div className="mt-1.5">
              <ScrambleHash target="9a8c1f33b1e704d2..." isScrambling={isScrambling} />
            </div>
          </div>
        </div>

        {/* Dynamic SVG Flow Line 2 */}
        <div className="flex items-center justify-center my-0.5 h-5 relative">
          <div className="w-px h-full bg-gradient-to-b from-cyan-500/40 to-emerald-500/60" />
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute w-1.5 h-1.5 rounded-full bg-[var(--color-verified)] shadow-[0_0_6px_var(--color-verified)]"
          />
        </div>

        {/* Step 3: Cycling Verdict Stamp */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.level}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="stamp p-4 rounded-md border"
            style={{
              borderColor: current.border,
              background: current.bg,
              boxShadow: current.glow,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
                  style={{ borderColor: current.border, background: 'rgba(0,0,0,0.4)', color: current.color }}
                >
                  <CurrentIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="mono text-xs font-bold uppercase tracking-wider" style={{ color: current.color }}>
                      VERDICT: {current.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-ink-dim)] truncate">
                    {current.status}
                  </p>
                  <p className="mono text-[9px] text-[var(--color-ink-ghost)] mt-0.5">
                    {current.gate}
                  </p>
                </div>
              </div>

              {/* Dynamic Score Indicator */}
              <div className="text-right shrink-0">
                <div className="score text-2xl font-bold" style={{ color: current.color }}>
                  {current.score}
                  <span className="text-[11px] text-[var(--color-ink-ghost)] font-normal ml-0.5">/100</span>
                </div>
                <span className="mono text-[9px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                  TRUST SCORE
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}

// ─── Component: Scrambling Monospace Hash Display ───────────────────────────

function ScrambleHash({ target, isScrambling }: { target: string; isScrambling: boolean }) {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (!isScrambling) {
      setDisplay(target);
      return;
    }
    const hex = '0123456789abcdef';
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const scrambled = target
        .split('')
        .map((c) => (c === '.' ? '.' : hex[Math.floor(Math.random() * hex.length)]))
        .join('');
      setDisplay(scrambled);
      if (frame > 4) {
        clearInterval(interval);
        setDisplay(target);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [isScrambling, target]);

  return (
    <span className="hash text-[10px] select-all cursor-copy">
      <span className="mono">{display.length > 20 ? `${display.slice(0, 10)}...${display.slice(-8)}` : display}</span>
    </span>
  );
}

// ─── Component: Count-Up Animated Number on View ────────────────────────────

function CountUp({ value, duration = 1.0 }: { value: number | undefined; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });

  useEffect(() => {
    if (!isInView || value === undefined) return;
    let start = 0;
    const end = value;
    if (end === 0) { setCount(0); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(ease * end);
      setCount(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    requestAnimationFrame(step);
  }, [isInView, value, duration]);

  if (value === undefined) {
    return <span ref={ref} className="text-[var(--color-ink-ghost)] animate-pulse">—</span>;
  }

  return <span ref={ref} className="tnum">{count}</span>;
}

// ─── Component: Verdict Detail Card with Hover Evidence Checklist ──────────

interface VerdictDetailItem {
  level: string;
  icon: React.ElementType;
  range: string;
  rangeLabel: string;
  pct: number;
  headline: string;
  color: string;
  border: string;
  bg: string;
  glow: string;
  example: string;
  summary: string;
  checklist: { met: boolean | null; text: string }[];
}

function VerdictDetailCard({ item }: { item: VerdictDetailItem }) {
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="panel p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-2 relative overflow-hidden group cursor-default"
      style={{
        borderColor: hovered ? item.border : 'var(--color-line)',
        boxShadow: hovered ? item.glow : '0 4px 20px -4px rgba(0,0,0,0.5)',
      }}
    >
      <div>
        {/* Top Header */}
        <div className="flex items-center justify-between mb-4">
          <Verdict level={item.level} />
          <span
            className="mono text-xs font-semibold tnum px-2 py-0.5 rounded border"
            style={{
              color: item.color,
              borderColor: item.border,
              background: item.bg,
            }}
          >
            {item.rangeLabel}
          </span>
        </div>

        {/* Score-range gauge meter */}
        <div className="meter mb-4">
          <span
            style={{
              width: `${item.pct}%`,
              background: item.color,
              boxShadow: `0 0 8px ${item.color}`,
            }}
          />
        </div>

        <h3 className="text-base font-semibold mb-2 flex items-center gap-2" style={{ color: item.color }}>
          <Icon className="w-4 h-4 shrink-0" />
          <span>{item.headline}</span>
        </h3>

        {/* One-line example of when it occurs */}
        <div className="p-2.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line)] mb-4">
          <span className="mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)] block mb-0.5">
            WHEN THIS OCCURS:
          </span>
          <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed italic">
            &ldquo;{item.example}&rdquo;
          </p>
        </div>

        <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed mb-4">
          {item.summary}
        </p>

        {/* Evidence Checklist (revealed / highlighted on hover) */}
        <div className="pt-3 border-t border-[var(--color-line-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <span className="label text-[9px] text-[var(--color-ink-faint)]">
              EVIDENCE CHECKLIST CRITERIA
            </span>
            <span className="mono text-[9px] text-[var(--color-ink-ghost)]">
              {hovered ? 'AUDIT EXPANDED' : 'HOVER TO AUDIT'}
            </span>
          </div>

          <ul className="space-y-1.5">
            {item.checklist.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[11px] leading-snug py-0.5 transition-colors"
              >
                <span className="mt-0.5 shrink-0">
                  {c.met === true ? (
                    <Check className="w-3.5 h-3.5 text-[var(--color-verified)]" />
                  ) : c.met === null ? (
                    <Minus className="w-3.5 h-3.5 text-[var(--color-caution)]" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                  )}
                </span>
                <span
                  className={
                    c.met === true
                      ? 'text-[var(--color-ink)]'
                      : c.met === null
                        ? 'text-[var(--color-caution)]'
                        : 'text-[var(--color-danger)]'
                  }
                >
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-[var(--color-line-subtle)] flex items-center justify-between text-[10px] mono text-[var(--color-ink-ghost)]">
        <span>VERDICT TIER</span>
        <span className="uppercase font-medium" style={{ color: item.color }}>
          {item.level}
        </span>
      </div>
    </div>
  );
}
