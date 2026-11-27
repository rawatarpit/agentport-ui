import Link from 'next/link'
import { ProofServedManifest } from '@/components/proof/proof-served-manifest'
import { Badge } from '@/components/stat'
import { Callout } from '@/components/ui/callout'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { TechnicalDetails } from '@/components/ui/technical-details'
import { getHome, getLatestPush } from '@/lib/backend-reads'
import { listDecisions, listHolds } from '@/lib/console-reads'
import { enforcingFromPush } from '@/lib/enforcing'
import { getGoLiveState } from '@/lib/go-live'
import { normaliseWorkerUrl } from '@/lib/install-package'
import { readAppliedConfig } from '@/lib/publish-state'
import { appliedProofFromConfig, formatProofTime, outcomeFromDecision } from '@/lib/proof-state'
import { resolveRequestTenant } from '@/lib/tenant-server'
import type { LedgerEntry } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

/** A failed ledger read is unknown, never an empty list that reads as zero. */
async function readOrUnknown<T>(read: Promise<T[]>): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await read, failed: false }
  } catch {
    return { rows: [], failed: true }
  }
}

/**
 * Proof is a display of four separate facts: applied config, served manifest,
 * live push, and recorded decisions. None of them enforces anything and none
 * of them can stand in for another. The page is intentionally read-only.
 */
export default async function ProofPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading proof.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          no tenant is read without an explicit selection
        </p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const [applied, goLive, decisionsRead, holdsRead, home, push] = await Promise.all([
    readAppliedConfig(tenantId),
    getGoLiveState(tenantId, { role: tenant.active.membership.role }),
    readOrUnknown(listDecisions(tenantId, 200)),
    readOrUnknown(listHolds(tenantId, 200)),
    getHome(tenantId),
    getLatestPush(tenantId),
  ])

  const appliedProof = appliedProofFromConfig(applied)
  const enforcing = enforcingFromPush({
    digest: push?.digest ?? null,
    pushedAt: push?.pushedAt ?? home?.last_push_at ?? null,
  })
  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', tenantId)
  const canonicalUrl = worker.ok ? `${worker.url}/.well-known/agent.json` : null
  const invokeUrl = worker.ok ? `${worker.url}/execute` : null
  const drafts = goLive.drafts

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Prove"
        title="Proof"
        description="Four separate facts: what is applied, what the governor serves, what the runtime last pushed, and what the ledger recorded. This page reads those facts; it does not decide, approve, publish, or execute anything."
        actions={
          <>
            <Link href="/go-live" className="btn btn-primary">Go live</Link>
            <Link href="/ledger" className="btn">Full ledger</Link>
          </>
        }
      />

      <Callout tone="info" title="Read before you act">
        An applied version is not a served manifest. A served manifest is not a runtime heartbeat. A decision is not
        an execution. Each panel below names the row or request that supports its claim; absence is unknown, never a
        healthy zero.
      </Callout>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-5">
          <p className="label">Applied config</p>
          <p className="mt-2 font-display text-[22px] text-bone">
            {appliedProof.state === 'live'
              ? `v${appliedProof.version}`
              : appliedProof.state === 'none'
                ? 'not applied'
                : 'unknown'}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
            {appliedProof.state === 'unknown'
              ? 'The applied config could not be read.'
              : appliedProof.state === 'none'
                ? 'Saving a draft changes nothing.'
                : `Activated ${formatProofTime(appliedProof.publishedAt)}.`}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Served manifest</p>
          <p className="mt-2 font-display text-[22px] text-bone">unchecked until you ask</p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
            A live fetch is the only way to answer this; a stored row cannot answer it.
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Live push</p>
          <p className="mt-2 font-display text-[22px] text-bone">
            {enforcing.status === 'live' ? 'live' : 'unknown'}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
            {enforcing.status === 'live'
              ? `Last push ${formatProofTime(enforcing.pushedAt)}.`
              : enforcing.reason}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Held, not executed</p>
          <p className="mt-2 font-display text-[22px] text-bone">
            {holdsRead.failed ? 'unknown' : holdsRead.rows.length}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
            Held requests in the latest 200 ledger rows. None has run while it is held.
          </p>
        </div>
      </section>

      <ProofServedManifest
        applied={appliedProof}
        canonicalUrl={canonicalUrl}
        invokeUrl={invokeUrl}
        expectedTenantId={tenantId}
      />

      <section className="panel space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="label">Applied config</p>
            <h2 className="mt-2 font-display text-[20px] leading-tight text-bone">Saved version, not served proof</h2>
          </div>
          <StatusPill
            tone={appliedProof.state === 'live' ? 'ready' : appliedProof.state === 'none' ? 'draft' : 'unknown'}
          >
            {appliedProof.state}
          </StatusPill>
        </div>
        <p className="max-w-[85ch] text-[13px] leading-relaxed text-bone-dim">
          This is the newest applied config row for this workspace. It is what the governor is expected to serve,
          not what it actually served. No policy body is shown on this page.
        </p>
        {appliedProof.state === 'live' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-line p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">Version</p>
              <p className="mt-1 text-[14px] text-bone">{appliedProof.version}</p>
            </div>
            <div className="rounded-lg border border-ink-line p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">Activated</p>
              <p className="mt-1 text-[14px] text-bone">{formatProofTime(appliedProof.publishedAt)}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="label">Drafts</p>
            <h2 className="mt-2 font-display text-[20px] leading-tight text-bone">Saved work is not live</h2>
          </div>
          <StatusPill tone="draft">draft</StatusPill>
        </div>
        <ul className="grid gap-2 text-[13px] text-bone-dim sm:grid-cols-3">
          <li>Setup: {drafts.setup ? 'saved draft' : 'no draft'}</li>
          <li>Rules: {drafts.rules ? 'saved draft' : 'no draft'}</li>
          <li>Capabilities: {drafts.capabilities ? 'saved draft' : 'no draft'}</li>
        </ul>
        {goLive.inventoryUnknown ? (
          <Callout tone="warning" title="Inventory read failed">
            The approved capability inventory could not be read. Unknown, not zero.
          </Callout>
        ) : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px]">
          <Link href="/setup" className="link">Setup</Link>
          <Link href="/rules" className="link">Rules</Link>
          <Link href="/map" className="link">Capabilities</Link>
          <Link href="/go-live" className="link">Publish channel</Link>
        </div>
      </section>

      <section className="panel space-y-4 p-5 sm:p-6">
        <div>
          <p className="label">Live push</p>
          <h2 className="mt-2 font-display text-[20px] leading-tight text-bone">Runtime heartbeat</h2>
        </div>
        <p className="max-w-[85ch] text-[13px] leading-relaxed text-bone-dim">
          A fresh push proves the runtime reported a config fingerprint. It does not prove an individual action ran.
          An absent or stale push renders unknown.
        </p>
        <StatusPill tone={enforcing.status === 'live' ? 'live' : 'unknown'}>
          {enforcing.status}
        </StatusPill>
        {enforcing.status === 'live' ? (
          <TechnicalDetails label="Live config fingerprint">
            digest {enforcing.digest}
          </TechnicalDetails>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <p className="label">Recorded decisions</p>
          <h2 className="font-display text-[22px] leading-tight text-bone">Decision and outcome are separate facts</h2>
        </div>
        {decisionsRead.failed ? (
          <Callout tone="danger" title="Ledger read failed">
            The ledger could not be read. Unknown, not zero.
          </Callout>
        ) : decisionsRead.rows.length === 0 ? (
          <EmptyState
            title="No decisions recorded"
            body="No rows were returned in the latest 200 ledger entries. That is an empty window, not proof that no agent ever acted."
          />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-ink-line font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
                <tr>
                  <th className="px-3 py-2 font-normal">When</th>
                  <th className="px-3 py-2 font-normal">Capability</th>
                  <th className="px-3 py-2 font-normal">Decision</th>
                  <th className="px-3 py-2 font-normal">Outcome</th>
                  <th className="px-3 py-2 font-normal">Reference</th>
                </tr>
              </thead>
              <tbody>
                {decisionsRead.rows.map((entry: LedgerEntry) => {
                  const outcome = outcomeFromDecision(entry)
                  return (
                    <tr key={`${entry.requestId}-${entry.at}`} className="border-b border-ink-line/60 last:border-b-0">
                      <td className="px-3 py-2 font-mono text-[11px] text-bone-dim">{formatProofTime(entry.at)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-bone">{entry.capability}</td>
                      <td className="px-3 py-2">
                        <Badge tone={entry.decision === 'allow' ? 'allow' : entry.decision === 'deny' ? 'deny' : 'held'}>
                          {entry.decision}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-bone-dim">
                        {outcome === 'executed' || outcome === 'failed' ? (
                          <Badge tone={outcome === 'executed' ? 'allow' : 'deny'}>{outcome}</Badge>
                        ) : (
                          '— (not recorded)'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <TechnicalDetails>
                          request {entry.requestId}
                          {entry.rowDigest ? <><br />digest {entry.rowDigest}</> : null}
                        </TechnicalDetails>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="label">Held requests</p>
          <h2 className="font-display text-[22px] leading-tight text-bone">held, not executed</h2>
        </div>
        {holdsRead.failed ? (
          <Callout tone="danger" title="Hold queue read failed">
            The ledger could not be read. Unknown, not zero.
          </Callout>
        ) : holdsRead.rows.length === 0 ? (
          <EmptyState
            title="Nothing held in the latest 200 rows"
            body="This window has no uncommitted require_approval rows. It is not a claim that no request will ever be held."
          />
        ) : (
          <div className="space-y-3">
            {holdsRead.rows.map((entry) => (
              <div key={entry.requestId} className="panel p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[12px] text-bone">{entry.capability}</p>
                  <StatusPill tone={entry.expiredHold ? 'blocked' : 'draft'}>
                    {entry.expiredHold ? 'expired' : 'held, not executed'}
                  </StatusPill>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-bone-dim">
                  Reason: {entry.reason} · Rule: {entry.rule}
                </p>
                <TechnicalDetails label="Ledger references">
                  request {entry.requestId}
                  {entry.rowDigest ? <><br />digest {entry.rowDigest}</> : null}
                </TechnicalDetails>
              </div>
            ))}
          </div>
        )}
        <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
          The decision belongs in your merchant environment. This page has no control that approves, rejects, or runs a request.
        </p>
        <Link href="/approvals" className="link font-mono text-[11px]">Open the approval queue →</Link>
      </section>

      <div className="panel p-5">
        <p className="label">What this page cannot prove</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          No amount, line item, customer detail, raw parameter or error text is read or rendered. No public research
          figure is presented as private merchant activity. The Governor and the hosted ledger remain the source of
          truth; this page is convenience only.
        </p>
      </div>
    </div>
  )
}
