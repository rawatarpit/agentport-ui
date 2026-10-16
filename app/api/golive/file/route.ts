import { createClient } from '@/lib/supabase/server'
import { buildInstallFileFrom } from '@/lib/golive'
import { getDraftDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * GET /api/golive/file — the compiled install file as a download.
 *
 * Same compiler as the PR path (`buildInstallFileFrom` over the durable
 * drafts), second delivery: the merchant whose repo cannot take the App flow
 * yet drops `agentport.config.ts` at their repo root and pushes. One
 * compiler, two deliveries — a file that disagrees with the PR is a fork,
 * and forks drift. Empty drafts refuse with 422 and the reason: a config
 * compiled from nothing is a deny-by-silence nobody reviewed.
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
  const [rules, setup, capabilities] = await Promise.all([
    getDraftDb(t.tenantId, 'rules'),
    getDraftDb(t.tenantId, 'setup'),
    getDraftDb(t.tenantId, 'capabilities'),
  ])
  const file = buildInstallFileFrom({
    rules: rules?.payload,
    setup: setup?.payload,
    capabilities: capabilities?.payload,
  })
  if (!file.ok) {
    return Response.json({ status: 'error', reason: file.reason }, { status: 422 })
  }
  return Response.json({ status: 'ok', path: file.path, content: file.content })
}
