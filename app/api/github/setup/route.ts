import { consumeInstallState, getInstallationsDb, recordInstallationDb } from '@/lib/durable-store'
import { hashInstallState, validateSetupParams } from '@/lib/install-state'
import { mintInstallationTokenFor } from '@/lib/github'
import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DASHBOARD = 'https://agentport.relayforge.in'

/**
 * GET /api/github/setup — Setup-URL landing (spec §8.2).
 *
 * GitHub redirects here with `?installation_id=&setup_action=&state=` when
 * the App's Setup URL is set (installation-time OAuth disabled). Every
 * parameter is untrusted. The handler: validates shape → atomically
 * consumes the one-time state (replay finds zero rows) → revalidates the
 * caller's CURRENT owner/admin membership (the role may have changed since
 * issue) → mint-verifies the installation → records it under the
 * state-bound tenant, never under a session-derived guess. A globally
 * unique installation id already linked elsewhere refuses instead of
 * transferring — reassignment needs an explicit disconnect first.
 *
 * Failures redirect with an honest `github=` reason, never JSON: GitHub
 * opens this URL in the merchant's browser.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const fail = (reason: string) => Response.redirect(`${DASHBOARD}/connect?github=${encodeURIComponent(reason)}`, 302)

  const checked = validateSetupParams({
    installationId: params.get('installation_id'),
    setupAction: params.get('setup_action'),
    state: params.get('state'),
  })
  // No state at all means the install did not start from the dashboard
  // button (direct GitHub-side install/configure, or a stripped redirect).
  // Distinguish it from an expired/used state: the fixes differ — start
  // over via the button versus just retrying.
  if (!checked.ok) {
    const missingState =
      typeof params.get('state') !== 'string' || (params.get('state') ?? '').length === 0
    return fail(missingState ? 'install-state-missing' : 'install-state-invalid')
  }

  const consumed = await consumeInstallState(hashInstallState(checked.state))
  if (!consumed || consumed.purpose !== 'install') return fail('install-state-invalid')

  // The state names the tenant; the session names the caller. Both must
  // agree right now: same tenant, still owner/admin. A role revoked
  // between issue and return links nothing.
  let tenantId: string | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const c = await resolveCallerContext({
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
    if (c.tenantId && c.tenantId === consumed.tenantId && canManageIntegrations(c.role)) tenantId = c.tenantId
  } catch {
    tenantId = null
  }
  if (!tenantId) return fail('sign-in-required')

  const verified = await mintInstallationTokenFor(checked.installationId)
  if (!verified.ok) {
    if (verified.reason === 'unknown installation') return fail('installation-unknown')
    if (
      verified.reason === 'GitHub App key does not parse' ||
      verified.reason === 'app authentication refused' ||
      verified.reason === 'GitHub App is not configured — install it first'
    ) {
      return fail('installation-key')
    }
    return fail('installation-unverified')
  }

  const linked =
    (await recordInstallationDb(tenantId, {
      installationId: checked.installationId,
      accountLogin: '',
      installerLogin: null,
    })) ||
    // Idempotent replay: our own row already carries this installation
    // (recorded by an earlier delivery of the same state) — success, not
    // a duplicate. Anything else refusing the write is another tenant's
    // claim on the globally unique id: refuse, never transfer.
    (await getInstallationsDb(tenantId)).some((r) => r.installationId === checked.installationId)
  if (!linked) return fail('installation-attached')

  return Response.redirect(
    `${DASHBOARD}/connect?github=installed&installation_id=${checked.installationId}`,
    302,
  )
}
