'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, GitBranch, Blocks, Lock, AlertTriangle, CheckCircle2,
  FileText, Key, ArrowRight, XCircle,
} from 'lucide-react';
import {
  getArtifact, getArtifactChain, formatBytes, formatDate, fileKind,
  type Artifact, type TrustReport, type Block, type InclusionProof,
} from '@/lib/api';
import {
  Panel, Verdict, Hash, KV, ScoreDial, EvidenceTable, GateList, Spinner, Empty,
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

  useEffect(() => {
    getArtifact(id).then(setData).catch(() => setError('This artifact is not on the ledger.'));
    getArtifactChain(id).then(setChain).catch(() => {});
  }, [id]);

  if (error) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-10">
        <Empty icon={XCircle} title={error} hint="It may have been removed, or the identifier is wrong." />
        <div className="flex justify-center">
          <Link href="/ledger" className="btn btn-secondary"><ArrowLeft className="w-3.5 h-3.5" /> Back to ledger</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-20 flex justify-center text-[var(--color-ink-faint)]">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const { artifact: a, trust, block, inclusion_proof: proof } = data;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-10">
      <Link href="/ledger" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] mb-5">
        <ArrowLeft className="w-3 h-3" /> Ledger
      </Link>

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start gap-5 mb-7">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="label">{fileKind(a.filetype)}</span>
            {a.status === 'derived' && (
              <span className="mono text-[10px] text-[var(--color-accent)] inline-flex items-center gap-1">
                <GitBranch className="w-2.5 h-2.5" /> derived
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold mb-2 break-all">{a.filename}</h1>
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
          <Panel title="Attestations">
            {trust.attestations.length === 0 ? (
              <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
                Nobody has signed this record. The origin rests entirely on the uploader&rsquo;s word,
                which is why it cannot rise above self-asserted.
              </p>
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
                              <span className="mono text-[10px] text-[var(--color-danger)]">revoked</span>
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
                      <Lock className="w-3 h-3" /> hashed
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

          <Link href={`/derive?parent=${a.id}`} className="btn btn-secondary w-full">
            <GitBranch className="w-3.5 h-3.5" /> Register a derivation
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Pretty-print stored JSON, falling back to the raw string if it is malformed. */
function prettyJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
