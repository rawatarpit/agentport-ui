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

const NAV = [
  { href: '#problem', label: 'Why' },
  { href: '#how', label: 'How it works' },
  { href: '#demo', label: 'Demo' },
  { href: '#controls', label: 'Controls' },
  { href: '#security', label: 'Security' },
  { href: '#contact', label: 'Pilot' },
]

const SPECS = [
  { k: 'Enforcement', v: 'Before execution' },
  { k: 'Decisions', v: 'Allow · Hold · Refuse' },
  { k: 'Console', v: 'No order values' },
]

const PROBLEMS = [
  {
    title: 'Limited visibility',
    body: 'Without a consistent record, it is difficult to know which agents are interacting with your systems, what they requested, and how those requests were handled.',
  },
  {
    title: 'No operational boundaries',
    body: 'Authentication can identify a caller, but it does not define which business actions that caller may perform. Policy has to account for the operation and its context.',
  },
  {
    title: 'No clear audit trail',
    body: 'When an operation is allowed, held, or refused, the business needs a record of the decision and, where applicable, the execution outcome.',
  },
]

const FLOW = [
  {
    n: '01',
    title: 'Discover',
    body: 'Your business publishes capability and integration information. The manifest is advisory: compatible agents may use it, and publishing it does not force discovery.',
  },
  {
    n: '02',
    title: 'Verify',
    body: 'The request reaches the governed path. The governor verifies a business-issued, short-lived, scoped credential and the available request context.',
  },
  {
    n: '03',
    title: 'Evaluate',
    body: 'The governor checks the request against your ordered policy. The decision is allow, hold, or refuse.',
  },
  {
    n: '04',
    title: 'Record and execute',
    body: 'An allowed operation proceeds through the configured path. A held operation waits for approval. Decisions and execution outcomes are recorded.',
  },
]

const CONTROLS = [
  {
    title: 'Ceilings',
    body: 'Set absolute and soft limits on measurable operations. A request above an absolute ceiling is denied; a request above a soft ceiling is held for approval.',
  },
  {
    title: 'Holds',
    body: 'Pause an operation until an authorised person approves it. A held operation does not execute while approval is pending, and approval re-evaluates policy at commit.',
  },
  {
    title: 'Refusals',
    body: 'Block operations the business does not permit. Every refusal carries a clear reason and is recorded. Denials are decided before holds.',
  },
  {
    title: 'Kill switch',
    body: 'Stop the governed agent pathway: agent-initiated writes are denied and reads become audit-only. Your website and your own APIs keep running. It is evaluated first, and a publish cannot clear it.',
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
    title: 'Which requests',
    body: 'Only operations integrated with and routed through AgentPort’s governance path. Ordinary site traffic and APIs you have not connected are outside the boundary.',
  },
  {
    title: 'Caller identity',
    body: 'A business-issued, short-lived, scoped credential, verified before policy. Being an agent is not a credential.',
  },
  {
    title: 'Policy evaluation',
    body: 'AgentPort applies ordered policy before execution: kill switch, prohibitions, ceilings, approval thresholds, rate limit. First match wins.',
  },
  {
    title: 'Held operations',
    body: 'A held request does not execute. Approval re-evaluates policy at commit and runs the operation exactly once.',
  },
  {
    title: 'Approvals',
    body: 'Decided through the CLI where the credential lives, not a browser button. The console displays the queue; it does not decide.',
  },
  {
    title: 'Ledger',
    body: 'Append-only rows carry capability, agent, user represented, decision, rule, reason, approval, result, redacted context, and a per-row digest. The console view omits parameters and order values.',
  },
  {
    title: 'Credentials and secrets',
    body: 'CVV, passwords, API keys, and raw credentials are never persisted. Ingestion uses a revocable per-tenant push key; AgentPort never holds a merchant database credential.',
  },
  {
    title: 'Emergency disable',
    body: 'The kill switch denies agent-initiated writes, makes reads audit-only, and leaves your website and APIs running. It is evaluated first and is never carried in a published artifact.',
  },
]

const INTEGRATION_STEPS = [
  'Connect the repository or download the discovery package.',
  'Identify the business operations to expose.',
  'Integrate those operations with AgentPort’s governance path.',
  'Configure the initial policies.',
  'Test allow, hold, and refusal behaviour.',
  'Review the resulting activity and audit records.',
]

const PILOT_TERMS = [
  'One environment',
  'Assisted installation',
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
    q: 'Does AgentPort replace our API or authentication system?',
    a: 'No. AgentPort works alongside your existing application and API infrastructure. It adds a governed path for the operations you connect to it; your authentication and authorisation responsibilities remain yours.',
  },
  {
    q: 'Does publishing a manifest mean every AI agent can discover our business?',
    a: 'No. A manifest is structured information for compatible clients and agents. Discovery depends on whether a particular agent or platform supports it and chooses to use it. The site manifest is advisory; it carries no policy decision.',
  },
  {
    q: 'What happens when a request is held?',
    a: 'The operation remains pending and must not execute until the required approval is completed. Approval re-evaluates policy at commit, and the decision and outcome are recorded.',
  },
  {
    q: 'Can we decide which operations agents are allowed to perform?',
    a: 'Yes, for the capabilities you integrate with AgentPort. Policies can allow, hold, or refuse requests according to the controls the product supports.',
  },
  {
    q: 'Does AgentPort store customer or transaction data?',
    a: 'AgentPort records the decision, rule, reason, approval, execution outcome, agent identity, the user represented, redacted request context, and a per-row digest. The console view omits parameters and order values. CVV, passwords, API keys, and raw credentials are never persisted. Retention terms are agreed in the pilot.',
  },
  {
    q: 'How long does integration take?',
    a: 'No fixed duration is promised. Timing depends on your application, the operations you connect, and your deployment environment. The pilot is hand-held and starts with one environment and a focused set of operations.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-verdant/0 via-verdant/60 to-verdant/0"
      />

      <header className="sticky top-0 z-40 border-b border-ink-line/60 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/home" aria-label="AgentPort home" className="shrink-0">
            <AgentPortLogo />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="font-mono text-[11px] uppercase tracking-[0.1em] text-bone-faint transition-colors hover:text-bone"
              >
                {item.label}
              </a>
            ))}
          </nav>

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
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage: 'radial-gradient(rgb(var(--ink-line)) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              maskImage: 'radial-gradient(ellipse 65% 55% at 22% 0%, black, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 22% 0%, black, transparent 72%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-52 -top-24 -z-10 hidden h-[520px] w-[520px] rounded-full lg:block"
            style={{ background: 'radial-gradient(circle, rgba(47,156,104,0.10), transparent 62%)' }}
          />

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
              As AI agents begin interacting with business systems, companies need
              more than a way to expose APIs. They need to know who is making a
              request, what the agent is trying to do, and whether that action
              should be allowed. AgentPort provides a governed path for
              agent-initiated operations, with policy enforcement and an audit
              trail.
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
              Enforcement covers operations connected to the AgentPort path — not
              every interaction on your site.
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
            title="Giving agents access is not the same as giving them permission."
            lede="An AI agent may find a product, create an order, change an account, or request a refund. Those operations do not carry the same risk. Businesses need to distinguish routine requests from actions that require limits, review, or refusal."
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
            Identity, traffic management, business policy, and auditability are
            related concerns, not the same one. AgentPort adds the policy and proof
            layer for the operations connected to it.
          </p>
        </section>

        {/* 02 — How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="02"
            eyebrow="How it works"
            title="A controlled path from agent request to business operation."
            lede="Only calls routed through the governor are governed. The site manifest is advisory, and publishing it does not guarantee discovery by every agent."
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
            title="See a policy decision before an operation proceeds."
            lede="Select a sample request. The decision is illustrative; AgentPort makes the real one from the merchant’s signed policy."
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
            title="Set the rules for what agents can do."
            lede="Four controls, evaluated in order. Denials are decided before holds, so a human is never asked to approve the impossible."
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
            title="Understand what happened, not just how much traffic arrived."
            lede="AgentPort records governed activity so teams can review requests, policy decisions, reasons, and execution outcomes."
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
            title="Designed around clear enforcement boundaries."
            lede="Only claims this implementation supports. Unverified properties are omitted."
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
            No blanket “fully secure” claim. The enforcement boundary is AgentPort’s
            governance path; the installed package carries no decisions.
          </p>
        </section>

        {/* 07 — Integration */}
        <section id="integration" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="07"
            eyebrow="Integration"
            title="Start with the business operations you want to govern."
            lede="AgentPort fits alongside your existing application and API infrastructure. Start by identifying the operations AI agents may need, then connect those operations to the governed path."
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
                  deploys. Later changes flow through the publish channel, not
                  another pull request.
                </p>
                <p>
                  The package writes discovery files for Next.js, Vite, Astro,
                  Nuxt, Remix, SvelteKit, Gatsby, and a static root. We confirm
                  your stack during setup.
                </p>
                <p>
                  A manual download path uses the same compiler for repositories
                  that cannot take the GitHub App.
                </p>
                <p className="font-mono text-[11px] text-bone-faint">
                  The installed package carries no decisions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Founding pilot */}
        <section id="contact" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-xl border border-verdant/25 bg-ink-soft p-6 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(680px 240px at 10% -10%, rgba(47,156,104,0.13), transparent 70%)',
              }}
            />
            <div className="relative grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
                  Founding pilot — by invitation
                </div>
                <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.02em] text-bone">
                  Put AgentPort against a real business workflow.
                </h2>
                <p className="prose-bone mt-4">
                  We are working with a small number of businesses to validate
                  AgentPort against real agent-driven workflows. A founding pilot
                  starts with one environment and a focused set of operations, so
                  both teams can verify the integration, policy behaviour, and
                  audit trail before expanding the scope.
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
            eyebrow="Straight answers"
            title="The questions a technical buyer will ask."
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
        <div className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-[1.4fr_0.6fr_0.6fr]">
            <div>
              <AgentPortLogo size={28} />
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-bone-faint">
                AI agent governance for businesses whose agents act on their
                behalf. Decisions, reasons, and outcomes — never order values or
                secrets.
              </p>
            </div>
            <div className="space-y-2.5 font-mono text-[12px]">
              <p className="label">Product</p>
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block text-bone-dim transition-colors hover:text-bone"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="space-y-2.5 font-mono text-[12px]">
              <p className="label">Account</p>
              <Link href="/login" className="block text-bone-dim transition-colors hover:text-bone">
                Sign in
              </Link>
              <a href="#contact" className="block text-bone-dim transition-colors hover:text-bone">
                Request a founding pilot
              </a>
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 pt-6 font-mono text-[11px] text-bone-faint">
            <p>© 2026 AgentPort</p>
            <p>Decisions and reasons, never order values.</p>
          </div>
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
        <span aria-hidden="true" className="hidden h-px flex-1 bg-ink-line/60 sm:block" />
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
        A held request has not executed. A decision is not proof that the
        downstream call succeeded.
      </p>
    </div>
  )
}

/** The request path, with the ledger shown as a record rather than a step. */
function FlowDiagram() {
  const steps = [
    { label: 'AI agent or client', body: 'A business-issued credential' },
    { label: 'Capability entry point', body: 'Your integration or proxy' },
    { label: 'AgentPort governor', body: 'Policy enforcement' },
    { label: 'Policy decision', body: 'Allow · Hold · Refuse' },
    { label: 'Business operation', body: 'Executed only after a decision' },
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
          Append-only record of the decision and outcome. It records; it does not
          execute.
        </p>
      </div>

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-bone-faint">
        Only calls routed through the governor are governed. Publishing a manifest
        does not guarantee that every agent discovers it.
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
              <th className="px-4 py-2 font-normal">Agent / caller</th>
              <th className="px-4 py-2 font-normal">Capability</th>
              <th className="px-4 py-2 font-normal">Decision</th>
              <th className="px-4 py-2 font-normal">Reason</th>
              <th className="px-4 py-2 font-normal">Execution</th>
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
        The console view omits parameters and order values. The ledger row records
        the decision without exposing order values. A decision is not proof of
        success; the execution outcome is recorded after the call.
      </p>
    </div>
  )
}
