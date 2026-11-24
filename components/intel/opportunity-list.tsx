import { Chip } from '@/components/ui/chip'
import type { AgentOpportunity, ResearchReport } from '@/lib/intelligence/types'
import { ProvenanceBadge } from './provenance-badge'

function Detail({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <p className="mt-2 text-[11.5px] leading-relaxed text-bone-faint">
      <span className="font-mono uppercase tracking-[0.08em]">{label}: </span>
      {values.join(', ')}
    </p>
  )
}

export function OpportunityList({
  opportunities,
  method,
}: {
  opportunities: AgentOpportunity[]
  method: ResearchReport['rankingMethod']
}) {
  const weights = Object.entries(method.weights)
    .map(([factor, weight]) => `${factor} ${weight}`)
    .join(' · ')

  return (
    <div className="space-y-4">
      <p className="max-w-[80ch] text-[12px] leading-relaxed text-bone-dim">
        {method.scale} {method.caveat}
      </p>
      <p className="font-mono text-[10.5px] text-bone-faint">Weights: {weights}</p>

      {opportunities.length === 0 ? (
        <p className="text-[13px] text-bone-faint">No candidate opportunities were produced.</p>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id} className="panel flex h-full flex-col p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-[10.5px] text-bone-faint">#{opportunity.rank}</p>
                <ProvenanceBadge provenance={opportunity.provenance} confidence={opportunity.confidence} />
              </div>
              <h3 className="mt-2 font-display text-[16px] leading-snug text-bone">{opportunity.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{opportunity.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="info">{opportunity.score.toFixed(2)} / 5</Chip>
                <Chip tone="neutral">{opportunity.complexity} complexity</Chip>
                <Chip tone={opportunity.humanConfirmation === 'required' ? 'warn' : 'neutral'}>
                  {opportunity.humanConfirmation} confirmation
                </Chip>
                {opportunity.access.map((mode) => (
                  <Chip key={mode} tone="neutral">
                    {mode}
                  </Chip>
                ))}
              </div>

              <Detail label="Business value" values={[opportunity.businessValue]} />
              <Detail label="Customer value" values={[opportunity.customerValue]} />
              <Detail label="Needs" values={opportunity.requiredInformation} />
              <Detail label="APIs" values={opportunity.requiredApis} />
              <p className="mt-3 text-[11.5px] leading-relaxed text-bone-faint">{opportunity.evidence}</p>
              <p className="mt-3 border-t border-ink-line/70 pt-3 text-[11.5px] leading-relaxed text-bone-dim">
                {opportunity.recommendedAction}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
