import { exchangeOAuthCode } from '@/lib/github'
import { recordInstallation, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

const DASHBOARD = 'https://agentport.relayforge.in'

/**
 * GET /api/github/callback — post-install landing for the GitHub App flow.
 *
 * GitHub redirects here with `?code=&installation_id=&setup_action=` after
 * the merchant installs (and authorises, if that box was checked). The code
 * is single-use and short-lived by GitHub's design; the exchange below
 * happens once, server-side, and the user token is used to link the
 * installer to the tenant — then dropped, never stored. A token in a
 * database is a token in a backup; the installation is re-derived from
 * webhook deliveries, not from a stored credential.
 *
 * Failures redirect, never render: this URL is opened by GitHub in the
 * merchant's browser, and a JSON error there is a dead end. Every failure
 * carries a `github=` reason the setup screen renders honestly.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const code = params.get('code') ?? ''
  const installationId = params.get('installation_id') ?? ''
  const fail = (reason: string) => Response.redirect(`${DASHBOARD}/connect?github=${encodeURIComponent(reason)}`, 302)

  if (!/^[0-9]+$/.test(installationId)) {
    return fail('missing-installation')
  }
  const install: Parameters<typeof recordInstallation>[1] = {
    installationId: Number(installationId),
    accountLogin: '',
    repositories: [],
    installerUserId: null,
  }

  if (!code) {
    // No code: installed without user-authorisation, or arrived directly.
    // The webhook's `installation` event already recorded the install —
    // link by installation id and finish.
    recordInstallation(resolveTenant(), install)
    return Response.redirect(`${DASHBOARD}/connect?github=installed&installation_id=${installationId}`, 302)
  }

  const clientId = (process.env.GITHUB_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) {
    return fail('oauth-unconfigured')
  }
  const exchanged = await exchangeOAuthCode({ clientId, clientSecret, code })
  if (!exchanged.ok) {
    return fail(`oauth-${exchanged.reason}`)
  }
  // Installer identity: one authenticated call as the user, then the token
  // is dropped. Only the login is kept, and only to label the installation.
  try {
    const me = (await (
      await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${exchanged.accessToken}` },
      })
    ).json()) as { login?: unknown }
    if (typeof me.login === 'string') install.installerUserId = me.login
  } catch {
    // Unlabelled is fine — the installation id is the link, not the login.
  }
  recordInstallation(resolveTenant(), install)
  return Response.redirect(`${DASHBOARD}/connect?github=installed&installation_id=${installationId}`, 302)
}
