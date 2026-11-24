import type { Metadata } from 'next'
import { ReportView } from '@/components/intel/report-view'
import { buildSampleReport } from '@/lib/intelligence/sample'
import { buildSourcedReport } from '@/lib/intelligence/research-report'
import { profileFromRecord } from '@/lib/intelligence/types'

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
  const profile = profileFromRecord({
    industry: first(searchParams.industry),
    subIndustry: first(searchParams.subIndustry),
    country: first(searchParams.country),
    website: first(searchParams.website),
    businessModel: first(searchParams.businessModel),
    customerSegment: first(searchParams.customerSegment),
    objectives: first(searchParams.objective),
  })

  // Only an explicit ?sample=1 reaches the FICTIONAL SAMPLE builder; a real
  // profile never falls back to invented figures when a provider is missing.
  const report = searchParams.sample === '1' ? buildSampleReport(profile) : await buildSourcedReport(profile)

  return <ReportView report={report} sampleLabel="FICTIONAL SAMPLE" />
}
