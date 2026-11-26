import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: 'Solutions — buyers, workflows and boundaries',
  description: 'Buyer segments and one concrete workflow each, with the supported-integration boundary stated on every workflow.',
  alternates: { canonical: '/solutions' },
  openGraph: {
    title: 'Solutions — buyers, workflows and boundaries',
    description: 'Buyer segments and one concrete workflow each, with the supported-integration boundary stated on every workflow.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/solutions',
  },
  twitter: {
    card: 'summary',
    title: 'Solutions — buyers, workflows and boundaries',
    description: 'Buyer segments and one concrete workflow each, with the supported-integration boundary stated on every workflow.',
  },
}

const SEGMENTS = [
  {
    label: 'B2B suppliers / distributors',
    title: 'Quote requests with boundaries.',
    workflow: 'An agent checks published stock and lead times, then prepares a quote request for a person to review.',
    boundary: 'This workflow requires a supported integration to be governed.',
    links: [
      { href: '/platform', label: 'The request path' },
      { href: '/pilot', label: 'Request a pilot' },
    ],
  },
  {
    label: 'Transactional ecommerce / D2C',
    title: 'Returns without silent writes.',
    workflow: 'An agent reads an order status and prepares a return request; the write runs only after human confirmation through the governed path.',
    boundary: 'This workflow requires a supported integration to be governed.',
    links: [
      { href: '/how-it-works', label: 'The twelve steps' },
      { href: '/pilot', label: 'Request a pilot' },
    ],
  },
  {
    label: 'SaaS / structured workflow',
    title: 'Ticket updates that stay reviewable.',
    workflow: 'An agent reads a project state and prepares a ticket update with the exact change shown before confirmation.',
    boundary: 'This workflow requires a supported integration to be governed.',
    links: [
      { href: '/developers', label: 'Developer model' },
      { href: '/pilot', label: 'Request a pilot' },
    ],
  },
] as const

export default function SolutionsPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[75ch] space-y-3">
        <p className="label">Solutions</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Three buyers, one boundary.
        </h1>
        <p className="prose-bone">
          AgentPort — The infrastructure for businesses in the AI agent economy. Intelligence, Access and
          Control show up as a question, a supported connection and a hosted decision. These are buyer
          segments, not a claim that ordinary traffic or unconnected APIs are governed.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/pilot" className="btn btn-primary px-4 py-2">
            Request a pilot
          </Link>
          <Link href="/signup" className="btn px-4 py-2">
            Get started
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {SEGMENTS.map((segment) => (
          <section key={segment.label} className="panel flex h-full flex-col p-5 sm:p-6">
            <p className="label">{segment.label}</p>
            <h2 className="mt-3 font-display text-[21px] leading-tight text-bone">{segment.title}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">{segment.workflow}</p>
            <p className="mt-4 border-t border-ink-line pt-3 font-mono text-[11px] leading-relaxed text-amber">
              {segment.boundary}
            </p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-6 font-mono text-[11.5px]">
              {segment.links.map((link) => (
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
