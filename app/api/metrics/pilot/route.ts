import { createClient } from '@/lib/supabase/server'
import { buildPilotMetrics } from '@/lib/pilot-metrics'
import { resolveCallerTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * GET /api/metrics/pilot — the plan's pilot metrics for the caller's tenant.
 *
 * Time-to-first-proof, installs, recorded PRs, push recency. Caller-scoped:
 * RLS shows each merchant only their own rows, and the endpoint reports only
 * what those rows prove. Anything unprovable is null (unknown), never zero.
 * Operator-wide aggregates arrive with team roles, not by widening this.
 */
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerTenant({
    getUserId: async () => data.user?.id ?? null,
    listMemberships: async (userId: string) => {
      const { data: rows } = await supabase
        .from('tenant_members')
        .select('tenant_id,role,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
    },
  })
  if (t.tenantId === null) {
    return Response.json({ status: 'error', reason: t.reason }, { status: 401 })
  }
  const tenantId = t.tenantId
  const [home, installs, prs] = await Promise.all([
    supabase.from('v_tenant_home').select('created_at,last_push_at').eq('tenant_id', tenantId).maybeSingle(),
    supabase
      .from('github_installations')
      .select('installation_id,account_login,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
    supabase
      .from('install_pull_requests')
      .select('repo,pr_number,pr_url,recorded_at')
      .eq('tenant_id', tenantId)
      .order('recorded_at', { ascending: true }),
  ])
  const h = (home.data ?? {}) as { created_at?: string | null; last_push_at?: string | null }
  const metrics = buildPilotMetrics({
    tenantCreatedAt: h.created_at ?? null,
    installs: ((installs.data ?? []) as Array<{ installation_id: number; account_login: string; created_at: string }>).map(
      (r) => ({ installationId: r.installation_id, accountLogin: r.account_login, receivedAt: r.created_at }),
    ),
    prs: ((prs.data ?? []) as Array<{ repo: string; pr_number: number; pr_url: string; recorded_at: string }>).map(
      (r) => ({ repo: r.repo, number: r.pr_number, url: r.pr_url, recordedAt: r.recorded_at }),
    ),
    lastPushAt: h.last_push_at ?? null,
  })
  return Response.json({ status: 'ok', tenantId, metrics })
}
