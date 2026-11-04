import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ConnectSection } from '@/components/connect-section'
import { DiscoveryCheck } from '@/components/discovery-check'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { GolivePanel } from '@/components/golive-panel'
import { WebsiteForm } from '@/components/website-form'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StepRail } from '@/components/ui/step-rail'
import { getGoLiveState } from '@/lib/go-live'
import { normaliseWorkerUrl } from '@/lib/install-package'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * The one go-live journey.
 *
 * Everything here is read from the same durable rows the hosted worker reads:
 * site profile, saved drafts, approved inventory, GitHub installs, PR records,
 * and the live artifact. A saved draft never renders as live, and the final
 * step is a real fetch against the governor — not a badge we granted ourselves.
 *
 * The old page was a four-step client wizard with a hardcoded table and a
 * "your site is now protected" screen that published nothing. It is not
 * restored; this page replaces it.
 */
export default async function GoLivePage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before opening go-live.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">
          no tenant is read without an explicit selection
        </p>
      </div>
    )
  }

  const role = tenant.active.membership.role
  // The reader below collapses an inventory read failure to 0. Read the
  // count here so a failed query renders `unknown` instead of claiming the
  // merchant has no approved routes.
  const [state, inventory] = await Promise.all([
    getGoLiveState(tenant.active.tenantId, { role }),
    tenant.supabase
      .from('agent_capabilities')
      .select('name')
      .eq('tenant_id', tenant.active.tenantId),
  ])
  const inventoryCount = inventory.error ? null : (inventory.data ?? []).length

  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', tenant.active.tenantId)
  const canonicalUrl = worker.ok ? `${worker.url}/.well-known/agent.json` : null
  const invokeUrl = worker.ok ? `${worker.url}/execute` : null

  const draftLabel =
    state.drafts.setup || state.drafts.rules || state.drafts.capabilities
      ? 'a saved draft'
      : 'no draft open'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Go live"
        title={
          state.liveArtifactUnknown
            ? 'Check what is live'
            : state.published
              ? 'Review what is live'
              : 'Put your agent to work'
        }
        description="Seven steps, one order. A draft stays a draft until you publish it, and a publish stays a claim until the governor serves it. Nothing on this page enforces anything itself."
        actions={
          <>
            <Link href="/map" className="btn">
              Map routes
            </Link>
            <Link href="/rules" className="btn">
              Set rules
            </Link>
          </>
        }
      />

      <EnforcingPanel draftLabel={draftLabel} />

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <StepRail steps={state.steps} />

        <div className="space-y-8">
          <section id="site" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">01</p>
                <h2 className="font-display text-[18px] font-semibold text-bone">Set your site address</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                  The public address agents call. It is not this dashboard.
                </p>
              </div>
              {state.siteUrl ? <Badge tone="allow">set</Badge> : <Badge tone="idle">missing</Badge>}
            </div>
            <WebsiteForm current={state.siteUrl} />
          </section>

          <section id="capabilities" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">02</p>
                <h2 className="font-display text-[18px] font-semibold text-bone">Map what agents can call</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                  Only mapped routes are executable. The catalogue alone is not a runtime.
                </p>
              </div>
              <Badge tone={state.draftMapped > 0 ? 'allow' : 'idle'}>
                {state.draftMapped} in draft
              </Badge>
            </div>
            <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[13px] leading-relaxed text-bone-dim">
                {inventoryCount === null ? (
                  <p className="text-rust" role="alert">
                    The approved inventory could not be read. This is unknown — not zero.
                  </p>
                ) : (
                  <p>
                    <span className="text-bone">{inventoryCount}</span> approved route
                    {inventoryCount === 1 ? '' : 's'} in the active inventory.
                  </p>
                )}
                <p className="mt-1">
                  <span className="text-bone">{state.draftMapped}</span> route
                  {state.draftMapped === 1 ? '' : 's'} in the current draft. Draft edits do not
                  reach the governor until you publish.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href="/map" className="btn btn-primary">
                  {state.mappedCount > 0 ? 'Review routes' : 'Map routes'}
                </Link>
                <Link href="/capabilities" className="btn">
                  Field visibility
                </Link>
              </div>
            </div>
          </section>

          <section id="rules" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">03</p>
                <h2 className="font-display text-[18px] font-semibold text-bone">Set the lines</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                  What runs, what waits for you, and what is always no.
                </p>
              </div>
              <Badge tone={state.drafts.setup || state.drafts.rules ? 'allow' : 'idle'}>
                {state.drafts.setup || state.drafts.rules ? 'draft saved' : 'no draft'}
              </Badge>
            </div>
            <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-relaxed text-bone-dim">
                A saved rules draft is not live. Answer the four questions once, or edit the
                exact ordering in the rules editor, then publish in step 06.
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href="/rules" className="btn btn-primary">
                  Open rules
                </Link>
                <Link href="/setup" className="btn">
                  Four questions
                </Link>
              </div>
            </div>
          </section>

          <section id="github" className="scroll-mt-24">
            <div className="mb-3">
              <p className="label">04</p>
              <h2 className="font-display text-[18px] font-semibold text-bone">Connect the site repository</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                Selected repositories only. We verify the installation with GitHub before showing it
                as connected.
              </p>
            </div>
            <ConnectSection />
          </section>

          <section id="pull-request" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">05</p>
                <h2 className="font-display text-[18px] font-semibold text-bone">Open the install PR</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                  The PR adds the discovery files your site serves. It is review, not enforcement.
                </p>
              </div>
              <Badge tone={state.pullRequests.length > 0 ? 'allow' : 'idle'}>
                {state.pullRequests.length} opened
              </Badge>
            </div>
            {state.pullRequests.length === 0 ? (
              <EmptyState
                title="No install PR recorded yet"
                body="Connect GitHub in step 04 and open the PR there. Every later update flows through the publish channel, not another PR."
                action={
                  <a href="#github" className="btn">
                    Go to GitHub
                  </a>
                }
              />
            ) : (
              <ul className="space-y-2">
                {state.pullRequests.map((pr) => (
                  <li
                    key={`${pr.repo}-${pr.number}`}
                    className="panel flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] text-bone">
                        {pr.repo} #{pr.number}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-bone-faint">
                        branch {pr.branch} · recorded {pr.recordedAt.slice(0, 10)}
                      </p>
                    </div>
                    <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-sm">
                      Open PR
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="publish" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">06</p>
                <h2 className="font-display text-[18px] font-semibold text-bone">Publish and activate</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                  Approve the exact bytes, sign locally, upload the envelope. No GitHub? Download
                  the installer in this step — it uses the same compiler.
                </p>
              </div>
              <Badge tone={state.published ? 'allow' : 'idle'}>
                {state.liveArtifactUnknown
                  ? 'unknown'
                  : state.published
                    ? `live v${state.liveArtifact?.version}`
                    : 'not published'}
              </Badge>
            </div>
            <GolivePanel />
          </section>

          <section id="verify" className="scroll-mt-24">
            <div className="mb-3">
              <p className="label">07</p>
              <h2 className="font-display text-[18px] font-semibold text-bone">Verify discovery</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
                A stored artifact proves you signed something. Only a live 200 from the governor
                proves it is being served.
              </p>
            </div>
            <DiscoveryCheck canonicalUrl={canonicalUrl} invokeUrl={invokeUrl} />
          </section>
        </div>
      </div>
    </div>
  )
}
