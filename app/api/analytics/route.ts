// File: agentport‑ui/app/api/analytics/route.ts
import { NextResponse } from 'next/server'
import { resolveRequestTenant, type RequestTenant } from '@/lib/tenant-server'
import {
  aggregateFallback,
  type FallbackActivityRow,
  type FallbackDemandRow,
} from '@/lib/analytics-fallback'

type CapActRow = { capability: string; asked: number | null; executed: number | null }
type DemandRow = {
  agent_id: string
  assurance: string
  capability: string
  decision: string
}

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

  const { data: demand } = await supabase
    .from('v_ledger_agent_demand')
    .select('agent_id,assurance,capability,decision')
    .eq('tenant_id', tenantId)

  return aggregateFallback(
    capAct as FallbackActivityRow[] | null,
    demand as FallbackDemandRow[] | null,
  )
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