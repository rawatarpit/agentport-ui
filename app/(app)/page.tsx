import Link from 'next/link'
import { Badge } from '@/components/stat'
import { Callout } from '@/components/ui/callout'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'
import { getHome } from '@/lib/backend-reads'
import { listDecisions, listHolds } from '@/lib/console-reads'
import { getGoLiveState, type GoLiveStepState } from '@/lib/go-live'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

function formatWhen(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function stepTone(state: GoLiveStepState): StatusTone {
  if (state === 'done') return 'live'
  if (state === 'current') return 'draft'
  if (state === 'blocked') return 'blocked'
  return 'unknown'
}

function stepLabel(state: GoLiveStepState): string {
  if (state === 'done') return 'Done'
  if (state === 'current') return 'Next'
  if (state === 'blocked') return 'Blocked'
  return 'Later'
}

/**
 * The overview is the merchant's home. It answers three questions in order:
 * 1. Is my site protected right now?
 * 2. What do I need to do next?
 * 3. What has actually happened?
 *
 * Drafts are never live. Unknown stays unknown — never a healthy zero.
 */
export default async function Overview() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') return null

  const tenantId = tenant.active.tenantId
  const [state, home, holds, decisions] = await Promise.all([
    getGoLiveState(tenantId, { role: tenant.active.membership.role }),
    getHome(tenantId),
    listHolds(tenantId, 50),
    listDecisions(tenantId, 6),
  ])

  const done = state.steps.filter((s) => s.state === 'done').length
  const total = state.steps.length
  const next = state.nextStep
  const waiting = holds.length
  const calls = home?.event_count ?? null
  const lastPush = home?.last_push_at ?? null
  const published = state.published

  return (
    <div className="space-y-6">
      {/* Top banner: status + one clear next action */}
      <div className="rounded-xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="label">Your agent safety</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold leading-tight text-bone sm:text-[28px]">
            {published
              ? 'Your site is protected'
              : state.phase === 'not-started'
                ? 'Not set up yet'
                : 'Setup in progress'}
          </h1>
          <p className="mt-1 text-[13px] text-bone-dim">
            {published
              ? 'Agent calls are governed by your published rules. Nothing runs without a decision.'
              : state.phase === 'not-started'
                ? 'Connect your site and map the pages agents may use. Nothing is live until you publish.'
                : 'Almost there — finish the remaining step below.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={published ? 'live' : state.phase === 'not-started' ? 'unknown' : 'draft'}>
            {published ? 'Live' : state.phase === 'not-started' ? 'Not started' : 'In setup'}
          </StatusPill>
          <Link
            href={next ? `/go-live#${next.id}` : '/go-live'}
            className={`btn btn-primary ${published ? 'btn-quiet' : ''}`}
          >
            {published ? 'Open go-live' : state.phase === 'not-started' ? 'Get started' : next?.actionLabel ?? 'Continue setup'}
          </Link>
        </div>
      </div>

      {/* Waiting on you callout */}
      {waiting > 0 ? (
        <Callout tone="warning" title={`${waiting} request${waiting === 1 ? '' : 's'} waiting for your decision`}>
          <p>Nothing held has executed. Review and approve or refuse them.</p>
          <p className="mt-2">
            <Link href="/approvals" className="link">
              Review the queue →
            </Link>
          </p>
        </Callout>
      ) : null}

      {/* KPI row - plain language */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5">
          <p className="label">Agent calls today</p>
          <p className={`tabular mt-2 font-display text-[32px] leading-none ${calls === null ? 'text-bone-faint' : 'text-bone'}`}>
            {calls === null ? '—' : calls}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-bone-faint">
            {calls === null ? 'No activity recorded yet — unknown, not zero' : 'Recorded by the hosted governor'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Waiting for you</p>
          <p className={`tabular mt-2 font-display text-[32px] leading-none ${waiting > 0 ? 'text-amber' : 'text-verdant'}`}>
            {waiting}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-bone-faint">
            {waiting > 0 ? 'Held for your approval — nothing executes until you decide' : 'Nothing held'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Site connected</p>
          <p className={`tabular mt-2 font-display text-[32px] leading-none ${state.siteUrl ? 'text-verdant' : 'text-bone-faint'}`}>
            {state.siteUrl ?? '—'}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-bone-faint">
            {state.siteUrl ? 'Your public address is set' : 'Not set yet — add it in setup'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Setup progress</p>
          <p className={`tabular mt-2 font-display text-[32px] leading-none text-bone`}>
            {done} of {total}
          </p>
          <div className="h-1.5 mt-2 overflow-hidden rounded-full bg-ink-line/50" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={`Setup progress: ${done} of ${total}`}>
            <div className="h-full rounded-full bg-verdant/70" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-bone-faint">{done} of {total} steps done</p>
        </div>
      </section>

      {/* Latest activity */}
      <Section
        title="Latest activity"
        description="Decisions the hosted governor actually made. A refusal names the rule that fired."
        action={<Link href="/ledger" className="btn btn-sm">Full ledger →</Link>}
      >
        {decisions.length === 0 ? (
          <EmptyState
            title="No decisions recorded yet"
            body="The ledger is empty until the hosted governor serves a call. This is unknown, not a healthy zero."
            action={
              published ? (
                <Link href="/go-live#verify" className="btn btn-primary">
                  Verify your site
                </Link>
              ) : (
                <Link href="/go-live" className="btn btn-primary">
                  Finish setup
                </Link>
              )
            }
          />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['When', 'What happened', 'Decision', 'Rule', 'Agent'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => {
                  const held = d.decision === 'require_approval'
                  return (
                    <tr key={d.requestId} className="border-b border-ink-line/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-bone-faint">
                        {formatWhen(d.at)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-bone">{d.capability}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={d.decision === 'allow' ? 'allow' : held ? 'held' : 'deny'}>
                          {d.decision === 'allow' ? 'Allowed' : held ? 'Held' : 'Refused'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-bone-dim">{d.rule || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-bone-faint">{d.agentId}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Simple setup checklist */}
      {state.steps.length > 0 && (
        <Section
          title="Setup steps"
          description="One at a time. The first unfinished step is your next action."
          action={<Link href="/go-live" className="btn btn-sm">Open go-live</Link>}
        >
          <ol className="grid gap-2 sm:grid-cols-2">
            {state.steps.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/go-live#${s.id}`}
                  className={`flex h-full items-start justify-between gap-3 rounded-lg border p-3.5 transition-colors ${
                    s.state === 'current'
                      ? 'border-verdant/40 bg-verdant/[0.06] hover:border-verdant/60'
                      : 'border-ink-line bg-ink-soft/40 hover:border-verdant/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-bone-faint">{s.number}</span>
                      <span className="text-[13.5px] text-bone">{s.title}</span>
                    </span>
                    <span className="mt-1 block text-[12px] leading-snug text-bone-faint">{s.summary}</span>
                  </span>
                  <StatusPill tone={stepTone(s.state)}>{stepLabel(s.state)}</StatusPill>
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}
