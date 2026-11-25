import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  guardStateChange: vi.fn(() => null),
  requiredTenantId: vi.fn(async () => 'tenant-1'),
  saveReport: vi.fn(
    async (_tenantId: string, _value: { profile: { industry: string }; report: unknown }) => ({ id: 'report-1' }),
  ),
  listSavedReports: vi.fn(async () => []),
  deleteSavedReport: vi.fn(async () => true),
  getSavedReport: vi.fn(async () => null),
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

import { POST } from './route'

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
})
