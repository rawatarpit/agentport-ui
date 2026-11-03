/**
 * Pure aggregation for the Evidence fallback. The views are intentionally
 * separate shapes: activity carries counts, demand carries one row per
 * decision. Joining them by a column that does not exist (the old route read
 * `decision` from v_ledger_conversion) would report an empty outcome bar while
 * claiming the read succeeded. Keep the shapes explicit and testable here.
 */

export type FallbackActivityRow = {
  capability: string
  asked: number | null
  executed: number | null
}

export type FallbackDemandRow = {
  agent_id: string
  assurance: string
  capability: string
  decision: string
}

export type FallbackAnalytics = {
  askedByCap: Record<string, number>
  executedByCap: Record<string, number>
  outcomeCounts: Record<string, number>
  agentDemand: Array<{ agent_id: string; asked: number; executed: number }>
}

export function aggregateFallback(
  activity: FallbackActivityRow[] | null,
  demand: FallbackDemandRow[] | null,
): FallbackAnalytics {
  const askedByCap: Record<string, number> = {}
  const executedByCap: Record<string, number> = {}
  for (const row of activity ?? []) {
    askedByCap[row.capability] = (askedByCap[row.capability] || 0) + (row.asked ?? 0)
    executedByCap[row.capability] = (executedByCap[row.capability] || 0) + (row.executed ?? 0)
  }

  const outcomeCounts: Record<string, number> = {}
  const byAgent = new Map<string, { agent_id: string; asked: number; executed: number }>()
  for (const row of demand ?? []) {
    outcomeCounts[row.decision] = (outcomeCounts[row.decision] || 0) + 1
    const one = byAgent.get(row.agent_id) ?? { agent_id: row.agent_id, asked: 0, executed: 0 }
    one.asked += 1
    // `allow` is the only decision that can execute. Whether the effect then
    // succeeded lives in v_ledger_conversion, and is deliberately not joined
    // per agent here.
    if (row.decision === 'allow') one.executed += 1
    byAgent.set(row.agent_id, one)
  }

  return { askedByCap, executedByCap, outcomeCounts, agentDemand: [...byAgent.values()] }
}
