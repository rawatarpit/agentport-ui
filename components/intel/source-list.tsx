import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import type { ResearchSource } from '@/lib/intelligence/types'
import { Chip } from '@/components/ui/chip'

function iso(value: string | null): string {
  if (!value) return 'not recorded'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value
}

function SourceRow({ source }: { source: ResearchSource }) {
  return (
    <li className="border-t border-ink-line/70 px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[13px] leading-snug text-bone">{source.label}</p>
        <Chip tone={source.kind === 'sample' ? 'warn' : 'info'}>
          {source.kind === 'sample' ? 'sample · not a citation' : source.kind}
        </Chip>
      </div>
      <p className="mt-1 font-mono text-[10.5px] text-bone-faint">
        published {source.publishedAt ? iso(source.publishedAt) : 'not recorded'}
        {' · collected '}
        {iso(source.collectedAt)}
        {' · period '}
        {source.dataPeriod ?? 'not recorded'}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-bone-dim">
        Coverage: {source.geography ?? 'geography not recorded'} · {source.industry ?? 'industry not recorded'}
      </p>
      {source.url ? (
        <Link
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link mt-1 inline-block font-mono text-[11px]"
        >
          Open source
        </Link>
      ) : null}
    </li>
  )
}

/** A sample source is shown as a sample. An empty list is shown as empty. */
export function SourceList({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) {
    return (
      <EmptyState
        title="No verified sources"
        body="No external source is attached to this report. Adding a plausible-looking citation would be worse than leaving the gap visible."
      />
    )
  }

  return (
    <ul className="panel overflow-hidden">
      {sources.map((source) => (
        <SourceRow key={source.id} source={source} />
      ))}
    </ul>
  )
}
