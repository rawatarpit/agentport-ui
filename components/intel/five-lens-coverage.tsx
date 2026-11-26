'use client'

import { useEffect } from 'react'
import { trackReportViewed } from '@/lib/funnel-events'
import {
  fiveLensCoverage,
  FIVE_LENS_LABELS,
  type FiveLensCoverageSlot,
} from '@/lib/intelligence/five-lens-coverage'
import type { ResearchReport } from '@/lib/intelligence/types'

export function ReportViewTracker() {
  useEffect(() => {
    trackReportViewed()
  }, [])
  return null
}

function EvidenceRow({ term, value }: { term: string; value: string | null }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">{term}</dt>
      <dd className="mt-0.5 break-words text-[12px] leading-relaxed text-bone-dim">{value ?? 'unknown'}</dd>
    </div>
  )
}

function LensCard({ slot, index }: { slot: FiveLensCoverageSlot; index: number }) {
  return (
    <li className="panel flex h-full flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[16px] leading-snug text-bone">
          <span className="font-mono text-[10px] text-bone-faint">
            {String(index + 1).padStart(2, '0')} ·{' '}
          </span>
          {slot.label}
        </h3>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${
            slot.status === 'sourced'
              ? 'border-verdant/40 bg-verdant/10 text-verdant'
              : 'border-ink-line bg-ink-soft/30 text-bone-dim'
          }`}
        >
          {slot.status === 'sourced' ? 'source-backed' : 'unknown'}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-bone-dim">{slot.definition}</p>
      <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
        <EvidenceRow term="Source" value={slot.sourceLabel} />
        <EvidenceRow term="Publication / reporting date" value={slot.reportedAt} />
        <EvidenceRow term="Geography" value={slot.geography} />
        <EvidenceRow term="Limitations" value={slot.limitations} />
      </dl>
      {slot.sourceUrl ? (
        <p className="mt-3 break-words font-mono text-[10px] leading-relaxed text-bone-faint">
          Source reference: {slot.sourceUrl}
        </p>
      ) : null}
    </li>
  )
}

/**
 * A read-only coverage ledger. The five labels are the whole vocabulary; an
 * absent row renders unknown, never zero, illustrative, or a market claim.
 */
export function FiveLensCoverage({ report }: { report?: ResearchReport | null }) {
  const slots = fiveLensCoverage(report ?? [])
  const unknownCount = slots.filter((slot) => slot.status === 'unknown').length

  return (
    <section aria-labelledby="five-lens-heading" className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="label">Five lenses</p>
          <h2 id="five-lens-heading" className="mt-2 font-display text-[22px] leading-tight text-bone">
            What a report would need to show
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
          {unknownCount} of {FIVE_LENS_LABELS.length} unknown
        </span>
      </div>
      <p className="prose-bone mt-3 max-w-[85ch]">
        A lens is covered only by a dated, source-backed row with a resolvable source and a real value.
        Everything else stays unknown. Profile answers, interpretations and fictional samples cannot fill a
        lens.
      </p>
      <ol className="mt-5 grid gap-4 lg:grid-cols-2">
        {slots.map((slot, index) => (
          <LensCard key={slot.id} slot={slot} index={index} />
        ))}
      </ol>
      <div className="mt-6 rounded-lg border border-ink-line p-4 sm:p-5">
        <h3 className="font-display text-[17px] text-bone">Evidence methodology</h3>
        <p className="mt-2 max-w-[85ch] text-[12.5px] leading-relaxed text-bone-dim">
          Every lens states its source, publication or reporting date, queried geography, definition and
          limitations. Crawler activity, assistant usage, AI-referred traffic, autonomous agent interactions
          and transactions are separate evidence types; none is converted into another. No AI traffic or
          search visibility measurement is claimed here.
        </p>
        <ul className="mt-3 grid gap-2 text-[12px] leading-relaxed text-bone-dim sm:grid-cols-2">
          <li>
            <span className="font-mono text-[10.5px] text-bone">Source</span> — a resolvable, non-sample
            record; never a plausible-looking citation.
          </li>
          <li>
            <span className="font-mono text-[10.5px] text-bone">Publication / reporting date</span> — the
            source date or reporting period actually supplied.
          </li>
          <li>
            <span className="font-mono text-[10.5px] text-bone">Geography</span> — the geography queried by
            that source, not the visitor&apos;s declared market.
          </li>
          <li>
            <span className="font-mono text-[10.5px] text-bone">Definition</span> — what the row measures,
            with denominator and category boundaries stated.
          </li>
          <li>
            <span className="font-mono text-[10.5px] text-bone">Limitations</span> — what the row cannot
            prove, including gaps and non-comparable activity types.
          </li>
        </ul>
      </div>
    </section>
  )
}
