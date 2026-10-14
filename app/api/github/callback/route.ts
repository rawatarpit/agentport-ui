import { exchangeOAuthCode, mintInstallationTokenFor } from '@/lib/github'
import { recordInstallationDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DASHBOARD = 'https://agentport.relayforge.in'

/**
 * GET /api/github/callback — post-install landing for the GitHub App flow.
 *
 * GitHub redirects here with `?code=&installation_id=&setup_action=` after
 * the merchant installs (and authorises, if that box was checked). The
 * installation is verified by minting (GitHub refuses unknown/revoked ids)
 * and linked to the caller's session tenant — never a constant, never a
 * URL alone. The OAuth code path additionally labels the installer login
 * via one `/user` call, then the user token is dropped, never stored.
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
  const install = {
    installationId: Number(installationId),
    accountLogin: '',
    installerLogin: null as string | null,
  }

  // Session tenant: installs belong to a signed-in business. Logged-out
  // arrivals record nothing — the sign-in screen explains the next step.
  let tenantId: string | null = null
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
    tenantId = t.tenantId
  } catch {
    tenantId = null
  }
  if (!tenantId) {
    return fail('missing-installation')
  }

  // Verify the installation exists (and is not revoked) before recording:
  // a crafted URL with an arbitrary id records nothing.
  const verified = await mintInstallationTokenFor(Number(installationId))
  if (!verified.ok) {
    return fail('missing-installation')
  }

  if (!code) {
    // No code: installed without user-authorisation. Verified above —
    // link by installation id and finish.
    await recordInstallationDb(tenantId, install)
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
    if (typeof me.login === 'string') install.installerLogin = me.login
  } catch {
    // Unlabelled is fine — the installation id is the link, not the login.
  }
  await recordInstallationDb(tenantId, install)
  return Response.redirect(`${DASHBOARD}/connect?github=installed&installation_id=${installationId}`, 302)
}
