import type { AccessMode } from './types'

/**
 * Website readiness scoring.
 *
 * The brief's six dimensions are scored separately and never collapsed into
 * one green number. Three rules matter:
 *
 * 1. A discovery file is evidence of *discoverability*, not of functional
 *    agent compatibility. It cannot make the capability or transaction
 *    dimensions pass.
 * 2. `unknown` is not `fail` and not `zero`. A site with no public API docs
 *    has not proved it has no API — it has proved nothing. The dimension is
 *    unknown and contributes to no score.
 * 3. Every finding carries the observation that produced it. No finding is
 *    inferred from a marketing claim.
 */

export type FileProbe = {
  present: boolean
  status: number | null
  contentType: string | null
  bytes: number
}

export type HtmlSignals = {
  title: string | null
  metaDescription: boolean
  jsonLdBlocks: number
  schemaTypes: string[]
  priceSignals: number
  productLinks: number
}

export type WebsiteEvidence = {
  url: string
  finalUrl: string | null
  fetchedAt: string
  reachable: boolean
  status: number | null
  note: string | null
  https: boolean
  headers: { hsts: boolean; csp: boolean }
  html: HtmlSignals
  probes: {
    agentJson: FileProbe
    llmsTxt: FileProbe
    llmsFullTxt: FileProbe
    robotsTxt: FileProbe
    sitemapXml: FileProbe
    openApi: FileProbe
  }
}

export type ReadinessDimensionId =
  | 'discoverability'
  | 'information'
  | 'capability'
  | 'integration'
  | 'transaction'
  | 'trust'

export type FindingStatus = 'pass' | 'partial' | 'fail' | 'unknown'

export type ReadinessFinding = {
  id: string
  dimension: ReadinessDimensionId
  label: string
  status: FindingStatus
  evidence: string
}

export type ReadinessDimension = {
  id: ReadinessDimensionId
  label: string
  /** 0–100, or null when every finding is unknown. */
  score: number | null
  status: FindingStatus
  findings: ReadinessFinding[]
}

export type ReadinessAssessment = {
  dimensions: ReadinessDimension[]
  /** Mean of the dimensions with evidence; null when none have evidence. */
  overall: number | null
  access: AccessMode[]
  note: string
}

const STATUS_VALUE: Record<FindingStatus, number | null> = {
  pass: 1,
  partial: 0.5,
  fail: 0,
  unknown: null,
}

const DIMENSION_LABELS: Array<{ id: ReadinessDimensionId; label: string }> = [
  { id: 'discoverability', label: 'Discoverability' },
  { id: 'information', label: 'Information quality' },
  { id: 'capability', label: 'Capability readiness' },
  { id: 'integration', label: 'Integration readiness' },
  { id: 'transaction', label: 'Transaction readiness' },
  { id: 'trust', label: 'Trust and control' },
]

function present(probe: FileProbe): boolean {
  return probe.present && probe.status !== null && probe.status >= 200 && probe.status < 300
}

function describe(probe: FileProbe): string {
  if (probe.status === null) return 'not observed'
  if (probe.status === 404) return 'not found'
  return `HTTP ${probe.status}`
}

export function assessWebsite(evidence: WebsiteEvidence): ReadinessAssessment {
  const findings: ReadinessFinding[] = []

  // Discoverability is about presence of surfaces, not about whether an agent
  // uses them. It is the only dimension a discovery file can move.
  findings.push({
    id: 'disc-agent-json',
    dimension: 'discoverability',
    label: 'Discovery manifest',
    status: present(evidence.probes.agentJson) ? 'partial' : 'unknown',
    evidence: `/.well-known/agent.json: ${describe(evidence.probes.agentJson)}. Presence advertises capabilities; it does not verify them.`,
  })
  findings.push({
    id: 'disc-llms',
    dimension: 'discoverability',
    label: 'LLM guidance files',
    status: present(evidence.probes.llmsTxt) || present(evidence.probes.llmsFullTxt) ? 'partial' : 'unknown',
    evidence: `/llms.txt: ${describe(evidence.probes.llmsTxt)}; /llms-full.txt: ${describe(evidence.probes.llmsFullTxt)}.`,
  })
  findings.push({
    id: 'disc-crawl',
    dimension: 'discoverability',
    label: 'Crawl controls and sitemap',
    status:
      present(evidence.probes.robotsTxt) && present(evidence.probes.sitemapXml)
        ? 'pass'
        : present(evidence.probes.robotsTxt) || present(evidence.probes.sitemapXml)
          ? 'partial'
          : 'unknown',
    evidence: `/robots.txt: ${describe(evidence.probes.robotsTxt)}; /sitemap.xml: ${describe(evidence.probes.sitemapXml)}.`,
  })

  // Information quality observes structured, machine-readable content.
  const hasSchema = evidence.html.schemaTypes.length > 0
  findings.push({
    id: 'info-structured',
    dimension: 'information',
    label: 'Structured data',
    status: evidence.html.jsonLdBlocks > 0 && hasSchema ? 'pass' : evidence.html.jsonLdBlocks > 0 ? 'partial' : 'unknown',
    evidence: `${evidence.html.jsonLdBlocks} JSON-LD block(s); schema types: ${evidence.html.schemaTypes.join(', ') || 'none observed'}.`,
  })
  findings.push({
    id: 'info-description',
    dimension: 'information',
    label: 'Page description',
    status: evidence.html.metaDescription ? 'pass' : 'unknown',
    evidence: `Meta description: ${evidence.html.metaDescription ? 'present' : 'not observed'}; title: ${evidence.html.title ?? 'not observed'}.`,
  })
  findings.push({
    id: 'info-pricing',
    dimension: 'information',
    label: 'Pricing and availability signals',
    status: evidence.html.priceSignals > 0 ? 'partial' : 'unknown',
    evidence: `${evidence.html.priceSignals} price signal(s) in the fetched homepage HTML. A price signal is not a machine-readable quote.`,
  })

  // Capability and integration need a documented interface. Absence of public
  // documentation is unknown, not a claim that no integration exists.
  const hasApiDocs = present(evidence.probes.openApi)
  findings.push({
    id: 'cap-interface',
    dimension: 'capability',
    label: 'Documented capability interface',
    status: hasApiDocs && present(evidence.probes.agentJson) ? 'partial' : hasApiDocs ? 'partial' : 'unknown',
    evidence: `/openapi.json: ${describe(evidence.probes.openApi)}; discovery manifest: ${describe(evidence.probes.agentJson)}. Files alone cannot prove a capability executes.`,
  })
  findings.push({
    id: 'cap-inventory',
    dimension: 'capability',
    label: 'Executable capability inventory',
    status: 'unknown',
    evidence: 'No runtime execution evidence is collected by a public website scan. Read the console capability inventory instead.',
  })
  findings.push({
    id: 'int-api-docs',
    dimension: 'integration',
    label: 'Public API documentation',
    status: hasApiDocs ? 'partial' : 'unknown',
    evidence: `OpenAPI document: ${describe(evidence.probes.openApi)}.`,
  })
  findings.push({
    id: 'int-auth',
    dimension: 'integration',
    label: 'Credential model',
    status: 'unknown',
    evidence: 'Credential issuance and scope cannot be established from public files.',
  })

  // Transaction readiness is deliberately conservative.
  const offerSchema = evidence.html.schemaTypes.some((type) => /^(product|offer|service|softwareapplication)$/i.test(type))
  findings.push({
    id: 'txn-offer',
    dimension: 'transaction',
    label: 'Machine-readable offer',
    status: offerSchema ? 'partial' : 'unknown',
    evidence: `Offer-like schema types: ${evidence.html.schemaTypes.filter((t) => /^(product|offer|service|softwareapplication)$/i.test(t)).join(', ') || 'none observed'}.`,
  })
  findings.push({
    id: 'txn-confirmation',
    dimension: 'transaction',
    label: 'Human confirmation path',
    status: 'unknown',
    evidence: 'A public scan cannot observe the GET draft + human confirmation flow. Inspect it in the installation review.',
  })

  // Trust only claims what transport headers prove.
  findings.push({
    id: 'trust-transport',
    dimension: 'trust',
    label: 'Transport security',
    status: !evidence.https ? 'fail' : evidence.headers.hsts && evidence.headers.csp ? 'pass' : evidence.headers.hsts || evidence.headers.csp ? 'partial' : 'unknown',
    evidence: `HTTPS: ${evidence.https ? 'yes' : 'no'}; HSTS: ${evidence.headers.hsts ? 'present' : 'absent'}; CSP: ${evidence.headers.csp ? 'present' : 'absent'}. This says nothing about approval policy.`,
  })

  const dimensions = DIMENSION_LABELS.map(({ id, label }) => {
    const list = findings.filter((finding) => finding.dimension === id)
    const values = list
      .map((finding) => STATUS_VALUE[finding.status])
      .filter((value): value is number => value !== null)
    const score = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : null
    const status: FindingStatus =
      list.some((f) => f.status === 'fail')
        ? 'fail'
        : score === null
          ? 'unknown'
          : score >= 80
            ? 'pass'
            : score > 0
              ? 'partial'
              : 'fail'
    return { id, label, score, status, findings: list }
  })

  const scores = dimensions
    .map((dimension) => dimension.score)
    .filter((score): score is number => score !== null)
  const overall = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  return {
    dimensions,
    overall,
    access: ['read'],
    note:
      'This is a public-surface readiness scan, not proof of live agent capability. A discovery file alone does not establish functional agent compatibility.',
  }
}
