/**
 * Research evidence foundation — types only.
 *
 * A capability slot is a declaration of what a provider *could* supply, never
 * a claim that evidence exists. Unavailability is represented explicitly so an
 * unconnected provider cannot present an empty-but-healthy dataset: that would
 * be the same lie as a seeded heartbeat in the tenant panel.
 */

import type { Confidence } from '../intelligence/types'

/** Exactly one slot per category; no implicit "general research" bucket. */
export const RESEARCH_CATEGORIES = [
  'economic_dataset',
  'search_demand',
  'company_competitor',
  'industry_news',
  'technology_development',
  'government_regulatory',
] as const
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number]

export const EVIDENCE_TYPES = [
  'numeric_dataset',
  'search_series',
  'company_profile',
  'news_article',
  'technical_document',
  'regulatory_document',
] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export const VERIFICATION_STATUSES = ['unverified', 'source_verified', 'corroborated'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

/** Reuse the report's confidence vocabulary so a number cannot change meaning. */
export type ResearchConfidence = Confidence
export const CONFIDENCE_VALUES = ['high', 'medium', 'low', 'unknown'] as const satisfies readonly ResearchConfidence[]

export const GEOGRAPHY_SCOPES = ['global', 'regional', 'national', 'sub_national', 'city', 'unknown'] as const
export type GeographyScope = (typeof GEOGRAPHY_SCOPES)[number]

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Explicit citation text, or a structured citation with a nullable URL/licence. */
export type EvidenceAttribution =
  | string
  | {
      label: string
      url: string | null
      license: string | null
    }

export type CollectedEvidence = {
  tenantId: string | null
  providerId: string
  adapterVersion: string
  sourceIdentifier: string
  sourceUrl: string
  sourceName: string
  publishedAt: string | null
  collectedAt: string
  geography: string
  geographyScope: GeographyScope
  industry: string | null
  category: ResearchCategory
  evidenceType: EvidenceType
  extractedInformation: Record<string, JsonValue>
  confidence: ResearchConfidence
  verificationStatus: VerificationStatus
  dataPeriod: string | null
  contentHash: string
  queryHash: string
  attribution: EvidenceAttribution
}

export const PROVIDER_STATUS_REASONS = ['not_configured', 'disabled'] as const
export type ProviderStatusReason = (typeof PROVIDER_STATUS_REASONS)[number]

/** An unavailable state always carries a reason: "no data" is not "healthy". */
export type ProviderStatus =
  | { state: 'available'; reason: null; checkedAt: string }
  | { state: 'unavailable'; reason: ProviderStatusReason; checkedAt: string }

/** A caller-supplied timestamp or clock keeps status checks reproducible. */
export type ProviderStatusContext = {
  checkedAt?: string
  clock?: () => Date
}

export type ProviderCapability = {
  readonly category: ResearchCategory
  readonly evidenceTypes: readonly EvidenceType[]
}

export type ResearchQuery = {
  tenantId: string | null
  category: ResearchCategory
  geography: string
  geographyScope: GeographyScope
  industry: string | null
  companyName: string | null
  period: string | null
  terms: readonly string[]
}

/** Retained for a future connected adapter; static slots never produce one. */
export type ProviderResult =
  | { ok: true; items: readonly CollectedEvidence[] }
  | { ok: false; reason: ProviderStatusReason; message: string }

export type ResearchProviderAdapter = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly capabilities: readonly ProviderCapability[]
  readonly status: (context?: ProviderStatusContext) => ProviderStatus
  readonly collect?: (query: ResearchQuery) => Promise<ProviderResult>
}
