import type { Finding, ResearchSource } from '@/lib/intelligence/types'
import { ProvenanceBadge } from './provenance-badge'

export function FindingList({ findings, sources }: { findings: Finding[]; sources: ResearchSource[] }) {
  if (findings.length === 0) {
    return <p className="text-[13px] text-bone-faint">No findings are stated for this section.</p>
  }

  return (
    <ul className="divide-y divide-ink-line/70 border-y border-ink-line/70">
      {findings.map((finding) => {
        const cited = finding.sourceIds.flatMap((id) => {
          const source = sources.find((item) => item.id === id)
          return source ? [source.label] : []
        })
        return (
          <li key={finding.id} className="py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="max-w-[75ch] text-[13px] leading-relaxed text-bone">{finding.claim}</p>
              <ProvenanceBadge provenance={finding.provenance} confidence={finding.confidence} />
            </div>
            {finding.note ? (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-bone-faint">{finding.note}</p>
            ) : null}
            {cited.length > 0 ? (
              <p className="mt-1.5 font-mono text-[10.5px] text-bone-faint">Cites: {cited.join(' · ')}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
