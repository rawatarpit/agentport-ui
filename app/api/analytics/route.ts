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
  const { data: capAct, error: activityError } = await supabase
    .from('v_ledger_capability_activity')
    .select('capability,asked,executed')
    .eq('tenant_id', tenantId)

  // ledger_console_view is the privacy projection (it omits parameters,
  // detail, evaluated figures and error text). Demand rows come from that
  // projection rather than v_ledger_agent_demand so this read cannot widen
  // the columns the console shows.
  const { data: demand, error: demandError } = await supabase
    .from('ledger_console_view')
    .select('agent_id,assurance,capability,decision')
    .eq('tenant_id', tenantId)

  // A failed read is not an empty window. Throw so GET returns the unknown
  // sentinel instead of a fabricated zero.
  if (activityError || demandError) throw new Error('analytics read failed')

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