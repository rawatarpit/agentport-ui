import type { Metadata } from 'next'
import Link from 'next/link'
import { IntelForm } from '@/components/intel/intel-form'
import { FiveLensCoverage } from '@/components/intel/five-lens-coverage'
import { profileFromParams } from '@/lib/intelligence/types'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: 'Industry intelligence — five lenses for an AI-era industry question',
  description:
    'Frame an industry question across five evidence lenses. Gaps render unknown, and no AI traffic or search visibility measurement is claimed.',
  alternates: { canonical: '/intelligence' },
  openGraph: {
    title: 'Industry intelligence — five lenses for an AI-era industry question',
    description:
      'Frame an industry question across five evidence lenses. Gaps render unknown, and no AI traffic or search visibility measurement is claimed.',
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/intelligence',
  },
  twitter: {
    card: 'summary',
    title: 'Industry intelligence — five lenses for an AI-era industry question',
    description:
      'Frame an industry question across five evidence lenses. Gaps render unknown, and no AI traffic or search visibility measurement is claimed.',
  },
}

const ACQUISITION_CATEGORIES = [
  'ecommerce/retail',
  'manufacturing',
  'SaaS/technology',
  'financial services',
  'travel/hospitality',
  'logistics/supply chain',
  'healthcare',
  'B2B wholesale/distribution',
] as const

const REPORT_CATEGORIES = [
  'AI ecosystem',
  'Consumer behaviour',
  'Market signals',
  'Geographic intelligence',
  'Business implications',
] as const

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default function IntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const v = first(value)
    if (typeof v === 'string') params.set(key, v)
  }
  const initialProfile = profileFromParams(params)

  return (
    <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-16 space-y-12">
      <header className="max-w-[82ch] space-y-4">
        <p className="label">Industry intelligence</p>
        <h1 className="text-balance font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.025em] text-bone">
          Understand how AI is changing your industry.
        </h1>
        <p className="prose-bone text-[15px]">
          Scope the question across five evidence lenses before you connect anything. Every lens shows its
          source, date, geography, definition and limitations. Where nothing is connected, it says unknown —
          never zero, never a healthy-looking estimate.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="#preview-form" className="btn btn-primary px-5 py-2.5">
            Start your preview
          </Link>
          <Link href="/intelligence/report?sample=1" className="btn px-5 py-2.5">
            Explore fictional sample
          </Link>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
          No AI traffic or search visibility measurement exists in this preview. Opening it enables, approves or
          executes nothing.
        </p>
      </header>

      <section
        aria-labelledby="industry-categories-heading"
        className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24 space-y-4"
      >
        <div>
          <p className="label">Start with your category</p>
          <h2 id="industry-categories-heading" className="mt-2 font-display text-[22px] leading-tight text-bone">
            Eight ways in, no conclusions attached
          </h2>
          <p className="prose-bone mt-2 max-w-[80ch]">
            These are example categories for the question below, not selectable answers. They are navigation and query aids only, with no market figures, adoption rates, forecasts or claims about any company. Type your own in the form.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ACQUISITION_CATEGORIES.map((category) => (
            <li key={category} className="rounded-lg border border-ink-line bg-ink-soft/30 px-3 py-2.5">
              <span className="font-mono text-[11.5px] text-bone-dim">{category}</span>
            </li>
          ))}
        </ul>
      </section>

      <div id="preview-form" className="scroll-mt-24 mx-auto max-w-3xl">
        <IntelForm key={params.toString()} initialProfile={initialProfile} />
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-bone-faint">
          AI traffic and search visibility are not measured by this preview. It does not inspect your website,
          observe shoppers, or produce a market estimate. Public evidence is used only when a dated source
          exists; an empty result stays unknown.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px]">
          <Link href="/intelligence/report?sample=1" className="link">
            Honest fictional sample
          </Link>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-bone-faint">
          {REPORT_CATEGORIES.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
      </div>

      <section className="scroll-mt-24 border-t border-ink-line/60 py-16 sm:py-24">
        <FiveLensCoverage />
      </section>
    </div>
  )
}
