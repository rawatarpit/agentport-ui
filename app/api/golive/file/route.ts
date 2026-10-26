import { createClient } from '@/lib/supabase/server'
import { buildInstallPackageFrom, buildManualInstaller, normaliseWorkerUrl } from '@/lib/install-package'
import { getDraftDb, getTenantProfileDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/golive/file — the discovery package as one runnable installer.
 *
 * Same builder as the PR path, second delivery: a merchant whose repo cannot
 * take the App flow yet downloads `agentport-install.mjs`, runs it at the repo
 * root, reviews the diff and commits. It writes discovery files only. The
 * hosted governor still makes every decision.
 */
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerTenant({
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
  })
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  const [rules, setup, capabilities, profile] = await Promise.all([
    getDraftDb(t.tenantId, 'rules'),
    getDraftDb(t.tenantId, 'setup'),
    getDraftDb(t.tenantId, 'capabilities'),
    getTenantProfileDb(t.tenantId),
  ])
  if (!profile || !profile.businessName) {
    return Response.json(
      { status: 'error', reason: 'Set the business name before downloading an install package.' },
      { status: 422 },
    )
  }
  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', t.tenantId)
  if (!worker.ok) {
    return Response.json({ status: 'error', reason: worker.reason }, { status: 503 })
  }
  const pkg = buildInstallPackageFrom({
    drafts: {
      rules: rules?.payload,
      setup: setup?.payload,
      capabilities: capabilities?.payload,
    },
    tenantId: t.tenantId,
    business: profile.businessName,
    siteUrl: profile.websiteUrl,
    workerUrl: worker.url,
    publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
  })
  if (!pkg.ok) {
    return Response.json({ status: 'error', reason: pkg.reason }, { status: 422 })
  }
  return Response.json({
    status: 'ok',
    filename: 'agentport-install.mjs',
    content: buildManualInstaller(pkg.value.files),
  })
}
