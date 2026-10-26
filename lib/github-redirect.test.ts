import { describe, expect, it } from 'vitest'
import { DASHBOARD_ORIGIN, githubFailureUrl, githubReturnUrl } from '@/lib/github-redirect'

describe('githubReturnUrl', () => {
  it('returns to the dashboard with the machine reason', () => {
    const url = new URL(githubReturnUrl('install-state-missing'))
    expect(url.origin).toBe(DASHBOARD_ORIGIN)
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('github')).toBe('install-state-missing')
    expect(url.searchParams.get('installation_id')).toBeNull()
  })

  it('carries a validated installation id without making it authority', () => {
    const url = new URL(githubReturnUrl('installed', 12345))
    expect(url.searchParams.get('github')).toBe('installed')
    expect(url.searchParams.get('installation_id')).toBe('12345')
  })

  it('refuses an invalid installation id instead of inventing a URL', () => {
    expect(() => githubReturnUrl('installed', 0)).toThrow()
    expect(() => githubReturnUrl('installed', -1)).toThrow()
    expect(() => githubReturnUrl('installed', 1.5)).toThrow()
  })
})

describe('githubFailureUrl', () => {
  it('returns failures to the diagnostics surface with the reason', () => {
    const url = new URL(githubFailureUrl('install-state-invalid'))
    expect(url.origin).toBe(DASHBOARD_ORIGIN)
    expect(url.pathname).toBe('/connect')
    expect(url.searchParams.get('github')).toBe('install-state-invalid')
  })
})
