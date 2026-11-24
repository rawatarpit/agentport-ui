import { afterEach, describe, expect, it, vi } from 'vitest'

import { assessWebsite } from './intelligence/readiness.js'
import {
  boundedByteChunks,
  checkRegisteredOrigin,
  fetchBounded,
  parseAssessmentTarget,
  parseHtml,
  probeFromPage,
  readBoundedStream,
  unreachableEvidence,
  type BoundedPage,
} from './website-assessment.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseAssessmentTarget', () => {
  it('accepts an https address and normalises its trailing slash', () => {
    expect(parseAssessmentTarget('https://shop.example/blog/')).toEqual({
      ok: true,
      origin: 'https://shop.example',
      host: 'shop.example',
      url: 'https://shop.example/blog',
    })
    expect(parseAssessmentTarget('https://shop.example:443').ok).toBe(true)
  })

  it('refuses http in production-like environments', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const result = parseAssessmentTarget('http://shop.example')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/https/i)
  })

  it('refuses credentials, nonstandard ports and malformed addresses', () => {
    for (const raw of [
      'https://user:pass@shop.example',
      'https://user@shop.example',
      'https://shop.example:8443',
      'https://shop.example:8080/path',
      'not a url',
      'https://',
      'shop.example',
      'https://shop.example:abc',
    ]) {
      expect(parseAssessmentTarget(raw).ok).toBe(false)
    }
    expect(parseAssessmentTarget(undefined).ok).toBe(false)
  })
})

describe('parseHtml', () => {
  it('reads structure by pattern without executing markup', () => {
    const html = `<!doctype html><html><head><title>Catalog Shop</title>
<meta name="description" content="Things for sale">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","offers":{"@type":"Offer","price":"49"}}</script>
<script type="application/ld+json">{"@type":"Organization"}</script>
<img src="x" onerror="globalThis.__assessmentExecuted = true">
</head><body><p>Pricing from $49</p><a href="/products/one">One</a></body></html>`

    const signals = parseHtml(html)
    expect(signals.title).toBe('Catalog Shop')
    expect(signals.metaDescription).toBe(true)
    expect(signals.jsonLdBlocks).toBe(2)
    expect(signals.schemaTypes).toContain('Product')
    expect(signals.schemaTypes).toContain('Offer')
    expect(signals.schemaTypes).toContain('Organization')
    expect(signals.priceSignals).toBeGreaterThan(0)
    expect(signals.productLinks).toBeGreaterThan(0)
    expect(Reflect.get(globalThis, '__assessmentExecuted')).toBeUndefined()
  })

  it('returns empty signals for an empty body', () => {
    expect(parseHtml('')).toEqual({
      title: null,
      metaDescription: false,
      jsonLdBlocks: 0,
      schemaTypes: [],
      priceSignals: 0,
      productLinks: 0,
    })
  })
})

describe('unreachableEvidence', () => {
  it('records a missed site as unreachable with no findings to score', () => {
    const evidence = unreachableEvidence(
      'https://shop.example',
      '2026-01-01T00:00:00.000Z',
      'The site could not be reached.',
    )
    expect(evidence.reachable).toBe(false)
    expect(evidence.status).toBeNull()
    expect(evidence.note).toBe('The site could not be reached.')
    expect(evidence.html.title).toBeNull()
    expect(Object.values(evidence.probes).every((item) => item.present === false)).toBe(true)
    expect(assessWebsite(evidence).overall).toBeNull()
  })
})

describe('checkRegisteredOrigin', () => {
  it('refuses to scan when no workspace website is registered', () => {
    expect(checkRegisteredOrigin('https://shop.example', null)).toEqual({
      ok: false,
      reason: 'Set the workspace website before scanning.',
    })
    expect(checkRegisteredOrigin('https://shop.example', '   ').ok).toBe(false)
    expect(checkRegisteredOrigin('https://shop.example', 'not a url').ok).toBe(false)
  })

  it('accepts only the registered origin, ignoring path and default port', () => {
    const registered = 'https://shop.example/blog'
    expect(checkRegisteredOrigin('https://shop.example/llms.txt', registered)).toEqual({
      ok: true,
      origin: 'https://shop.example',
    })
    expect(checkRegisteredOrigin('https://shop.example:443/llms.txt', registered).ok).toBe(true)
    expect(checkRegisteredOrigin('https://shop.example.evil.test', registered)).toEqual({
      ok: false,
      reason: 'Assessment is limited to the workspace website origin.',
    })
    expect(checkRegisteredOrigin('http://shop.example', registered).ok).toBe(false)
    expect(checkRegisteredOrigin('javascript:alert(1)', 'javascript:alert(1)').ok).toBe(false)
  })
})

describe('boundedByteChunks', () => {
  it('counts bytes, not characters, and never includes a clipped multibyte character', () => {
    const encoder = new TextEncoder()
    const chunks = [encoder.encode('ab'), encoder.encode('cé'), encoder.encode('rest')]
    const result = boundedByteChunks(chunks, 4)
    expect(result.bytes).toBe(4)
    expect(result.truncated).toBe(true)
    expect([...result.data]).toEqual([...encoder.encode('abc'), 0xc3])
    expect(new TextDecoder().decode(result.data)).not.toContain('é')
    expect(boundedByteChunks(chunks, 100).bytes).toBe(encoder.encode('abcérest').length)
  })
})

describe('readBoundedStream', () => {
  it('stops at the cap, cancels the stream, and reports only consumed bytes', async () => {
    const encoder = new TextEncoder()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('abc'))
        controller.enqueue(encoder.encode('def'))
      },
      cancel,
    })
    expect(await readBoundedStream(stream, 4)).toEqual({ text: 'abcd', bytes: 4, truncated: true })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})

describe('fetchBounded with a pinned address', () => {
  it('reports an unreachable pinned socket as unknown, without spending bytes', async () => {
    const budget = { remaining: 1000 }
    const page = await fetchBounded('https://example.in:1/', budget, { address: '127.0.0.1', family: 4 })
    expect(page.status).toBeNull()
    expect(page.bytes).toBe(0)
    expect(page.error).toBe('The site could not be reached.')
    expect(budget.remaining).toBe(1000)
  })
})

describe('probeFromPage', () => {
  const page: BoundedPage = {
    status: 200,
    contentType: 'text/plain',
    body: 'ok',
    bytes: 2,
    headers: {},
    redirected: false,
    error: null,
  }

  it('keeps the observed status on a non-2xx answer', () => {
    expect(probeFromPage({ ...page, status: 503 })).toEqual({
      present: false,
      status: 503,
      contentType: 'text/plain',
      bytes: 2,
    })
  })

  it('leaves status null on a network error', () => {
    const probe = probeFromPage({ ...page, status: null, contentType: null, bytes: 0, error: 'unreachable' })
    expect(probe.present).toBe(false)
    expect(probe.status).toBeNull()
  })

  it('refuses an HTML fallback for a JSON probe', () => {
    const probe = probeFromPage({ ...page, contentType: 'text/html; charset=utf-8' }, 'openApi')
    expect(probe.status).toBe(200)
    expect(probe.present).toBe(false)
  })

  it('accepts a charset-qualified JSON probe', () => {
    expect(probeFromPage({ ...page, contentType: 'application/json; charset=utf-8' }, 'agentJson').present).toBe(true)
  })

  it('refuses an HTML fallback for a plain-text probe', () => {
    expect(probeFromPage({ ...page, contentType: 'text/html' }, 'llmsTxt').present).toBe(false)
  })

  it('reports a missing content type as absent, not present', () => {
    const probe = probeFromPage({ ...page, contentType: null }, 'openApi')
    expect(probe.status).toBe(200)
    expect(probe.present).toBe(false)
  })
})
