import {
  type AgentOpportunity,
  type Metric,
  type OpportunityScores,
  type ReportSection,
  type ResearchChart,
  type ResearchProfile,
  type ResearchReport,
  type ResearchSource,
} from './types'
import { buildWorkflows } from './workflows'

/**
 * The research engine.
 *
 * Two modes exist and only two:
 *
 * - `buildReport`: honest scaffold for a real profile. No external research
 *   provider is connected, so every market figure is `null`/`unknown`. The
 *   sections still explain what would be collected and why it matters, and
 *   the opportunity map is labelled an interpretation of the submitted
 *   profile, never evidence of demand.
 * - `buildSampleReport` (in `sample.ts`): a fictional, clearly labelled
 *   sample. It exists so the visual language can be reviewed without a
 *   provider. It must never be reachable from a real industry silently.
 *
 * There is no third mode that fills gaps with plausible numbers.
 */

export const RANKING_WEIGHTS: OpportunityScores = {
  demand: 0.25,
  impact: 0.25,
  feasibility: 0.2,
  timing: 0.15,
  evidence: 0.15,
}

export const RANKING_METHOD = {
  weights: RANKING_WEIGHTS,
  scale: 'Each factor is scored 1–5 from the submitted profile only; the weighted total is 0–5.',
  caveat:
    'Scores rank hypotheses for discussion. They are not measured demand, revenue potential or a forecast.',
} as const

function metric(
  key: string,
  label: string,
  unit: string,
  provenance: Metric['provenance'] = 'unknown',
  value: number | null = null,
  note: string | null = null,
): Metric {
  return {
    key,
    label,
    value,
    unit,
    provenance,
    confidence: provenance === 'unknown' ? 'unknown' : 'low',
    sourceId: null,
    period: null,
    note,
  }
}

export function gapFinding(id: string, what: string) {
  return {
    id,
    claim: `No verified dataset is connected for ${what}. This report does not estimate it.`,
    provenance: 'unknown' as const,
    confidence: 'unknown' as const,
    sourceIds: [],
    note: 'Connect a research provider or upload a sourced dataset before treating this section as evidence.',
  };
}

function emptyChart(id: string, title: string, kind: ResearchChart['kind'], unit: string): ResearchChart {
  return {
    id,
    title,
    kind,
    unit,
    points: [],
    provenance: 'unknown',
    sourceId: null,
    note: 'No verified series is connected. An empty chart is an honest gap, not a zero.',
  }
}

const SCORE_FACTORS: Array<keyof OpportunityScores> = [
  'demand',
  'impact',
  'feasibility',
  'timing',
  'evidence',
]

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(5, Math.round(n)))
}

/**
 * Profile completeness can raise *feasibility* (we know enough to scope the
 * work) and *timing* (the merchant has an objective), but never *evidence*:
 * a filled-in form is not external proof.
 */
function scoreFor(
  kind: OpportunityKind,
  profile: ResearchProfile,
): { scores: OpportunityScores; basis: string } {
  const hasWebsite = Boolean(profile.website)
  const hasProducts = Boolean(profile.productsServices)
  const hasSegment = Boolean(profile.customerSegment)
  const hasObjectives = profile.objectives.length > 0
  const transactionModel = /marketplace|direct-to-consumer|booking|subscription/i.test(
    profile.businessModel ?? '',
  )
  const technicalModel = /saas|technology|marketplace/i.test(profile.businessModel ?? '')
  const agentObjective = profile.objectives.some((o) => /agent|ai|discover|autom/i.test(o))

  let demand = 3
  let impact = 3
  let feasibility = 2
  let timing = 3
  let evidence = 1

  if (hasProducts) {
    demand += 1
    feasibility += 1
  }
  if (hasSegment) demand += 1
  if (hasWebsite) feasibility += 1
  if (technicalModel) feasibility += 1
  if (transactionModel) impact += 1
  if (hasObjectives) timing += 1
  if (agentObjective) timing += 1
  if (kind === 'complete' || kind === 'prepare') impact += 1
  if (kind === 'discover' || kind === 'research') demand += 1

  return {
    scores: {
      demand: clampScore(demand),
      impact: clampScore(impact),
      feasibility: clampScore(feasibility),
      timing: clampScore(timing),
      evidence: clampScore(evidence),
    },
    basis: 'Scored from submitted profile fields only; evidence is capped at 1 without an external source.',
  }
}

type OpportunityKind = 'discover' | 'research' | 'compare' | 'prepare' | 'complete' | 'support'

type OpportunityTemplate = {
  kind: OpportunityKind
  title: string
  description: string
  businessValue: string
  customerValue: string
  requiredInformation: string[]
  requiredApis: string[]
  access: Array<'read' | 'write'>
  humanConfirmation: AgentOpportunity['humanConfirmation']
  complexity: AgentOpportunity['complexity']
  recommendedAction: string
}

function templates(profile: ResearchProfile): OpportunityTemplate[] {
  const offerings = profile.productsServices
    ? profile.productsServices
    : 'the products and services named in your profile'
  return [
    {
      kind: 'discover',
      title: 'Publish a machine-readable capability menu',
      description:
        'Expose what an agent may ask for — capabilities, required inputs, and whether each call reads or changes data — through one discovery surface.',
      businessValue: 'Makes the business legible to agents without granting access to anything.',
      customerValue: 'An agent can tell whether the business can answer before it tries.',
      requiredInformation: ['Capability names', 'Read vs write effect', 'Input requirements'],
      requiredApis: ['Discovery manifest', 'Capability schema'],
      access: ['read'],
      humanConfirmation: 'none',
      complexity: 'low',
      recommendedAction: 'Publish a discovery file that describes capabilities without claiming they are live.',
    },
    {
      kind: 'research',
      title: `Answer product and service questions about ${offerings}`,
      description:
        'Let an agent retrieve structured information about offerings, availability and constraints instead of scraping prose.',
      businessValue: 'Reduces failed agent sessions and support load from incomplete answers.',
      customerValue: 'Faster, more accurate answers during research.',
      requiredInformation: ['Product catalogue', 'Availability or lead time', 'Constraints and exclusions'],
      requiredApis: ['Read-only catalogue endpoint', 'Availability query'],
      access: ['read'],
      humanConfirmation: 'none',
      complexity: 'medium',
      recommendedAction: 'Expose a read-only catalogue query with explicit field boundaries.',
    },
    {
      kind: 'compare',
      title: 'Support structured comparison and recommendation',
      description:
        'Return comparable attributes so an agent can rank options rather than guess from marketing copy.',
      businessValue: 'Wins consideration when an agent is assembling a shortlist.',
      customerValue: 'Comparable options with stated trade-offs.',
      requiredInformation: ['Comparable attributes', 'Price or quote basis', 'Eligibility rules'],
      requiredApis: ['Comparison endpoint', 'Quote or price basis'],
      access: ['read'],
      humanConfirmation: 'none',
      complexity: 'medium',
      recommendedAction: 'Define the comparable attributes you are willing to publish consistently.',
    },
    {
      kind: 'prepare',
      title: 'Prepare an order or booking for human confirmation',
      description:
        'Let the agent assemble a draft action — items, timing, customer details — and return a confirmation page instead of executing a POST.',
      businessValue: 'Captures intent without moving the trust boundary into the agent session.',
      customerValue: 'Reviews the exact operation before anything changes.',
      requiredInformation: ['Draft line items', 'Timing and location', 'Consequences and cancellation terms'],
      requiredApis: ['Draft action endpoint', 'Confirmation page'],
      access: ['read', 'write'],
      humanConfirmation: 'required',
      complexity: 'high',
      recommendedAction: 'Implement the GET draft + human confirmation pattern before any automated write.',
    },
    {
      kind: 'complete',
      title: 'Complete only confirmed actions through a governed write path',
      description:
        'After a human approves the prepared action, send the write request to the merchant backend and record the outcome.',
      businessValue: 'Converts prepared intent into a governed transaction with an audit record.',
      customerValue: 'A completed action they explicitly approved.',
      requiredInformation: ['Approval reference', 'Idempotency key', 'Final terms'],
      requiredApis: ['Confirmed write endpoint', 'Outcome receipt'],
      access: ['write'],
      humanConfirmation: 'required',
      complexity: 'high',
      recommendedAction: 'Gate every write behind a recorded human approval; never let discovery imply completion.',
    },
    {
      kind: 'support',
      title: 'Resolve post-transaction status and support requests',
      description:
        'Answer status questions and route exceptions without exposing amounts, credentials or personal data in the console.',
      businessValue: 'Lower support volume and fewer duplicate contacts.',
      customerValue: 'Status answers without repeating themselves.',
      requiredInformation: ['Order or booking reference', 'Status vocabulary', 'Escalation route'],
      requiredApis: ['Status read endpoint'],
      access: ['read'],
      humanConfirmation: 'none',
      complexity: 'medium',
      recommendedAction: 'Expose status reads scoped to the caller, never a cross-customer lookup.',
    },
  ]
}

export function rankOpportunities(
  opportunities: AgentOpportunity[],
): AgentOpportunity[] {
  const scored = opportunities.map((opportunity) => {
    let total = 0
    for (const factor of SCORE_FACTORS) {
      total += opportunity.scores[factor] * RANKING_WEIGHTS[factor]
    }
    return { ...opportunity, score: Math.round(total * 100) / 100 }
  })
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return scored.map((opportunity, index) => ({ ...opportunity, rank: index + 1 }))
}

export function buildOpportunities(profile: ResearchProfile): AgentOpportunity[] {
  const opportunities = templates(profile).map((template) => {
    const { scores, basis } = scoreFor(template.kind, profile)
    return {
      id: template.kind,
      title: template.title,
      description: template.description,
      businessValue: template.businessValue,
      customerValue: template.customerValue,
      requiredInformation: template.requiredInformation,
      requiredApis: template.requiredApis,
      access: template.access,
      humanConfirmation: template.humanConfirmation,
      complexity: template.complexity,
      evidence: `Inferred from your submitted profile. ${basis}`,
      provenance: 'interpretation' as const,
      confidence: 'low' as const,
      scores,
      score: 0,
      rank: 0,
      recommendedAction: template.recommendedAction,
    }
  })
  return rankOpportunities(opportunities)
}

function sections(profile: ResearchProfile): ReportSection[] {
  const industry = profile.industry || 'the industry you entered'
  const location = profile.geography ?? profile.country
  return [
    {
      id: 'executive',
      title: 'Executive overview',
      summary:
        'A profile was captured. No verified market dataset is connected, so this report states the gap rather than filling it with estimates.',
      findings: [
        {
          id: 'profile-captured',
          claim: `Research profile captured for ${industry}${profile.subIndustry ? ` — ${profile.subIndustry}` : ''}${location ? ` in ${location}` : ''}.`,
          provenance: 'verified',
          confidence: 'high',
          sourceIds: [],
          note: 'Verified means the profile fields were submitted by you; it does not verify the market.',
        },
        gapFinding('exec-gap', 'the executive market overview'),
      ],
      metrics: [
        metric('market-size', 'Market size', 'USD', 'unknown', null, 'No provider connected.'),
        metric('growth', 'Market growth', '% CAGR', 'unknown', null, 'No provider connected.'),
      ],
      charts: [],
      sourceIds: [],
    },
    {
      id: 'landscape',
      title: 'Market landscape',
      summary:
        'Market size, segment split and geographic distribution require a sourced dataset. None is attached to this workspace.',
      findings: [gapFinding('landscape-gap', 'market size and segment distribution')],
      metrics: [
        metric('segment-split', 'Largest segment', '% share', 'unknown'),
        metric('geo-distribution', 'Geographic distribution', '% share', 'unknown'),
      ],
      charts: [emptyChart('landscape-chart', 'Market growth', 'line', 'USD')],
      sourceIds: [],
    },
    {
      id: 'demand',
      title: 'Demand and emerging trends',
      summary:
        'Search demand and trend direction are not inferred from the profile. A trend chart appears only when a dated series exists.',
      findings: [gapFinding('demand-gap', 'search demand and trend direction')],
      metrics: [metric('search-demand', 'Search demand index', 'index', 'unknown')],
      charts: [emptyChart('demand-chart', 'Search demand', 'line', 'index')],
      sourceIds: [],
    },
    {
      id: 'ai-transformation',
      title: 'AI transformation',
      summary:
        'Adoption rates and AI maturity are market claims. They are shown as unknown until a dated source is connected.',
      findings: [gapFinding('ai-gap', 'AI adoption in this industry')],
      metrics: [metric('ai-adoption', 'AI adoption', '% of firms', 'unknown')],
      charts: [emptyChart('ai-chart', 'AI adoption', 'bar', '%')],
      sourceIds: [],
    },
    {
      id: 'competition',
      title: 'Competitive intelligence',
      summary:
        'No competitor dataset is connected. Company profiles are only shown when sourced; marketing claims are never treated as proof of technical capability.',
      findings: [
        gapFinding('competition-gap', 'competitor profiles and positioning'),
        {
          id: 'competition-rule',
          claim:
            'A public integration or agent-compatibility claim is not evidence that the integration works. Only observed capability or documentation is.',
          provenance: 'interpretation',
          confidence: 'high',
          sourceIds: [],
          note: 'This is a methodology rule, not a market finding.',
        },
      ],
      metrics: [],
      charts: [emptyChart('competition-chart', 'Competitor comparison', 'bar', 'score')],
      sourceIds: [],
    },
    {
      id: 'ecosystem',
      title: 'Industry ecosystem',
      summary:
        'Mapping suppliers, channels and intermediaries needs a sourced ecosystem dataset. The profile alone is not one.',
      findings: [gapFinding('ecosystem-gap', 'the industry ecosystem')],
      metrics: [],
      charts: [emptyChart('ecosystem-chart', 'Ecosystem map', 'bar', 'entities')],
      sourceIds: [],
    },
    {
      id: 'agentic-commerce',
      title: 'Agentic commerce analysis',
      summary:
        'How agents could interact with this business, from discovery to confirmed transaction. Each stage is a design question, not a claim about demand.',
      findings: [
        {
          id: 'agentic-flow',
          claim:
            'The interaction path separates discovery, research, comparison, preparation, human confirmation and completion. The console must never merge these into one metric.',
          provenance: 'interpretation',
          confidence: 'high',
          sourceIds: [],
          note: 'Product principle; see the Agent analytics screen for how the ledger maps to it.',
        },
        {
          id: 'agentic-confirmation',
          claim:
            'A state-changing action in a GET-only environment must be prepared as a reviewable draft and confirmed by a human before the write is sent.',
          provenance: 'interpretation',
          confidence: 'high',
          sourceIds: [],
          note: 'This is the existing AgentPort confirmation architecture, not a market forecast.',
        },
        {
          id: 'agentic-trust',
          claim:
            'Publishing a discovery file does not establish functional agent compatibility. Readiness requires evidence of working reads, writes and permissions.',
          provenance: 'interpretation',
          confidence: 'high',
          sourceIds: [],
          note: null,
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: [],
    },
    {
      id: 'opportunity-map',
      title: 'Agent opportunity map',
      summary:
        'Candidate opportunities inferred from the profile you submitted. They are ranked for discussion; they are not measured demand.',
      findings: [
        {
          id: 'opportunity-method',
          claim: `Opportunities are ranked by ${SCORE_FACTORS.map((f) => `${f} ${RANKING_WEIGHTS[f]}`).join(', ')} on a 1–5 scale.`,
          provenance: 'derived',
          confidence: 'high',
          sourceIds: [],
          note: 'The weights are fixed in code and shown on the page.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: [],
    },
    {
      id: 'risks',
      title: 'Risks and regulation',
      summary:
        'Regulatory posture depends on jurisdiction, sector and the data an agent touches. No jurisdiction dataset is connected.',
      findings: [gapFinding('risk-gap', 'the regulatory position in your target geography')],
      metrics: [],
      charts: [],
      sourceIds: [],
    },
    {
      id: 'outlook',
      title: 'Outlook and scenarios',
      summary:
        'Scenarios are conditional narratives, not forecasts. No forecast is shown without a dated model and source.',
      findings: [
        {
          id: 'scenario-baseline',
          claim:
            'Baseline scenario: discovery improves, but transaction completion stays human-confirmed until write controls and audit evidence exist.',
          provenance: 'interpretation',
          confidence: 'low',
          sourceIds: [],
          note: 'Conditional on the product work described above; not a market forecast.',
        },
        {
          id: 'scenario-upside',
          claim:
            'Upside scenario: successful read capabilities and confirmed writes reduce support load and capture agent-originated intent.',
          provenance: 'interpretation',
          confidence: 'low',
          sourceIds: [],
          note: 'Hypothesis for validation, not an estimate.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: [],
    },
    {
      id: 'sources',
      title: 'Sources and methodology',
      summary:
        'No external source is attached. This report separates verified profile facts, interpretations and unknown market data.',
      findings: [
        {
          id: 'source-gap',
          claim: 'There are no external sources to cite for this report.',
          provenance: 'unknown',
          confidence: 'unknown',
          sourceIds: [],
          note: 'Adding a plausible-looking citation would be worse than leaving the section empty.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: [],
    },
  ]
}

export function buildReport(profile: ResearchProfile): ResearchReport {
  return {
    profile,
    generatedAt: new Date().toISOString(),
    dataMode: 'unresearched',
    honestyNote:
      'No verified market dataset is connected. Figures render as unknown, and opportunities are labelled interpretations of your profile.',
    sections: sections(profile),
    opportunities: buildOpportunities(profile),
    workflows: buildWorkflows(profile),
    sources: [],
    rankingMethod: RANKING_METHOD,
  }
}

export function reportSourceById(sources: ResearchSource[], id: string | null): ResearchSource | null {
  if (!id) return null
  return sources.find((source) => source.id === id) ?? null
}

export function hasAnyMetric(report: ResearchReport): boolean {
  return report.sections.some((section) => section.metrics.some((m) => m.value !== null))
}

export function countUnknownMetrics(report: ResearchReport): number {
  return report.sections.reduce(
    (total, section) => total + section.metrics.filter((m) => m.value === null).length,
    0,
  )
}
