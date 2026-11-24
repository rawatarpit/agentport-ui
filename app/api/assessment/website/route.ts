import { readTenantResearchProfile } from '@/lib/intelligence/profile'
import { assessWebsite, type FileProbe, type WebsiteEvidence } from '@/lib/intelligence/readiness'
import { checkHostResolvesPublic } from '@/lib/map-crawl'
import { guardStateChange } from '@/lib/request-guard'
import { resolveRequestTenant, tenantRefusalResponse } from '@/lib/tenant-server'
import {
  buildEvidence,
  checkRegisteredOrigin,
  fetchBounded,
  MAX_TOTAL_BYTES,
  parseAssessmentTarget,
  probeFromPage,
  unreachableEvidence,
  type BoundedPage,
  type PinnedAddress,
} from '@/lib/website-assessment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROBES = [
  { key: 'agentJson', path: '/.well-known/agent.json' },
  { key: 'llmsTxt', path: '/llms.txt' },
  { key: 'llmsFullTxt', path: '/llms-full.txt' },
  { key: 'robotsTxt', path: '/robots.txt' },
  { key: 'sitemapXml', path: '/sitemap.xml' },
  { key: 'openApi', path: '/openapi.json' },
] as const satisfies ReadonlyArray<{ key: keyof WebsiteEvidence['probes']; path: string }>

function absentProbe(): FileProbe {
  return { present: false, status: null, contentType: null, bytes: 0 }
}

function rootFailureNote(root: BoundedPage): string {
  if (root.redirected) return 'The site redirected. Redirects are refused, so no content was inspected.'
  if (root.error) return root.error
  if (root.status !== null) return `The site answered HTTP ${root.status}; no content was inspected.`
  return 'The site could not be inspected.'
}

/**
 * POST /api/assessment/website — inspect a public site and report what the
 * public surface actually shows. The output is evidence plus derived findings,
 * never a claim of live agent capability: nothing here executes, logs in, or
 * reaches a private address. An unreachable site is an honest unknown, not a
 * zero score or a failed review.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'assessment:website')
  if (guarded) return guarded

  let tenant: Awaited<ReturnType<typeof resolveRequestTenant>>
  try {
    tenant = await resolveRequestTenant()
  } catch {
    return tenantRefusalResponse({ code: 'signed_out' })
  }
  if (!tenant.userId) return tenantRefusalResponse({ code: 'signed_out' })
  if (tenant.active.status !== 'active') {
    // Keep the canonical reason but never a selection prompt: this endpoint
    // starts a bounded public fetch, so every non-active caller gets a 403.
    const canonical = tenantRefusalResponse(tenant.active)
    const body = (await canonical.json()) as { reason: string }
    return Response.json({ status: 'error', reason: body.reason }, { status: 403 })
  }
  const { profile } = await readTenantResearchProfile()

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json(
      { status: 'error', reason: 'Send a JSON body with a public https:// website address.' },
      { status: 400 },
    )
  }
  const submitted = typeof raw === 'object' && raw !== null && 'url' in raw ? raw.url : undefined
  const origin = checkRegisteredOrigin(submitted, profile.website)
  if (!origin.ok) return Response.json({ status: 'error', reason: origin.reason }, { status: 400 })
  const target = parseAssessmentTarget(submitted)
  if (!target.ok) return Response.json({ status: 'error', reason: target.reason }, { status: 400 })

  const dns = await checkHostResolvesPublic(target.host)
  if (!dns.ok) return Response.json({ status: 'error', reason: dns.reason }, { status: 400 })
  // Every answer was public; pin to one validated address. Prefer IPv4 where
  // present so a dual-homed host still scans on networks without IPv6 egress.
  const address = dns.addresses.find((ip) => !ip.includes(':')) ?? dns.addresses[0]
  if (!address) return Response.json({ status: 'error', reason: 'The site could not be resolved.' }, { status: 400 })
  const family: 4 | 6 = address.includes(':') ? 6 : 4
  const pinned: PinnedAddress = { address, family }

  const budget = { remaining: MAX_TOTAL_BYTES }
  const fetchedAt = new Date().toISOString()
  const root = await fetchBounded(`${target.url}/`, budget, pinned)
  const rootOk = !root.redirected && root.status !== null && root.status >= 200 && root.status < 300

  let evidence: WebsiteEvidence
  if (!rootOk) {
    // Seven fetches against a host that did not answer would only burn the
    // budget; unreachableEvidence records the refusal as unknown, never zero.
    evidence = unreachableEvidence(target.url, fetchedAt, rootFailureNote(root))
  } else {
    const probes: WebsiteEvidence['probes'] = {
      agentJson: absentProbe(),
      llmsTxt: absentProbe(),
      llmsFullTxt: absentProbe(),
      robotsTxt: absentProbe(),
      sitemapXml: absentProbe(),
      openApi: absentProbe(),
    }
    for (const probe of PROBES) {
      const page = await fetchBounded(`${target.origin}${probe.path}`, budget, pinned)
      probes[probe.key] = probeFromPage(page, probe.key)
    }
    evidence = buildEvidence({ target: target.url, fetchedAt, root, probes })
  }

  const assessment = assessWebsite(evidence)
  return Response.json({ status: 'ok', target: target.url, evidence, assessment })
}
