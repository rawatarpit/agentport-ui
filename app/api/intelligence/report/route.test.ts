import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const h = vi.hoisted(() => ({
  activeStatus: 'active' as 'active' | 'unauthenticated' | 'selection_required',
  refusal: Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 }),
  guard: vi.fn(() => null as Response | null),
  engine: vi.fn(
    async (): Promise<{
      status: 'unavailable'
      reason: 'not_configured' | 'upstream_unavailable'
      checkedAt: string
      message: string
    }> => ({
      status: 'unavailable',
      reason: 'not_configured',
      checkedAt: '2026-11-26T00:00:00.000Z',
      message: 'No intelligence engine is connected. Results remain unknown.',
    }),
  ),
}))

vi.mock('@/lib/tenant-server', () => ({
  resolveRequestTenant: async () => ({ active: { status: h.activeStatus, tenantId: 'tenant-1' } }),
  tenantRefusalResponse: () => h.refusal,
}))
vi.mock('@/lib/request-guard', () => ({ guardStateChange: h.guard }))
vi.mock('@/lib/intelligence/engine-client', () => ({ requestIntelligenceEngine: h.engine }))

import { GET, POST } from './route'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.ts'), 'utf8')
const request = () => new NextRequest('https://console.test/api/intelligence/report', { method: 'POST' })

beforeEach(() => {
  vi.clearAllMocks()
  h.activeStatus = 'active'
  h.refusal = Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  h.guard.mockReturnValue(null)
  h.engine.mockResolvedValue({
    status: 'unavailable',
    reason: 'not_configured',
    checkedAt: '2026-11-26T00:00:00.000Z',
    message: 'No intelligence engine is connected. Results remain unknown.',
  })
})

describe('intelligence report route', () => {
  it('refuses an unauthenticated GET before contacting the engine', async () => {
    h.activeStatus = 'unauthenticated'
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ status: 'error', reason: 'Sign in first.' })
    expect(h.engine).not.toHaveBeenCalled()
  })

  it('refuses a POST without an active workspace before the guard or engine', async () => {
    h.activeStatus = 'selection_required'
    h.refusal = Response.json({ status: 'error', reason: 'Choose a workspace.' }, { status: 409 })
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.engine).not.toHaveBeenCalled()
  })

  it('guards POST with the intelligence state-change bucket', async () => {
    h.guard.mockReturnValueOnce(
      Response.json({ status: 'error', reason: 'Rate limit exceeded.' }, { status: 429 }),
    )
    const req = request()
    const res = await POST(req)
    expect(res.status).toBe(429)
    expect(h.guard).toHaveBeenCalledWith(req, 'intelligence:run')
    expect(h.engine).not.toHaveBeenCalled()
  })

  it('returns not_configured with no report data when no engine is connected', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
      checkedAt: '2026-11-26T00:00:00.000Z',
      message: 'No intelligence engine is connected. Results remain unknown.',
    })
    for (const forbidden of ['sections', 'profile', 'dataMode', 'sources', 'state']) {
      expect(body).not.toHaveProperty(forbidden)
    }
  })

  it('returns upstream_unavailable without claiming a ready or sourced report', async () => {
    h.engine.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'upstream_unavailable',
      checkedAt: '2026-11-26T01:00:00.000Z',
      message: 'The intelligence engine is configured but unavailable. Results remain unknown.',
    })
    const res = await POST(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reason).toBe('upstream_unavailable')
    expect(body.message).toContain('configured but unavailable')
    expect(body.message).not.toContain('No intelligence engine is connected')
    expect(JSON.stringify(body)).not.toMatch(/ready|sourced|illustrative|fixture/i)
  })

  it('requires an active tenant on both reads and writes in source', () => {
    expect(source.match(/requireActiveTenant\(\)/g)).toHaveLength(3)
    expect(source).toContain("guardStateChange(req, 'intelligence:run')")
    expect(source).not.toMatch(/buildSampleReport|sampleReport|process\.env|service_role/)
  })
})
