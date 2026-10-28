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
  },
  {
    capability: 'createOrder',
    counts: '128 asked · 96 held · 22 refused',
    label: 'HELD',
    tone: 'held' as const,
  },
  {
    capability: 'requestRefund',
    counts: '9 asked · 9 refused',
    label: 'REFUSED',
    tone: 'deny' as const,
  },
]

const PILLARS = [
  {
    title: 'Demand',
    body: 'Who asks for what. Verified agents and unverified callers, per capability — the difference is visible before you trust either.',
  },
  {
    title: 'Outcome',
    body: 'Allowed, held, refused, executed — per capability per week, with direction against the week before. One week of data renders flat, never a fake trend.',
  },
  {
    title: 'Conversion',
    body: 'Did the governed call succeed? Success and failure per capability, side by side with demand — never merged into an agent-level number the backend withholds.',
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

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-line/70 pb-5">
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
      </header>

      <main>
        {/* Hero — the category, then the two halves: see, then decide. */}
        <section className="relative grid items-start gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
            style={{
              backgroundImage: 'radial-gradient(rgb(var(--ink-line)) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 30% 10%, black, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 30% 10%, black, transparent 75%)',
            }}
          />

          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-ink-soft/60 px-3 py-1 font-mono text-[11px] text-bone-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-verdant" aria-hidden="true" />
              Agent analytics
            </span>
            <h1 className="mt-5 font-display text-[40px] leading-[1.04] tracking-[-0.02em] text-bone sm:text-[56px]">
              See what AI agents do on your site. Decide what they may do.
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
            className="panel overflow-hidden shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)]"
            role="group"
            aria-label="Example analytics — illustrative values"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
              <span className="label">Example — last 7 days</span>
              <span className="font-mono text-[11px] text-verdant">↗ busier than last week</span>
            </div>
            <div className="space-y-3.5 px-4 py-4">
              {EXAMPLE_ROWS.map((row) => (
                <div key={row.capability}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px] text-bone">{row.capability}</span>
                    <Badge tone={row.tone}>{row.label}</Badge>
                  </div>
                  <p className="tabular mt-1 font-mono text-[11px] text-bone-faint">{row.counts}</p>
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

        {/* What you see — the analytics half, which is the reason to open the tool. */}
        <section id="see" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <SectionHeading
            eyebrow="What you see"
            title="Every agent action, counted. Every decision, reasoned."
            lede="The screen a merchant actually returns to: which agents ask for what, what happened, and whether it worked. No tracking pixels, no tags — the hosted governor reports decisions, not browsing."
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {PILLARS.map((p, i) => (
              <div
                key={p.title}
                className="panel p-5 transition-colors hover:border-verdant/40"
              >
                <p className="font-mono text-[11px] text-verdant">0{i + 1}</p>
                <p className="mt-3 font-display text-lg text-bone">{p.title}</p>
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
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <SectionHeading
            eyebrow="How it works"
            title="Three steps, then the proof runs itself."
          />
          <ol className="mt-8 grid gap-3 lg:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="panel flex flex-col p-5 transition-colors hover:border-verdant/40"
              >
                <span className="font-display text-4xl leading-none text-verdant/80">{s.n}</span>
                <p className="mt-4 font-display text-xl text-bone">{s.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* The invariants, stated as promises the product keeps. */}
        <section className="border-t border-ink-line/60 py-16 sm:py-20">
          <div className="panel p-6 sm:p-8">
            <p className="label">What never bends</p>
            <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {RULES.map((r) => (
                <div key={r.title} className="border-l border-ink-line pl-4">
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
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div
                key={a.title}
                className="panel p-5 transition-colors hover:border-verdant/40"
              >
                <p className="font-display text-lg text-bone">{a.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The offer, with the terms that are actually promised. */}
        <section id="pilot" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-20">
          <div className="panel p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <p className="label">Founding pilot</p>
                <h2 className="mt-3 font-display text-3xl tracking-[-0.01em] text-bone">
                  One merchant at a time, hand-held.
                </h2>
                <p className="prose-bone mt-3">
                  We are onboarding founding merchants: free, one environment, run
                  end to end with you. Read-only the first week, one
                  approval-gated write the next, then a policy change with its
                  effect observed. In exchange: a friction log we may quote
                  (anonymised on request) and a reference call.
                </p>
                <div className="mt-6">
                  <Link href="/signup" className="btn btn-primary px-5 py-2.5">
                    Start the founding pilot
                  </Link>
                </div>
              </div>
              <ul className="space-y-2.5 border-t border-ink-line pt-6 font-mono text-[12px] text-bone-dim lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
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
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="panel p-5">
                <p className="text-[14px] font-medium text-bone">{item.q}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-line py-10">
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
      <h2 className="mt-3 max-w-[26ch] font-display text-3xl tracking-[-0.01em] text-bone sm:text-[34px]">
        {title}
      </h2>
      {lede ? <p className="prose-bone mt-3 max-w-[68ch]">{lede}</p> : null}
    </div>
  )
}
