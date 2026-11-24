import Link from 'next/link'
import { SavedReports } from '@/components/insights/saved-reports'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { readTenantResearchProfile } from '@/lib/intelligence/profile'

export const dynamic = 'force-dynamic'

export default async function SavedPage() {
  const { tenantId, profile } = await readTenantResearchProfile()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Saved snapshots"
        description="Durable, tenant-scoped snapshots of your research profile. Saved in your workspace — reopen the original at any time, refresh into a new snapshot, or delete."
        actions={
          <Link href="/insights" className="btn">
            Back to insights
          </Link>
        }
      />
      <Section title="Current snapshot" description="The profile that will be stored when you save.">
        <SavedReports profile={profile} tenantId={tenantId} />
      </Section>
    </div>
  )
}
