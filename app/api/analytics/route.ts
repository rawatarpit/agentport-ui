// File: agentport‑ui/app/api/analytics/route.ts
import { NextResponse } from 'next/server'
import { resolveRequestTenant, type RequestTenant } from '@/lib/tenant-server'

type CapActRow = { capability: string; asked: number | null; executed: number | null }
type ConvRow = { decision: string }
type DemandRow = { agent_id: string; asked: number | null; executed: number | null }

/**
 * Server-side fallback for the Evidence screen.
 *
 * The caller's tenant is resolved from the session, never from the query
 * string. The read uses the session client (anon key + RLS), so a tenant can
 * only ever receive its own rows. The old version accepted `tenantId` from the
 * URL and used `service_role`, which would have allowed cross-tenant reads.
 */
async function fetchAnalytics(supabase: RequestTenant['supabase'], tenantId: string) {
  const { data: capAct } = await supabase
    .from('v_ledger_capability_activity')
    .select('capability,asked,executed')
    .eq('tenant_id', tenantId)

  const { data: conv } = await supabase
    .from('v_ledger_conversion')
    .select('decision')
    .eq('tenant_id', tenantId)

  const { data: demand } = await supabase
    .from('v_ledger_agent_demand')
    .select('agent_id,asked,executed')
    .eq('tenant_id', tenantId)

  const askedByCap: Record<string, number> = {}
  const executedByCap: Record<string, number> = {}
  ;(capAct as CapActRow[] | null)?.forEach((r) => {
    askedByCap[r.capability] = (askedByCap[r.capability] || 0) + (r.asked ?? 0)
    executedByCap[r.capability] = (executedByCap[r.capability] || 0) + (r.executed ?? 0)
  })

  const outcomeCounts: Record<string, number> = {}
  ;(conv as ConvRow[] | null)?.forEach((r) => {
    outcomeCounts[r.decision] = (outcomeCounts[r.decision] || 0) + 1
  })

  const agentDemand = ((demand as DemandRow[] | null) || []).map((r) => ({
    agent_id: r.agent_id,
    asked: r.asked ?? 0,
    executed: r.executed ?? 0,
  }))

  return { askedByCap, executedByCap, outcomeCounts, agentDemand }
}

export async function GET(req: Request) {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return NextResponse.json({ error: 'Sign in to read analytics.' }, { status: 401 })
  }

  const requested = new URL(req.url).searchParams.get('tenantId')
  if (requested && requested !== tenant.active.tenantId) {
    return NextResponse.json({ error: 'That workspace is not yours.' }, { status: 403 })
  }

  try {
    const data = await fetchAnalytics(tenant.supabase, tenant.active.tenantId)
    return NextResponse.json(data)
  } catch {
    // Empty sentinel: the UI falls back to “unknown”, never a fake zero.
    return NextResponse.json(
      { askedByCap: {}, executedByCap: {}, outcomeCounts: {}, agentDemand: [] },
      { status: 200 },
    )
  }
}