'use client';

import { useEffect, useState } from 'react';
import {
  Play, ShieldCheck, ShieldAlert, Beaker, ChevronRight, ArrowRight, Check, X,
} from 'lucide-react';
import {
  getScenarios, runScenario, runAllScenarios,
  type Scenario, type ScenarioRun,
} from '@/lib/api';
import { Panel, Verdict, GateList, Spinner, Empty } from '@/components/ui';

const CATEGORY: Record<string, { label: string; color: string }> = {
  fabricated: { label: 'Fabricated', color: 'var(--color-danger)' },
  conflicting: { label: 'Conflicting', color: 'var(--color-caution)' },
  incomplete: { label: 'Incomplete', color: 'var(--color-caution)' },
  tamper: { label: 'Tamper', color: 'var(--color-danger)' },
  control: { label: 'Control', color: 'var(--color-verified)' },
};

export default function AdversarialPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { getScenarios().then(setScenarios).catch(() => {}); }, []);

  const runOne = async (key: string) => {
    setBusy(key);
    try {
      const result = await runScenario(key);
      setRuns(r => ({ ...r, [key]: result }));
      setOpen(key);
    } finally {
      setBusy(null);
    }
  };

  const runAll = async () => {
    setAllBusy(true);
    try {
      const { results } = await runAllScenarios();
      setRuns(Object.fromEntries(results.map(r => [r.key, r])));
    } finally {
      setAllBusy(false);
    }
  };

  const completed = Object.values(runs);
  const defended = completed.filter(r => r.defended).length;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-10">
      <header className="mb-7">
        <p className="eyebrow mb-2">Adversarial testing</p>
        <h1 className="text-2xl font-semibold mb-2">Try to break the trust engine</h1>
        <p className="text-sm text-[var(--color-ink-dim)] max-w-2xl leading-relaxed">
          Each scenario stages a real attack against the live scoring engine — inserting real
          records, signing with real keys, running the real validator. Nothing is mocked and no
          verdict is hard-coded. Every run happens inside a database transaction that is rolled
          back, so the ledger is left exactly as it was.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button className="btn btn-primary" onClick={runAll} disabled={allBusy}>
          {allBusy ? <><Spinner /> Running suite…</> : <><Play className="w-4 h-4" /> Run all scenarios</>}
        </button>

        {completed.length > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[3px] border mono text-xs"
            style={{
              color: defended === completed.length ? 'var(--color-verified)' : 'var(--color-danger)',
              borderColor: `color-mix(in srgb, ${defended === completed.length ? 'var(--color-verified)' : 'var(--color-danger)'} 30%, transparent)`,
              background: `color-mix(in srgb, ${defended === completed.length ? 'var(--color-verified)' : 'var(--color-danger)'} 8%, transparent)`,
            }}
          >
            {defended === completed.length
              ? <ShieldCheck className="w-3.5 h-3.5" />
              : <ShieldAlert className="w-3.5 h-3.5" />}
            {defended}/{completed.length} handled correctly
          </div>
        )}
      </div>

      {scenarios.length === 0 ? (
        <Empty icon={Beaker} title="Loading scenarios…" hint="Is the API running on port 4000?" />
      ) : (
        <div className="space-y-3">
          {scenarios.map(s => (
            <ScenarioCard
              key={s.key}
              scenario={s}
              run={runs[s.key]}
              busy={busy === s.key || allBusy}
              expanded={open === s.key}
              onToggle={() => setOpen(o => (o === s.key ? null : s.key))}
              onRun={() => runOne(s.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({
  scenario, run, busy, expanded, onToggle, onRun,
}: {
  scenario: Scenario; run?: ScenarioRun; busy: boolean;
  expanded: boolean; onToggle: () => void; onRun: () => void;
}) {
  const cat = CATEGORY[scenario.category] ?? { label: scenario.category, color: 'var(--color-ink-faint)' };
  const isControl = scenario.category === 'control';

  return (
    <article className="panel overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border"
              style={{
                color: cat.color,
                borderColor: `color-mix(in srgb, ${cat.color} 30%, transparent)`,
              }}
            >
              {cat.label}
            </span>
            {run && (
              <span
                className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-wider"
                style={{ color: run.defended ? 'var(--color-verified)' : 'var(--color-danger)' }}
              >
                {run.defended ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {run.defended ? (isControl ? 'as intended' : 'defended') : 'not defended'}
              </span>
            )}
          </div>

          <h2 className="text-sm font-semibold mb-1.5">{scenario.title}</h2>
          <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mb-2">{scenario.threat}</p>
          <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">
            <span className="text-[var(--color-ink-ghost)]">Expected: </span>
            {scenario.expectation}
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button className="btn btn-secondary text-xs" onClick={onRun} disabled={busy}>
            {busy ? <Spinner className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {run ? 'Re-run' : 'Run'}
          </button>
          {run && (
            <button className="btn btn-ghost text-xs" onClick={onToggle}>
              {expanded ? 'Hide' : 'Details'}
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {run && (
        <div className="border-t border-[var(--color-line)]">
          {/* Always-visible outcome */}
          <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-[var(--color-surface-2)]">
            <TrustDelta before={run.before} after={run.after} />
            {run.secondary && (
              <>
                <span className="text-[var(--color-ink-ghost)] text-xs">· second record</span>
                <Verdict level={run.secondary.level} score={run.secondary.score} />
              </>
            )}
          </div>

          {expanded && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="label mb-2.5">Execution trace</h3>
                <ol className="custody">
                  {run.steps.map((s, i) => (
                    <li key={i} className="custody-node" data-state={i === run.steps.length - 1 ? 'ok' : undefined}>
                      <p className="text-[13px] mb-0.5">{s.label}</p>
                      <p className="mono text-[11px] text-[var(--color-ink-faint)]">{s.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {run.after.gates && run.after.gates.length > 0 && (
                <div>
                  <h3 className="label mb-2.5">Limits the engine applied</h3>
                  <GateList gates={run.after.gates} />
                </div>
              )}

              {run.chain_issues && run.chain_issues.length > 0 && (
                <div>
                  <h3 className="label mb-2.5">Chain integrity failures detected</h3>
                  <ul className="space-y-1.5">
                    {run.chain_issues.map((issue, i) => (
                      <li key={i} className="panel-inset p-2.5">
                        <span className="mono text-[10px] text-[var(--color-danger)] uppercase tracking-wider">
                          {issue.type.replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs text-[var(--color-ink-dim)] mt-0.5 leading-relaxed">{issue.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className="p-3 rounded-[3px] border"
                style={{
                  borderColor: `color-mix(in srgb, ${run.defended ? 'var(--color-verified)' : 'var(--color-danger)'} 28%, transparent)`,
                  background: `color-mix(in srgb, ${run.defended ? 'var(--color-verified)' : 'var(--color-danger)'} 6%, transparent)`,
                }}
              >
                <h3 className="label mb-1.5" style={{ color: run.defended ? 'var(--color-verified)' : 'var(--color-danger)' }}>
                  Finding
                </h3>
                <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">{run.conclusion}</p>
              </div>

              {run.note && (
                <p className="mono text-[10px] text-[var(--color-ink-ghost)] leading-relaxed">{run.note}</p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function TrustDelta({
  before, after,
}: { before: Partial<ScenarioRun['before']>; after: Partial<ScenarioRun['after']> }) {
  return (
    <div className="flex items-center gap-2.5">
      <Verdict level={before.level} score={before.score} />
      <ArrowRight className="w-3.5 h-3.5 text-[var(--color-ink-ghost)]" />
      <Verdict level={after.level} score={after.score} />
    </div>
  );
}
