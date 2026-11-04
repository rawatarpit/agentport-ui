import Link from 'next/link'
import { Badge } from '@/components/stat'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

type Tenant = {
  tenantId: string
  role: string
  businessName: string
  websiteUrl: string | null
}

type Capability = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  rule: 'allow' | 'hold' | 'refuse'
}

type ActivityRow = {
  at: string
  capability: string
  agentId: string
  decision: 'allow' | 'deny' | 'require_approval'
  decisionText: string
}

export default async function OverviewPage() {
  const tenantData = await resolveRequestTenant()
  if (!tenantData || tenantData.active.status !== 'active') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 pt-[18vh] text-center">
        <div>
          <p className="label">Please sign in</p>
          <h1 className="mt-2 font-display text-3xl text-bone">Select your business</h1>
          <p className="mt-3 prose-bone">Choose the business you want to govern.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/select-workspace" className="btn btn-primary">
              Choose workspace
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const tenantId = tenantData.active.tenantId
  const tenant: Tenant = {
    tenantId: tenantData.active.tenantId,
    role: tenantData.active.membership?.role ?? 'member',
    businessName: 'Your business',
    websiteUrl: null,
  }

  let state: any = null
  try {
    const res = await fetch('/api/golive', { cache: 'no-store' })
    if (res.ok) state = await res.json()
  } catch {
    // Silently fall through
  }

  const capabilities: Capability[] = (state?.drafts?.capabilities ? state.capabilities : []).map(
    (c: any) => ({
      name: c.name,
      method: c.method,
      path: c.path,
      kind: c.kind,
      rule: c.rule ?? 'allow',
    })
  )

  const published = !!state?.published
  const liveVersion = state?.liveArtifact?.version

  const recentActivity: ActivityRow[] = [
    { at: 'Just now', capability: 'searchProducts', agentId: 'chatgpt-shopping', decision: 'allow', decisionText: 'Allowed' },
    { at: '2 min ago', capability: 'createOrder', agentId: 'claude-assistant', decision: 'require_approval', decisionText: 'Held for you' },
    { at: '5 min ago', capability: 'checkInventory', agentId: 'gpt-copilot', decision: 'allow', decisionText: 'Allowed' },
    { at: '10 min ago', capability: 'requestRefund', agentId: 'anon', decision: 'deny', decisionText: 'Refused' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-ink-line pb-6">
        <div className="min-w-0">
          <p className="label">AgentPort Console</p>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight text-bone sm:text-[34px]">
            {tenant.businessName}
          </h1>
          <p className="mt-1 text-[13px] text-bone-dim">
            {tenant.websiteUrl ?? 'No website set'} · {tenant.role}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] text-bone-dim ${
            published ? 'border-verdant/40 bg-verdant/10 text-verdant' : 'border-ink-line bg-ink/40 text-bone-faint'
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {published ? 'Live' : 'Draft — not published yet'}
          </span>
          <Link href="/" className="btn btn-sm">
            Refresh
          </Link>
          <button type="button" className="btn btn-sm btn-primary" disabled={!published}>
            Publish now
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5">
          <p className="label">Mapped capabilities</p>
          <p className={`tabular mt-2 font-display text-[32px] font-semibold leading-none ${capabilities.length > 0 ? 'text-bone' : 'text-bone-faint'}`}>
            {capabilities.length}
          </p>
          <p className="mt-2 text-[12px] text-bone-faint">
            {capabilities.length === 0 ? 'No pages mapped yet' : 'Routes agents can use'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Published version</p>
          <p className={`tabular mt-2 font-display text-[32px] font-semibold leading-none text-bone`}>
            {liveVersion ?? '—'}
          </p>
          <p className="mt-2 text-[12px] text-bone-faint">
            {published ? 'Live for your visitors' : 'Nothing published yet'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Rules</p>
          <p className={`tabular mt-2 font-display text-[32px] font-semibold leading-none text-bone`}>
            {draftsRulesCount()}
          </p>
          <p className="mt-2 text-[12px] text-bone-faint">Capabilities with custom rules</p>
        </div>
        <div className="panel p-5">
          <p className="label">Last activity</p>
          <p className={`tabular mt-2 font-display text-[32px] font-semibold leading-none text-bone`}>
            {recentActivity[0]?.at ?? '—'}
          </p>
          <p className="mt-2 text-[12px] text-bone-faint">Most recent agent action</p>
        </div>
      </section>

      <Section title="Mapped capabilities" description="Routes agents can execute. Click any rule cell to change it.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-line">
                <th key="name" scope="col" className="label px-4 py-3 font-normal">
                  Capability
                </th>
                <th key="method" scope="col" className="label px-4 py-3 font-normal">
                  Method
                </th>
                <th key="path" scope="col" className="label px-4 py-3 font-normal">
                  Path
                </th>
                <th key="kind" scope="col" className="label px-4 py-3 font-normal">
                  Type
                </th>
                <th key="rule" scope="col" className="label px-4 py-3 font-normal">
                  Rule
                </th>
              </tr>
            </thead>
            <tbody>
              {capabilities.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-[13px] text-bone-dim" colSpan={5}>
                    No capabilities mapped yet. Go to{' '}
                    <Link href="/map" className="text-bone underline underline-offset-2 hover:underline-offset-4">
                      Map routes
                    </Link>
                    to add endpoints.
                  </td>
                </tr>
              ) : (
                capabilities.map((cap) => (
                  <tr key={cap.name} className="border-b border-ink-line/60 hover:bg-ink/5 last:border-0">
                    <td className="px-4 py-3 font-mono text-[12px] text-bone">
                      {cap.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-bone-dim">
                      {cap.method}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-bone-dim truncate max-w-[200px]">
                      {cap.path}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={cap.kind === 'write' ? 'held' : 'allow'}>
                        {cap.kind}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="border border-ink-line rounded px-3 py-2 text-[12px] font-mono text-bone outline-none focus:border-verdant focus-visible:ring-1 focus-visible:ring-verdant/50"
                        value={cap.rule}
                        onChange={(e) => {
                          console.log(`Set ${cap.name} to ${e.target.value}`)
                        }}
                      >
                        <option value="allow">Allow freely</option>
                        <option value="hold">Hold for approval</option>
                        <option value="refuse">Refuse outright</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Amount limits" description="Optional ceilings that apply to all write capabilities.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-ask-above">
              Ask me first above (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-ask-above"
                type="text"
                value=""
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                placeholder="250"
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-never-above">
              Always refuse above (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-never-above"
                type="text"
                value=""
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                placeholder="1000"
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-bulk">
              Hold orders with more than this many items
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="rules-bulk"
                type="text"
                value=""
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                placeholder="20"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Recent activity" description="What agents asked for and what happened.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-line">
                <th key="when" scope="col" className="label px-4 py-2.5 font-normal">
                  When
                </th>
                <th key="capability" scope="col" className="label px-4 py-2.5 font-normal">
                  Capability
                </th>
                <th key="agent" scope="col" className="label px-4 py-2.5 font-normal">
                  Agent
                </th>
                <th key="decision" scope="col" className="label px-4 py-2.5 font-normal">
                  Decision
                </th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((row) => (
                <tr key={`${row.at}-${row.capability}`} className="border-b border-ink-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-bone-faint">
                    {row.at}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-bone">
                    {row.capability}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-bone-dim">
                    {row.agentId}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        row.decision === 'allow'
                          ? 'allow'
                          : row.decision === 'require_approval'
                            ? 'held'
                            : 'deny'
                      }
                    >
                      {row.decisionText}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!published}
          onClick={() => {
            console.log('Publish clicked')
          }}
        >
          {published ? 'Republish' : 'Publish now'}
        </button>
      </div>
    </div>
  )
}

function draftsRulesCount(): number {
  return 0
}
