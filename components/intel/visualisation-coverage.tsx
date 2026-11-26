import type { ResearchReport } from '@/lib/intelligence/types'
import { visualisationCoverage, type VisualisationStatus } from '@/lib/intelligence/visualisation-coverage'

const TONE: Record<VisualisationStatus, string> = {
  unknown: 'border-ink-line bg-ink-soft/30 text-bone-dim',
  sourced: 'border-ink-line bg-ink-soft/30 text-bone',
  illustrative: 'border-amber/40 bg-amber/10 text-amber',
}

/** Presentational coverage ledger for requested intelligence visualisations. */
export function VisualisationCoverage({ report }: { report: ResearchReport }) {
  const slots = visualisationCoverage(report)

  return (
    <section aria-labelledby="visualisation-coverage-heading" className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="label">Evidence coverage</p>
          <h2 id="visualisation-coverage-heading" className="mt-2 font-display text-[20px] text-bone">
            What the requested charts can and cannot show
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
          {slots.length} requested views
        </span>
      </div>
      <p className="prose-bone mt-3 max-w-[80ch]">
        A chart appears only when a dated, sourced series exists. Until then, each view stays unknown; no
        percentage, company count or market figure is inferred from your answers.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {slots.map((slot) => (
          <li key={slot.id} className="rounded-lg border border-ink-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-[15px] text-bone">{slot.title}</h3>
              <span className={`rounded border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${TONE[slot.status]}`}>
                {slot.status}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{slot.detail}</p>
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-bone-faint">
              Required evidence: {slot.evidenceRequired}
            </p>
            {slot.sourceLabel ? (
              <p className="mt-2 font-mono text-[10.5px] text-bone-faint">Source: {slot.sourceLabel}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
