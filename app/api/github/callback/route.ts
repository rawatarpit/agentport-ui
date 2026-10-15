import { exchangeOAuthCode, listUserInstallations, mintInstallationTokenFor, pickOurInstallation } from '@/lib/github'
import { recordInstallationDb } from '@/lib/durable-store'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DASHBOARD = 'https://agentport.relayforge.in'

/**
 * GET /api/github/callback — post-install landing for the GitHub App flow.
 *
 * Two arrivals, one link. With a Setup URL, GitHub delivers
 * `?installation_id=&setup_action=` (plus `code` when user authorization
 * was requested). This App cannot set a Setup URL alongside its OAuth
 * redirect URI, so the usual arrival is code-only: the installation is
 * then DISCOVERED from the user's own authorizations
 * (`GET /user/installations`, filtered to our App ID, latest wins) rather
 * than trusted from the URL.
 *
 * Either way the id is verified by minting (GitHub refuses unknown/revoked
 * ids) and linked to the caller's session tenant — never a constant. The
 * user token is used for discovery + one `/user` label call, then dropped,
 * never stored.
 *
 * Failures redirect, never render: this URL is opened by GitHub in the
 * merchant's browser, and a JSON error there is a dead end. Every failure
 * carries a `github=` reason the setup screen renders honestly.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const code = params.get('code') ?? ''
  const installationIdParam = params.get('installation_id') ?? ''
  const fail = (reason: string) => Response.redirect(`${DASHBOARD}/connect?github=${encodeURIComponent(reason)}`, 302)

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
    return fail('sign-in-required')
  }

  // Failure classes, shared by both arrivals (mint reasons name no secret):
  // unknown ids vs refused App credentials need opposite fixes.
  const mintFailure = (reason: string) => {
    if (reason === 'unknown installation') return fail('installation-unknown')
    // Key failures split three ways: nothing to read, unreadable paste, or
    // GitHub rejecting the pair. Each names a different fix on Netlify.
    if (reason === 'GitHub App is not configured — install it first') return fail('installation-key-missing')
    if (reason === 'GitHub App key does not parse') return fail('installation-key-parse')
    if (reason === 'app authentication refused') return fail('installation-key-auth')
    return fail('installation-unverified')
  }

  const install = {
    installationId: 0,
    accountLogin: '',
    installerLogin: null as string | null,
  }

  if (/^[0-9]+$/.test(installationIdParam)) {
    // Setup-URL arrival: the id is named, still verified before recording —
    // a crafted URL with an arbitrary id records nothing.
    install.installationId = Number(installationIdParam)
    const verified = await mintInstallationTokenFor(install.installationId)
    if (!verified.ok) return mintFailure(verified.reason)
    if (!code) {
      await recordInstallationDb(tenantId, install)
      return Response.redirect(
        `${DASHBOARD}/connect?github=installed&installation_id=${install.installationId}`,
        302,
      )
    }
  } else if (!code) {
    // Nothing arrived at all: no id, no code. Not a redirect worth
    // discovering from — the install was cancelled or never started.
    return fail('missing-installation')
  }

  // Code arrival (with or without an id): exchange once, server-side.
  const clientId = (process.env.GITHUB_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) {
    return fail('oauth-unconfigured')
  }
  const exchanged = await exchangeOAuthCode({ clientId, clientSecret, code })
  if (!exchanged.ok) {
    return fail(`oauth-${exchanged.reason}`)
  }
  const userToken = exchanged.accessToken

  if (!install.installationId) {
    // No id in the URL: discover the install from the user's own
    // authorizations. Filtered to OUR App ID and mint-verified below, so a
    // foreign app's install can neither link nor squat.
    const appId = (process.env.GITHUB_APP_ID ?? '').trim()
    if (!appId) return fail('installation-key')
    const listed = await listUserInstallations(userToken)
    if (!listed.ok) return fail('installation-unverified')
    const found = pickOurInstallation(listed.value, appId)
    if (!found) return fail('install-incomplete')
    install.installationId = found.id
    install.accountLogin = found.accountLogin
    const verified = await mintInstallationTokenFor(install.installationId)
    if (!verified.ok) return mintFailure(verified.reason)
  }

  // Installer identity: one authenticated call as the user, then the token
  // is dropped. Only the login is kept, and only to label the installation.
  try {
    const me = (await (
      await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${userToken}` },
      })
    ).json()) as { login?: unknown }
    if (typeof me.login === 'string') install.installerLogin = me.login
  } catch {
    // Unlabelled is fine — the installation id is the link, not the login.
  }
  await recordInstallationDb(tenantId, install)
  return Response.redirect(`${DASHBOARD}/connect?github=installed&installation_id=${install.installationId}`, 302)
}
