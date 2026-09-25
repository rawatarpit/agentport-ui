import Link from 'next/link'
import { Badge, Stat } from '@/components/stat'
import { agent, ensureSeeded, ledger, policy } from '@/lib/agentport'

export const dynamic = 'force-dynamic'

export default async function Overview() {
  await ensureSeeded()
  const entries = await ledger.list({ limit: 200 })
  const allowed = entries.filter((e) => e.decision === 'allow').length
  const denied = entries.filter((e) => e.decision === 'deny').length
  const held = entries.filter((e) => e.decision === 'require_approval').length
  const agents = new Set(entries.map((e) => e.agentId))
  const manifest = agent.manifest()

  return (
    <div className="space-y-8">
      <section>
        <p className="label">The position</p>
        <h2 className="mt-2 max-w-[62ch] font-display text-3xl leading-tight text-bone">
          Agents can already find this store. What they cannot do is decided here,
          in one place, before anything runs.
        </h2>
        <p className="prose-bone mt-4 max-w-[68ch]">
          {manifest.capabilities.length} capabilities are exposed to external agents.
          Everything else this business has is unreachable by an agent, because
          exposure is an allowlist rather than a filter. Of the calls made so far,{' '}
          {denied} were refused and {held} were held for a human.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls recorded" value={entries.length} />
        <Stat label="Allowed" value={allowed} tone="good" />
        <Stat label="Held for approval" value={held} tone="warn" />
        <Stat label="Refused" value={denied} tone="bad" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label">Agents that have called</p>
          <ul className="mt-3 space-y-2">
            {[...agents].sort().map((a) => (
              <li key={a} className="flex items-center justify-between gap-3 text-[14px]">
                <span className="font-mono text-bone">{a}</span>
                <span className="tabular text-bone-faint">
                  {entries.filter((e) => e.agentId === a).length} calls
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <p className="label">What is enforced</p>
          <ul className="mt-3 space-y-2 text-[14px] text-bone-dim">
            <li className="flex justify-between gap-3">
              <span>Order above {policy.maxOrderValue.amount} {policy.maxOrderValue.currency}</span>
              <Badge tone="held">held</Badge>
            </li>
            <li className="flex justify-between gap-3">
              <span>Order above {policy.absoluteMaxOrderValue.amount} {policy.absoluteMaxOrderValue.currency}</span>
              <Badge tone="deny">denied</Badge>
            </li>
            <li className="flex justify-between gap-3">
              <span>{policy.forbiddenCapabilities.join(', ')}</span>
              <Badge tone="deny">denied</Badge>
            </li>
            <li className="flex justify-between gap-3">
              <span>Rate limit {policy.rateLimit?.requestsPerMinute}/min</span>
              <Badge tone="deny">denied</Badge>
            </li>
          </ul>
          <Link href="/policies" className="btn mt-5">Edit policy</Link>
        </div>
      </section>

      <section className="panel p-5">
        <p className="label">Discovery</p>
        <p className="mt-2 text-[14px] text-bone-dim">
          Agents read{' '}
          <code className="font-mono text-bone">/.well-known/agent.json</code> to learn
          what exists, what to send, and which calls will be held. The manifest is
          generated from the registered capabilities, so it cannot describe
          something that is not enforced.
        </p>
        <Link href="/ledger" className="btn mt-4">Read the ledger</Link>
      </section>
    </div>
  )
}
