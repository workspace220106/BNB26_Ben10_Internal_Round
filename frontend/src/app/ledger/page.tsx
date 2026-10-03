'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search, ChevronLeft, ChevronRight, Blocks, Database, ShieldCheck,
  ShieldAlert, GitBranch, Key, AlertTriangle,
} from 'lucide-react';
import {
  getLedgerStats, getLedgerArtifacts, getBlocks, validateChain, getAttesters,
  formatDate, relativeTime, shortHash,
  type LedgerStats, type Artifact, type Block, type ChainIssue, type Attester,
} from '@/lib/api';
import { Panel, Verdict, Hash, Stat, Spinner, Empty } from '@/components/ui';

type Tab = 'artifacts' | 'blocks' | 'integrity' | 'attesters';

export default function LedgerPage() {
  const [tab, setTab] = useState<Tab>('artifacts');
  const [stats, setStats] = useState<LedgerStats | null>(null);

  useEffect(() => { getLedgerStats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-10">
      <header className="mb-7">
        <p className="eyebrow mb-2">Ledger</p>
        <h1 className="text-2xl font-semibold mb-2">Explorer</h1>
        <p className="text-sm text-[var(--color-ink-dim)]">
          Every record, every block, and the integrity of the chain that holds them.
        </p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Artifacts" value={stats?.totalArtifacts ?? '—'} />
        <Stat label="Blocks" value={stats?.totalBlocks ?? '—'} />
        <Stat label="Transformations" value={stats?.totalTransformations ?? '—'} />
        <Stat label="Verifications" value={stats?.totalVerifications ?? '—'} />
        <Stat
          label="Chain"
          value={stats?.chainIntegrity ?? '—'}
          tone={stats?.chainIntegrity === 'VALID' ? 'var(--color-verified)' : 'var(--color-danger)'}
        />
      </div>

      {/* Trust distribution */}
      {stats && <TrustBar stats={stats} />}

      <nav className="segmented mb-5 mt-6 flex-wrap">
        {([
          ['artifacts', 'Artifacts', Database],
          ['blocks', 'Blocks', Blocks],
          ['integrity', 'Integrity', ShieldCheck],
          ['attesters', 'Attesters', Key],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} data-active={tab === key} onClick={() => setTab(key)}>
            <Icon className="w-3 h-3" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'artifacts' && <ArtifactsTab />}
      {tab === 'blocks' && <BlocksTab />}
      {tab === 'integrity' && <IntegrityTab />}
      {tab === 'attesters' && <AttestersTab />}
    </div>
  );
}

/** A single stacked bar is a more honest read of three mutually exclusive buckets than a pie. */
function TrustBar({ stats }: { stats: LedgerStats }) {
  const order: { level: string; color: string }[] = [
    { level: 'trusted', color: 'var(--color-verified)' },
    { level: 'self-asserted', color: 'var(--color-caution)' },
    { level: 'unverifiable', color: 'var(--color-ink-ghost)' },
  ];
  const total = stats.byTrust.reduce((n, t) => n + t.c, 0) || 1;

  return (
    <Panel title="Verdict distribution">
      <div className="flex h-2 rounded-sm overflow-hidden mb-3.5">
        {order.map(({ level, color }) => {
          const count = stats.byTrust.find(t => t.trust_level === level)?.c ?? 0;
          if (!count) return null;
          return (
            <div
              key={level}
              style={{ width: `${(count / total) * 100}%`, background: color }}
              title={`${level}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {order.map(({ level, color }) => {
          const count = stats.byTrust.find(t => t.trust_level === level)?.c ?? 0;
          return (
            <div key={level} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-xs text-[var(--color-ink-dim)] capitalize">{level}</span>
              <span className="mono text-xs tnum text-[var(--color-ink)]">{count}</span>
              <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
                {Math.round((count / total) * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

function ArtifactsTab() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [trust, setTrust] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      getLedgerArtifacts({ page, limit: 15, search, trust })
        .then(({ artifacts, pagination }) => {
          setArtifacts(artifacts);
          setPages(pagination.pages);
          setTotal(pagination.total);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [page, search, trust]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-ink-ghost)]" />
          <input
            className="field pl-8"
            placeholder="Search filename, model, creator or hash"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="field sm:w-48"
          value={trust}
          onChange={e => { setTrust(e.target.value); setPage(1); }}
        >
          <option value="">All verdicts</option>
          <option value="trusted">Trusted</option>
          <option value="self-asserted">Self-asserted</option>
          <option value="unverifiable">Unverifiable</option>
        </select>
      </div>

      <Panel inset>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded shimmer" />)}
          </div>
        ) : artifacts.length === 0 ? (
          <Empty icon={Database} title="No artifacts match" hint="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Artifact</th>
                  <th>Claimed model</th>
                  <th>Content hash</th>
                  <th>Block</th>
                  <th>Verdict</th>
                  <th className="text-right">Registered</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map(a => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/artifact/${a.id}`} className="text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors">
                        {a.filename}
                      </Link>
                      {a.status === 'derived' && (
                        <GitBranch className="inline w-3 h-3 ml-1.5 text-[var(--color-ink-ghost)]" />
                      )}
                    </td>
                    <td>
                      {a.model_name}
                      {a.model_provider && (
                        <span className="text-[var(--color-ink-ghost)]"> · {a.model_provider}</span>
                      )}
                    </td>
                    <td><Hash value={a.sha256} /></td>
                    <td className="mono text-xs tnum text-[var(--color-ink-faint)]">
                      {a.block_id ? `#${a.block_id - 1}` : '—'}
                    </td>
                    <td><Verdict level={a.trust_level} score={a.trust_score} /></td>
                    <td className="text-right mono text-xs text-[var(--color-ink-faint)]">
                      {relativeTime(a.registered_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Pager page={page} pages={pages} total={total} onPage={setPage} />
    </>
  );
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

function BlocksTab() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBlocks({ page, limit: 12 })
      .then(({ blocks, pagination }) => {
        setBlocks(blocks);
        setPages(pagination.pages);
        setTotal(pagination.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return <Panel><div className="py-10 flex justify-center text-[var(--color-ink-faint)]"><Spinner className="w-5 h-5" /></div></Panel>;
  }

  return (
    <>
      <Panel inset>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Height</th>
                <th>Mined</th>
                <th>Anchors</th>
                <th>Merkle root</th>
                <th>Block hash</th>
                <th>Links to</th>
                <th className="text-right">Nonce</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map(b => (
                <tr key={b.block_index}>
                  <td>
                    <span className="mono font-medium tnum text-[var(--color-ink)]">#{b.block_index}</span>
                    {b.block_index === 0 && (
                      <span className="ml-2 mono text-[10px] text-[var(--color-ink-ghost)] uppercase">genesis</span>
                    )}
                  </td>
                  <td className="mono text-xs text-[var(--color-ink-faint)] whitespace-nowrap">
                    {formatDate(b.timestamp)}
                  </td>
                  <td className="mono tnum">{b.artifact_ids.length}</td>
                  <td><Hash value={b.merkle_root} /></td>
                  <td>
                    {/* The leading zeros are the proof of work — worth showing. */}
                    <span className="hash">
                      <span className="text-[var(--color-verified)]">{b.hash.slice(0, 2)}</span>
                      {shortHash(b.hash.slice(2), 6, 6)}
                    </span>
                  </td>
                  <td>
                    {b.block_index === 0
                      ? <span className="mono text-[11px] text-[var(--color-ink-ghost)]">zero hash</span>
                      : <Hash value={b.prev_hash} />}
                  </td>
                  <td className="text-right mono text-xs tnum text-[var(--color-ink-faint)]">{b.nonce}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Pager page={page} pages={pages} total={total} onPage={setPage} />
    </>
  );
}

// ─── Integrity ───────────────────────────────────────────────────────────────

function IntegrityTab() {
  const [state, setState] = useState<{ valid: boolean; total_blocks: number; issues: ChainIssue[] } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = () => {
    setChecking(true);
    validateChain().then(setState).catch(() => {}).finally(() => setChecking(false));
  };

  useEffect(check, []);

  if (!state) {
    return <Panel><div className="py-10 flex justify-center text-[var(--color-ink-faint)]"><Spinner className="w-5 h-5" /></div></Panel>;
  }

  const color = state.valid ? 'var(--color-verified)' : 'var(--color-danger)';

  return (
    <div className="space-y-4">
      <div className="stamp" style={{ borderColor: color, color }}>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          {state.valid
            ? <ShieldCheck className="w-9 h-9 shrink-0" />
            : <ShieldAlert className="w-9 h-9 shrink-0" />}
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1" style={{ color }}>
              {state.valid ? 'Chain intact' : 'Integrity compromised'}
            </h2>
            <p className="text-[13px] text-[var(--color-ink-dim)] max-w-xl leading-relaxed">
              {state.valid
                ? `All ${state.total_blocks} blocks re-hash to their stored values, link to their predecessors, meet the difficulty target, and their Merkle roots still cover exactly the artifacts they anchor.`
                : `${state.issues.length} failure(s) across ${state.total_blocks} blocks. While the chain is broken, anchoring proves nothing and every trust score is capped.`}
            </p>
          </div>
          <button className="btn btn-secondary shrink-0" onClick={check} disabled={checking}>
            {checking ? <><Spinner className="w-3 h-3" /> Checking…</> : 'Re-check'}
          </button>
        </div>
      </div>

      <Panel title="Checks performed on every block">
        <ul className="space-y-2.5">
          {[
            ['Hash integrity', 'The stored hash is recomputed from the block contents. A mismatch means the block was edited after mining.'],
            ['Predecessor link', 'Each block must carry the hash of the one before it. A break means a block was replaced or removed.'],
            ['Proof of work', 'The hash must still meet the difficulty target it was mined against.'],
            ['Height continuity', 'Heights must be contiguous from genesis — a gap means a block is missing.'],
            ['Merkle coverage', 'The root is re-derived from the live artifact hashes. A mismatch means an anchored artifact was altered.'],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-2.5">
              <span className="w-1 h-1 rounded-full bg-[var(--color-ink-ghost)] mt-2 shrink-0" />
              <div>
                <span className="text-[13px] text-[var(--color-ink)]">{title}</span>
                <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {state.issues.length > 0 && (
        <Panel title={`${state.issues.length} failure(s)`}>
          <ul className="space-y-2">
            {state.issues.map((issue, i) => (
              <li key={i} className="panel-inset p-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-[var(--color-danger)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="mono text-[11px] text-[var(--color-danger)] uppercase tracking-wider">
                        {issue.type.replace(/_/g, ' ')}
                      </span>
                      {issue.block_index !== undefined && (
                        <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
                          block #{issue.block_index}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-ink-dim)] mt-1 leading-relaxed">{issue.message}</p>
                    {issue.expected && (
                      <div className="mt-2 grid gap-1">
                        <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
                          expected {shortHash(issue.expected, 14, 10)}
                        </span>
                        <span className="mono text-[10px] text-[var(--color-danger)]">
                          found&nbsp;&nbsp;&nbsp;&nbsp;{shortHash(issue.found ?? '', 14, 10)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// ─── Attesters ───────────────────────────────────────────────────────────────

function AttestersTab() {
  const [attesters, setAttesters] = useState<Attester[] | null>(null);

  useEffect(() => { getAttesters().then(setAttesters).catch(() => setAttesters([])); }, []);

  if (!attesters) {
    return <Panel><div className="py-10 flex justify-center text-[var(--color-ink-faint)]"><Spinner className="w-5 h-5" /></div></Panel>;
  }

  return (
    <div className="space-y-4">
      <Panel title="How attestation works">
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mb-3">
          A <strong className="text-[var(--color-ink)]">provider</strong> key has been vetted by the
          operator as genuinely belonging to that model provider. A valid signature from one is the
          only thing that lifts a record to trusted.
        </p>
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          A <strong className="text-[var(--color-ink)]">community</strong> key is a real key with no
          vetting behind it. Its signatures verify, and they do prove the same party made two
          claims — but they corroborate nothing about which model produced a file, so they cannot
          raise a verdict. Anyone can register one, which is precisely why they cannot confer trust.
        </p>
      </Panel>

      <Panel inset>
        {attesters.length === 0 ? (
          <Empty icon={Key} title="No attesters registered" hint="Run the backend seed script to provision demo provider keys." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Attester</th>
                  <th>Kind</th>
                  <th>Key fingerprint</th>
                  <th>Attestations</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {attesters.map(a => (
                  <tr key={a.id}>
                    <td className="text-[var(--color-ink)]">{a.name}</td>
                    <td>
                      <span
                        className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border"
                        style={{
                          color: a.kind === 'provider' ? 'var(--color-verified)' : 'var(--color-ink-faint)',
                          borderColor: a.kind === 'provider'
                            ? 'color-mix(in srgb, var(--color-verified) 30%, transparent)'
                            : 'var(--color-line-strong)',
                        }}
                      >
                        {a.kind}
                      </span>
                    </td>
                    <td><Hash value={a.key_fingerprint} /></td>
                    <td className="mono tnum">{a.attestation_count}</td>
                    <td className="text-right">
                      {a.revoked_at
                        ? <span className="mono text-[11px] text-[var(--color-danger)]">revoked</span>
                        : <span className="mono text-[11px] text-[var(--color-verified)]">active</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── Pager ───────────────────────────────────────────────────────────────────

function Pager({
  page, pages, total, onPage,
}: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) {
    return <p className="mono text-[11px] text-[var(--color-ink-ghost)] mt-3">{total} record(s)</p>;
  }
  return (
    <div className="flex items-center justify-between mt-3">
      <span className="mono text-[11px] text-[var(--color-ink-ghost)]">
        page {page} of {pages} · {total} record(s)
      </span>
      <div className="flex gap-1.5">
        <button className="btn btn-secondary px-2" disabled={page === 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button className="btn btn-secondary px-2" disabled={page === pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
