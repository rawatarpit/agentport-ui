import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport } from './report'
import { buildSampleReport } from './sample'
import {
  fiveLensCoverage,
  FIVE_LENS_LABELS,
  type FiveLensCoverageRow,
} from './five-lens-coverage'
import { emptyProfile, type ResearchReport, type ResearchSource } from './types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const componentPath = join(root, 'components/intel/five-lens-coverage.tsx')
const landingPath = join(root, 'app/(site)/intelligence/page.tsx')
const reportPagePath = join(root, 'app/(site)/intelligence/report/page.tsx')

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

function flattenedSource(path: string): string {
  return source(path).replace(/\s+/g, ' ')
}

function profile() {
  return { ...emptyProfile(), industry: 'Retail' }
}

const SOURCE: ResearchSource = {
  id: 'source-1',
  label: 'Dated public provider',
  url: 'https://example.invalid/public-provider',
  publishedAt: '2026-01-10',
  dataPeriod: '2025 Q4',
  collectedAt: '2026-01-11',
  geography: 'India',
  industry: 'retail',
  kind: 'secondary',
}

type RowOverrides = Partial<FiveLensCoverageRow> & { key: string; label: string }

function reportWithRow(
  overrides: RowOverrides,
  dataMode: ResearchReport['dataMode'] = 'sourced',
): ResearchReport {
  const report = buildReport(profile())
  return {
    ...report,
    dataMode,
    sources: [SOURCE],
    sections: report.sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            metrics: [
              ...section.metrics,
              {
                key: overrides.key,
                label: overrides.label,
                value: overrides.value ?? 42,
                unit: 'count',
                provenance: overrides.provenance ?? 'reported',
                confidence: 'low' as const,
                sourceId: overrides.sourceId ?? 'source-1',
                period: overrides.period ?? null,
                note: null,
              },
            ],
          }
        : section,
    ),
  }
}

function rowsInput(row: FiveLensCoverageRow) {
  return { rows: [row], sources: [SOURCE] }
}

describe('five lens coverage helper', () => {
  it('uses exactly the five approved labels', () => {
    expect(FIVE_LENS_LABELS).toEqual([
      'AI ecosystem',
      'Consumer behaviour',
      'Market signals',
      'Geographic intelligence',
      'Business implications',
    ])
    expect(fiveLensCoverage()).toHaveLength(5)
    expect(fiveLensCoverage().map((slot) => slot.label)).toEqual([...FIVE_LENS_LABELS])
  })

  it('keeps sample and unresearched reports fully unknown', () => {
    for (const report of [buildSampleReport(profile()), buildReport(profile())]) {
      const slots = fiveLensCoverage(report)
      expect(slots.every((slot) => slot.status === 'unknown')).toBe(true)
      expect(slots.every((slot) => slot.coverage === 'unknown')).toBe(true)
      expect(slots.every((slot) => !slot.sourceBacked)).toBe(true)
      expect(slots.every((slot) => slot.sourceLabel === null)).toBe(true)
    }
  })

  it('keeps unmapped, sample-sourced, null-valued and interpretation rows unknown', () => {
    const invalid: FiveLensCoverageRow[] = [
      { key: 'unrelated-key', label: 'Unrelated measure', value: 42, provenance: 'reported', sourceId: 'source-1' },
      { key: 'consumer-assistant-usage', label: 'Consumer assistant usage', value: 42, provenance: 'illustrative', sourceId: 'source-1' },
      { key: 'consumer-assistant-usage', label: 'Consumer assistant usage', value: null, provenance: 'reported', sourceId: 'source-1' },
      { key: 'consumer-assistant-usage', label: 'Consumer assistant usage', value: 42, provenance: 'interpretation', sourceId: 'source-1' },
      { key: 'consumer-assistant-usage', label: 'Consumer assistant usage', value: 42, provenance: 'reported', sourceId: 'missing-source' },
    ]
    for (const row of invalid) {
      expect(fiveLensCoverage(rowsInput(row))[1]?.status).toBe('unknown')
    }
    const sampleSource: ResearchSource = { ...SOURCE, id: 'sample-source', kind: 'sample' }
    expect(
      fiveLensCoverage({
        rows: [
          {
            key: 'consumer-assistant-usage',
            label: 'Consumer assistant usage',
            value: 42,
            provenance: 'reported',
            sourceId: 'sample-source',
          },
        ],
        sources: [sampleSource],
      })[1]?.status,
    ).toBe('unknown')
  })

  it('marks a mapped sourced row as source-backed with its evidence metadata', () => {
    const slots = fiveLensCoverage(
      reportWithRow({
        key: 'consumer-assistant-usage',
        label: 'Consumer assistant usage',
        period: '2025 Q4',
      }),
    )
    const consumer = slots[1]
    expect(consumer?.status).toBe('sourced')
    expect(consumer?.coverage).toBe('source-backed')
    expect(consumer?.sourceBacked).toBe(true)
    expect(consumer?.sourceLabel).toBe('Dated public provider')
    expect(consumer?.reportedAt).toBe('2025 Q4')
    expect(consumer?.geography).toBe('India')
    expect(slots.filter((slot) => slot.status === 'sourced')).toHaveLength(1)
  })

  it('refuses a sourced-looking row inside an unresearched report', () => {
    expect(
      fiveLensCoverage(reportWithRow({ key: 'consumer-assistant-usage', label: 'Consumer assistant usage' }, 'unresearched'))[1]
        ?.status,
    ).toBe('unknown')
  })
})

describe('five lens component and pages stay read-only', () => {
  it('renders all labels with an explicit unknown state and evidence methodology', () => {
    const text = flattenedSource(componentPath)
    const helperText = source(join(root, 'lib/intelligence/five-lens-coverage.ts'))
    for (const label of FIVE_LENS_LABELS) expect(helperText).toContain(`'${label}'`)
    expect(text).toContain('{slot.label}')
    expect(text).toContain("'unknown'")
    expect(text).toContain('unknown')
    for (const term of [
      'Source',
      'Publication / reporting date',
      'Geography',
      'Definition',
      'Limitations',
      'Crawler activity',
      'assistant usage',
      'AI-referred traffic',
      'autonomous agent interactions',
      'transactions',
      'No AI traffic or search visibility measurement is claimed here',
    ]) {
      expect(text).toContain(term)
    }
  })

  it('has no write control, fetch, secret or sample fixture', () => {
    for (const path of [componentPath, landingPath, reportPagePath]) {
      const text = source(path)
      expect(text, path).not.toMatch(/<button\b|<form\b|\bonSubmit\b|\bonClick\b/)
      expect(text, path).not.toMatch(/\bfetch\s*\(|process\.env|service_role|createAdminClient|createServerClient/)
    }
    expect(source(componentPath)).not.toMatch(/buildSampleReport|@\/lib\/intelligence\/sample/)
  })

  it('renders the component on the landing page with no report', () => {
    const landing = source(landingPath)
    expect(landing).toContain('import { IntelForm } from \'@/components/intel/intel-form\'')
    expect(landing).toContain('<IntelForm key={params.toString()} initialProfile={initialProfile} />')
    expect(landing).toContain('<FiveLensCoverage />')
    expect(landing).toContain('/intelligence/report?sample=1')
  })

  it('carries required honest acquisition copy and categories', () => {
    const landing = source(landingPath)
    expect(landing).toContain('Understand how AI is changing your industry.')
    for (const category of [
      'ecommerce/retail',
      'manufacturing',
      'SaaS/technology',
      'financial services',
      'travel/hospitality',
      'logistics/supply chain',
      'healthcare',
      'B2B wholesale/distribution',
    ]) {
      expect(landing).toContain(category)
    }
    expect(landing).toContain('navigation and query aids only')
    expect(landing).toContain('does not measure AI traffic or search visibility')
    expect(landing).toContain('Request a pilot')
    expect(landing).toContain('href="/pilot"')
    expect(landing).toContain("canonical: '/intelligence'")
    expect(landing).toContain('openGraph:')
    expect(landing).toContain('twitter:')
  })

  it('renders coverage before the report and tracks the view from a client boundary', () => {
    const page = source(reportPagePath)
    const componentText = source(componentPath)
    expect(page).toContain('<ReportViewTracker />')
    expect(page).toContain('<FiveLensCoverage report={report} />')
    expect(page.indexOf('five-lens-coverage')).toBeLessThan(page.indexOf('<ReportView'))
    expect(componentText).toContain("import { trackReportViewed } from '@/lib/funnel-events'")
    expect(componentText).toContain('trackReportViewed()')
    expect(page).toContain('robots: { index: false, follow: false }')
    expect(page).toContain("canonical: '/intelligence'")
    expect(page).toContain('profileFromParams(params)')
    expect(page).toMatch(/for \(const \[key, value\] of Object\.entries\(searchParams\)\)/)
    expect(page).toContain('params.set(key, v)')
  })
})
