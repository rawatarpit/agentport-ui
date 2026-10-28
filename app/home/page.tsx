import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ThemeToggle } from '@/components/theme-toggle'
import { AgentPortLogo } from '@/components/brand/agentport-logo'

export const metadata = {
  title: 'AgentPort — Agent analytics',
  description:
    'See what AI agents do on your site — what they ask for, what is allowed, held, or refused — and put policy in front of every action. Counts and decisions, never order values.',
}

/**
 * The public front door (agentport.relayforge.in/home).
 *
 * Analytics-first, because that is the question a merchant actually opens
 * with: who is asking, for what, and did it work. Policy in front of the
 * action is the second half — decided by the hosted governor, never by this
 * page.
 *
 * No invented numbers, no customer logos, no testimonials: the only
 * data-shaped element below is labelled an example, because a marketing panel
 * that reads like live customer data is the same lie as a green light on a
 * silent site. Every claim names something the product actually does — a
 * promise the console cannot keep is worse than no page at all.
 */

const EXAMPLE_ROWS = [
  {
    capability: 'searchProducts',
    counts: '412 asked · 0 held',
    label: 'ALLOW',
    tone: 'allow' as const,
    bar: 0.92,
  },
  {
    capability: 'createOrder',
    counts: '128 asked · 96 held · 22 refused',
    label: 'HELD',
    tone: 'held' as const,
    bar: 0.58,
  },
  {
    capability: 'requestRefund',
    counts: '9 asked · 9 refused',
    label: 'REFUSED',
    tone: 'deny' as const,
    bar: 0.18,
  },
]

const PILLARS = [
  {
    title: 'Demand',
    body: 'Who asks for what. Verified agents and unverified callers, per capability — the difference is visible before you trust either.',
    icon: 'demand' as const,
  },
  {
    title: 'Outcome',
    body: 'Allowed, held, refused, executed — per capability per week, with direction against the week before. One week of data renders flat, never a fake trend.',
    icon: 'outcome' as const,
  },
  {
    title: 'Conversion',
    body: 'Did the governed call succeed? Success and failure per capability, side by side with demand — never merged into an agent-level number the backend withholds.',
    icon: 'conversion' as const,
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Install once',
    body: 'Connect GitHub and we open one pull request that adds the agentport/ discovery package — not a runtime. Your team reviews it; you merge; your normal CI/CD deploys it. Repos that cannot take the App download the same package from the same compiler.',
  },
  {
    n: '2',
    title: 'Answer four questions',
    body: 'Two money questions, two permission questions, in plain language. They become typed policy — what agents see, what waits for you, what is always no. Drafts until the hosted governor applies the signed artifact.',
  },
  {
    n: '3',
    title: 'Watch the proof',
    body: 'Every decision lands on your ledger with its reason. Analytics counts what happened, per capability and per agent — never your order values. When a site goes quiet, the console says unknown, not green.',
  },
]

const RULES = [
  {
    title: 'Draft is never live.',
    body: 'Dashboard edits stay drafts until the hosted governor applies them. This page authors; it never enforces.',
  },
  {
    title: 'Held is never executed.',
    body: 'An approval freezes the request. The decision lands through the hosted approval path, not on a browser button.',
  },
  {
    title: 'Unknown is never healthy.',
    body: 'No push, no claim. A silent site reads unknown, never a healthy zero.',
  },
  {
    title: 'Secrets never persist.',
    body: 'CVVs, passwords, API keys, raw credentials: never stored, in either tier. Shared tier: requests transit our hosted worker, which records the ledger and analytics. Enterprise tier: the ledger stays on your stack; we receive aggregates only.',
  },
  {
    title: 'Enforcement is never here.',
    body: 'The runtime decides before the action. The console authors and displays — losing this dashboard never changes what an agent may do.',
  },
]

const AUDIENCES = [
  {
    title: 'Local shops',
    body: 'A customer asks a bot to buy. Below your line it runs; above it, you approve; refunds never go through an agent.',
  },
  {
    title: 'D2C brands',
    body: 'Discovery on marketplaces and search, checkout on your store — one policy, every agent, every surface.',
  },
  {
    title: 'Travel & bookings',
    body: 'Itineraries change, prices move, cancellations sting. Anything that costs money waits for a human.',
  },
  {
    title: 'SaaS & platforms',
    body: "Your customers' agents call your API. Scoped credentials, ceilings, per-agent demand, an audit trail per customer.",
  },
]

const CONTROL_ROWS = [
  { label: 'Kill switch', detail: 'Evaluated before everything else' },
  { label: 'Ceilings', detail: 'Above the line, ask a human first' },
  { label: 'Holds', detail: 'A request freezes until you decide' },
  { label: 'Refusals', detail: 'Always no, evaluated before holds' },
]

const FAQ = [
  {
    q: 'Is this page-view analytics?',
    a: 'No tracking pixels, no tags to install. AgentPort measures agent decisions on the surfaces you route through it: what was asked, what was allowed, held, or refused, and whether the call succeeded. It does not read your website’s human traffic.',
  },
  {
    q: 'What data do you keep?',
    a: 'Decisions, reasons, counts, and the analytics built from the governed path. Never CVVs, passwords, API keys, or raw credentials — in either tier. On the shared tier, requests transit our hosted worker and the ledger is recorded there; on the enterprise tier, the ledger stays on your stack and we receive aggregates only.',
  },
  {
    q: 'Do I approve requests in the dashboard?',
    a: 'You see the full context here. The decision lands in the CLI — agent-port approve — where the credential is. A browser approve button would move the trust boundary into a session cookie.',
  },
  {
    q: 'Can I leave?',
    a: 'Any time, one click. Your ledger stays yours — hosted by us on the shared tier, in your database on enterprise — and leaving never deletes your proof.',
  },
]

const PILOT_TERMS = [
  '₹0 during the pilot',
  '1 environment',
  'install call + first-proof session',
  'same-day replies on business days',
  'no SLA — the pilot is how we earn the right to offer one',
  'exit anytime, one click — your ledger stays yours',
]

const NAV = [
  { href: '#see', label: 'What you see' },
  { href: '#control', label: 'What you control' },
  { href: '#how', label: 'How it works' },
  { href: '#pilot', label: 'Pilot' },
]

const PRINCIPLES = [
  { k: 'Unknown, never green', v: 'No push means unknown, not a healthy zero.' },
  { k: 'Draft ≠ live', v: 'Edits are drafts until the governor applies them.' },
  { k: 'Counts, never amounts', v: 'The views cannot return an order value.' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-line/70 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" aria-label="AgentPort home" className="shrink-0">
            <AgentPortLogo />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="font-mono text-[12px] text-bone-dim transition-colors hover:text-bone"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden w-28 sm:block">
              <ThemeToggle />
            </div>
            <Link href="/login" className="btn px-4 py-2">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary px-4 py-2">
              Start the pilot
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        {/* Hero — the category, then the two halves: see, then decide. */}
        <section className="relative grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.02fr_0.98fr]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-60"
            style={{
              backgroundImage: 'radial-gradient(rgb(var(--ink-line)) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 25% 5%, black, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 25% 5%, black, transparent 75%)',
            }}
          />

          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-soft/70 px-3 py-1 font-mono text-[11px] text-bone-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
              Agent analytics
            </span>
            <h1 className="mt-6 text-balance font-display text-[42px] leading-[1.03] tracking-[-0.025em] text-bone sm:text-[58px]">
              See what AI agents do on your site.{' '}
              <span className="text-verdant">Decide what they may do.</span>
            </h1>
            <p className="prose-bone mt-6 max-w-[56ch]">
              See which agents ask for what — chatbots, assistants, and agents
              calling your interface. Put policy in front of every action: what
              runs, what waits for you, what is always refused. Counts and
              decisions, never order values.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link href="/signup" className="btn btn-primary px-5 py-2.5">
                Start the founding pilot
              </Link>
              <Link href="#how" className="btn px-5 py-2.5">
                See how it works
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-bone-faint">
              <li>Free during the founding pilot</li>
              <li aria-hidden="true" className="text-ink-line">
                /
              </li>
              <li>Counts and decisions</li>
              <li aria-hidden="true" className="text-ink-line">
                /
              </li>
              <li>Secrets never stored</li>
            </ul>
          </div>

          {/*
            An illustration, not tenant data. The label is part of the
            honesty contract: anything shaped like a number on this page must
            say whose numbers it is — an example's, never a made-up customer's.
          */}
          <div
            className="panel overflow-hidden shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)]"
            role="group"
            aria-label="Example analytics — illustrative values"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
              <span className="label">Example — last 7 days</span>
              <span className="rounded-full border border-verdant/30 bg-verdant/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-verdant">
                Illustrative
              </span>
            </div>

            {/* Decorative bars only — the card is labelled, so this reads as shape, not data. */}
            <div aria-hidden="true" className="flex h-16 items-end gap-1.5 border-b border-ink-line px-4 pb-3 pt-5">
              {[38, 64, 46, 72, 55, 86, 68].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-verdant/25"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <div className="space-y-4 px-4 py-4">
              {EXAMPLE_ROWS.map((row) => (
                <div key={row.capability}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px] text-bone">{row.capability}</span>
                    <Badge tone={row.tone}>{row.label}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="h-1 w-full overflow-hidden rounded-full bg-ink-line">
                      <span
                        className="block h-full rounded-full bg-verdant/60"
                        style={{ width: `${row.bar * 100}%` }}
                      />
                    </span>
                    <span className="tabular shrink-0 font-mono text-[11px] text-bone-faint">
                      {row.counts}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-ink-line px-4 py-3 font-mono text-[11px] text-bone-dim">
              <p>gpt-shopping · verified · 128 asks</p>
              <p>anonymous · unverified · 64 asks</p>
            </div>
            <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[12px] leading-relaxed text-bone-faint">
              Counts, not money — the views cannot return an amount. Your console
              reads your own rows.
            </p>
          </div>
        </section>

        {/* At-a-glance promises: the three that stop a dashboard becoming a lie. */}
        <section className="border-y border-ink-line/60">
          <div className="grid divide-y divide-ink-line/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {PRINCIPLES.map((p) => (
              <div key={p.k} className="px-1 py-6 sm:px-6">
                <p className="font-mono text-[12px] text-bone">{p.k}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-bone-faint">{p.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What you see — the analytics half, which is the reason to open the tool. */}
        <section id="see" className="scroll-mt-24 py-16 sm:py-20">
          <SectionHeading
            eyebrow="What you see"
            title="Every agent action, counted. Every decision, reasoned."
            lede="The screen a merchant actually returns to: which agents ask for what, what happened, and whether it worked. No tracking pixels, no tags — the hosted governor reports decisions, not browsing."
          />
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {PILLARS.map((p, i) => (
              <div
                key={p.title}
                className="group panel p-5 transition-colors hover:border-verdant/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-line bg-ink/50 text-verdant">
                    <PillarIcon name={p.icon} />
                  </span>
                  <span className="font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                </div>
                <p className="mt-4 font-display text-lg text-bone">{p.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-[11px] text-bone-faint">
            A site with no pushes renders unknown — not a healthy zero.
          </p>
        </section>

        {/* What you control — the half analytics alone can never have. */}
        <section id="control" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <SectionHeading
                eyebrow="What you control"
                title="Analytics tells you what happened. Policy decides before it happens."
                lede="Four questions in plain language: above what order value should we ask you first, above what value is the answer always no, which actions need a human, what must never run. The answers become typed policy — ceilings in minor units, holds, refusals, and a kill switch evaluated before everything else."
              />
              <div className="mt-7 flex flex-wrap gap-2 font-mono text-[11px]">
                {['Ceilings', 'Holds for a human', 'Always refused', 'Kill switch first'].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-ink-line px-3 py-1.5 text-bone-dim"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
                <span className="label">Policy — draft</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber">
                  not live
                </span>
              </div>
              <ul className="divide-y divide-ink-line/70">
                {CONTROL_ROWS.map((row, i) => (
                  <li key={row.label} className="flex items-start gap-3 px-4 py-3.5">
                    <span className="mt-0.5 font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                    <div>
                      <p className="font-mono text-[12px] text-bone">{row.label}</p>
                      <p className="mt-0.5 text-[12px] text-bone-faint">{row.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[12px] leading-relaxed text-bone-faint">
                Drafts until the hosted governor applies the signed artifact. This
                console authors; it never enforces.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <SectionHeading eyebrow="How it works" title="Three steps, then the proof runs itself." />
          <ol className="relative mt-10 grid gap-8 lg:grid-cols-3 lg:gap-6">
            <span
              aria-hidden="true"
              className="absolute left-4 top-4 hidden h-px w-[calc(100%-2rem)] bg-gradient-to-r from-verdant/40 via-ink-line to-ink-line lg:block"
            />
            {STEPS.map((s) => (
              <li key={s.n} className="relative">
                <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-verdant/40 bg-ink font-mono text-[12px] text-verdant">
                  {s.n}
                </span>
                <p className="mt-4 font-display text-xl text-bone">{s.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* The invariants, stated as promises the product keeps. */}
        <section className="border-t border-ink-line/60 py-16 sm:py-20">
          <div className="panel p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="label">What never bends</p>
              <p className="font-mono text-[11px] text-bone-faint">Five promises, kept structurally</p>
            </div>
            <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {RULES.map((r) => (
                <div key={r.title} className="border-l border-verdant/30 pl-4">
                  <p className="font-mono text-[13px] text-bone">{r.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who it is for */}
        <section className="border-t border-ink-line/60 py-16 sm:py-20">
          <SectionHeading eyebrow="Who it is for" title="Any business whose agents act on its behalf." />
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a, i) => (
              <div
                key={a.title}
                className="panel p-5 transition-colors hover:border-verdant/40"
              >
                <p className="font-mono text-[11px] text-verdant">0{i + 1}</p>
                <p className="mt-3 font-display text-lg text-bone">{a.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The offer, with the terms that are actually promised. */}
        <section id="pilot" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <div className="relative overflow-hidden rounded-xl border border-verdant/25 bg-ink-soft p-6 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(640px 220px at 12% 0%, rgba(47,156,104,0.12), transparent 70%)',
              }}
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <p className="label">Founding pilot</p>
                <h2 className="mt-3 font-display text-3xl tracking-[-0.01em] text-bone sm:text-[34px]">
                  One merchant at a time, hand-held.
                </h2>
                <p className="prose-bone mt-3">
                  We are onboarding founding merchants: free, one environment, run
                  end to end with you. Read-only the first week, one
                  approval-gated write the next, then a policy change with its
                  effect observed. In exchange: a friction log we may quote
                  (anonymised on request) and a reference call.
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Link href="/signup" className="btn btn-primary px-5 py-2.5">
                    Start the founding pilot
                  </Link>
                  <Link href="/login" className="btn px-5 py-2.5">
                    Sign in
                  </Link>
                </div>
              </div>
              <ul className="grid gap-x-6 gap-y-2.5 border-t border-ink-line pt-6 font-mono text-[12px] text-bone-dim sm:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                {PILOT_TERMS.map((term) => (
                  <li key={term} className="flex gap-2">
                    <span aria-hidden="true" className="text-verdant">
                      ·
                    </span>
                    <span>{term}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Straight answers — the questions a security review would ask. */}
        <section className="border-t border-ink-line/60 py-16 sm:py-20">
          <SectionHeading eyebrow="Straight answers" title="The questions a security review would ask." />
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {FAQ.map((item) => (
              <details key={item.q} className="group panel p-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-[14px] font-medium text-bone">{item.q}</span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 font-mono text-[16px] leading-none text-bone-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-line">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <AgentPortLogo />
              <p className="mt-3 text-[13px] leading-relaxed text-bone-faint">
                Agent analytics and policy for businesses whose agents act on
                their behalf.
              </p>
            </div>
            <nav aria-label="Footer" className="flex gap-12 font-mono text-[12px]">
              <div className="space-y-2.5">
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
              <div className="space-y-2.5">
                <p className="label">Account</p>
                <Link href="/login" className="block text-bone-dim transition-colors hover:text-bone">
                  Sign in
                </Link>
                <Link href="/signup" className="block text-bone-dim transition-colors hover:text-bone">
                  Create account
                </Link>
              </div>
            </nav>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 pt-6 font-mono text-[11px] text-bone-faint">
            <p>© 2026 AgentPort</p>
            <p>Counts and decisions, never order values.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede?: string
}) {
  return (
    <div>
      <p className="label">{eyebrow}</p>
      <h2 className="mt-3 max-w-[26ch] text-balance font-display text-3xl tracking-[-0.01em] text-bone sm:text-[34px]">
        {title}
      </h2>
      {lede ? <p className="prose-bone mt-3 max-w-[68ch]">{lede}</p> : null}
    </div>
  )
}

function PillarIcon({ name }: { name: 'demand' | 'outcome' | 'conversion' }) {
  if (name === 'demand') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
        <path
          d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 14.5c2.6 0 4.5 1.6 4.5 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (name === 'outcome') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 4v16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17l5-6 4 3 6-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
