import { listInstallationRepos, mintInstallationTokenFor } from '@/lib/github'
import { installationKnownDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

import { enforceRateLimit } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

async function callerTenant(): Promise<Awaited<ReturnType<typeof resolveCallerTenant>>> {
  try {
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
    return t
  } catch {
    return { tenantId: null, code: 'signed_out', reason: 'Sign in first — installs belong to your business.' }
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
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited

  const t = await callerTenant()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  const tenantId = t.tenantId
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
