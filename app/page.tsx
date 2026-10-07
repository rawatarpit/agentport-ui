import Link from 'next/link'
import { Badge, Stat } from '@/components/stat'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { TenantCard } from '@/components/tenant-card'
import { agent, ensureSeeded, ledger, policy } from '@/lib/agentport'

export const dynamic = 'force-dynamic'

/**
 * The dashboard: what is running, what needs a human, where to go next.
 *
 * Order is attention, not inventory — enforcing state first (what the
 * runtime claims), then what waits on the merchant (held, refused), then
 * the standing numbers, then the doors. A dashboard that opens with
 * navigation instead of state is a menu wearing a dashboard's name.
 */
export default async function Overview() {
  await ensureSeeded()
  const entries = await ledger.list({ limit: 200 })
  const allowed = entries.filter((e) => e.decision === 'allow').length
  const denied = entries.filter((e) => e.decision === 'deny').length
  const held = entries.filter((e) => e.decision === 'require_approval').length
  const manifest = agent.manifest()
  const fmtMinor = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Overview</p>
        <h2 className="mt-2 font-display text-3xl text-bone">What agents are doing</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          {manifest.capabilities.length} capabilities exposed. {denied} refused,{' '}
          {held} waiting on a human. Owners check what happened, operators clear
          what is held, developers wire what is exposed.
        </p>
      </div>

      <TenantCard />

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <EnforcingPanel draftLabel="overview — no draft open" />
        </div>
        <div className="panel flex flex-col justify-between gap-3 p-5 lg:col-span-2">
          <div>
            <p className="label">Needs a human</p>
            <p className="mt-2 font-display text-4xl text-bone">
              {held}
              <span className="ml-2 align-middle font-mono text-[12px] text-bone-faint">held · {denied} refused</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/approvals" className="btn btn-primary">Review held</Link>
            <Link href="/ledger" className="btn">Read refusals</Link>
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls recorded" value={entries.length} />
        <Stat label="Allowed" value={allowed} tone="good" />
        <Stat label="Held for approval" value={held} tone="warn" />
        <Stat label="Refused" value={denied} tone="bad" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label">What is enforced — in your words</p>
          <ul className="mt-3 space-y-2 text-[14px] text-bone-dim">
            <li className="flex justify-between gap-3">
              <span>Order above {fmtMinor(policy.maxOrderValue.minor)} — ask you first</span>
              <Badge tone="held">held</Badge>
            </li>
            <li className="flex justify-between gap-3">
              <span>Order above {fmtMinor(policy.absoluteMaxOrderValue.minor)} — always say no</span>
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
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/rules" className="btn btn-primary">Change the limits</Link>
            <Link href="/setup" className="btn">Get started</Link>
          </div>
        </div>

        <div className="panel flex flex-col justify-between gap-3 p-5">
          <div>
            <p className="label">Discovery</p>
            <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">
              Agents read <code className="font-mono text-bone">/.well-known/agent.json</code> to
              learn what exists, what to send, and which calls will be held. The
              manifest is generated from the registered capabilities, so it cannot
              describe something that is not enforced.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/ledger" className="btn">Read the ledger</Link>
            <Link href="/connect" className="btn">Connect your runtime</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
