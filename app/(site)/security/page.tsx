import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Security',
  description: 'Trust boundaries, data custody and least privilege in product language.',
}

const BOUNDARIES = [
  {
    title: 'What the console is',
    body: 'A reader and an authoring surface. It shows tenant state, drafts, ledger rows and approvals. It does not enforce policy, execute capabilities or decide approvals.',
  },
  {
    title: 'What the governor is',
    body: 'The hosted governor checks the short-lived scoped credential, evaluates ordered policy, executes the connected capability and writes the ledger row. A browser session never stands in for that decision.',
  },
  {
    title: 'Row-level isolation',
    body: 'Data access goes through RLS-scoped views and tenant membership checks. Page redirects are a convenience for honest users; the database constraint is the control.',
  },
  {
    title: 'Secrets stay server-side',
    body: 'The build fails if a secret-shaped NEXT_PUBLIC_ variable appears. Server routes hold what must stay server-side; browser code holds none. The merchant never hands us a database credential.',
  },
  {
    title: 'GitHub is least-privilege',
    body: 'Selected repositories, minimum scopes, webhook signatures verified before reading, installer identity matched to the tenant. The user token is dropped, not stored. Revocation takes effect immediately and silently.',
  },
  {
    title: 'Writes need a person',
    body: 'A state-changing action is prepared as a reviewable draft and approved by a human before the governed write runs. The approval queue in the console is visible context, not a browser decision button.',
  },
  {
    title: 'The ledger has a privacy projection',
    body: 'The console reads a durable view that omits parameters, detail, evaluated figures and error text. There are no order amounts here, and an empty result is an honest empty state.',
  },
  {
    title: 'Unknown is not healthy',
    body: 'Before the first real push, status is unknown. The console never invents a demo heartbeat or turns a missing signal into a reassuring zero.',
  },
] as const

export default function SecurityPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[78ch] space-y-3">
        <p className="label">Security</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Boundaries you can state out loud.
        </h1>
        <p className="prose-bone">
          AgentPort governs only the operations you connect. The installed package makes no decisions, the
          static manifest is advisory, and the hosted governor is the only thing that decides. This page
          describes where data goes and where it does not.
        </p>
      </header>

      <section aria-labelledby="boundaries-heading" className="space-y-4">
        <h2 id="boundaries-heading" className="font-display text-[22px] text-bone">
          Trust boundaries
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {BOUNDARIES.map((item, index) => (
            <li key={item.title} className="panel p-5">
              <p className="font-mono text-[10.5px] text-bone-faint">0{index + 1}</p>
              <h3 className="mt-2 font-display text-[17px] leading-snug text-bone">{item.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-muted rounded-xl p-5 sm:p-6" aria-labelledby="custody-heading">
        <h2 id="custody-heading" className="font-display text-[19px] text-bone">
          Custody, in plain terms
        </h2>
        <div className="mt-4 grid gap-4 text-[13px] leading-relaxed text-bone-dim sm:grid-cols-2">
          <div className="border-t border-ink-line pt-3">
            <p className="font-mono text-[11px] text-bone">Shared tier</p>
            <p className="mt-1.5">
              Connected requests pass through the hosted worker by design. It is the governed hop: it records
              the decision and pushes analytics events. A phone number given to a chatbot in your flow is
              already your data on your API path.
            </p>
          </div>
          <div className="border-t border-ink-line pt-3">
            <p className="font-mono text-[11px] text-bone">Enterprise tier</p>
            <p className="mt-1.5">
              Nothing transits us. What we receive is aggregates only. Widening what exists beyond that ladder
              needs a custody review, not a UI change.
            </p>
          </div>
        </div>
        <p className="mt-5 border-t border-ink-line pt-4 font-mono text-[11px] leading-relaxed text-bone-faint">
          Never persisted in either tier: CVV, passwords, API keys, raw credentials. The proof tier sells
          longer proof — retention, exports, alerting — not more columns or more readers.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-6">
        <Link href="/developers" className="btn px-4 py-2">
          Developer model
        </Link>
        <Link href="/intelligence" className="btn btn-primary px-4 py-2">
          Explore industry intelligence
        </Link>
      </section>
    </div>
  )
}
