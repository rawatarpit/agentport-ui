import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/stat'
import { Chip } from '@/components/ui/chip'
import { CopyButton } from '@/components/ui/copy-button'
import { Callout } from '@/components/ui/callout'
import { PageHeader } from '@/components/ui/page-header'
import { TechnicalDetails } from '@/components/ui/technical-details'
import { agentAttribution } from '@/lib/ledger-summary'
import { safeAgentLabel } from '@/lib/safe-display'
import { listHolds } from '@/lib/console-reads'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * Read-only confirmation reference for a held request.
 *
 * Nothing executes on this page. It displays the hold the merchant's agent
 * prepared, shows the exact request ID, and tells the merchant to complete
 * the decision in their own environment with `agent-port approve <requestId>`.
 *
 * The console never issues a WRITE, never mutates an approval row, and never
 * mints or validates a confirmation token. Token issuance, single-use
 * enforcement, expiry, replay protection and execution all belong to the
 * hosted governor and the merchant-side execution component.
 */

function formatIso(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '—'
}

export default async function ConfirmPage({
  params,
}: {
  params: { requestId: string }
}) {
  const { requestId } = params
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reviewing a held request.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          no tenant is read without an explicit selection
        </p>
      </div>
    )
  }

  let holds
  try {
    holds = await listHolds(tenant.active.tenantId, 200)
  } catch {
    return (
      <div className="panel p-8 text-center">
        <p className="text-rust" role="alert">The hold could not be read. Nothing is lost — try reloading.</p>
      </div>
    )
  }

  const hold = holds.find((h) => h.requestId === requestId)
  if (!hold) return notFound()

  const agent = agentAttribution(hold)
  const provenanceTone =
    agent.source === 'credential' && agent.trusted
      ? 'good'
      : agent.source === 'declared'
        ? 'warn'
        : 'neutral'
  const command = `agent-port approve ${requestId}`

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The human gate"
        title="Review held request"
        description={
          <>
            Request <code className="font-mono">{requestId}</code> is held for your decision. Nothing has
            executed yet, and nothing will execute from this page. Complete the approval in your own
            environment with <code className="font-mono">agent-port approve</code>.
          </>
        }
        actions={
          <Link href="/approvals" className="btn btn-secondary">
            Back to queue
          </Link>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[20px] leading-tight text-bone">
            {hold.capability}
          </h2>
          <Badge tone={hold.expiredHold ? 'deny' : 'held'}>
            {hold.expiredHold ? 'Expired — re-request required' : 'Held, not executed'}
          </Badge>
        </div>
        <div className="flex items-end gap-2">
          <CopyButton text={requestId} />
          <span className="font-mono text-[11px] text-bone-faint truncate max-w-[34ch]">
            {requestId}
          </span>
        </div>
      </div>

      {hold.expiredHold ? (
        <Callout tone="danger">
          <p className="font-semibold">This request has expired.</p>
          <p className="mt-2">
            A held request is frozen at request time and carries an expiry. Once expired it cannot be
            approved — the agent must prepare a new request. Do not reuse this request ID.
          </p>
        </Callout>
      ) : (
        <Callout tone="info">
          <p className="font-semibold">Nothing has executed.</p>
          <p className="mt-2">
            This is a reference page only. Copying the request ID below is <strong>not</strong> an
            approval. To approve, run the command in your merchant environment:
            <code className="font-mono">{command}</code>. The hosted governor rechecks permissions at
            execution time and records the outcome.
          </p>
        </Callout>
      )}

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Request details</h3>
        <dl className="grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="label">Capability</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim">{hold.capability}</dd>
          </div>
          <div>
            <dt className="label">Access</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {hold.access === 'read' ? 'Read' : hold.access === 'write' ? 'Write' : '—'}
            </dd>
          </div>
          <div>
            <dt className="label">Rule that fired</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim">{hold.rule}</dd>
          </div>
          <div>
            <dt className="label">Reason for hold</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{hold.reason}</dd>
          </div>
          <div>
            <dt className="label">Requested at</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{formatIso(hold.at)}</dd>
          </div>
          <div>
            <dt className="label">Expires at</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {hold.approval?.expiresAt ? formatIso(hold.approval.expiresAt) : '— (no expiry set)'}
            </dd>
          </div>
          <div>
            <dt className="label">Approval required</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">Yes</dd>
          </div>
        </dl>
      </section>

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Requesting agent</h3>
        <dl className="grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="label">Agent label</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {safeAgentLabel(hold.agentLabel) ||
                (hold.agentLabelSource === 'credential' ? 'Unnamed credential' : 'Unidentified agent')}
            </dd>
          </div>
          <div>
            <dt className="label">Provenance</dt>
            <dd className="mt-1 flex items-center gap-2">
              <Chip tone={provenanceTone} title={agent.title}>
                {agent.chip}
              </Chip>
            </dd>
          </div>
          <div>
            <dt className="label">Assurance</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{hold.assurance}</dd>
          </div>
          <div>
            <dt className="label">Agent ID</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim truncate">{hold.agentId}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-bone-faint">
          The agent label is telemetry, not proof of identity: read its provenance before treating it as
          a name the console vouches for.
        </p>
      </section>

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Action details</h3>
        <dl className="grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="label">Business purpose</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              Not shown here — the detailed payload stays in the merchant execution environment and
              never reaches this console.
            </dd>
          </div>
          <div>
            <dt className="label">Target resource</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              Not shown here — request parameters and evaluated figures are omitted from the console
              projection by design (custody boundary).
            </dd>
          </div>
          <div>
            <dt className="label">Credentials / secrets</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              None — never displayed, never stored in this row.
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Approve in your environment</h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="border border-ink-line rounded-xl p-3 font-mono text-[12px] text-bone break-all">
            {command}
          </div>
          <CopyButton text={command} />
          <p className="font-mono text-[11px] leading-relaxed text-bone-dim max-w-[60ch]">
            Run this in your merchant environment. It submits the write to your backend and the
            governor records the outcome. This page does not submit anything, and copying the command
            does not constitute approval.
          </p>
        </div>
      </section>

      <TechnicalDetails label="Ledger references">
        <div>request {hold.requestId}</div>
        <div>agent {hold.agentId}</div>
        {hold.heldRequestId ? <div>held {hold.heldRequestId}</div> : null}
        {hold.configHash ? <div>config hash {hold.configHash}</div> : null}
        {hold.rowDigest ? <div>row digest {hold.rowDigest}</div> : null}
      </TechnicalDetails>

      <Link href="/approvals" className="btn btn-secondary">
        Back to queue
      </Link>
    </div>
  )
}
