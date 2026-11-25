import { describe, expect, it } from 'vitest'
import type { ActivityRow, DemandRow } from './analytics-shape'
import {
  buildCapabilityDemandRows,
  buildFunnel,
  buildMarketingKpis,
  buildSourceRows,
  marketingAgentSource,
  mergeExecutedIntoSources,
  sourceEvidence,
} from './marketing-shape'

const demand: DemandRow = {
  agent_id: 'client:chatgpt-1',
  assurance: 'unverified',
  capability: 'getDocs',
  decision: 'allow',
  integration_ref: null,
}

const activity = (executed: number | null): ActivityRow => ({
  capability: 'getDocs',
  window_start: '2026-11-16',
  asked: 2,
  denied: 0,
  held: 0,
  approved: 2,
  executed,
})

describe('marketing shape keeps unknown as unknown', () => {
  it('labels id-derived sources as inferred, never verified', () => {
    expect(marketingAgentSource('client:chatgpt-1')).toBe('Inferred ChatGPT')
    expect(marketingAgentSource('client:unknown')).toBe('Unclassified agent id')
    expect(sourceEvidence(demand)).toBe('agent_id_heuristic')
    const [source] = buildSourceRows([demand])
    expect(source.label).toBe('Inferred ChatGPT')
    expect(source.evidence).toBe('agent_id_heuristic')
  })

  it('does not attribute executed activity to a source', () => {
    const sources = mergeExecutedIntoSources(buildSourceRows([demand]), [activity(1)])
    expect(sources[0].executed).toBeNull()
  })

  it('keeps capability execution unknown when activity cannot prove it', () => {
    const [row] = buildCapabilityDemandRows([demand], [activity(null)], [])
    expect(row.executed).toBeNull()
    expect(row.conversionRate).toBeNull()
  })

  it('keeps funnel and KPI counts null instead of zero', () => {
    const funnel = buildFunnel([activity(null)], [demand])
    expect(funnel.map((step) => step.count)).toEqual([2, 2, null])

    const kpis = buildMarketingKpis([activity(null)], [demand], buildSourceRows([demand]))
    expect(kpis?.totalRequests).toBe(2)
    expect(kpis?.totalExecuted).toBeNull()
    expect(kpis?.conversionRate).toBeNull()
    expect(kpis?.totalAgents).toBe(1)
    expect(kpis?.activeSources).toBe(1)
  })

  it('keeps totals unknown when there are no demand rows', () => {
    const kpis = buildMarketingKpis([activity(1)], [], [])
    expect(kpis?.totalAgents).toBeNull()
    expect(kpis?.activeSources).toBeNull()
  })
})
