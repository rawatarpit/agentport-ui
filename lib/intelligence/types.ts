/**
 * Industry intelligence domain model.
 *
 * The dashboard's honesty invariant applies to research too: a market figure
 * is only rendered when its provenance is known. Every number and every
 * material claim carries a `provenance` and a `confidence`, and the report
 * separates `unknown` (nothing connected) from `illustrative` (a clearly
 * labelled fictional sample).
 *
 * There is deliberately no default numeric value anywhere in this module.
 * A metric with no source has `value: null`, and callers must render
 * "unknown" for it. That is the same rule as `v_tenant_home.last_push_at`.
 */

export type Provenance =
  | 'verified'
  | 'reported'
  | 'derived'
  | 'interpretation'
  | 'forecast'
  | 'illustrative'
  | 'unknown'

export type Confidence = 'high' | 'medium' | 'low' | 'unknown'

export type SourceKind = 'primary' | 'secondary' | 'sample'

export type ResearchSource = {
  id: string
  label: string
  /** Null for a sample or an unconnected source. Never a plausible fake URL. */
  url: string | null
  publishedAt: string | null
  /** The data period the source covers, not the publication date. */
  dataPeriod: string | null
  /** When this console collected the evidence — distinct from publication date. */
  collectedAt: string | null
  /** Geography and industry the provider actually queried, not the merchant's whole market. */
  geography: string | null
  industry: string | null
  kind: SourceKind
}

export type ResearchProfile = {
  industry: string
  subIndustry: string | null
  country: string | null
  geography: string | null
  companyName: string | null
  website: string | null
  productsServices: string | null
  businessModel: string | null
  customerSegment: string | null
  objectives: string[]
}

export type Metric = {
  key: string
  label: string
  value: number | null
  unit: string
  provenance: Provenance
  confidence: Confidence
  sourceId: string | null
  period: string | null
  note: string | null
}

export type Finding = {
  id: string
  claim: string
  provenance: Provenance
  confidence: Confidence
  sourceIds: string[]
  note: string | null
}

export type SeriesPoint = { label: string; value: number | null }

export type ResearchChart = {
  id: string
  title: string
  kind: 'line' | 'bar'
  unit: string
  points: SeriesPoint[]
  provenance: Provenance
  sourceId: string | null
  note: string | null
}

export type ReportSectionId =
  | 'executive'
  | 'landscape'
  | 'demand'
  | 'ai-transformation'
  | 'competition'
  | 'ecosystem'
  | 'agentic-commerce'
  | 'opportunity-map'
  | 'risks'
  | 'outlook'
  | 'sources'

export type ReportSection = {
  id: ReportSectionId
  title: string
  summary: string
  findings: Finding[]
  metrics: Metric[]
  charts: ResearchChart[]
  sourceIds: string[]
}

export type AccessMode = 'read' | 'write'

export type OpportunityScores = {
  demand: number
  impact: number
  feasibility: number
  timing: number
  evidence: number
}

export type AgentOpportunity = {
  id: string
  title: string
  description: string
  businessValue: string
  customerValue: string
  requiredInformation: string[]
  requiredApis: string[]
  access: AccessMode[]
  humanConfirmation: 'required' | 'recommended' | 'none'
  complexity: 'low' | 'medium' | 'high'
  evidence: string
  provenance: Provenance
  confidence: Confidence
  scores: OpportunityScores
  /** Weighted 0–5 score, computed by `rankOpportunities` only. */
  score: number
  rank: number
  recommendedAction: string
}

export type AgentWorkflow = {
  id: string
  industryKey: string
  workflowName: string
  customerProblem: string
  businessOpportunity: string
  requiredData: string[]
  requiredCapability: string
  access: 'read' | 'write'
  authentication: 'none' | 'merchant' | 'end_user' | 'oauth'
  humanConfirmation: 'none' | 'recommended' | 'required'
  technicalDependencies: string[]
  feasibility: 'low' | 'medium' | 'high'
  evidenceStatement: string
  evidenceProvenance: 'interpretation'
  confidence: 'low'
  verifiedCapability: false
  sourceIds: string[]
}

/** `unresearched` is the default and must never render as a complete report. */
export type ReportDataMode = 'unresearched' | 'illustrative' | 'sourced'

export type ResearchReport = {
  profile: ResearchProfile
  generatedAt: string
  dataMode: ReportDataMode
  /** One sentence a caller can render verbatim above the report. */
  honestyNote: string
  sections: ReportSection[]
  opportunities: AgentOpportunity[]
  workflows: AgentWorkflow[]
  sources: ResearchSource[]
  rankingMethod: {
    weights: OpportunityScores
    scale: string
    caveat: string
  }
}

export function emptyProfile(): ResearchProfile {
  return {
    industry: '',
    subIndustry: null,
    country: null,
    geography: null,
    companyName: null,
    website: null,
    productsServices: null,
    businessModel: null,
    customerSegment: null,
    objectives: [],
  }
}

/** Trim and bound a user-supplied string. Long input is truncated, not rejected. */
export function cleanText(value: unknown, max = 280): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) return null
  return trimmed.slice(0, max)
}

export function cleanList(value: unknown, maxItems = 8, maxLength = 120): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const out: string[] = []
  for (const item of raw) {
    const clean = cleanText(item, maxLength)
    if (clean && !out.includes(clean)) out.push(clean)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * Reconstruct a research profile from the public preview's GET parameters.
 * These are merchant-declared answers, not evidence; missing fields stay null.
 */
export function profileFromParams(params: URLSearchParams): ResearchProfile {
  return profileFromRecord({
    industry: params.get('industry'),
    subIndustry: params.get('subIndustry'),
    country: params.get('country'),
    geography: params.get('geography'),
    companyName: params.get('companyName'),
    website: params.get('website'),
    productsServices: params.get('productsServices'),
    businessModel: params.get('businessModel'),
    customerSegment: params.get('customerSegment'),
    objectives: params.get('objective') ?? params.get('objectives'),
  })
}

export function profileFromRecord(raw: Record<string, unknown>): ResearchProfile {
  return {
    industry: cleanText(raw.industry, 120) ?? '',
    subIndustry: cleanText(raw.subIndustry, 120),
    country: cleanText(raw.country, 80),
    geography: cleanText(raw.geography, 120),
    companyName: cleanText(raw.companyName, 120),
    website: cleanText(raw.website, 300),
    productsServices: cleanText(raw.productsServices, 400),
    businessModel: cleanText(raw.businessModel, 160),
    customerSegment: cleanText(raw.customerSegment, 160),
    objectives: cleanList(raw.objectives),
  }
}

/**
 * Validate an untrusted profile before it is stored or used to generate a
 * report. Industry is required so a blank preview cannot become a durable
 * "report" with an empty body; other fields stay explicitly null/absent.
 */
export function parseResearchProfile(value: unknown): ResearchProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.industry !== 'string' || raw.industry.trim().length === 0) return null
  if (raw.objectives !== undefined && !Array.isArray(raw.objectives)) return null
  return profileFromRecord(raw)
}
