import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ReportView } from '@/components/intel/report-view'
import { getSavedReport } from '@/lib/research/saved-reports'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const metadata: Metadata = {
  title: 'Saved report',
  description: 'Your saved research report snapshot.',
}

/**
 * View a saved report snapshot exactly as it was saved.
 *
 * The stored `report` JSON is rendered without regeneration, so the merchant
 * sees the original figures, sources and provenance — never a silently
 * regenerated number that might differ from what they saved.
 */
export default async function SavedReportPage({
  params,
}: {
  params: { id: string }
}) {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace to open a saved report.</p>
      </div>
    )
  }

  const read = await getSavedReport(tenant.active.tenantId, params.id)
  if (!read.ok) {
    return (
      <div className="panel p-8 text-center space-y-2">
        <p className="text-bone">Unable to load this saved report.</p>
        <p className="text-[13px] text-bone-dim">Nothing is invented in its place. Reload to try the RLS-scoped read again.</p>
      </div>
    )
  }
  if (!read.value) return notFound()
  const row = read.value

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-bone font-display text-[28px] leading-tight">Saved report</h1>
          <p className="text-bone-dim">
            Stored {new Date(row.savedAt).toLocaleString()} — original snapshot, not regenerated.
          </p>
        </div>
        <Link href="/insights/saved" className="btn btn-secondary px-4 py-2.5">
          Back to saved reports
        </Link>
      </div>

      {row.report ? (
        <ReportView report={row.report} sampleLabel="" />
      ) : (
        <div className="panel p-8 text-center">
          <p className="text-bone-dim">This snapshot has no report body saved.</p>
        </div>
      )}
    </div>
  )
}
