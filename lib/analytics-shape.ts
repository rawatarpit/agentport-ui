/**
 * Pure shaping for the Evidence screen. Keeping this out of the React tree
 * makes the honesty rules testable: empty input returns null KPIs (unknown),
 * never zero; conversion stays capability-level and is never joined per agent.
 */

export type ActivityRow = {
  capability: string
  window_start: string
  asked: number | null
  denied: number | null
  held: number | null
  approved: number | null
  executed: number | null
}

export type ConversionRow = {
  capability: string
  window_start: string
  succeeded: boolean
  failed: boolean
  succeeded_count: number | null
  failed_count: number | null
}

export type DemandRow = {
  agent_id: string
  assurance: 'verified' | 'unverified'
  capability: string
  decision: 'allow' | 'deny' | 'require_approval'
}

export type WeeklyPoint = {
  week: string
  asked: number
  denied: number
  held: number
  executed: number
}

export type CapabilityRow = {
  capability: string
  asked: number
  denied: number
  held: number
  approved: number
  executed: number
  succeeded: boolean | null
  failed: boolean | null
  trend: 'up' | 'down' | 'flat' | 'first'
}

export type AgentCapabilityRow = {
  capability: string
  allow: number
  deny: number
  held: number
  total: number
}

export type AgentRow = {
  agent_id: string
  assurance: 'verified' | 'unverified'
  allow: number
  deny: number
  held: number
  total: number
  capabilities: AgentCapabilityRow[]
}

export type AnalyticsKpis = {
  asked: number
  denied: number
  held: number
  executed: number
  agents: number
}

/** Friendly label for where an agent/chatbot came from. */
export function agentSource(agentId: string): string {
  const lower = agentId.toLowerCase()
  if (lower.includes('chatgpt')) return 'ChatGPT'
  if (lower.includes('claude')) return 'Claude'
  if (lower.includes('gpt')) return 'GPT'
  if (lower.includes('gemini')) return 'Gemini'
  if (lower.includes('copilot')) return 'Copilot'
  return 'Unknown agent'
}

export type AgentSourceRow = {
  source: string
  label: string
  agents: number
  allow: number
  deny: number
  held: number
  total: number
}

/** Group demand by agent source so the merchant can see where traffic
 *  comes from — e.g. how much is ChatGPT vs unverified bots. */
export function buildAgentSourceRows(demand: DemandRow[]): AgentSourceRow[] {
  const bySource = new Map<string, AgentSourceRow>()
  for (const r of demand) {
    const source = agentSource(r.agent_id)
    const cur = bySource.get(source) ?? {
      source,
      label: source,
      agents: 0,
      allow: 0,
      deny: 0,
      held: 0,
      total: 0,
    }
    const agentSeen = new Set<string>()
    // Count distinct agents per source only once per demand row set —
    // we track agents separately below.
    if (r.decision === 'allow') cur.allow += 1
    else if (r.decision === 'deny') cur.deny += 1
    else cur.held += 1
    cur.total += 1
    bySource.set(source, cur)
  }
  // Distinct agent count per source
  const agentsBySource = new Map<string, Set<string>>()
  for (const r of demand) {
    const source = agentSource(r.agent_id)
    let set = agentsBySource.get(source)
    if (!set) { set = new Set(); agentsBySource.set(source, set) }
    set.add(r.agent_id)
  }
  for (const [source, agents] of agentsBySource) {
    const row = bySource.get(source)
    if (row) row.agents = agents.size
  }
  return [...bySource.values()].sort((a, b) => b.total - a.total)
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Distinct ISO weeks, newest first. */
export function weeksOf(activity: ActivityRow[]): string[] {
  return [...new Set(activity.map((r) => String(r.window_start)))].sort().reverse()
}

/** Keep only the latest `count` weeks. */
export function latestWeeks(activity: ActivityRow[], count: number): string[] {
  return weeksOf(activity).slice(0, count)
}

export function filterByWeeks(activity: ActivityRow[], weeks: string[]): ActivityRow[] {
  if (weeks.length === 0) return []
  const set = new Set(weeks)
  return activity.filter((r) => set.has(String(r.window_start)))
}

/** Sum per week across every capability. Weeks with no rows are absent, not zero. */
export function buildWeeklySeries(activity: ActivityRow[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>()
  for (const r of activity) {
    const week = String(r.window_start)
    const cur = byWeek.get(week) ?? { week, asked: 0, denied: 0, held: 0, executed: 0 }
    cur.asked += num(r.asked)
    cur.denied += num(r.denied)
    cur.held += num(r.held)
    cur.executed += num(r.executed)
    byWeek.set(week, cur)
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week))
}

/**
 * Per-capability totals plus a direction from the latest two weeks.
 * Conversion is attached here because it is capability-level by design.
 */
export function buildCapabilityRows(activity: ActivityRow[], conversion: ConversionRow[]): CapabilityRow[] {
  const convByCap = new Map<string, ConversionRow>()
  for (const c of conversion) {
    if (!convByCap.has(c.capability)) convByCap.set(c.capability, c)
  }

  const weeks = weeksOf(activity)
  const [latest, previous] = weeks

  const totals = new Map<string, { asked: number; denied: number; held: number; approved: number; executed: number }>()
  for (const r of activity) {
    const cur = totals.get(r.capability) ?? { asked: 0, denied: 0, held: 0, approved: 0, executed: 0 }
    cur.asked += num(r.asked)
    cur.denied += num(r.denied)
    cur.held += num(r.held)
    cur.approved += num(r.approved)
    cur.executed += num(r.executed)
    totals.set(r.capability, cur)
  }

  const weekTotal = (cap: string, week: string | undefined): number | null => {
    if (week === undefined) return null
    return activity
      .filter((r) => r.capability === cap && String(r.window_start) === week)
      .reduce((n, r) => n + num(r.asked) + num(r.denied) + num(r.held) + num(r.approved) + num(r.executed), 0)
  }

  return [...totals.entries()]
    .map(([capability, t]) => {
      const now = weekTotal(capability, latest)
      const then = weekTotal(capability, previous)
      const trend: CapabilityRow['trend'] =
        now === null || then === null ? 'first' : now === then ? 'flat' : now > then ? 'up' : 'down'
      const c = convByCap.get(capability)
      return {
        capability,
        ...t,
        succeeded: c ? c.succeeded : null,
        failed: c ? c.failed : null,
        trend,
      }
    })
    .sort((a, b) => b.asked + b.executed - (a.asked + a.executed))
}

/**
 * Per-agent demand, including which capabilities each agent asked for.
 * No conversion column: the backend withholds that join, so this table can
 * say who asked for what and how it was decided — never who converted.
 */
export function buildAgentRows(demand: DemandRow[]): AgentRow[] {
  const byAgent = new Map<string, AgentRow>()
  for (const r of demand) {
    const cur = byAgent.get(r.agent_id) ?? {
      agent_id: r.agent_id,
      assurance: r.assurance,
      allow: 0,
      deny: 0,
      held: 0,
      total: 0,
      capabilities: [],
    }
    if (r.decision === 'allow') cur.allow += 1
    else if (r.decision === 'deny') cur.deny += 1
    else cur.held += 1
    cur.total += 1

    let cap = cur.capabilities.find((c) => c.capability === r.capability)
    if (!cap) {
      cap = { capability: r.capability, allow: 0, deny: 0, held: 0, total: 0 }
      cur.capabilities.push(cap)
    }
    if (r.decision === 'allow') cap.allow += 1
    else if (r.decision === 'deny') cap.deny += 1
    else cap.held += 1
    cap.total += 1

    byAgent.set(r.agent_id, cur)
  }
  for (const agent of byAgent.values()) {
    agent.capabilities.sort((a, b) => b.total - a.total || a.capability.localeCompare(b.capability))
  }
  return [...byAgent.values()].sort((a, b) => b.total - a.total)
}

/** Null means unknown — the caller must render “unknown”, not zero. */
export function buildKpis(activity: ActivityRow[], demand: DemandRow[]): AnalyticsKpis | null {
  if (activity.length === 0) return null
  return {
    asked: activity.reduce((n, r) => n + num(r.asked), 0),
    denied: activity.reduce((n, r) => n + num(r.denied), 0),
    held: activity.reduce((n, r) => n + num(r.held), 0),
    executed: activity.reduce((n, r) => n + num(r.executed), 0),
    agents: new Set(demand.map((d) => d.agent_id)).size,
  }
}