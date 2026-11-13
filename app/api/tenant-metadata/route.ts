import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardStateChange } from '@/lib/request-guard'
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

export async function GET() {
  const { t } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)

  // Read via the session client: RLS scopes to this tenant's row only.
  const { data, error } = await createClient()
    .from('tenant_metadata')
    .select('industry,sector')
    .eq('tenant_id', t.tenantId)
    .maybeSingle()

  if (error) {
    console.error('tenant metadata read failed', error)
    return NextResponse.json(
      { status: 'error', reason: 'Could not read tenant metadata.' },
      { status: 502 },
    )
  }

  return NextResponse.json({
    status: 'ok',
    industry: data?.industry ?? null,
    sector: data?.sector ?? null,
  })
}

export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'tenant-metadata:write')
  if (guarded) return guarded

  const { t } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  if (t.role !== 'owner' && t.role !== 'admin') {
    return NextResponse.json(
      { status: 'error', reason: 'Only the owner or an admin can set tenant metadata.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ status: 'error', reason: 'Body must be a JSON object.' }, { status: 400 })
  }

  const industry = typeof body.industry === 'string' ? body.industry.trim() : null
  const sector = typeof body.sector === 'string' ? body.sector.trim() : null

  if ((industry !== null && industry.length > 100) || (sector !== null && sector.length > 100)) {
    return NextResponse.json(
      { status: 'error', reason: 'Industry and sector must be under 100 characters.' },
      { status: 400 },
    )
  }

  // Upsert via service role: the route has already proven caller is owner/admin
  // of this tenant, so the write is safe.
  const admin = createAdminClient()
  const { error } = await admin
    .from('tenant_metadata')
    .upsert(
      { tenant_id: t.tenantId, industry, sector, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    )

  if (error) {
    console.error('tenant metadata write failed', error)
    return NextResponse.json(
      { status: 'error', reason: 'Could not save tenant metadata.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ status: 'ok', industry, sector })
}
