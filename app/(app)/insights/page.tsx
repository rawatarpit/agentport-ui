import Link from 'next/link'
import { SavedReports } from '@/components/insights/saved-reports'
import { Callout } from '@/components/ui/callout'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { readTenantResearchProfile } from '@/lib/intelligence/profile'
import { IntelligenceStateStrip } from '@/components/intel/state-strip'
import { EngineStatusPanel } from '@/components/intel/engine-status-panel'
import { ExperienceBoundary } from '@/components/intel/experience-boundary'
import { OperateLinks } from '@/components/intel/operate-links'

export const dynamic = 'force-dynamic'

function given(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : 'Not provided'
}

/** Signed-in Intelligence home: profile status and honest next surfaces. */
export default async function InsightsPage() {
  const { tenantId, profile, metadataFound, readFailed } = await readTenantResearchProfile()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Your research starting point"
        description="Profile facts you submitted, opportunities interpreted from them, and a public-surface scan. No score on this page is a claim that an agent capability is live."
        actions={
          <>
            <Link href="/intelligence" className="btn btn-primary">
              Open public research
            </Link>
            <Link href="/assessment" className="btn">
              Run an assessment
            </Link>
          </>
        }
      />

      <IntelligenceStateStrip state={readFailed ? 'unavailable' : 'unresearched'} />
      <EngineStatusPanel state={readFailed ? 'unavailable' : 'not_configured'} />
      <ExperienceBoundary />

      {readFailed ? (
        <Callout tone="warning" title="Profile could not be read">
          Nothing is invented in its place. Reload to try the RLS-scoped read again.
        </Callout>
      ) : null}

      <Section
        title="Tenant profile"
        description="Merchant-declared metadata only. A missing field reads as Not provided, never as a default."
      >
        <div className="panel p-5">
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="border-t border-ink-line py-3">
              <dt className="label">Industry</dt>
              <dd className="mt-1 text-[14px] text-bone">{given(profile.industry)}</dd>
            </div>
            <div className="border-t border-ink-line py-3">
              <dt className="label">Sector</dt>
              <dd className="mt-1 text-[14px] text-bone">{given(profile.subIndustry)}</dd>
            </div>
            <div className="border-t border-ink-line py-3">
              <dt className="label">Website</dt>
              <dd className="mt-1 break-all text-[14px] text-bone">{given(profile.website)}</dd>
            </div>
            <div className="border-t border-ink-line py-3">
              <dt className="label">Country</dt>
              <dd className="mt-1 text-[14px] text-bone">{given(profile.country)}</dd>
            </div>
          </dl>
          <p className="mt-3 font-mono text-[11px] text-bone-faint">
            {metadataFound
              ? 'A tenant metadata row exists. Empty fields inside it remain unknown.'
              : 'No tenant metadata row has been recorded yet.'}
          </p>
        </div>
      </Section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/insights/opportunities" className="panel p-5 transition-colors hover:bg-ink-soft/60">
          <p className="label">Interpretation</p>
          <p className="mt-2 font-display text-[17px] font-semibold text-bone">Opportunities</p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">
            Ranked hypotheses from the profile above. Not sourced demand evidence.
          </p>
        </Link>
        <Link href="/insights/readiness" className="panel p-5 transition-colors hover:bg-ink-soft/60">
          <p className="label">Public surface</p>
          <p className="mt-2 font-display text-[17px] font-semibold text-bone">Readiness scan</p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">
            Observed files and page signals. Not proof of live capability.
          </p>
        </Link>
        <Link href="/insights/saved" className="panel p-5 transition-colors hover:bg-ink-soft/60">
          <p className="label">Durable snapshots</p>
          <p className="mt-2 font-display text-[17px] font-semibold text-bone">Saved reports</p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">
            Tenant-scoped snapshots of your research profile. Reopen the original, refresh into a new snapshot, or delete.
          </p>
        </Link>
      </section>

      <Section
        title="Save this snapshot"
        description="Durable, tenant-scoped snapshots of the report shown above. The body is generated on the server when you save."
      >
        <SavedReports profile={profile} tenantId={tenantId} />
      </Section>

      <OperateLinks />
    </div>
  )
}
