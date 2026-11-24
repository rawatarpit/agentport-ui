import Link from 'next/link'
import { Callout } from '@/components/ui/callout'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { RANKING_METHOD, buildOpportunities } from '@/lib/intelligence/report'
import { readTenantResearchProfile } from '@/lib/intelligence/profile'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { trackServerEvent } from '@/lib/funnel-events-server'

export const dynamic = 'force-dynamic'

/**
 * Opportunities are interpretations of the submitted profile, not a demand
 * study. The weights and the score scale are shown verbatim from the engine so
 * the ranking can be argued with rather than trusted blindly.
 */
export default async function OpportunitiesPage() {
  const { profile, readFailed } = await readTenantResearchProfile()
  const opportunities = buildOpportunities(profile)
  const weights = RANKING_METHOD.weights

  const tenant = await resolveRequestTenant()

  // Track that recommendations were viewed.
  await trackServerEvent({
    event_type: 'recommendation_viewed',
    user_id: tenant.userId,
    tenant_id: tenant.active.status === 'active' ? tenant.active.tenantId : null,
    source_route: '/insights/opportunities',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Opportunity map"
        description="Ranking from your submitted profile only. These are hypotheses for discussion, not sourced demand evidence, revenue estimates or a forecast."
        actions={
          <>
            <Link href="/insights" className="btn">
              Back to insights
            </Link>
            <Link href="/intelligence" className="btn btn-primary">
              Public research
            </Link>
          </>
        }
      />

      <Callout tone="warning" title="Interpretation, not sourced demand">
        Every row below is an interpretation of the profile you submitted. A filled-in field raises scoping
        feasibility or timing; it never raises the evidence score. No market dataset is connected here.
      </Callout>

      {readFailed ? (
        <Callout tone="warning" title="Profile could not be read">
          The ranking below uses the honest empty profile. Reload to read your submitted fields again.
        </Callout>
      ) : null}

      {!profile.industry && !profile.website && !profile.subIndustry ? (
        <EmptyState
          title="No profile submitted yet"
          body="The ranking shown below is generic because no industry, sector or website is recorded for this workspace. Submit a profile before treating any order as specific to your business."
          action={
            <Link href="/intelligence" className="btn">
              Build a research profile
            </Link>
          }
        />
      ) : null}

      <div className="panel p-5">
        <p className="label">Ranking method</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{RANKING_METHOD.scale}</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          {Object.entries(weights)
            .map(([factor, weight]) => `${factor} ${weight}`)
            .join(' · ')}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-bone-faint">{RANKING_METHOD.caveat}</p>
      </div>

      <Section title="Ranked opportunities" description="Weighted score out of 5, highest first.">
        <ol className="space-y-3">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label">#{opportunity.rank}</p>
                  <h3 className="mt-1 font-display text-[17px] font-semibold text-bone">{opportunity.title}</h3>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-[24px] font-semibold leading-none text-bone">
                    {opportunity.score.toFixed(2)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-bone-faint">weighted / 5</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">{opportunity.description}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="label">Business value</dt>
                  <dd className="mt-1 text-[12px] text-bone-dim">{opportunity.businessValue}</dd>
                </div>
                <div>
                  <dt className="label">Customer value</dt>
                  <dd className="mt-1 text-[12px] text-bone-dim">{opportunity.customerValue}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {opportunity.access.map((mode) => (
                  <Chip key={mode} tone={mode === 'write' ? 'warn' : 'neutral'}>
                    {mode} access
                  </Chip>
                ))}
                <Chip
                  tone={opportunity.humanConfirmation === 'required' ? 'warn' : 'neutral'}
                  title={
                    opportunity.humanConfirmation === 'required'
                      ? 'A human must confirm before any state-changing call runs.'
                      : undefined
                  }
                >
                  human confirmation: {opportunity.humanConfirmation}
                </Chip>
                <Chip tone="info">{opportunity.complexity} complexity</Chip>
              </div>
              <div className="mt-4 border-t border-ink-line pt-3">
                <p className="label">Factor scores (1–5)</p>
                <p className="mt-1 font-mono text-[11px] text-bone-faint">
                  {Object.entries(opportunity.scores)
                    .map(([factor, value]) => `${factor} ${value}`)
                    .join(' · ')}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-bone-dim">{opportunity.evidence}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
                  Recommended next step: {opportunity.recommendedAction}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
