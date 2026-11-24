import { KpiCard } from '@/components/ui/kpi-card'
import type { Metric } from '@/lib/intelligence/types'
import { ProvenanceBadge } from './provenance-badge'

function displayValue(metric: Metric): string {
  if (metric.value === null) return 'unknown'
  const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(metric.value)
  return metric.unit ? `${number} ${metric.unit}` : number
}

/** A null metric is an honest unknown, never a green zero. */
export function MetricCard({ metric, sourceLabel }: { metric: Metric; sourceLabel?: string | null }) {
  const hint = [
    metric.period,
    metric.note,
    sourceLabel ? `Source: ${sourceLabel}` : null,
    metric.value === null ? 'No figure is inferred when nothing is sourced.' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <KpiCard
      label={metric.label}
      value={displayValue(metric)}
      hint={hint || 'No provenance detail supplied.'}
      tone={metric.provenance === 'illustrative' ? 'warn' : 'default'}
      action={<ProvenanceBadge provenance={metric.provenance} confidence={metric.confidence} />}
    />
  )
}
