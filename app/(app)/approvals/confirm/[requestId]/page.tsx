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
import { listRequestReferences } from '@/lib/console-reads'
import { confirmationView, type ConfirmationState } from '@/lib/ledger-view'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * Read-only confirmation reference for a held request.
 *
 * Nothing executes on this page. It renders what the tenant's own ledger
 * projection proves: the hold, a hosted commit that names it, or a recorded
 * refusal/outcome. Viewing the page and copying the reference are not approval.
 * Token issuance, single-use enforcement, expiry, replay protection and
 * execution belong to the hosted governor and the merchant-side component.
 */

function formatIso(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '—'
}

const STATE: Record<
  ConfirmationState,
  { label: string; tone: 'allow' | 'deny' | 'held' | 'idle'; callout: 'info' | 'success' | 'warning' | 'danger'; summary: string }
> = {
  not_found: { label: 'not found', tone: 'idle', callout: 'info', summary: 'No matching request exists in this workspace.' },
  pending: {
    label: 'Pending — awaiting your decision',
    tone: 'held',
    callout: 'info',
    summary: 'Nothing has executed from this request. A hosted decision is still required.',
  },
  expired: {
    label: 'Expired — re-request required',
    tone: 'deny',
    callout: 'danger',
    summary: 'The hold timed out without a hosted commit. It cannot be approved now.',
  },
  approved: {
    label: 'Approval recorded — execution unproven',
    tone: 'held',
    callout: 'warning',
    summary: 'A hosted commit names this request. The console has no execution result for it.',
  },
  executed: {
    label: 'Executed — ledger result ok',
    tone: 'allow',
    callout: 'success',
    summary: 'The hosted ledger records a successful execution for this request.',
  },
  failed: {
    label: 'Execution failed',
    tone: 'deny',
    callout: 'danger',
    summary: 'The hosted ledger records a commit that failed during execution.',
  },
  denied: {
    label: 'Denied',
    tone: 'deny',
    callout: 'danger',
    summary: 'The hosted ledger records a refusal. Nothing was executed.',
  },
  unknown: {
    label: 'Unknown',
    tone: 'idle',
    callout: 'warning',
    summary: 'The ledger row does not prove an approval outcome. Do not infer one.',
  },
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

  let rows
  try {
    rows = await listRequestReferences(tenant.active.tenantId, requestId)
  } catch {
    return (
      <div className="panel p-8 text-center">
        <p className="text-rust" role="alert">The ledger reference could not be read. The state is unknown — try reloading.</p>
      </div>
    )
  }

  const view = confirmationView(rows, requestId)
  if (view.state === 'not_found') return notFound()

  const subject = view.hold ?? view.commit ?? view.other
  if (!subject) return notFound()

  const state = STATE[view.state]
  const agent = agentAttribution(subject)
  const provenanceTone =
    agent.source === 'credential' && agent.trusted
      ? 'good'
      : agent.source === 'declared'
        ? 'warn'
        : 'neutral'
  const command = `agent-port approve ${requestId}`
  const canOfferCommand = view.state === 'pending'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The human gate"
        title="Confirmation reference"
        description={
          <>
            Request <code className="font-mono">{requestId}</code> is shown read-only from this workspace&apos;s
            ledger projection. Opening this page, copying the reference, or pressing anything here does not
            approve or execute the request.
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
            {subject.capability}
          </h2>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <div className="flex items-end gap-2">
          <CopyButton text={requestId} />
          <span className="font-mono text-[11px] text-bone-faint truncate max-w-[34ch]">
            {requestId}
          </span>
        </div>
      </div>

      <Callout tone={state.callout}>
        <p className="font-semibold">{state.summary}</p>
        <p className="mt-2">
          {view.state === 'pending' ? (
            <>
              The console has no connection to the hosted approval mechanism and cannot verify whether your
              merchant-side command is available. If it is configured and running, the decision belongs there —
              not on this page.
            </>
          ) : (
            <>
              The state shown comes only from the ledger rows read under your workspace. The console did not
              approve, decline, or execute anything. Check your merchant environment for the authoritative
              decision before acting again.
            </>
          )}
        </p>
      </Callout>

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Request details</h3>
        <dl className="grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="label">Capability</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim">{subject.capability}</dd>
          </div>
          <div>
            <dt className="label">Access</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {subject.access === 'read' ? 'Read' : subject.access === 'write' ? 'Write' : '—'}
            </dd>
          </div>
          <div>
            <dt className="label">Rule recorded</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim">{subject.rule}</dd>
          </div>
          <div>
            <dt className="label">Recorded reason</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{subject.reason}</dd>
          </div>
          <div>
            <dt className="label">Requested at</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{formatIso(subject.at)}</dd>
          </div>
          <div>
            <dt className="label">Expires at</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {subject.approval?.expiresAt ? formatIso(subject.approval.expiresAt) : '— (no expiry recorded)'}
            </dd>
          </div>
          <div>
            <dt className="label">Approval required</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">{view.hold ? 'Yes, on the hold row' : 'Not shown on this row'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel p-5 sm:p-7 space-y-4">
        <h3 className="label">Requesting agent</h3>
        <dl className="grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="label">Agent label</dt>
            <dd className="mt-1 text-[12px] text-bone-dim">
              {safeAgentLabel(subject.agentLabel) ||
                (subject.agentLabelSource === 'credential' ? 'Unnamed credential' : 'Unidentified agent')}
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
            <dd className="mt-1 text-[12px] text-bone-dim">{subject.assurance}</dd>
          </div>
          <div>
            <dt className="label">Agent ID</dt>
            <dd className="mt-1 font-mono text-[12px] text-bone-dim truncate">{subject.agentId}</dd>
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

      <section className="panel p-5 sm:p-7 space-y-3">
        <h3 className="label">Merchant-side decision</h3>
        {canOfferCommand ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="border border-ink-line rounded-xl p-3 font-mono text-[12px] text-bone break-all">
                {command}
              </div>
              <CopyButton text={command} />
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-bone-dim max-w-[60ch]">
              Run this only in your merchant environment if that execution component is configured. This
              console cannot verify its availability, submit the write, or confirm the outcome. Copying
              the command is not approval.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-bone-dim">
            No approval action is offered here. The state above is already recorded in the ledger, and a
            second approval command would not change it. Check the merchant environment if you need the
            authoritative outcome.
          </p>
        )}
      </section>

      <TechnicalDetails label="Ledger references">
        <div>request {subject.requestId}</div>
        <div>agent {subject.agentId}</div>
        {view.hold ? <div>hold {view.hold.requestId}</div> : null}
        {view.commit ? <div>commit {view.commit.requestId}</div> : null}
        {subject.rowDigest ? <div>row digest {subject.rowDigest}</div> : null}
        {subject.configHash ? <div>ledger config digest {subject.configHash}</div> : null}
      </TechnicalDetails>

      <Link href="/approvals" className="btn btn-secondary">
        Back to queue
      </Link>
    </div>
  )
}
