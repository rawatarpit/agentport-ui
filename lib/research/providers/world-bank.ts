/**
 * World Bank Open Data provider.
 *
 * No API key. Economic context only: GDP, population, internet users and
 * manufacturing value added for a merchant-declared country. These are
 * macroeconomic observations, not market size, market share or demand for the
 * merchant's industry.
 */

import type {
  CollectedEvidence,
  EvidenceType,
  ProviderCapability,
  ProviderStatus,
  ProviderStatusContext,
  ResearchCategory,
  ResearchProviderAdapter,
  ResearchQuery,
} from '../types'
import { fetchJson } from '../fetch'
import { normalizeCollectedEvidence } from '../normalize'

const INDICATORS = [
  { id: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', unit: 'USD' },
  { id: 'SP.POP.TOTL', label: 'Population', unit: 'people' },
  { id: 'IT.NET.USER.ZS', label: 'Internet users', unit: '% of population' },
  { id: 'NV.IND.MANF.ZS', label: 'Manufacturing value added', unit: '% of GDP' },
]

const DATE_RANGE = '2022:2023'

function worldBankUrl(indicator: string): string {
  return `https://api.worldbank.org/v2/country/all/indicator/${indicator}?date=${DATE_RANGE}&format=json&per_page=1000`
}

function matchesCountry(row: unknown, geography: string): boolean {
  const r = row as { country?: { value?: string | null }; countryiso3code?: string | null; date?: string | null; value?: unknown }
  const name = r.country?.value ?? ''
  return name.toLowerCase().includes(geography.toLowerCase()) || geography.toLowerCase().includes(name.toLowerCase())
}

function latestRowForCountry(rows: unknown[], geography: string): unknown | null {
  let current: { row: unknown; date: string } | null = null
  for (const row of rows) {
    const r = row as { date?: string | null }
    if (!r.date || typeof r.date !== 'string') continue
    if (!matchesCountry(row, geography)) continue
    if (!current || r.date > current.date) current = { row, date: r.date }
  }
  return current ? current.row : null
}

async function collectIndicator(indicator: string, geography: string): Promise<unknown[]> {
  const json = await fetchJson(worldBankUrl(indicator))
  if (!Array.isArray(json) || json.length < 2) return []
  const rows = json[1]
  if (!Array.isArray(rows)) return []
  const row = latestRowForCountry(rows, geography)
  return row ? [row] : []
}

function evidenceInput({
  tenantId,
  geography,
  industry,
  category,
  evidenceType,
  indicator,
  row,
  collectedAt,
}: {
  tenantId: string | null
  geography: string
  industry: string | null
  category: ResearchCategory
  evidenceType: EvidenceType
  indicator: { id: string; label: string; unit: string }
  row: unknown
  collectedAt: string
}): Partial<CollectedEvidence> & { collectedAt: string } {
  const r = row as {
    country?: { id?: string | null; value?: string | null }
    countryiso3code?: string | null
    date?: string | null
    value?: number | null
    unit?: string | null
    decimal?: number | null
    obs_status?: string | null
    indicator?: { id?: string | null; value?: string | null }
  }
  return {
    tenantId,
    providerId: 'world-bank',
    adapterVersion: '1.0.0',
    sourceIdentifier: `world-bank:${indicator.id}:${r.date ?? 'unknown'}:${r.countryiso3code ?? 'unknown'}`,
    sourceUrl: `https://api.worldbank.org/v2/country/${r.countryiso3code ?? 'unknown'}/indicator/${indicator.id}?date=${r.date ?? 'unknown'}`,
    sourceName: 'World Bank Open Data',
    publishedAt: r.date ? `${r.date}-01-01T00:00:00Z` : null,
    collectedAt,
    geography,
    geographyScope: 'national',
    industry,
    category,
    evidenceType,
    extractedInformation: {
      indicator: indicator.id,
      indicatorLabel: indicator.label,
      countryId: r.country?.id ?? null,
      country: r.country?.value ?? null,
      countryiso3code: r.countryiso3code ?? null,
      date: r.date ?? null,
      value: r.value ?? null,
      unit: indicator.unit,
      decimal: r.decimal ?? null,
      obsStatus: r.obs_status ?? null,
    },
    confidence: 'low',
    verificationStatus: 'unverified',
    dataPeriod: r.date ?? null,
    attribution: 'World Bank Open Data',
  }
}

export const worldBankProvider: ResearchProviderAdapter = Object.freeze({
  id: 'world-bank',
  name: 'World Bank Open Data',
  version: '1.0.0',
  capabilities: Object.freeze([
    Object.freeze({
      category: 'economic_dataset' as ResearchCategory,
      evidenceTypes: Object.freeze(['numeric_dataset'] as readonly EvidenceType[]),
    }),
  ]),
  status: (_context?: ProviderStatusContext): ProviderStatus => {
    const checkedAt = _context?.checkedAt ?? _context?.clock?.().toISOString() ?? new Date().toISOString()
    return { state: 'available', reason: null, checkedAt }
  },
  collect: async (query: ResearchQuery): Promise<{ ok: true; items: readonly CollectedEvidence[] } | { ok: false; reason: 'not_configured' | 'disabled'; message: string }> => {
    if (query.category !== 'economic_dataset') {
      return { ok: false, reason: 'disabled', message: 'World Bank provider only supplies economic datasets.' }
    }
    if (!query.geography) {
      return { ok: false, reason: 'disabled', message: 'World Bank economic context requires a country/geography.' }
    }

    const collectedAt = new Date().toISOString()
    const results = await Promise.allSettled(INDICATORS.map((indicator) => collectIndicator(indicator.id, query.geography)))

    const evidence: CollectedEvidence[] = []
    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled') continue
      const row = latestRowForCountry(result.value, query.geography)
      if (!row) continue
      const input = evidenceInput({
        tenantId: query.tenantId,
        geography: query.geography,
        industry: query.industry,
        category: query.category,
        evidenceType: 'numeric_dataset',
        indicator: INDICATORS[index],
        row,
        collectedAt,
      })
      const normalized = normalizeCollectedEvidence(input)
      if (normalized.ok) evidence.push(normalized.value)
    }

    return { ok: true, items: Object.freeze(evidence) }
  },
})
