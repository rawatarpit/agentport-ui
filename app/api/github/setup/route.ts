import { githubFailureUrl } from '@/lib/github-redirect'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/setup — legacy Setup-URL landing.
 *
 * A Setup-URL arrival carries an `installation_id` but no user token. GitHub
 * itself warns that the id can be spoofed; a mint proves only that our App
 * can mint for an id, never that the caller owns it. Linking here would let
 * one merchant bind another merchant's installation to their tenant.
 *
 * The safe flow is the OAuth-during-install callback: GitHub returns to
 * `/api/github/callback` with a code, the callback exchanges it, and
 * `verifyInstallationOwnership` proves the caller administers the account
 * before anything is recorded. This route therefore never links; it sends
 * direct/legacy arrivals back to the dashboard to start the verifiable flow.
 */
export async function GET() {
  return Response.redirect(githubFailureUrl('install-use-dashboard'), 302)
}
