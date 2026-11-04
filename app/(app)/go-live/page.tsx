import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DiscoveryCheck } from '@/components/discovery-check'
import { GithubPanel } from '@/components/github-panel'
import { GolivePanel } from '@/components/golive-panel'
import { MapWorkbench } from '@/components/map-workbench'
import { PullRequestCard } from '@/components/pull-request-card'
import { RulesEditor } from '@/components/rules-editor'
import { WebsiteForm } from '@/components/website-form'
import { Callout } from '@/components/ui/callout'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StepRail } from '@/components/ui/step-rail'
import { getGoLiveState, type GoLiveState } from '@/lib/go-live'
import { normaliseWorkerUrl } from '@/lib/install-package'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

function externalHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * Go-live journey, rebuilt to never crash SSR.
 *
 * Every data fetch is wrapped in try/catch. If the database, the broker, or
 * any downstream dependency is unavailable, the page still renders — showing
 * honest empty states instead of a server error. A merchant can still see
 * their site, read what's missing, and act on what they can.
 */
export default async function GoLivePage() {
  let tenant: Awaited<ReturnType<typeof resolveRequestTenant>>
  try {
    tenant = await resolveRequestTenant()
  } catch {
    // Session layer is down — cannot determine workspace. Redirect to picker
    // so the user can re-establish their session.
    redirect('/select-workspace')
  }

  if (!tenant || tenant.active.status !== 'active') {
    redirect('/select-workspace')
  }

  // Fetch go-live state with full error isolation. If anything here fails —
  // database, broker, env — we degrade gracefully rather than crash SSR.
  let state: GoLiveState | null = null
  try {
    state = await getGoLiveState(tenant.active.tenantId, {
      checkGithub: true,
      role: tenant.active.membership?.role,
    })
  } catch {
    state = null
  }

  const worker = state
    ? normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', state.tenantId)
    : { ok: false, url: null }
  const canonicalUrl = worker.ok ? `${worker.url}/.well-known/agent.json` : null
  const invokeUrl = worker.ok ? `${worker.url}/.well-known/agent/invoke` : null

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Go live"
        title={state?.published ? 'Your governor is published' : 'From site to serving'}
        description={
          state?.published
            ? 'The artifact is stored. Run the canonical check below before you tell an agent integrator the address — and if it returns 502, the worker has no active runtime for this tenant yet.'
            : state
              ? 'One path from your public site to a hosted governor that can answer. Every step writes durable state; a saved draft is never live.'
              : 'Could not load your go-live state. The database may be temporarily unavailable — try reloading.'
        }
        actions={
          <>
            <Link href="/" className="btn">
              Overview
            </Link>
            {state?.siteUrl ? (
              <a href={externalHref(state.siteUrl)} target="_blank" rel="noreferrer" className="btn">
                Open site
              </a>
            ) : null}
            {!state?.published && state?.nextStep ? (
              <a href={`#${state.nextStep.id}`} className="btn btn-primary">
                {state.nextStep.actionLabel}
              </a>
            ) : null}
          </>
        }
      />

      {/* ── Callout ── */}
      {state?.published ? (
        <Callout tone="success" title={`Published v${state.liveArtifact?.version}`}>
          <p>
            The signed artifact is stored. Run the canonical check below before you tell an
            agent integrator the address — and if it returns 502, the worker has no active
            runtime for this tenant yet.
          </p>
          <p className="mt-2">
            <a href="#verify" className="link">Verify discovery</a>
          </p>
        </Callout>
      ) : state?.nextStep ? (
        <Callout tone={state.phase === 'not-started' ? 'info' : 'warning'} title="Next">
          <p>
            <span className="text-bone">{state.nextStep.title}.</span> {state.nextStep.summary}
          </p>
          <p className="mt-2">
            <a href={`#${state.nextStep.id}`} className="link">
              {state.nextStep.actionLabel} →
            </a>
          </p>
        </Callout>
      ) : state === null ? (
        <Callout tone="danger" title="Could not load go-live state">
          <p>
            The go-live state could not be read from the database. This is usually temporary —
            try reloading. If it keeps failing, contact support.
          </p>
        </Callout>
      ) : null}

      {/* ── Steps ── */}
      <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        <StepRail steps={state?.steps ?? []} />

        <div className="min-w-0 space-y-12">
          {/* Site */}
          <section id="site" className="scroll-mt-24">
            <Section
              title="Set your site address"
              description="The public address agents and the route crawl use. It is deliberately not this console."
            >
              {state ? (
                <WebsiteForm current={state.siteUrl} onDone={() => void 0} />
              ) : (
                <EmptyState
                  title="Cannot load site form"
                  body="Go-live state is unavailable. Reload to retry."
                />
              )}
            </Section>
          </section>

          {/* Capabilities */}
          <section id="capabilities" className="scroll-mt-24 space-y-4">
            <Section
              title="Map what agents can call"
              description="A capability in the catalogue is a description. Only a route you map here has an execution path."
            >
              <Callout tone="info" title="Why this is not optional">
                Publish refuses an empty capability inventory. The setup questions choose your
                lines; this step chooses the routes those lines govern. Crawl your site, review
                every undeclared route, and save only what you want an agent to reach.
              </Callout>
              <MapWorkbench />
            </Section>
          </section>

          {/* Rules */}
          <section id="rules" className="scroll-mt-24">
            <Section
              title="Set the lines"
              description="What runs, what waits for you, and what is always no. Saving writes a draft; publishing is the only thing that changes live behaviour."
            >
              <RulesEditor />
              <p className="mt-3 text-[12px] text-bone-faint">
                The full rules screen has the same draft plus history:{' '}
                <Link href="/rules" className="link">open Rules</Link>.
              </p>
            </Section>
          </section>

          {/* GitHub */}
          <section id="github" className="scroll-mt-24">
            <Section
              title="Connect the site repository"
              description="GitHub install, repository pick, and install PR. You merge; nothing here can merge for you."
            >
              {state ? (
                <GithubPanel
                  canManage={state.role === 'owner' || state.role === 'admin'}
                  prBlockedReason={
                    state.draftMapped === 0
                      ? 'Map at least one route first — the PR carries route-backed capabilities, not the catalogue.'
                      : !state.drafts.rules && !state.drafts.setup
                        ? 'Set your starter rules first — the discovery package is generated from them.'
                        : null
                  }
                />
              ) : (
                <EmptyState
                  title="Cannot load GitHub panel"
                  body="Go-live state is unavailable. Reload to retry."
                />
              )}
            </Section>
          </section>

          {/* Pull Request */}
          <section id="pull-request" className="scroll-mt-24">
            <Section
              title="Open the install PR"
              description="The panel above opens one PR per repository. This is the record the console watches — merge is your signature."
            >
              <PullRequestCard />
            </Section>
          </section>

          {/* Publish */}
          <section id="publish" className="scroll-mt-24">
            <Section
              title="Approve, sign, and activate"
              description="Approval records the exact bytes. The private key stays on your machine. The signed envelope is what activates the hosted governor."
            >
              <GolivePanel />
            </Section>
          </section>

          {/* Verify */}
          <section id="verify" className="scroll-mt-24 space-y-4">
            <Section
              title="Verify discovery"
              description="A stored artifact is not a running worker. Ask the canonical address and read the answer."
            >
              <DiscoveryCheck canonicalUrl={canonicalUrl} invokeUrl={invokeUrl} />
            </Section>
            <Callout tone="info" title="The deployment model">
              The files on your site are an advisory discovery snapshot. They carry no policy
              engine, ledger, approval queue, credential, or execution path. The hosted Agent Port
              governor decides, executes, and records every call.
            </Callout>
          </section>
        </div>
      </div>
    </div>
  )
}
