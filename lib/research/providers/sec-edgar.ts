/**
 * SEC EDGAR provider.
 *
 * No API key, but SEC requires a descriptive User-Agent. Company registry and
 * recent filings only: identity, exchange, SIC and filing count. This is not
 * financial advice, and it is not a competitor dataset.
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

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

function padCik(cik: number | string): string {
  return String(cik).padStart(10, '0')
}

function submissionsUrl(cik: string): string {
  return `https://data.sec.gov/submissions/CIK${cik}.json`
}

function findCompany(tickers: unknown, name: string): unknown | null {
  if (!tickers || typeof tickers !== 'object') return null
  const records = Object.values(tickers as Record<string, unknown>)
  const lower = name.toLowerCase()
  for (const record of records) {
    const r = record as { title?: string | null; ticker?: string | null; cik_str?: number | string | null }
    const title = (r.title ?? '').toLowerCase()
    const ticker = (r.ticker ?? '').toLowerCase()
    if (title.includes(lower) || ticker.includes(lower)) return r
  }
  return null
}

function evidenceInput({
  tenantId,
  geography,
  industry,
  company,
  submissions,
  collectedAt,
}: {
  tenantId: string | null
  geography: string
  industry: string | null
  company: { cik_str?: number | string | null; title?: string | null; ticker?: string | null; exchanges?: unknown; sic?: number | null; sicDescription?: string | null; stateOfIncorporation?: string | null; fiscalYearEnd?: string | null }
  submissions: {
    name?: string | null
    tickers?: unknown
    exchanges?: unknown
    sic?: number | null
    sicDescription?: string | null
    stateOfIncorporation?: string | null
    fiscalYearEnd?: string | null
    recent?: { filingDate?: string[] | null; form?: string[] | null }
  }
  collectedAt: string
}): Partial<CollectedEvidence> & { collectedAt: string } {
  const cik = padCik(company.cik_str ?? '')
  const recent = submissions.recent ?? {}
  const filingDates = Array.isArray(recent.filingDate) ? recent.filingDate : []
  const forms = Array.isArray(recent.form) ? recent.form : []
  const latestDate = filingDates.length > 0 ? filingDates[0] : null
  return {
    tenantId,
    providerId: 'sec-edgar',
    adapterVersion: '1.0.0',
    sourceIdentifier: `sec-edgar:cik:${cik}`,
    sourceUrl: submissionsUrl(cik),
    sourceName: 'SEC EDGAR',
    publishedAt: latestDate ? `${latestDate}T00:00:00Z` : null,
    collectedAt,
    geography,
    geographyScope: 'national',
    industry,
    category: 'company_competitor',
    evidenceType: 'company_profile',
    extractedInformation: {
      cik,
      name: submissions.name ?? company.title ?? null,
      ticker: company.ticker ?? null,
      title: company.title ?? null,
      exchanges: null,
      sic: company.sic ?? submissions.sic ?? null,
      sicDescription: company.sicDescription ?? submissions.sicDescription ?? null,
      stateOfIncorporation: company.stateOfIncorporation ?? submissions.stateOfIncorporation ?? null,
      fiscalYearEnd: company.fiscalYearEnd ?? submissions.fiscalYearEnd ?? null,
      recentFilingsCount: filingDates.length,
      latestFilingDate: latestDate,
      recentForms: forms.slice(0, 5),
    },
    confidence: 'low',
    verificationStatus: 'unverified',
    dataPeriod: 'recent filings',
    attribution: 'U.S. Securities and Exchange Commission EDGAR',
  }
}

export const secEdgarProvider: ResearchProviderAdapter = Object.freeze({
  id: 'sec-edgar',
  name: 'SEC EDGAR',
  version: '1.0.0',
  capabilities: Object.freeze([
    Object.freeze({
      category: 'company_competitor' as ResearchCategory,
      evidenceTypes: Object.freeze(['company_profile'] as readonly EvidenceType[]),
    }),
  ]),
  status: (_context?: ProviderStatusContext): ProviderStatus => {
    const checkedAt = _context?.checkedAt ?? _context?.clock?.().toISOString() ?? new Date().toISOString()
    return { state: 'available', reason: null, checkedAt }
  },
  collect: async (query: ResearchQuery): Promise<{ ok: true; items: readonly CollectedEvidence[] } | { ok: false; reason: 'not_configured' | 'disabled'; message: string }> => {
    if (query.category !== 'company_competitor') {
      return { ok: false, reason: 'disabled', message: 'SEC EDGAR provider only supplies company profiles.' }
    }
    if (!query.industry && !query.tenantId) {
      return { ok: false, reason: 'disabled', message: 'SEC EDGAR company lookup requires a company name.' }
    }

    const collectedAt = new Date().toISOString()
    let tickers: unknown
    try {
      tickers = await fetchJson(TICKERS_URL)
    } catch {
      return { ok: false, reason: 'disabled', message: 'SEC EDGAR company registry is unavailable.' }
    }

    const name = query.companyName ?? query.industry ?? ''
    const company = findCompany(tickers, name) as {
      cik_str?: number | string | null
      title?: string | null
      ticker?: string | null
      exchanges?: unknown
      sic?: number | null
      sicDescription?: string | null
      stateOfIncorporation?: string | null
      fiscalYearEnd?: string | null
    } | null
    if (!company) {
      return { ok: true, items: [] }
    }

    const cik = padCik(company.cik_str ?? '')
    let submissions: unknown
    try {
      submissions = await fetchJson(submissionsUrl(cik))
    } catch {
      return { ok: false, reason: 'disabled', message: `SEC EDGAR submissions for CIK ${cik} are unavailable.` }
    }

    const input = evidenceInput({
      tenantId: query.tenantId,
      geography: query.geography,
      industry: query.industry,
      company: company as { cik_str?: number | string | null; title?: string | null; ticker?: string | null; exchanges?: unknown; sic?: number | null; sicDescription?: string | null; stateOfIncorporation?: string | null; fiscalYearEnd?: string | null },
      submissions: submissions as { name?: string | null; tickers?: unknown; exchanges?: unknown; sic?: number | null; sicDescription?: string | null; stateOfIncorporation?: string | null; fiscalYearEnd?: string | null; recent?: { filingDate?: string[] | null; form?: string[] | null } },
      collectedAt,
    })
    const normalized = normalizeCollectedEvidence(input)
    return normalized.ok ? { ok: true, items: Object.freeze([normalized.value]) } : { ok: true, items: [] }
  },
})
