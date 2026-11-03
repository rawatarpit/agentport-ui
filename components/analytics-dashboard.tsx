'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendChart } from '@/components/charts/trend-chart'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  buildAgentRows,
  buildAgentSourceRows,
  buildCapabilityRows,
  buildKpis,
  buildWeeklySeries,
  agentSource,
  filterByWeeks,
  latestWeeks,
  type ActivityRow,
  type ConversionRow,
  type DemandRow,
} from '@/lib/analytics-shape'

export type FallbackAnalytics = {
  askedByCap: Record<string, number>
  executedByCap: Record<string, number>
  outcomeCounts: Record<string, number>
  agentDemand: Array<{ agent_id: string; asked: number; executed: number }>
}

const RANGES = [4, 12, 26] as const
type Range = (typeof RANGES)[number]

const TREND: Record<string, { arrow: string; tone: string; label: string }> = {
  up: { arrow: '↗', tone: 'text-verdant', label: 'busier than the previous week' },
  down: { arrow: '↘', tone: 'text-rust', label: 'quieter than the previous week' },
  flat: { arrow: '→', tone: 'text-bone-faint', label: 'steady week over week' },
  first: { arrow: '→', tone: 'text-bone-faint', label: 'first week seen' },
}

function CapabilityRowUI({
  rows,
  selected,
  onSelect,
}: {
  rows: ReturnType<typeof buildCapabilityRows>
  selected: string | null
  onSelect: (capability: string) => void
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-ink-line px-4 py-3">
        <p className="label">By capability</p>
        <p className="mt-1 text-[12px] text-bone-faint">
          Click a capability to filter the chart. Counts, not money.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-bone-dim">
          No capability rows in this window — unknown, not zero.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-line">
                {['Capability', 'Asked', 'Refused', 'Held', 'Executed', 'Trend'].map((h) => (
                  <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const trend = TREND[r.trend]
                const active = selected === r.capability
                return (
                  <tr
                    key={r.capability}
                    className={`border-b border-ink-line/60 last:border-0 ${
                      active ? 'bg-verdant/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onSelect(r.capability)}
                        aria-pressed={active}
                        className={`font-mono text-[12px] ${active ? 'text-verdant' : 'text-bone'} hover:underline`}
                      >
                        {r.capability}
                      </button>
                    </td>
                    <td className="tabular px-4 py-2.5 text-bone-dim">{r.asked}</td>
                    <td className="tabular px-4 py-2.5 text-rust">{r.denied}</td>
                    <td className="tabular px-4 py-2.5 text-amber">{r.held}</td>
                    <td className="tabular px-4 py-2.5 text-verdant">{r.executed}</td>
                    <td className={`${trend.tone}`} title={trend.label}>
                      {trend.arrow}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: ReturnType<typeof buildAgentRows>[number]
  selected: string | null
  onSelect: (agentId: string) => void
}) {
  const isSelected = selected === agent.agent_id
  const source = agentSource(agent.agent_id)
  return (
    <article
      key={agent.agent_id}
      onClick={() => onSelect(agent.agent_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(agent.agent_id)
      }}
      className={`rounded-lg border p-4 transition-colors cursor-pointer ${
        isSelected
          ? 'border-verdant/50 bg-verdant/[0.05]'
          : 'border-ink-line/60 hover:border-verdant/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[11.5px] font-semibold ${isSelected ? 'text-verdant' : 'text-bone'}`}>
            {agent.agent_id}
          </span>
          <span className={`text-[10px] uppercase tracking-[0.12em] text-bone-faint`}>
            {source}
          </span>
          <span className={`text-[10px] uppercase tracking-[0.12em] text-bone-faint ${agent.assurance === 'verified' ? 'text-verdant' : 'text-rust'}`}>
            {agent.assurance}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span className="text-verdant">allow {agent.allow}</span>
          <span className="text-amber">held {agent.held}</span>
          <span className="text-rust">refuse {agent.deny}</span>
        </div>
      </div>
      <p className="font-mono text-[11px] text-bone-dim truncate max-w-[240px]">
        {agent.total} request{agent.total === 1 ? '' : 's'}
      </p>
      <ul className="mt-2 space-y-1">
        {agent.capabilities.slice(0, 4).map((cap) => (
          <li key={cap.capability} className="flex flex-wrap items-center justify-between gap-2 rounded bg-ink/40 px-2.5 py-1.5">
            <span className="font-mono text-[10.5px] text-bone-dim">{cap.capability}</span>
            <span className="flex flex-wrap gap-x-2 text-[10.5px] text-bone-faint">
              {cap.allow > 0 ? <span className="text-verdant">allow {cap.allow}</span> : null}
              {cap.held > 0 ? <span className="text-amber">held {cap.held}</span> : null}
              {cap.deny > 0 ? <span className="text-rust">refuse {cap.deny}</span> : null}
            </span>
          </li>
        ))}
        {agent.capabilities.length > 4 && (
          <li className="text-[10.5px] text-bone-faint">
            +{agent.capabilities.length - 4} more
          </li>
        )}
      </ul>
    </article>
  )
}

function SourceCard({ source }: { source: ReturnType<typeof buildAgentSourceRows>[number] }) {
  return (
    <div className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[12px] font-semibold text-bone truncate">{source.label}</p>
        <p className="mt-0.5 text-[11px] text-bone-faint">
          {source.agents} agent{source.agents === 1 ? '' : 's'} · {source.total} request{source.total === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-verdant">allow {source.allow}</span>
        <span className="text-amber">held {source.held}</span>
        <span className="text-rust">refuse {source.deny}</span>
      </div>
    </div>
  )
}

export function AnalyticsDashboard({
  activity,
  conversion,
  demand,
  fallback,
}: {
  activity: ActivityRow[]
  conversion: ConversionRow[]
  demand: DemandRow[]
  fallback: FallbackAnalytics | null
}) {
  const [range, setRange] = useState<Range>(12)
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [fallbackData, setFallbackData] = useState<FallbackAnalytics | null>(fallback)

  useEffect(() => {
    if (activity.length > 0 || fallbackData) return
    let cancelled = false
    fetch('/api/analytics', { cache: 'no-store' })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: FallbackAnalytics | null) => {
        if (!cancelled && data && hasFallbackData(data)) setFallbackData(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activity.length, fallbackData])

  const weeks = useMemo(() => latestWeeks(activity, range), [activity, range])
  const filtered = useMemo(() => filterByWeeks(activity, weeks), [activity, weeks])
  const weekSet = useMemo(() => new Set(weeks), [weeks])
  const conversionInRange = useMemo(
    () => conversion.filter((c) => weekSet.has(String(c.window_start))),
    [conversion, weekSet],
  )

  const kpis = useMemo(() => buildKpis(filtered, demand), [filtered, demand])
  const capabilityRows = useMemo(
    () => buildCapabilityRows(filtered, conversionInRange),
    [filtered, conversionInRange],
  )
  const agentRows = useMemo(() => buildAgentRows(demand), [demand])
  const sourceRows = useMemo(() => buildAgentSourceRows(demand), [demand])

  const selected = capabilityRows.find((r) => r.capability === selectedCapability) ?? null
  const chartRows = selected ? filtered.filter((r) => r.capability === selected.capability) : filtered
  const chartPoints = useMemo(() => buildWeeklySeries(chartRows), [chartRows])

  const outcomes = useMemo(() => {
    const allow = demand.filter((d) => d.decision === 'allow').length
    const deny = demand.filter((d) => d.decision === 'deny').length
    const held = demand.filter((d) => d.decision === 'require_approval').length
    return { allow, deny, held, total: allow + deny + held }
  }, [demand])

  if (activity.length === 0) {
    return fallbackData && hasFallbackData(fallbackData) ? (
      <FallbackSummary fallback={fallbackData} />
    ) : (
      <div className="panel p-6">
        <p className="label">Evidence</p>
        <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">
          No agent decisions recorded yet. This screen shows{' '}
          <span className="text-bone">unknown</span>, not zero — zero would claim
          a healthy site that may not exist.
        </p>
        <p className="mt-2 font-mono text-[11px] text-bone-faint">
          Counts appear here after the first capability call reaches the governor.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Evidence window</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {weeks.length === 0
              ? 'No weekly windows returned.'
              : `${weeks.length} week${weeks.length === 1 ? '' : 's'} · latest ${weeks[0]}`}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-line bg-ink-soft p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-3 py-1.5 text-[12px] transition-colors ${
                range === r ? 'bg-verdant text-white' : 'text-bone-dim hover:bg-ink'
              }`}
            >
              {r}w
            </button>
          ))}
        </div>
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Asked" value={kpis.asked} hint="Every governed request in the window" />
          <KpiCard label="Refused" value={kpis.denied} hint="Blocked before execution" tone={kpis.denied > 0 ? 'bad' : 'default'} />
          <KpiCard label="Held" value={kpis.held} hint="Waiting on a human decision" tone={kpis.held > 0 ? 'warn' : 'default'} />
          <KpiCard label="Executed" value={kpis.executed} hint="Ran after an allow or approval" tone="good" />
          <KpiCard label="Agents" value={kpis.agents} hint="Distinct credentialed agents seen" />
          <KpiCard label="Sources" value={sourceRows.length} hint="Where traffic comes from (ChatGPT, Claude, …)" />
        </div>
      ) : null}

      {/* ── Where traffic comes from ────────────────────────────── */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Agent sources</p>
            <p className="mt-1 text-[13px] text-bone-dim">
              Where chatbot traffic comes from — e.g. ChatGPT, Claude, unverified bots.
            </p>
          </div>
          {selectedAgent ? (
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="btn btn-sm"
            >
              Clear filter: <span className="font-mono text-bone">{selectedAgent}</span>
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {sourceRows.map((s) => (
            <SourceCard key={s.source} source={s} />
          ))}
        </div>
      </div>

      {/* ── Who asked what ────────────────────────────────────── */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Who asked for what</p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Each agent and the capabilities it asked for. Click an agent to filter.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agentRows.slice(0, 9).map((r) => (
            <AgentCard key={r.agent_id} agent={r} selected={selectedAgent} onSelect={setSelectedAgent} />
          ))}
        </div>
        {agentRows.length > 9 && (
          <p className="mt-3 text-[12px] text-bone-faint text-right">
            Showing 9 of {agentRows.length} agents
          </p>
        )}
      </div>

      {/* ── Weekly trend ───────────────────────────────────────── */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Requests by week</p>
            <p className="mt-1 text-[13px] text-bone-dim">
              Hover a week for exact counts. Toggle a series in the legend.
            </p>
          </div>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedCapability(null)}
              className="btn btn-sm"
            >
              Clear filter: <span className="font-mono text-bone">{selected.capability}</span>
            </button>
          ) : null}
        </div>
        <div className="mt-4">
          <TrendChart points={chartPoints} />
        </div>
      </div>

      <CapabilityRowUI rows={capabilityRows} selected={selectedCapability} onSelect={setSelectedCapability} />

      <OutcomeBar outcomes={outcomes} />
    </div>
  )
}

function OutcomeBar({
  outcomes,
}: {
  outcomes: { allow: number; deny: number; held: number; total: number }
}) {
  const pct = (n: number) => (outcomes.total === 0 ? 0 : Math.round((n / outcomes.total) * 100))
  return (
    <div className="panel p-5">
      <p className="label">Decision outcomes</p>
      {outcomes.total === 0 ? (
        <p className="mt-2 text-[13px] text-bone-dim">
          No decisions recorded yet — unknown, not zero.
        </p>
      ) : (
        <>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink-line/50" role="img" aria-label={`Allowed ${pct(outcomes.allow)} percent, held ${pct(outcomes.held)} percent, refused ${pct(outcomes.deny)} percent`}>
            <div className="bg-verdant" style={{ width: `${pct(outcomes.allow)}%` }} />
            <div className="bg-amber" style={{ width: `${pct(outcomes.held)}%` }} />
            <div className="bg-rust" style={{ width: `${pct(outcomes.deny)}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
            <span className="flex items-center gap-2 text-bone-dim">
              <span className="h-2 w-2 rounded-full bg-verdant" /> Allowed {outcomes.allow}
            </span>
            <span className="flex items-center gap-2 text-bone-dim">
              <span className="h-2 w-2 rounded-full bg-amber" /> Held {outcomes.held}
            </span>
            <span className="flex items-center gap-2 text-bone-dim">
              <span className="h-2 w-2 rounded-full bg-rust" /> Refused {outcomes.deny}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function hasFallbackData(f: FallbackAnalytics): boolean {
  return (
    Object.keys(f.askedByCap).length > 0 ||
    Object.keys(f.outcomeCounts).length > 0 ||
    f.agentDemand.length > 0
  )
}

function FallbackSummary({ fallback }: { fallback: FallbackAnalytics }) {
  const asked = Object.values(fallback.askedByCap).reduce((n, v) => n + v, 0)
  const executed = Object.values(fallback.executedByCap).reduce((n, v) => n + v, 0)
  const denied = fallback.outcomeCounts.deny ?? 0
  const held = fallback.outcomeCounts.require_approval ?? 0
  const caps = Object.entries(fallback.askedByCap)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Asked" value={asked} hint="Aggregated fallback totals" />
        <KpiCard label="Refused" value={denied} hint="Blocked before execution" tone={denied > 0 ? 'bad' : 'default'} />
        <KpiCard label="Held" value={held} hint="Waiting on a human decision" tone={held > 0 ? 'warn' : 'default'} />
        <KpiCard label="Executed" value={executed} hint="Ran after an allow or approval" tone="good" />
      </div>
      <div className="panel overflow-hidden">
        <div className="border-b border-ink-line px-4 py-3">
          <p className="label">By capability</p>
          <p className="mt-1 text-[12px] text-bone-faint">
            Aggregated fallback data. The weekly chart needs windowed rows.
          </p>
        </div>
        {caps.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-bone-dim">
            No capability calls recorded yet — unknown, not zero.
          </p>
        ) : (
          <ul className="divide-y divide-ink-line/60">
            {caps.map(([cap, count]) => (
              <li key={cap} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-mono text-[12px] text-bone">{cap}</span>
                <span className="tabular text-[12px] text-bone-faint">
                  asked {count} · executed {fallback.executedByCap[cap] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
