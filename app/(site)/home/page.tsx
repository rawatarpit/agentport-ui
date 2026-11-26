import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ContactForm } from '@/components/contact-form'
import { DecisionDemo } from '@/components/landing/decision-demo'
import { TrackedCta } from '@/components/landing/tracked-cta'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: 'AgentPort — Infrastructure for the AI agent economy',
  description:
    'Understand how AI changes discovery, give compatible agents structured access to your operations, and keep permissions, approvals and proof in your hands.',
  alternates: { canonical: '/home' },
  openGraph: {
    title: 'AgentPort — Infrastructure for the AI agent economy',
    description:
      'Understand how AI changes discovery, give compatible agents structured access to your operations, and keep permissions, approvals and proof in your hands.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/home',
  },
  twitter: {
    card: 'summary',
    title: 'AgentPort — Infrastructure for the AI agent economy',
    description:
      'Structured access for compatible agents, governed by your rules — with decisions, reasons and outcomes you can read back.',
  },
}

/**
 * The public front door (agentport.relayforge.in/home).
 *
 * The page tells one story — understand the shift, enable access, retain
 * control — and each claim is bounded where it is made, not in a footnote at
 * the bottom. Three boundaries are load-bearing:
 *   - Intelligence is an industry preview built from public providers. There
 *     is no mechanism here that measures AI search visibility or AI-generated
 *     traffic, and the page says so.
 *   - Access is advisory. A published file grants no permission and guarantees
 *     no discovery; only connected, governed operations are in scope.
 *   - Approval is a hold, not a successful execution, and it is decided in the
 *     hosted path — the console has no browser approve button.
 *
 * Every data-shaped panel is labelled illustrative. No invented customers,
 * statistics or live-looking dashboards.
 *
 * Conversion is the founding pilot through the existing /api/contact route.
 * The two hero links use the one tracked CTA wrapper. It sends an allowlisted
 * event name and the pathname only — never the destination query, an email,
 * an amount, a capability name, or a request payload.
 */

/** Mirrors the public site's shared navigation labels exactly. Read by tests and kept in sync with site-nav. */
export const PUBLIC_LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/pilot', label: 'Pilot' },
] as const

const LANDSCAPE_SIGNALS = [
  { verb: 'Discover', body: 'Ask an assistant what exists, instead of opening a list of links.' },
  { verb: 'Research', body: 'Get a summary in plain language before visiting a site.' },
  { verb: 'Compare', body: 'Weigh a shortlist inside one conversation.' },
  { verb: 'Evaluate', body: 'Check fit, terms and policy before choosing.' },
  { verb: 'Act', body: 'Ask the assistant to do it — not just describe it.' },
] as const

const PILLARS = [
  {
    n: '01',
    name: 'Intelligence',
    promise: 'Understand the shift',
    body: 'Available now: an industry preview built from public sources, with a source on each figure and gaps left unknown. It frames the question before anything is connected; it does not measure AI-generated demand.',
    href: '/intelligence',
    link: 'Explore the preview',
  },
  {
    n: '02',
    name: 'Access',
    promise: 'Enable access',
    body: 'Available now: a discovery package installed by pull request or download. Compatible clients can read the capabilities you publish. A published file grants no permission and does not guarantee discovery.',
    href: '/pilot',
    link: 'Request access',
  },
  {
    n: '03',
    name: 'Control',
    promise: 'Retain control',
    body: 'Available now: ceilings, holds, refusals and a kill switch, evaluated by the hosted governor before an action runs. The console shows the decision, reason and result from your own rows.',
    href: '#controls',
    link: 'See governance',
  },
] as const

type JourneyStatus = 'live' | 'draft' | 'connection'

const JOURNEY: ReadonlyArray<{
  n: string
  title: string
  body: string
  status: JourneyStatus
  label: string
}> = [
  {
    n: '01',
    title: 'Discover',
    body: 'Frame the question with the industry preview. After signup, a website readiness assessment gives a session-only signal — not proof that agents can transact with you.',
    status: 'live',
    label: 'preview live · assessment after signup',
  },
  {
    n: '02',
    title: 'Connect',
    body: 'Connect a selected repository with least-privilege scopes, or download the kit. One pull request lands the discovery package. Your merge is review and adoption, not enforcement.',
    status: 'live',
    label: 'live now',
  },
  {
    n: '03',
    title: 'Govern',
    body: 'Capabilities and rules are drafted in the console; saving creates a draft. Approval and apply through the hosted path write the version the governor serves. It checks the credential and policy before execution.',
    status: 'draft',
    label: 'draft until approved',
  },
  {
    n: '04',
    title: 'Monitor',
    body: 'The governor writes the ledger row. The console reads only your own rows through row-level security. No push means unknown — never a healthy zero.',
    status: 'connection',
    label: 'requires connection',
  },
]

const STATUS_CLASS: Record<JourneyStatus, string> = {
  live: 'border-verdant/40 bg-verdant/5 text-verdant',
  draft: 'border-amber/40 bg-amber/5 text-amber',
  connection: 'border-ink-line bg-ink/40 text-bone-faint',
}

const CONTROLS = [
  {
    title: 'Ceilings',
    body: 'Set hard and soft limits on measurable actions. Above a hard limit: refused. Above a soft limit: held for approval.',
  },
  {
    title: 'Holds',
    body: 'Pause an action until an authorized person approves it. A held action does not run while approval is pending; approval checks policy again at commit.',
  },
  {
    title: 'Refusals',
    body: 'Block actions your business does not allow. Every refusal has a reason and is recorded. Refusals are checked before holds.',
  },
  {
    title: 'Kill switch',
    body: 'Stop agent-initiated writes and make reads audit-only. Your website and APIs keep running. It is checked first and cannot be cleared by a publish.',
  },
] as const

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
] as const

const BOUNDARIES = [
  {
    title: 'Merchant authentication',
    body: 'Your identity system still decides who a user is. AgentPort adds a policy decision for the operations you connect.',
  },
  {
    title: 'Agent credentials',
    body: 'Short-lived, scoped credentials issued by your business, checked before policy. Being an agent is not a credential.',
  },
  {
    title: 'Scoped permissions',
    body: 'Only connected operations are in scope. Ordinary site traffic and unconnected APIs stay outside the boundary.',
  },
  {
    title: 'Human confirmation',
    body: 'State-changing requests are prepared with GET and confirmed by a person before a governed write runs.',
  },
  {
    title: 'Execution enforcement',
    body: 'The hosted governor decides before execution. A browser session never stands in for that decision.',
  },
  {
    title: 'Auditability',
    body: 'Append-only rows record capability, agent, decision, rule, reason, approval, result and a per-row digest. Unknown stays unknown.',
  },
] as const

const PILOT_TERMS = [
  'One environment',
  'Assisted setup',
  'A limited set of agreed capabilities',
  'Initial policy configuration',
  'A working allow / hold / refuse demonstration',
  'A review of activity and audit records',
  'Your own hosting and infrastructure costs remain yours',
  'Scope and eligibility agreed before onboarding',
  'Exit anytime; leaving never deletes your proof',
] as const

const FAQ = [
  {
    q: 'Will this make us visible in ChatGPT or every other assistant?',
    a: 'No. We publish structured capabilities for compatible clients. Discovery depends on the agent or platform. The manifest is advisory and carries no policy decision.',
  },
  {
    q: 'Can you tell us how much of our traffic came from AI search?',
    a: 'No. AI search visibility and AI-generated traffic are not measured. The industry preview shows sourced public evidence and leaves gaps unknown.',
  },
  {
    q: 'Does a rule go live when I save it in the console?',
    a: 'No. Saving creates a draft. Approval and apply through the hosted path write the version the governor serves, and nothing is live before that.',
  },
  {
    q: 'What happens when an action is held?',
    a: 'It stays pending and does not run until the required approval is recorded. Approval checks policy again at commit, and happens through the hosted path — not a browser button.',
  },
  {
    q: 'Does an approval mean the action succeeded?',
    a: 'No. A decision is not proof that the downstream call worked. The outcome is recorded after the call, as a separate fact.',
  },
  {
    q: 'What can we see about agent activity in the console?',
    a: 'Capability, agent, decision, reason, rule, approval, result and a per-row digest, read from your own rows through row-level security. Parameters, amounts, detail and error text are omitted; no push means unknown, not zero.',
  },
  {
    q: 'Do you store card numbers, passwords or API keys?',
    a: 'No. CVV, passwords, API keys and raw credentials are never persisted in either tier. In the shared tier, connected requests pass through our hosted worker; in enterprise, nothing about a call transits us and we receive aggregates only.',
  },
  {
    q: 'Does this replace our API or authentication?',
    a: 'No. It works alongside your application and API for the operations you connect. Your authentication and authorization responsibilities still matter.',
  },
  {
    q: 'What is planned but not available today?',
    a: 'Longer retention, exports, alerting and multi-site views are planned, not shipped. They extend proof — never the columns or the readers.',
  },
] as const

export default function HomePage() {
  return (
    <>
      {/* 01 — Hero */}
        <section className="relative grid items-center gap-14 pb-14 pt-16 sm:pb-20 sm:pt-24 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
          <div className="rise">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
              Infrastructure for the AI agent economy
              <span aria-hidden="true" className="h-px w-10 bg-verdant/40" />
            </div>

            <h1 className="mt-6 font-display text-[clamp(2.6rem,6vw,4.2rem)] leading-[1.02] tracking-[-0.03em] text-bone">
              Customers are starting to arrive as AI agents.
              <span className="mt-2 block italic text-verdant">Give them a way in — on your terms.</span>
            </h1>

            <p className="prose-bone mt-6 max-w-[58ch]">
              AgentPort is infrastructure for businesses in the AI agent economy. Compatible agents can
              discover what you offer and request specific operations; your rules decide what runs, and each
              governed decision is recorded with its reason and outcome.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <TrackedCta href="/pilot" event="hero_primary_cta_clicked" className="btn btn-primary px-5 py-2.5">
                Request a pilot
              </TrackedCta>
              <TrackedCta href="/intelligence" event="hero_demo_cta_clicked" className="btn px-5 py-2.5">
                Explore the industry preview
              </TrackedCta>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
              <a href="#how" className="group inline-flex items-center gap-2 text-bone-faint transition-colors hover:text-bone">
                See how it works
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <Link
                href="/intelligence/report?sample=1"
                className="text-bone-faint underline decoration-ink-line underline-offset-4 transition-colors hover:text-bone"
              >
                See the flagged fictional sample
              </Link>
            </div>

            <p className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] uppercase tracking-[0.08em] text-bone-dim">
              <span>Understand the shift</span>
              <span aria-hidden="true" className="text-verdant">→</span>
              <span>Enable access</span>
              <span aria-hidden="true" className="text-verdant">→</span>
              <span>Retain control</span>
            </p>

            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-bone-faint">
              <li>Assisted setup</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>One environment</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>Selected founding pilots</li>
            </ul>

            <p className="mt-4 max-w-[56ch] font-mono text-[11px] leading-relaxed text-bone-faint">
              Enforcement covers only the operations you connect to AgentPort —
              not every interaction on your site.
            </p>
          </div>

          <DecisionPreview />
        </section>

        {/* 02 — The changing landscape */}
        <section id="landscape" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="01"
            eyebrow="The changing landscape"
            title="Research is moving into AI assistants."
            lede="Customers increasingly ask an assistant to find options, compare them, and even start an action. Those assistants expect structured answers, not a page written for a person."
          />

          <ol className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
            {LANDSCAPE_SIGNALS.map((signal, i) => (
              <li key={signal.verb} className="border-t border-ink-line/70 pt-4">
                <span className="font-mono text-[11px] text-verdant">0{i + 1}</span>
                <p className="mt-3 font-display text-[20px] text-bone">{signal.verb}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{signal.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid items-start gap-6 rounded-lg border border-ink-line bg-ink-soft p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="label">What we do not claim</p>
              <p className="mt-3 text-[14px] leading-relaxed text-bone-dim">
                AI search visibility and AI-generated traffic are not measured. Our industry preview
                builds a report from public providers — World Bank, SEC EDGAR and GitHub public search — with
                a source on each figure. Anything without evidence stays unknown.
              </p>
            </div>
            <div className="border-t border-ink-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="label">Preview without answering</p>
              <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
                Want to see the layout first? Open the explicitly flagged fictional sample. Every number in it
                is invented for interface review.
              </p>
              <Link href="/intelligence/report?sample=1" className="btn btn-sm mt-4 px-3 py-1.5">
                Explore fictional sample
              </Link>
            </div>
          </div>
        </section>

        {/* 03 — The business opportunity */}
        <section id="opportunity" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="02"
            eyebrow="The business opportunity"
            title="The opportunity is a controlled way in."
            lede="A structured interface lets a compatible agent ask for a named operation instead of scraping your website or driving a human checkout. You decide which operations exist, which may read, which may change data, and which need a person."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <div className="panel-muted rounded-lg p-5 sm:p-6">
              <p className="label">Without a structured interface</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                An agent reads a page meant for people, or needs a custom integration. What it can do depends
                on the platform, and the terms are not yours to set.
              </p>
            </div>
            <div className="panel rounded-lg p-5 sm:p-6">
              <p className="label">With a published capability</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                A compatible agent can request <code className="font-mono text-[12px] text-bone">searchProducts</code>{' '}
                or <code className="font-mono text-[12px] text-bone">createOrder</code> by name. Publishing is
                advisory — it grants no permission and guarantees no discovery.
              </p>
            </div>
          </div>

          <p className="mt-8 max-w-[72ch] text-[14px] leading-relaxed text-bone-dim">
            Preparing does not force adoption. It means the terms are yours when compatible agents arrive —
            not a promise of being listed in every assistant.
          </p>
        </section>

        {/* 04 — Introduce AgentPort */}
        <section id="platform" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="03"
            eyebrow="Introducing AgentPort"
            title="One path. Three jobs around it."
            lede="AgentPort gives a business a machine-readable description of what it offers, a governed route for agent requests, and a record of what happened. The three pillars are one story — not three separate products."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PILLARS.map((pillar) => (
              <section key={pillar.n} className="panel flex h-full flex-col p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[11px] text-verdant">{pillar.n}</span>
                  <span className="label">{pillar.promise}</span>
                </div>
                <h3 className="mt-4 font-display text-[23px] leading-tight text-bone">{pillar.name}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">{pillar.body}</p>
                <Link href={pillar.href} className="link mt-auto pt-6 font-mono text-[11.5px]">
                  {pillar.link} →
                </Link>
              </section>
            ))}
          </div>

          <span className="font-mono text-[11px] text-bone-faint">
            Understand → Connect → Control → Operate
          </span>
        </section>

        {/* 05 — How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="04"
            eyebrow="How it works"
            title="Four steps from question to proof."
            lede="Only operations you connect and route through the governor are governed. A published file decides nothing, and saving a draft changes nothing."
          />

          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {JOURNEY.map((step) => (
              <li key={step.n} className="border-t border-ink-line/70 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-[34px] leading-none text-verdant/80">{step.n}</span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${STATUS_CLASS[step.status]}`}>
                    {step.label}
                  </span>
                </div>
                <p className="mt-4 font-display text-[22px] text-bone">{step.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">{step.body}</p>
              </li>
            ))}
          </ol>

          <RequestPath />

          <div className="mt-8">
            <Link href="#controls" className="btn btn-sm px-3 py-1.5">
              See governance and control
            </Link>
          </div>
        </section>

        {/* 06 — Governance and control */}
        <section id="controls" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="05"
            eyebrow="Governance and control"
            title="You set the limits before an agent acts."
            lede="Rules are checked in order: kill switch, refusals, ceilings, approval holds, then rate limits. A state-changing request is prepared with GET, shown as a draft, confirmed by a person, and sent once through the governed path."
          />

          <div className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {CONTROLS.map((control, i) => (
              <div key={control.title} className="flex gap-4 border-t border-ink-line/60 py-6">
                <span className="font-mono text-[11px] text-verdant">0{i + 1}</span>
                <div>
                  <p className="font-mono text-[13px] text-bone">{control.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">{control.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label">See it decide</p>
                <h3 className="mt-2 font-display text-[24px] text-bone">A decision before an action runs.</h3>
              </div>
              <p className="font-mono text-[11px] text-bone-faint">Sample policy · illustrative</p>
            </div>
            <div className="mt-6">
              <DecisionDemo />
            </div>
            <p className="mt-6 max-w-[72ch] text-[13px] leading-relaxed text-bone-dim">
              Approvals are decided through the hosted path where the credential lives — the console shows the
              queue; it has no browser approve button. A held request has not run, and an allowed decision is
              not proof that the downstream call succeeded.
            </p>
          </div>


        </section>

        {/* 07 — Visibility and analytics */}
        <section id="visibility" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="06"
            eyebrow="Visibility and analytics"
            title="See the decisions, not the traffic."
            lede="Governed activity is recorded so you can review what an agent asked for, what your policy decided, and what happened next."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <div className="panel p-5 sm:p-6">
              <p className="label">From your ledger rows</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                Capability, agent, decision, reason, rule, approval, result and a per-row digest, read through
                row-level security from your own tenant. Parameters, amounts, detail and error text are
                omitted. With no push, the answer is unknown — not zero.
              </p>
              <p className="mt-5 font-mono text-[11px] text-bone-faint">Available now</p>
            </div>
            <div className="panel p-5 sm:p-6">
              <p className="label">From first-party acquisition events</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                Counts of how visitors move through the public site, stored in our own event table. No
                third-party analytics vendor is wired into this site.
              </p>
              <p className="mt-5 font-mono text-[11px] text-bone-faint">Available now</p>
            </div>
          </div>

          <div className="mt-10">
            <p className="label">An illustrative activity record</p>
            <div className="mt-4">
              <AuditTable />
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-dashed border-ink-line bg-ink/30 p-5 sm:p-6">
            <p className="label">Planned — not available today</p>
            <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
              Longer retention, exports, alerting and multi-site views. They extend proof — never the columns
              or the readers. AI search visibility and AI-generated traffic are not measured.
            </p>
          </div>


        </section>

        {/* 08 — Trust and reliability */}
        <section id="trust" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="07"
            eyebrow="Trust and reliability"
            title="The boundary is stated, not implied."
            lede="AgentPort governs the operations you connect. It works alongside your application and API — it does not replace your authentication or your security infrastructure."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <div className="panel p-5 sm:p-6">
              <p className="label">Shared tier — payloads in transit</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                Connected requests pass through our hosted worker by design. It is the governed hop: it
                records the decision and pushes first-party analytics events.
              </p>
            </div>
            <div className="panel p-5 sm:p-6">
              <p className="label">Enterprise tier — aggregates only</p>
              <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
                Nothing about a call transits us. What we receive is aggregates only. Widening what exists
                needs a custody review, not a UI change.
              </p>
            </div>
          </div>

          <p className="mt-5 rounded-md border border-rust/30 bg-rust/5 px-4 py-3 font-mono text-[11px] leading-relaxed text-bone-dim">
            Never persisted in either tier: CVV, passwords, API keys, raw credentials.
          </p>

          <dl className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {BOUNDARIES.map((item, i) => (
              <div key={item.title} className="border-t border-ink-line/60 py-6 sm:py-5">
                <dt className="font-mono text-[13px] text-bone">
                  <span className="mr-3 text-verdant">0{i + 1}</span>
                  {item.title}
                </dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">{item.body}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-[72ch] font-mono text-[11px] leading-relaxed text-bone-faint">
            No blanket security claim. The boundary is AgentPort’s governance path; the installed package
            makes no decisions.
          </p>


        </section>

        {/* 09 — Final CTA */}
        <section id="contact" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <div className="rounded-xl border border-verdant/25 bg-ink-soft p-6 sm:p-10">
            <div className="grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
                  Founding pilots — selected and assisted
                </div>
                <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.02em] text-bone">
                  Start with one workflow. See the proof.
                </h2>
                <p className="prose-bone mt-4">
                  A pilot starts with one environment and a focused set of operations, so both teams can
                  verify the integration, policy behaviour and audit trail before expanding. Tell us what your
                  business does and which operations agents might need to perform.
                </p>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-bone-dim">
                  No AgentPort fee for selected founding-pilot participants. You remain responsible for your
                  own hosting, database and third-party infrastructure costs. Scope and eligibility are agreed
                  before onboarding.
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

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead index="08" eyebrow="FAQ" title="Straight answers." />
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
                <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed text-bone-dim">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a href="#contact" className="link font-mono text-[11.5px]">
              Ask about a pilot →
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead index="08" eyebrow="FAQ" title="Straight answers." />
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
                <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed text-bone-dim">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a href="#contact" className="link font-mono text-[11.5px]">
              Ask about a pilot →
            </a>
          </div>
        </section>
    </>
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
          Illustrative — not your data
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
        A held request has not run. A decision is not proof that the downstream call succeeded.
      </p>
    </div>
  )
}

/** The request path, with the ledger shown as a record rather than a step. */
function RequestPath() {
  const steps = [
    { label: 'AI agent', body: 'Scoped credential' },
    { label: 'Your endpoint', body: 'Integration or proxy' },
    { label: 'AgentPort governor', body: 'Policy check' },
    { label: 'Decision', body: 'Allow · Hold · Refuse' },
    { label: 'Business action', body: 'Runs only after a decision' },
  ]

  return (
    <div className="mt-10 rounded-lg border border-ink-line bg-ink-soft/60 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="label">Request path</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">sample</span>
      </div>

      <ol className="mt-5 grid gap-3 lg:grid-cols-5">
        {steps.map((step, i) => (
          <li key={step.label} className="relative rounded-md border border-ink-line bg-ink/40 p-3">
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
        <p className="mt-1 text-[11px] leading-relaxed text-bone-faint">Records the decision and outcome. Does not execute.</p>
      </div>

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-bone-faint">
        Only calls routed through AgentPort are governed. A manifest does not guarantee discovery.
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
              <tr key={`${row.time}-${row.capability}`} className="border-b border-ink-line/60 last:border-b-0">
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
        The console view omits parameters and order values. A decision is not proof of success; the outcome is
        recorded after the call.
      </p>
    </div>
  )
}
