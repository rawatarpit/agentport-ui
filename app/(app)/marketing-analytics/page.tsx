import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'

export type MarketingAnalytics = {
  kpis: {
    totalRequests: number | null
    totalAgents: number | null
    totalExecuted: number | null
    totalHeld: number | null
    totalRefused: number | null
    activeSources: number | null
    conversionRate: number | null
    holdRate: number | null
  }
  sources: Array<{
    source: string
    label: string
    agents: number
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
  }>
  capabilities: Array<{
    capability: string
    access: 'read' | 'write' | null
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    conversionRate: number | null
  }>
  weekly: Array<{
    week: string
    requests: number
    agents: number
    executed: number
    held: number
  }>
  funnel: Array<{
    step: string
    label: string
    count: number
    conversionRate: number | null
  }>
  refusalReasons: Array<{ reason: string; count: number }>
  agents: Array<{
    agent_id: string
    source: string
    assurance: 'verified' | 'unverified'
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    capabilities: string[]
    lastSeen: string | null
  }>
}

export const dynamic = 'force-dynamic'

async function fetchMarketing() {
  const res = await fetch('/api/marketing/analytics', { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as MarketingAnalytics
}

function MarketingKpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: number | string | null
  hint: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const COLOURS: Record<string, string> = {
    default: 'text-bone',
    good: 'text-verdant',
    warn: 'text-amber',
    bad: 'text-rust',
  }
  return (
    <div className="panel p-5">
      <p className="label">{label}</p>
      <p className={`tabular mt-2 font-display text-[30px] font-semibold leading-none ${COLOURS[tone]}`}>
        {value === null ? '—' : value}
      </p>
      <p className="mt-2 text-[12px] leading-snug text-bone-faint">{hint}</p>
    </div>
  )
}

function SourceCard({ s }: { s: MarketingAnalytics['sources'][number] }) {
  return (
    <div className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[12px] font-semibold text-bone truncate">{s.label}</p>
        <p className="mt-0.5 text-[11px] text-bone-faint">
          {s.agents} agent{s.agents === 1 ? '' : 's'} · {s.requests} request{s.requests === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-verdant">allow {s.allowed}</span>
        <span className="text-amber">held {s.held}</span>
        <span className="text-rust">refuse {s.refused}</span>
        <span className="text-verdant">executed {s.executed}</span>
      </div>
    </div>
  )
}

function FunnelCard({ f }: { f: MarketingAnalytics['funnel'][number] }) {
  return (
    <div className="panel p-5 text-center">
      <p className="tabular font-display text-[32px] font-semibold leading-none text-bone">
        {f.count}
      </p>
      <p className="mt-1 text-[12px] text-bone-faint">{f.label}</p>
      {f.conversionRate !== null ? (
        <p className="mt-1 text-[11px] text-bone-faint">{f.conversionRate}% of previous step</p>
      ) : null}
    </div>
  )
}

function RefusalReasonCard({ r }: { r: MarketingAnalytics['refusalReasons'][number] }) {
  return (
    <div className="panel p-4">
      <p className="font-mono text-[12px] text-bone truncate">{r.reason}</p>
      <p className="tabular mt-1 font-display text-[24px] font-semibold text-rust">
        {r.count}
      </p>
    </div>
  )
}

export default async function MarketingAnalyticsPage() {
  const data = await fetchMarketing()

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Marketing & Sales"
          title="Agent traffic and demand"
          description="Where agents come from, what they ask for, and what converts."
          actions={
            <Link href="/analytics" className="btn">
              Agent-level evidence
            </Link>
          }
        />
        <div className="panel p-6">
          <p className="label">Evidence</p>
          <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">
            Could not load marketing analytics. Nothing is lost — try reloading.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marketing & Sales"
        title="Agent traffic and demand"
        description="Where agents come from, what they ask for, and what converts — so you can see which capabilities drive business and where traffic drops off. Counts only; nothing to redact."
        actions={
          <Link href="/analytics" className="btn">
            Agent-level evidence
          </Link>
        }
      />

      {/* KPI row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MarketingKpiCard
          label="Total requests"
          value={data.kpis.totalRequests}
          hint="Agent requests received in the window"
          tone="default"
        />
        <MarketingKpiCard
          label="Active agents"
          value={data.kpis.totalAgents}
          hint="Distinct credentialed agents seen"
          tone="default"
        />
        <MarketingKpiCard
          label="Executed"
          value={data.kpis.totalExecuted}
          hint="Requests that ran successfully"
          tone="good"
        />
        <MarketingKpiCard
          label="Held for approval"
          value={data.kpis.totalHeld}
          hint="Waiting on a human decision"
          tone={data.kpis.totalHeld ? 'warn' : 'default'}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <MarketingKpiCard
          label="Refused"
          value={data.kpis.totalRefused}
          hint="Blocked before execution"
          tone={data.kpis.totalRefused ? 'bad' : 'default'}
        />
        <MarketingKpiCard
          label="Conversion rate"
          value={data.kpis.conversionRate !== null ? `${data.kpis.conversionRate}%` : '—'}
          hint="Executed ÷ requested"
          tone="default"
        />
        <MarketingKpiCard
          label="Hold rate"
          value={data.kpis.holdRate !== null ? `${data.kpis.holdRate}%` : '—'}
          hint="Held ÷ requested"
          tone="default"
        />
        <MarketingKpiCard
          label="Traffic sources"
          value={data.kpis.activeSources}
          hint="Distinct agent origins (ChatGPT, Claude, …)"
          tone="default"
        />
      </section>

      {/* Traffic sources */}
      <Section
        title="Where traffic comes from"
        description="Agent sources detected from caller identity. Use this to see which chatbots and integrations are sending you traffic."
      >
        {data.sources.length === 0 ? (
          <EmptyState
            title="No traffic sources yet"
            body="No agent requests have been recorded. This is unknown, not zero."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.sources.map((s) => (
              <SourceCard key={s.source} s={s} />
            ))}
          </div>
        )}
      </Section>

      {/* Capability demand */}
      <Section
        title="What agents ask for"
        description="Capabilities by request volume, with conversion rate (executed ÷ requested). Write capabilities need human approval by default."
      >
        {data.capabilities.length === 0 ? (
          <EmptyState
            title="No capability demand yet"
            body="No capability requests have been recorded. This is unknown, not zero."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['Capability', 'Access', 'Requests', 'Allowed', 'Held', 'Refused', 'Executed', 'Conversion'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.capabilities.map((c) => (
                  <tr key={c.capability} className="border-b border-ink-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-bone">
                      {c.capability}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-bone-faint">
                      {c.access === 'write' ? 'Write' : c.access === 'read' ? 'Read' : '—'}
                    </td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{c.requests}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{c.allowed}</td>
                    <td className="tabular px-4 py-2.5 text-amber">{c.held}</td>
                    <td className="tabular px-4 py-2.5 text-rust">{c.refused}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{c.executed}</td>
                    <td className="tabular px-4 py-2.5 text-bone-faint">
                      {c.conversionRate !== null ? `${c.conversionRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Conversion funnel */}
      <Section
        title="Conversion funnel"
        description="Requested → Approved → Executed. Where traffic drops off tells you where friction lives."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {data.funnel.map((f) => (
            <FunnelCard key={f.step} f={f} />
          ))}
        </div>
      </Section>

      {/* Weekly trend */}
      <Section
        title="Weekly traffic trend"
        description="Requests and executions over time. Missing weeks are absent, not zero."
      >
        {data.weekly.length === 0 ? (
          <EmptyState title="No weekly data yet" body="No activity has been recorded in any window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['Week', 'Requests', 'Active agents', 'Executed', 'Held'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.weekly.map((w) => (
                  <tr key={w.week} className="border-b border-ink-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-bone">{w.week}</td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{w.requests}</td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{w.agents}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{w.executed}</td>
                    <td className="tabular px-4 py-2.5 text-amber">{w.held}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Agent detail */}
      <Section
        title="Agent detail"
        description="Each agent, where they come from, and what they asked for. Verified agents have passed identity checks."
      >
        {data.agents.length === 0 ? (
          <EmptyState title="No agents seen yet" body="No distinct agents have made requests." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['Agent', 'Source', 'Assurance', 'Requests', 'Allowed', 'Held', 'Refused', 'Executed', 'Capabilities'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.agent_id} className="border-b border-ink-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-bone truncate max-w-[160px]">
                      {a.agent_id}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-bone-faint truncate max-w-[120px]">
                      {a.source}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${a.assurance === 'verified' ? 'text-verdant' : 'text-rust'}`}>
                        {a.assurance}
                      </span>
                    </td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{a.requests}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{a.allowed}</td>
                    <td className="tabular px-4 py-2.5 text-amber">{a.held}</td>
                    <td className="tabular px-4 py-2.5 text-rust">{a.refused}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{a.executed}</td>
                    <td className="px-4 py-2.5 text-[12px] text-bone-faint truncate max-w-[200px]">
                      {a.capabilities.slice(0, 3).join(', ')}
                      {a.capabilities.length > 3 ? ` +${a.capabilities.length - 3}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Refusal reasons */}
      {data.refusalReasons.length > 0 && (
        <Section title="Refusal reasons" description="Why requests were refused or held. Top rules firing.">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.refusalReasons.map((r) => (
              <RefusalReasonCard key={r.reason} r={r} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
