import Link from 'next/link'
import { Callout } from '@/components/ui/callout'
import { KpiCard } from '@/components/ui/kpi-card'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { sumNullableCounts } from '@/lib/analytics-counts'
import { getHome, hasAnalyticsEvents } from '@/lib/backend-reads'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

type ActivityCountRow = {
  capability: string
  window_start: string
  asked: number | null
  denied: number | null
  held: number | null
  approved: number | null
  executed: number | null
}

const FACTORS: Array<keyof Pick<ActivityCountRow, 'asked' | 'denied' | 'held' | 'approved' | 'executed'>> = [
  'asked',
  'denied',
  'held',
  'approved',
  'executed',
]

function count(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'unknown'
}

/**
 * Two different evidence families, never merged into one number:
 * ledger-derived activity comes from the RLS-scoped ledger projection, while
 * GA events are only ever reported as present or unavailable. A tenant with no
 * push is unknown, not a healthy zero.
 */
export default async function AgentAnalyticsPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading agent analytics.</p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const [home, gaPresent, activity] = await Promise.all([
    getHome(tenantId),
    hasAnalyticsEvents(tenantId),
    tenant.supabase
      .from('v_ledger_capability_activity')
      .select('capability, window_start, asked, denied, held, approved, executed')
      .eq('tenant_id', tenantId)
      .order('window_start', { ascending: false })
      .limit(100),
  ])

  const rows: ActivityCountRow[] | null = activity.error ? null : ((activity.data ?? []) as ActivityCountRow[])
  const lastPush = home?.last_push_at ?? null
  const hasPush = Boolean(lastPush && Number.isFinite(Date.parse(lastPush)))
  // A single unknown asked value would otherwise be silently added as zero.
  const totalAsked = sumNullableCounts((rows ?? []).map((row) => row.asked))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Agent analytics"
        description="Ledger-derived counts and GA events are separate evidence families. Neither one is a claim that a capability is live."
        actions={
          <Link href="/analytics" className="btn">
            Full evidence view
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Last push"
          value={hasPush && lastPush ? new Date(lastPush).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown'}
          hint={hasPush ? 'From the durable tenant home row.' : 'No push heard yet — unknown, not healthy.'}
          tone={hasPush ? 'good' : 'warn'}
        />
        <KpiCard
          label="Ledger-derived asks"
          value={totalAsked === null ? 'unknown' : totalAsked}
          hint="Sum of the newest 100 ledger activity rows. An unreadable or empty window is unknown."
          tone={totalAsked === null ? 'warn' : 'default'}
        />
        <KpiCard
          label="GA events"
          value={gaPresent ? 'Events present' : 'Not available in this environment'}
          hint={gaPresent ? 'Events are recorded; this page does not report a count or infer conversion.' : 'No event readout is exposed here — never rendered as zero.'}
        />
      </section>

      <Section
        title="Ledger-derived counts"
        description="From v_ledger_capability_activity through the session client and RLS. Null counts render unknown, never zero."
      >
        {rows === null ? (
          <Callout tone="warning" title="Counts unavailable">
            The activity view could not be read. Nothing is inferred from the failed read.
          </Callout>
        ) : rows.length === 0 ? (
          <div className="panel p-5">
            <p className="text-[13px] text-bone-dim">
              {hasPush
                ? 'No ledger activity rows received in this window. No count is shown.'
                : 'No ledger rows received and no push heard — activity is unknown, not healthy zero.'}
            </p>
          </div>
        ) : (
          <div className="panel hidden overflow-x-auto md:block">
            <table className="table min-w-[720px]">
              <caption className="sr-only">Ledger-derived activity counts by capability and week</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Window</th>
                  {FACTORS.map((factor) => (
                    <th key={factor} scope="col">{factor}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.capability}:${row.window_start}`}>
                    <td className="font-mono text-[12px] text-bone">{row.capability}</td>
                    <td className="font-mono text-[11px] text-bone-faint">{row.window_start.slice(0, 10)}</td>
                    {FACTORS.map((factor) => (
                      <td key={factor} className="tabular text-[12px] text-bone-dim">{count(row[factor])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="GA events" description="A separate source with a separate honesty rule.">
        <Callout tone="info" title={gaPresent ? 'Events recorded' : 'Not available in this environment'}>
          {gaPresent
            ? 'An analytics event exists for this tenant. This page reports presence only; it does not convert events into capability counts or conversion claims.'
            : 'No GA event readout is available here. This is not a zero — no count or conclusion is drawn from it.'}
        </Callout>
      </Section>
    </div>
  )
}
