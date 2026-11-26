import { createClient } from '@/lib/supabase/server'
import { readSectorBenchmark } from '@/lib/analytics-sector-read'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function caller() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerRole({
    getUserId: async () => data.user?.id ?? null,
    selectedTenantId: readSelectedTenantId(),
    listMemberships: async (userId: string) => {
      const { data: rows } = await supabase
        .from('tenant_members')
        .select('tenant_id,role,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
    },
    getRole: async (tenantId: string) => {
      const { data: role } = await supabase.rpc('agentport_tenant_role', { target_tenant: tenantId })
      return typeof role === 'string' ? role : null
    },
  })
  return { supabase, t, userId: data.user?.id ?? null }
}

/**
 * GET /api/analytics/sector
 *
 * Sector benchmark: aggregate-only comparison of this tenant's event volume
 * against other tenants in the same sector.
 *
 * Safety (owned by `readSectorBenchmark`, server-only):
 *   * Caller metadata is read with the RLS session client; the cross-tenant
 *     peer aggregate uses service_role only inside the server reader.
 *   * Returns only the caller's own count and a coarse band — never tenant
 *     names, tenant IDs, PII, amounts, exact medians, cohort sizes or raw rows.
 *     Exact aggregates are reversible when a caller can join a small cohort.
 *   * Only the reviewed setup vocabulary is accepted as a cohort key.
 *   * A failed read returns 502; it is never reported as "not set".

 */
export async function GET() {
  const { t } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)

  const read = await readSectorBenchmark(t.tenantId)
  if (read === null) {
    return NextResponse.json(
      { status: 'error', reason: 'Could not read the sector benchmark.' },
      { status: 502 },
    )
  }

  return NextResponse.json(read)
}
