import type { Metadata } from 'next'
import Link from 'next/link'
import { IntelForm } from '@/components/intel/intel-form'
import { Callout } from '@/components/ui/callout'

export const metadata: Metadata = {
  title: 'Industry intelligence',
  description:
    'Frame an industry question and see what a sourced report would contain — with gaps shown honestly.',
}

export default function IntelligencePage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[75ch] space-y-3">
        <p className="label">Industry intelligence</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Ask a better question before you connect an agent.
        </h1>
        <p className="prose-bone">
          Describe your industry and objective. The preview shows the report structure, the evidence labels,
          and the opportunity questions worth discussing. No market dataset is connected, so every market
          figure stays unknown — nothing is filled in to make the page look complete.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <IntelForm />

        <aside className="space-y-5">
          <Callout tone="warning" title="What this preview is not">
            <p>
              It is not market research, a forecast, or an assessment of your website. Filled-in fields can
              scope a discussion and rank hypotheses; they cannot manufacture evidence of demand.
            </p>
          </Callout>

          <div className="panel p-5 sm:p-6">
            <p className="label">Preview without answering</p>
            <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
              Want to see the layout first? Open a clearly flagged fictional example. Every number in it is
              invented for interface review, and the page says so at the top.
            </p>
            <Link href="/intelligence/report?sample=1" className="btn mt-5 px-4 py-2">
              Explore fictional sample
            </Link>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            Your answers stay in the report URL. Nothing is saved by this preview; the next step to an
            account carries them forward as query parameters.
          </p>
        </aside>
      </div>
    </div>
  )
}
