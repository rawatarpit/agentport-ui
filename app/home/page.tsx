import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata = {
  title: 'AgentPort — governed agent access for your business',
  description:
    'External AI agents can already find your business. AgentPort decides what they may do — before anything runs, with every decision recorded.',
}

/**
 * The public front door (agent.relayforge.in/home): brand messaging, the
 * audience, how it works, and the way in. No fixtures, no invented numbers,
 * no fake testimonials — a page that promises a control the product does not
 * contain is worse than no page, so every claim here names something the
 * dashboard actually does.
 */
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-16 px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-verdant/40 bg-verdant/10 font-display text-base text-verdant">
            A
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone-dim">
            Agent Port
          </span>
        </span>
        <div className="w-28">
          <ThemeToggle />
        </div>
      </div>
      <section className="flex flex-col items-start gap-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-verdant/40 bg-verdant/10 font-display text-2xl text-verdant">
          A
        </span>
        <div className="max-w-[62ch]">
          <p className="label">Agent Port</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-bone sm:text-5xl">
            AI agents can already find your business. Decide what they may do.
          </h1>
          <p className="prose-bone mt-4 max-w-[60ch]">
            Discovery happens on someone else&apos;s surface. The order, the
            refund, the booking change — those happen on yours. AgentPort is the
            governed interface between the two: what agents may try, what waits
            for a human, what is always refused, and a record of all of it.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/signup" className="btn btn-primary px-5 py-2.5">Start governing</Link>
            <Link href="/login" className="btn px-5 py-2.5">Sign in</Link>
          </div>
        </div>
      </section>

      <section>
        <p className="label">Who it is for</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Audience title="Local shops" body="A customer asks a bot to buy. Below your line it runs; above it, you approve; refunds never go through an agent." />
          <Audience title="D2C brands" body="Discovery on marketplaces and search, checkout on your store — held to the same policy on every surface." />
          <Audience title="Travel & bookings" body="Itineraries change, prices move, cancellations sting. Holds for a human on anything that costs money." />
          <Audience title="SaaS & platforms" body="Your customers' agents calling your API get scoped credentials, ceilings, and an audit trail per customer." />
        </div>
      </section>

      <section>
        <p className="label">How it works</p>
        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          <Step n="1" title="Connect GitHub" body="Install the App on your website repo. We open a pull request that adds the governed runtime — your team reviews it, you merge. The merge is your signature." />
          <Step n="2" title="Say what agents may do" body="Four questions in plain language become typed policy: what they see, what waits for you, what is always no. Drafts until you publish." />
          <Step n="3" title="Watch it work" body="Every call lands on your ledger — allowed, held, refused with the reason. Analytics counts what happened, never amounts, never rows." />
        </ol>
      </section>

      <section className="panel p-6 sm:p-8">
        <p className="label">The rules that never bend</p>
        <ul className="mt-4 grid gap-3 text-[14px] leading-relaxed text-bone-dim sm:grid-cols-3">
          <li><span className="font-mono text-bone">Draft is never live.</span><br />Nothing you type is in force until it is merged and your runtime enforces it.</li>
          <li><span className="font-mono text-bone">Held is never executed.</span><br />Approvals queue for a human; granting happens where the request froze, never in a browser.</li>
          <li><span className="font-mono text-bone">Unknown is never healthy.</span><br />No heartbeat, no claim. A silent runtime renders as unknown, not green.</li>
        </ul>
        <div className="mt-6">
          <Link href="/signup" className="btn btn-primary px-5 py-2.5">Create your account</Link>
        </div>
      </section>
    </div>
  )
}

function Audience({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-5">
      <p className="font-display text-lg text-bone">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="panel p-5">
      <p className="font-mono text-[11px] text-verdant">Step {n}</p>
      <p className="mt-2 font-display text-xl text-bone">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{body}</p>
    </li>
  )
}
