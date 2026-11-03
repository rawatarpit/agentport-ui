import { describe, expect, it } from 'vitest'
import {
  buildAgentRows,
  buildCapabilityRows,
  buildKpis,
  buildWeeklySeries,
  filterByWeeks,
  latestWeeks,
  weeksOf,
  type ActivityRow,
  type ConversionRow,
  type DemandRow,
} from './analytics-shape'

const activity: ActivityRow[] = [
  { capability: 'createOrder', window_start: '2026-10-27', asked: 10, denied: 1, held: 2, approved: 1, executed: 6 },
  { capability: 'createOrder', window_start: '2026-11-03', asked: 14, denied: 2, held: 3, approved: 2, executed: 7 },
  { capability: 'searchProducts', window_start: '2026-10-27', asked: 20, denied: 0, held: 0, approved: 0, executed: 20 },
  { capability: 'searchProducts', window_start: '2026-11-03', asked: 25, denied: 1, held: 0, approved: 0, executed: 24 },
]

const conversion: ConversionRow[] = [
  { capability: 'createOrder', window_start: '2026-11-03', succeeded: true, failed: false, succeeded_count: 7, failed_count: 0 },
  { capability: 'searchProducts', window_start: '2026-11-03', succeeded: true, failed: true, succeeded_count: 24, failed_count: 1 },
]

const demand: DemandRow[] = [
  { agent_id: 'gpt-shopping', assurance: 'verified', capability: 'createOrder', decision: 'allow' },
  { agent_id: 'gpt-shopping', assurance: 'verified', capability: 'createOrder', decision: 'require_approval' },
  { agent_id: 'gpt-shopping', assurance: 'verified', capability: 'searchProducts', decision: 'allow' },
  { agent_id: 'anon', assurance: 'unverified', capability: 'deleteAccount', decision: 'deny' },
]

describe('analytics shape', () => {
  it('returns unknown KPIs for an empty ledger', () => {
    expect(buildKpis([], [])).toBeNull()
    expect(buildWeeklySeries([])).toEqual([])
    expect(buildCapabilityRows([], [])).toEqual([])
    expect(buildAgentRows([])).toEqual([])
  })

  it('aggregates weekly totals without inventing missing weeks', () => {
    const series = buildWeeklySeries(activity)
    expect(series).toEqual([
      { week: '2026-10-27', asked: 30, denied: 1, held: 2, executed: 26 },
      { week: '2026-11-03', asked: 39, denied: 3, held: 3, executed: 31 },
    ])
  })

  it('computes per-capability totals and direction', () => {
    const rows = buildCapabilityRows(activity, conversion)
    const order = rows.find((r) => r.capability === 'createOrder')
    expect(order).toMatchObject({
      asked: 24,
      denied: 3,
      held: 5,
      approved: 3,
      executed: 13,
      succeeded: true,
      failed: false,
      trend: 'up',
    })
    expect(rows[0].capability).toBe('searchProducts')
  })

  it('keeps agent demand separate from conversion', () => {
    const rows = buildAgentRows(demand)
    const agent = rows.find((r) => r.agent_id === 'gpt-shopping')
    expect(agent).toEqual({
      agent_id: 'gpt-shopping',
      assurance: 'verified',
      allow: 2,
      deny: 0,
      held: 1,
      total: 3,
    })
    expect(agent && 'succeeded' in agent).toBe(false)
  })

  it('filters to the latest weeks and preserves order', () => {
    expect(weeksOf(activity)).toEqual(['2026-11-03', '2026-10-27'])
    const weeks = latestWeeks(activity, 1)
    expect(weeks).toEqual(['2026-11-03'])
    expect(filterByWeeks(activity, weeks).map((r) => r.window_start)).toEqual([
      '2026-11-03',
      '2026-11-03',
    ])
  })
})