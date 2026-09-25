import { Badge } from '@/components/stat'

export const dynamic = 'force-dynamic'

/**
 * The human gate. Nothing on this list has executed. That distinction is the
 * whole point of the queue: a held request is a request that was authorised to
 * wait, not a request that ran and is being reported afterwards.
 */
const PENDING = [
  {
    requestId: 'req_held_9f2',
    agent: 'gpt-shopping',
    capability: 'createOrder',
    reason: 'Order of 31,400 INR is above the 25,000 INR approval threshold.',
    amount: '31,400 INR',
    items: 'Chelsea Boot × 1, Waxed Lace × 2',
    customer: 'A shopper in the storefront chat',
  },
  {
    requestId: 'req_held_4ab',
    agent: 'perplexity',
    capability: 'createOrder',
    reason: 'Order of 24,800 INR meets the bulk threshold of 20 units.',
    amount: '24,800 INR',
    items: 'Everyday Boot × 20',
    customer: 'A group order routed from a research agent',
  },
]

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">The human gate</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Waiting on you</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Writes an agent wanted but policy would not authorise unattended. None of
          these have run. Approving one executes it and records that you approved
          it, by name, against the original request.
        </p>
      </div>

      {PENDING.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-bone-dim">Nothing is waiting. Every authorised write has been decided.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {PENDING.map((p) => (
            <li key={p.requestId} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-bone">{p.capability}</span>
                    <Badge tone="held">held, not executed</Badge>
                  </div>
                  <p className="mt-2 text-[14px] text-bone-dim">{p.reason}</p>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-2xl text-bone">{p.amount}</p>
                  <p className="font-mono text-[11px] text-bone-faint">{p.requestId}</p>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-1 border-t border-ink-line/60 pt-4 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="label">Agent</dt>
                  <dd className="mt-1 font-mono text-[12px] text-bone-dim">{p.agent}</dd>
                </div>
                <div>
                  <dt className="label">Items</dt>
                  <dd className="mt-1 text-bone-dim">{p.items}</dd>
                </div>
                <div>
                  <dt className="label">On behalf of</dt>
                  <dd className="mt-1 text-bone-dim">{p.customer}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <button className="btn btn-primary" type="button">Approve and run</button>
                <button className="btn btn-danger" type="button">Decline</button>
                <span className="self-center font-mono text-[11px] text-bone-faint">
                  declining records the refusal; the call never runs
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
