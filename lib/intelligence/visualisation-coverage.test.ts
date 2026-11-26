import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { emptyProfile, type ResearchChart, type ResearchReport } from './types'
import { visualisationCoverage } from './visualisation-coverage'

function baseReport(): ResearchReport {
  return buildReport({ ...emptyProfile(), industry: 'Retail' })
}

function withChart(chart: ResearchChart, dataMode: ResearchReport['dataMode'] = 'sourced'): ResearchReport {
  const report = baseReport()
  return {
    ...report,
    dataMode,
    sources: [
      {
        id: 'source-1',
        label: 'Reviewed public dataset',
        url: 'https://example.invalid/dataset',
        publishedAt: '2026-01-10',
        dataPeriod: '2025',
        collectedAt: '2026-01-11',
        geography: 'india',
        industry: 'retail',
        kind: 'secondary',
      },
    ],
    sections: report.sections.map((section, index) =>
      index === 0 ? { ...section, charts: [...section.charts, chart] } : section,
    ),
  }
}

const chart = (overrides: Partial<ResearchChart> = {}): ResearchChart => ({
  id: 'consumer-ai-platform-usage',
  title: 'Consumer AI assistant usage by platform',
  kind: 'bar',
  unit: '%',
  points: [{ label: '2026-01', value: 42 }],
  provenance: 'reported',
  sourceId: 'source-1',
  note: null,
  ...overrides,
})

describe('visualisation coverage', () => {
  it('returns the eight requested views with no inferred values', () => {
    const slots = visualisationCoverage(baseReport())
    expect(slots).toHaveLength(8)
    expect(slots.map((slot) => slot.status)).toEqual(Array(8).fill('unknown'))
    for (const slot of slots) {
      expect(Object.values(slot).some((value) => typeof value === 'number')).toBe(false)
      expect(slot.evidenceRequired.length).toBeGreaterThan(0)
    }
  })

  it('marks a slot sourced only for a dated sourced series with a resolvable source', () => {
    const slots = visualisationCoverage(withChart(chart()))
    expect(slots[0]?.status).toBe('sourced')
    expect(slots[0]?.sourceLabel).toBe('Reviewed public dataset')
    expect(slots.slice(1).every((slot) => slot.status === 'unknown')).toBe(true)
  })

  it('does not promote a chart with missing source or null-only points', () => {
    expect(visualisationCoverage(withChart(chart({ sourceId: null })))[0]?.status).toBe('unknown')
    expect(visualisationCoverage(withChart(chart({ points: [{ label: '2026-01', value: null }] })))[0]?.status).toBe(
      'unknown',
    )
  })

  it('never presents illustrative or unproven data as sourced', () => {
    expect(
      visualisationCoverage(withChart(chart({ provenance: 'illustrative' }), 'sourced'))[0]?.status,
    ).toBe('unknown')
    const sample = { ...baseReport(), dataMode: 'illustrative' as const }
    expect(visualisationCoverage(sample).every((slot) => slot.status === 'illustrative')).toBe(true)
  })

  it('refuses dangling sources, blank labels, non-finite values and interpretation-only series', () => {
    const invalid = [
      chart({ sourceId: 'missing-source' }),
      chart({ points: [{ label: '   ', value: 42 }] }),
      chart({ points: [{ label: '2026-01', value: Number.NaN }] }),
      chart({ points: [{ label: '2026-01', value: Number.POSITIVE_INFINITY }] }),
      chart({ provenance: 'unknown' }),
      chart({ provenance: 'interpretation' }),
    ]
    for (const value of invalid) {
      const slot = visualisationCoverage(withChart(value))[0]
      expect(slot?.status).toBe('unknown')
      expect(slot?.sourceLabel).toBeNull()
    }
  })
})
