'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight, Search, Upload, GitBranch, ShieldAlert, Blocks, Check, Minus, X,
} from 'lucide-react';
import { getLedgerStats, relativeTime, type LedgerStats } from '@/lib/api';
import { Verdict, Hash } from '@/components/ui';

export default function HomePage() {
  const [stats, setStats] = useState<LedgerStats | null>(null);

  useEffect(() => { getLedgerStats().then(setStats).catch(() => {}); }, []);

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--color-line)]">
        <div className="max-w-[1400px] mx-auto px-4 py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="eyebrow mb-5">Provenance ledger · AI-generated content</p>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold leading-[1.08] tracking-[-0.02em] mb-6">
              A signature proves who made a claim.
              <br />
              <span className="text-[var(--color-ink-faint)]">
                It does not prove the model made the file.
              </span>
            </h1>

            <p className="text-[15px] text-[var(--color-ink-dim)] leading-relaxed max-w-2xl mb-9">
              ModelLedger records where AI-generated content came from and what happened to it
              afterwards — then tells you how much of that record is actually supported by
              evidence. Claims that nobody independent corroborates stay marked as
              assertions, however complete they look.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/verify" className="btn btn-primary">
                <Search className="w-4 h-4" />
                Verify an artifact
              </Link>
              <Link href="/register" className="btn btn-secondary">
                <Upload className="w-4 h-4" />
                Register
              </Link>
              <Link href="/adversarial" className="btn btn-ghost">
                <ShieldAlert className="w-4 h-4" />
                Try to break it
                <ArrowRight className="w-3.5 h-3.5 opacity-50" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live counters ─────────────────────────────────────────────────── */}
      <section className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="max-w-[1400px] mx-auto px-4 grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-[var(--color-line)]">
          {[
            { label: 'Artifacts', value: stats?.totalArtifacts },
            { label: 'Blocks', value: stats?.totalBlocks },
            { label: 'Transformations', value: stats?.totalTransformations },
            { label: 'Verifications', value: stats?.totalVerifications },
            { label: 'Vetted attesters', value: stats?.totalAttesters },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-5">
              <div className="score text-2xl mb-1">
                {value ?? <span className="text-[var(--color-ink-ghost)]">—</span>}
              </div>
              <div className="label">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The three verdicts ────────────────────────────────────────────── */}
      <section className="max-w-[1400px] mx-auto px-4 py-16 lg:py-20">
        <div className="rule mb-2">
          <h2 className="text-lg font-semibold">Three verdicts, and why the difference matters</h2>
        </div>
        <p className="text-sm text-[var(--color-ink-dim)] mb-8 max-w-2xl">
          Most systems collapse to a binary: present or absent. The useful distinction is
          narrower — between a claim somebody independent will stand behind, and a claim
          only its author will.
        </p>

        <div className="grid md:grid-cols-3 gap-px bg-[var(--color-line)] border border-[var(--color-line)] rounded">
          {[
            {
              level: 'trusted',
              icon: Check,
              range: '75–100',
              headline: 'Independently corroborated',
              body: 'The named provider signed this exact record with a key the operator vetted out of band. If the record is edited afterwards, the signature stops matching and this status is lost automatically.',
            },
            {
              level: 'self-asserted',
              icon: Minus,
              range: '40–74',
              headline: 'On the record, uncorroborated',
              body: 'Anchored and unedited since, so the claim is at least old and stable. But only the uploader vouches for it. A complete, plausible, fully-filled record still lands here — and that ceiling is deliberate.',
            },
            {
              level: 'unverifiable',
              icon: X,
              range: '0–39',
              headline: 'Nothing checkable',
              body: 'Too little recorded to evaluate, or the evidence contradicts itself: a broken signature, a severed derivation chain, or a ledger that failed its own integrity check.',
            },
          ].map(({ level, icon: Icon, range, headline, body }) => (
            <div key={level} className="bg-[var(--color-surface)] p-6">
              <div className="flex items-center justify-between mb-4">
                <Verdict level={level} />
                <span className="mono text-[11px] text-[var(--color-ink-ghost)] tnum">{range}</span>
              </div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-[var(--color-ink-faint)]" />
                {headline}
              </h3>
              <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="max-w-[1400px] mx-auto px-4 py-16 lg:py-20">
          <div className="rule mb-8">
            <h2 className="text-lg font-semibold">What the system does</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-9">
            {[
              {
                title: 'Survives transformation',
                body: 'Re-encoding, resizing and upscaling change a file\'s hash completely. Registered transformations link the new hash back to the original, so a published JPEG still resolves to the PNG it came from.',
                href: '/derive',
                cta: 'Register a derivation',
              },
              {
                title: 'Verifies without disclosure',
                body: 'Prompts are salted and hashed, never stored. Whoever holds the original prompt can prove it produced a record; nobody else can read it, and a short prompt cannot be brute-forced out of the ledger.',
                href: '/verify',
                cta: 'Verify an artifact',
              },
              {
                title: 'Detects tampering',
                body: 'Each block commits to a Merkle root over the artifacts it anchors. Editing an anchored record breaks the root, and rewriting the block to match would invalidate every block above it.',
                href: '/ledger',
                cta: 'Inspect the chain',
              },
              {
                title: 'Tracks multi-system pipelines',
                body: 'Content that passes through several models carries a chain of custody — each step naming what went in, what came out, and which system did it. A step whose input does not match its parent is flagged, not absorbed.',
                href: '/ledger',
                cta: 'Browse the ledger',
              },
              {
                title: 'Surfaces conflicts',
                body: 'When two records claim identical bytes came from different models, both are capped and the contradiction is shown. The ledger has no basis to pick a winner, so it does not pretend to.',
                href: '/adversarial',
                cta: 'See the scenario',
              },
              {
                title: 'Tested adversarially',
                body: 'Seven attacks — forged attestations, laundered lineage, insider edits, stolen keys — run against the live engine on demand, in a sandbox that is rolled back. Nothing is mocked.',
                href: '/adversarial',
                cta: 'Run the suite',
              },
            ].map(({ title, body, href, cta }) => (
              <div key={title}>
                <h3 className="text-sm font-semibold mb-2">{title}</h3>
                <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mb-3">{body}</p>
                <Link href={href} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                  {cta} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recent registrations ──────────────────────────────────────────── */}
      {stats && stats.recentArtifacts.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 py-16">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Recently registered</h2>
              <p className="text-xs text-[var(--color-ink-faint)]">
                Live from the ledger
              </p>
            </div>
            <Link href="/ledger" className="btn btn-ghost text-xs">
              All records <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th>Claimed model</th>
                    <th>Content hash</th>
                    <th>Verdict</th>
                    <th className="text-right">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentArtifacts.map(a => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/artifact/${a.id}`} className="text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors">
                          {a.filename}
                        </Link>
                        {a.status === 'derived' && (
                          <span className="ml-2 mono text-[10px] text-[var(--color-ink-ghost)] inline-flex items-center gap-1">
                            <GitBranch className="w-2.5 h-2.5" />derived
                          </span>
                        )}
                      </td>
                      <td>{a.model_name}</td>
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
          </div>
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-line)]">
        <div className="max-w-[1400px] mx-auto px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-2">
              <Blocks className="w-3.5 h-3.5 text-[var(--color-ink-faint)]" />
              <span className="mono text-xs">ModelLedger</span>
            </div>
            <p className="text-xs text-[var(--color-ink-ghost)] leading-relaxed">
              A single-operator ledger. The proof-of-work makes silent rewriting expensive and
              visible; it is not distributed consensus, and the system does not claim to be.
            </p>
          </div>
          <nav className="flex flex-wrap gap-4">
            {['Verify', 'Register', 'Derive', 'Ledger', 'Adversarial'].map(l => (
              <Link key={l} href={`/${l.toLowerCase()}`} className="text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                {l}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
