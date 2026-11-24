import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildOpportunities, buildReport, rankOpportunities, RANKING_WEIGHTS } from './report'
import { buildSampleReport } from './sample'
import { type AgentOpportunity, type ResearchProfile } from './types'

const PROFILE: ResearchProfile = {
  industry: 'Specialty retail',
  subIndustry: 'Independent cafés',
  country: 'India',
  geography: 'Urban India',
  companyName: 'Example Cafe',
  website: 'https://example.in',
  productsServices: 'Coffee beans, subscriptions and café gift cards',
  businessModel: 'Direct-to-consumer',
  customerSegment: 'Consumers',
  objectives: ['Grow agent-assisted discovery'],
}

describe('buildReport', () => {
  const report = buildReport(PROFILE)

  it('never emits a market figure without a source', () => {
    const metrics = report.sections.flatMap((s) => s.metrics)
    expect(metrics.length).toBeGreaterThan(0)
    for (const metric of metrics) {
      expect(metric.value).toBeNull()
      expect(metric.provenance).toBe('unknown')
      expect(metric.confidence).toBe('unknown')
      expect(metric.sourceId).toBeNull()
    }
  })

  it('emits no chart points when no dated series exists', () => {
    for (const chart of report.sections.flatMap((s) => s.charts)) {
      expect(chart.points).toEqual([])
      expect(chart.provenance).toBe('unknown')
    }
  })

  it('has no sources and declares the unresearched mode', () => {
    expect(report.sources).toEqual([])
    expect(report.dataMode).toBe('unresearched')
    expect(report.honestyNote).toMatch(/No verified market dataset/)
  })

  it('still covers all eleven required sections', () => {
    expect(report.sections.map((s) => s.id)).toEqual([
      'executive',
      'landscape',
      'demand',
      'ai-transformation',
      'competition',
      'ecosystem',
      'agentic-commerce',
      'opportunity-map',
      'risks',
      'outlook',
      'sources',
    ])
  })

  it('marks inferred opportunities as interpretations with low confidence', () => {
    for (const opportunity of report.opportunities) {
      expect(opportunity.provenance).toBe('interpretation')
      expect(opportunity.confidence).toBe('low')
      expect(opportunity.evidence).toMatch(/submitted profile/)
    }
  })

  it('says no historical comparison exists when no snapshot was supplied', () => {
    const reportText = JSON.stringify(report)
    expect(reportText).not.toMatch(/previous (year|quarter|period)/i)
  })
})

describe('opportunity ranking', () => {
  it('uses the documented weights and produces a 0–5 score', () => {
    const opportunities = buildOpportunities(PROFILE)
    const ranked = rankOpportunities(opportunities)
    expect(ranked[0]?.rank).toBe(1)
    for (const opportunity of ranked) {
      const expected =
        opportunity.scores.demand * RANKING_WEIGHTS.demand +
        opportunity.scores.impact * RANKING_WEIGHTS.impact +
        opportunity.scores.feasibility * RANKING_WEIGHTS.feasibility +
        opportunity.scores.timing * RANKING_WEIGHTS.timing +
        opportunity.scores.evidence * RANKING_WEIGHTS.evidence
      expect(opportunity.score).toBeCloseTo(Math.round(expected * 100) / 100, 2)
      expect(opportunity.score).toBeGreaterThanOrEqual(0)
      expect(opportunity.score).toBeLessThanOrEqual(5)
    }
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
    }
  })

  it('requires a human confirmation for every write-bearing opportunity', () => {
    for (const opportunity of buildOpportunities(PROFILE)) {
      if (opportunity.access.includes('write')) {
        expect(opportunity.humanConfirmation).toBe('required')
      }
    }
  })

  it('never lets an inferred opportunity claim evidence above 1', () => {
    for (const opportunity of buildOpportunities(PROFILE)) {
      expect(opportunity.scores.evidence).toBe(1)
    }
  })

  it('ranks deterministically for the same profile', () => {
    const a = buildOpportunities(PROFILE).map((o) => `${o.id}:${o.score}`)
    const b = buildOpportunities(PROFILE).map((o) => `${o.id}:${o.score}`)
    expect(a).toEqual(b)
  })

  it('does not let a filled-in profile manufacture demand evidence', () => {
    const sparse = buildOpportunities({ ...PROFILE, website: null, productsServices: null, objectives: [] })
    const complete = buildOpportunities(PROFILE)
    const sparseEvidence = sparse.map((o: AgentOpportunity) => o.scores.evidence)
    const completeEvidence = complete.map((o: AgentOpportunity) => o.scores.evidence)
    expect(sparseEvidence).toEqual(completeEvidence)
  })
})

describe('illustrative sample isolation', () => {
  const report = buildSampleReport(PROFILE)

  it('declares the sample mode and carries a loud honesty note', () => {
    expect(report.dataMode).toBe('illustrative')
    expect(report.honestyNote).toMatch(/FICTIONAL SAMPLE/)
  })

  it('tags every metric and series point as illustrative with a sample source', () => {
    for (const section of report.sections) {
      for (const metric of section.metrics) {
        expect(metric.value).not.toBeNull()
        expect(metric.provenance).toBe('illustrative')
        expect(metric.sourceId).toBe('sample-source')
      }
      for (const chart of section.charts) {
        expect(chart.provenance).toBe('illustrative')
        expect(chart.sourceId).toBe('sample-source')
        expect(chart.points.length).toBeGreaterThan(0)
      }
    }
  })

  it('never gives the sample a real URL or publication date', () => {
    for (const source of report.sources) {
      expect(source.kind).toBe('sample')
      expect(source.url).toBeNull()
      expect(source.publishedAt).toBeNull()
      expect(source.label).toMatch(/not a citation|illustrative/i)
    }
  })

  it('is only reachable behind an explicit sample flag', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/(site)/intelligence/report/page.tsx'),
      'utf8',
    )
    expect(page).toMatch(/sample=1|=== '1'/)
    expect(page).toMatch(/buildSampleReport/)
    expect(page).toMatch(/FICTIONAL SAMPLE/)
  })
})
