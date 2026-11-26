import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type Result = { data: unknown; error: { message: string } | null }

const mocks = vi.hoisted(() => ({
  sessionFrom: vi.fn(),
  adminFrom: vi.fn(),
  resolveCallerRole: vi.fn(async () => ({ tenantId: 'tenant-1', role: 'owner' })),
  readSelectedTenantId: vi.fn(() => 'tenant-1'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: mocks.sessionFrom,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }))
vi.mock('@/lib/tenant', () => ({ resolveCallerRole: mocks.resolveCallerRole }))
vi.mock('@/lib/tenant-server', () => ({
  readSelectedTenantId: mocks.readSelectedTenantId,
  tenantRefusalResponse: () => Response.json({ status: 'error', reason: 'no tenant' }, { status: 403 }),
}))

import { GET } from './route'

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  in: (column: string, values: string[]) => Query
  maybeSingle: () => Promise<Result>
  then: (resolve: (result: Result) => unknown) => unknown
}

function builder(result: Result, log: Array<{ select: string | null; eqs: Array<[string, string]>; in: string[] }>): Query {
  const entry = { select: null as string | null, eqs: [] as Array<[string, string]>, in: [] as string[] }
  log.push(entry)
  const q: Query = {
    select: (columns) => {
      entry.select = columns
      return q
    },
    eq: (column, value) => {
      entry.eqs.push([column, value])
      return q
    },
    in: (_column, values) => {
      entry.in = values
      return q
    },
    maybeSingle: async () => result,
    then: (resolve) => resolve(result),
  }
  return q
}

describe('sector benchmark read boundary', () => {
  const sessionLog: Array<{ select: string | null; eqs: Array<[string, string]>; in: string[] }> = []
  const adminLog: Array<{ select: string | null; eqs: Array<[string, string]>; in: string[] }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    sessionLog.length = 0
    adminLog.length = 0

    mocks.sessionFrom.mockImplementation(() =>
      builder({ data: { sector: 'bank', industry: 'finance' }, error: null }, sessionLog),
    )
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === 'tenant_metadata') {
        return builder({ data: [{ tenant_id: 'tenant-1' }], error: null }, adminLog)
      }
      return builder(
        { data: [{ tenant_id: 'tenant-1', event_count: 3 }], error: null },
        adminLog,
      )
    })
  })

  it('scopes the caller read by session RLS and exposes only the coarse cross-tenant projection', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      percentileBand: string | null
      peerCount: number | null
      medianEvents: number | null
      percentile: number | null
    }
    expect(body.status).toBe('ok')
    expect(body.peerCount).toBeNull()
    expect(body.medianEvents).toBeNull()
    expect(body.percentile).toBeNull()
    expect(sessionLog[0].select).toBe('sector, industry')
    expect(sessionLog[0].eqs).toEqual([['tenant_id', 'tenant-1']])
    expect(adminLog[0].select).toBe('tenant_id')
    expect(adminLog[0].eqs).toEqual([['sector', 'bank']])
    expect(adminLog[1].select).toBe('tenant_id, event_count')
    expect(adminLog[1].in).toEqual(['tenant-1'])
  })

  it('returns 502 when the server reader fails instead of claiming no sector', async () => {
    mocks.sessionFrom.mockImplementation(() =>
      builder({ data: null, error: { message: 'read failed' } }, sessionLog),
    )
    const res = await GET()
    expect(res.status).toBe(502)
    const body = (await res.json()) as { status: string; reason: string }
    expect(body.status).toBe('error')
    expect(body.reason).toContain('Could not read')
  })
})
