import Link from 'next/link'
import { Stat } from '@/components/stat'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StepRail, type RailStep } from '@/components/ui/step-rail'
import { listDecisions, listHolds } from '@/lib/console-reads'
import { getHome } from '@/lib/backend-reads'
import { getGoLiveState, type GoLiveStepId } from '@/lib/go-live'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * Overview: one page that answers "is anything running, and what needs me?".
 *
 * Everything below is read from durable rows through the session client. The
 * previous version rendered invented activity and read `state.capabilities`
 * from a response that never had that field; a merchant acting on a demo row
 * is the failure this page exists to prevent. Missing rows render `unknown`,
 * never a healthy zero.
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

/** Journey rail hrefs used on the Overview page (page links, not anchors). */
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
    tenant.supabase
      .from('agent_capabilities')
      .select('name, method, path, kind')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true }),
    fetch('/api/analytics/sector')
      .then(async (r) => {
        if (!r.ok) return null
        return r.json()
      })
      .catch(() => null),
  ])

  // A failed inventory read is unknown, not an empty inventory. The mapping
  // count on the go-live state swallows the same failure, so this page reads
  // the table directly and reports the difference.
  const capabilities = inventory.error ? null : (inventory.data ?? [])
  const next = state.nextStep

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={state.businessName}
        description="What is live, what is still a draft, and what is waiting on you. Nothing here enforces anything — the hosted governor decides, and the ledger is the record."
        actions={
          <>
            <Link href="/go-live" className="btn btn-primary">
              {state.liveArtifactUnknown ? 'Check go-live' : state.published ? 'Review go-live' : 'Go live'}
            </Link>
            <Link href="/ledger" className="btn">
              Read the ledger
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Waiting on you"
          value={holdsRead.failed ? 'unknown' : holdsRead.rows.length}
          hint={
            holdsRead.failed
              ? 'The approval queue could not be read. Unknown, not zero.'
              : 'Held requests in the latest 200 decisions. None of these have run.'
          }
          tone={!holdsRead.failed && holdsRead.rows.length > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="Published version"
          value={
            state.liveArtifactUnknown
              ? 'unknown'
              : state.liveArtifact
                ? `v${state.liveArtifact.version}`
                : 'not published'
          }
          hint={
            state.liveArtifactUnknown
              ? 'The live config read failed. Unknown, not unpublished.'
              : state.liveArtifact
                ? `Activated ${when(state.liveArtifact.publishedAt)}.`
                : 'A saved draft is not live. Publish from go-live.'
          }
          tone={state.liveArtifactUnknown ? 'warn' : state.liveArtifact ? 'good' : 'warn'}
        />
        <Stat
          label="Last agent activity"
          value={
            decisionsRead.failed
              ? 'unknown'
              : decisionsRead.rows.length > 0
                ? when(decisionsRead.rows[0].at)
                : 'unknown'
          }
          hint={
            decisionsRead.failed
              ? 'The ledger could not be read. Unknown, not zero.'
              : home?.last_push_at
                ? 'From the durable ledger. An empty window is unknown, not zero.'
                : 'No push heard yet — unknown, not healthy.'
          }
          tone={decisionsRead.failed || decisionsRead.rows.length === 0 ? 'warn' : 'default'}
        />
        <Stat
          label="Sector benchmark"
          value={
            sectorRead === null || sectorRead === undefined
              ? 'unknown'
              : sectorRead.hasSector === false
                ? 'not set'
                : sectorRead.percentile === null
                  ? 'unknown'
                  : `top ${101 - sectorRead.percentile}%`
          }
          hint={
            sectorRead === null || sectorRead === undefined
              ? 'Sector benchmark could not be read.'
              : sectorRead.hasSector === false
                ? 'Set your industry and sector in setup to see benchmarks.'
                : sectorRead.medianEvents === null
                  ? 'Not enough peers in your sector yet.'
                  : `You are at ${sectorRead.myEvents ?? 0} events vs. sector median ${sectorRead.medianEvents}.`
          }
          tone={sectorRead === null || sectorRead === undefined || sectorRead.hasSector === false ? 'default' : 'good'}
        />
      </section>

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

      {next ? (
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="label">Mapped routes</p>
            <p className="text-sm font-semibold text-slate-600">{capabilities === null ? 'unknown' : capabilities.length}</p>
            <p className="text-xs text-slate-400">
              {capabilities === null
                ? 'The capability inventory could not be read.'
                : capabilities.length === 0
                  ? 'No routes approved yet.'
                  : 'The governor serves only what is published.'}
            </p>
          </div>
          <Link href="/map" className="btn btn-sm">
            Review routes
          </Link>
        </div>
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="label">Held decisions</p>
            <p className="text-sm font-semibold text-slate-600">{holdsRead.failed ? 'unknown' : holdsRead.rows.length}</p>
            <p className="text-xs text-slate-400">
              {holdsRead.failed ? 'The approval queue could not be read.' : 'Policy required approval. Nothing has executed.'}
            </p>
          </div>
          <Link href="/ledger" className="btn btn-sm">
            Read the ledger
          </Link>
        </div>
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="label">Published version</p>
            <p className="text-sm font-semibold text-slate-600">
              {state.liveArtifactUnknown ? 'unknown' : state.liveArtifact ? `v${state.liveArtifact.version}` : 'not published'}
            </p>
            <p className="text-xs text-slate-400">
              {state.liveArtifactUnknown ? 'The live config read failed.' : state.published ? 'Activated on its next poll.' : 'A saved draft is not live.'}
            </p>
          </div>
          <Link href="/go-live" className="btn btn-sm">
            Publish channel
          </Link>
        </div>
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="label">Sector benchmark</p>
            <p className="text-sm font-semibold text-slate-600">
              {sectorRead === null || sectorRead === undefined ? 'unknown' : sectorRead.hasSector === false ? 'not set' : sectorRead.percentile === null ? 'unknown' : `top ${101 - sectorRead.percentile}%`}
            </p>
            <p className="text-xs text-slate-400">
              {sectorRead === null || sectorRead === undefined ? 'Sector benchmark could not be read.' : sectorRead.hasSector === false ? 'Set your industry and sector in setup.' : 'Compared against merchants in your sector.'}
            </p>
          </div>
          <Link href="/setup" className="btn btn-sm">
            Set sector
          </Link>
        </div>
      </section>

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
