'use client';

import { useEffect, useState, useRef, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Check,
  X,
  Terminal,
  AlertTriangle,
  Layers,
  Sparkles,
  RefreshCw,
  Lock,
  Beaker,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Flame,
  Search,
} from 'lucide-react';
import {
  getScenarios,
  runScenario,
  resetDemoState,
  type Scenario,
  type ScenarioRun,
  type ChainIssue,
} from '@/lib/api';
import { VerdictBadge, Badge, Spinner, FadeIn, EmptyState, ErrorState, Skeleton } from '@/components/ui';

// ─── Semantic Category Metadata ──────────────────────────────────────────────

interface CategoryConfig {
  label: string;
  badgeCls: string;
  color: string;
  glow: string;
  description: string;
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  fabricated: {
    label: 'FABRICATED',
    badgeCls: 'bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)] border-[rgba(239,68,68,0.3)]',
    color: 'var(--color-danger)',
    glow: 'rgba(239, 68, 68, 0.25)',
    description: 'Forged signatures, self-minted identity keys, or fake derivation links',
  },
  tamper: {
    label: 'TAMPER',
    badgeCls: 'bg-[rgba(244,63,94,0.12)] text-[#f43f5e] border-[rgba(244,63,94,0.3)]',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.25)',
    description: 'Post-anchor record tampering or compromised private signing keys',
  },
  incomplete: {
    label: 'INCOMPLETE',
    badgeCls: 'bg-[rgba(245,158,11,0.12)] text-[var(--color-caution)] border-[rgba(245,158,11,0.3)]',
    color: 'var(--color-caution)',
    glow: 'rgba(245, 158, 11, 0.25)',
    description: 'Uncorroborated, sparse claims missing cryptographic parameters',
  },
  conflicting: {
    label: 'CONFLICTING',
    badgeCls: 'bg-[rgba(234,179,8,0.12)] text-[#eab308] border-[rgba(234,179,8,0.3)]',
    color: '#eab308',
    glow: 'rgba(234, 179, 8, 0.25)',
    description: 'Identical content hashes claimed by contradictory origins',
  },
  control: {
    label: 'CONTROL BENCHMARK',
    badgeCls: 'bg-[rgba(16,185,129,0.12)] text-[var(--color-verified)] border-[rgba(16,185,129,0.3)]',
    color: 'var(--color-verified)',
    glow: 'rgba(16, 185, 129, 0.25)',
    description: 'Legitimate web transformation baseline proving 0 false-positive penalties',
  },
};

// ─── Main Attack Lab Page ────────────────────────────────────────────────────

export default function AttackLabPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Run all state
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  // Reset modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadScenarios = () => {
    setIsLoadingScenarios(true);
    setLoadError(null);
    getScenarios()
      .then(data => setScenarios(data))
      .catch(() => setLoadError('Could not reach the adversarial simulation engine.'))
      .finally(() => setIsLoadingScenarios(false));
  };

  // Initial load
  useEffect(() => {
    loadScenarios();
  }, []);

  // Run a single scenario
  const handleRunOne = async (key: string) => {
    setBusyKey(key);
    try {
      const result = await runScenario(key);
      setRuns(prev => ({ ...prev, [key]: result }));
      setExpandedKeys(prev => new Set(prev).add(key));
    } catch (err) {
      console.error(`Failed to run scenario ${key}:`, err);
    } finally {
      setBusyKey(null);
    }
  };

  // Run all scenarios sequentially with live progress feedback
  const handleRunAll = async () => {
    if (scenarios.length === 0 || isRunningAll) return;
    setIsRunningAll(true);

    const updatedRuns = { ...runs };
    const newExpanded = new Set(expandedKeys);

    for (let i = 0; i < scenarios.length; i++) {
      const sc = scenarios[i];
      setRunAllProgress({ current: i + 1, total: scenarios.length, title: sc.title });
      setBusyKey(sc.key);

      try {
        const result = await runScenario(sc.key);
        updatedRuns[sc.key] = result;
        setRuns({ ...updatedRuns });
        newExpanded.add(sc.key);
        setExpandedKeys(new Set(newExpanded));
      } catch (err) {
        console.error(`Failed scenario ${sc.key} during batch run:`, err);
      }

      // Small delay between executions for rhythmic execution visual
      await new Promise(res => setTimeout(res, 220));
    }

    setBusyKey(null);
    setIsRunningAll(false);
    setRunAllProgress(null);
  };

  // Handle Demo Reset
  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      const res = await resetDemoState();
      setRuns({});
      setExpandedKeys(new Set());
      setResetFeedback(res.message || 'Demo state restored to clean seed baseline.');
      setTimeout(() => setResetFeedback(null), 4000);
      setIsResetModalOpen(false);
    } catch (err) {
      console.error('Reset failed:', err);
      setResetFeedback('Reset failed. Check server console.');
      setTimeout(() => setResetFeedback(null), 4000);
      setIsResetModalOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Scoreboard metrics calculation
  const completedRuns = Object.values(runs);
  const totalCompleted = completedRuns.length;

  const attackRuns = completedRuns.filter(r => r.category !== 'control');
  const attacksCaught = attackRuns.filter(r => r.defended).length;
  const totalAttacksRun = attackRuns.length;

  const controlRun = completedRuns.find(r => r.category === 'control');
  const controlPassed = controlRun ? controlRun.defended : null;

  // Filtered scenarios
  const filteredScenarios = scenarios.filter(s => {
    const matchesFilter =
      filterCategory === 'all'
        ? true
        : filterCategory === 'attacks'
        ? s.category !== 'control'
        : filterCategory === 'control'
        ? s.category === 'control'
        : s.category === filterCategory;

    const matchesSearch =
      searchQuery.trim() === '' ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.threat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <FadeIn className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      {/* ── Page Header ── */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-danger)] animate-pulse" />
            <p className="eyebrow text-[10px] text-[var(--color-danger)] tracking-widest uppercase">
              ATTACK LAB // RED-TEAM VERIFICATION SUITE
            </p>
          </div>

          {/* Quick status pill */}
          <div className="flex items-center gap-2 text-xs mono text-[var(--color-ink-faint)]">
            <span className="px-2 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line-subtle)]">
              SANDBOX: SQLITE TX ROLLBACK
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line-subtle)] text-[var(--color-verified)]">
              LEDGER SAFE
            </span>
          </div>
        </div>

        <h1 className="font-display font-serif text-3xl sm:text-5xl font-normal tracking-tight mb-2 text-[var(--color-ink)]">
          Attack Lab
        </h1>

        <p className="text-base sm:text-lg text-[var(--color-ink-dim)] max-w-3xl leading-snug font-medium mb-3">
          Every attack below is real, and every one gets caught. Run them.
        </p>

        <p className="text-xs sm:text-sm text-[var(--color-ink-faint)] max-w-3xl leading-relaxed">
          Each scenario stages a real attack against the live trust engine — inserting real rows,
          signing with real Ed25519 keys, and executing real Merkle tree validation. No verdicts
          are hard-coded. Every run executes inside a database transaction that is immediately rolled
          back, leaving the immutable blockchain ledger untouched.
        </p>
      </header>

      {/* ── Global Controls & Reset Strip ── */}
      <div className="panel p-4 mb-6 bg-[var(--color-surface-1)] border-[var(--color-line)] shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Action triggers */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              className="btn btn-primary px-4 py-2 text-sm flex items-center gap-2 shadow-[0_0_16px_rgba(6,182,212,0.25)]"
              onClick={handleRunAll}
              disabled={isRunningAll || scenarios.length === 0}
            >
              {isRunningAll ? (
                <>
                  <Spinner className="w-4 h-4" />
                  <span>Executing Attack Suite…</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current text-current" />
                  <span>Run all scenarios</span>
                </>
              )}
            </button>

            <button
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 hover:border-[rgba(239,68,68,0.4)] hover:text-[var(--color-danger)] transition-colors"
              onClick={() => setIsResetModalOpen(true)}
              disabled={isRunningAll || isResetting}
              title="Reset the database to clean seed state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset demo state</span>
            </button>

            {resetFeedback && (
              <span className="mono text-xs text-[var(--color-verified)] flex items-center gap-1.5 animate-fadeIn">
                <Check className="w-3.5 h-3.5" /> {resetFeedback}
              </span>
            )}
          </div>

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-ghost)]" />
            <input
              type="text"
              placeholder="Filter attacks & threats…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>
        </div>

        {/* Sequential Execution Progress Bar */}
        {isRunningAll && runAllProgress && (
          <div className="mt-4 pt-3 border-t border-[var(--color-line-subtle)]">
            <div className="flex items-center justify-between text-xs mono mb-1.5">
              <span className="text-[var(--color-accent)] font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-ping" />
                Executing Scenario {runAllProgress.current} of {runAllProgress.total}:{' '}
                <span className="text-[var(--color-ink)] font-normal">{runAllProgress.title}</span>
              </span>
              <span className="text-[var(--color-ink-dim)]">
                {Math.round((runAllProgress.current / runAllProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[var(--color-surface-3)] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-verified)]"
                initial={{ width: 0 }}
                animate={{ width: `${(runAllProgress.current / runAllProgress.total) * 100}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Summary Scoreboard (visible when runs exist) ── */}
      <AnimatePresence>
        {totalCompleted > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="panel p-4 mb-6 bg-gradient-to-r from-[var(--color-surface-2)] via-[var(--color-surface-1)] to-[var(--color-surface-2)] border-[var(--color-line)] shadow-xl"
          >
            <div className="flex items-center justify-between mb-3 border-b border-[var(--color-line-subtle)] pb-2 flex-wrap gap-2">
              <span className="eyebrow text-[11px] text-[var(--color-accent)] flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" /> ATTACK DEFENSE SCOREBOARD
              </span>
              <span className="mono text-[11px] text-[var(--color-ink-faint)]">
                {totalCompleted} of {scenarios.length} executed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Stat 1: Attacks Caught */}
              <div className="panel-inset p-3 bg-[rgba(239,68,68,0.03)] border-[rgba(239,68,68,0.2)]">
                <span className="label text-[10px] text-[var(--color-danger)] block mb-1">
                  ATTACKS CAUGHT
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="mono text-2xl font-bold text-[var(--color-ink)]">
                    {attacksCaught} / {totalAttacksRun}
                  </span>
                  <span
                    className={`mono text-xs px-1.5 py-0.5 rounded font-semibold ${
                      attacksCaught === totalAttacksRun && totalAttacksRun > 0
                        ? 'bg-[var(--color-verified-bg)] text-[var(--color-verified)] border border-[var(--color-verified-line)]'
                        : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-line)]'
                    }`}
                  >
                    {totalAttacksRun > 0
                      ? `${Math.round((attacksCaught / totalAttacksRun) * 100)}% DEFENDED`
                      : 'PENDING'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-ink-dim)] mt-1">
                  Forged keys, edited blocks & lineage lies intercepted.
                </p>
              </div>

              {/* Stat 2: False Positive Check */}
              <div className="panel-inset p-3 bg-[rgba(16,185,129,0.03)] border-[rgba(16,185,129,0.2)]">
                <span className="label text-[10px] text-[var(--color-verified)] block mb-1">
                  FALSE POSITIVE BENCHMARK
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="mono text-2xl font-bold text-[var(--color-ink)]">
                    {controlRun ? (controlPassed ? '0' : '1') : '—'}
                  </span>
                  <span
                    className={`mono text-xs px-1.5 py-0.5 rounded font-semibold ${
                      controlRun
                        ? controlPassed
                          ? 'bg-[var(--color-verified-bg)] text-[var(--color-verified)] border border-[var(--color-verified-line)]'
                          : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-line)]'
                        : 'bg-[var(--color-surface-3)] text-[var(--color-ink-dim)]'
                    }`}
                  >
                    {controlRun ? (controlPassed ? 'BENCHMARK PASSED' : 'FALSE POSITIVE') : 'UNTESTED'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-ink-dim)] mt-1">
                  Legitimate JPEG re-encode verified through custody unbroken.
                </p>
              </div>

              {/* Stat 3: Defense Matrix Status */}
              <div className="panel-inset p-3">
                <span className="label text-[10px] text-[var(--color-accent)] block mb-1">
                  ENGINE DEFENSE STATUS
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      attacksCaught === totalAttacksRun && controlPassed !== false
                        ? 'bg-[var(--color-verified)] animate-pulse'
                        : 'bg-[var(--color-danger)]'
                    }`}
                  />
                  <span className="mono text-base font-bold text-[var(--color-ink)]">
                    {attacksCaught === totalAttacksRun && controlPassed !== false
                      ? 'DEFENSE MATRIX INTACT'
                      : 'DEFENSE BREACH'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-ink-dim)] mt-1">
                  All transaction changes rolled back cleanly. Zero ledger residue.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Category Filter Pills ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 no-scrollbar">
        {[
          { key: 'all', label: `All Scenarios (${scenarios.length})` },
          { key: 'attacks', label: `Attacks Only (${scenarios.filter(s => s.category !== 'control').length})` },
          { key: 'control', label: 'Control Benchmark (1)' },
          { key: 'fabricated', label: 'Fabricated' },
          { key: 'tamper', label: 'Tamper' },
          { key: 'incomplete', label: 'Incomplete' },
          { key: 'conflicting', label: 'Conflicting' },
        ].map(tab => {
          const isActive = filterCategory === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilterCategory(tab.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                isActive
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-ink)] border-[var(--color-accent-line)] shadow-sm'
                  : 'bg-[var(--color-surface-1)] text-[var(--color-ink-faint)] border-[var(--color-line-subtle)] hover:border-[var(--color-line)] hover:text-[var(--color-ink-dim)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Scenario Cards List ── */}
      {isLoadingScenarios ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="panel p-5 animate-pulse flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-24 bg-[var(--color-surface-2)] rounded" />
                  <div className="h-5 w-48 bg-[var(--color-surface-2)] rounded" />
                </div>
                <div className="h-8 w-20 bg-[var(--color-surface-2)] rounded" />
              </div>
              <div className="h-4 w-3/4 bg-[var(--color-surface-2)] rounded" />
              <div className="h-4 w-1/2 bg-[var(--color-surface-2)] rounded" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="panel p-6">
          <ErrorState
            title="Failed to load attack lab"
            message={loadError}
            onRetry={loadScenarios}
          />
        </div>
      ) : filteredScenarios.length === 0 ? (
        <div className="panel p-6">
          <EmptyState
            icon={Search}
            title="No attack scenarios match"
            hint="Adjust your category filter or search query."
            action={
              <button
                type="button"
                className="btn btn-secondary text-xs mt-3"
                onClick={() => {
                  setFilterCategory('all');
                  setSearchQuery('');
                }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredScenarios.map(sc => (
            <AttackScenarioCard
              key={sc.key}
              scenario={sc}
              run={runs[sc.key]}
              isBusy={busyKey === sc.key}
              isExpanded={expandedKeys.has(sc.key)}
              onToggle={() => toggleExpand(sc.key)}
              onRun={() => handleRunOne(sc.key)}
            />
          ))}
        </div>
      )}

      {/* ── Reset Demo State Confirmation Dialog ── */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="panel max-w-md w-full p-6 bg-[var(--color-surface-1)] border-[rgba(239,68,68,0.3)] shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-[var(--color-danger)]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-ink)]">
                    Reset Demo State?
                  </h3>
                  <p className="text-xs text-[var(--color-ink-dim)]">
                    Restore the ledger to its pristine seeded condition.
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed mb-6">
                This will re-mine the 8 demo proof-of-work blocks, restore the 4 vetted provider
                attestation keys, clear any test artifacts, and reset scenario execution caches.
                This operation takes less than 1 second.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  className="btn btn-secondary text-xs px-3 py-1.5"
                  onClick={() => setIsResetModalOpen(false)}
                  disabled={isResetting}
                >
                  Cancel
                </button>
                <button
                  className="btn bg-[var(--color-danger)] hover:bg-[#dc2626] text-white text-xs px-4 py-1.5 flex items-center gap-1.5"
                  onClick={handleConfirmReset}
                  disabled={isResetting}
                >
                  {isResetting ? <Spinner className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>{isResetting ? 'Resetting…' : 'Confirm Reset'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </FadeIn>
  );
}

// ─── Scenario Card Component ─────────────────────────────────────────────────

function AttackScenarioCard({
  scenario,
  run,
  isBusy,
  isExpanded,
  onToggle,
  onRun,
}: {
  scenario: Scenario;
  run?: ScenarioRun;
  isBusy: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const isControl = scenario.category === 'control';
  const cat = CATEGORY_MAP[scenario.category] || {
    label: scenario.category.toUpperCase(),
    badgeCls: 'bg-[var(--color-surface-2)] text-[var(--color-ink-dim)] border-[var(--color-line)]',
    color: 'var(--color-ink-dim)',
    glow: 'rgba(255,255,255,0.05)',
    description: '',
  };

  // Distinct calm green styling for the control benchmark
  const cardBorderCls = isControl
    ? 'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.02)] hover:border-[rgba(16,185,129,0.55)]'
    : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]';

  return (
    <article
      className={`panel transition-all overflow-hidden ${cardBorderCls} ${
        isExpanded ? 'shadow-xl' : 'shadow-sm'
      }`}
    >
      {/* ── Top Header Row ── */}
      <div className="p-4 sm:p-5 flex items-start gap-4 justify-between">
        <div className="flex-1 min-w-0">
          {/* Badges & Outcomes */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className={`mono text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-[3px] border ${cat.badgeCls}`}>
              {cat.label}
            </span>

            {isControl && (
              <span className="mono text-[10px] text-[var(--color-verified)] px-2 py-0.5 rounded bg-[var(--color-verified-dim)] border border-[var(--color-verified-line)] flex items-center gap-1">
                <Check className="w-3 h-3" /> BENCHMARK (NOT AN ATTACK)
              </span>
            )}

            {run && (
              <span
                className={`inline-flex items-center gap-1.5 mono text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded border ${
                  run.defended
                    ? 'bg-[var(--color-verified-bg)] text-[var(--color-verified)] border-[var(--color-verified-line)]'
                    : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-line)]'
                }`}
              >
                {run.defended ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {run.defended
                  ? isControl
                    ? 'PASS: LEGITIMATE CLAIM VERIFIED'
                    : 'PASS: ATTACK CAUGHT'
                  : 'FAIL: ATTACK BYPASS'}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-base sm:text-lg font-semibold text-white mb-1 flex items-center gap-2">
            {scenario.title}
          </h2>

          {/* Threat summary */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
            {scenario.threat}
          </p>

          {/* Expected outcome */}
          <div className="flex items-start gap-1.5 text-xs bg-[var(--color-surface-2)] px-3 py-2 rounded border border-[var(--color-line-subtle)]">
            <span className="mono text-[10px] text-[var(--color-accent)] font-semibold uppercase tracking-wider shrink-0 mt-0.5">
              EXPECTED:
            </span>
            <span className="text-slate-200 leading-relaxed">{scenario.expectation}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2 shrink-0 pt-0.5">
          <button
            className={`btn text-xs px-3.5 py-2 flex items-center gap-1.5 font-medium transition-all ${
              run
                ? 'btn-secondary hover:border-[var(--color-accent)]'
                : 'btn-primary shadow-[0_0_12px_rgba(6,182,212,0.25)]'
            }`}
            onClick={onRun}
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Spinner className="w-3.5 h-3.5" />
                <span>Running…</span>
              </>
            ) : run ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-run</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-current" />
                <span>Run</span>
              </>
            )}
          </button>

          {run && (
            <button
              className="btn btn-ghost text-xs px-2.5 py-1.5 flex items-center justify-between text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              onClick={onToggle}
            >
              <span>{isExpanded ? 'Hide Trace' : 'View Trace'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isExpanded ? 'rotate-180 text-[var(--color-accent)]' : ''
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded Live Terminal-Style Log & Big Result Bar ── */}
      <AnimatePresence>
        {run && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[var(--color-line)] bg-[#040609]"
          >
            {/* 1. Big Result Bar (Expected vs Actual) */}
            <div
              className={`p-4 sm:p-5 border-b ${
                run.defended
                  ? 'bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.25)]'
                  : 'bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.25)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  {run.defended ? (
                    <div className="w-7 h-7 rounded-full bg-[rgba(16,185,129,0.2)] border border-[rgba(16,185,129,0.4)] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-[var(--color-verified)]" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[rgba(239,68,68,0.2)] border border-[rgba(239,68,68,0.4)] flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-[var(--color-danger)]" />
                    </div>
                  )}
                  <div>
                    <span className="mono text-xs font-bold tracking-wider uppercase block"
                      style={{ color: run.defended ? 'var(--color-verified)' : 'var(--color-danger)' }}
                    >
                      {run.defended
                        ? isControl
                          ? 'RESULT: PASS — BENCHMARK VERIFIED'
                          : 'RESULT: PASS — ATTACK CAUGHT'
                        : 'RESULT: FAIL — VULNERABILITY DETECTED'}
                    </span>
                    <span className="text-[11px] text-[var(--color-ink-dim)]">
                      {run.defended
                        ? isControl
                          ? 'Custody survived re-encoding with zero false penalties.'
                          : 'Engine recognized the forgery and denied unearned trust.'
                        : 'Attack reached a higher trust score than permitted.'}
                    </span>
                  </div>
                </div>

                {/* Verdict Transition Badges (Before -> After) */}
                <div className="flex items-center gap-3 bg-[var(--color-surface-1)] px-3 py-1.5 rounded border border-[var(--color-line)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] mono text-[var(--color-ink-ghost)]">BEFORE</span>
                    <VerdictBadge level={run.before.level} score={run.before.score} />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] mono text-[var(--color-ink-ghost)]">AFTER</span>
                    <VerdictBadge level={run.after.level} score={run.after.score} />
                  </div>

                  {run.before.score !== undefined && run.after.score !== undefined && (
                    <span
                      className={`mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        run.after.score < run.before.score
                          ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                          : run.after.score > run.before.score
                          ? 'bg-[var(--color-verified-bg)] text-[var(--color-verified)]'
                          : 'bg-[var(--color-surface-3)] text-[var(--color-ink-dim)]'
                      }`}
                    >
                      {run.after.score - run.before.score > 0 ? '+' : ''}
                      {run.after.score - run.before.score} pts
                    </span>
                  )}
                </div>
              </div>

              {/* Secondary record verdict if present (e.g. Conflicting Claims) */}
              {run.secondary && (
                <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex items-center gap-2 text-xs">
                  <span className="text-[var(--color-ink-faint)]">Secondary contradictory claim:</span>
                  <VerdictBadge level={run.secondary.level} score={run.secondary.score} />
                  <span className="mono text-[10px] text-[var(--color-caution)]">
                    [CAPPED DUE TO CONFLICTING ORIGIN CLAIM]
                  </span>
                </div>
              )}

              {/* Finding conclusion text */}
              <div className="mt-3 text-xs leading-relaxed text-[var(--color-ink-dim)] bg-[rgba(0,0,0,0.3)] p-3 rounded border border-[rgba(255,255,255,0.05)]">
                <span className="mono text-[10px] text-[var(--color-ink-ghost)] uppercase block mb-1">
                  FORENSIC CONCLUSION:
                </span>
                {run.conclusion}
              </div>
            </div>

            {/* 2. Live Terminal Execution Trace */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 text-xs mono text-[var(--color-ink-ghost)] border-b border-[rgba(255,255,255,0.06)] pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                  </div>
                  <span className="text-[var(--color-accent)] font-semibold text-[11px] ml-2">
                    TERMINAL // EXECUTION TRACE
                  </span>
                </div>
                <span className="text-[10px] text-[var(--color-ink-faint)]">
                  {run.steps.length} STAGES EVALUATED
                </span>
              </div>

              {/* Terminal Lines Container */}
              <div className="bg-[#020406] p-4 rounded border border-[rgba(255,255,255,0.06)] font-mono text-xs space-y-3">
                {run.steps.map((step, idx) => {
                  const isLast = idx === run.steps.length - 1;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.06, duration: 0.18 }}
                      className="flex items-start gap-3 group"
                    >
                      <span className="text-[10px] text-[var(--color-accent)] opacity-70 shrink-0 select-none">
                        [{String(idx + 1).padStart(2, '0')}/{String(run.steps.length).padStart(2, '0')}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[var(--color-ink)] font-semibold text-[11px]">
                            {step.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-ink-faint)] mt-0.5 leading-relaxed">
                          {step.detail}
                        </p>
                      </div>
                      {isLast && (
                        <span className="w-2 h-4 bg-[var(--color-accent)] animate-pulse shrink-0 self-center" />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* 3. Chain Integrity Breaches (if any detected) */}
              {run.chain_issues && run.chain_issues.length > 0 && (
                <div className="mt-4 p-3 rounded bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.3)]">
                  <div className="flex items-center gap-2 mb-2 text-xs mono text-[var(--color-danger)] font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>CHAIN INTEGRITY BREACH DETECTED</span>
                  </div>
                  <div className="space-y-1.5">
                    {run.chain_issues.map((issue, i) => (
                      <div key={i} className="text-xs mono text-[var(--color-ink-dim)] bg-black/40 p-2 rounded">
                        <span className="text-[var(--color-danger)] uppercase font-bold mr-2">
                          [{issue.type}]
                        </span>
                        {issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Applied Engine Limits / Gates */}
              {run.after.gates && run.after.gates.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                  <span className="mono text-[10px] text-[var(--color-ink-ghost)] uppercase tracking-wider block mb-2">
                    LIMITS & GATES APPLIED BY TRUST ENGINE:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {run.after.gates.map((g, i) => (
                      <div
                        key={i}
                        className="px-2.5 py-1 rounded bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-xs mono text-[var(--color-caution)] flex items-center gap-1.5"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Ceiling {g.ceiling}/100: {g.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Terminal Footer Note */}
              <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between text-[10px] mono text-[var(--color-ink-ghost)] flex-wrap gap-2">
                <span>[TRANSACTION STATUS: ROLLED BACK // 0 LEDGER ROWS COMMITTED]</span>
                <span>STATUS: VERIFIED SANDBOX ISOLATION</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
