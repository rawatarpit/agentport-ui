import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deleteSavedReport, getSavedReport, listSavedReports, saveReport } from './saved-reports'

type QueryCall = { table: string; operation: string; filters: Array<[string, string]>; insert: boolean }

const h = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  rows: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
  error: null as { message: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => {
      const call: QueryCall = { table, operation: '', filters: [], insert: false }
      h.calls.push(call)
      const builder: Record<string, unknown> = {}
      const chain = (operation: string) => () => {
        call.operation = operation
        return builder
      }
      builder.select = chain('select')
      builder.delete = chain('delete')
      builder.order = chain('order')
      builder.eq = (column: string, value: string) => {
        call.filters.push([column, value])
        return builder
      }
      builder.insert = (row: Record<string, unknown>) => {
        call.operation = 'insert'
        call.insert = true
        h.inserted.push(row)
        return builder
      }
      builder.maybeSingle = async () => ({ data: h.rows[0] ?? null, error: h.error })
      builder.single = async () => ({ data: h.rows[0] ?? null, error: h.error })
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: h.rows, error: h.error }).then(resolve)
      return builder
    },
  }),
}))

vi.mock('@/lib/tenant-server', () => ({ resolveRequestTenant: async () => ({ active: { status: 'active' } }) }))

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'saved-reports.ts'), 'utf8')

beforeEach(() => {
  h.calls = []
  h.rows = []
  h.inserted = []
  h.error = null
})

describe('saved report reads stay inside the caller tenant', () => {
  it('scopes list, read, save and delete to the caller tenant through the session client', async () => {
    const profile = { industry: 'Retail' } as Parameters<typeof saveReport>[1]['profile']
    h.rows = [{ id: 'report-1' }]
    await listSavedReports('tenant-1')
    await getSavedReport('tenant-1', 'report-1')
    await deleteSavedReport('tenant-1', 'report-1')
    await saveReport('tenant-1', { profile })

    expect(h.calls).toHaveLength(4)
    for (const call of h.calls) expect(call.table).toBe('saved_reports')
    for (const call of h.calls.filter((item) => !item.insert)) {
      expect(call.filters).toContainEqual(['tenant_id', 'tenant-1'])
    }
    expect(h.calls[1]?.filters).toContainEqual(['id', 'report-1'])
    expect(h.calls[2]?.filters).toContainEqual(['id', 'report-1'])
    expect(h.inserted[0]).toMatchObject({ tenant_id: 'tenant-1' })
    expect(src).toContain('createClient()')
    expect(src).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('reports a zero-row delete as not deleted instead of a success', async () => {
    h.rows = []
    expect(await deleteSavedReport('tenant-1', 'other-tenant-report')).toEqual({
      ok: true,
      value: { deleted: false },
    })
  })

  it('reports a delete failure instead of a success', async () => {
    h.error = { message: 'permission denied' }
    expect((await deleteSavedReport('tenant-1', 'report-1')).ok).toBe(false)
  })

  it('reports a list failure instead of an empty report list', async () => {
    h.error = { message: 'relation does not exist' }
    expect(await listSavedReports('tenant-1')).toEqual({
      ok: false,
      reason: 'Unable to load saved reports.',
    })
  })

  it('distinguishes a row hidden by RLS from a failed read', async () => {
    expect(await getSavedReport('tenant-1', 'other-tenant-report')).toEqual({ ok: true, value: null })
    h.error = { message: 'connection lost' }
    expect((await getSavedReport('tenant-1', 'report-1')).ok).toBe(false)
  })
})
