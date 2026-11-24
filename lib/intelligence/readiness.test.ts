import { describe, expect, it } from 'vitest'

import {
  assessWebsite,
  type FileProbe,
  type ReadinessAssessment,
  type ReadinessDimensionId,
  type WebsiteEvidence,
} from './readiness.js'

function probe(status: number | null): FileProbe {
  return status === null
    ? { present: false, status: null, contentType: null, bytes: 0 }
    : { present: status >= 200 && status < 300, status, contentType: 'text/plain', bytes: 128 }
}

function emptyEvidence(): WebsiteEvidence {
  return {
    url: 'https://shop.example',
    finalUrl: 'https://shop.example',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    reachable: true,
    status: 200,
    note: null,
    https: true,
    headers: { hsts: false, csp: false },
    html: {
      title: null,
      metaDescription: false,
      jsonLdBlocks: 0,
      schemaTypes: [],
      priceSignals: 0,
      productLinks: 0,
    },
    probes: {
      agentJson: probe(null),
      llmsTxt: probe(null),
      llmsFullTxt: probe(null),
      robotsTxt: probe(null),
      sitemapXml: probe(null),
      openApi: probe(null),
    },
  }
}

function dimension(assessment: ReadinessAssessment, id: ReadinessDimensionId) {
  const found = assessment.dimensions.find((item) => item.id === id)
  if (!found) throw new Error(`Missing dimension: ${id}`)
  return found
}

describe('assessWebsite honesty', () => {
  it('returns null instead of zero when no finding has evidence', () => {
    const assessment = assessWebsite(emptyEvidence())
    expect(assessment.overall).toBeNull()
    for (const item of assessment.dimensions) {
      expect(item.score).toBeNull()
      expect(item.status).toBe('unknown')
      expect(item.findings.every((finding) => finding.status === 'unknown')).toBe(true)
    }
  })

  it('does not let discovery files pass capability or transaction', () => {
    const evidence = emptyEvidence()
    evidence.probes.agentJson = probe(200)
    evidence.probes.llmsTxt = probe(200)
    evidence.probes.llmsFullTxt = probe(200)
    evidence.probes.robotsTxt = probe(200)
    evidence.probes.sitemapXml = probe(200)

    const assessment = assessWebsite(evidence)
    expect(dimension(assessment, 'discoverability').status).toBe('partial')
    expect(dimension(assessment, 'capability').status).toBe('unknown')
    expect(dimension(assessment, 'transaction').status).toBe('unknown')
    for (const id of ['capability', 'transaction'] as const) {
      for (const finding of dimension(assessment, id).findings) {
        expect(finding.status).toBe('unknown')
      }
    }
  })

  it('derives pass, partial and unknown from the supplied probes', () => {
    const robotsOnly = emptyEvidence()
    robotsOnly.probes.robotsTxt = probe(200)
    expect(dimension(assessWebsite(robotsOnly), 'discoverability').status).toBe('partial')

    const crawlControls = emptyEvidence()
    crawlControls.probes.robotsTxt = probe(200)
    crawlControls.probes.sitemapXml = probe(200)
    expect(dimension(assessWebsite(crawlControls), 'discoverability').status).toBe('pass')

    // A file that answers 404 was probed but is not present.
    const missing = emptyEvidence()
    missing.probes.robotsTxt = probe(404)
    expect(dimension(assessWebsite(missing), 'discoverability').status).toBe('unknown')

    const withApi = emptyEvidence()
    withApi.probes.openApi = probe(200)
    const assessment = assessWebsite(withApi)
    expect(dimension(assessment, 'integration').status).toBe('partial')
    expect(dimension(assessment, 'capability').status).toBe('partial')
    expect(dimension(assessment, 'transaction').status).toBe('unknown')

    const withHeaders = emptyEvidence()
    withHeaders.headers = { hsts: true, csp: true }
    expect(dimension(assessWebsite(withHeaders), 'trust').status).toBe('pass')
    const withoutHttps = emptyEvidence()
    withoutHttps.https = false
    expect(dimension(assessWebsite(withoutHttps), 'trust').status).toBe('fail')
  })

  it('reports only observed figures, never an invented score or amount', () => {
    const priced = emptyEvidence()
    priced.html.priceSignals = 3
    priced.html.productLinks = 2
    const assessment = assessWebsite(priced)

    expect(dimension(assessment, 'transaction').status).toBe('unknown')
    const pricing = dimension(assessment, 'information').findings.find((item) => item.id === 'info-pricing')
    expect(pricing?.status).toBe('partial')
    expect(pricing?.evidence).toContain('3 price signal(s)')
    expect(pricing?.evidence).toContain('not a machine-readable quote')
    // The score comes from that one observed partial finding, not from a
    // conclusion that the site can take payment.
    expect(assessment.overall).toBe(50)
  })

  it('names the observed status instead of calling every non-2xx answer a 404', () => {
    const evidence = emptyEvidence()
    const finding = (probeValue: FileProbe) =>
      assessWebsite({ ...evidence, probes: { ...evidence.probes, agentJson: probeValue } })
        .dimensions.find((item) => item.id === 'discoverability')
        ?.findings.find((item) => item.id === 'disc-agent-json')?.evidence ?? ''

    expect(finding(probe(null))).toContain('not observed')
    expect(finding(probe(404))).toContain('not found')
    expect(finding(probe(503))).toContain('HTTP 503')
    expect(finding(probe(200))).toContain('HTTP 200')
  })
})
