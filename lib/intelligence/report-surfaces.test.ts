import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReportSection, ReportSectionId } from '@/lib/intelligence/types'
import { REPORT_GROUPS, sectionsForGroup } from '@/components/intel/report-groups'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflow = readFileSync(join(root, 'components/intel/workflow-list.tsx'), 'utf8')
const operate = readFileSync(join(root, 'components/intel/operate-links.tsx'), 'utf8')
const reportView = readFileSync(join(root, 'components/intel/report-view.tsx'), 'utf8')
const boundary = readFileSync(join(root, 'components/intel/experience-boundary.tsx'), 'utf8')
const coverage = readFileSync(join(root, 'components/intel/visualisation-coverage.tsx'), 'utf8')
const engineStatus = readFileSync(join(root, 'components/intel/engine-status-panel.tsx'), 'utf8')
const profileSummary = readFileSync(join(root, 'components/intel/profile-summary.tsx'), 'utf8')
const savedPage = readFileSync(join(root, 'app/(app)/insights/saved/[id]/page.tsx'), 'utf8')
const reportPage = readFileSync(join(root, 'app/(site)/intelligence/report/page.tsx'), 'utf8')

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

describe('workflow templates are interpretation only', () => {
  it('labels every template unverified and not executable', () => {
    expect(workflow).toContain('interpretation · low confidence')
    expect(workflow).toContain('unverified capability')
    expect(workflow).toContain('template only — not executable')
  })

  it('states every required negation on the template', () => {
    for (const negation of [
      'Not a live capability.',
      'Not enabled.',
      'Not a merchant configuration.',
      'Not deployable from this report.',
      'Not executable without explicit merchant review and approval in the real system.',
      'No amount, ceiling, or spend limit is inferred by this template.',
    ]) {
      expect(workflow).toContain(`<li>${negation}</li>`)
    }
  })

  it('offers no button, form, fetch, or submit handler', () => {
    expect(workflow).not.toMatch(/<button\b|<form\b|\bfetch\s*\(|\bonSubmit\b|\bonClick\s*=/)
  })

  it('never turns required data or capabilities into an amount or ceiling', () => {
    const moneyLines = workflow
      .split('\n')
      .filter((line) => /amount|ceiling|spend|\blimit\b/i.test(line))
      .map((line) => line.trim())
    expect(moneyLines).toEqual(['<li>No amount, ceiling, or spend limit is inferred by this template.</li>'])
  })
})

describe('operate links stay read-only', () => {
  it('links only to ledger, capabilities and approvals', () => {
    const hrefs = [...operate.matchAll(/href: '([^']+)'/g)].map((match) => match[1])
    expect([...hrefs].sort()).toEqual(['/approvals', '/capabilities', '/ledger'])
  })

  it('carries the exact read-only disclaimer and the visible-approvals boundary', () => {
    expect(operate).toContain(
      'Operate links are read-only navigation. Opening them does not deploy, publish, approve, enable, or execute this report or any template on it.',
    )
    expect(operate).toContain('Visible context only. Decisions happen in the hosted approval path.')
    expect(operate).not.toContain('not projected in this console')
    expect(operate).not.toMatch(/<button\b|<form\b|\bfetch\s*\(|\bonSubmit\b|\bonClick\s*=/)
  })

  it('never points at rules, go-live, api routes or approval confirmation', () => {
    expect(operate).not.toMatch(/\/rules|\/go-live|\/api\/|\/approvals\/confirm\//)
  })
})

describe('seven report groups preserve the eleven sections', () => {
  it('shows all seven reviewed group labels', () => {
    expect(REPORT_GROUPS.map((group) => group.label)).toEqual([
      'Industry Overview',
      'Competitive Intelligence',
      'Industry Trends',
      'AI Transformation',
      'Agent Opportunity Map',
      'Risks and Regulation',
      'Sources and Methodology',
    ])
  })

  it('partitions all eleven existing section ids exactly once', () => {
    const grouped = REPORT_GROUPS.flatMap((group) => group.sectionIds)
    expect([...grouped].sort()).toEqual([...SECTION_IDS].sort())
    expect(new Set(grouped).size).toBe(SECTION_IDS.length)
    for (const id of ['sources', 'risks', 'outlook'] as ReportSectionId[]) {
      expect(grouped).toContain(id)
    }
  })

  it('returns only the sections a group owns, in order, and nothing on an empty report', () => {
    const sections = SECTION_IDS.map((id) => ({ id }) as ReportSection)
    for (const group of REPORT_GROUPS) {
      expect(sectionsForGroup(sections, group).map((section) => section.id)).toEqual(group.sectionIds)
      expect(sectionsForGroup([], group)).toEqual([])
    }
  })

  it('uses the same grouping for both the page navigation and the report body', () => {
    expect(reportView.match(/REPORT_GROUPS\.map\(/g)).toHaveLength(2)
    expect(reportView.match(/sectionsForGroup\(report\.sections, group\)/g)).toHaveLength(2)
  })
})

describe('intelligence and operations stay distinct', () => {
  it('states the product boundary without exposing a browser write control', () => {
    expect(boundary).toContain('Intelligence explains the market. Operations proves what happened here.')
    expect(boundary).toContain('No browser approval, publish, execute, or write control appears here.')
    expect(boundary).not.toMatch(/<button\b|<form\b|\bfetch\s*\(|\bonSubmit\b|\bonClick\s*=/)
  })

  it('renders requested charts as evidence coverage and omits empty charts', () => {
    expect(reportView).toContain('<VisualisationCoverage report={report} />')
    expect(reportView).toContain(
      'const charts = section.charts.filter(hasRenderablePoints)',
    )
    expect(reportView).not.toContain('section.charts.map((chart) =>')
    expect(coverage).toContain('A chart appears only when a dated, sourced series exists.')
    expect(coverage).not.toMatch(/\?\?\s*0\b|\b0%|100%|ready/i)
  })

  it('keeps research engine status separate from governor status', () => {
    expect(reportView).toContain('<EngineStatusPanel state="not_configured" />')
    expect(engineStatus).toContain('resolveIntelligenceState(state)')
    expect(engineStatus).toContain('It is not enforcement, governor health, or proof that a')
    expect(engineStatus).not.toMatch(/\bfetch\s*\(|process\.env|\bready\b|\bfetch\(/)
  })

  it('labels an unrecognised engine state unknown instead of unavailable', () => {
    expect(engineStatus).toContain('State: unknown')
    expect(engineStatus).not.toContain('state={resolved ?? \'unavailable\'}')
  })
})

describe('public report actions stay truthful and read-only', () => {
  it('names target market and business description as combined submitted answers', () => {
    expect(profileSummary).toContain('<Row label="Target market" value={targetMarket} />')
    expect(profileSummary).toContain('<Row label="Business description" value={businessDescription} />')
    expect(profileSummary).toContain('combined views of the answers above, not research findings')
    expect(profileSummary).toContain('Profile fields are inputs to this preview.')
  })

  it('renders edit, revisit, dashboard and install as plain links with no write control', () => {
    expect(reportView).toContain('previewActions?: ReportPreviewActions')
    expect(reportView).toContain('<nav aria-label="Report actions" className="panel p-4 sm:p-5">')
    expect(reportView).toContain('Edit answers')
    expect(reportView).toContain('Revisit this report')
    expect(reportView).toContain('Continue to installation')
    expect(reportView).not.toMatch(/<button\b|<form\b|\bfetch\s*\(|\bonSubmit\b|\bonClick\s*=/)
    expect(reportView).toContain('no GitHub permission is granted')
    expect(reportView).toContain('published, enabled, approved, or executed')
  })

  it('does not attach public preview actions to a saved tenant snapshot', () => {
    expect(savedPage).toContain('<ReportView report={row.report} sampleLabel="" />')
    expect(savedPage).not.toContain('previewActions')
  })

  it('emits report_generated only from the surface that builds a report', () => {
    expect(reportView).toContain('if (trackGenerated && !isSample)')
    expect(reportPage).toContain('trackGenerated')
    expect(savedPage).not.toContain('trackGenerated')
  })
})
