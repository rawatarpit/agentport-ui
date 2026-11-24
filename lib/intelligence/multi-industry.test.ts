import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { buildSampleReport } from './sample'
import { emptyProfile, type ReportSectionId, type ResearchProfile } from './types'
import { WORKFLOW_INDUSTRY_KEYS } from './workflows'

const GEOGRAPHIES = ['India', 'Germany']

const SECTION_IDS: ReportSectionId[] = [
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
]

const INDUSTRIES: Array<{ key: string; industry: string; subIndustry: string }> = [
  { key: 'retail-ecommerce', industry: 'Retail & E-commerce', subIndustry: 'Specialty retail' },
  { key: 'healthcare', industry: 'Healthcare', subIndustry: 'Clinics and diagnostics' },
  { key: 'manufacturing', industry: 'Manufacturing', subIndustry: 'Industrial components' },
  { key: 'energy', industry: 'Energy', subIndustry: 'Renewable utilities' },
  { key: 'financial-services', industry: 'Financial services', subIndustry: 'Payments' },
  { key: 'data-centres-gpu', industry: 'Data centres', subIndustry: 'GPU compute hosting' },
]

const CASES = INDUSTRIES.flatMap((industry) =>
  GEOGRAPHIES.map((geography) => {
    const profile: ResearchProfile = {
      ...emptyProfile(),
      industry: industry.industry,
      subIndustry: industry.subIndustry,
      country: geography,
      geography,
      companyName: 'Example Company',
      website: 'https://example.test',
      productsServices: 'Product catalogue and support services',
      businessModel: 'Direct-to-consumer',
      customerSegment: 'Mixed',
      objectives: ['Grow agent-assisted discovery'],
    }
    return { key: industry.key, geography, profile, report: buildReport(profile) }
  }),
)

const SAMPLE_COMPETITOR_NAMES = ['Sample Co A', 'Sample Co B', 'Sample Co C', 'Sample Co D']
const SAMPLE = buildSampleReport(CASES[0]!.profile)
const SAMPLE_FIGURES = SAMPLE.sections.flatMap((section) => [
  ...section.metrics.map((metric) => String(metric.value)),
  ...section.charts.flatMap((chart) => chart.points.map((point) => String(point.value))),
])

function section(report: ReturnType<typeof buildReport>, id: ReportSectionId) {
  const found = report.sections.find((item) => item.id === id)
  if (!found) throw new Error(`Missing section: ${id}`)
  return found
}

describe('multi-industry report honesty', () => {
  it('covers the six industries and two geographies', () => {
    expect(CASES).toHaveLength(WORKFLOW_INDUSTRY_KEYS.length * GEOGRAPHIES.length)
    expect(new Set(CASES.map((entry) => entry.key))).toEqual(new Set(WORKFLOW_INDUSTRY_KEYS))
    expect(new Set(CASES.map((entry) => entry.geography))).toEqual(new Set(GEOGRAPHIES))
  })

  it('emits all eleven sections in order for every industry and geography', () => {
    for (const { report } of CASES) {
      expect(report.sections.map((item) => item.id)).toEqual(SECTION_IDS)
    }
  })

  it('names the geography in the executive finding', () => {
    for (const { report, geography } of CASES) {
      const executive = section(report, 'executive')
      expect(executive.findings.some((finding) => finding.claim.includes(geography))).toBe(true)
    }
  })

  it('keeps competition free of metrics, chart points and sample competitor names', () => {
    for (const { report } of CASES) {
      const competition = section(report, 'competition')
      for (const metric of competition.metrics) expect(metric.value).toBeNull()
      for (const chart of competition.charts) expect(chart.points).toEqual([])
      const competitionText = JSON.stringify(competition)
      for (const name of SAMPLE_COMPETITOR_NAMES) expect(competitionText).not.toContain(name)
    }
  })

  it('never leaks sample markers or invented sample figures into an unresearched report', () => {
    for (const { report } of CASES) {
      const text = JSON.stringify(report)
      expect(report.dataMode).toBe('unresearched')
      expect(report.sources).toEqual([])
      expect(text).not.toContain('sample-source')
      expect(text).not.toContain('sample-method')
      expect(text).not.toContain('FICTIONAL SAMPLE')
      expect(text).not.toContain('Fictional sample')
      expect(text).not.toContain('(fictional)')
      for (const metric of report.sections.flatMap((item) => item.metrics)) {
        expect(metric.value).toBeNull()
        expect(metric.provenance).toBe('unknown')
        expect(SAMPLE_FIGURES).not.toContain(String(metric.value))
      }
      for (const chart of report.sections.flatMap((item) => item.charts)) {
        expect(chart.points).toEqual([])
        for (const point of chart.points) expect(SAMPLE_FIGURES).not.toContain(String(point.value))
      }
    }
  })

  it('keeps agentic-commerce interpretation-only', () => {
    for (const { report } of CASES) {
      const agentic = section(report, 'agentic-commerce')
      expect(agentic.findings.length).toBeGreaterThan(0)
      for (const finding of agentic.findings) expect(finding.provenance).toBe('interpretation')
      expect(agentic.metrics).toEqual([])
      expect(agentic.charts).toEqual([])
      expect(agentic.sourceIds).toEqual([])
      expect(JSON.stringify(agentic)).not.toMatch(/\d+(\.\d+)?\s*(%|USD|bn)/i)
    }
  })

  it('keeps every opportunity an evidence-1 interpretation', () => {
    for (const { report } of CASES) {
      expect(report.opportunities.length).toBeGreaterThan(0)
      for (const opportunity of report.opportunities) {
        expect(opportunity.provenance).toBe('interpretation')
        expect(opportunity.confidence).toBe('low')
        expect(opportunity.scores.evidence).toBe(1)
        expect(opportunity.evidence).toMatch(/submitted profile/)
      }
    }
  })

  it('keeps workflows interpretation-only and industry-specific', () => {
    for (const { report, key } of CASES) {
      expect(report.workflows.length).toBeGreaterThanOrEqual(3)
      for (const workflow of report.workflows) {
        expect(workflow.industryKey).toBe(key)
        expect(workflow.evidenceProvenance).toBe('interpretation')
        expect(workflow.confidence).toBe('low')
        expect(workflow.verifiedCapability).toBe(false)
        expect(workflow.sourceIds).toEqual([])
      }
    }
  })
})
