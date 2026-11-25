/**
 * Pure shaping for the Marketing & Sales analytics dashboard.
 *
 * Everything here is pure and testable: empty input returns null/empty,
 * never fabricated zeros. Conversion stays capability-level and is never
 * joined per agent. Amounts and PII are never selected — custody ladder
 * (AGENTS.md §6) is respected: names, digests, timestamps, counts only.
 */

import { sumNullableCounts } from './analytics-counts'
import type { ActivityRow, ConversionRow, DemandRow } from './analytics-shape'

/** Adding a known number to an unknown count must stay unknown, never zero. */
function addNullable(total: number | null, value: number | null): number | null {
  if (total === null || value === null) return null
  return total + value
}

/** A distinct source bucket: a declared integration ref or an id heuristic. */
export type SourceRow = {
  source: string
  label: string
  evidence: 'integration_ref' | 'agent_id_heuristic'
  agents: number
  requests: number
  allowed: number
  held: number
  refused: number
  executed: number | null
}

/** Per-capability demand for marketing: who wants what and how often. */
export type CapabilityDemandRow = {
  capability: string
  access: 'read' | 'write' | null
  requests: number
  allowed: number
  held: number
  refused: number
  executed: number | null
  conversionRate: number | null
}

/** Weekly trend for marketing: requests and executions over time. */
export type MarketingWeeklyPoint = {
  week: string
  /** Null when any row in the week has an unknown count for that metric. */
  requests: number | null
  /** Null when the stored rows cannot prove distinct agents for the week. */
  agents: number | null
  executed: number | null
  held: number | null
}

/** Agent summary for sales: which agents are active and what they want. */
export type MarketingAgentRow = {
  agent_id: string
  source: string
  sourceEvidence: 'integration_ref' | 'agent_id_heuristic'
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
  count: number | null
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

/** Detect a bucket from agent_id when integration_ref is absent. Heuristic only. */
export function marketingAgentSource(agentId: string): string {
  const lower = agentId.toLowerCase()
  if (lower.includes('chatgpt')) return 'Inferred ChatGPT'
  if (lower.includes('claude')) return 'Inferred Claude'
  if (lower.includes('gpt')) return 'Inferred GPT'
  if (lower.includes('gemini')) return 'Inferred Gemini'
  if (lower.includes('copilot')) return 'Inferred Copilot'
  return 'Unclassified agent id'
}

/** Resolve source: prefer integration_ref, fall back to agent_id detection. */
export function resolveSource(demand: DemandRow): string {
  if (demand.integration_ref && demand.integration_ref !== '') {
    return demand.integration_ref
  }
  return marketingAgentSource(demand.agent_id)
}

export function sourceEvidence(
  demand: DemandRow,
): 'integration_ref' | 'agent_id_heuristic' {
  return demand.integration_ref && demand.integration_ref !== ''
    ? 'integration_ref'
    : 'agent_id_heuristic'
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

  const evidenceBySource = new Map<string, SourceRow['evidence']>()

  for (const r of demand) {
    const source = resolveSource(r)
    evidenceBySource.set(source, sourceEvidence(r))
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
      evidence: evidenceBySource.get(source) ?? 'agent_id_heuristic',
      agents: c.agents.size,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: 0, // merged from activity below
    }))
    .sort((a, b) => b.requests - a.requests)
}

/**
 * Activity rows carry no source, so an executed count cannot be attributed to
 * a source. The honest value is null; printing zero would claim a measurement.
 */
export function mergeExecutedIntoSources(
  sources: SourceRow[],
  activity: ActivityRow[],
): SourceRow[] {
  void activity
  return sources.map((s) => ({ ...s, executed: null }))
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
    executed: number | null
    succeeded: number | null
    failed: number | null
  }>()

  for (const r of demand) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
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
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.executed = addNullable(cur.executed, r.executed)
    // access comes from demand; activity doesn't carry it
  }

  // Merge conversion
  for (const c of conversion) {
    let cur = byCap.get(c.capability)
    if (!cur) {
      cur = { access: null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
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
    requests: number | null
    executed: number | null
    held: number | null
  }>()

  for (const r of activity) {
    let cur = byWeek.get(r.window_start)
    if (!cur) {
      cur = { requests: 0, executed: 0, held: 0 }
      byWeek.set(r.window_start, cur)
    }
    cur.requests = addNullable(cur.requests, r.asked)
    cur.executed = addNullable(cur.executed, r.executed)
    cur.held = addNullable(cur.held, r.held)
  }

  // The activity view carries no per-week agent identity. Dividing the
  // all-time agent count by the number of weeks is not a measurement, so the
  // week's agent count is `null` until a row can prove it.
  return [...byWeek.entries()]
    .map(([week, c]) => ({
      week,
      requests: c.requests,
      agents: null,
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
  const asked = sumNullableCounts(activity.map((r) => r.asked))
  const approved = sumNullableCounts(activity.map((r) => r.approved))
  const executed = sumNullableCounts(activity.map((r) => r.executed))
  const rate = (part: number | null, whole: number | null): number | null =>
    part !== null && whole !== null && whole > 0 ? Math.round((part / whole) * 100) : null

  return [
    { step: 'asked', label: 'Requests received', count: asked, conversionRate: null },
    { step: 'approved', label: 'Approved for execution', count: approved, conversionRate: rate(approved, asked) },
    { step: 'executed', label: 'Successfully executed', count: executed, conversionRate: rate(executed, asked) },
  ]
}

/** KPIs for marketing/sales leadership. */
export function buildMarketingKpis(
  activity: ActivityRow[],
  demand: DemandRow[],
  sources: SourceRow[],
): MarketingKpis | null {
  if (activity.length === 0 && demand.length === 0) return null

  const totalRequests = sumNullableCounts(activity.map((r) => r.asked))
  const totalAgents = demand.length > 0 ? new Set(demand.map((d) => d.agent_id)).size : null
  const totalExecuted = sumNullableCounts(activity.map((r) => r.executed))
  const totalHeld = sumNullableCounts(activity.map((r) => r.held))
  const totalRefused = sumNullableCounts(activity.map((r) => r.denied))
  const activeSources = demand.length > 0 ? sources.length : null
  const rate = (part: number | null, whole: number | null): number | null =>
    part !== null && whole !== null && whole > 0 ? Math.round((part / whole) * 100) : null

  return {
    totalRequests,
    totalAgents,
    totalExecuted,
    totalHeld,
    totalRefused,
    activeSources,
    conversionRate: rate(totalExecuted, totalRequests),
    holdRate: rate(totalHeld, totalRequests),
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
