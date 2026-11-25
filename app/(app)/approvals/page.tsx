import Link from 'next/link'
import { Badge } from '@/components/stat'
import { Chip } from '@/components/ui/chip'
import { PageHeader } from '@/components/ui/page-header'
import { TechnicalDetails } from '@/components/ui/technical-details'
import { agentAttribution } from '@/lib/ledger-summary'
import { safeAgentLabel } from '@/lib/safe-display'
import { listHolds } from '@/lib/console-reads'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * The human gate. Nothing on this list has executed. That distinction is the
 * whole point of the queue: a held request is a request that was authorised to
 * wait, not a request that ran and is being reported afterwards.
 *
 * Durable reads (TASKS.md 2.4): require_approval rows from the hosted ledger
 * that no later approval row names as its held request. Commits happen
 * merchant-side (`agent-port approve`), so a hold stays here until the ledger
 * carries the commit — a browser flag this app did not witness would be
 * attestation of nothing.
 *
 * Four columns only — capability, agent, reason for hold, rule that fired.
 * No amounts, no line items, no customer: the boundary (amounts and
 * parameters never reach us) holds for real rows exactly as it did for the
 * fixtures this replaced, because a column is how an amount ends up in a
 * dashboard query later. See TASKS.md 12.2.5.
 */

/**
 * Why this queue links to a reference page instead of offering a browser action.
 *
 * A browser approval puts a second, differently-available approver in front of a
 * real-money decision. The approver's identity would not land on the ledger row
 * the way a merchant-side approver's does, and a held request is frozen at
 * request time — the runtime's kill switch and ceilings are not reachable here.
 * Notifications about a held request are legitimate; committing one is not.
 */
const DECISION_OWNER = 'The decision belongs in your merchant environment, where the request was frozen.'

export default async function ApprovalsPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading the queue.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">no tenant is read without an explicit selection</p>
      </div>
    )
  }

  let holds: Awaited<ReturnType<typeof listHolds>> = []
  let failed = false
  try {
    holds = await listHolds(tenant.active.tenantId, 200)
  } catch {
    failed = true
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The human gate"
        title="Waiting on you"
        description="Writes an agent wanted but policy would not authorise unattended. None of these have run. A held request is a request authorised to wait, not one that already executed."
        actions={
          <Link href="/go-live#rules" className="btn">
            Review the rules
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="idle">durable queue</Badge>
        <p className="font-mono text-[11px] text-bone-faint">
          member-scoped holds — commit with agent-port approve, merchant-side
        </p>
      </div>

      {failed ? (
        <p className="text-[13px] text-rust" role="alert">
          The queue could not be read. Nothing is lost — try reloading.
        </p>
      ) : holds.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-bone-dim">Nothing is waiting. Every authorised write has been decided.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {holds.map((p) => {
            const agent = agentAttribution(p)
            const provenanceTone =
              agent.source === 'credential' && agent.trusted
                ? 'good'
                : agent.source === 'declared'
                  ? 'warn'
                  : 'neutral'
            return (
            <li key={p.requestId} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-bone">{p.capability}</span>
                    <Badge tone="held">held, not executed</Badge>
                  </div>
                  <p className="mt-2 text-[14px] text-bone-dim">Held for approval — awaiting a human decision.</p>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="label">Agent</dt>
                  <dd className="mt-1 text-[12px] text-bone-dim">
                    <span className="block">
                      {safeAgentLabel(p.agentLabel) ||
                        (p.agentLabelSource === 'credential' ? 'Unnamed credential' : 'Unidentified agent')}
                    </span>
                    <Chip tone={provenanceTone} title={agent.title}>{agent.chip}</Chip>
                  </dd>
                </div>
                <div>
                  <dt className="label">Rule that fired</dt>
                  <dd className="mt-1 font-mono text-[12px] text-bone-dim">{p.rule}</dd>
                </div>
                <div>
                  <dt className="label">State</dt>
                  <dd className="mt-1 text-bone-dim">
                    {p.expiredHold ? 'expired — re-request required' : 'held, not executed'}
                  </dd>
                </div>
              </dl>

              <TechnicalDetails label="Ledger references">
                <div>request {p.requestId}</div>
                <div>agent {p.agentId}</div>
                {p.heldRequestId ? <div>held {p.heldRequestId}</div> : null}
              </TechnicalDetails>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href={`/approvals/confirm/${encodeURIComponent(p.requestId)}`} className="btn btn-secondary">
                  Review request
                </Link>
                <span className="self-center font-mono text-[11px] text-bone-faint">
                  {DECISION_OWNER} Opening the reference is not approval.
                </span>
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}