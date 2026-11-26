import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from '@/components/contact-form'
import { SectionViewTracker } from '@/components/landing/section-view-tracker'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: 'Founding pilot — ₹0 selected participants',
  description: 'The documented ₹0 founding-pilot terms: one environment, assisted setup, agreed capabilities and records you can review.',
  alternates: { canonical: '/pilot' },
  openGraph: {
    title: 'Founding pilot — ₹0 selected participants',
    description: 'The documented ₹0 founding-pilot terms: one environment, assisted setup, agreed capabilities and records you can review.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/pilot',
  },
  twitter: {
    card: 'summary',
    title: 'Founding pilot — ₹0 selected participants',
    description: 'The documented ₹0 founding-pilot terms: one environment, assisted setup, agreed capabilities and records you can review.',
  },
}

const TERMS = [
  {
    title: 'Selected participants',
    body: 'The founding pilot is ₹0 for selected participants. A request is not acceptance, and scope and eligibility are agreed before onboarding.',
  },
  {
    title: 'One environment',
    body: 'The pilot covers one environment. Assisted setup lands the discovery package through a supported integration.',
  },
  {
    title: 'Limited capabilities',
    body: 'Only the capabilities agreed in scope are configured. Initial policy configuration is agreed with you; drafts are not live until an applied config version is served by the hosted governor.',
  },
  {
    title: 'Allow, hold, refuse',
    body: 'We demonstrate the decision vocabulary: allow, hold and refuse. A held request has not run; a decision is not proof that the downstream call succeeded.',
  },
  {
    title: 'Records you can review',
    body: 'You can review activity and audit records in the console once real pushes exist. With no push, the answer is unknown, not a healthy zero.',
  },
  {
    title: 'Exit anytime',
    body: 'You can exit at any time by removing the discovery package, revoking the GitHub installation and rotating any credential you issued. Your hosting, database and third-party costs remain your responsibility.',
  },
] as const

export default function PilotPage() {
  return (
    <div className="space-y-10">
      <section id="pilot" className="space-y-8" aria-labelledby="pilot-heading">
        <SectionViewTracker event="pilot_section_viewed" targetId="pilot" />
        <header className="max-w-[75ch] space-y-3">
          <p className="label">Founding pilot</p>
          <h1 id="pilot-heading" className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
            Request a pilot, with the terms stated plainly.
          </h1>
          <p className="prose-bone">
            The founding pilot is ₹0 and limited to selected participants. Below is the full scope: what is
            included, what stays your responsibility, and how the request ends. No capability is governed
            before the supported integration, approval and hosted config are in place.
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="panel p-5 sm:p-6">
              <p className="label">Before you ask</p>
              <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
                Tell us what your product does and which operations an agent might perform. Please do not
                include card numbers, passwords or API keys in the message.
              </p>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
              Submitting the form records a request. It does not start onboarding, grant access or approve a
              capability.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="pilot-terms-heading">
        <h2 id="pilot-terms-heading" className="font-display text-[22px] text-bone">
          What the ₹0 founding pilot includes
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {TERMS.map((term, index) => (
            <li key={term.title} className="panel p-5">
              <p className="font-mono text-[10.5px] text-bone-faint">0{index + 1}</p>
              <h3 className="mt-2 font-display text-[17px] leading-snug text-bone">{term.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{term.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-muted rounded-xl p-5 sm:p-6" aria-labelledby="pilot-next-heading">
        <h2 id="pilot-next-heading" className="font-display text-[19px] text-bone">
          After a request
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
          Scope and eligibility are agreed before onboarding. Assisted setup then lands the discovery package
          and configures the initial policy. Nothing becomes live until approval applies a config version that
          the hosted governor serves.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/platform" className="btn btn-primary px-4 py-2">
            See the request path
          </Link>
          <Link href="/signup" className="btn px-4 py-2">
            Get started
          </Link>
        </div>
      </section>
    </div>
  )
}
