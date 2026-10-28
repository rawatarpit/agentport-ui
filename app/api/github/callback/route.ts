import { brokerFetch } from '@/lib/github-broker'
import { githubFailureUrl, githubReturnUrl } from '@/lib/github-redirect'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/callback — same-origin landing for the GitHub App flow.
 *
 * GitHub returns the merchant's browser here, so the session cookie is on
 * this origin. The console refuses a signed-out return before calling the
 * broker (the one-time state survives a sign-in round trip), then forwards
 * the query and the caller's access token to the broker. The broker owns the
 * state, exchanges the OAuth code, proves installation ownership, mints the
 * installation token, and records the row through its narrow database role.
 *
 * Every failure redirects to the diagnostics surface with a machine reason.
 * The console never reads a GitHub App secret.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const fail = (reason: string) => Response.redirect(githubFailureUrl(reason), 302)

  // Refuse before the broker consumes the state: a signed-out return must
  // not burn the one-time link.
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return fail('sign-in-required')
  } catch {
    return fail('sign-in-required')
  }

  const res = await brokerFetch(req, `/callback?${params.toString()}`)
  let body: { status?: unknown; installationId?: unknown; reason?: unknown }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return fail('broker-unreachable')
  }
  if (body.status === 'ok' && typeof body.installationId === 'number' && Number.isSafeInteger(body.installationId)) {
    return Response.redirect(githubReturnUrl('installed', body.installationId), 302)
  }
  return fail(typeof body.reason === 'string' ? body.reason : 'installation-unverified')
}
