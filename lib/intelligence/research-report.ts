/**
 * Sourced report generation.
 *
 * `buildReport` is the honest default: no provider, no numbers. This module
 * overlays real public-provider evidence without inventing anything. If no
 * provider returns usable evidence, the report stays `unresearched` and every
 * market figure remains null.
 */

import type {
  CollectedEvidence,
  GeographyScope,
  ResearchCategory,
  ResearchQuery,
} from '../research/types'
import { buildReport } from './report'
import { configuredResearchProviders, getConfiguredProvider } from '../research/providers'
import type {
  Finding,
  Metric,
  ResearchProfile,
  ResearchReport,
  ReportSection,
  ReportSectionId,
  ResearchSource,
} from './types'

function scopeFor(geography: string | null): GeographyScope {
  return geography ? 'national' : 'global'
}

function queriesFor(profile: ResearchProfile): ResearchQuery[] {
  const queries: ResearchQuery[] = []
  const terms = [profile.industry, profile.productsServices].filter((value): value is string => Boolean(value))

  if (profile.country) {
    queries.push({
      tenantId: null,
      category: 'economic_dataset',
      geography: profile.country,
      geographyScope: scopeFor(profile.country),
      industry: profile.industry,
      companyName: profile.companyName,
      period: null,
      terms: [],
    })
  }

  if (profile.companyName) {
    queries.push({
      tenantId: null,
      category: 'company_competitor',
      geography: profile.country ?? 'global',
      geographyScope: scopeFor(profile.country),
      industry: profile.industry,
      companyName: profile.companyName,
      period: null,
      terms: [profile.companyName],
    })
  }

  queries.push({
    tenantId: null,
    category: 'technology_development',
    geography: profile.country ?? 'global',
    geographyScope: scopeFor(profile.country),
    industry: profile.industry,
    companyName: profile.companyName,
    period: null,
    terms,
  })

  return queries
}

function sourceIdFor(evidence: CollectedEvidence): string {
  const safe = evidence.sourceIdentifier.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
  return `source-${evidence.providerId}-${safe || 'evidence'}`
}

function sourceFor(evidence: CollectedEvidence): { id: string; source: ResearchSource } {
  const id = sourceIdFor(evidence)
  const isPrimary = evidence.providerId === 'world-bank' || evidence.providerId === 'sec-edgar'
  return {
    id,
    source: {
      id,
      label: evidence.sourceName,
      url: evidence.sourceUrl,
      publishedAt: evidence.publishedAt,
      dataPeriod: evidence.dataPeriod,
      collectedAt: evidence.collectedAt,
      geography: evidence.geography,
      industry: evidence.industry,
      kind: isPrimary ? 'primary' : 'secondary',
    },
  }
}

function metricFor(evidence: CollectedEvidence): {
  sectionId: 'landscape' | 'competition' | 'ecosystem'
  key: string
  metric: Metric
} | null {
  const extracted = evidence.extractedInformation
  const sourceId = sourceIdFor(evidence)
  const baseNote = sourceNote(evidence)

  if (evidence.providerId === 'world-bank') {
    const indicator = extracted.indicator as string | null
    const value = typeof extracted.value === 'number' ? extracted.value : null
    const country = extracted.country as string | null
    const date = extracted.date as string | null
    if (!indicator || !date || value === null) return null
    const label = `${indicatorLabel(indicator)} (World Bank, ${country ?? 'country'})`
    return {
      sectionId: 'landscape',
      key: `world-bank-${indicator}-${date}`,
      metric: {
        key: `world-bank-${indicator}-${date}`,
        label,
        value,
        unit: worldBankUnit(indicator),
        provenance: 'reported',
        confidence: 'low',
        sourceId,
        period: date,
        note: `${baseNote} ${indicator} for ${country ?? 'the declared country'} in ${date}. Economic context only, not a market-size estimate.`,
      },
    }
  }

  if (evidence.providerId === 'sec-edgar') {
    const count = typeof extracted.recentFilingsCount === 'number' ? extracted.recentFilingsCount : null
    const name = extracted.name as string | null
    const cik = extracted.cik as string | null
    // SEC submissions can omit the recent array for large filers, so a zero
    // here means "endpoint did not return filings", not "no filings exist."
    if (count === null || count <= 0) return null
    return {
      sectionId: 'competition',
      key: `sec-edgar-recent-filings-${cik ?? 'unknown'}`,
      metric: {
        key: `sec-edgar-recent-filings-${cik ?? 'unknown'}`,
        label: `Recent SEC filings (${name ?? 'company'})`,
        value: count,
        unit: 'filings',
        provenance: 'reported',
        confidence: 'low',
        sourceId,
        period: null,
        note: `${baseNote} Filing count is not revenue or market share.`,
      },
    }
  }

  if (evidence.providerId === 'github-public') {
    const count = typeof extracted.totalCount === 'number' ? extracted.totalCount : null
    const terms = extracted.query as string | null
    if (count === null || !terms) return null
    return {
      sectionId: 'ecosystem',
      key: 'github-public-repos',
      metric: {
        key: 'github-public-repos',
        label: `Public repositories matching "${terms}"`,
        value: count,
        unit: 'repositories',
        provenance: 'reported',
        confidence: 'low',
        sourceId,
        period: null,
        note: `${basePoint(terms, evidence)}Public repository matches are not competitors, commercial demand, or market size.`,
      },
    }
  }

  return null
}

function findingFor(evidence: CollectedEvidence): { sectionId: 'executive' | 'landscape' | 'competition' | 'ecosystem'; finding: Finding } | null {
  const sourceId = sourceIdFor(evidence)
  const baseNote = sourceNote(evidence)

  if (evidence.providerId === 'world-bank') {
    const indicator = evidence.extractedInformation.indicator as string | null
    const rawValue = evidence.extractedInformation.value
    const value = typeof rawValue === 'number' ? rawValue : null
    const country = evidence.extractedInformation.country as string | null
    const date = evidence.extractedInformation.date as string | null
    if (!indicator || value === null || !date) return null
    return {
      sectionId: 'landscape',
      finding: {
        id: `world-bank-${indicator}-${date}`,
        claim: `World Bank reports ${indicatorLabel(indicator)} of ${formatValue(value, worldBankUnit(indicator))} for ${country ?? 'the declared country'} in ${date}.`,
        provenance: 'reported',
        confidence: 'low',
        sourceIds: [sourceId],
        note: `${baseNote} Macroeconomic context, not industry demand or market size.`,
      },
    }
  }

  if (evidence.providerId === 'sec-edgar') {
    const name = evidence.extractedInformation.name as string | null
    const ticker = evidence.extractedInformation.ticker as string | null
    const cik = evidence.extractedInformation.cik as string | null
    const sic = evidence.extractedInformation.sic as number | null
    const sicDescription = evidence.extractedInformation.sicDescription as string | null
    const count = typeof evidence.extractedInformation.recentFilingsCount === 'number' ? evidence.extractedInformation.recentFilingsCount : null
    if (!name && !cik) return null
    return {
      sectionId: 'competition',
      finding: {
        id: `sec-edgar-${cik ?? 'unknown'}`,
        claim: `SEC EDGAR company profile: ${name ?? 'company'} ${ticker ? `(${ticker})` : ''}${cik ? `, CIK ${cik}` : ''}${sic != null ? `, SIC ${sic}${sicDescription ? ` — ${sicDescription}` : ''}` : ''}.`,
        provenance: 'reported',
        confidence: 'low',
        sourceIds: [sourceId],
        note: `${baseNote} Public registry and filing data; not a competitor dataset.${count != null ? ` ${count} recent filings are indexed.` : ''}`,
      },
    }
  }

  if (evidence.providerId === 'github-public') {
    const count = typeof evidence.extractedInformation.totalCount === 'number' ? evidence.extractedInformation.totalCount : null
    const terms = evidence.extractedInformation.query as string | null
    if (count === null || !terms) return null
    return {
      sectionId: 'ecosystem',
      finding: {
        id: `github-public-${encodeURIComponent(terms)}`,
        claim: `GitHub public search returned ${count} repositories matching "${terms}".`,
        provenance: 'reported',
        confidence: 'low',
        sourceIds: [sourceId],
        note: `${baseNote} Public repository matches are not competitors, commercial demand, or market size.`,
      },
    }
  }

  return null
}

function indicatorLabel(indicator: string): string {
  const labels: Record<string, string> = {
    'NY.GDP.MKTP.CD': 'Gross domestic product (GDP)',
    'SP.POP.TOTL': 'Population',
    'IT.NET.USER.ZS': 'Internet users',
    'NV.IND.MANF.ZS': 'Manufacturing value added',
  }
  return labels[indicator] ?? indicator
}

function worldBankUnit(indicator: string): string {
  const units: Record<string, string> = {
    'NY.GDP.MKTP.CD': 'USD',
    'SP.POP.TOTL': 'people',
    'IT.NET.USER.ZS': '% of population',
    'NV.IND.MANF.ZS': '% of GDP',
  }
  return units[indicator] ?? ''
}

function formatValue(value: number, unit: string): string {
  return unit === 'USD' ? `US$${value.toLocaleString()}` : `${value}${unit}`
}

function basePoint(terms: string, evidence: CollectedEvidence): string {
  return `Source: GitHub public API search for "${terms}" (${evidence.sourceUrl}). Provider-reported, not independently verified. `
}

/**
 * Every externally sourced value carries the same caveat. The strength of the
 * caveat must not depend on which provider produced the row: a repository
 * count is no more independently verified than a macro indicator.
 */
function sourceNote(evidence: CollectedEvidence, extra?: string): string {
  return `Source: ${evidence.sourceName} (${evidence.sourceUrl}). Provider-reported, not independently verified.${extra ? ` ${extra}` : ''}`
}

function sectionById(sections: ReportSection[], id: ReportSectionId): ReportSection | undefined {
  return sections.find((section) => section.id === id)
}

export async function buildSourcedReport(profile: ResearchProfile): Promise<ResearchReport> {
  const base = buildReport(profile)
  const queries = queriesFor(profile)
  const providersByCategory = new Map<string, ReturnType<typeof getConfiguredProvider>>()
  for (const provider of configuredResearchProviders) {
    for (const capability of provider.capabilities) {
      providersByCategory.set(capability.category, provider)
    }
  }

  const results = await Promise.allSettled(
    queries.map(async (query) => {
      const provider = providersByCategory.get(query.category)
      if (!provider) return { ok: true, items: [] as CollectedEvidence[] }
      return provider.collect ? provider.collect(query) : { ok: true, items: [] as CollectedEvidence[] }
    }),
  )

  const sourcesById = new Map<string, ResearchSource>()
  const metricsBySection = new Map<string, Metric[]>()
  const findingsBySection = new Map<string, Finding[]>

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const outcome = result.value
    if (!outcome.ok) continue
    const items = outcome.items ?? []
    for (const evidence of items) {
      try {
        const { id, source } = sourceFor(evidence)
        sourcesById.set(id, source)

        const metric = metricFor(evidence)
        if (metric) {
          const list = metricsBySection.get(metric.sectionId) ?? []
          list.push(metric.metric)
          metricsBySection.set(metric.sectionId, list)
        }

        const finding = findingFor(evidence)
        if (finding) {
          const list = findingsBySection.get(finding.sectionId) ?? []
          list.push(finding.finding)
          findingsBySection.set(finding.sectionId, list)
        }
      } catch {
        // One malformed evidence item must not suppress the whole report.
      }
    }
  }

  const sources = Array.from(sourcesById.values())
  const anySources = sources.length > 0
  const sourceIds = sources.map((s) => s.id)
  const collectionTimes = [...new Set(sources.map((s) => s.collectedAt).filter((t): t is string => Boolean(t)))]

  const sections = base.sections.map((section) => {
    const metrics = [...section.metrics, ...(metricsBySection.get(section.id) ?? [])]
    const findings = [...section.findings, ...(findingsBySection.get(section.id) ?? [])]

    // The base report's source section says "no external source" because that
    // is true for buildReport. In sourced mode leaving that sentence in place
    // contradicts the source list rendered beside it.
    if (section.id === 'sources' && anySources) {
      const geographies = [...new Set(sources.map((s) => s.geography).filter((g): g is string => Boolean(g)))]
      const industries = [...new Set(sources.map((s) => s.industry).filter((i): i is string => Boolean(i)))]
      return {
        ...section,
        summary: 'Sources are listed below with their URLs, publication dates, collection dates, data periods, and the geography and industry actually queried.',
        findings: [
          {
            id: 'source-coverage',
            claim: `${sources.length} source${sources.length === 1 ? '' : 's'} returned for this report. Queried geography: ${geographies.join(', ') || 'not recorded'}. Queried industry: ${industries.join(', ') || 'not recorded'}. Collection ${collectionTimes.length === 1 ? 'time' : 'times'}: ${collectionTimes.join(', ') || 'not recorded'}.`,
            provenance: 'derived' as const,
            confidence: 'high' as const,
            sourceIds,
            note: 'Computed from the provider evidence returned in this run. It describes coverage of the sources, not coverage of the merchant’s whole market.',
          },
          {
            id: 'source-limits',
            claim: 'World Bank rows are macroeconomic context, SEC rows are public registry/filing data, and GitHub rows are public code activity. None of them measures market size, adoption, commercial demand, or the competitor set.',
            provenance: 'interpretation' as const,
            confidence: 'low' as const,
            sourceIds: [],
            note: 'Categories with no usable provider row remain unknown; no estimate is substituted.',
          },
        ],
        sourceIds,
      }
    }

    return { ...section, metrics, findings }
  })

  // Only claim economic context when a World Bank source is actually present.
  const landscape = sectionById(sections, 'landscape')
  if (landscape && sources.some((s) => s.id.startsWith('source-world-bank'))) {
    landscape.summary =
      landscape.summary +
      ' World Bank economic context for the declared country appears below when a country is selected.'
  }

  return {
    ...base,
    dataMode: anySources ? 'sourced' : 'unresearched',
    honestyNote: anySources
      ? 'This report is sourced from connected public providers. Figures carry a source and provenance; anything without a source stays unknown. AgentPort does not estimate market size, growth, or adoption.'
      : base.honestyNote,
    sections,
    sources,
    rankingMethod: {
      ...base.rankingMethod,
      caveat:
        'Opportunity scores rank hypotheses from your profile. Added provider evidence is labelled, but it does not change the scores unless a future integration maps metrics to scores.',
    },
  }
}
