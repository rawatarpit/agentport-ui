import { describe, expect, it, vi } from 'vitest'

const { evidence } = vi.hoisted(() => ({
  evidence: {
    tenantId: null,
    providerId: 'github-public',
    adapterVersion: 'test-1',
    sourceIdentifier: 'public-search',
    sourceUrl: 'https://api.github.com/search/repositories?q=Specialty%20retail',
    sourceName: 'GitHub public API',
    publishedAt: null,
    collectedAt: '2026-11-25T10:00:00.000Z',
    geography: 'United States',
    geographyScope: 'national',
    industry: 'Specialty retail',
    category: 'technology_development',
    evidenceType: 'technical_document',
    extractedInformation: { totalCount: 12, query: 'Specialty retail' },
    confidence: 'low',
    verificationStatus: 'unverified',
    dataPeriod: null,
    contentHash: 'a'.repeat(64),
    queryHash: 'b'.repeat(64),
    attribution: 'GitHub public API',
  },
}))

vi.mock('../research/providers', () => {
  const provider = {
    id: 'github-public',
    name: 'GitHub public API',
    version: 'test-1',
    capabilities: [{ category: 'technology_development', evidenceTypes: ['technical_document'] }],
    status: () => ({ state: 'available', reason: null, checkedAt: '2026-11-25T10:00:00.000Z' }),
    collect: async () => ({ ok: true, items: [evidence] }),
  }
  return { configuredResearchProviders: [provider], getConfiguredProvider: () => provider }
})

import { buildSourcedReport } from './research-report'
import { emptyProfile } from './types'

describe('sourced report provenance', () => {
  it('replaces the unresearched source gap with the actual collected sources', async () => {
    const report = await buildSourcedReport({
      ...emptyProfile(),
      industry: 'Specialty retail',
      country: 'United States',
      productsServices: 'Coffee subscriptions',
    })

    expect(report.dataMode).toBe('sourced')
    expect(report.sources).toHaveLength(1)
    expect(report.sources[0]).toMatchObject({
      collectedAt: '2026-11-25T10:00:00.000Z',
      geography: 'United States',
      industry: 'Specialty retail',
    })

    const sources = report.sections.find((s) => s.id === 'sources')
    const text = JSON.stringify(sources)
    expect(text).not.toContain('no external sources')
    expect(text).not.toContain('There are no external sources to cite')
    expect(text).toContain('source-coverage')
    expect(text).toContain('2026-11-25T10:00:00.000Z')
    expect(text).toContain('commercial demand')
    expect(text).toContain('market size')
    expect(text).toContain('competitor set')

    const landscape = report.sections.find((s) => s.id === 'landscape')
    expect(JSON.stringify(landscape)).not.toContain('World Bank economic context')
  })

  it('labels a repository count as reported and low confidence, never as demand', async () => {
    const report = await buildSourcedReport({
      ...emptyProfile(),
      industry: 'Specialty retail',
      productsServices: 'Coffee subscriptions',
    })
    const metric = report.sections
      .flatMap((s) => s.metrics)
      .find((m) => m.key === 'github-public-repos')
    expect(metric).toMatchObject({ provenance: 'reported', confidence: 'low', value: 12 })
    expect(metric?.note).toContain('Provider-reported, not independently verified')
    expect(metric?.note).toContain('not competitors, commercial demand, or market size')
  })
})
