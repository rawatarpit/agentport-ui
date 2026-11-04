'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
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

/* ── Types ───────────────────────────────────────────────────────────── */

type Tenant = {
  tenantId: string
  role: string
  merchant: {
    id: string
    email: string
    businessName: string
    websiteUrl: string | null
  }
}

type GoLiveState = {
  status: string
  businessName: string | null
  draftMapped: number
  drafts: { setup: boolean; rules: boolean; capabilities: boolean }
  liveArtifact: { version: number } | null
  published: boolean
  installed: boolean
  pullRequests: any[]
  siteUrl: string | null
  steps: any[]
  nextStep: any | null
  phase: 'not-started' | 'in-progress' | 'live'
  agent?: any
  [key: string]: any
}

/* ── Data fetchers ───────────────────────────────────────────────────── */

async function fetchTenant(): Promise<Tenant | null> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as Tenant
  } catch {
    return null
  }
}

async function fetchGoLiveState(): Promise<GoLiveState | null> {
  try {
    const res = await fetch('/api/golive', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as GoLiveState
  } catch {
    return null
  }
}

/* ── Section error boundary ──────────────────────────────────────────── */

/**
 * Wraps any section so a crash inside WebsiteForm, RulesEditor, etc.
 * can never take down the whole page. If a section throws, it renders
 * the fallback instead.
 */
class SectionGuard extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function GoLivePage() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [state, setState] = useState<GoLiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const t = await fetchTenant()
        if (cancelled) return
        setTenant(t)
        if (!t) {
          setError('Please select a workspace.')
          setLoading(false)
          return
        }
        const s = await fetchGoLiveState()
        if (cancelled) return
        setState(s)
      } catch {
        setError('Failed to load go-live state. Try reloading.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Loading ───────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-4 border-ink-line border-t-verdant animate-spin" />
          <p className="text-bone-dim text-sm">Loading go-live state…</p>
        </div>
      </div>
    )
  }

  /* ── Load failed ───────────────────────────────────────────────────── */

  if (error || !tenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 pt-[18vh] text-center">
        <div>
          <p className="label">Could not load go-live</p>
          <h1 className="mt-2 font-display text-3xl text-bone">
            {error || 'Please select a workspace.'}
          </h1>
          <p className="mt-3 prose-bone">
            {error ? 'Try reloading the page.' : 'Please select a workspace from the menu.'}
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/" className="btn">
              Back to overview
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Render ────────────────────────────────────────────────────────── */

  const siteUrl = state?.merchant?.websiteUrl ?? null

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Go live"
        title={state?.published ? 'Your governor is published' : 'From site to serving'}
        description={
          state?.published
            ? 'The artifact is stored. Run the canonical check below before you tell an agent integrator the address.'
            : 'One path from your public site to a hosted governor that can answer.'
        }
        actions={
          <>
            <Link href="/" className="btn">
              Overview
            </Link>
            {siteUrl && (
              <a
                href={`https://${siteUrl}`}
                target="_blank"
                rel="noreferrer"
                className="btn"
              >
                Open site
              </a>
            )}
            {!state?.published && state?.nextStep && (
              <a href={`#${state.nextStep.id}`} className="btn btn-primary">
                {state.nextStep.actionLabel}
              </a>
            )}
          </>
        }
      />

      {/* ── Next-step callout ── */}
      {state?.published ? (
        <Callout tone="success" title={`Published v${state.liveArtifact?.version}`}>
          <p>
            The signed artifact is stored. Run the canonical check below before you tell an
            agent integrator the address — and if it returns 502, the worker has no active
            runtime for this tenant yet.
          </p>
          <p className="mt-2">
            <a href="#verify" className="link">
              Verify discovery
            </a>
          </p>
        </Callout>
      ) : state?.nextStep ? (
        <Callout tone={state.phase === 'not-started' ? 'info' : 'warning'} title="Next">
          <p>
            <span className="text-bone">{state.nextStep.title}.</span>{' '}
            {state.nextStep.summary}
          </p>
          <p className="mt-2">
            <a href={`#${state.nextStep.id}`} className="link">
              {state.nextStep.actionLabel} →
            </a>
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
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load site form"
                    body="Go-live state is unavailable. Reload to retry."
                  />
                }
              >
                {state ? (
                  <WebsiteForm current={state.merchant?.websiteUrl} onDone={() => void 0} />
                ) : (
                  <EmptyState
                    title="Cannot load site form"
                    body="Go-live state is unavailable. Reload to retry."
                  />
                )}
              </SectionGuard>
            </Section>
          </section>

          {/* Capabilities */}
          <section id="capabilities" className="scroll-mt-24 space-y-4">
            <Section
              title="Map what agents can call"
              description="A capability in the catalogue is a description. Only a route you map here has an execution path."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load map"
                    body="The map workbench could not be loaded. Reload to retry."
                  />
                }
              >
                <>
                  <Callout tone="info" title="Why this is not optional">
                    Publish refuses an empty capability inventory. The setup questions choose your
                    lines; this step chooses the routes those lines govern. Crawl your site, review
                    every undeclared route, and save only what you want an agent to reach.
                  </Callout>
                  <MapWorkbench />
                </>
              </SectionGuard>
            </Section>
          </section>

          {/* Rules */}
          <section id="rules" className="scroll-mt-24">
            <Section
              title="Set the lines"
              description="What runs, what waits for you, and what is always no. Saving writes a draft; publishing is the only thing that changes live behaviour."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load rules"
                    body="The rules editor could not be loaded. Reload to retry."
                  />
                }
              >
                <>
                  <RulesEditor />
                  <p className="mt-3 text-[12px] text-bone-faint">
                    The full rules screen has the same draft plus history:{' '}
                    <Link href="/rules" className="link">open Rules</Link>.
                  </p>
                </>
              </SectionGuard>
            </Section>
          </section>

          {/* GitHub */}
          <section id="github" className="scroll-mt-24">
            <Section
              title="Connect the site repository"
              description="GitHub install, repository pick, and install PR. You merge; nothing here can merge for you."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load GitHub panel"
                    body="Go-live state is unavailable. Reload to retry."
                  />
                }
              >
                {state ? (
                  <GithubPanel
                    canManage={tenant.role === 'owner' || tenant.role === 'admin'}
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
              </SectionGuard>
            </Section>
          </section>

          {/* Pull Request */}
          <section id="pull-request" className="scroll-mt-24">
            <Section
              title="Open the install PR"
              description="The panel above opens one PR per repository. This is the record the console watches — merge is your signature."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load PR panel"
                    body="The pull request panel could not be loaded. Reload to retry."
                  />
                }
              >
                <PullRequestCard />
              </SectionGuard>
            </Section>
          </section>

          {/* Publish */}
          <section id="publish" className="scroll-mt-24">
            <Section
              title="Approve, sign, and activate"
              description="Approval records the exact bytes. The private key stays on your machine. The signed envelope is what activates the hosted governor."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load publish panel"
                    body="The publish panel could not be loaded. Reload to retry."
                  />
                }
              >
                <GolivePanel />
              </SectionGuard>
            </Section>
          </section>

          {/* Verify */}
          <section id="verify" className="scroll-mt-24 space-y-4">
            <Section
              title="Verify discovery"
              description="A stored artifact is not a running worker. Ask the canonical address and read the answer."
            >
              <SectionGuard
                fallback={
                  <EmptyState
                    title="Cannot load verification"
                    body="The discovery check could not be loaded. Reload to retry."
                  />
                }
              >
                <>
                  <DiscoveryCheck
                    canonicalUrl={
                      state?.merchant?.websiteUrl
                        ? `https://${state.merchant.websiteUrl}/.well-known/agent.json`
                        : null
                    }
                    invokeUrl={null}
                  />
                  <Callout tone="info" title="The deployment model">
                    The files on your site are an advisory discovery snapshot. They carry no policy
                    engine, ledger, approval queue, credential, or execution path. The hosted Agent Port
                    governor decides, executes, and records every call.
                  </Callout>
                </>
              </SectionGuard>
            </Section>
          </section>
        </div>
      </div>
    </div>
  )
}
