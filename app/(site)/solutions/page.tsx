import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Solutions',
  description: 'What the console offers visitors, operators and developers — and what it deliberately does not.',
}

const AUDIENCES = [
  {
    label: 'For visitors',
    title: 'Understand the question first.',
    body: 'Start with an industry preview that shows unknowns as unknowns, then check website readiness once you have an account. Neither tells you that agents can already transact with your business.',
    links: [
      { href: '/intelligence', label: 'Industry intelligence' },
      { href: '/signup', label: 'Check Website Readiness — after signup' },
    ],
  },
  {
    label: 'For operators',
    title: 'Author policy without pretending it is live.',
    body: 'Capabilities and rules are drafts in the console. A hosted governor decides at request time, and the ledger you read here appears only after a real push. Unknown status stays unknown.',
    links: [
      { href: '/how-it-works', label: 'The twelve steps' },
      { href: '/security', label: 'Trust boundaries' },
      { href: '/signup', label: 'Create an account' },
    ],
  },
  {
    label: 'For developers',
    title: 'Make the business legible, then confirm writes.',
    body: 'Discovery files describe capabilities and are advisory. Reads can be prepared directly; state-changing operations are prepared with GET and confirmed by a human before a governed write is sent.',
    links: [
      { href: '/developers', label: 'Developer model' },
      { href: '/security', label: 'Security model' },
    ],
  },
] as const

export default function SolutionsPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[75ch] space-y-3">
        <p className="label">Solutions</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Three ways in, one boundary.
        </h1>
        <p className="prose-bone">
          AgentPort governs only the operations connected to it. Ordinary traffic and unconnected APIs stay
          outside the boundary. These pages describe what is available now and what still requires a
          connection.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {AUDIENCES.map((audience) => (
          <section key={audience.label} className="panel flex h-full flex-col p-5 sm:p-6">
            <p className="label">{audience.label}</p>
            <h2 className="mt-3 font-display text-[21px] leading-tight text-bone">{audience.title}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">{audience.body}</p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-6 font-mono text-[11.5px]">
              {audience.links.map((link) => (
                <Link key={link.href} href={link.href} className="link">
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="panel-muted rounded-xl p-5 sm:p-6">
        <h2 className="font-display text-[19px] text-bone">What is deliberately absent</h2>
        <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-bone-dim sm:grid-cols-2">
          <li>No market figure without provenance.</li>
          <li>No browser button that decides an approval.</li>
          <li>No claim that a discovery file makes a business agent-ready.</li>
          <li>No order values, credentials or secrets in the console projection.</li>
        </ul>
        <Link href="/home" className="link mt-5 inline-block font-mono text-[11.5px]">
          Back to the front door
        </Link>
      </section>
    </div>
  )
}
