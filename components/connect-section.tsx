import { GithubPanel } from '@/components/github-panel'
import { getDraftDb } from '@/lib/durable-store'
import { resolveRequestTenant } from '@/lib/tenant-server'

/**
 * The persistent GitHub surface on the dashboard.
 *
 * Onboarding links here; a completed tenant still finds the panel instead of
 * an empty anchor. The PR stays blocked until starter rules exist because the
 * discovery package is generated from them — installing GitHub is allowed
 * earlier, opening the PR is not.
 */
export async function ConnectSection() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') return null

  const [setup, rules] = await Promise.all([
    getDraftDb(tenant.active.tenantId, 'setup'),
    getDraftDb(tenant.active.tenantId, 'rules'),
  ])
  const rulesReady = Boolean(setup || rules)
  const canManage = tenant.active.membership.role === 'owner' || tenant.active.membership.role === 'admin'

  return (
    <section id="connect-github">
      <GithubPanel
        canManage={canManage}
        prBlockedReason={
          rulesReady
            ? null
            : 'Set your starter rules first — the discovery package is generated from them.'
        }
      />
    </section>
  )
}
