import { describe, expect, it } from 'vitest'
import { buildSourcedReport } from './research-report'
import { buildReport } from './report'
import { emptyProfile } from './types'

/**
 * Opt-in live research provider verification.
 *
 * Skipped in the default suite so CI stays network-free. It calls the same
 * public providers the report page uses: World Bank Open Data, SEC EDGAR and
 * the GitHub public API. Unreachable providers must leave the report unknown,
 * never invented.
 */

describe.skipIf(process.env.RUN_RESEARCH_PROVIDERS !== '1')('live research providers', () => {
  it('generates a sourced report with real World Bank, SEC and GitHub evidence', async () => {
    const profile = {
      ...emptyProfile(),
      industry: 'Specialty retail',
      country: 'United States',
      companyName: 'Apple',
      productsServices: 'Consumer electronics',
      objectives: ['Let agents answer product questions'],
    }

    const report = await buildSourcedReport(profile)

    expect(report.dataMode).toBe('sourced')
    expect(report.sources.length).toBeGreaterThan(0)
    expect(report.honestyNote).not.toContain('invented')
    expect(report.profile.companyName).toBe('Apple')

    const unknown = report.sections.reduce(
      (total, section) => total + section.metrics.filter((m) => m.value === null).length,
      0,
    )
    const known = report.sections.reduce(
      (total, section) => total + section.metrics.filter((m) => m.value !== null).length,
      0,
    )
    console.log(JSON.stringify({ sources: report.sources.map((s) => ({ label: s.label, url: s.url, kind: s.kind })), metrics: report.sections.flatMap((s) => s.metrics.map((m) => ({ key: m.key, value: m.value, unit: m.unit, sourceId: m.sourceId }))), unknown, known }, null, 2))
    expect(known).toBeGreaterThan(0)
    expect(unknown).toBeGreaterThanOrEqual(0)
  })

  it('stays unresolved when no profile evidence is available', async () => {
    const report = await buildSourcedReport(emptyProfile())
    expect(report.dataMode).toBe('unresearched')
    expect(report.sources).toEqual([])
    expect(report.sections.some((section) => section.metrics.some((m) => m.value !== null))).toBe(false)
  })
})
