import { fiveLensCoverage } from '@/lib/intelligence/five-lens-coverage'
import type { ResearchReport } from '@/lib/intelligence/types'
import { visualisationCoverage } from '@/lib/intelligence/visualisation-coverage'

/**
 * Request-time evidence coverage. Every number is derived from the report
 * already on the page: no second fetch, no stored conversion metric, and no
 * fictional sample counted as evidence.
 */
export function RequestCoverage({ report }: { report: ResearchReport }) {
  const sources = report.sources.filter((source) => source.kind !== 'sample')
  const lenses = fiveLensCoverage(report)
  const sourcedLenses = lenses.filter((lens) => lens.status === 'sourced').length
  const views = visualisationCoverage(report)
  const sourcedViews = views.filter((view) => view.status === 'sourced').length

  const rows = [
    { term: 'Public sources', value: sources.length === 0 ? 'none' : String(sources.length) },
    { term: 'Source-backed lenses', value: `${sourcedLenses} of ${lenses.length}` },
    { term: 'Dated series', value: `${sourcedViews} of ${views.length}` },
    { term: 'Report state', value: report.dataMode === 'illustrative' ? 'fictional sample' : report.dataMode },
  ]

  return (
    <section aria-labelledby="request-coverage-heading" className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="label">Arrival analytics</p>
          <h2 id="request-coverage-heading" className="mt-2 font-display text-[20px] leading-tight text-bone">
            What this request actually returned
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
          computed at request time
        </span>
      </div>
      <p className="prose-bone mt-3 max-w-[85ch]">
        Counts come from the rows rendered below. Unknown means no usable dated row was returned; it is not a
        healthy zero. Reopening re-reads the public sources; a saved snapshot keeps its own sources.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.term} className="rounded-lg border border-ink-line p-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">{row.term}</dt>
            <dd className="mt-2 font-display text-[21px] text-bone">{row.value}</dd>
          </div>
        ))}
      </dl>
      {sources.length === 0 ? (
        <p className="mt-4 rounded-md border border-ink-line bg-ink/40 px-4 py-3 text-[12px] leading-relaxed text-bone-dim">
          Unknown source coverage. No AI traffic or search visibility measurement is substituted for a missing
          public row.
        </p>
      ) : null}
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-bone-faint">
        Computed from this request. No AI traffic or search visibility measurement. This is not an installation,
        an approval, or a live capability claim.
      </p>
    </section>
  )
}
