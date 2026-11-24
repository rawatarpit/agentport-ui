import Link from 'next/link'
import { WebsiteAssessmentCard } from '@/components/insights/website-assessment-card'
import { PageHeader } from '@/components/ui/page-header'
import { readTenantResearchProfile } from '@/lib/intelligence/profile'

export const dynamic = 'force-dynamic'

/** Assessment form plus its latest result; readiness reuses the same card. */
export default async function AssessmentPage() {
  const { profile } = await readTenantResearchProfile()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assessment"
        title="Assess your public surface"
        description="Run a bounded scan of a public https address and read the evidence it returns. This is a public-surface scan, not proof of live capability."
        actions={
          <>
            <Link href="/insights/readiness" className="btn">
              Readiness view
            </Link>
            <Link href="/go-live#site" className="btn btn-primary">
              Set site address
            </Link>
          </>
        }
      />
      <WebsiteAssessmentCard website={profile.website} />
    </div>
  )
}
