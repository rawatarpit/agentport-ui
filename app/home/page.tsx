import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ThemeToggle } from '@/components/theme-toggle'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { ContactForm } from '@/components/contact-form'
import { DecisionDemo } from '@/components/landing/decision-demo'

export const metadata: Metadata = {
  title: 'AgentPort — AI Agent Governance for Businesses',
  description:
    'Monitor AI agent activity, enforce policies, set operational limits, and require approval for sensitive business operations with AgentPort.',
  openGraph: {
    title: 'AgentPort — AI Agent Governance for Businesses',
    description:
      'A governed path for agent-initiated operations: policy enforcement before execution, human approval for sensitive actions, and an audit trail.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/home',
  },
  twitter: {
    card: 'summary',
    title: 'AgentPort — AI Agent Governance for Businesses',
    description:
      'Policy enforcement before execution, human approval for sensitive actions, and an audit trail for agent-initiated operations.',
  },
}

/**
 * The public front door (agentport.relayforge.in/home).
 *
 * Invite-only on purpose: the pilot is hand-held, so the call to action is a
 * request, not a signup. The form writes a durable row (service-role route,
 * RLS with no public policy) and notifies the founder; this page never claims
 * an account was created.
 *
 * No invented numbers, no customer logos, no testimonials: every data-shaped
 * element below is labelled an example, because a marketing panel that reads
 * like live customer data is the same lie as a green light on a silent site.
 *
 * Analytics events are documented here, not wired. This repo has no analytics
 * vendor, and adding one silently would outrun the privacy review:
 *   hero_primary_cta_clicked, hero_demo_cta_clicked, product_demo_interaction,
 *   integration_section_viewed, pilot_section_viewed, pilot_form_started,
 *   pilot_form_submitted, pilot_form_submission_failed.
 * Never send an email address, an amount, or a request payload.
 */

const SPECS = [
  { k: 'Enforcement', v: 'Before execution' },
  { k: 'Decisions', v: 'Allow · Hold · Refuse' },
  { k: 'Console', v: 'No order values' },
]

const PROBLEMS = [
  {
    title: 'You cannot see the work',
    body: 'Without a consistent record, you cannot tell which agents touched your systems, what they asked for, or how each request was handled.',
  },
  {
    title: 'Authentication is not policy',
    body: 'A login proves who is calling. It does not decide which business actions that caller may take.',
  },
  {
    title: 'The trail is incomplete',
    body: 'When an action is allowed, held, or refused, you need the decision, the reason, and the outcome in one place.',
  },
]

const FLOW = [
  {
    n: '01',
    title: 'Discover',
    body: 'Your business publishes capability information. Compatible agents may use it; publishing does not force discovery.',
  },
  {
    n: '02',
    title: 'Verify',
    body: 'The request reaches AgentPort, which checks the short-lived, scoped credential and the request context.',
  },
  {
    n: '03',
    title: 'Decide',
    body: 'AgentPort applies your ordered policy and returns allow, hold, or refuse.',
  },
  {
    n: '04',
    title: 'Record',
    body: 'An allowed action proceeds. A held action waits for approval. The decision and outcome are recorded.',
  },
]

const CONTROLS = [
  {
    title: 'Ceilings',
    body: 'Set hard and soft limits on measurable actions. Above a hard limit: refused. Above a soft limit: held for approval.',
  },
  {
    title: 'Holds',
    body: 'Pause an action until an authorized person approves it. A held action does not run while approval is pending. Approval checks policy again at commit.',
  },
  {
    title: 'Refusals',
    body: 'Block actions your business does not allow. Every refusal has a reason and is recorded. Refusals are checked before holds.',
  },
  {
    title: 'Kill switch',
    body: 'Stop agent-initiated writes and make reads audit-only. Your website and APIs keep running. It is checked first and cannot be cleared by a publish.',
  },
]

const AUDIT_ROWS = [
  {
    time: '2026-11-02 14:03:12Z',
    agent: 'gpt-shopping',
    capability: 'createOrder',
    decision: 'HELD',
    tone: 'held' as const,
    reason: 'above soft ceiling',
    execution: 'waiting for approval',
  },
  {
    time: '2026-11-02 14:02:47Z',
    agent: 'gpt-shopping',
    capability: 'searchProducts',
    decision: 'ALLOW',
    tone: 'allow' as const,
    reason: 'default',
    execution: 'succeeded',
  },
  {
    time: '2026-11-02 14:01:09Z',
    agent: 'anonymous',
    capability: 'deleteAccount',
    decision: 'REFUSED',
    tone: 'deny' as const,
    reason: 'capability not permitted',
    execution: 'not executed',
  },
]

const SECURITY = [
  {
    title: 'Scope',
    body: 'Only operations connected to AgentPort. Ordinary site traffic and unconnected APIs are outside the boundary.',
  },
  {
    title: 'Caller identity',
    body: 'A short-lived, scoped credential issued by your business, checked before policy. Being an agent is not a credential.',
  },
  {
    title: 'Policy order',
    body: 'Kill switch, prohibitions, ceilings, approval thresholds, rate limit. First match wins.',
  },
  {
    title: 'Held actions',
    body: 'A held action does not run. Approval checks policy again at commit and runs the action once.',
  },
  {
    title: 'Approvals',
    body: 'Decided through the CLI where the credential lives, not a browser button. The console shows the queue; it does not decide.',
  },
  {
    title: 'Ledger',
    body: 'Append-only rows record capability, agent, user, decision, rule, reason, approval, result, redacted context, and a per-row digest. The console view omits parameters and order values.',
  },
  {
    title: 'Secrets',
    body: 'CVV, passwords, API keys, and raw credentials are never stored. Ingestion uses a revocable per-tenant push key. AgentPort never holds a merchant database credential.',
  },
  {
    title: 'Emergency stop',
    body: 'The kill switch blocks agent-initiated writes, makes reads audit-only, and leaves your website and APIs running. It is checked first and is never part of a published artifact.',
  },
]

const INTEGRATION_STEPS = [
  'Connect the repository or download the discovery package.',
  'Choose the operations to expose.',
  'Connect those operations to AgentPort.',
  'Set the initial policies.',
  'Test allow, hold, and refuse.',
  'Review the activity and audit records.',
]

const PILOT_TERMS = [
  'One environment',
  'Assisted setup',
  'A limited set of agreed capabilities',
  'Initial policy configuration',
  'A working allow / hold / refuse demonstration',
  'A review of activity and audit records',
  'Same-day replies on business days',
  'No SLA — the pilot is how we earn the right to offer one',
  'Exit anytime; leaving never deletes your proof',
]

const FAQ = [
  {
    q: 'Does AgentPort replace our API or authentication?',
    a: 'No. It works alongside your application and API. AgentPort governs the operations you connect; authentication and authorization remain yours.',
  },
  {
    q: 'Does a manifest make our business discoverable by every agent?',
    a: 'No. A manifest is information for compatible clients. Discovery depends on the agent or platform. The manifest is advisory and carries no policy decision.',
  },
  {
    q: 'What happens when an action is held?',
    a: 'It stays pending and does not run until the required approval is recorded. Approval checks policy again at commit.',
  },
  {
    q: 'Can we choose what agents may do?',
    a: 'Yes, for the capabilities you connect. Policies can allow, hold, or refuse requests.',
  },
  {
    q: 'Does AgentPort store customer or transaction data?',
    a: 'It records the decision, rule, reason, approval, outcome, agent identity, user represented, redacted context, and a per-row digest. The console view omits parameters and order values. CVV, passwords, API keys, and raw credentials are never stored. Retention is agreed in the pilot.',
  },
  {
    q: 'How long does integration take?',
    a: 'There is no fixed duration. It depends on your application, the operations you connect, and your environment. A pilot starts with one environment and a focused set of operations.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-line/60 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/home" aria-label="AgentPort home" className="shrink-0">
            <AgentPortLogo />
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden w-24 sm:block">
              <ThemeToggle />
            </div>
            <Link href="/login" className="btn hidden px-4 py-2 sm:inline-flex">
              Sign in
            </Link>
            <a href="#contact" className="btn btn-primary px-3 py-1.5 sm:px-4 sm:py-2">
              Request a founding pilot
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* Hero */}
        <section className="relative grid items-center gap-14 pb-14 pt-16 sm:pb-20 sm:pt-24 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
          <div className="rise">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
              AI agent governance
              <span aria-hidden="true" className="h-px w-10 bg-verdant/40" />
              <span className="text-bone-faint/70">for businesses</span>
            </div>

            <h1 className="mt-6 font-display text-[clamp(2.7rem,6vw,4.35rem)] leading-[0.98] tracking-[-0.03em] text-bone">
              AI agents can act on your business.
              <span className="mt-2 block italic text-verdant">
                Make sure they act within your rules.
              </span>
            </h1>

            <p className="prose-bone mt-6 max-w-[54ch]">
              Agents can place orders, issue refunds, and change accounts.
              AgentPort decides what they may do before they do it — and records
              every decision.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#contact" className="btn btn-primary px-5 py-2.5">
                Request a founding pilot
              </a>
              <a
                href="#how"
                className="group inline-flex items-center gap-2 px-1 py-2 font-mono text-[12px] text-bone-dim transition-colors hover:text-bone"
              >
                See how AgentPort works
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-bone-faint">
              <li>Assisted setup</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>One environment</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>Founding-pilot access</li>
            </ul>

            <p className="mt-4 max-w-[52ch] font-mono text-[11px] leading-relaxed text-bone-faint">
              Enforcement covers only the operations you connect to AgentPort —
              not every interaction on your site.
            </p>
          </div>

          <DecisionPreview />
        </section>

        {/* Spec strip */}
        <section className="border-y border-ink-line/60">
          <div className="grid divide-y divide-ink-line/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {SPECS.map((s) => (
              <div key={s.k} className="flex items-baseline justify-between gap-4 px-1 py-5 sm:px-6">
                <span className="label">{s.k}</span>
                <span className="font-mono text-[12px] text-bone">{s.v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 01 — The problem */}
        <section id="problem" className="scroll-mt-24 py-16 sm:py-24">
          <SectionHead
            index="01"
            eyebrow="The problem"
            title="Access is not permission."
            lede="An agent can browse products, create an order, change an account, or request a refund. Each action carries a different risk. You need to separate routine work from work that needs a limit, a review, or a refusal."
          />
          <div className="mt-12 grid gap-0 border-t border-ink-line/60 sm:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <div
                key={p.title}
                className="border-b border-ink-line/60 py-7 sm:border-b-0 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
              >
                <span className="font-mono text-[11px] text-rust">0{i + 1}</span>
                <p className="mt-3 font-display text-[20px] leading-snug text-bone">{p.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-[72ch] font-mono text-[11px] leading-relaxed text-bone-faint">
            Identity, traffic, policy, and audit are different problems. AgentPort
            adds the policy and proof layer for the operations you connect.
          </p>
        </section>

        {/* 02 — How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="02"
            eyebrow="How it works"
            title="One path from request to operation."
            lede="Only calls routed through AgentPort are governed. The manifest is optional and does not guarantee discovery."
          />
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {FLOW.map((step) => (
              <li key={step.n} className="border-t border-ink-line/70 pt-5">
                <span className="font-display text-[34px] leading-none text-verdant/80">
                  {step.n}
                </span>
                <p className="mt-4 font-display text-[22px] text-bone">{step.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">{step.body}</p>
              </li>
            ))}
          </ol>
          <FlowDiagram />
        </section>

        {/* 03 — Interactive demonstration */}
        <section id="demo" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="03"
            eyebrow="Product demonstration"
            title="See a decision before an action runs."
            lede="Choose a sample request. The decision is illustrative; the real decision comes from your signed policy."
          />
          <div className="mt-12">
            <DecisionDemo />
          </div>
        </section>

        {/* 04 — Governance controls */}
        <section id="controls" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="04"
            eyebrow="Governance controls"
            title="Set the rules."
            lede="Four controls, checked in order. Refusals happen before holds, so no one is asked to approve something impossible."
          />
          <div className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {CONTROLS.map((control, i) => (
              <div key={control.title} className="flex gap-4 border-t border-ink-line/60 py-6">
                <span className="font-mono text-[11px] text-verdant">0{i + 1}</span>
                <div>
                  <p className="font-mono text-[13px] text-bone">{control.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">
                    {control.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 05 — Activity and audit */}
        <section id="audit" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="05"
            eyebrow="Activity and audit"
            title="See what happened."
            lede="AgentPort records each governed request, the decision, the reason, and the execution outcome."
          />
          <div className="mt-12">
            <AuditTable />
          </div>
        </section>

        {/* 06 — Security and boundaries */}
        <section id="security" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="06"
            eyebrow="Security and boundaries"
            title="Clear boundaries."
            lede="What AgentPort controls — and what it does not."
          />
          <div className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {SECURITY.map((item, i) => (
              <div key={item.title} className="flex gap-4 border-t border-ink-line/60 py-6">
                <span className="font-mono text-[11px] text-verdant">0{i + 1}</span>
                <div>
                  <p className="font-mono text-[13px] text-bone">{item.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-[72ch] font-mono text-[11px] leading-relaxed text-bone-faint">
            No blanket security claim. The boundary is AgentPort’s governance
            path; the installed package makes no decisions.
          </p>
        </section>

        {/* 07 — Integration */}
        <section id="integration" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="07"
            eyebrow="Integration"
            title="Start with the operations you want to govern."
            lede="AgentPort works alongside your application and API. Start with the operations agents need, then connect them."
          />
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <ol className="space-y-5">
              {INTEGRATION_STEPS.map((step, i) => (
                <li
                  key={step}
                  className="flex gap-4 border-t border-ink-line/60 pt-4 first:border-t-0 first:pt-0"
                >
                  <span className="font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                  <p className="text-[14px] leading-relaxed text-bone-dim">{step}</p>
                </li>
              ))}
            </ol>

            <div className="panel overflow-hidden">
              <div className="border-b border-ink-line px-4 py-3">
                <span className="label">What lands in your repository</span>
              </div>
              <div className="space-y-4 px-4 py-4 text-[13px] leading-relaxed text-bone-dim">
                <p>
                  One pull request on{' '}
                  <code className="font-mono text-[12px] text-bone">agentport/install</code>{' '}
                  adds the discovery package. You review and merge; your CI/CD
                  deploys. Later changes go through the publish channel, not
                  another pull request.
                </p>
                <p>
                  The package writes discovery files for Next.js, Vite, Astro,
                  Nuxt, Remix, SvelteKit, Gatsby, and a static root. We confirm
                  your stack during setup.
                </p>
                <p>
                  A manual download uses the same compiler for repositories that
                  cannot use the GitHub App.
                </p>
                <p className="font-mono text-[11px] text-bone-faint">
                  The installed package makes no decisions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Founding pilot */}
        <section id="contact" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <div className="rounded-xl border border-verdant/25 bg-ink-soft p-6 sm:p-10">
            <div className="grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
                  Founding pilot — by invitation
                </div>
                <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.02em] text-bone">
                  Put AgentPort against a real workflow.
                </h2>
                <p className="prose-bone mt-4">
                  We are working with a small number of businesses to test
                  AgentPort on real agent workflows. A pilot starts with one
                  environment and a focused set of operations, so both teams can
                  verify the integration, policy behavior, and audit trail before
                  expanding.
                </p>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-bone-dim">
                  No AgentPort fee for selected founding-pilot participants.
                  Customers remain responsible for their own hosting, database,
                  and other third-party infrastructure costs. Scope and eligibility
                  are agreed before onboarding.
                </p>
                <ul className="mt-7 grid gap-x-6 gap-y-2.5 font-mono text-[12px] text-bone-dim sm:grid-cols-2">
                  {PILOT_TERMS.map((term) => (
                    <li key={term} className="flex gap-2">
                      <span aria-hidden="true" className="text-verdant">·</span>
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-ink-line bg-ink/70 p-5 sm:p-6">
                <ContactForm />
                <p className="mt-4 font-mono text-[11px] text-bone-faint">
                  Already have an account?{' '}
                  <Link href="/login" className="text-bone underline underline-offset-4">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 08 — FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="08"
            eyebrow="FAQ"
            title="Straight answers."
          />
          <div className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-t border-ink-line/60 py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-5 [&::-webkit-details-marker]:hidden">
                  <span className="text-[15px] font-medium text-bone">{item.q}</span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 font-mono text-[16px] leading-none text-bone-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed text-bone-dim">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div>
            <AgentPortLogo size={28} />
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-bone-faint">
              AI agent governance for businesses. Decisions, reasons, and
              outcomes — never order values or secrets.
            </p>
          </div>
          <div className="flex gap-8 font-mono text-[12px]">
            <Link href="/login" className="text-bone-dim transition-colors hover:text-bone">
              Sign in
            </Link>
            <a href="#contact" className="text-bone-dim transition-colors hover:text-bone">
              Request a founding pilot
            </a>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 px-5 py-6 font-mono text-[11px] text-bone-faint sm:px-8">
          <p>© 2026 AgentPort</p>
          <p>Decisions and reasons, never order values.</p>
        </div>
      </footer>
    </div>
  )
}

function SectionHead({
  index,
  eyebrow,
  title,
  lede,
}: {
  index: string
  eyebrow: string
  title: string
  lede?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-3 border-t border-ink-line/70 pt-5">
        <span className="font-mono text-[11px] text-verdant">{index}</span>
        <span className="label">{eyebrow}</span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1.08fr_0.92fr] sm:items-end sm:gap-10">
        <h2 className="text-balance font-display text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.04] tracking-[-0.02em] text-bone">
          {title}
        </h2>
        {lede ? <p className="prose-bone sm:pb-1">{lede}</p> : null}
      </div>
    </div>
  )
}

/**
 * A labelled illustration of the decision set — never tenant data. The badge
 * and aria-label are the honesty contract: a visitor must be able to tell a
 * sample from their own rows at a glance.
 */
function DecisionPreview() {
  return (
    <div
      className="rise rise-2 overflow-hidden rounded-xl border border-ink-line bg-ink-soft shadow-[0_40px_100px_-50px_rgba(0,0,0,0.85)]"
      role="group"
      aria-label="Example policy decisions — illustrative values"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-faint">
          sample decisions
        </span>
        <span className="rounded-full border border-verdant/30 bg-verdant/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-verdant">
          Illustrative
        </span>
      </div>

      <ul className="divide-y divide-ink-line/70">
        {[
          { capability: 'searchProducts', decision: 'allow', tone: 'allow' as const },
          { capability: 'createOrder', decision: 'hold', tone: 'held' as const },
          { capability: 'requestRefund', decision: 'hold', tone: 'held' as const },
          { capability: 'deleteAccount', decision: 'refuse', tone: 'deny' as const },
        ].map((row) => (
          <li key={row.capability} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="font-mono text-[12px] text-bone">{row.capability}</span>
            <Badge tone={row.tone}>{row.decision}</Badge>
          </li>
        ))}
      </ul>

      <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[11px] leading-relaxed text-bone-faint">
        A held request has not run. A decision is not proof that the downstream
        call succeeded.
      </p>
    </div>
  )
}

/** The request path, with the ledger shown as a record rather than a step. */
function FlowDiagram() {
  const steps = [
    { label: 'AI agent', body: 'Scoped credential' },
    { label: 'Your endpoint', body: 'Integration or proxy' },
    { label: 'AgentPort', body: 'Policy check' },
    { label: 'Decision', body: 'Allow · Hold · Refuse' },
    { label: 'Business action', body: 'Runs only after a decision' },
  ]

  return (
    <div className="mt-10 rounded-lg border border-ink-line bg-ink-soft/60 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="label">Request path</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
          sample
        </span>
      </div>

      <ol className="mt-5 grid gap-3 lg:grid-cols-5">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="relative rounded-md border border-ink-line bg-ink/40 p-3"
          >
            <p className="font-mono text-[10px] text-verdant">0{i + 1}</p>
            <p className="mt-1 font-mono text-[12px] text-bone">{step.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-bone-faint">{step.body}</p>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-ink-line bg-ink px-1 py-0.5 font-mono text-[9px] text-bone-faint lg:block"
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-3 rounded-md border border-dashed border-ink-line bg-ink/30 p-3">
        <p className="font-mono text-[11px] text-bone">Ledger</p>
        <p className="mt-1 text-[11px] leading-relaxed text-bone-faint">
          Records the decision and outcome. Does not execute.
        </p>
      </div>

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-bone-faint">
        Only calls routed through AgentPort are governed. A manifest does not
        guarantee discovery.
      </p>
    </div>
  )
}

/** A clearly fictional activity record — no amounts, no personal data. */
function AuditTable() {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink-line px-4 py-3">
        <span className="label">Activity record</span>
        <span className="rounded-full border border-ink-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-bone-faint">
          Illustrative
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-ink-line font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
              <th className="px-4 py-2 font-normal">Time</th>
              <th className="px-4 py-2 font-normal">Agent</th>
              <th className="px-4 py-2 font-normal">Capability</th>
              <th className="px-4 py-2 font-normal">Decision</th>
              <th className="px-4 py-2 font-normal">Reason</th>
              <th className="px-4 py-2 font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {AUDIT_ROWS.map((row) => (
              <tr
                key={`${row.time}-${row.capability}`}
                className="border-b border-ink-line/60 last:border-b-0"
              >
                <td className="px-4 py-3 font-mono text-[11px] text-bone-dim">{row.time}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone">{row.agent}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone">{row.capability}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.tone}>{row.decision}</Badge>
                </td>
                <td className="px-4 py-3 text-[11px] text-bone-dim">{row.reason}</td>
                <td className="px-4 py-3 text-[11px] text-bone-dim">{row.execution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[11px] leading-relaxed text-bone-faint">
        The console view omits parameters and order values. A decision is not
        proof of success; the outcome is recorded after the call.
      </p>
    </div>
  )
}
