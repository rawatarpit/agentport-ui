import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'
import { readAcquisitionCounts } from '@/lib/funnel-reads'
import { FUNNEL_EVENT_TYPES, type FunnelEventType } from '@/lib/funnel-event-types'

export const dynamic = 'force-dynamic'

/**
 * Funnel dashboard — acquisition and activation metrics for the caller's
 * tenant.
 *
 * Every number comes from a stored row. When no row exists, the metric
 * renders as `unknown`, never zero. No conversion percentages are shown
 * until the underlying event definitions and denominators are verified.
 */

type ActivationEvent = {
  event_kind: string
  first_at: string | null
}

type MetricCopy = { label: string; description: string }

const ACQUISITION_COPY: Record<FunnelEventType, MetricCopy> = {
  intelligence_viewed: {
    label: 'Intelligence viewed',
    description: 'Visitors who opened the industry preview.',
  },
  report_generated: {
    label: 'Reports generated',
    description: 'Reports built from visitor answers; sourced gaps stay unknown.',
  },
  report_saved: {
    label: 'Reports saved',
    description: 'Durable snapshots saved to the workspace.',
  },
  report_refreshed: {
    label: 'Reports refreshed',
    description: 'Saved snapshots regenerated from public sources.',
  },
  signup_started: {
    label: 'Signups started',
    description: 'Visitors who began account creation.',
  },
  signup_completed: {
    label: 'Signups completed',
    description: 'Accounts created and confirmed.',
  },
  assessment_started: {
    label: 'Assessments started',
    description: 'Public-surface scans initiated.',
  },
  assessment_completed: {
    label: 'Assessments completed',
    description: 'Scans that returned results.',
  },
  installation_started: {
    label: 'Installations started',
    description: 'Merchants who began the connection flow.',
  },
  github_app_installed: {
    label: 'GitHub app installed',
    description: 'Merchant installed the GitHub App.',
  },
  repository_connected: {
    label: 'Repository connected',
    description: 'Install PR opened for a specific repository.',
  },
  pull_request_created: {
    label: 'Pull request created',
    description: 'Install pull request opened on the connected repository.',
  },
  configuration_applied: {
    label: 'Configuration applied',
    description: 'Applied config version is live and served by the governor.',
  },
  installation_completed: {
    label: 'Installation completed',
    description: 'Config applied — installation flow complete.',
  },
  deployment_verified: {
    label: 'Deployments verified',
    description: 'Governor manifest checks that returned 200 with matching tenant.',
  },
  merchant_profile_completed: {
    label: 'Profiles completed',
    description: 'Onboarding facts saved (public facts, not secrets).',
  },
  industry_selected: {
    label: 'Industries selected',
    description: 'Selections counted without storing the entered text.',
  },
  geography_selected: {
    label: 'Geographies selected',
    description: 'Selections counted without storing the entered text.',
  },
  signup_submitted: {
    label: 'Signup forms submitted',
    description: 'Account creation forms submitted.',
  },
  verification_email_sent: {
    label: 'Verification emails sent',
    description: 'Confirmation requests issued after signup.',
  },
  recommendation_viewed: {
    label: 'Recommendations viewed',
    description: 'Opportunity maps opened from the tenant profile.',
  },
  intelligence_page_viewed: {
    label: 'Intelligence pages viewed',
    description: 'Visits to the public intelligence page.',
  },
  report_viewed: {
    label: 'Reports viewed',
    description: 'Rendered report views emitted through the shared helper.',
  },
  integration_started: {
    label: 'Integrations started',
    description: 'Signed-in merchants who began the install flow.',
  },
  integration_completed: {
    label: 'Integrations completed',
    description: 'Install flow finished once the governor serves the applied config.',
  },
  pilot_requested: {
    label: 'Pilot requests',
    description: 'Founding-pilot requests recorded by the contact path.',
  },
  hero_primary_cta_clicked: {
    label: 'Hero primary CTA clicks',
    description: 'Clicks on the landing page’s primary action.',
  },
  hero_demo_cta_clicked: {
    label: 'Hero demo CTA clicks',
    description: 'Clicks on the landing page’s demo action.',
  },
  product_demo_interaction: {
    label: 'Demo interactions',
    description: 'Sample-policy interactions; no request text is stored.',
  },
  integration_section_viewed: {
    label: 'Integration section views',
    description: 'Visitors who reached the integration section.',
  },
  pilot_section_viewed: {
    label: 'Pilot section views',
    description: 'Visitors who reached the pilot section.',
  },
  pilot_form_started: {
    label: 'Pilot forms started',
    description: 'First real field change on the pilot form.',
  },
  pilot_form_submitted: {
    label: 'Pilot forms submitted',
    description: 'Contact requests recorded by the contact path; honeypot acknowledgements are excluded.',
  },
  pilot_form_submission_failed: {
    label: 'Pilot submission failures',
    description: 'Contact requests that did not succeed.',
  },
}

function when(value: string | null): string {
  if (!value) return 'unknown'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return 'unknown'
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

/**
 * Read first activation event timestamps from the governor's analytics
 * events table. Each kind maps to a funnel stage.
 *
 * `approved`, `executed`, and `denied` are reliable execution/outcome signals:
 * `approved` means a human confirmed a held write, `executed` means the
 * operation ran successfully, `denied` means the request was refused.
 */
async function readActivationEvents(tenantId: string): Promise<ActivationEvent[]> {
  const db = createClient()
  const { data, error } = await db
    .from('analytics_events')
    .select('event_kind, occurred_at')
    .eq('tenant_id', tenantId)
    .in('event_kind', ['approved', 'executed', 'denied'])
    .order('occurred_at', { ascending: true })

  if (error || !data) return []

  const firstByKind: Record<string, string> = {}
  for (const row of data as Array<{ event_kind: string; occurred_at: string }>) {
    if (!firstByKind[row.event_kind]) {
      firstByKind[row.event_kind] = row.occurred_at
    }
  }

  return Object.entries(firstByKind).map(([event_kind, first_at]) => ({
    event_kind,
    first_at,
  }))
}

/**
 * Read the first successful READ execution for the caller's tenant from the
 * ledger console view. A READ is completed only when the request is authorised
 * (decision = 'allow'), targets a read capability (access = 'read'), and the
 * result was recorded as successful (result = 'ok'). The `asked` event kind in
 * analytics_events merely means a request was received — it does not mean it
 * executed.
 */
async function readFirstSuccessfulRead(tenantId: string): Promise<string | null> {
  const db = createClient()
  const { data, error } = await db
    .from('ledger_console_view')
    .select('at')
    .eq('tenant_id', tenantId)
    .eq('access', 'read')
    .eq('decision', 'allow')
    .eq('result', 'ok')
    .order('at', { ascending: true })
    .limit(1)

  if (error || !data || data.length === 0) return null
  const row = data[0] as { at: string }
  return row.at ?? null
}

export default async function FunnelPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading funnel metrics.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          no tenant is read without an explicit selection
        </p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const counts = await readAcquisitionCounts(tenantId)
  const [activationEvents, firstReadAt] = await Promise.all([
    readActivationEvents(tenantId),
    readFirstSuccessfulRead(tenantId),
  ])

  const acquisition = FUNNEL_EVENT_TYPES.map((event_type, index) => ({
    event_type,
    value: counts[index] ?? null,
    ...ACQUISITION_COPY[event_type],
  }))

  const firstWriteApprovedAt = activationEvents.find((e) => e.event_kind === 'approved')?.first_at ?? null
  const firstWriteExecutedAt = activationEvents.find((e) => e.event_kind === 'executed')?.first_at ?? null
  const firstDenyAt = activationEvents.find((e) => e.event_kind === 'denied')?.first_at ?? null

  const hasAnyData =
    acquisition.some((card) => card.value !== null) ||
    activationEvents.length > 0 ||
    firstReadAt !== null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Funnel"
        title="Acquisition and activation"
        description="Every number comes from a stored row. When no row exists, the metric reads as unknown — never zero. Conversion percentages are not shown until the underlying definitions are verified."
        actions={
          <Link href="/insights" className="btn">
            Back to insights
          </Link>
        }
      />

      {!hasAnyData ? (
        <EmptyState
          title="No funnel events yet"
          body="Events attributed to this workspace appear here after the visitor signs in with it. Until then, every metric is unknown — not zero."
          action={
            <Link href="/intelligence" className="btn">
              Open public research
            </Link>
          }
        />
      ) : null}

      <Section title="Acquisition" description="Raw event counts at each funnel stage. Counts are grouped per allowlisted event type; a page reload may generate a new event row for client-emitted events. Server-emitted milestone events use deterministic ids to avoid duplicates on reload.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {acquisition.map((card) => (
            <div className="panel p-5" key={card.event_type}>
              <p className="label">{card.label}</p>
              <p className="mt-2 font-display text-[24px] font-semibold text-bone">
                {card.value === null ? 'unknown' : card.value}
              </p>
              <p className="mt-1 text-[12px] text-bone-faint">{card.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Activation" description="Product activation events from the governor's analytics. First occurrence per event kind; null means no event of that kind has been recorded.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-5">
            <p className="label">First successful READ</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {firstReadAt ? when(firstReadAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First read execution from the ledger console view
              (access = read, decision = allow, result = ok).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Write approved</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {firstWriteApprovedAt ? when(firstWriteApprovedAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First push batch containing an approved write
              (`analytics_events.event_kind = &apos;approved&apos;`).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Write executed</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {firstWriteExecutedAt ? when(firstWriteExecutedAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First push batch containing an executed write
              (`analytics_events.event_kind = &apos;executed&apos;`).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Requests denied</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {firstDenyAt ? when(firstDenyAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First push batch containing a denied request
              (`analytics_events.event_kind = &apos;denied&apos;`).
            </p>
          </div>
        </div>
      </Section>

      <div className="panel p-5">
        <p className="label">How to read this</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          Acquisition events are emitted from the browser at each funnel
          transition and stored in `acquisition_events`, row-level secured to
          your tenant. Activation events come from the governor&apos;s
          `analytics_events` table, which records per-push aggregates
          (`asked`, `denied`, `held`, `approved`, `executed`) — never one row
          per request, never amounts, never PII.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          The first read timestamp comes from an individual ledger row. It is
          not the same evidence as a per-push `analytics_events` aggregate, and
          neither is the same as browser-emitted acquisition telemetry. Marketing
          &amp; Sales reads ledger views separately; it does not turn client
          events into merchant decisions.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          Conversion percentages are intentionally not shown. A percentage
          requires a verified denominator (e.g. &quot;of visitors who viewed
          intelligence, how many signed up?&quot;), and the definitions are still
          being validated against live data.
        </p>
      </div>
    </div>
  )
}
