import { describe, expect, it } from 'vitest'
import { validateOnboarding } from '@/lib/onboarding'

describe('validateOnboarding', () => {
  it('normalises blank optional fields to null', () => {
    const r = validateOnboarding({
      businessDescription: '  We sell parts.  ',
      docsUrl: '',
      supportUrl: 'https://example.com/support/',
      privacyUrl: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.businessDescription).toBe('We sell parts.')
    expect(r.value.docsUrl).toBeNull()
    expect(r.value.supportUrl).toBe('https://example.com/support')
    expect(r.value.privacyUrl).toBeNull()
    expect(r.value.termsUrl).toBeUndefined()
  })

  it('refuses non-https public URLs outside localhost', () => {
    const r = validateOnboarding({ docsUrl: 'http://example.com/docs' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors[0]).toContain('must use https')
  })

  it('refuses credentials, queries and fragments in a public URL', () => {
    for (const url of [
      'https://user:pass@example.com/docs',
      'https://example.com/docs?token=x',
      'https://example.com/docs#secret',
    ]) {
      const r = validateOnboarding({ connectorUrl: url })
      expect(r.ok).toBe(false)
    }
  })

  it('refuses an overlong description and an unsafe guide directory', () => {
    const long = validateOnboarding({ businessDescription: 'x'.repeat(281) })
    expect(long.ok).toBe(false)
    const dir = validateOnboarding({ agentGuidesDir: '../secrets' })
    expect(dir.ok).toBe(false)
  })

  it('drops unknown fields instead of storing them', () => {
    const r = validateOnboarding({ docsUrl: 'https://example.com/docs', clientSecret: 'shh' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).not.toHaveProperty('clientSecret')
  })
})
