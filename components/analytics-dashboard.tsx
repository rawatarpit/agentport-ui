'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendChart } from '@/components/charts/trend-chart'
import { KpiCard } from '@/components/ui/kpi-card'
import {
  buildAgentRows,
  buildCapabilityRows,
  buildKpis,
  buildWeeklySeries,
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Asked" value={kpis.asked} hint="Every governed request in the window" />
          <KpiCard label="Refused" value={kpis.denied} hint="Blocked before execution" tone={kpis.denied > 0 ? 'bad' : 'default'} />
          <KpiCard label="Held" value={kpis.held} hint="Waiting on a human decision" tone={kpis.held > 0 ? 'warn' : 'default'} />
          <KpiCard label="Executed" value={kpis.executed} hint="Ran after an allow or approval" tone="good" />
          <KpiCard label="Agents" value={kpis.agents} hint="Distinct credentialed agents seen" />
        </div>
      ) : null}

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

      <div className="grid gap-4 xl:grid-cols-2">
        <CapabilityTable
          rows={capabilityRows}
          selected={selected?.capability ?? null}
          onSelect={(cap) => setSelectedCapability((cur) => (cur === cap ? null : cap))}
        />
        <AgentTable rows={agentRows} />
      </div>

      <OutcomeBar outcomes={outcomes} />
    </div>
  )
}

function CapabilityTable({
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
                    <td className={`px-4 py-2.5 ${trend.tone}`} title={trend.label}>
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

function AgentTable({ rows }: { rows: ReturnType<typeof buildAgentRows> }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-ink-line px-4 py-3">
        <p className="label">By agent</p>
        <p className="mt-1 text-[12px] text-bone-faint">
          Who asks for what. Conversion stays with its capability, never joined per agent.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-bone-dim">
          No agent decisions recorded yet — unknown, not zero.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-line">
                {['Agent', 'Assurance', 'Allowed', 'Held', 'Refused'].map((h) => (
                  <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.agent_id} className="border-b border-ink-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-bone">{r.agent_id}</td>
                  <td className="px-4 py-2.5 text-[12px] text-bone-faint">{r.assurance}</td>
                  <td className="tabular px-4 py-2.5 text-verdant">{r.allow}</td>
                  <td className="tabular px-4 py-2.5 text-amber">{r.held}</td>
                  <td className="tabular px-4 py-2.5 text-rust">{r.deny}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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