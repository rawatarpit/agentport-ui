'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { Chip } from '@/components/ui/chip'
import { agentAttribution } from '@/lib/ledger-summary'
import { safeAgentLabel } from '@/lib/safe-display'

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
    evidence: 'agent_id_heuristic'
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
    executed: number | null
    conversionRate: number | null
  }>
  weekly: Array<{
    week: string
    /** Null when any row in the week has an unknown count for that metric. */
    requests: number | null
    /** Null when the stored rows cannot prove distinct agents for the week. */
    agents: number | null
    executed: number | null
    held: number | null
  }>
  funnel: Array<{
    step: string
    label: string
    count: number | null
    conversionRate: number | null
  }>
  refusalReasons: Array<{ reason: string; count: number }>
  agents: Array<{
    /** Stable row key; public-token callers are split by label. */
    key: string
    agent_id: string
    label: string
    labelSource: 'declared' | 'credential' | 'none' | null
    source: string
    sourceEvidence: 'agent_id_heuristic'
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
        {value === null ? 'unknown' : value}
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
        <p className="mt-1 text-[11px] text-bone-faint">Inferred from opaque agent ids, not caller identity</p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-verdant">allow {s.allowed}</span>
        <span className="text-amber">held {s.held}</span>
        <span className="text-rust">refuse {s.refused}</span>
        <span className={s.executed === null ? 'text-bone-faint' : 'text-verdant'}>
          {s.executed === null ? 'executed unknown' : `executed ${s.executed}`}
        </span>
      </div>
    </div>
  )
}

function FunnelCard({ f }: { f: MarketingAnalytics['funnel'][number] }) {
  return (
    <div className="panel p-5 text-center">
      <p className="tabular font-display text-[32px] font-semibold leading-none text-bone">
        {f.count === null ? 'unknown' : f.count}
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

/**
 * The marketing view stays a client read.
 *
 * The previous server version called `fetch('/api/marketing/analytics')` with
 * a relative URL during rendering — which cannot resolve on the server and
 * made the route a render-time crash. Same-origin fetch after mount is the
 * correct shape; the API still enforces RLS and returns an aggregate-only
 * projection.
 */
export default function MarketingAnalyticsPage() {
  const [data, setData] = useState<MarketingAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/marketing/analytics', { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as MarketingAnalytics
        if (alive) setData(body)
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (loading) {
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
          <p className="mt-2 font-mono text-[12px] text-bone-faint">Reading the ledger…</p>
        </div>
      </div>
    )
  }

  if (failed || !data) {
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
        description="Where agents come from, what they ask for, and what converts — so you can see which capabilities drive business and where traffic drops off. Counts and agent names only; parameters are never projected. A declared name is not verified identity."
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
          hint="Distinct agent identities seen"
          tone="default"
        />
        <MarketingKpiCard
          label="Executed"
          value={data.kpis.totalExecuted}
          hint="Requests that ran successfully"
          tone={data.kpis.totalExecuted === null ? 'default' : 'good'}
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
          value={data.kpis.conversionRate !== null ? `${data.kpis.conversionRate}%` : null}
          hint="Executed ÷ requested"
          tone="default"
        />
        <MarketingKpiCard
          label="Hold rate"
          value={data.kpis.holdRate !== null ? `${data.kpis.holdRate}%` : null}
          hint="Held ÷ requested"
          tone="default"
        />
        <MarketingKpiCard
          label="Agent origin buckets"
          value={data.kpis.activeSources}
          hint="Heuristic labels from opaque agent ids, not verified caller identity"
          tone="default"
        />
      </section>

      {/* Agent origin heuristics */}
      <Section
        title="Agent origin buckets (heuristic)"
        description="Best-effort labels inferred from opaque agent ids. They are not caller identity, an integration inventory, or verified traffic attribution."
      >
        {data.sources.length === 0 ? (
          <EmptyState
            title="No agent origin buckets yet"
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
                      {c.access === 'write' ? 'Write' : c.access === 'read' ? 'Read' : 'unknown'}
                    </td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{c.requests}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{c.allowed}</td>
                    <td className="tabular px-4 py-2.5 text-amber">{c.held}</td>
                    <td className="tabular px-4 py-2.5 text-rust">{c.refused}</td>
                    <td className={`tabular px-4 py-2.5 ${c.executed === null ? 'text-bone-faint' : 'text-verdant'}`}>
                      {c.executed ?? 'unknown'}
                    </td>
                    <td className="tabular px-4 py-2.5 text-bone-faint">
                      {c.conversionRate !== null ? `${c.conversionRate}%` : 'unknown'}
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
                    <td className="tabular px-4 py-2.5 text-bone-dim">{w.requests ?? 'unknown'}</td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{w.agents ?? 'unknown'}</td>
                    <td className={`tabular px-4 py-2.5 ${w.executed === null ? 'text-bone-faint' : 'text-verdant'}`}>
                      {w.executed ?? 'unknown'}
                    </td>
                    <td className={`tabular px-4 py-2.5 ${w.held === null ? 'text-bone-faint' : 'text-amber'}`}>
                      {w.held ?? 'unknown'}
                    </td>
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
        description="Each agent, its heuristically inferred origin bucket, and what it asked for. Agent names are self-declared unless the provenance tag says credential. A verified token means the request carried a credential this business issued — not that the name or origin was verified."
      >
        {data.agents.length === 0 ? (
          <EmptyState title="No agents seen yet" body="No distinct agents have made requests." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['Agent', 'Origin (inferred)', 'Token', 'Requests', 'Allowed', 'Held', 'Refused', 'Executed', 'Capabilities'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => {
                  const label = safeAgentLabel(a.label) ||
                    (a.labelSource === 'credential' ? 'Unnamed credential' : 'Unidentified agent')
                  const attribution = agentAttribution({
                    agentId: a.agent_id,
                    agentLabel:
                      label === 'Unidentified agent' || label === 'Unnamed credential'
                        ? undefined
                        : label,
                    agentLabelSource: a.labelSource ?? undefined,
                    assurance: a.assurance,
                  })
                  const provenanceTone =
                    attribution.source === 'credential' && attribution.trusted
                      ? 'good'
                      : attribution.source === 'declared'
                        ? 'warn'
                        : 'neutral'
                  return (
                    <tr key={a.key} className="border-b border-ink-line/60 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-bone">
                        <span className="block max-w-[160px] truncate">{label}</span>
                        <Chip tone={provenanceTone} title={attribution.title}>{attribution.chip}</Chip>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-bone-faint truncate max-w-[120px]">
                        <span className="block truncate">{a.source}</span>
                        <span className="block text-[10px] text-bone-faint">heuristic</span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px]">
                        <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${a.assurance === 'verified' ? 'text-verdant' : 'text-rust'}`}>
                          {a.assurance === 'verified' ? 'token verified' : 'token unverified'}
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
                  )
                })}
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
