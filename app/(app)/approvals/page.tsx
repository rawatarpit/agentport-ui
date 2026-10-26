import { Badge } from '@/components/stat'
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
 * Why these buttons are disabled rather than merely absent.
 *
 * A browser approval puts a second, differently-available approver in front of a
 * real-money decision, and it is the wrong shape for two reasons that are not
 * about convenience:
 *
 * 1. The approver's identity would not land on the ledger row the way a CLI
 *    approver's does. `agent-port approve` records who approved, against the
 *    identity captured when the request was held. An identity arriving from a
 *    browser session is exactly the credential-derived-from-a-session case the
 *    SDK refuses to issue, because it cannot tell an employee from an algorithm
 *    in the record.
 * 2. A held request is frozen at request time. Approving it from here would mean
 *    re-evaluating policy in a process that is not the merchant's — the runtime
 *    holds the kill switch and the ceilings, and neither is reachable from this
 *    app.
 *
 * Notifications about a held request are legitimate and belong here. Committing
 * one is not.
 */
const INERT = 'Approvals run in the merchant’s environment, where the request was frozen.'

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
      <div>
        <p className="label">The human gate</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Waiting on you</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Writes an agent wanted but policy would not authorise unattended. None of
          these have run. A held request is a request authorised to wait, not one
          that already executed.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="idle">durable queue</Badge>
          <p className="font-mono text-[11px] text-bone-faint">
            member-scoped holds — commit with agent-port approve, merchant-side
          </p>
        </div>
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
          {holds.map((p) => (
            <li key={p.requestId} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-bone">{p.capability}</span>
                    <Badge tone="held">held, not executed</Badge>
                  </div>
                  <p className="mt-2 text-[14px] text-bone-dim">Held for approval — awaiting a human decision.</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[11px] text-bone-faint">{p.requestId}</p>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="label">Agent</dt>
                  <dd className="mt-1 font-mono text-[12px] text-bone-dim">{p.agentId}</dd>
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

              {/*
                Disabled with the reason visible, rather than hidden. A button
                that is simply absent leaves the reader wondering whether approval
                is possible somewhere else; one that is inert *and explains
                itself* states where the decision belongs.
              */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary opacity-40" type="button" disabled aria-disabled="true">
                  Approve and run
                </button>
                <button className="btn btn-danger opacity-40" type="button" disabled aria-disabled="true">
                  Decline
                </button>
                <span className="self-center font-mono text-[11px] text-bone-faint">
                  {INERT} Run <span className="text-bone-dim">agent-port approve</span> there.
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}