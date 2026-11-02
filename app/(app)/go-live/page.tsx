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
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StepRail } from '@/components/ui/step-rail'
import { getGoLiveState } from '@/lib/go-live'
import { normaliseWorkerUrl } from '@/lib/install-package'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

function externalHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * One page for the only journey that matters: a public site, a mapped route,
 * a rule, a merged discovery package, a signed artifact, and a worker that
 * actually answers. The old flow split this across overview, connect, rules,
 * and an unlinked map screen, which is how a tenant reached "GitHub connected"
 * with an empty capability inventory.
 */
export default async function GoLivePage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') redirect('/select-workspace')

  const state = await getGoLiveState(tenant.active.tenantId, {
    checkGithub: true,
    role: tenant.active.membership.role,
  })

  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', state.tenantId)
  const canonicalUrl = worker.ok ? `${worker.url}/.well-known/agent.json` : null
  const invokeUrl = worker.ok ? `${worker.url}/.well-known/agent/invoke` : null
  const canManage = state.role === 'owner' || state.role === 'admin'
  const rulesReady = state.drafts.rules || state.drafts.setup
  const prBlockedReason =
    state.draftMapped === 0
      ? 'Map at least one route first — the PR carries route-backed capabilities, not the catalogue.'
      : !rulesReady
        ? 'Set your starter rules first — the discovery package is generated from them.'
        : null

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Go live"
        title={state.published ? 'Your governor is published' : 'From site to serving'}
        description={
          state.published
            ? 'The artifact is stored. The last check is the canonical manifest: a stored signature is not proof a worker is serving this tenant.'
            : 'One path from your public site to a hosted governor that can answer. Every step writes durable state; a saved draft is never live.'
        }
        actions={
          <>
            <Link href="/" className="btn">
              Overview
            </Link>
            {state.siteUrl ? (
              <a href={externalHref(state.siteUrl)} target="_blank" rel="noreferrer" className="btn">
                Open site
              </a>
            ) : null}
            {!state.published && state.nextStep ? (
              <a href={`#${state.nextStep.id}`} className="btn btn-primary">
                {state.nextStep.actionLabel}
              </a>
            ) : null}
          </>
        }
      />

      {state.published ? (
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
      ) : state.nextStep ? (
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
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        <StepRail steps={state.steps} />

        <div className="min-w-0 space-y-12">
          <section id="site" className="scroll-mt-24">
            <Section
              title="Set your site address"
              description="The public address agents and the route crawl use. It is deliberately not this console."
            >
              <WebsiteForm current={state.siteUrl} />
            </Section>
          </section>

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

          <section id="github" className="scroll-mt-24">
            <Section
              title="Connect the site repository"
              description="GitHub install, repository pick, and install PR. You merge; nothing here can merge for you."
            >
              <GithubPanel canManage={canManage} prBlockedReason={prBlockedReason} />
            </Section>
          </section>

          <section id="pull-request" className="scroll-mt-24">
            <Section
              title="Open the install PR"
              description="The panel above opens one PR per repository. This is the record the console watches — merge is your signature."
            >
              <PullRequestCard />
            </Section>
          </section>

          <section id="publish" className="scroll-mt-24">
            <Section
              title="Approve, sign, and activate"
              description="Approval records the exact bytes. The private key stays on your machine. The signed envelope is what activates the hosted governor."
            >
              <GolivePanel />
            </Section>
          </section>

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
