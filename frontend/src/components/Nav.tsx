'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
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

  // The chain indicator is live on every page — a provenance tool that cannot
  // tell you whether its own ledger is intact is not worth much.
  useEffect(() => {
    let cancelled = false;
    const poll = () => validateChain()
      .then(r => { if (!cancelled) setChain(r); })
      .catch(() => { if (!cancelled) setChain(null); });

    poll();
    const timer = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-base)_88%,transparent)] backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-6">

        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <LedgerMark />
          <span className="mono text-sm font-semibold tracking-tight">
            Model<span className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-dim)] transition-colors">Ledger</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`px-2.5 py-1.5 rounded-[3px] text-[13px] transition-colors ${
                  active
                    ? 'text-[var(--color-ink)] bg-[var(--color-surface-2)]'
                    : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ChainPill chain={chain} />
          <button
            className="md:hidden btn btn-ghost p-1.5"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block px-2 py-2.5 text-sm text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] border-b border-[var(--color-line)] last:border-0"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Chain integrity readout. Reads as a status LED on an instrument. */
function ChainPill({ chain }: { chain: { valid: boolean; total_blocks: number } | null }) {
  if (!chain) {
    return (
      <span className="hidden sm:flex items-center gap-1.5 mono text-[10px] text-[var(--color-ink-ghost)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-ink-ghost)]" />
        OFFLINE
      </span>
    );
  }

  const color = chain.valid ? 'var(--color-verified)' : 'var(--color-danger)';
  return (
    <span
      className="flex items-center gap-1.5 mono text-[10px] tracking-wider px-2 py-1 rounded-[3px] border"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
      title={chain.valid
        ? `All ${chain.total_blocks} blocks verified`
        : 'Chain integrity check failed'}
    >
      <span className="relative w-1.5 h-1.5 rounded-full pulse" style={{ background: color }} />
      {chain.valid ? 'CHAIN OK' : 'COMPROMISED'}
      <span className="text-[var(--color-ink-ghost)]">{chain.total_blocks}</span>
    </span>
  );
}

/** Three stacked links — a chain, drawn rather than emoji. */
function LedgerMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="var(--color-ink-dim)" strokeWidth="1.3" />
      <rect x="10.5" y="1.5" width="6" height="6" rx="1" stroke="var(--color-ink-ghost)" strokeWidth="1.3" />
      <rect x="1.5" y="10.5" width="6" height="6" rx="1" stroke="var(--color-ink-ghost)" strokeWidth="1.3" />
      <rect x="10.5" y="10.5" width="6" height="6" rx="1" fill="var(--color-verified)" fillOpacity="0.9" />
    </svg>
  );
}
