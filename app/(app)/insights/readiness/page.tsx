import Link from 'next/link'
import { WebsiteAssessmentCard } from '@/components/insights/website-assessment-card'
import { PageHeader } from '@/components/ui/page-header'
import { readTenantResearchProfile } from '@/lib/intelligence/profile'

export const dynamic = 'force-dynamic'

export default async function ReadinessPage() {
  const { profile } = await readTenantResearchProfile()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Readiness scan"
        description="Inspect what your public website actually serves. This is a public-surface scan, not proof of live capability — the hosted governor authorises and records calls."
        actions={
          <Link href="/insights" className="btn">
            Back to insights
          </Link>
        }
      />
      <WebsiteAssessmentCard website={profile.website} />
    </div>
  )
}
