import type { Metadata } from 'next'
import { FiveLensCoverage, ReportViewTracker } from '@/components/intel/five-lens-coverage'
import { ReportView } from '@/components/intel/report-view'
import { buildSampleReport } from '@/lib/intelligence/sample'
import { buildSourcedReport } from '@/lib/intelligence/research-report'
import { profileFromParams } from '@/lib/intelligence/types'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Intelligence preview',
  description: 'A research report built from connected public providers, or an explicitly flagged fictional sample.',
  alternates: { canonical: '/intelligence' },
  robots: { index: false, follow: false },
}

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const v = first(value)
    if (typeof v === 'string') params.set(key, v)
  }
  const query = params.toString()
  const reportHref = query.length > 0 ? `/intelligence/report?${query}` : '/intelligence/report'
  const editHref = query.length > 0 ? `/intelligence?${query}` : '/intelligence'
  const profile = profileFromParams(params)

  // The dashboard link is decided on the server from the session and selected
  // workspace. A public URL never carries a tenant id or a redirect target.
  let dashboardHref = `/login?next=${encodeURIComponent(reportHref)}`
  let dashboardLabel = 'Sign in to continue'
  try {
    const tenant = await resolveRequestTenant()
    if (tenant.active.status === 'active') {
      dashboardHref = '/'
      dashboardLabel = 'Return to dashboard'
    } else if (tenant.userId !== null) {
      dashboardHref = '/select-workspace?next=%2F'
      dashboardLabel = 'Choose a workspace'
    }
  } catch {
    // A failed session read is not a claim about the visitor; sign-in stays the
    // honest destination.
  }

  // Only an explicit ?sample=1 reaches the FICTIONAL SAMPLE builder; a real
  // profile never falls back to invented figures when a provider is missing.
  const report = searchParams.sample === '1' ? buildSampleReport(profile) : await buildSourcedReport(profile)

  return (
    <div className="space-y-10">
      <ReportViewTracker />
      <FiveLensCoverage report={report} />
      <ReportView
        report={report}
        sampleLabel="FICTIONAL SAMPLE"
        trackGenerated
        previewActions={{
          editHref,
          reportHref,
          dashboardHref,
          dashboardLabel,
          installHref: '/install',
        }}
      />
    </div>
  )
}
