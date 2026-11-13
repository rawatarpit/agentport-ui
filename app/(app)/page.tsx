import Link from 'next/link'
import { Badge, Stat } from '@/components/stat'
import { Chip } from '@/components/ui/chip'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StepRail, type RailStep } from '@/components/ui/step-rail'
import { listDecisions, listHolds } from '@/lib/console-reads'
import { getHome } from '@/lib/backend-reads'
import { getGoLiveState, type GoLiveStepId } from '@/lib/go-live'
import { agentAttribution, decisionLabel } from '@/lib/ledger-summary'
import { resolveRequestTenant } from '@/lib/tenant-server'
import type { LedgerEntry } from '@/lib/contracts'

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

function decisionTone(decision: LedgerEntry['decision']): 'allow' | 'deny' | 'held' {
  if (decision === 'allow') return 'allow'
  if (decision === 'deny') return 'deny'
  return 'held'
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

  const [state, home, holdsRead, decisionsRead, inventory] = await Promise.all([
    getGoLiveState(tenantId, { role }),
    getHome(tenantId),
    readOrUnknown(listHolds(tenantId, 200)),
    readOrUnknown(listDecisions(tenantId, 5)),
    tenant.supabase
      .from('agent_capabilities')
      .select('name, method, path, kind')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true }),
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Mapped routes"
          value={capabilities === null ? 'unknown' : capabilities.length}
          hint={
            capabilities === null
              ? 'The capability inventory could not be read.'
              : capabilities.length === 0
                ? 'No routes approved yet. The catalogue alone is not a runtime.'
                : 'Approved inventory; the governor serves only what is published. Draft edits do not count.'
          }
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

      <Section
        title="Mapped capabilities"
        description="The approved inventory, not the draft in the editor. A route runs only once it is in the applied config the governor serves."
        action={
          <Link href="/map" className="btn">
            Review routes
          </Link>
        }
      >
        {capabilities === null ? (
          <div className="panel p-5">
            <p className="text-[13px] text-rust" role="alert">
              The capability inventory could not be read. This is unknown — not an empty inventory.
            </p>
          </div>
        ) : capabilities.length === 0 ? (
          <div className="panel p-5">
            <p className="text-[13px] text-bone-dim">
              No routes are mapped yet. Map at least one before publishing; an empty inventory is an honest empty state, not a live agent.
            </p>
            <Link href="/map" className="btn mt-3">
              Map routes
            </Link>
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['Capability', 'Method', 'Path', 'Access'].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capabilities.map((c) => (
                  <tr key={`${c.method}-${c.path}-${c.name}`} className="border-b border-ink-line/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-bone">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-bone-faint">
                      {c.method}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-bone-dim">{c.path}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={c.kind === 'write' ? 'held' : 'idle'}>{c.kind}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Recent decisions"
        description="The latest rows from the merchant's own ledger. Counts and outcomes only; amounts and parameters never reach this projection."
        action={
          <Link href="/ledger" className="btn">
            Full ledger
          </Link>
        }
      >
        {decisionsRead.failed ? (
          <div className="panel p-5">
            <p className="text-[13px] text-rust" role="alert">
              The ledger could not be read. This is unknown — not an empty ledger. Reload to try again.
            </p>
          </div>
        ) : decisionsRead.rows.length === 0 ? (
          <div className="panel p-5">
            <p className="text-[13px] text-bone-dim">
              No decisions recorded yet. That is unknown, not zero — nothing has been heard from an agent.
            </p>
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="table min-w-[760px]">
              <caption className="sr-only">
                Recent decisions: when, agent name and attribution source, capability and access, decision, and rule
              </caption>
              <thead>
                <tr>
                  {['When', 'Agent', 'Capability', 'Decision', 'Rule'].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisionsRead.rows.map((d) => {
                  const agent = agentAttribution(d)
                  return (
                    <tr key={`${d.requestId}-${d.at}`}>
                      <td className="font-mono text-[11px] text-bone-faint">{when(d.at)}</td>
                      <td>
                        <div className="font-mono text-[12px] text-bone-dim">{agent.name}</div>
                        {!agent.trusted ? (
                          <div className="mt-1">
                            <Chip tone={agent.source === 'declared' ? 'warn' : 'neutral'} title={agent.title}>
                              {agent.chip}
                            </Chip>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="font-mono text-[12px] text-bone">{d.capability}</div>
                        {d.access ? (
                          <div className="mt-1">
                            <Chip tone={d.access === 'write' ? 'warn' : 'neutral'}>{d.access}</Chip>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={decisionTone(d.decision)}>{decisionLabel(d.decision)}</Badge>
                      </td>
                      <td className="text-[12px] text-bone-faint">{d.rule || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

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
