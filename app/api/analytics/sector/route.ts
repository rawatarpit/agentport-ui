import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
 * Safety:
 *   * Reads via createAdminClient() (service_role, server-side only) because
 *     sector aggregation requires reading across tenants.
 *   * Returns only counts and medians — never tenant names, tenant IDs, PII,
 *     amounts, or raw rows.
 *   * If this tenant has not set a sector, returns hasSector: false.
 */
export async function GET() {
  const { t } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)

  // This tenant's sector (read via session client, RLS-scoped).
  const { data: meta } = await createClient()
    .from('tenant_metadata')
    .select('sector, industry')
    .eq('tenant_id', t.tenantId)
    .maybeSingle()

  const sector = meta?.sector ?? null
  const industry = meta?.industry ?? null

  if (!sector) {
    return NextResponse.json({
      status: 'ok',
      hasSector: false,
      sector: null,
      industry: null,
      peerCount: null,
      medianEvents: null,
      myEvents: null,
      percentile: null,
    })
  }

  const admin = createAdminClient()

  // All tenant IDs in this sector (service_role: cross-tenant read, aggregates only).
  const { data: peers, error: peersError } = await admin
    .from('tenant_metadata')
    .select('tenant_id')
    .eq('sector', sector)

  if (peersError) {
    console.error('sector peer read failed', peersError)
    return NextResponse.json(
      { status: 'error', reason: 'Could not read sector peers.' },
      { status: 502 },
    )
  }

  const peerTenantIds = peers.map((p) => p.tenant_id)

  // Event counts for all peers in this sector.
  const { data: homes, error: homesError } = await admin
    .from('v_tenant_home')
    .select('tenant_id, event_count')
    .in('tenant_id', peerTenantIds)

  if (homesError) {
    console.error('sector home read failed', homesError)
    return NextResponse.json(
      { status: 'error', reason: 'Could not read sector activity.' },
      { status: 502 },
    )
  }

  const eventCounts = homes
    .map((h) => h.event_count)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
    .sort((a, b) => a - b)

  const peerCount = eventCounts.length
  const myRow = homes.find((h) => h.tenant_id === t.tenantId)
  const myEvents = myRow?.event_count ?? null

  // Median and percentile computed in JS — the DB returns only raw counts.
  let medianEvents: number | null = null
  let percentile: number | null = null

  if (eventCounts.length > 0) {
    const mid = Math.floor(eventCounts.length / 2)
    medianEvents =
      eventCounts.length % 2 === 0
        ? (eventCounts[mid - 1] + eventCounts[mid]) / 2
        : eventCounts[mid]

    if (myEvents !== null) {
      const belowOrEqual = eventCounts.filter((c) => c <= myEvents).length
      percentile = Math.round((belowOrEqual / eventCounts.length) * 100)
    }
  }

  return NextResponse.json({
    status: 'ok',
    hasSector: true,
    sector,
    industry,
    peerCount,
    medianEvents,
    myEvents,
    percentile,
  })
}
