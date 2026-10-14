import { describe, expect, it } from 'vitest'

import { checkHostResolvesPublic, checkTarget, parseMerchantOrigin, shapeCrawled } from './map-crawl.js'

/**
 * Crawl guards. Every test asserts the SSRF posture, not the helper: an
 * attacker-influenced input must fail closed, and the failure must name the
 * reason instead of fetching first and explaining later.
 */
describe('parseMerchantOrigin', () => {
  it('accepts an https origin and refuses everything else', () => {
    expect(parseMerchantOrigin('https://shop.example')).toEqual({
      ok: true,
      origin: 'https://shop.example',
      host: 'shop.example',
    })
    expect(parseMerchantOrigin('http://shop.example').ok).toBe(false)
    expect(parseMerchantOrigin('not a url').ok).toBe(false)
    expect(parseMerchantOrigin('').ok).toBe(false)
    expect(parseMerchantOrigin(undefined).ok).toBe(false)
  })

  it('allows localhost only as the dev exception', () => {
    expect(parseMerchantOrigin('http://localhost:3000').ok).toBe(true)
  })
})

describe('checkTarget', () => {
  it('refuses explicit URLs: the target is fixed to the merchant origin', () => {
    const m = { origin: 'https://shop.example', host: 'shop.example' }
    expect(checkTarget('https://evil.example', m).ok).toBe(false)
    expect(checkTarget(undefined, m)).toEqual({ ok: true, origin: m.origin, host: m.host })
  })
})

describe('checkHostResolvesPublic', () => {
  it('refuses private, loopback and link-local answers (DNS-rebinding guard)', async () => {
    for (const ip of ['10.0.0.5', '172.16.9.9', '192.168.1.1', '127.0.0.1', '169.254.169.254', '::1', 'fc00::1']) {
      const r = await checkHostResolvesPublic('x.example', async () => [ip])
      expect(r.ok).toBe(false)
    }
  })

  it('accepts a public answer and a failed lookup fails closed', async () => {
    expect(await checkHostResolvesPublic('x.example', async () => ['93.184.216.34'])).toEqual({ ok: true })
    expect((await checkHostResolvesPublic('x.example', async () => [] as string[])).ok).toBe(false)
    expect(
      (
        await checkHostResolvesPublic('x.example', async () => {
          throw new Error('nope')
        })
      ).ok,
    ).toBe(false)
  })
})

describe('shapeCrawled', () => {
  it('emits GET-declared-never-hit rows, deduped, assets stripped', () => {
    const out = shapeCrawled(['/a', '/a?x=1', '/b', '/app.js', '/logo.png', 'relative', '/a'])
    expect(out).toEqual([
      { method: 'GET', path: '/a', provenance: ['crawl'], liveHits: 0 },
      { method: 'GET', path: '/b', provenance: ['crawl'], liveHits: 0 },
    ])
  })

  it('caps output so a huge site cannot blow up the reconcile step', () => {
    const paths = Array.from({ length: 600 }, (_, i) => `/p${i}`)
    expect(shapeCrawled(paths)).toHaveLength(500)
  })
})
