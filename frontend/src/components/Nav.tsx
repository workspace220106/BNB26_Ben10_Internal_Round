'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ShieldCheck, ShieldAlert, Cpu, Tv } from 'lucide-react';
import toast from 'react-hot-toast';
import { validateChain } from '@/lib/api';

const LINKS = [
  { href: '/verify', label: 'Verify' },
  { href: '/register', label: 'Register' },
  { href: '/derive', label: 'Derive' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/adversarial', label: 'Adversarial' },
];

export default function Nav() {
  const pathname = usePathname();
  const [chain, setChain] = useState<{ valid: boolean; total_blocks: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);

  // Synchronize Presentation Mode across document and keyboard shortcut [P]
  useEffect(() => {
    const saved = localStorage.getItem('ml_presentation') === 'true';
    if (saved) setIsPresentation(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setIsPresentation(prev => {
            const next = !prev;
            localStorage.setItem('ml_presentation', String(next));
            if (next) {
              toast('Presentation mode enabled (Press P to exit)', {
                icon: '📽️',
                id: 'pres-mode',
                duration: 2500,
              });
            } else {
              toast('Presentation mode disabled', {
                icon: '🖥️',
                id: 'pres-mode',
                duration: 2000,
              });
            }
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isPresentation) {
      document.documentElement.setAttribute('data-presentation', 'true');
    } else {
      document.documentElement.removeAttribute('data-presentation');
    }
  }, [isPresentation]);

  // The chain indicator is live on every page — a provenance tool that cannot
  // tell you whether its own ledger is intact is not worth much.
  useEffect(() => {
    let cancelled = false;
    const poll = () => validateChain()
      .then(r => { if (!cancelled) setChain(r); })
      .catch(() => { if (!cancelled) setChain(null); });

    poll();
    const timer = setInterval(poll, 25_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <header className="sticky top-0 inset-x-0 z-50 border-b border-[var(--color-line)] bg-[#06080d]/85 backdrop-blur-xl transition-all">
      <div className="max-w-[1400px] mx-auto px-4 h-15 flex items-center justify-between gap-6">

        {/* Brand identity */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group focus-visible:outline-none">
          <LedgerMark />
          <div className="flex flex-col">
            <span className="mono text-sm font-semibold tracking-tight text-[var(--color-ink)] flex items-center gap-1.5">
              Model<span className="text-[var(--color-accent)]">Ledger</span>
              <span className="eyebrow text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-ink-faint)] border border-[var(--color-line)] font-normal hidden sm:inline-block">
                EVIDENCE LAB
              </span>
            </span>
            <span className="text-[10px] text-[var(--color-ink-ghost)] mono tracking-widest uppercase hidden lg:block -mt-0.5">
              Cryptographic Provenance
            </span>
          </div>
        </Link>

        {/* Navigation links with animated underline */}
        <nav className="hidden md:flex items-center gap-1 flex-1 max-w-xl">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                }`}
              >
                <span className="relative z-10">{label}</span>
                {active && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] rounded-[4px] -z-0"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                {active && (
                  <motion.div
                    layoutId="nav-active-underline"
                    className="absolute bottom-0 inset-x-2 h-[2px] bg-gradient-to-r from-[var(--color-accent)] via-cyan-400 to-emerald-400 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)] z-10"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side instruments */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Presentation Mode Toggle [P] */}
          <button
            type="button"
            onClick={() => {
              setIsPresentation(prev => {
                const next = !prev;
                localStorage.setItem('ml_presentation', String(next));
                toast(next ? 'Presentation mode enabled (Press P to exit)' : 'Presentation mode disabled', {
                  icon: next ? '📽️' : '🖥️',
                  id: 'pres-mode',
                  duration: 2200,
                });
                return next;
              });
            }}
            className={`btn btn-ghost px-2 py-1 text-xs mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              isPresentation
                ? 'bg-cyan-500/15 text-[var(--color-accent)] border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }`}
            title="Toggle Presentation Mode for Projectors (Keyboard shortcut: P)"
            aria-label="Toggle Presentation Mode (Keyboard shortcut: P)"
            aria-pressed={isPresentation}
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[10px] tracking-wider uppercase font-medium">
              {isPresentation ? 'Projector ON' : 'Present'}
            </span>
            <kbd className="mono text-[9px] px-1 py-0.2 rounded bg-black/40 border border-white/10 hidden sm:inline text-[var(--color-ink-ghost)]">
              P
            </kbd>
          </button>

          <ChainStatusChip chain={chain} />

          <button
            className="md:hidden btn btn-ghost p-2"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="md:hidden border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur-xl px-4 py-3 space-y-1 overflow-hidden"
          >
            {LINKS.map(({ href, label }) => {
              const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block px-3 py-2 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-line-strong)]'
                      : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Upgraded live status chip with pulsing dot, cryptographic icon and block counter */
function ChainStatusChip({ chain }: { chain: { valid: boolean; total_blocks: number } | null }) {
  if (!chain) {
    return (
      <Link
        href="/ledger"
        className="hidden sm:inline-flex items-center gap-2 mono text-[10px] tracking-wider px-2.5 py-1 rounded-[4px] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-ghost)] hover:border-[var(--color-line-strong)] transition-all"
        title="Ledger offline or unreachable"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-ink-ghost)]" />
        <span>LEDGER OFFLINE</span>
      </Link>
    );
  }

  const isValid = chain.valid;
  const color = isValid ? 'var(--color-verified)' : 'var(--color-danger)';
  const glow = isValid ? 'var(--color-verified-glow)' : 'var(--color-danger-glow)';

  return (
    <Link
      href="/ledger"
      className="inline-flex items-center gap-2 mono text-[11px] font-medium tracking-wide px-2.5 py-1 rounded-[4px] border transition-all duration-200 hover:scale-[1.02] group"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        boxShadow: glow,
      }}
      title={isValid ? `Chain integrity verified: ${chain.total_blocks} blocks intact` : 'Chain integrity failed: compromised blocks detected'}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ background: color }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </span>
      <span>{isValid ? 'CHAIN OK' : 'COMPROMISED'}</span>
      <span className="text-[var(--color-ink-dim)] border-l border-white/10 pl-1.5 text-[10px] tnum">
        #{chain.total_blocks}
      </span>
    </Link>
  );
}

/** Precision forensic lab cryptographic mark */
function LedgerMark() {
  return (
    <div className="relative w-7 h-7 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] flex items-center justify-center p-1 shadow-inner group-hover:border-[var(--color-accent-line)] group-hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1.2" stroke="var(--color-accent)" strokeWidth="1.3" />
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1.2" stroke="var(--color-ink-faint)" strokeWidth="1.2" strokeDasharray="2 1.5" />
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.2" stroke="var(--color-ink-ghost)" strokeWidth="1.2" />
        <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.2" fill="var(--color-verified)" fillOpacity="0.95" />
        {/* Connection crosshairs */}
        <line x1="7.5" y1="4.75" x2="10.5" y2="4.75" stroke="var(--color-line-strong)" strokeWidth="1" />
        <line x1="4.75" y1="7.5" x2="4.75" y2="10.5" stroke="var(--color-line-strong)" strokeWidth="1" />
        <line x1="13.25" y1="7.5" x2="13.25" y2="10.5" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1" />
        <line x1="7.5" y1="13.25" x2="10.5" y2="13.25" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
}
