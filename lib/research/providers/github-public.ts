/**
 * GitHub public API provider.
 *
 * Unauthenticated search is rate-limited and returns repository matches only.
 * It is evidence of public code activity, not evidence of competitors, market
 * size, or that an integration works.
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

function searchUrl(terms: string): string {
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(terms)}+in:name,description&per_page=10`
}

function evidenceInput({
  tenantId,
  geography,
  industry,
  terms,
  result,
  collectedAt,
}: {
  tenantId: string | null
  geography: string
  industry: string | null
  terms: string
  result: { total_count?: number | null; incomplete_results?: boolean | null; items?: unknown[] | null }
  collectedAt: string
}): Partial<CollectedEvidence> & { collectedAt: string } {
  const items: unknown[] = Array.isArray(result.items) ? result.items : []
  return {
    tenantId,
    providerId: 'github-public',
    adapterVersion: '1.0.0',
    sourceIdentifier: `github-public:search:${encodeURIComponent(terms)}`,
    sourceUrl: searchUrl(terms),
    sourceName: 'GitHub public API',
    publishedAt: (items.length > 0 ? (items[0] as { pushed_at?: string | null } | undefined) : undefined)?.pushed_at ?? null,
    collectedAt,
    geography,
    geographyScope: 'global',
    industry,
    category: 'technology_development',
    evidenceType: 'technical_document',
    extractedInformation: {
      query: terms,
      totalCount: result.total_count ?? null,
      incompleteResults: result.incomplete_results ?? null,
      repositories: items.map((item) => {
        const r = item as { full_name?: string | null; html_url?: string | null; description?: string | null; language?: string | null; stargazers_count?: number | null; pushed_at?: string | null; updated_at?: string | null }
        return {
          fullName: r.full_name ?? null,
          htmlUrl: r.html_url ?? null,
          description: r.description ?? null,
          language: r.language ?? null,
          stargazersCount: r.stargazers_count ?? null,
          pushedAt: r.pushed_at ?? null,
          updatedAt: r.updated_at ?? null,
        }
      }),
    },
    confidence: 'low',
    verificationStatus: 'unverified',
    dataPeriod: null,
    attribution: 'GitHub public API (unauthenticated search; rate-limited)',
  }
}

export const githubPublicProvider: ResearchProviderAdapter = Object.freeze({
  id: 'github-public',
  name: 'GitHub public API',
  version: '1.0.0',
  capabilities: Object.freeze([
    Object.freeze({
      category: 'technology_development' as ResearchCategory,
      evidenceTypes: Object.freeze(['technical_document'] as readonly EvidenceType[]),
    }),
  ]),
  status: (_context?: ProviderStatusContext): ProviderStatus => {
    const checkedAt = _context?.checkedAt ?? _context?.clock?.().toISOString() ?? new Date().toISOString()
    return { state: 'available', reason: null, checkedAt }
  },
  collect: async (query: ResearchQuery): Promise<{ ok: true; items: readonly CollectedEvidence[] } | { ok: false; reason: 'not_configured' | 'disabled'; message: string }> => {
    if (query.category !== 'technology_development') {
      return { ok: false, reason: 'disabled', message: 'GitHub public provider only supplies repository search matches.' }
    }
    const terms = query.terms.length > 0 ? query.terms[0] : (query.industry ?? '')
    if (!terms) {
      return { ok: false, reason: 'disabled', message: 'GitHub public search requires a query term.' }
    }

    const collectedAt = new Date().toISOString()
    let result: unknown
    try {
      result = await fetchJson(searchUrl(terms))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub public search failed.'
      if (/403|401/.test(message)) {
        return { ok: false, reason: 'disabled', message: 'GitHub unauthenticated search is rate-limited or unavailable. Set GITHUB_TOKEN to continue.' }
      }
      return { ok: false, reason: 'disabled', message }
    }

    const input = evidenceInput({
      tenantId: query.tenantId,
      geography: query.geography,
      industry: query.industry,
      terms,
      result: result as { total_count?: number | null; incomplete_results?: boolean | null; items?: unknown[] | null },
      collectedAt,
    })
    const normalized = normalizeCollectedEvidence(input)
    return normalized.ok ? { ok: true, items: Object.freeze([normalized.value]) } : { ok: true, items: [] }
  },
})
