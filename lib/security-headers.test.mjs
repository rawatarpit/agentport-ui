import { describe, expect, it } from 'vitest'
import {
  contentSecurityPolicyReportOnly,
  securityHeaderGroups,
  securityHeaders,
} from './security-headers.mjs'

function asMap(headers) {
  return new Map(headers.map(({ key, value }) => [key, value]))
}

describe('security headers', () => {
  it('sets the static headers on every path, pages and API alike', () => {
    const groups = securityHeaderGroups({ production: false })
    expect(groups).toHaveLength(1)
    expect(groups[0].source).toBe('/:path*')
    const headers = asMap(groups[0].headers)
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(true)
  })

  it('emits HSTS only in production', () => {
    const production = asMap(securityHeaders({ production: true }))
    expect(production.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
    expect(asMap(securityHeaders({ production: false })).has('Strict-Transport-Security')).toBe(false)
  })

  it('keeps the report-only CSP restrictive where it can be', () => {
    const policy = contentSecurityPolicyReportOnly({ supabaseUrl: 'https://demo.supabase.co' })
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("img-src 'self' data:")
    expect(policy).toContain("connect-src 'self' https://demo.supabase.co wss://demo.supabase.co https://api.github.com")
  })
})
