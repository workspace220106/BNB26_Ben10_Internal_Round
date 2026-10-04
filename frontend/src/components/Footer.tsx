import Link from 'next/link';
import { Blocks, Shield, GitBranch, Key, ShieldCheck, Terminal, Cpu } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface)]/40 backdrop-blur-sm mt-20">
      <div className="max-w-[1400px] mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Identity & Concept */}
          <div className="space-y-3.5 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] flex items-center justify-center">
                <Blocks className="w-3 h-3 text-[var(--color-accent)]" />
              </div>
              <span className="mono text-sm font-semibold tracking-tight text-[var(--color-ink)]">
                Model<span className="text-[var(--color-accent)]">Ledger</span>
              </span>
              <span className="eyebrow text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-ink-faint)] border border-[var(--color-line)]">
                FORENSIC LAB
              </span>
            </div>

            <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed max-w-lg">
              A cryptographic provenance verifier for synthetic media. Anchors artifacts via proof-of-work blocks and Merkle inclusion proofs, separating independent corroboration from mere creator assertion.
            </p>

            <div className="panel-inset p-3 max-w-lg border-l-2 border-l-[var(--color-accent)]">
              <p className="text-[11px] text-[var(--color-ink-dim)] leading-relaxed italic">
                &ldquo;A signature proves who made a claim, not that a model made the file. The ledger is an investigator&apos;s case file: precise, unyielding, and auditable.&rdquo;
              </p>
            </div>
          </div>

          {/* Cryptographic Primitives */}
          <div className="space-y-3">
            <h3 className="label text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
              Primitives
            </h3>
            <ul className="space-y-2 text-xs text-[var(--color-ink-dim)]">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-verified)] shrink-0" />
                <span>Ed25519 Provider Attestations</span>
              </li>
              <li className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
                <span>Salted Zero-Disclosure Prompts</span>
              </li>
              <li className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-[var(--color-caution)] shrink-0" />
                <span>Lineage Chain of Custody</span>
              </li>
              <li className="flex items-center gap-2">
                <Blocks className="w-3.5 h-3.5 text-[var(--color-ink-faint)] shrink-0" />
                <span>Merkle Tree Inclusion Proofs</span>
              </li>
            </ul>
          </div>

          {/* Navigation Explorer */}
          <div className="space-y-3">
            <h3 className="label text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
              Investigation Lab
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/verify" className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-between">
                  <span>Verify Artifact</span>
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)]">/verify</span>
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-between">
                  <span>Anchor Record</span>
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)]">/register</span>
                </Link>
              </li>
              <li>
                <Link href="/derive" className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-between">
                  <span>Register Derivation</span>
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)]">/derive</span>
                </Link>
              </li>
              <li>
                <Link href="/ledger" className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-between">
                  <span>Chain Explorer</span>
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)]">/ledger</span>
                </Link>
              </li>
              <li>
                <Link href="/adversarial" className="text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-between">
                  <span>Adversarial Testing</span>
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)]">/adversarial</span>
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Hairline sub-footer */}
        <div className="pt-6 border-t border-[var(--color-line)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] mono text-[var(--color-ink-ghost)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-verified)]" />
              SYSTEM OPERATIONAL
            </span>
            <span>·</span>
            <span>DIFFICULTY TARGET: 00</span>
            <span>·</span>
            <span>HASH: SHA-256</span>
          </div>
          <div>
            <span>ModelLedger Forensic Framework</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
