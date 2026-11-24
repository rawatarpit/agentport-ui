import type {
  EvidenceType,
  ProviderCapability,
  ProviderStatus,
  ProviderStatusContext,
  ResearchCategory,
  ResearchProviderAdapter,
} from './types'

/**
 * Static capability slots, not data sources.
 *
 * Every slot reports unavailable/not_configured until a real adapter is added
 * by a separate, security-reviewed change. That refusal is the point: an empty
 * result from an unconnected provider would read as a healthy zero, so the
 * registry must say "not configured" instead of quietly returning no rows.
 * `checkedAt` comes from the caller or an injected clock so a status check is
 * reproducible rather than silently dating itself.
 */
function unavailable(context: ProviderStatusContext = {}): ProviderStatus {
  const checkedAt = context.checkedAt ?? context.clock?.().toISOString() ?? new Date().toISOString()
  return { state: 'unavailable', reason: 'not_configured', checkedAt }
}

function slot(id: string, name: string, capability: ProviderCapability): ResearchProviderAdapter {
  return Object.freeze({
    id,
    name,
    version: '0.0.0',
    capabilities: Object.freeze([Object.freeze(capability)]),
    status: unavailable,
  })
}

function capability(category: ResearchCategory): ProviderCapability {
  const evidenceTypes: Record<ResearchCategory, EvidenceType> = {
    economic_dataset: 'numeric_dataset',
    search_demand: 'search_series',
    company_competitor: 'company_profile',
    industry_news: 'news_article',
    technology_development: 'technical_document',
    government_regulatory: 'regulatory_document',
  }
  return { category, evidenceTypes: Object.freeze([evidenceTypes[category]]) }
}

const SLOTS: readonly ResearchProviderAdapter[] = Object.freeze([
  slot('economic-dataset-slot', 'Economic dataset provider (unconfigured)', capability('economic_dataset')),
  slot('search-demand-slot', 'Search demand provider (unconfigured)', capability('search_demand')),
  slot('company-competitor-slot', 'Company/competitor provider (unconfigured)', capability('company_competitor')),
  slot('industry-news-slot', 'Industry news provider (unconfigured)', capability('industry_news')),
  slot(
    'technology-development-slot',
    'Technology development provider (unconfigured)',
    capability('technology_development'),
  ),
  slot(
    'government-regulatory-slot',
    'Government/regulatory provider (unconfigured)',
    capability('government_regulatory'),
  ),
])

/** A snapshot of the declarations; mutation of the registry itself is refused. */
export function listResearchProviders(): readonly ResearchProviderAdapter[] {
  return SLOTS
}

export function getResearchProvider(id: string): ResearchProviderAdapter | null {
  return SLOTS.find((provider) => provider.id === id) ?? null
}
