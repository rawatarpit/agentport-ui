import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Deployment verification is a server fact. The browser may ask for a check,
 * but only this route may record the milestone after the served manifest is
 * proven to belong to the signed-in tenant.
 */
const h = vi.hoisted(() => ({
  resolveTenant: vi.fn(async () => ({
    userId: 'user-1',
    email: null as string | null,
    active: { status: 'active' as const, tenantId: 'tenant-1' },
  })),
  refusal: vi.fn(() => Response.json({ status: 'error', reason: 'No workspace.' }, { status: 403 })),
  normaliseWorkerUrl: vi.fn(() => ({ ok: true as const, url: 'https://governor.test/t/tenant-1' })),
  trackServerEvent: vi.fn(async (_event: unknown) => undefined),
}))

vi.mock('@/lib/tenant-server', () => ({
  resolveRequestTenant: h.resolveTenant,
  tenantRefusalResponse: h.refusal,
}))
vi.mock('@/lib/install-package', () => ({ normaliseWorkerUrl: h.normaliseWorkerUrl }))
vi.mock('@/lib/funnel-events-server', () => ({ trackServerEvent: h.trackServerEvent }))

import { GET } from './route'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  h.trackServerEvent.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/discovery/check', () => {
  it('records deployment_verified only after the manifest tenant matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ tenantId: 'tenant-1' })))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(h.trackServerEvent).toHaveBeenCalledWith({
      event_type: 'deployment_verified',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      source_route: '/api/discovery/check',
      event_id: 'deployment_verified:tenant-1',
    })
  })

  it('does not record deployment_verified for another tenant’s manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ tenantId: 'other-tenant', business: 'Other tenant' })))

    const res = await GET()
    const body = (await res.json()) as { status: string; manifest?: unknown }

    expect(res.status).toBe(200)
    expect(body.status).toBe('error')
    expect(body.manifest).toBeUndefined()
    expect(h.trackServerEvent).not.toHaveBeenCalled()
  })

  it('returns only allowlisted tenant-bound manifest facts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          tenantId: 'tenant-1',
          version: 'v3',
          business: 'My business',
          capabilities: [{ name: 'searchProducts' }],
          generatedAt: '2026-11-27T00:00:00Z',
          policy: { secret: 'must-not-reach-the-browser' },
        }),
      ),
    )

    const res = await GET()
    const body = (await res.json()) as {
      status: string
      manifest: { version?: unknown; tenantId?: unknown; capabilityCount?: unknown; generatedAt?: unknown; business?: unknown; policy?: unknown; capabilities?: unknown }
    }

    expect(body.status).toBe('ok')
    expect(body.manifest.version).toBe('v3')
    expect(body.manifest.tenantId).toBe('tenant-1')
    expect(body.manifest.capabilityCount).toBe(1)
    expect(body.manifest.generatedAt).toBe('2026-11-27T00:00:00Z')
    expect(body.manifest.business).toBeUndefined()
    expect(body.manifest.policy).toBeUndefined()
    expect(body.manifest.capabilities).toBeUndefined()
  })

  it('renders an absent capability list as null, never zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ tenantId: 'tenant-1', version: 'v3' })))

    const res = await GET()
    const body = (await res.json()) as { manifest: { capabilityCount?: unknown } }

    expect(body.manifest.capabilityCount).toBeNull()
  })
})
