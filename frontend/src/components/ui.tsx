'use client';

/**
 * The shared vocabulary of the console: verdict marks, hash displays, panels,
 * and the evidence table. Everything that appears on more than one screen
 * lives here so the system reads as one instrument rather than four pages.
 */

import { useState, type ReactNode } from 'react';
import { Check, Copy, Minus, X, AlertTriangle, Lock } from 'lucide-react';
import { shortHash, type TrustFactor, type TrustGate, type TrustLevel } from '@/lib/api';

// ─── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title, actions, children, className = '', inset = false,
}: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode;
  className?: string; inset?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          <span className="flex-1">{title}</span>
          {actions}
        </header>
      )}
      <div className={inset ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

// ─── Verdict mark ────────────────────────────────────────────────────────────

const VERDICT_LABEL: Record<string, string> = {
  trusted: 'Trusted',
  'self-asserted': 'Self-asserted',
  unverifiable: 'Unverifiable',
  VERIFIED: 'Verified',
  SELF_ASSERTED: 'Self-asserted',
  NOT_FOUND: 'No record',
  TAMPERED: 'Tampered',
};

export function Verdict({ level, score }: { level?: string; score?: number }) {
  if (!level) return null;
  const cls = String(level).toLowerCase().replace(/_/g, '-');
  return (
    <span className={`verdict verdict-${cls}`}>
      {VERDICT_LABEL[level] ?? level}
      {score !== undefined && <span className="opacity-60 tnum">{score}</span>}
    </span>
  );
}

// ─── Copyable hash ───────────────────────────────────────────────────────────

export function Hash({
  value, full = false, label,
}: { value?: string | null; full?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[var(--color-ink-ghost)] text-xs">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded views.
      // Failing silently is right here — the hash is still selectable.
    }
  };

  return (
    <button
      onClick={copy}
      title={value}
      className="group inline-flex items-center gap-1.5 hash hover:border-[var(--color-line-strong)] transition-colors"
    >
      {label && <span className="text-[var(--color-ink-ghost)]">{label}</span>}
      <span>{full ? value : shortHash(value)}</span>
      {copied
        ? <Check className="w-3 h-3 text-[var(--color-verified)]" />
        : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
    </button>
  );
}

// ─── Key/value list ──────────────────────────────────────────────────────────

export function KV({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl>
      {items.map(({ k, v }) => (
        <div key={k} className="kv">
          <dt>{k}</dt>
          <dd className="truncate">{v ?? <span className="text-[var(--color-ink-ghost)]">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Score readout ───────────────────────────────────────────────────────────

export function ScoreDial({
  score, level, size = 'lg',
}: { score: number; level: TrustLevel | string; size?: 'sm' | 'lg' }) {
  const color = level === 'trusted'
    ? 'var(--color-verified)'
    : level === 'self-asserted'
      ? 'var(--color-caution)'
      : 'var(--color-ink-faint)';

  const dim = size === 'lg' ? 112 : 72;
  const stroke = size === 'lg' ? 6 : 4;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dim, height: dim }}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle
          cx={dim / 2} cy={dim / 2} r={radius}
          fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke}
        />
        <circle
          cx={dim / 2} cy={dim / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`score ${size === 'lg' ? 'text-3xl' : 'text-xl'}`} style={{ color }}>
          {score}
        </span>
        <span className="label mt-0.5" style={{ fontSize: size === 'lg' ? '0.625rem' : '0.5625rem' }}>
          / 100
        </span>
      </div>
    </div>
  );
}

// ─── Evidence table ──────────────────────────────────────────────────────────

/**
 * The factor breakdown. This is the component that makes the score auditable
 * rather than magic — every point is attributed to a named check, and checks
 * that did not apply are shown as such rather than hidden.
 */
export function EvidenceTable({ factors }: { factors: TrustFactor[] }) {
  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {factors.map(f => {
        const na = f.not_applicable || f.met === null;
        const earned = f.partial !== undefined ? f.partial : (f.met ? f.weight : 0);
        const pct = na ? 0 : (earned / f.weight) * 100;

        const color = na
          ? 'var(--color-ink-ghost)'
          : pct >= 100 ? 'var(--color-verified)'
            : pct > 0 ? 'var(--color-caution)'
              : 'var(--color-danger)';

        return (
          <li key={f.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {na ? <Minus className="w-3.5 h-3.5 text-[var(--color-ink-ghost)]" />
                  : f.met ? <Check className="w-3.5 h-3.5 text-[var(--color-verified)]" />
                    : <X className="w-3.5 h-3.5 text-[var(--color-danger)]" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className={`text-sm font-medium ${na ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink)]'}`}>
                    {f.label}
                  </span>
                  <span className="mono text-[11px] tnum shrink-0" style={{ color }}>
                    {na ? 'n/a' : `${earned}/${f.weight}`}
                  </span>
                </div>
                <div className="meter mb-1.5">
                  <span style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">{f.detail}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Gates ───────────────────────────────────────────────────────────────────

/**
 * Gates explain why a score was capped. They matter more than the number —
 * "complete record, but nobody independent vouches for it" is the actual
 * finding, and the score is just its summary.
 */
export function GateList({ gates }: { gates: TrustGate[] }) {
  if (!gates.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-verified)]">
        <Check className="w-4 h-4" />
        No limits applied — evidence supports the claim in full.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {gates.map(g => {
        const severe = g.ceiling <= 39;
        const color = severe ? 'var(--color-danger)' : 'var(--color-caution)';
        return (
          <li
            key={g.type}
            className="flex items-start gap-2.5 p-2.5 rounded-[3px] border"
            style={{
              borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
              background: `color-mix(in srgb, ${color} 7%, transparent)`,
            }}
          >
            {severe
              ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              : <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="mono text-[11px] font-medium tracking-wide" style={{ color }}>
                  {g.type.replace(/_/g, ' ')}
                </span>
                <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
                  caps at {g.ceiling}
                </span>
              </div>
              <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed mt-0.5">{g.message}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="panel p-3.5">
      <div className="label mb-1.5">{label}</div>
      <div className="score text-2xl" style={{ color: tone || 'var(--color-ink)' }}>{value}</div>
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-8 h-8 text-[var(--color-ink-ghost)] mb-3" />
      <p className="text-sm text-[var(--color-ink-dim)]">{title}</p>
      {hint && <p className="text-xs text-[var(--color-ink-ghost)] mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}
