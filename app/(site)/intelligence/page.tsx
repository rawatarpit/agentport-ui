import type { Metadata } from 'next'
import Link from 'next/link'
import { IntelForm } from '@/components/intel/intel-form'
import { FiveLensCoverage } from '@/components/intel/five-lens-coverage'
import { profileFromParams } from '@/lib/intelligence/types'

const TITLE = 'Industry intelligence — five lenses for an AI-era industry question'
const DESCRIPTION =
  'Frame an industry question across five evidence lenses. Gaps render unknown, and no AI traffic or search visibility measurement is claimed.'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/intelligence' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'AgentPort',
    url: 'https://agentport.relayforge.in/intelligence',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
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
  {
    label: 'AI ecosystem',
    body: 'Named assistants, platforms, protocols and service providers, with crawler activity kept separate from agent interactions.',
  },
  {
    label: 'Consumer behaviour',
    body: 'Assistant usage and discovery behaviour with a stated denominator, never inferred from a submitted profile.',
  },
  {
    label: 'Market signals',
    body: 'Dated demand, competitive and referral observations, including AI-referred traffic with its definition shown.',
  },
  {
    label: 'Geographic intelligence',
    body: 'The geography a source actually queried, not the market a visitor hoped to cover.',
  },
  {
    label: 'Business implications',
    body: 'Read and write effects, opportunities and transactions, with interpretation labelled as interpretation.',
  },
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
    <div className="space-y-12">
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
          <Link href="/pilot" className="btn btn-primary px-5 py-2.5">
            Request a pilot
          </Link>
          <Link href="/intelligence/report?sample=1" className="btn px-5 py-2.5">
            Explore fictional sample
          </Link>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
          No AI traffic or search visibility measurement exists in this preview. A request is not a pilot
          invitation, and nothing here is enabled, approved or executed.
        </p>
      </header>

      <section aria-labelledby="industry-categories-heading" className="space-y-4">
        <div>
          <p className="label">Start with your category</p>
          <h2 id="industry-categories-heading" className="mt-2 font-display text-[22px] leading-tight text-bone">
            Eight ways in, no conclusions attached
          </h2>
          <p className="prose-bone mt-2 max-w-[80ch]">
            These categories are navigation and query aids only. They carry no market figures, adoption rates,
            forecasts or claims about any company. Choose one to prefill the question, or type your own.
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

      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <IntelForm key={params.toString()} initialProfile={initialProfile} />

        <aside className="space-y-5">
          <section className="panel p-5 sm:p-6" aria-labelledby="report-categories-heading">
            <p className="label">The five report categories</p>
            <h2 id="report-categories-heading" className="mt-2 font-display text-[21px] leading-tight text-bone">
              One vocabulary for every preview
            </h2>
            <ol className="mt-4 space-y-3">
              {REPORT_CATEGORIES.map((category, index) => (
                <li key={category.label} className="border-t border-ink-line pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">
                    0{index + 1} · {category.label}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-bone-dim">{category.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel-muted rounded-xl p-5 sm:p-6" aria-labelledby="measurement-boundary-heading">
            <h2 id="measurement-boundary-heading" className="font-display text-[19px] text-bone">
              What this does not measure
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
              AgentPort does not measure AI traffic or search visibility. This preview does not inspect your
              website, observe shoppers, or produce a market estimate. Public evidence is used only when a
              dated source is available; an empty result stays an honest empty state.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px]">
              <Link href="/intelligence/report?sample=1" className="link">
                Honest fictional sample
              </Link>
              <Link href="/pilot" className="link">
                Request a pilot
              </Link>
            </div>
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-bone-faint">
              Your answers stay in the report URL. Nothing is saved by this preview; the next step to an
              account carries them forward as query parameters.
            </p>
          </section>
        </aside>
      </div>

      <FiveLensCoverage />
    </div>
  )
}
