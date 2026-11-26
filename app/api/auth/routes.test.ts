import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth routes at the HTTP boundary: the email callback is built from the
 * request the server received, not from caller-supplied redirect material, and
 * a Supabase error never becomes merchant-visible copy.
 */
const h = vi.hoisted(() => ({
  signUp: vi.fn(
    async (_args: {
      email: string
      password: string
      options: { data?: { business_name?: string }; emailRedirectTo?: string }
    }) => ({ data: { session: null as string | null }, error: null as { message: string } | null }),
  ),
  signIn: vi.fn(async (_args: { email: string; password: string }) => ({
    error: null as { message: string } | null,
  })),
  guard: vi.fn(() => null as Response | null),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { signUp: h.signUp, signInWithPassword: h.signIn } }),
}))

vi.mock('@/lib/request-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/request-guard')>('@/lib/request-guard')
  return { ...actual, guardStateChange: h.guard }
})

import { POST as login } from './login/route'
import { POST as signup } from './signup/route'

const validSignup = {
  email: 'ada@example.com',
  password: 'a-long-enough-password',
  businessName: 'Analytical Engines',
}

function post(body: unknown, options: { url?: string; origin?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.origin) headers.origin = options.origin
  return new Request(options.url ?? 'https://console.test/api/auth/signup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function redirectTo(): string {
  expect(h.signUp).toHaveBeenCalledTimes(1)
  return h.signUp.mock.calls[0][0].options.emailRedirectTo ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  h.signUp.mockResolvedValue({ data: { session: null }, error: null })
  h.signIn.mockResolvedValue({ error: null })
  h.guard.mockReturnValue(null)
})

describe('POST /api/auth/signup email redirect', () => {
  it('derives the redirect origin from the request URL when no origin header is present', async () => {
    const res = await signup(post({ ...validSignup, next: '/setup' }))
    expect(res.status).toBe(200)
    expect(redirectTo()).toBe('https://console.test/auth/callback?next=%2Fsetup')
  })

  it('uses a same-origin public Origin when the request URL carries an internal host', async () => {
    // Netlify can rewrite req.url to a deploy host; the guard has already
    // matched this Origin to the public Host, so the confirmation email must
    // point at the public console, not the internal URL.
    const req = post({ ...validSignup, next: '/setup?from=preview' }, {
      url: 'http://10.0.0.4/api/auth/signup',
      origin: 'https://agentport.relayforge.in',
    })
    const res = await signup(req)
    expect(res.status).toBe(200)
    expect(redirectTo()).toBe(
      'https://agentport.relayforge.in/auth/callback?next=%2Fsetup%3Ffrom%3Dpreview',
    )
  })

  it('falls back to /setup instead of using an absolute next', async () => {
    const res = await signup(post({ ...validSignup, next: 'https://evil.test/steal' }))
    expect(res.status).toBe(200)
    expect(redirectTo()).toBe('https://console.test/auth/callback?next=%2Fsetup')
  })

  it('falls back to /setup instead of using a protocol-relative next', async () => {
    const res = await signup(post({ ...validSignup, next: '//evil.test/steal' }))
    expect(res.status).toBe(200)
    expect(redirectTo()).toBe('https://console.test/auth/callback?next=%2Fsetup')
  })

  it('ignores an origin supplied in the body', async () => {
    const res = await signup(post({ ...validSignup, next: '/setup', origin: 'https://evil.test' }))
    expect(res.status).toBe(200)
    expect(redirectTo()).not.toContain('evil.test')
  })
})

describe('auth routes keep provider errors generic', () => {
  it('does not echo a raw Supabase signup error', async () => {
    h.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'relation "tenant_private" does not exist' },
    })
    const res = await signup(post(validSignup))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.reason).toBe('Signup could not be completed with those details.')
    expect(JSON.stringify(body)).not.toContain('tenant_private')
  })

  it('does not echo a raw Supabase sign-in error', async () => {
    h.signIn.mockResolvedValueOnce({ error: { message: 'user "ada@example.com" is suspended' } })
    const res = await login(post({ email: 'ada@example.com', password: 'wrong-password' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.reason).toBe('Sign-in could not be completed with those details.')
    expect(JSON.stringify(body)).not.toContain('ada@example.com')
  })
})
