// File: agentport‑ui/app/(app)/analytics/page.tsx
import Link from 'next/link'
import { AnalyticsView } from '@/components/analytics-view'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="A week later"
        description="See what agents asked for, what was refused or held, and what executed — by week, capability, and agent. Hover the chart or click a capability to filter. Counts only; nothing to redact."
        actions={
          <Link href="/ledger" className="btn">
            Read the ledger
          </Link>
        }
      />
      <EnforcingPanel draftLabel="no draft open" />
      <AnalyticsView />
      <div className="panel p-5">
        <p className="label">Your rows are yours</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          The append‑only table lives in your database, under triggers that abort{' '}
          <span className="font-mono">UPDATE</span> and <span className="font-mono">DELETE</span>.
          If those triggers are dropped, the guarantee degrades to “the SDK never
          issues one” — weaker, and stated as the weaker one. Keep it if you stop
          paying us; it was never ours.
        </p>
      </div>
    </div>
  )
}