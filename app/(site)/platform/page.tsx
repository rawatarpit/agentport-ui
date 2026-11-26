import type { Metadata } from 'next'
import Link from 'next/link'
import { SectionViewTracker } from '@/components/landing/section-view-tracker'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: 'Platform — governed request path',
  description: 'Four stages, one request path, and the boundaries that keep drafts, discovery and ledger reads honest.',
  alternates: { canonical: '/platform' },
  openGraph: {
    title: 'Platform — governed request path',
    description: 'Four stages, one request path, and the boundaries that keep drafts, discovery and ledger reads honest.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/platform',
  },
  twitter: {
    card: 'summary',
    title: 'Platform — governed request path',
    description: 'Four stages, one request path, and the boundaries that keep drafts, discovery and ledger reads honest.',
  },
}

type StageStatus = 'available' | 'draft' | 'integration' | 'illustrative'

const STATUS: Record<StageStatus, { tone: StatusTone; label: string }> = {
  available: { tone: 'ready', label: 'available' },
  draft: { tone: 'draft', label: 'draft' },
  integration: { tone: 'blocked', label: 'requires supported integration' },
  illustrative: { tone: 'unknown', label: 'illustrative' },
}

const STAGES = [
  {
    title: 'Understand',
    status: 'available',
    body: 'Industry previews and readiness checks frame the question. Unresearched figures stay unknown; no market figure is filled in to look complete.',
  },
  {
    title: 'Connect',
    status: 'integration',
    body: 'The install pull request lands discovery files for a supported target. The site manifest is advisory and grants no permission; no universal compatibility is promised.',
  },
  {
    title: 'Control',
    status: 'draft',
    body: 'Capabilities and rules are drafts until approval applies a config version that the hosted governor serves. Approval decisions happen in the hosted path, not in a browser button.',
  },
  {
    title: 'Operate',
    status: 'illustrative',
    body: 'The request path below is illustrative until a real push lands. Console reads come from row-level security scoped views; with no push the answer is unknown, never zero.',
  },
] as const

const REQUEST_PATH = [
  {
    title: 'Agent',
    body: 'An agent asks for a capability through a compatible client. Ordinary website traffic is not intercepted.',
  },
  {
    title: 'Compatible client',
    body: 'The client reads the advisory discovery manifest and points to the hosted governor. The manifest grants no permission and guarantees no discovery.',
  },
  {
    title: 'Hosted governor',
    body: 'The hosted governor verifies a business-issued scoped credential and evaluates the applied policy before any capability runs.',
  },
  {
    title: 'Decision',
    body: 'The decision is allow, hold or refuse. A held request has not run; a decision is not proof that the downstream call succeeded.',
  },
  {
    title: 'Business action',
    body: 'On an allowed, confirmed write the capability runs against the merchant API. The ledger row is written after the outcome is known.',
  },
] as const

export default function PlatformPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[80ch] space-y-4">
        <p className="label">Platform</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          AgentPort — The infrastructure for businesses in the AI agent economy.
        </h1>
        <p className="prose-bone">
          The journey is Understand → Connect → Control → Operate. The pillars are Intelligence, Access and
          Control. This page shows the request path and its status, not a promise that any capability is already
          governed.
        </p>
        <div className="flex flex-wrap gap-2 font-mono text-[11px] text-bone-dim">
          {['Intelligence', 'Access', 'Control'].map((pillar) => (
            <span key={pillar} className="rounded-full border border-ink-line px-2.5 py-1">
              {pillar}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/pilot" className="btn btn-primary px-4 py-2">
            Request a pilot
          </Link>
          <Link href="/signup" className="btn px-4 py-2">
            Get started
          </Link>
        </div>
      </header>

      <section id="integration-path" className="space-y-4" aria-labelledby="integration-path-heading">
        <SectionViewTracker event="integration_section_viewed" targetId="integration-path" />
        <h2 id="integration-path-heading" className="font-display text-[22px] text-bone">
          The request path
        </h2>
        <p className="prose-bone">
          Five moves from an agent question to a recorded outcome. This is the shape of a governed request, not
          a claim that your integration exists yet.
        </p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {REQUEST_PATH.map((step, index) => (
            <li key={step.title} className="panel flex h-full flex-col p-4">
              <p className="font-mono text-[10.5px] text-bone-faint">0{index + 1}</p>
              <h3 className="mt-2 font-display text-[16px] leading-snug text-bone">{step.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
          The ledger records the decision; it does not execute the action. No capability is governed before a
          supported integration is connected, approved and served by the hosted governor.
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="stages-heading">
        <h2 id="stages-heading" className="font-display text-[22px] text-bone">
          Four stages, with status
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {STAGES.map((stage) => (
            <li key={stage.title} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-display text-[18px] text-bone">{stage.title}</h3>
                <StatusPill tone={STATUS[stage.status].tone}>{STATUS[stage.status].label}</StatusPill>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-bone-dim">{stage.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-muted rounded-xl p-5 sm:p-6" aria-labelledby="platform-boundaries-heading">
        <h2 id="platform-boundaries-heading" className="font-display text-[19px] text-bone">
          Boundaries that hold
        </h2>
        <ul className="mt-4 grid gap-3 text-[13px] leading-relaxed text-bone-dim sm:grid-cols-2">
          <li>Discovery manifest is advisory; the hosted governor is authoritative.</li>
          <li>Drafts are not live until an applied config version is served.</li>
          <li>Approvals are hosted decisions, not browser buttons.</li>
          <li>Row-level security confines reads to your own tenant; with no push, the answer is unknown.</li>
        </ul>
      </section>
    </div>
  )
}
