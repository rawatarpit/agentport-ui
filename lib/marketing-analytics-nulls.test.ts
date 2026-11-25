import { describe, expect, it } from 'vitest'
import { fetchMarketingAnalytics } from '../app/api/marketing/analytics/route'
import type { RequestTenant } from '@/lib/tenant-server'

type QueryResult = { data: unknown; error: null }
type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  order: (column: string, options: { ascending: boolean }) => Query
  limit: (count: number) => Query
  maybeSingle: () => Promise<QueryResult>
  then: (resolve: (result: QueryResult) => unknown) => void
}

type ReadLog = Array<{ table: string; columns: string | null; eqs: Array<[string, string]> }>

function fakeSupabase(tables: Record<string, unknown[]>, log: ReadLog = []): RequestTenant['supabase'] {
  const from = (table: string): Query => {
    const data = tables[table] ?? []
    const entry = { table, columns: null as string | null, eqs: [] as Array<[string, string]> }
    log.push(entry)
    const query: Query = {
      select: (columns) => {
        entry.columns = columns
        return query
      },
      eq: (column, value) => {
        entry.eqs.push([column, value])
        return query
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      then: (resolve) => {
        resolve({ data, error: null })
      },
    }
    return query
  }
  return { from } as unknown as RequestTenant['supabase']
}

const DEMAND_ROW = {
  agent_id: 'chatgpt-1',
  agent_label: null,
  agent_label_source: null,
  assurance: 'unverified',
  capability: 'orders.read',
  decision: 'allow',
  result: 'ok',
  rule: '',
}

describe('marketing analytics null propagation', () => {
  it('keeps a window unknown when a contributing count is null', async () => {
    const log: ReadLog = []
    const data = await fetchMarketingAnalytics(
      fakeSupabase(
        {
          v_ledger_capability_activity: [
            {
              capability: 'orders.read',
              window_start: '2026-11-16',
              asked: 2,
              denied: null,
              held: 0,
              approved: 2,
              executed: null,
            },
          ],
          ledger_console_view: [DEMAND_ROW],
        },
        log,
      ),
      'tenant',
    )

    expect(log).toHaveLength(7)
    for (const read of log) {
      expect(read.eqs).toContainEqual(['tenant_id', 'tenant'])
      const columns = read.columns ?? ''
      for (const forbidden of ['parameters', 'detail', 'evaluated', 'amount', 'email', 'phone', 'cvv', 'password', 'secret']) {
        expect(columns).not.toContain(forbidden)
      }
    }

    expect(data.kpis.totalRequests).toBe(2)
    expect(data.kpis.totalExecuted).toBeNull()
    expect(data.kpis.totalRefused).toBeNull()
    expect(data.funnel.map((f) => f.count)).toEqual([2, 2, null])
    expect(data.capabilities[0].executed).toBeNull()
    expect(data.capabilities[0].conversionRate).toBeNull()
    expect(data.weekly[0].executed).toBeNull()
    expect(data.sources[0]).toMatchObject({
      label: 'Inferred ChatGPT',
      evidence: 'agent_id_heuristic',
    })
  })

  it('renders no stored window as unknown, not healthy zero', async () => {
    const data = await fetchMarketingAnalytics(fakeSupabase({}), 'tenant')

    expect(data.kpis.totalRequests).toBeNull()
    expect(data.kpis.totalAgents).toBeNull()
    expect(data.funnel.map((f) => f.count)).toEqual([null, null, null])
    expect(data.sources).toEqual([])
  })
})
