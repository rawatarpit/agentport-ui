import { describe, expect, it } from 'vitest'
import { assessWebsite, type FileProbe, type WebsiteEvidence } from './intelligence/readiness'
import { checkHostResolvesPublic } from './map-crawl'
import {
  buildEvidence,
  fetchBounded,
  MAX_TOTAL_BYTES,
  parseAssessmentTarget,
  probeFromPage,
  unreachableEvidence,
  type BoundedPage,
} from './website-assessment'

/**
 * Opt-in real-site verification.
 *
 * The default suite must stay network-free, so this file is skipped unless
 * RUN_REAL_SITE_ASSESSMENT=1. It uses the same DNS guard, pinned fetch, byte
 * caps and scoring functions as the API route — no parallel implementation.
 */

const SITES = [
  'https://example.com',
  'https://www.cloudflare.com',
  'https://www.wikipedia.org',
  'https://www.nasa.gov',
]

const PROBES: Array<{ key: keyof WebsiteEvidence['probes']; path: string }> = [
  { key: 'agentJson', path: '/.well-known/agent.json' },
  { key: 'llmsTxt', path: '/llms.txt' },
  { key: 'llmsFullTxt', path: '/llms-full.txt' },
  { key: 'robotsTxt', path: '/robots.txt' },
  { key: 'sitemapXml', path: '/sitemap.xml' },
  { key: 'openApi', path: '/openapi.json' },
]

function absent(): FileProbe {
  return { present: false, status: null, contentType: null, bytes: 0 }
}

async function assessRealSite(site: string) {
  const target = parseAssessmentTarget(site)
  expect(target.ok).toBe(true)
  if (!target.ok) throw new Error(target.reason)

  const fetchedAt = new Date().toISOString()
  const dns = await checkHostResolvesPublic(target.host)
  if (!dns.ok || dns.addresses.length === 0) {
    // A refused DNS answer is an unavailable observation, not a test crash.
    const evidence = unreachableEvidence(target.url, fetchedAt, dns.ok ? 'Merchant host did not resolve to an address.' : dns.reason)
    return { target, evidence, assessment: assessWebsite(evidence), budget: { remaining: MAX_TOTAL_BYTES } }
  }

  const address = dns.addresses[0]
  if (!address) {
    const evidence = unreachableEvidence(target.url, fetchedAt, 'Merchant host did not resolve to an address.')
    return { target, evidence, assessment: assessWebsite(evidence), budget: { remaining: MAX_TOTAL_BYTES } }
  }
  const pinned = { address, family: address.includes(':') ? (6 as const) : (4 as const) }
  const budget = { remaining: MAX_TOTAL_BYTES }

  const root: BoundedPage = await fetchBounded(`${target.origin}/`, budget, pinned)
  const probes = PROBES.reduce<WebsiteEvidence['probes']>(
    (acc, probe) => ({ ...acc, [probe.key]: absent() }),
    {
      agentJson: absent(),
      llmsTxt: absent(),
      llmsFullTxt: absent(),
      robotsTxt: absent(),
      sitemapXml: absent(),
      openApi: absent(),
    },
  )

  const rootOk = !root.redirected && root.status !== null && root.status >= 200 && root.status < 300
  if (rootOk) {
    for (const probe of PROBES) {
      probes[probe.key] = probeFromPage(await fetchBounded(`${target.origin}${probe.path}`, budget, pinned), probe.key)
    }
  }

  const evidence = buildEvidence({
    target: target.url,
    fetchedAt,
    root,
    probes,
    note: root.error ?? null,
  })
  return { target, evidence, assessment: assessWebsite(evidence), budget }
}

describe.skipIf(process.env.RUN_REAL_SITE_ASSESSMENT !== '1')('real website assessment integration', () => {
  for (const site of SITES) {
    it(`produces honest evidence for ${site}`, async () => {
      const { evidence, assessment, budget } = await assessRealSite(site)
      const summary = {
        site,
        reachable: evidence.reachable,
        status: evidence.status,
        note: evidence.note,
        title: evidence.html.title,
        schemaTypes: evidence.html.schemaTypes,
        probes: Object.fromEntries(
          Object.entries(evidence.probes).map(([key, probe]) => [
            key,
            { present: probe.present, status: probe.status ?? 'not observed', contentType: probe.contentType },
          ]),
        ),
        dimensions: assessment.dimensions.map((d) => `${d.id}:${d.status}:${d.score ?? 'null'}`),
        remainingBudget: budget.remaining,
      }
      console.log(JSON.stringify(summary, null, 2))

      expect(budget.remaining).toBeGreaterThanOrEqual(0)
      expect(assessment.overall === null || typeof assessment.overall === 'number').toBe(true)
      if (!evidence.reachable) {
        expect(assessment.overall).toBeNull()
      }
      for (const id of ['capability', 'integration', 'transaction'] as const) {
        const dimension = assessment.dimensions.find((d) => d.id === id)
        expect(dimension?.status).not.toBe('pass')
      }
      for (const probe of Object.values(evidence.probes)) {
        // 3xx is a refused redirect, not a found file; it is still an observed
        // response and must not be labelled "not found".
        if (!probe.present) expect(probe.status === null || probe.status >= 300).toBe(true)
      }
    }, 60_000)
  }
})
