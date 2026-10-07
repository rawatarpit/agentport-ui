import { listInstallationRepos, mintInstallationTokenFor } from '@/lib/github'
import { getInstallations, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/repos?installation=<id> — repositories the installation
 * can touch. The installation must belong to this tenant: an id from
 * another tenant's install is refused, not listed. Names and default
 * branches only — the picker needs nothing else.
 */
export async function GET(req: Request) {
  const tenantId = resolveTenant()
  const installationId = Number(new URL(req.url).searchParams.get('installation') ?? '')
  const known = getInstallations(tenantId).some((i) => i.installationId === installationId)
  if (!known) {
    return Response.json({ status: 'error', reason: 'Unknown installation — install the App first.' }, { status: 404 })
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
