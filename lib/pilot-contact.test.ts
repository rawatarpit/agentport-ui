import { describe, expect, it, vi } from 'vitest'
import { notifyPilotRequest, parsePilotRequest } from './pilot-contact'

describe('parsePilotRequest', () => {
  it('trims fields and lowercases the email', () => {
    const r = parsePilotRequest({
      name: '  Asha  ',
      email: '  Asha@Shop.IN ',
      company: '  Northwind  ',
      message: '  Chatbot takes orders.  ',
    })
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Asha',
        email: 'asha@shop.in',
        company: 'Northwind',
        message: 'Chatbot takes orders.',
      },
    })
  })

  it('turns empty optional fields into null, never empty strings', () => {
    const r = parsePilotRequest({ name: 'Asha', email: 'a@b.co', company: '   ', message: '' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.company).toBeNull()
      expect(r.value.message).toBeNull()
    }
  })

  it('refuses a missing or too-short name', () => {
    expect(parsePilotRequest({ name: 'A', email: 'a@b.co' }).ok).toBe(false)
    expect(parsePilotRequest({ email: 'a@b.co' }).ok).toBe(false)
  })

  it('refuses a malformed email', () => {
    for (const email of ['nope', 'a@b', 'a b@c.co', '', 'a@b.']) {
      expect(parsePilotRequest({ name: 'Asha', email }).ok).toBe(false)
    }
  })

  it('refuses oversized fields', () => {
    expect(parsePilotRequest({ name: 'x'.repeat(121), email: 'a@b.co' }).ok).toBe(false)
    expect(parsePilotRequest({ name: 'Asha', email: 'a@b.co', company: 'x'.repeat(201) }).ok).toBe(false)
    expect(parsePilotRequest({ name: 'Asha', email: 'a@b.co', message: 'x'.repeat(2001) }).ok).toBe(false)
  })

  it('refuses a non-object body', () => {
    expect(parsePilotRequest(null).ok).toBe(false)
    expect(parsePilotRequest('hello').ok).toBe(false)
  })
})

describe('notifyPilotRequest', () => {
  const value = { name: 'Asha', email: 'asha@shop.in', company: 'Northwind', message: null }

  it('is not_configured without a Resend key, and sends nothing', async () => {
    const fetchImpl = vi.fn()
    const result = await notifyPilotRequest(value, { fetch: fetchImpl, env: {} })
    expect(result).toBe('not_configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts to Resend with the founder as recipient and the requester as reply-to', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const result = await notifyPilotRequest(value, {
      fetch: fetchImpl,
      env: { RESEND_API_KEY: 'test-key' },
    })
    expect(result).toBe('sent')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init.body as string) as {
      to: string[]
      reply_to: string
      from: string
      text: string
    }
    expect(body.to).toEqual(['arpit@relayforge.in'])
    expect(body.reply_to).toBe('asha@shop.in')
    expect(body.from).toContain('AgentPort')
    expect(body.text).toContain('Asha')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key')
  })

  it('honours PILOT_NOTIFY_TO', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await notifyPilotRequest(value, {
      fetch: fetchImpl,
      env: { RESEND_API_KEY: 'k', PILOT_NOTIFY_TO: 'founder@example.com' },
    })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((JSON.parse(init.body as string) as { to: string[] }).to).toEqual(['founder@example.com'])
  })

  it('reports failed on a non-2xx response instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const result = await notifyPilotRequest(value, {
      fetch: fetchImpl,
      env: { RESEND_API_KEY: 'k' },
    })
    expect(result).toBe('failed')
  })

  it('reports failed when the request throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    })
    const result = await notifyPilotRequest(value, {
      fetch: fetchImpl,
      env: { RESEND_API_KEY: 'k' },
    })
    expect(result).toBe('failed')
  })
})
