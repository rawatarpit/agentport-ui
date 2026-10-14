import { mintInstallationTokenFor, readRepoTree } from '@/lib/github'
import { getInstallations, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/tree?installation=<id>&repo=<owner/name>[&ref=<branch>] —
 * file inventory for mapping, from the end user's own GitHub authorization.
 *
 * Same trust shape as /repos and /pr: the installation must belong to this
 * tenant (an id from another tenant's install is refused, not listed), the
 * token is minted per call from server env and never stored, and the
 * response carries paths + sizes only — file bodies are a separate,
 * narrower decision. Default branch comes from the repos listing; callers
 * pass it explicitly so this route never guesses which tree to read.
 */
export async function GET(req: Request) {
  const tenantId = resolveTenant()
  const params = new URL(req.url).searchParams
  const installationId = Number(params.get('installation') ?? '')
  const repo = (params.get('repo') ?? '').trim()
  const ref = (params.get('ref') ?? '').trim()
  const known = getInstallations(tenantId).some((i) => i.installationId === installationId)
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
