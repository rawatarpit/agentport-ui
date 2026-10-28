import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { hardenedCookieOptions } from './cookie-options'
import { checkRateLimit, clientIp, resetRateLimiter } from './rate-limit'
import { guardStateChange, isSameOrigin, RATE_LIMITS } from './request-guard'
import { handleWebhook } from '../broker/src/handlers'
import { loadConfig } from '../broker/src/config'

function request(
  url = 'https://console.test/api/change',
  options: { method?: string; origin?: string; referer?: string; ip?: string } = {},
): Request {
  const headers = new Headers()
  if (options.origin) headers.set('origin', options.origin)
  if (options.referer) headers.set('referer', options.referer)
  if (options.ip) headers.set('x-nf-client-connection-ip', options.ip)
  return new Request(url, { method: options.method ?? 'POST', headers })
}

afterEach(() => {
  resetRateLimiter()
  vi.unstubAllEnvs()
})

describe('CSRF / Origin checks', () => {
  it('allows a same-origin request and a same-origin Referer fallback', () => {
    expect(isSameOrigin(request('https://console.test/api/change', { origin: 'https://console.test' }))).toBe(true)
    expect(
      isSameOrigin(
        request('https://console.test/api/change', { referer: 'https://console.test/ledger?x=1' }),
      ),
    ).toBe(true)
  })

  it('rejects a cross-origin POST with a 403 and a specific reason', async () => {
    const res = guardStateChange(
      request('https://console.test/api/change', { origin: 'https://evil.test', ip: '203.0.113.1' }),
      'me',
    )
    expect(res?.status).toBe(403)
    const body = (await res?.json()) as { reason?: string }
    expect(body.reason).toContain('Cross-origin')
  })

  it('rejects a state change that carries neither Origin nor Referer', () => {
    const res = guardStateChange(request('https://console.test/api/change', { ip: '203.0.113.2' }), 'me')
    expect(res?.status).toBe(403)
  })

  /**
   * Regression: on Netlify `req.url` can carry an internal/deploy host while
   * the public request was for the custom domain. Comparing only
   * `new URL(req.url).origin` rejected real browser posts with a 403.
   */
  it('trusts the public Host header over an internal request URL', () => {
    const req = new Request('http://localhost:3000/api/change', {
      method: 'POST',
      headers: { host: 'agentport.relayforge.in', origin: 'https://agentport.relayforge.in' },
    })
    expect(isSameOrigin(req)).toBe(true)
    expect(guardStateChange(req, 'me')).toBeNull()
  })

  it('falls back to X-Forwarded-Host when Host was rewritten', () => {
    const req = new Request('http://10.0.0.4/api/change', {
      method: 'POST',
      headers: {
        'x-forwarded-host': 'console.test, edge.internal',
        origin: 'https://console.test',
      },
    })
    expect(isSameOrigin(req)).toBe(true)
  })

  it('rejects an Origin that matches neither the Host nor the forwarded host', () => {
    const req = new Request('https://console.test/api/change', {
      method: 'POST',
      headers: { host: 'console.test', origin: 'https://evil.test' },
    })
    expect(isSameOrigin(req)).toBe(false)
  })

  it('does not let a supplied X-Forwarded-Host override a real Host', () => {
    const req = new Request('https://console.test/api/change', {
      method: 'POST',
      headers: {
        host: 'console.test',
        'x-forwarded-host': 'evil.test',
        origin: 'https://evil.test',
      },
    })
    expect(isSameOrigin(req)).toBe(false)
  })
})

describe('rate limiter', () => {
  it('returns 429 with Retry-After after the bucket budget is spent', async () => {
    const limit = RATE_LIMITS['auth:login'].limit
    for (let i = 0; i < limit; i += 1) {
      expect(
        guardStateChange(
          request('https://console.test/api/auth/login', { origin: 'https://console.test', ip: '203.0.113.9' }),
          'auth:login',
        ),
      ).toBeNull()
    }
    const denied = guardStateChange(
      request('https://console.test/api/auth/login', { origin: 'https://console.test', ip: '203.0.113.9' }),
      'auth:login',
    )
    expect(denied?.status).toBe(429)
    expect(Number(denied?.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('ignores caller-supplied forwarding headers', () => {
    const spoofed = new Request('https://console.test/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.88' },
    })
    expect(clientIp(spoofed)).toBe('unknown')
  })

  it('isolates buckets and IPs from each other, and expires by window', () => {
    const options = { limit: 2, windowMs: 1_000 }
    expect(checkRateLimit('login:ip-a', options, 1_000).allowed).toBe(true)
    expect(checkRateLimit('login:ip-a', options, 1_000).allowed).toBe(true)
    expect(checkRateLimit('login:ip-a', options, 1_000).allowed).toBe(false)
    expect(checkRateLimit('login:ip-b', options, 1_000).allowed).toBe(true)
    expect(checkRateLimit('workspace:ip-a', options, 1_000).allowed).toBe(true)
    expect(checkRateLimit('login:ip-a', options, 2_000).allowed).toBe(true)
  })
})

describe('cookie hardening', () => {
  it('is httpOnly, path=/, Lax, and Secure only in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(hardenedCookieOptions({ maxAge: 60 })).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60,
    })
    vi.stubEnv('NODE_ENV', 'development')
    expect(hardenedCookieOptions().secure).toBe(false)
  })
})

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

describe('route coverage', () => {
  it('every state-changing API route runs the shared guard or an HMAC limiter', () => {
    const mutating = routeFiles('app/api').filter((file) =>
      /export async function (POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, 'utf8')),
    )
    expect(mutating.length).toBeGreaterThan(10)
    for (const file of mutating) {
      const src = readFileSync(file, 'utf8')
      const hmacRoute = file.endsWith('/github/webhook/route.ts') || file.endsWith('/sync/route.ts')
      expect(src, `${file} must use the shared guard`).toContain(hmacRoute ? 'enforceRateLimit' : 'guardStateChange')
    }
  })
})

describe('webhook exemption', () => {
  it('still accepts an HMAC-verified delivery without a browser Origin', async () => {
    const secret = 'test-webhook-secret'
    const raw = JSON.stringify({ action: 'created', installation: { id: 42 } })
    const signature = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`
    const config = loadConfig({ ...process.env, GITHUB_WEBHOOK_SECRET: secret })
    const result = handleWebhook({
      config,
      rawBody: raw,
      signature,
      event: 'installation',
      delivery: 'test-delivery',
    })
    expect(result.status).toBe(200)
    expect((result.body as { status: string }).status).toBe('ok')
  })
})
