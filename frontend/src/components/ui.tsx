'use client';

/**
 * ModelLedger — Forensic Evidence Lab Component System
 * Standardized components for verdicts, hashes, panels, stats, and dialogs.
 */

import { useState, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Check, Copy, Minus, X, AlertTriangle, Lock, ShieldCheck,
  ShieldAlert, HelpCircle, ArrowUpRight,
} from 'lucide-react';
import { shortHash, type TrustFactor, type TrustGate, type TrustLevel } from '@/lib/api';

// ─── Motion Helpers ─────────────────────────────────────────────────────────

export function FadeIn({
  children,
  delay = 0,
  duration = 0.22,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0.05 : duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  stagger = 0.04,
  className = '',
}: {
  children: ReactNode;
  stagger?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }[variant];

  const sizeClass = {
    sm: 'text-xs px-2.5 py-1',
    md: 'text-xs px-3.5 py-1.5',
    lg: 'text-sm px-4 py-2',
  }[size];

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="w-3.5 h-3.5" /> : icon}
      {children}
    </button>
  );
}

// ─── Panel & Card ────────────────────────────────────────────────────────────

export function Card({
  title,
  actions,
  children,
  className = '',
  inset = false,
  hoverGlow = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  inset?: boolean;
  hoverGlow?: boolean;
}) {
  return (
    <section className={`panel ${hoverGlow ? 'panel-hover' : ''} ${className}`}>
      {title && (
        <header className="panel-head">
          <span className="flex-1 font-mono">{title}</span>
          {actions}
        </header>
      )}
      <div className={inset ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export const Panel = Card;

// ─── Badges ──────────────────────────────────────────────────────────────────

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'accent' | 'verified' | 'caution' | 'danger' | 'outline';
  className?: string;
}) {
  const variantStyles = {
    default: 'bg-[var(--color-surface-2)] text-[var(--color-ink-dim)] border-[var(--color-line)]',
    accent: 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] border-[var(--color-accent-line)]',
    verified: 'bg-[var(--color-verified-bg)] text-[var(--color-verified)] border-[var(--color-verified-line)]',
    caution: 'bg-[var(--color-caution-bg)] text-[var(--color-caution)] border-[var(--color-caution-line)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-line)]',
    outline: 'bg-transparent text-[var(--color-ink-faint)] border-[var(--color-line-strong)]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 mono text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] border ${variantStyles} ${className}`}
    >
      {children}
    </span>
  );
}

// ─── Verdict Badge ───────────────────────────────────────────────────────────

const VERDICT_META: Record<string, { label: string; icon: typeof Check; cls: string }> = {
  trusted: { label: 'Trusted', icon: ShieldCheck, cls: 'verdict-trusted' },
  verified: { label: 'Verified', icon: ShieldCheck, cls: 'verdict-verified' },
  'self-asserted': { label: 'Self-asserted', icon: AlertTriangle, cls: 'verdict-self-asserted' },
  unverifiable: { label: 'Unverifiable', icon: HelpCircle, cls: 'verdict-unverifiable' },
  'not-found': { label: 'No record', icon: HelpCircle, cls: 'verdict-not-found' },
  tampered: { label: 'Tampered', icon: ShieldAlert, cls: 'verdict-tampered' },
  VERIFIED: { label: 'Verified', icon: ShieldCheck, cls: 'verdict-verified' },
  SELF_ASSERTED: { label: 'Self-asserted', icon: AlertTriangle, cls: 'verdict-self-asserted' },
  NOT_FOUND: { label: 'No record', icon: HelpCircle, cls: 'verdict-not-found' },
  TAMPERED: { label: 'Tampered', icon: ShieldAlert, cls: 'verdict-tampered' },
};

export function VerdictBadge({
  level,
  score,
  showIcon = true,
  className = '',
}: {
  level?: string;
  score?: number;
  showIcon?: boolean;
  className?: string;
}) {
  if (!level) return null;
  const key = String(level).toLowerCase().replace(/_/g, '-');
  const meta = VERDICT_META[key] || {
    label: level,
    icon: HelpCircle,
    cls: 'verdict-unverifiable',
  };
  const Icon = meta.icon;

  return (
    <span className={`verdict ${meta.cls} ${className}`}>
      {showIcon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{meta.label}</span>
      {score !== undefined && (
        <span className="mono font-semibold ml-0.5 opacity-75 tnum">{score}</span>
      )}
    </span>
  );
}

export const Verdict = VerdictBadge;

// ─── Tooltip ─────────────────────────────────────────────────────────────────

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[position];

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 2 : -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? 2 : -2 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="tooltip"
            className={`absolute ${posClasses} z-50 pointer-events-none px-2.5 py-1 rounded bg-[var(--color-surface-3)] border border-[var(--color-line-strong)] text-[11px] mono text-[var(--color-ink)] shadow-xl whitespace-nowrap`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Hash Chip ───────────────────────────────────────────────────────────────

export function HashChip({
  value,
  full = false,
  label,
  className = '',
}: {
  value?: string | null;
  full?: boolean;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="mono text-xs text-[var(--color-ink-ghost)]">—</span>;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('SHA-256 copied to clipboard', { id: 'copy-hash', duration: 1800 });
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error('Failed to copy hash');
    }
  };

  const chipContent = (
    <button
      type="button"
      onClick={copy}
      title={full ? 'Click to copy hash' : `Click to copy: ${value}`}
      aria-label={full ? 'Copy full hash' : `Copy hash ${shortHash(value)}`}
      className={`group hash text-left cursor-pointer ${className}`}
    >
      {label && <span className="text-[var(--color-ink-ghost)]">{label}</span>}
      <span className="mono select-all">{full ? value : shortHash(value)}</span>
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="text-[var(--color-verified)] ml-1"
          >
            <Check className="w-3 h-3 inline" />
          </motion.span>
        ) : (
          <span key="copy" className="opacity-0 group-hover:opacity-60 transition-opacity ml-1">
            <Copy className="w-3 h-3 text-[var(--color-ink-faint)] inline" />
          </span>
        )}
      </AnimatePresence>
    </button>
  );

  return chipContent;
}

export const Hash = HashChip;

// ─── Tabs ────────────────────────────────────────────────────────────────────

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  badge?: ReactNode;
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented relative ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            data-active={active}
            className={`relative px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
          >
            {active && (
              <motion.div
                layoutId="active-tab-indicator"
                className="absolute inset-0 bg-[var(--color-surface-3)] border border-[var(--color-line-strong)] rounded shadow-sm z-0"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="mono text-[10px] px-1 rounded bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Table Wrapper ───────────────────────────────────────────────────────────

export function Table({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto w-full">
      <table className={`table ${className}`}>{children}</table>
    </div>
  );
}

// ─── Stat Tile ───────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  tone,
  icon: Icon,
  subtitle,
  className = '',
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  icon?: React.ElementType;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={`panel p-4 flex flex-col justify-between transition-all duration-200 hover:border-[var(--color-line-strong)] ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="label text-[11px]">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--color-ink-faint)]" />}
      </div>
      <div>
        <div className="score text-2xl font-semibold tracking-tight" style={{ color: tone || 'var(--color-ink)' }}>
          {value}
        </div>
        {subtitle && (
          <p className="mono text-[10px] text-[var(--color-ink-ghost)] mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ─── Key-Value Display ───────────────────────────────────────────────────────

export function KV({
  items,
  className = '',
}: {
  items: { k: string; v: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={`divide-y divide-[var(--color-line-subtle)] ${className}`}>
      {items.map(({ k, v }) => (
        <div key={k} className="kv">
          <dt>{k}</dt>
          <dd className="truncate">{v ?? <span className="mono text-[var(--color-ink-ghost)]">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Score Dial ──────────────────────────────────────────────────────────────

export function ScoreDial({
  score,
  level,
  size = 'lg',
}: {
  score: number;
  level: TrustLevel | string;
  size?: 'sm' | 'lg';
}) {
  const isTrusted = level === 'trusted' || level === 'VERIFIED';
  const isCaution = level === 'self-asserted' || level === 'SELF_ASSERTED';
  const color = isTrusted
    ? 'var(--color-verified)'
    : isCaution
      ? 'var(--color-caution)'
      : 'var(--color-danger)';

  const dim = size === 'lg' ? 116 : 74;
  const stroke = size === 'lg' ? 6 : 4;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: dim, height: dim }}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, score)) / 100)}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
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

// ─── Evidence Table ──────────────────────────────────────────────────────────

export function EvidenceTable({ factors }: { factors: TrustFactor[] }) {
  return (
    <ul className="divide-y divide-[var(--color-line-subtle)]">
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
                  <span className="mono text-[11px] tnum shrink-0 font-medium" style={{ color }}>
                    {na ? 'n/a' : `${earned}/${f.weight}`}
                  </span>
                </div>
                <div className="meter mb-1.5">
                  <span style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">{f.detail}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Gates List ──────────────────────────────────────────────────────────────

export function GateList({ gates }: { gates: TrustGate[] }) {
  if (!gates.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-verified)]">
        <Check className="w-4 h-4" />
        No limits applied — evidence corroborates the claim in full.
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
            className="flex items-start gap-2.5 p-2.5 rounded-[4px] border"
            style={{
              borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
              background: `color-mix(in srgb, ${color} 8%, transparent)`,
            }}
          >
            {severe
              ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              : <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="mono text-[11px] font-semibold tracking-wide uppercase" style={{ color }}>
                  {g.type.replace(/_/g, ' ')}
                </span>
                <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
                  caps score at {g.ceiling}
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

// ─── Empty State ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] flex items-center justify-center mb-3 text-[var(--color-ink-faint)]">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-medium text-[var(--color-ink)] mb-1">{title}</p>
      {hint && <p className="text-xs text-[var(--color-ink-dim)] max-w-sm mb-4">{hint}</p>}
      {action}
    </div>
  );
}

export const Empty = EmptyState;

// ─── Error State with Retry ──────────────────────────────────────────────────

export function ErrorState({
  icon: Icon = ShieldAlert,
  title = 'Failed to load forensic data',
  message,
  onRetry,
  className = '',
}: {
  icon?: React.ElementType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center px-4 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-line)] flex items-center justify-center mb-3 text-[var(--color-danger)] shadow-[0_0_16px_rgba(239,68,68,0.2)]">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-[var(--color-ink)] mb-1">{title}</p>
      {message && <p className="text-xs text-[var(--color-ink-dim)] max-w-sm mb-4 leading-relaxed">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary text-xs">
          Try Again
        </button>
      )}
    </div>
  );
}

export const ErrorBlock = ErrorState;

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className = 'h-4 w-full rounded' }: { className?: string }) {
  return <div className={`shimmer rounded bg-[var(--color-surface-2)] ${className}`} />;
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}
