import { EnforcingPanel } from '@/components/enforcing-panel'
import { TenantCard } from '@/components/tenant-card'
import { DashboardKpis, GettingStarted, GithubHowto } from '@/components/dashboard'

export const dynamic = 'force-dynamic'

/**
 * The dashboard: numbers first, then what needs the merchant.
 *
 * An owner opens this asking three questions — is it working, does anything
 * need me, what is left to set up — and each is answered above any prose.
 * Tenant identity, enforcing state, KPIs, the checklist, and the GitHub
 * front door compose here; the explanatory writing lives on the pages
 * those panels link to.
 */
export default async function Overview() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Overview</p>
        <h2 className="mt-2 font-display text-3xl text-bone">What agents are doing</h2>
      </div>

      <TenantCard />

      <GettingStarted />

      <GithubHowto />

      <DashboardKpis />

      <EnforcingPanel draftLabel="overview — no draft open" />
    </div>
  )
}
