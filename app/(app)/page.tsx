import Link from 'next/link'
import { Stat } from '@/components/stat'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { SectionIndex } from '@/components/ui/section-index'
import { StateStrip } from '@/components/ui/state-strip'
import { StepRail, type RailStep } from '@/components/ui/step-rail'
import { listDecisions, listHolds } from '@/lib/console-reads'
import { getHome } from '@/lib/backend-reads'
import { readSectorBenchmark } from '@/lib/analytics-sector-read'
import { getGoLiveState, type GoLiveStepId } from '@/lib/go-live'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * Overview answers one question: what needs the merchant now?
 *
 * Every fact below comes from an existing session-scoped read. A failed read
 * stays unknown; a successful empty window says so without becoming zero.
 */

const NEXT_HREF: Record<GoLiveStepId, string> = {
  site: '/go-live#site',
  capabilities: '/map',
  rules: '/rules',
  github: '/go-live#github',
  'pull-request': '/go-live#pull-request',
  publish: '/go-live#publish',
  verify: '/go-live#verify',
}

const STEP_HREF: Record<GoLiveStepId, string> = {
  site: '/setup',
  capabilities: '/map',
  rules: '/rules',
  github: '/connect',
  'pull-request': '/go-live#pull-request',
  publish: '/go-live#publish',
  verify: '/go-live#verify',
}

function when(value: string | null | undefined): string {
  if (!value) return 'unknown'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return 'unknown'
  return `${new Date(parsed).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

/** A failed read is `unknown`, never an empty list that reads as zero. */
async function readOrUnknown<T>(read: Promise<T[]>): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await read, failed: false }
  } catch {
    return { rows: [], failed: true }
  }
}

export default async function OverviewPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading this page.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          no tenant is read without an explicit selection
        </p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const role = tenant.active.membership.role

  const [state, home, holdsRead, decisionsRead, inventory, sectorRead] = await Promise.all([
    getGoLiveState(tenantId, { role }),
    getHome(tenantId),
    readOrUnknown(listHolds(tenantId, 200)),
    readOrUnknown(listDecisions(tenantId, 5)),
    tenant.supabase.from('agent_capabilities').select('name').eq('tenant_id', tenantId),
    readSectorBenchmark(tenantId).catch(() => null),
  ])

  const next = state.nextStep
  const publishedValue = state.liveArtifactUnknown
    ? 'unknown'
    : state.liveArtifact
      ? `Applied v${state.liveArtifact.version}`
      : 'Not applied'
  const publishedTone = state.liveArtifactUnknown ? 'unknown' : state.liveArtifact ? 'ready' : 'draft'
  const holdValue = holdsRead.failed ? 'unknown' : String(holdsRead.rows.length)
  const holdTone = holdsRead.failed || holdsRead.rows.length === 0 ? 'unknown' : 'blocked'
  const pushValue = decisionsRead.failed || decisionsRead.rows.length === 0 ? 'unknown' : when(decisionsRead.rows[0].at)
  const pushTone = 'unknown'
  const pushNote = decisionsRead.failed
    ? 'The ledger could not be read. Unknown, not zero.'
    : decisionsRead.rows.length === 0
      ? home?.last_push_at
        ? 'A runtime push was heard; no decision is in the newest ledger window yet.'
        : 'No push heard yet — unknown, not healthy.'
      : 'From the durable ledger. An empty window is unknown, not zero.'

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={state.businessName}
        description="What is live, what is still a draft, and what is waiting on you. Nothing here enforces anything — the hosted governor decides, and the ledger is the record."
        actions={
          <>
            <Link href="/ledger" className="btn">Read the ledger</Link>
            <Link href="/proof" className="btn btn-primary">Review proof</Link>
          </>
        }
      />

      <StateStrip
        items={[
          {
            term: 'Published version',
            value: publishedValue,
            tone: publishedTone,
            note: state.liveArtifactUnknown
              ? 'The applied config read failed.'
              : state.liveArtifact
                ? 'Applied config is not proof the governor serves it.'
                : 'A saved draft is not live. Publish from go-live.',
          },
          {
            term: 'Waiting on you',
            value: holdValue,
            tone: holdTone,
            note: holdsRead.failed
              ? 'The approval queue could not be read. Unknown, not zero.'
              : holdsRead.rows.length === 0
                ? 'No held requests in the latest 200 decisions. An empty window is not proof nothing will be held.'
                : 'Held requests in the latest 200 decisions. None of these have run.',
          },
          {
            term: 'Last agent activity',
            value: pushValue,
            tone: pushTone,
            note: pushNote,
          },
          {
            term: 'Sector benchmark',
            value:
              sectorRead === null || sectorRead === undefined
                ? 'unknown'
                : sectorRead.hasSector === false
                  ? 'not set'
                  : sectorRead.percentileBand ?? 'unknown',
            tone: 'unknown',
            note:
              sectorRead === null || sectorRead === undefined
                ? 'Sector benchmark could not be read.'
                : sectorRead.hasSector === false
                  ? 'Set your industry and sector in setup to see benchmarks.'
                  : 'Coarse band only. Cohort size, median and exact percentile are withheld; freshness is unknown until a dated producer exists.',
          },
        ]}
      />

      {next ? (
        <div className="panel-strong flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="label">Next honest step</p>
            <p className="mt-1 font-display text-[17px] font-semibold text-bone">
              {next.number} · {next.title}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{next.summary}</p>
          </div>
          <Link href={NEXT_HREF[next.id]} className="btn btn-primary shrink-0">
            {next.actionLabel}
          </Link>
        </div>
      ) : null}

      <Stat
        label="Mapped routes"
        value={inventory.error ? 'unknown' : (inventory.data ?? []).length}
        hint={
          inventory.error
            ? 'The approved capability inventory could not be read. Unknown, not zero.'
            : (inventory.data ?? []).length === 0
              ? 'No routes approved yet. The governor serves only what is published.'
              : 'The governor serves only what is published.'
        }
        tone="default"
      />

      {state.steps && state.steps.length > 0 ? (
        <Section
          title="Onboarding journey"
          description="Where you are in the journey from setup to live. Each step links to the page where you do the work."
        >
          <StepRail
            steps={state.steps.map((s) => ({
              ...s,
              href: STEP_HREF[s.id as GoLiveStepId],
            })) as RailStep[]}
          />
        </Section>
      ) : null}

      <SectionIndex
        title="Go deeper"
        description="The four reads behind this page, kept separate on purpose."
        items={[
          { href: '/proof', label: 'Proof', hint: 'Applied, served, pushed and recorded facts' },
          { href: '/ledger', label: 'Ledger', hint: 'Full decision record' },
          { href: '/approvals', label: 'Approvals', hint: 'Held requests, decided elsewhere' },
          { href: '/analytics', label: 'Evidence', hint: 'Capability and agent evidence' },
        ]}
      />

      <div className="panel p-5">
        <p className="label">The one rule this page follows</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          A draft is never live, a held request is never executed, and a missing row is{' '}
          <span className="text-bone">unknown</span> — never a healthy zero. The governor decides;
          this page only shows what the ledger can prove.
        </p>
      </div>
    </div>
  )
}
