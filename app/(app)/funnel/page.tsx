import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'
import { readAcquisitionCounts } from '@/lib/funnel-reads'

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

type FunnelMetrics = {
  intelligenceViewed: number | null
  reportGenerated: number | null
  reportSaved: number | null
  signupStarted: number | null
  signupCompleted: number | null
  assessmentStarted: number | null
  assessmentCompleted: number | null
  installationStarted: number | null
  githubAppInstalled: number | null
  repositoryConnected: number | null
  pullRequestCreated: number | null
  configurationApplied: number | null
  installationCompleted: number | null
  deploymentVerified: number | null
  merchantProfileCompleted: number | null
  firstReadAt: string | null
  firstWriteApprovedAt: string | null
  firstWriteExecutedAt: string | null
  firstDenyAt: string | null
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

  const [
    intelligenceViewed,
    reportGenerated,
    reportSaved,
    signupStarted,
    signupCompleted,
    assessmentStarted,
    assessmentCompleted,
    installationStarted,
    githubAppInstalled,
    repositoryConnected,
    pullRequestCreated,
    configurationApplied,
    installationCompleted,
    deploymentVerified,
    merchantProfileCompleted,
  ] = await readAcquisitionCounts(tenantId)
  const [activationEvents, firstReadAt] = await Promise.all([
    readActivationEvents(tenantId),
    readFirstSuccessfulRead(tenantId),
  ])

  const firstWriteApprovedAt = activationEvents.find((e) => e.event_kind === 'approved')?.first_at ?? null
  const firstWriteExecutedAt = activationEvents.find((e) => e.event_kind === 'executed')?.first_at ?? null
  const firstDenyAt = activationEvents.find((e) => e.event_kind === 'denied')?.first_at ?? null

  const metrics: FunnelMetrics = {
    intelligenceViewed,
    reportGenerated,
    reportSaved,
    signupStarted,
    signupCompleted,
    assessmentStarted,
    assessmentCompleted,
    installationStarted,
    githubAppInstalled,
    repositoryConnected,
    pullRequestCreated,
    configurationApplied,
    installationCompleted,
    deploymentVerified,
    merchantProfileCompleted,
    firstReadAt,
    firstWriteApprovedAt,
    firstWriteExecutedAt,
    firstDenyAt,
  }

  const hasAnyData = Object.values(metrics).some((v) => v !== null)

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
          body="Acquisition events appear here as visitors view intelligence previews, sign up, run assessments, and install. Until then, every metric is unknown — not zero."
          action={
            <Link href="/intelligence" className="btn">
              Open public research
            </Link>
          }
        />
      ) : null}

      <Section title="Acquisition" description="Raw event counts at each funnel stage. Counts are grouped per event type; a page reload may generate a new event row for client-emitted events. Server-emitted milestone events use deterministic ids to avoid duplicates on reload.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-5">
            <p className="label">Intelligence viewed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.intelligenceViewed === null ? 'unknown' : metrics.intelligenceViewed}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Visitors who opened the intelligence preview.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Reports generated</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.reportGenerated === null ? 'unknown' : metrics.reportGenerated}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Sourced reports built from visitor answers.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Reports saved</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.reportSaved === null ? 'unknown' : metrics.reportSaved}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Durable snapshots saved to the workspace.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Signups started</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.signupStarted === null ? 'unknown' : metrics.signupStarted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Visitors who began account creation.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Signups completed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.signupCompleted === null ? 'unknown' : metrics.signupCompleted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Accounts created and confirmed.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Profiles completed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.merchantProfileCompleted === null ? 'unknown' : metrics.merchantProfileCompleted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Onboarding facts saved (public facts, not secrets).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">GitHub app installed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.githubAppInstalled === null ? 'unknown' : metrics.githubAppInstalled}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Merchant installed the GitHub App.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Repository connected</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.repositoryConnected === null ? 'unknown' : metrics.repositoryConnected}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Install PR opened for a specific repository.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Pull request created</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.pullRequestCreated === null ? 'unknown' : metrics.pullRequestCreated}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Install pull request opened on the connected repository.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Configuration applied</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.configurationApplied === null ? 'unknown' : metrics.configurationApplied}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Applied config version is live and served by the governor.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Installation completed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.installationCompleted === null ? 'unknown' : metrics.installationCompleted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Config applied — installation flow complete.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Assessments started</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.assessmentStarted === null ? 'unknown' : metrics.assessmentStarted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Public-surface scans initiated.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Assessments completed</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.assessmentCompleted === null ? 'unknown' : metrics.assessmentCompleted}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Scans that returned results.
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Deployments verified</p>
            <p className="mt-2 font-display text-[24px] font-semibold text-bone">
              {metrics.deploymentVerified === null ? 'unknown' : metrics.deploymentVerified}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              Governor manifest checks that returned 200 with matching tenant.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Activation" description="Product activation events from the governor's analytics. First occurrence per event kind; null means no event of that kind has been recorded.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-5">
            <p className="label">First successful READ</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {metrics.firstReadAt ? when(metrics.firstReadAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First read execution from the ledger console view
              (access = read, decision = allow, result = ok).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Write approved</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {metrics.firstWriteApprovedAt ? when(metrics.firstWriteApprovedAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First push batch containing an approved write
              (`analytics_events.event_kind = &apos;approved&apos;`).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Write executed</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {metrics.firstWriteExecutedAt ? when(metrics.firstWriteExecutedAt) : 'unknown'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              First push batch containing an executed write
              (`analytics_events.event_kind = &apos;executed&apos;`).
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Requests denied</p>
            <p className="mt-2 font-display text-[20px] font-semibold text-bone">
              {metrics.firstDenyAt ? when(metrics.firstDenyAt) : 'unknown'}
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
