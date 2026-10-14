import { mintInstallationTokenFor, readRepoTree } from '@/lib/github'
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
 * GET /api/github/tree?installation=<id>&repo=<owner/name>[&ref=<branch>] —
 * file inventory for mapping, from the end user's own GitHub authorization.
 *
 * Same trust shape as /repos and /pr: the installation must be linked to
 * the caller's tenant (durable row), the token is minted per call from
 * server env and never stored, and the response carries paths + sizes
 * only.
 */
export async function GET(req: Request) {
  const tenantId = await callerTenantId()
  if (!tenantId) {
    return Response.json({ status: 'error', reason: 'Sign in first — installs belong to your business.' }, { status: 401 })
  }
  const params = new URL(req.url).searchParams
  const installationId = Number(params.get('installation') ?? '')
  const repo = (params.get('repo') ?? '').trim()
  const ref = (params.get('ref') ?? '').trim()
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  const known = await installationKnownDb(tenantId, installationId)
  if (!known) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  if (!repo) {
    return Response.json({ status: 'error', reason: 'Pick a repository first.' }, { status: 400 })
  }
  const minted = await mintInstallationTokenFor(installationId)
  if (!minted.ok) {
    return Response.json({ status: 'error', reason: minted.reason }, { status: 503 })
  }
  const tree = await readRepoTree({ installationToken: minted.token, repoFullName: repo, ref })
  if (!tree.ok) {
    return Response.json({ status: 'error', reason: tree.reason }, { status: 502 })
  }
  return Response.json({ status: 'ok', repo, ref, ...tree.value })
}
