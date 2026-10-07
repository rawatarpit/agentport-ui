import Link from 'next/link'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { BusinessCard } from '@/components/business-card'
import { DashboardKpis, GettingStarted, GithubHowto, GithubNudge, PullRequestCard } from '@/components/dashboard'

export const dynamic = 'force-dynamic'

const VERTICALS = [
  { label: 'Local shops', body: 'Counter questions, held orders, refused refunds.' },
  { label: 'D2C brands', body: 'Marketplace discovery, checkout held to one policy.' },
  { label: 'Travel & bookings', body: 'Itinerary changes wait for a human.' },
  { label: 'SaaS & platforms', body: 'Scoped credentials per customer, audit per call.' },
]

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
        <p className="prose-bone mt-3 max-w-[68ch]">
          Whether this is a corner shop, a D2C brand, a travel desk, or a SaaS
          platform — the same three questions: is it working, does anything
          need a human, what is left to set up.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VERTICALS.map((v) => (
          <div key={v.label} className="panel p-4">
            <p className="font-display text-[15px] text-bone">{v.label}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">{v.body}</p>
          </div>
        ))}
      </section>

      <BusinessCard />

      <GithubNudge />

      <GettingStarted />

      <GithubHowto />

      <PullRequestCard />

      <DashboardKpis />

      <EnforcingPanel draftLabel="overview — no draft open" />
    </div>
  )
}
