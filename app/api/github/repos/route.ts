import { listInstallationRepos, mintInstallationTokenFor } from '@/lib/github'
import { installationKnownDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function callerTenantId(): Promise<string | null> {
  try {
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
    return t.tenantId
  } catch {
    return null
  }
}

/**
 * GET /api/github/repos?installation=<id> — repositories the installation
 * can touch. The installation must be linked to the caller's tenant
 * (durable github_installations row): an id from another tenant's install
 * is refused, not listed. GitHub then mints-or-refuses per call, so revoked
 * installs fail closed too. Names and default branches only.
 */
export async function GET(req: Request) {
  const tenantId = await callerTenantId()
  if (!tenantId) {
    return Response.json({ status: 'error', reason: 'Sign in first — installs belong to your business.' }, { status: 401 })
  }
  const installationId = Number(new URL(req.url).searchParams.get('installation') ?? '')
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  const known = await installationKnownDb(tenantId, installationId)
  if (!known) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  const minted = await mintInstallationTokenFor(installationId)
  if (!minted.ok) {
    return Response.json({ status: 'error', reason: minted.reason }, { status: 503 })
  }
  const repos = await listInstallationRepos(minted.token)
  if (!repos.ok) {
    return Response.json({ status: 'error', reason: repos.reason }, { status: 502 })
  }
  return Response.json({ status: 'ok', repos: repos.value })
}
