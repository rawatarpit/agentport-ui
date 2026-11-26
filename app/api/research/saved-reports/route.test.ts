import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Failure = { ok: false; reason: string }

const mocks = vi.hoisted(() => ({
  guardStateChange: vi.fn((): Response | null => null),
  requiredTenantId: vi.fn(async () => 'tenant-1'),
  saveReport: vi.fn(
    async (_tenantId: string, _value: { profile: { industry: string }; report: unknown }) => ({ ok: true as const, value: { id: 'report-1' } }),
  ),
  listSavedReports: vi.fn(
    async (): Promise<{ ok: true; value: unknown[] } | Failure> => ({ ok: true, value: [] }),
  ),
  deleteSavedReport: vi.fn(
    async (): Promise<{ ok: true; value: { deleted: boolean } } | Failure> => ({
      ok: true,
      value: { deleted: true },
    }),
  ),
  getSavedReport: vi.fn(
    async (): Promise<{ ok: true; value: null } | Failure> => ({ ok: true, value: null }),
  ),
  resolveRequestTenant: vi.fn(async () => ({
    userId: 'user-1',
    active: { status: 'active' as const, tenantId: 'tenant-1' },
  })),
  trackServerEvent: vi.fn(async () => undefined),
  buildSourcedReport: vi.fn(async () => ({ sections: [{ id: 'server', title: 'Server report' }] })),
}))

vi.mock('@/lib/request-guard', () => ({ guardStateChange: mocks.guardStateChange }))
vi.mock('@/lib/research/saved-reports', () => ({
  requiredTenantId: mocks.requiredTenantId,
  saveReport: mocks.saveReport,
  listSavedReports: mocks.listSavedReports,
  deleteSavedReport: mocks.deleteSavedReport,
  getSavedReport: mocks.getSavedReport,
}))
vi.mock('@/lib/tenant-server', () => ({ resolveRequestTenant: mocks.resolveRequestTenant }))
vi.mock('@/lib/funnel-events-server', () => ({ trackServerEvent: mocks.trackServerEvent }))
vi.mock('@/lib/intelligence/research-report', () => ({ buildSourcedReport: mocks.buildSourcedReport }))

import { DELETE, GET, POST } from './route'

describe('saved report POST body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates the report on the server and ignores a client-supplied body', async () => {
    const req = new NextRequest('https://agentport.test/api/research/saved-reports', {
      method: 'POST',
      body: JSON.stringify({
        profile: { industry: 'Retail', objectives: ['Grow'] },
        report: { sections: [{ id: 'attacker', title: 'Client lie' }] },
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mocks.saveReport).toHaveBeenCalledTimes(1)
    const [tenantId, saved] = mocks.saveReport.mock.calls[0]
    expect(tenantId).toBe('tenant-1')
    expect(saved.profile.industry).toBe('Retail')
    expect(saved.report).toEqual({ sections: [{ id: 'server', title: 'Server report' }] })
    expect(JSON.stringify(saved)).not.toContain('Client lie')
  })

  it('returns 502 for list errors instead of an empty success shape', async () => {
    mocks.listSavedReports.mockResolvedValueOnce({ ok: false, reason: 'db' })
    const req = new NextRequest('https://agentport.test/api/research/saved-reports', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ status: 'error', reason: 'Unable to load saved reports.' })
    expect(body).not.toHaveProperty('reports')
  })

  it('returns 502 for a saved-report read error instead of a missing report', async () => {
    mocks.getSavedReport.mockResolvedValueOnce({ ok: false, reason: 'db' })
    const req = new NextRequest('https://agentport.test/api/research/saved-reports?id=report-1', {
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ status: 'error', reason: 'Unable to load saved reports.' })
  })

  it('returns the same 404 for any report the caller cannot see', async () => {
    const visible = { status: 'error', reason: 'Saved report not found.' }
    for (const id of ['other-tenant-report', 'never-created']) {
      mocks.getSavedReport.mockResolvedValueOnce({ ok: true, value: null })
      const req = new NextRequest(`https://agentport.test/api/research/saved-reports?id=${id}`, {
        method: 'GET',
      })
      const res = await GET(req)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(visible)
      expect(mocks.getSavedReport).toHaveBeenCalledWith('tenant-1', id)
    }
  })

  it('refuses a collection DELETE before touching the store', async () => {
    mocks.guardStateChange.mockReturnValueOnce(
      Response.json({ status: 'error', reason: 'Cross-origin request refused.' }, { status: 403 }),
    )
    const req = new NextRequest('https://agentport.test/api/research/saved-reports?id=report-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(403)
    expect(mocks.deleteSavedReport).not.toHaveBeenCalled()
  })

  it('guards collection DELETE and returns uniform not-found for zero-row delete', async () => {
    mocks.deleteSavedReport.mockResolvedValueOnce({ ok: true, value: { deleted: false } })
    const req = new NextRequest('https://agentport.test/api/research/saved-reports?id=missing', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(mocks.guardStateChange).toHaveBeenCalledWith(req, 'research:saved-reports:write')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', reason: 'No visible report to delete.' })
  })
})
