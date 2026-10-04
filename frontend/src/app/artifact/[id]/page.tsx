'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, GitBranch, Blocks, Lock, AlertTriangle, CheckCircle2,
  FileText, Key, ArrowRight, XCircle, Eye, Sparkles, X, Plus,
} from 'lucide-react';
import {
  getArtifact, getArtifactChain, getAttesters, getDemoKeys, getDemoPrompts,
  attest, provePrompt, formatBytes, formatDate, fileKind,
  type Artifact, type TrustReport, type Block, type InclusionProof, type Attester,
} from '@/lib/api';
import {
  Panel, Verdict, Hash, KV, ScoreDial, EvidenceTable, GateList, Spinner, Empty, FadeIn, ErrorState, Skeleton,
} from '@/components/ui';

type ChainData = Awaited<ReturnType<typeof getArtifactChain>>;

export default function ArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [data, setData] = useState<{
    artifact: Artifact; trust: TrustReport; block: Block | null;
    inclusion_proof: InclusionProof | null;
  } | null>(null);
  const [chain, setChain] = useState<ChainData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAttestModal, setShowAttestModal] = useState(false);
  const [demoPrompts, setDemoPrompts] = useState<Record<string, string>>({});

  const reload = () => {
    setError(null);
    getArtifact(id).then(setData).catch(() => setError('This artifact is not on the ledger.'));
    getArtifactChain(id).then(setChain).catch(() => {});
  };

  useEffect(() => {
    reload();
    getDemoPrompts().then(setDemoPrompts).catch(() => {});
  }, [id]);

  if (error) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-16">
        <ErrorState
          icon={XCircle}
          title="Evidence record unreachable"
          message={error}
          onRetry={reload}
        />
        <div className="flex justify-center mt-3">
          <Link href="/ledger" className="btn btn-ghost text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to ledger
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-10" aria-label="Loading artifact details">
        <Skeleton className="h-4 w-24 mb-6" />
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 mb-8">
          <div className="space-y-3 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-8 w-3/4 max-w-md" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
          <Skeleton className="w-28 h-28 rounded-full shrink-0" />
        </div>
        <div className="grid lg:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-md" />
            <Skeleton className="h-72 w-full rounded-md" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-md" />
            <Skeleton className="h-44 w-full rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  const { artifact: a, trust, block, inclusion_proof: proof } = data;

  return (
    <FadeIn className="max-w-[1100px] mx-auto px-4 py-10">
      <Link href="/ledger" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] mb-5">
        <ArrowLeft className="w-3 h-3" /> Back to ledger
      </Link>

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start gap-5 mb-7">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="label text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-line)]">
              {fileKind(a.filetype)}
            </span>
            <span className="mono text-[10px] text-[var(--color-ink-ghost)]">
              CASE #{a.id.slice(0, 8)}
            </span>
            {a.status === 'derived' && (
              <span className="mono text-[10px] text-[var(--color-accent)] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-accent-dim)] border border-[var(--color-accent-line)]">
                <GitBranch className="w-2.5 h-2.5" /> derived
              </span>
            )}
          </div>
          <h1 className="font-display font-serif text-2xl sm:text-3xl font-normal tracking-tight mb-2 break-all">
            {a.filename}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Verdict level={a.trust_level} score={trust.score} />
            <Hash value={a.sha256} />
          </div>
        </div>
        <ScoreDial score={trust.score} level={trust.level} />
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">

          {trust.gates.length > 0 && (
            <Panel title="Limits applied">
              <GateList gates={trust.gates} />
            </Panel>
          )}

          <Panel title={`Evidence · ${trust.earned} of ${trust.available} weighted points`}>
            <EvidenceTable factors={trust.factors} />
          </Panel>

          {/* Attestations */}
          <Panel
            title="Attestations"
            actions={
              <button
                className="btn btn-secondary text-xs px-2.5 py-1"
                onClick={() => setShowAttestModal(true)}
              >
                <Key className="w-3 h-3 mr-1" /> Attach attestation
              </button>
            }
          >
            {trust.attestations.length === 0 ? (
              <div>
                <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mb-3">
                  Nobody has signed this record. The origin rests entirely on the uploader&rsquo;s word,
                  which is why it cannot rise above self-asserted.
                </p>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => setShowAttestModal(true)}
                >
                  <Plus className="w-3 h-3 mr-1" /> Sign this record with a provider key
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {trust.attestations.map(att => {
                  const ok = att.counts_as_independent;
                  const color = ok ? 'var(--color-verified)'
                    : att.signature_valid ? 'var(--color-caution)' : 'var(--color-danger)';
                  return (
                    <li key={att.id} className="panel-inset p-3">
                      <div className="flex items-start gap-2.5">
                        <Key className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium">{att.attester_name}</span>
                            <span className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border border-[var(--color-line-strong)] text-[var(--color-ink-faint)]">
                              {att.kind}
                            </span>
                            {att.key_revoked && (
                              <span className="mono text-[10px] text-[var(--color-danger)] font-medium">revoked</span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color }}>
                            {!att.signature_valid
                              ? 'Signature does not match this record — it was altered after signing, or forged.'
                              : ok
                                ? 'Valid signature from a vetted key matching the named provider. This is what corroborates the claim.'
                                : att.key_revoked
                                  ? 'Signature is valid but the key has been revoked, so it no longer corroborates anything.'
                                  : 'Valid signature, but this key is not a vetted provider key matching the named provider — it proves who signed, not what produced the file.'}
                          </p>
                          <p className="mono text-[10px] text-[var(--color-ink-ghost)] mt-1.5">
                            {att.key_fingerprint.slice(0, 16)} · {formatDate(att.signed_at)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Privacy-Preserving Prompt Proof (if prompt was recorded) */}
          {a.prompt_recorded && (
            <PromptProofPanel
              artifactId={a.id}
              filename={a.filename}
              demoPrompt={demoPrompts[a.filename]}
            />
          )}

          {/* Chain of custody */}
          {chain && (chain.ancestors.length > 0 || chain.descendants.length > 0) && (
            <Panel title="Chain of custody">
              {!chain.intact && (
                <div className="flex items-start gap-2 p-2.5 mb-4 rounded-[3px] border"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--color-danger) 7%, transparent)',
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-[var(--color-danger)] shrink-0" />
                  <div>
                    {chain.breaks.map((b, i) => (
                      <p key={i} className="text-xs text-[var(--color-danger)] leading-relaxed">{b.message}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="custody">
                {/* Ancestors run oldest-first, so reverse the walk-back order. */}
                {[...chain.ancestors].reverse().map((step, i) => (
                  <div key={i} className="custody-node" data-state={step.link_valid ? 'ok' : 'broken'}>
                    <div className="flex items-baseline gap-2 flex-wrap mb-1">
                      <span className="text-sm">
                        {step.artifact
                          ? <Link href={`/artifact/${step.artifact.id}`} className="hover:text-[var(--color-accent)]">
                              {step.artifact.filename}
                            </Link>
                          : <span className="text-[var(--color-danger)]">missing parent</span>}
                      </span>
                      {step.artifact && <Verdict level={step.artifact.trust_level} />}
                    </div>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      {step.transformation.transform_type} — {step.transformation.transform_description}
                      {step.transformation.transformer_model && ` · ${step.transformation.transformer_model}`}
                    </p>
                    {!step.link_valid && (
                      <p className="text-xs text-[var(--color-danger)] mt-1">
                        Declared input hash does not match this parent — provenance does not carry across this step.
                      </p>
                    )}
                  </div>
                ))}

                <div className="custody-node" data-state={chain.intact ? 'ok' : 'broken'}>
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">{a.filename}</span>
                    <span className="mono text-[10px] text-[var(--color-ink-ghost)]">this artifact</span>
                  </div>
                  <p className="text-xs text-[var(--color-ink-faint)]">{formatDate(a.registered_at)}</p>
                </div>

                {chain.descendants.map((d, i) => (
                  <div key={i} className="custody-node" data-state="ok">
                    <div className="flex items-baseline gap-2 flex-wrap mb-1">
                      <span className="text-sm">
                        {d.artifact
                          ? <Link href={`/artifact/${d.artifact.id}`} className="hover:text-[var(--color-accent)]">
                              {d.artifact.filename}
                            </Link>
                          : 'unknown derivative'}
                      </span>
                      {d.artifact && <Verdict level={d.artifact.trust_level} />}
                    </div>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      {d.transformation.transform_type} — {d.transformation.transform_description}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Conflicts */}
          {trust.conflicts.length > 0 && (
            <Panel title="Conflicting claims">
              <p className="text-[13px] text-[var(--color-ink-dim)] mb-3 leading-relaxed">
                These records claim identical content came from a different model. The ledger
                flags the contradiction rather than resolving it, because it has no evidence
                favouring either side.
              </p>
              <ul className="space-y-2">
                {trust.conflicts.map(c => (
                  <li key={c.artifact_id}>
                    <Link href={`/artifact/${c.artifact_id}`} className="flex items-center justify-between gap-3 panel-inset p-2.5 hover:border-[var(--color-line-strong)] transition-colors">
                      <span className="text-sm truncate">
                        claims <span className="text-[var(--color-caution)]">{c.claims_model}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[var(--color-ink-ghost)] shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <Panel title={<><FileText className="w-3 h-3 inline mr-1.5" />Record</>}>
            <KV items={[
              { k: 'Model', v: a.model_name },
              { k: 'Version', v: a.model_version },
              { k: 'Provider', v: a.model_provider },
              { k: 'Creator', v: a.creator },
              { k: 'Size', v: formatBytes(a.filesize) },
              { k: 'Type', v: a.filetype },
              { k: 'Registered', v: formatDate(a.registered_at) },
              {
                k: 'Prompt',
                v: a.prompt_recorded
                  ? <span className="inline-flex items-center gap-1 text-[var(--color-verified)]">
                      <Lock className="w-3 h-3" /> salted hash stored
                    </span>
                  : 'not recorded',
              },
            ]} />
            {a.generation_params && (
              <pre className="mt-3 panel-inset p-2.5 mono text-[11px] text-[var(--color-ink-dim)] overflow-x-auto">
                {prettyJson(a.generation_params)}
              </pre>
            )}
          </Panel>

          {block && (
            <Panel title={<><Blocks className="w-3 h-3 inline mr-1.5" />Anchor</>}>
              <KV items={[
                { k: 'Block', v: <span className="mono tnum">#{block.block_index}</span> },
                { k: 'Mined', v: formatDate(block.timestamp) },
                { k: 'Block hash', v: <Hash value={block.hash} /> },
                { k: 'Merkle root', v: <Hash value={block.merkle_root} /> },
                { k: 'Prev hash', v: <Hash value={block.prev_hash} /> },
                { k: 'Nonce', v: <span className="mono tnum">{block.nonce}</span> },
                ...(proof ? [
                  { k: 'Confirmations', v: <span className="mono tnum">{proof.confirmations}</span> },
                  {
                    k: 'Inclusion',
                    v: proof.valid
                      ? <span className="inline-flex items-center gap-1 text-[var(--color-verified)]">
                          <CheckCircle2 className="w-3 h-3" /> proved
                        </span>
                      : <span className="text-[var(--color-danger)]">failed</span>,
                  },
                ] : []),
              ]} />
            </Panel>
          )}

          <div className="space-y-2">
            <Link href={`/derive?parent=${a.id}`} className="btn btn-secondary w-full">
              <GitBranch className="w-3.5 h-3.5" /> Register a derivation
            </Link>
            <button
              className="btn btn-ghost w-full text-xs"
              onClick={() => setShowAttestModal(true)}
            >
              <Key className="w-3.5 h-3.5" /> Attach attestation
            </button>
          </div>
        </div>
      </div>

      {/* Attest Modal */}
      {showAttestModal && (
        <AttestModal
          artifact={a}
          onClose={() => setShowAttestModal(false)}
          onSuccess={() => {
            setShowAttestModal(false);
            reload();
          }}
        />
      )}
    </FadeIn>
  );
}

function PromptProofPanel({
  artifactId, filename, demoPrompt,
}: {
  artifactId: string; filename: string; demoPrompt?: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<{ matches: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (textToCheck?: string) => {
    const target = textToCheck || prompt;
    if (!target.trim()) return;
    setBusy(true);
    setState(null);
    try {
      const res = await provePrompt(artifactId, target);
      setState(res);
      if (res.matches) toast.success('Prompt confirmed! Hash match verified.');
      else toast.error('Prompt did not match.');
    } catch {
      toast.error('Could not verify the prompt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Prove the prompt — privacy-preserving verification">
      <div className="flex items-start gap-2.5 mb-4">
        <Eye className="w-4 h-4 mt-0.5 text-[var(--color-ink-faint)] shrink-0" />
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
          The original prompt was salted and hashed at registration. Enter the exact prompt here to prove you generated this file without disclosing the prompt to the ledger.
        </p>
      </div>

      {demoPrompt && (
        <div className="mb-3 panel-inset p-2.5 flex items-center justify-between gap-2">
          <div className="text-xs text-[var(--color-ink-dim)] truncate">
            <span className="mono text-[var(--color-accent)] font-medium">Seeded prompt: </span>
            &quot;{demoPrompt}&quot;
          </div>
          <button
            className="btn btn-secondary text-xs px-2 py-0.5 shrink-0"
            onClick={() => {
              setPrompt(demoPrompt);
              check(demoPrompt);
            }}
          >
            Auto-fill &amp; test
          </button>
        </div>
      )}

      <textarea
        className="field resize-none h-20 mb-3"
        placeholder="Paste original prompt to test against salted hash"
        value={prompt}
        onChange={e => { setPrompt(e.target.value); setState(null); }}
      />

      <button className="btn btn-secondary text-xs" onClick={() => check()} disabled={busy || !prompt.trim()}>
        {busy ? <><Spinner className="w-3 h-3" /> Checking…</> : <><Lock className="w-3.5 h-3.5" /> Test prompt</>}
      </button>

      {state && (
        <div
          className="mt-3 p-3 rounded-[3px] border text-[13px] leading-relaxed"
          style={{
            borderColor: `color-mix(in srgb, ${state.matches ? 'var(--color-verified)' : 'var(--color-danger)'} 30%, transparent)`,
            background: `color-mix(in srgb, ${state.matches ? 'var(--color-verified)' : 'var(--color-danger)'} 7%, transparent)`,
            color: state.matches ? 'var(--color-verified)' : 'var(--color-danger)',
          }}
        >
          {state.message}
        </div>
      )}
    </Panel>
  );
}

function AttestModal({
  artifact, onClose, onSuccess,
}: {
  artifact: Artifact; onClose: () => void; onSuccess: () => void;
}) {
  const [attesters, setAttesters] = useState<Attester[]>([]);
  const [demoKeys, setDemoKeys] = useState<Record<string, { attester_id: string; private_key: string }>>({});
  const [chosen, setChosen] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAttesters().then(list => {
      setAttesters(list);
      // Auto-select attester matching artifact's model_provider if possible
      const match = list.find(a => artifact.model_provider && a.name.toLowerCase() === artifact.model_provider.toLowerCase());
      if (match) setChosen(match.id);
      else if (list.length > 0) setChosen(list[0].id);
    }).catch(() => {});

    getDemoKeys().then(setDemoKeys).catch(() => {});
  }, [artifact.model_provider]);

  // When chosen attester changes, check if there's a demo key for it
  const selectedAttester = attesters.find(a => a.id === chosen);
  const matchingDemoKey = selectedAttester ? demoKeys[selectedAttester.name] : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !key.trim()) {
      toast.error('Choose an attester and provide their private key.');
      return;
    }
    setBusy(true);
    try {
      const res = await attest({ artifact_id: artifact.id, attester_id: chosen, private_key: key.trim() });
      if (res.signature_valid) {
        toast.success(res.message);
        onSuccess();
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? 'Attestation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg max-w-lg w-full shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[var(--color-verified)]" />
            <h3 className="font-semibold text-sm">Attach Attestation</h3>
          </div>
          <button className="btn btn-ghost p-1" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-4">
          <p className="text-xs text-[var(--color-ink-dim)] leading-relaxed">
            Signing this artifact with a vetted provider key lifts its score to <strong className="text-[var(--color-verified)]">trusted (100/100)</strong>. Signing with a community key confirms registrant identity without provider vetting.
          </p>

          <div>
            <label className="label block mb-1">Attester Key</label>
            <select
              className="field"
              value={chosen}
              onChange={e => {
                setChosen(e.target.value);
                setKey('');
              }}
            >
              {attesters.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.kind}){a.revoked_at ? ' [REVOKED]' : ''}
                </option>
              ))}
            </select>
          </div>

          {matchingDemoKey && (
            <div className="panel-inset p-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-verified)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Demo key available for {selectedAttester?.name}
              </span>
              <button
                type="button"
                className="btn btn-secondary text-xs px-2 py-0.5"
                onClick={() => setKey(matchingDemoKey.private_key)}
              >
                Auto-fill demo key
              </button>
            </div>
          )}

          <div>
            <label className="label block mb-1">Attester Private Key (PEM)</label>
            <textarea
              className="field mono text-xs h-28 resize-none"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              value={key}
              onChange={e => setKey(e.target.value)}
              required
            />
            <p className="text-[11px] text-[var(--color-ink-ghost)] mt-1">
              Signed locally against the artifact&apos;s canonical payload. The key is never persisted.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-line)]">
            <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary text-xs" disabled={busy || !chosen || !key.trim()}>
              {busy ? <><Spinner className="w-3 h-3" /> Verifying signature…</> : 'Sign attestation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function prettyJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
