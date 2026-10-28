import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ThemeToggle } from '@/components/theme-toggle'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { ContactForm } from '@/components/contact-form'

export const metadata = {
  title: 'AgentPort — Agent analytics',
  description:
    'See what AI agents ask of your business, what was allowed, held, or refused — then put your policy in front of the next request. Counts and decisions, never order values.',
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
 */

const NAV = [
  { href: '#problem', label: 'Why' },
  { href: '#see', label: 'See' },
  { href: '#control', label: 'Control' },
  { href: '#how', label: 'How' },
  { href: '#contact', label: 'Pilot' },
]

const SPECS = [
  { k: 'Enforcement', v: 'Hosted governor' },
  { k: 'Proof', v: 'Your ledger rows' },
  { k: 'Storage', v: 'No amounts, no secrets' },
]

const PROBLEMS = [
  {
    title: 'You cannot see the requests.',
    body: 'Page analytics counts humans. Agent requests arrive through interfaces nobody instrumented — chatbot checkouts, assistants calling your API.',
  },
  {
    title: 'You cannot set the lines.',
    body: 'Between an agent and your money there is no ceiling, no hold, no always-no. The only options are “trust it” or “switch it off”.',
  },
  {
    title: 'You cannot prove what happened.',
    body: 'When a decision is questioned, a screenshot is not evidence. A ledger row with its reason is.',
  },
]

const PILLARS = [
  {
    title: 'Demand',
    body: 'Which agents ask for what, and which callers are verified — visible before you trust either.',
    icon: 'demand' as const,
  },
  {
    title: 'Outcome',
    body: 'Allowed, held, refused, executed. Per capability, week over week — never a fake trend from one week of rows.',
    icon: 'outcome' as const,
  },
  {
    title: 'Conversion',
    body: 'Did the call succeed? Success and failure sit beside demand, never merged into a number the backend withholds.',
    icon: 'conversion' as const,
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Connect once',
    body: 'One pull request adds the discovery package. You review it, you merge it, your CI/CD deploys it. No runtime to install.',
  },
  {
    n: '02',
    title: 'Set the lines',
    body: 'Four plain-language questions become typed policy: what runs, what waits for you, what is always no.',
  },
  {
    n: '03',
    title: 'Watch the proof',
    body: 'Every decision lands on your ledger with its reason. When a site goes quiet, the console says unknown — never green.',
  },
]

const FLOW = [
  {
    label: 'Discovery',
    body: 'Your site publishes a small, advisory manifest that points agents at the hosted governor. Nothing on your site decides anything.',
  },
  {
    label: 'Decision',
    body: 'The governor verifies the caller, evaluates your ordered policy, then executes or refuses. Your ceilings and holds run first.',
  },
  {
    label: 'Proof',
    body: 'Every decision is written to your ledger with its reason and digest. Counts and decisions — never your order values.',
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
    body: 'A customer asks a bot to buy. Below your line it runs; above it, you approve.',
  },
  {
    title: 'D2C brands',
    body: 'Discovery on marketplaces, checkout on your store. One policy across every agent.',
  },
  {
    title: 'Travel & bookings',
    body: 'Itineraries change and prices move. Anything that costs money waits for a human.',
  },
  {
    title: 'SaaS & platforms',
    body: "Your customers' agents call your API. Scoped credentials, ceilings, an audit trail per customer.",
  },
]

const CONTROL_ROWS = [
  { label: 'Kill switch', detail: 'on — evaluated before everything', tone: 'deny' as const },
  { label: 'searchProducts', detail: 'allow', tone: 'allow' as const },
  { label: 'createOrder', detail: 'hold above your ceiling', tone: 'held' as const },
  { label: 'requestRefund', detail: 'always hold for a human', tone: 'held' as const },
  { label: 'deleteAccount', detail: 'refuse, always', tone: 'deny' as const },
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

const EXAMPLE_STATS = [
  { k: 'Requests', v: '549' },
  { k: 'Held', v: '96' },
  { k: 'Refused', v: '31' },
]

const EXAMPLE_ROWS = [
  { capability: 'searchProducts', asked: '412', label: 'ALLOW', tone: 'allow' as const },
  { capability: 'createOrder', asked: '128', label: 'HELD', tone: 'held' as const },
  { capability: 'requestRefund', asked: '9', label: 'REFUSED', tone: 'deny' as const },
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
          <Link href="/" aria-label="AgentPort home" className="shrink-0">
            <AgentPortLogo />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
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
              Request an invite
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
              Agent analytics
              <span aria-hidden="true" className="h-px w-10 bg-verdant/40" />
              <span className="text-bone-faint/70">for businesses</span>
            </div>

            <h1 className="mt-6 font-display text-[clamp(2.7rem,6vw,4.35rem)] leading-[0.98] tracking-[-0.03em] text-bone">
              See what AI agents do on your site.
              <span className="mt-2 block italic text-verdant">Decide what they may do.</span>
            </h1>

            <p className="prose-bone mt-6 max-w-[52ch]">
              Every agent request — allowed, held, or refused — in one clear
              read. Then your policy sits in front of the next one. Counts and
              decisions, never order values.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#contact" className="btn btn-primary px-5 py-2.5">
                Request an invite
              </a>
              <a
                href="#see"
                className="group inline-flex items-center gap-2 px-1 py-2 font-mono text-[12px] text-bone-dim transition-colors hover:text-bone"
              >
                See the console
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-bone-faint">
              <li>Invite-only founding pilot</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>Hand-held onboarding</li>
              <li aria-hidden="true" className="text-ink-line">/</li>
              <li>Secrets never stored</li>
            </ul>
          </div>

          <ConsolePreview />
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

        {/* 01 — The shift */}
        <section id="problem" className="scroll-mt-24 py-16 sm:py-24">
          <SectionHead
            index="01"
            eyebrow="The shift"
            title="Agents are already acting. You just cannot see it."
            lede="Chatbots take orders. Assistants call APIs. Shoppers delegate checkout. Your analytics counts visits — it cannot tell you what an agent asked for, or what your policy decided."
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
        </section>

        {/* 02 — What you see */}
        <section id="see" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="02"
            eyebrow="What you see"
            title="One read for every agent request."
            lede="Who asked, for what, what happened, and whether it worked — per capability and per agent. No pixels, no tags."
          />
          <div className="mt-12 grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="grid gap-8 sm:grid-cols-3 lg:grid-cols-1 lg:gap-7">
                {PILLARS.map((p) => (
                  <div key={p.title} className="flex gap-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-line bg-ink-soft text-verdant">
                      <PillarIcon name={p.icon} />
                    </span>
                    <div>
                      <p className="font-display text-[18px] text-bone">{p.title}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-bone-dim">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-8 border-l border-verdant/40 pl-4 font-mono text-[11px] leading-relaxed text-bone-faint">
                A site with no pushes renders unknown — never a healthy zero.
              </p>
            </div>

            <RequestCard />
          </div>
        </section>

        {/* 03 — What you control */}
        <section id="control" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="03"
            eyebrow="What you control"
            title="Analytics says what happened. Policy decides what happens next."
            lede="Four plain-language questions become typed policy — evaluated in order, on every request, before the action runs."
          />
          <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <PolicyCard />
            <div className="lg:pt-2">
              <div className="space-y-5">
                {[
                  { k: 'Ceilings', v: 'Above the line, ask a human first.' },
                  { k: 'Holds', v: 'A request freezes until you decide.' },
                  { k: 'Refusals', v: 'Always no, evaluated before holds.' },
                  { k: 'Kill switch', v: 'Evaluated before everything else.' },
                ].map((r, i) => (
                  <div key={r.k} className="flex gap-4 border-t border-ink-line/60 pt-4 first:border-t-0 first:pt-0">
                    <span className="font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                    <div>
                      <p className="font-mono text-[13px] text-bone">{r.k}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-bone-dim">{r.v}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-7 font-mono text-[11px] leading-relaxed text-bone-faint">
                Drafts until the hosted governor applies the signed artifact.
                This console authors; it never enforces.
              </p>
            </div>
          </div>
        </section>

        {/* 04 — How it works */}
        <section id="how" className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="04"
            eyebrow="How it works"
            title="Live in three steps."
            lede="No agent runtime to install, no second compiler. The kit lands once; every later change flows through the publish channel."
          />
          <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t border-ink-line/70 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[34px] leading-none text-verdant/80">{s.n}</span>
                  <span aria-hidden="true" className="font-mono text-[11px] text-bone-faint">
                    ───
                  </span>
                </div>
                <p className="mt-4 font-display text-[22px] text-bone">{s.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 05 — Under the hood */}
        <section className="border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="05"
            eyebrow="Under the hood"
            title="One path. One record."
            lede="Nothing on your site decides whether a call is allowed. Enforcement lives on the hosted governor; the console only authors and displays."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {FLOW.map((f, i) => (
              <div key={f.label} className="relative rounded-lg border border-ink-line bg-ink-soft/60 p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-verdant">
                    {f.label}
                  </span>
                  <span className="font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">{f.body}</p>
                {i < FLOW.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-ink-line bg-ink px-1.5 py-0.5 font-mono text-[10px] text-bone-faint lg:block"
                  >
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* 06 — What never bends */}
        <section className="border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="06"
            eyebrow="What never bends"
            title="Five promises, kept structurally."
            lede="These are not slogans on a page. Each one is enforced by the runtime, the database, or the build — and tested."
          />
          <div className="mt-12 grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {RULES.map((r, i) => (
              <div key={r.title} className="flex gap-4 border-t border-ink-line/60 py-6">
                <span className="font-mono text-[11px] text-verdant">0{i + 1}</span>
                <div>
                  <p className="font-mono text-[13px] text-bone">{r.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-bone-dim">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 07 — Who it is for */}
        <section className="border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="07"
            eyebrow="Who it is for"
            title="Any business whose agents act on its behalf."
          />
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {AUDIENCES.map((a, i) => (
              <div key={a.title} className="flex gap-5 border-t border-ink-line/60 pt-5">
                <span className="font-mono text-[11px] text-bone-faint">0{i + 1}</span>
                <div>
                  <p className="font-display text-[24px] leading-tight text-bone">{a.title}</p>
                  <p className="mt-1.5 max-w-[44ch] text-[14px] leading-relaxed text-bone-dim">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pilot — invite only */}
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
                  We onboard one merchant at a time.
                </h2>
                <p className="prose-bone mt-4">
                  Free, one environment, run end to end with us: install, first
                  proof, then a policy change and its effect observed. In
                  exchange, a friction log and a reference call.
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

        {/* 08 — Straight answers */}
        <section className="border-t border-ink-line/60 py-16 sm:py-24">
          <SectionHead
            index="08"
            eyebrow="Straight answers"
            title="The questions a security review would ask."
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
                <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed text-bone-dim">{item.a}</p>
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
                Agent analytics and policy for businesses whose agents act on
                their behalf.
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
                Request an invite
              </a>
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 pt-6 font-mono text-[11px] text-bone-faint">
            <p>© 2026 AgentPort</p>
            <p>Counts and decisions, never order values.</p>
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
 * A labelled illustration of the console read — never tenant data. The badge
 * and aria-label are the honesty contract: a merchant must be able to tell a
 * screenshot from their own rows at a glance.
 */
function ConsolePreview() {
  return (
    <div
      className="rise rise-2 overflow-hidden rounded-xl border border-ink-line bg-ink-soft shadow-[0_40px_100px_-50px_rgba(0,0,0,0.85)]"
      role="group"
      aria-label="Example console — illustrative values"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-rust/70" />
          <span className="h-2 w-2 rounded-full bg-amber/70" />
          <span className="h-2 w-2 rounded-full bg-verdant/70" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-faint">
          console / overview
        </span>
        <span className="rounded-full border border-verdant/30 bg-verdant/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-verdant">
          Illustrative
        </span>
      </div>

      <div className="flex items-center gap-4 border-b border-ink-line px-4 py-2.5 font-mono text-[10px] text-bone-faint">
        <span className="border-b border-verdant pb-1 text-bone">Overview</span>
        <span>Capabilities</span>
        <span>Ledger</span>
        <span className="ml-auto">last 7 days</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-ink-line border-b border-ink-line">
        {EXAMPLE_STATS.map((s) => (
          <div key={s.k} className="px-4 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">{s.k}</p>
            <p className="tabular mt-1 font-display text-[26px] leading-none text-bone">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="px-4">
        <div className="grid grid-cols-[1.4fr_0.5fr_0.8fr] gap-2 border-b border-ink-line py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
          <span>Capability</span>
          <span className="text-right">Asked</span>
          <span className="text-right">Decision</span>
        </div>
        {EXAMPLE_ROWS.map((row) => (
          <div
            key={row.capability}
            className="grid grid-cols-[1.4fr_0.5fr_0.8fr] items-center gap-2 border-b border-ink-line/60 py-2.5 last:border-b-0"
          >
            <span className="truncate font-mono text-[11px] text-bone">{row.capability}</span>
            <span className="tabular text-right font-mono text-[11px] text-bone-dim">{row.asked}</span>
            <span className="flex justify-end">
              <Badge tone={row.tone}>{row.label}</Badge>
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t border-ink-line px-4 py-3 font-mono text-[10px] text-bone-dim">
        <p>gpt-shopping · verified · 128 asks</p>
        <p>anonymous · unverified · 64 asks</p>
      </div>

      <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[11px] leading-relaxed text-bone-faint">
        Counts, not money — the views cannot return an amount. Your console reads
        your own rows.
      </p>
    </div>
  )
}

/** One request, in full — the context a held decision needs to be reviewed. */
function RequestCard() {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
        <span className="label">Request</span>
        <span className="rounded-full border border-ink-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-bone-faint">
          Illustrative
        </span>
      </div>
      <dl className="divide-y divide-ink-line/70">
        {[
          ['Agent', 'gpt-shopping'],
          ['Capability', 'createOrder'],
          ['Decision', 'held'],
          ['Reason', 'above your ceiling'],
          ['Approval', 'waiting for a human'],
          ['Time', '2 min ago'],
        ].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[0.6fr_1fr] gap-4 px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-bone-faint">{k}</dt>
            <dd className="font-mono text-[12px] text-bone">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[12px] leading-relaxed text-bone-faint">
        Parameters and order values are omitted by the view. The record proves
        the decision without copying the customer&apos;s data.
      </p>
    </div>
  )
}

/** The policy editor as a draft: concrete rules, no currency, no order value. */
function PolicyCard() {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-line px-4 py-3">
        <span className="label">Policy</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber">
          draft — not live
        </span>
      </div>
      <ul className="divide-y divide-ink-line/70">
        {CONTROL_ROWS.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="font-mono text-[12px] text-bone">{row.label}</span>
            <span className="flex items-center gap-2 font-mono text-[11px] text-bone-dim">
              <span
                aria-hidden="true"
                className={
                  row.tone === 'allow'
                    ? 'h-1.5 w-1.5 rounded-full bg-verdant'
                    : row.tone === 'held'
                      ? 'h-1.5 w-1.5 rounded-full bg-amber'
                      : 'h-1.5 w-1.5 rounded-full bg-rust'
                }
              />
              {row.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[12px] leading-relaxed text-bone-faint">
        Until the hosted governor applies the signed artifact, this is a draft.
        Saving an edit never enforces it.
      </p>
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
