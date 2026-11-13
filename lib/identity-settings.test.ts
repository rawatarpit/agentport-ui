import { describe, expect, it } from 'vitest'
import {
  isSessionScope,
  parseIdentitySettings,
  parseUserId,
  parseUserScope,
} from './identity-settings'

describe('isSessionScope', () => {
  it('accepts the three scopes the governor understands', () => {
    expect(isSessionScope('read')).toBe(true)
    expect(isSessionScope('write')).toBe(true)
    expect(isSessionScope('full')).toBe(true)
  })

  it('refuses anything that could widen authority by typo', () => {
    expect(isSessionScope('admin')).toBe(false)
    expect(isSessionScope('READ')).toBe(false)
    expect(isSessionScope(undefined)).toBe(false)
  })
})

describe('parseIdentitySettings', () => {
  it('normalises a full https configuration', () => {
    const parsed = parseIdentitySettings({
      verifyUrl: 'https://site.example/functions/v1/agent-identity',
      jwksUrl: 'https://site.example/.well-known/jwks.json',
      issuer: 'https://site.example/auth/v1',
      audience: 'authenticated',
      defaultScope: 'write',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        verifyUrl: 'https://site.example/functions/v1/agent-identity',
        jwksUrl: 'https://site.example/.well-known/jwks.json',
        issuer: 'https://site.example/auth/v1',
        audience: 'authenticated',
        defaultScope: 'write',
      },
    })
  })

  it('defaults to read when the scope is omitted', () => {
    const parsed = parseIdentitySettings({ verifyUrl: 'https://site.example/verify' })
    expect(parsed.ok && parsed.value.defaultScope).toBe('read')
  })

  it('treats an empty string as "not configured"', () => {
    const parsed = parseIdentitySettings({
      verifyUrl: '  ',
      jwksUrl: '',
      issuer: ' ',
      audience: '',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        verifyUrl: null,
        jwksUrl: null,
        issuer: null,
        audience: null,
        defaultScope: 'read',
      },
    })
  })

  it('allows http only on loopback', () => {
    expect(parseIdentitySettings({ verifyUrl: 'http://localhost:8787/verify' }).ok).toBe(true)
    expect(parseIdentitySettings({ verifyUrl: 'http://127.0.0.1:8787/verify' }).ok).toBe(true)
    expect(parseIdentitySettings({ verifyUrl: 'http://site.example/verify' }).ok).toBe(false)
  })

  it('refuses non-https and malformed URLs', () => {
    expect(parseIdentitySettings({ verifyUrl: 'ftp://site.example/verify' }).ok).toBe(false)
    expect(parseIdentitySettings({ verifyUrl: 'not a url' }).ok).toBe(false)
    expect(parseIdentitySettings({ jwksUrl: 'javascript:alert(1)' }).ok).toBe(false)
  })

  it('refuses an unknown default scope rather than widening', () => {
    const parsed = parseIdentitySettings({ defaultScope: 'admin' })
    expect(parsed.ok).toBe(false)
  })

  it('refuses a non-object body', () => {
    expect(parseIdentitySettings(null).ok).toBe(false)
    expect(parseIdentitySettings('verify').ok).toBe(false)
  })
})

describe('parseUserId', () => {
  it('trims and accepts a subject', () => {
    expect(parseUserId('  user-9  ')).toEqual({ ok: true, value: 'user-9' })
  })

  it('refuses blank, oversized and control-character ids', () => {
    expect(parseUserId('   ').ok).toBe(false)
    expect(parseUserId('x'.repeat(201)).ok).toBe(false)
    expect(parseUserId('user\n9').ok).toBe(false)
    expect(parseUserId(42).ok).toBe(false)
  })
})

describe('parseUserScope', () => {
  it('accepts a user and scope', () => {
    expect(parseUserScope({ userId: 'user-9', scope: 'read' })).toEqual({
      ok: true,
      value: { userId: 'user-9', scope: 'read' },
    })
  })

  it('refuses an unknown scope', () => {
    expect(parseUserScope({ userId: 'user-9', scope: 'admin' }).ok).toBe(false)
  })

  it('refuses a missing user', () => {
    expect(parseUserScope({ scope: 'read' }).ok).toBe(false)
  })
})
