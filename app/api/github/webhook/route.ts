import { recordInstallation, removeInstallation, resolveTenant } from '@/lib/store'
import { verifyWebhookSignature } from '@/lib/github'

export const dynamic = 'force-dynamic'

/**
 * POST /api/github/webhook — GitHub App event deliveries.
 *
 * Verified before read: HMAC-SHA256 over the exact raw bytes against
 * `GITHUB_WEBHOOK_SECRET`, constant-time. An unverified delivery is refused
 * with 401 and nothing else happens — no parse, no store, no log of the body.
 *
 * Unknown events are acknowledged, never errored: GitHub retries 5xx, and an
 * event this code does not understand is not a failure, it is a future event.
 * A webhook that 500s on the unknown teaches GitHub to redeliver noise.
 */
export async function POST(req: Request) {
  const secret = (process.env.GITHUB_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return Response.json({ status: 'error', reason: 'GitHub App not configured — no webhook secret.' }, { status: 503 })
  }
  const raw = await req.text()
  const verdict = verifyWebhookSignature(secret, raw, req.headers.get('x-hub-signature-256'))
  if (!verdict.ok) {
    return Response.json({ status: 'error', reason: `Delivery refused: ${verdict.reason}.` }, { status: 401 })
  }

  const event = req.headers.get('x-github-event') ?? ''
  const delivery = req.headers.get('x-github-delivery') ?? ''
  if (event === 'ping') {
    return Response.json({ status: 'ok', event: 'ping', delivery })
  }

  let body: {
    action?: unknown
    installation?: { id?: unknown; account?: { login?: unknown } }
    repositories?: Array<{ full_name?: unknown }>
  }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return Response.json({ status: 'error', reason: 'Delivery is signed but not JSON.' }, { status: 400 })
  }

  // Recorded fields only: ids, logins, repo names, action. No code, no
  // diffs, no file contents — a webhook body is GitHub's data about the
  // merchant's repo, and the minimum needed to show install state.
  if (event === 'installation' && typeof body.action === 'string') {
    const id = body.installation?.id
    if (typeof id === 'number') {
      const tenantId = resolveTenant()
      if (body.action === 'deleted') {
        removeInstallation(tenantId, id)
      } else {
        recordInstallation(tenantId, {
          installationId: id,
          accountLogin: typeof body.installation?.account?.login === 'string' ? body.installation.account.login : '',
          repositories: Array.isArray(body.repositories)
            ? body.repositories.filter((r) => typeof r.full_name === 'string').map((r) => r.full_name as string)
            : [],
          installerUserId: null,
        })
      }
      return Response.json({ status: 'ok', event: 'installation', action: body.action, delivery })
    }
  }

  if (event === 'pull_request' || event === 'check_run' || event === 'installation_repositories') {
    return Response.json({ status: 'ok', event, action: body.action ?? null, delivery, note: 'Recorded for a future sync panel; no action taken.' })
  }

  return Response.json({ status: 'ok', event, delivery, ignored: true })
}
