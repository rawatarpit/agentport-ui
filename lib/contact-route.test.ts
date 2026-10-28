import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The contact route's behaviour at the boundary: honeypot, validation, and the
 * two distinguishable storage failures. The Supabase client is mocked so these
 * tests never need a service key; the real `parsePilotRequest` runs.
 */
const h = vi.hoisted(() => ({
  failCreate: false,
  insertError: null as null | { message: string },
  inserted: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (h.failCreate) throw new Error('Supabase service role is not configured')
    return {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          if (h.insertError) return { error: h.insertError }
          h.inserted.push(row)
          return { error: null }
        },
      }),
    }
  },
}))

import { POST } from '../app/api/contact/route'
import { resetRateLimiter } from '@/lib/rate-limit'

let ip = 0

function post(body: unknown): Request {
  ip += 1
  return new Request('https://console.test/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://console.test',
      'x-nf-client-connection-ip': `203.0.113.${ip}`,
    },
    body: JSON.stringify(body),
  })
}

const valid = {
  name: 'Ada Lovelace',
  email: 'ADA@Example.com',
  company: 'Analytical Engines',
  message: 'We would like an invite.',
}

beforeEach(() => {
  resetRateLimiter()
  h.failCreate = false
  h.insertError = null
  h.inserted = []
  delete process.env.RESEND_API_KEY
})

describe('POST /api/contact', () => {
  it('silently accepts a filled honeypot and writes nothing', async () => {
    const res = await POST(post({ ...valid, website2: 'http://spam.example' }))
    expect(res.status).toBe(200)
    expect(h.inserted).toHaveLength(0)
  })

  it('rejects an invalid submission before touching storage', async () => {
    const res = await POST(post({ ...valid, name: 'A' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toContain('name')
    expect(h.inserted).toHaveLength(0)
  })

  it('reports a missing service role as not_configured, not a generic failure', async () => {
    h.failCreate = true
    const res = await POST(post(valid))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('not_configured')
  })

  it('reports a rejected insert as store_failed', async () => {
    h.insertError = { message: 'permission denied' }
    const res = await POST(post(valid))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('store_failed')
  })

  it('stores one normalised row and answers ok even with no mail key', async () => {
    const res = await POST(post(valid))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; notified: string }
    expect(body.status).toBe('ok')
    expect(body.notified).toBe('not_configured')
    expect(h.inserted).toEqual([
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        company: 'Analytical Engines',
        message: 'We would like an invite.',
        source: 'landing',
      },
    ])
  })
})
