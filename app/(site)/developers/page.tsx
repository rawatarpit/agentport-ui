import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Developers',
  description: 'Discovery is advisory, writes are human-confirmed, and the hosted governor is authoritative.',
}

const RULES = [
  {
    title: 'Discovery files are advisory',
    body: 'The installed package writes static discovery files for compatible clients. They contain no policy decision and no credential. A file being present does not prove a capability works.',
  },
  {
    title: 'One compiler, two delivery paths',
    body: 'An install pull request lands the kit once; a manual download uses the same compiler. Later changes go through the dashboard publish channel: approval/apply writes an applied config version that the hosted governor serves, never a second PR.',
  },
  {
    title: 'GET prepares; a human confirms',
    body: 'A state-changing operation is first prepared as a reviewable draft from a GET request. The exact draft is shown to a person. Only after approval does a governed write path send the operation once.',
  },
  {
    title: 'The governor decides',
    body: 'The hosted governor verifies the short-lived scoped credential, evaluates ordered policy, executes the capability and writes the ledger row. The merchant process does not enforce policy.',
  },
  {
    title: 'No parallel trust paths',
    body: 'One session and RLS model, one push ingestion, one publish channel. Browser code never holds a service-role key or a signing secret; server routes hold what must stay server-side.',
  },
]

export default function DevelopersPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[78ch] space-y-3">
        <p className="label">Developers</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Publish what you can do. Let a human confirm what changes.
        </h1>
        <p className="prose-bone">
          The public manifest at <code className="font-mono text-[12px] text-bone">/.well-known/agent.json</code>{' '}
          is an unauthenticated, advisory snapshot. The hosted governor is authoritative: it is the part that
          decides whether a request is allowed, held or refused.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="font-display text-[22px] text-bone">
          The contract
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {RULES.map((rule, index) => (
            <li key={rule.title} className="panel p-5">
              <p className="font-mono text-[10.5px] text-bone-faint">0{index + 1}</p>
              <h3 className="mt-2 font-display text-[17px] leading-snug text-bone">{rule.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{rule.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-muted rounded-xl p-5 sm:p-6" aria-labelledby="write-path-heading">
        <h2 id="write-path-heading" className="font-display text-[19px] text-bone">
          The write path in three moves
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          <li className="border-t border-ink-line pt-3">
            <p className="font-mono text-[10.5px] text-verdant">01 · GET</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-bone-dim">
              The agent asks for a draft: items, timing, customer detail, consequences.
            </p>
          </li>
          <li className="border-t border-ink-line pt-3">
            <p className="font-mono text-[10.5px] text-verdant">02 · CONFIRM</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-bone-dim">
              A person sees the exact operation and approves it. Nothing has changed yet.
            </p>
          </li>
          <li className="border-t border-ink-line pt-3">
            <p className="font-mono text-[10.5px] text-verdant">03 · WRITE</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-bone-dim">
              The confirmed operation goes once through the governed path, then the outcome is recorded.
            </p>
          </li>
        </ol>
        <p className="mt-5 font-mono text-[11px] leading-relaxed text-bone-faint">
          A discovery file never implies a write is available. A draft is never a completed action.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-6">
        <Link href="/security" className="btn btn-primary px-4 py-2">
          Read the security model
        </Link>
        <Link href="/how-it-works" className="btn px-4 py-2">
          See the twelve steps
        </Link>
      </section>
    </div>
  )
}
