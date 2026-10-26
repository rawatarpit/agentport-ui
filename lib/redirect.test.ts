import { describe, expect, it } from 'vitest'
import { DEFAULT_NEXT_PATH, sanitizeNextPath } from '@/lib/redirect'

describe('sanitizeNextPath', () => {
  it('refuses absolute, protocol-relative, encoded, and backslash redirects', () => {
    for (const raw of [
      '//evil.com',
      'https://evil.com',
      'http://evil.com',
      '/%2f%2fevil.com',
      '/%2F%2Fevil.com',
      '/\\evil.com',
      '/%5cevil.com',
      '/%5C%5Cevil.com',
      '\\\\evil.com',
      'javascript:alert(1)',
      '//evil.com/path',
    ]) {
      expect(sanitizeNextPath(raw), raw).toBe(DEFAULT_NEXT_PATH)
    }
  })

  it('accepts a same-origin relative path and preserves its query', () => {
    expect(sanitizeNextPath('/ok')).toBe('/ok')
    expect(sanitizeNextPath('/reset-password?from=email')).toBe('/reset-password?from=email')
  })

  it('falls back on missing, empty, and non-string values', () => {
    expect(sanitizeNextPath(null)).toBe(DEFAULT_NEXT_PATH)
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH)
    expect(sanitizeNextPath('')).toBe(DEFAULT_NEXT_PATH)
    expect(sanitizeNextPath(42)).toBe(DEFAULT_NEXT_PATH)
  })
})
