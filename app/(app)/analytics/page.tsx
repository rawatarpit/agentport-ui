import { AnalyticsView } from '@/components/analytics-view'
import { EnforcingPanel } from '@/components/enforcing-panel'

export const dynamic = 'force-dynamic'

/**
 * 5.x reading it back — the merchant comes back after a week.
 * Everything on this screen is something the runtime asserted: counts plus
 * the enforcing digest and its age. The ledger itself stays in their
 * database; this screen never proxies a row.
 */
export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Evidence</p>
        <h2 className="mt-2 font-display text-3xl text-bone">A week later</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Are refusals falling, are approvals piling up, which capability is being
          called — and which config decided all of it. To read a single row, open
          your own database: <span className="font-mono text-bone">agent-port ledger</span> reads
          it without writing SQL. This screen shows counts so there is nothing to
          redact and nothing to leak.
        </p>
      </div>
      <EnforcingPanel draftLabel="no draft open" />
      <AnalyticsView />
      <div className="panel p-5">
        <p className="label">Your rows are yours</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          The append-only table lives in your database, under triggers that abort{' '}
          <span className="font-mono">UPDATE</span> and <span className="font-mono">DELETE</span>.
          If those triggers are dropped, the guarantee degrades to “the SDK never
          issues one” — weaker, and stated as the weaker one. Keep it if you stop
          paying us; it was never ours.
        </p>
      </div>
    </div>
  )
}
