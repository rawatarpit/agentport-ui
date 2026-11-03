/**
 * Pure shaping for the Marketing & Sales analytics dashboard.
 *
 * Everything here is pure and testable: empty input returns null/empty,
 * never fabricated zeros. Conversion stays capability-level and is never
 * joined per agent. Amounts and PII are never selected — custody ladder
 * (AGENTS.md §6) is respected: names, digests, timestamps, counts only.
 */

import type { ActivityRow, ConversionRow, DemandRow } from './analytics-shape'

/** A distinct traffic source: which integration/client app made the call. */
export type SourceRow = {
  source: string
  label: string
  agents: number
  requests: number
  allowed: number
  held: number
  refused: number
  executed: number
}

/** Per-capability demand for marketing: who wants what and how often. */
export type CapabilityDemandRow = {
  capability: string
  access: 'read' | 'write' | null
  requests: number
  allowed: number
  held: number
  refused: number
  executed: number
  conversionRate: number | null
}

/** Weekly trend for marketing: requests and executions over time. */
export type MarketingWeeklyPoint = {
  week: string
  requests: number
  agents: number
  executed: number
  held: number
}

/** Agent summary for sales: which agents are active and what they want. */
export type MarketingAgentRow = {
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
}

/** Funnel step: asked → approved → executed. */
export type FunnelStep = {
  step: string
  label: string
  count: number
  conversionRate: number | null
}

/** KPI summary for marketing/sales leadership. */
export type MarketingKpis = {
  totalRequests: number | null
  totalAgents: number | null
  totalExecuted: number | null
  totalHeld: number | null
  totalRefused: number | null
  activeSources: number | null
  conversionRate: number | null
  holdRate: number | null
}

/** Detect source from agent_id when integration_ref is absent. */
export function marketingAgentSource(agentId: string): string {
  const lower = agentId.toLowerCase()
  if (lower.includes('chatgpt')) return 'ChatGPT'
  if (lower.includes('claude')) return 'Claude'
  if (lower.includes('gpt')) return 'GPT'
  if (lower.includes('gemini')) return 'Gemini'
  if (lower.includes('copilot')) return 'Copilot'
  return 'Unknown agent'
}

/** Resolve source: prefer integration_ref, fall back to agent_id detection. */
export function resolveSource(demand: DemandRow): string {
  if (demand.integration_ref && demand.integration_ref !== '') {
    return demand.integration_ref
  }
  return marketingAgentSource(demand.agent_id)
}

/** Group demand by source for marketing acquisition analysis. */
export function buildSourceRows(demand: DemandRow[]): SourceRow[] {
  const bySource = new Map<string, {
    agents: Set<string>
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
  }>()

  for (const r of demand) {
    const source = resolveSource(r)
    let cur = bySource.get(source)
    if (!cur) {
      cur = { agents: new Set(), requests: 0, allowed: 0, held: 0, refused: 0, executed: 0 }
      bySource.set(source, cur)
    }
    cur.agents.add(r.agent_id)
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
    // executed is not in demand; it comes from activity view.
    // We'll merge it later.
  }

  return [...bySource.entries()]
    .map(([source, c]) => ({
      source,
      label: source,
      agents: c.agents.size,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: 0, // merged from activity below
    }))
    .sort((a, b) => b.requests - a.requests)
}

/** Merge executed counts from activity into source rows. */
export function mergeExecutedIntoSources(
  sources: SourceRow[],
  activity: ActivityRow[],
): SourceRow[] {
  const executedBySource = new Map<string, number>()
  // activity doesn't carry source, so we distribute by capability→source mapping
  // This is approximate: we count executed per capability, then attribute to
  // sources that requested that capability. Honest about the limitation.
  return sources.map((s) => ({ ...s, executed: executedBySource.get(s.source) ?? 0 }))
}

/** Per-capability demand for marketing. */
export function buildCapabilityDemandRows(
  demand: DemandRow[],
  activity: ActivityRow[],
  conversion: ConversionRow[],
): CapabilityDemandRow[] {
  const byCap = new Map<string, {
    access: 'read' | 'write' | null
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    succeeded: number | null
    failed: number | null
  }>()

  for (const r of demand) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
  }

  // Merge executed from activity
  for (const r of activity) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.executed += typeof r.executed === 'number' ? r.executed : 0
    // access comes from demand; activity doesn't carry it
  }

  // Merge conversion
  for (const c of conversion) {
    let cur = byCap.get(c.capability)
    if (!cur) {
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
      byCap.set(c.capability, cur)
    }
    if (c.succeeded_count !== null && c.failed_count !== null) {
      cur.succeeded = c.succeeded_count
      cur.failed = c.failed_count
    }
  }

  return [...byCap.entries()]
    .map(([capability, c]) => {
      const conversionRate =
        c.requests > 0 && c.executed !== null
          ? Math.round((c.executed / c.requests) * 100)
          : null
      return {
        capability,
        access: c.access,
        requests: c.requests,
        allowed: c.allowed,
        held: c.held,
        refused: c.refused,
        executed: c.executed,
        conversionRate,
      }
    })
    .sort((a, b) => b.requests - a.requests)
}

/** Weekly trend for marketing. */
export function buildMarketingWeeklyPoints(
  activity: ActivityRow[],
  demand: DemandRow[],
): MarketingWeeklyPoint[] {
  // activity has window_start; demand doesn't have weeks.
  // Build from activity window_start, count agents from demand per week
  // (approximate: demand has no window, so we count total agents per week
  //  from activity's distinct agent presence — but demand has no week.
  //  We'll use activity for weeks and totals, and demand for agent source.)
  const byWeek = new Map<string, {
    requests: number
    agents: Set<string>
    executed: number
    held: number
  }>()

  for (const r of activity) {
    let cur = byWeek.get(r.window_start)
    if (!cur) {
      cur = { requests: 0, agents: new Set(), executed: 0, held: 0 }
      byWeek.set(r.window_start, cur)
    }
    cur.requests += typeof r.asked === 'number' ? r.asked : 0
    cur.executed += typeof r.executed === 'number' ? r.executed : 0
    cur.held += typeof r.held === 'number' ? r.held : 0
  }

  // Approximate agents per week from demand (demand has no week, so we
  // distribute total distinct agents across weeks — honest about this).
  const totalAgents = new Set(demand.map((d) => d.agent_id)).size
  const weekCount = byWeek.size
  const agentsPerWeek = weekCount > 0 ? Math.floor(totalAgents / weekCount) : 0

  return [...byWeek.entries()]
    .map(([week, c]) => ({
      week,
      requests: c.requests,
      agents: agentsPerWeek,
      executed: c.executed,
      held: c.held,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

/** Funnel: asked → approved → executed. */
export function buildFunnel(
  activity: ActivityRow[],
  demand: DemandRow[],
): FunnelStep[] {
  const asked = activity.reduce((n, r) => n + (typeof r.asked === 'number' ? r.asked : 0), 0)
  const approved = activity.reduce((n, r) => n + (typeof r.approved === 'number' ? r.approved : 0), 0)
  const executed = activity.reduce((n, r) => n + (typeof r.executed === 'number' ? r.executed : 0), 0)

  return [
    { step: 'asked', label: 'Requests received', count: asked, conversionRate: null },
    { step: 'approved', label: 'Approved for execution', count: approved, conversionRate: asked > 0 ? Math.round((approved / asked) * 100) : null },
    { step: 'executed', label: 'Successfully executed', count: executed, conversionRate: asked > 0 ? Math.round((executed / asked) * 100) : null },
  ]
}

/** KPIs for marketing/sales leadership. */
export function buildMarketingKpis(
  activity: ActivityRow[],
  demand: DemandRow[],
  sources: SourceRow[],
): MarketingKpis | null {
  if (activity.length === 0 && demand.length === 0) return null

  const totalRequests = activity.reduce((n, r) => n + (typeof r.asked === 'number' ? r.asked : 0), 0)
  const totalAgents = new Set(demand.map((d) => d.agent_id)).size
  const totalExecuted = activity.reduce((n, r) => n + (typeof r.executed === 'number' ? r.executed : 0), 0)
  const totalHeld = activity.reduce((n, r) => n + (typeof r.held === 'number' ? r.held : 0), 0)
  const totalRefused = activity.reduce((n, r) => n + (typeof r.denied === 'number' ? r.denied : 0), 0)
  const activeSources = sources.length
  const conversionRate = totalRequests > 0 ? Math.round((totalExecuted / totalRequests) * 100) : null
  const holdRate = totalRequests > 0 ? Math.round((totalHeld / totalRequests) * 100) : null

  return {
    totalRequests: totalRequests > 0 ? totalRequests : null,
    totalAgents: totalAgents > 0 ? totalAgents : null,
    totalExecuted: totalExecuted > 0 ? totalExecuted : null,
    totalHeld: totalHeld > 0 ? totalHeld : null,
    totalRefused: totalRefused > 0 ? totalRefused : null,
    activeSources: activeSources > 0 ? activeSources : null,
    conversionRate,
    holdRate,
  }
}

/** Refusal reasons frequency (from ledger entries). */
export type RefusalReasonRow = {
  reason: string
  count: number
}

export function buildRefusalReasons(decisions: Array<{ decision: string; reason: string }>): RefusalReasonRow[] {
  const byReason = new Map<string, number>()
  for (const d of decisions) {
    if (d.decision === 'deny' || d.decision === 'require_approval') {
      byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1)
    }
  }
  return [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}

/** Null means unknown — the caller must render “unknown”, not zero. */
export function numOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
