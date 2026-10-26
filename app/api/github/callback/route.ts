import {
  exchangeOAuthCode,
  getAuthenticatedUser,
  listUserInstallations,
  mintInstallationTokenFor,
  verifyInstallationOwnership,
  type UserInstallation,
} from '@/lib/github'
import { consumeInstallState, recordInstallationDb } from '@/lib/durable-store'
import { githubFailureUrl, githubReturnUrl } from '@/lib/github-redirect'
import { bindInstallState, hashInstallState } from '@/lib/install-state'
import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'
import { readSelectedTenantId } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


/**
 * GET /api/github/callback — post-install landing for the GitHub App flow.
 *
 * With OAuth-during-install enabled, GitHub returns here with a `code` and
 * the one-time `state`; the installation id may or may not be present. The
 * id is never authority: the code is exchanged, the caller's own
 * installations are read, and only an installation the caller administers
 * is linked.
 *
 * The `state` issued by /api/github/install is mandatory. It is single-use,
 * hashed at rest, and bound to (tenant, initiator): replayed, forged, or
 * session-mismatched states record nothing. A named installation id is
 * accepted only when `verifyInstallationOwnership` proves the caller owns
 * it — a mint proves the App can mint for an id, never that this user does.
 *
 * Every failure redirects to the diagnostics surface with a machine reason:
 * this URL is opened by GitHub in the merchant's browser, so JSON is a dead
 * end. Signed-out callers are refused before the state is consumed, so the
 * one-time link survives a sign-in round trip.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const code = params.get('code') ?? ''
  const installationIdParam = params.get('installation_id') ?? ''
  const stateParam = params.get('state') ?? ''
  const fail = (reason: string) => Response.redirect(githubFailureUrl(reason), 302)

  // No state at all cannot be tied to a dashboard session. It is not a valid
  // install result, so it never records — even when GitHub named an id.
  if (stateParam.length === 0) return fail('install-state-missing')
  if (stateParam.length > 256) return fail('install-state-invalid')

  // Refuse before consuming: a signed-out return must not burn the one-time
  // state, and `/connect` (not JSON) is where the merchant can recover.
  let supabase: ReturnType<typeof createClient>
  let userId: string | null = null
  try {
    supabase = createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    userId = null
  }
  if (!userId) return fail('sign-in-required')

  const consumed = await consumeInstallState(hashInstallState(stateParam))

  // The session names the caller; the state names the tenant and initiator.
  // Both must agree, and only then does the callback act on the state's tenant.
  let caller: { userId: string | null; tenantId: string | null; role: string | null } = {
    userId: null,
    tenantId: null,
    role: null,
  }
  try {
    const ctx = await resolveCallerContext({
      getUserId: async () => userId,
      selectedTenantId: consumed?.tenantId ?? readSelectedTenantId(),
      listMemberships: async (memberId: string) => {
        const { data: rows } = await supabase
          .from('tenant_members')
          .select('tenant_id,role,created_at')
          .eq('user_id', memberId)
          .order('created_at', { ascending: true })
        return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
      },
    })
    caller = { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role }
  } catch {
    caller = { userId: null, tenantId: null, role: null }
  }

  const bound = bindInstallState(consumed, caller)
  if (!bound.ok) {
    return fail(bound.status === 403 ? 'install-state-session' : 'install-state-invalid')
  }
  const tenantId = bound.tenantId
  // The state was issued to an owner/admin, but the role may have changed
  // between issue and return. A demoted caller links nothing.
  if (!canManageIntegrations(caller.role)) return fail('install-start')

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

  let requestedId: number | null = null
  if (installationIdParam.length > 0) {
    if (!/^[0-9]+$/.test(installationIdParam)) return fail('installation-id-invalid')
    requestedId = Number(installationIdParam)
    if (!Number.isSafeInteger(requestedId) || requestedId <= 0) return fail('installation-id-invalid')
  }

  if (!code) {
    // The user token is the only way to prove the installation belongs to
    // this person. Without it, a named id is an unverified claim.
    if (requestedId !== null) return fail('installation-unverified')
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

  const appId = (process.env.GITHUB_APP_ID ?? '').trim()
  if (!appId) return fail('installation-key')
  const listed = await listUserInstallations(userToken)
  if (!listed.ok) return fail('installation-unverified')

  if (requestedId !== null) {
    // The id is named by the URL, so it is only a hint. Ownership — not mere
    // visibility — must be proven for OUR App before anything is recorded.
    const owned = await verifyInstallationOwnership(userToken, appId, requestedId, listed.value)
    if (!owned.ok) return fail(owned.reason)
    install.installationId = requestedId
    install.accountLogin = owned.value.accountLogin
  } else {
    // No id in the URL: the callback may arrive with only a code. Enumerate
    // the caller's own installs and keep only those they administer. One
    // candidate is unambiguous; zero means finish the install; more than one
    // is refused rather than guessed ("latest wins" is not authority).
    const owned: UserInstallation[] = []
    for (const candidate of listed.value) {
      if (candidate.appId !== appId) continue
      const verified = await verifyInstallationOwnership(userToken, appId, candidate.id, listed.value)
      if (verified.ok) owned.push(verified.value)
    }
    if (owned.length === 0) return fail('install-incomplete')
    if (owned.length > 1) return fail('installation-ambiguous')
    install.installationId = owned[0].id
    install.accountLogin = owned[0].accountLogin
  }

  // Mint verification remains: it proves the installation still exists for
  // our App. Ownership was proven above by the user's own installation list.
  const verified = await mintInstallationTokenFor(install.installationId)
  if (!verified.ok) return mintFailure(verified.reason)

  // Installer identity: one authenticated call as the user, then the token
  // is dropped. Only the login is kept, and only to label the installation.
  const me = await getAuthenticatedUser(userToken)
  if (me.ok && me.value.login) install.installerLogin = me.value.login
  const recorded = await recordInstallationDb(tenantId, install)
  if (recorded === 'attached') return fail('installation-attached')
  if (recorded !== 'ok') return fail('install-record')
  return Response.redirect(githubReturnUrl('installed', install.installationId), 302)
}
