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
        description="See what agents asked for, what was refused or held, and what executed — by week, capability, and agent. Hover the chart or click a capability to filter. Counts and agent names only; parameters are never projected. A declared name is not verified identity."
        actions={
          <Link href="/ledger" className="btn">
            Read the ledger
          </Link>
        }
      />
      <EnforcingPanel draftLabel="no draft open" />
      <AnalyticsView />
      <div className="panel p-5">
        <p className="label">What these rows are</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          These counts come from the hosted governor&apos;s ledger projection for this tenant, read through your
          session&apos;s row-level security. The projection omits parameters, amounts, detail and error text. An empty
          window is not proof that nothing ran, and a failed read stays unknown.
        </p>
      </div>
    </div>
  )
}