import { EmptyState } from '@/components/ui/empty-state'
import type { ResearchChart, SeriesPoint } from '@/lib/intelligence/types'
import { ProvenanceBadge } from './provenance-badge'

const WIDTH = 640
const HEIGHT = 220
const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

function formatValue(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)
}

function ValuesTable({ points, unit }: { points: SeriesPoint[]; unit: string }) {
  return (
    <table className="sr-only">
      <caption>Chart values in {unit}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point, index) => (
          <tr key={`${point.label}-${index}`}>
            <th scope="row">{point.label}</th>
            <td>{point.value === null ? 'unknown' : `${formatValue(point.value)} ${unit}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BarChart({ chart }: { chart: ResearchChart }) {
  const values = chart.points.flatMap((point) => (point.value === null ? [] : [point.value]))
  const max = values.length > 0 ? Math.max(...values, 0) || 1 : 1

  return (
    <div>
      <ul className="space-y-2.5">
        {chart.points.map((point, index) => {
          const known = point.value !== null
          return (
            <li
              key={`${point.label}-${index}`}
              className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate font-mono text-[11px] text-bone-dim">{point.label}</span>
              <span
                aria-hidden="true"
                className={`h-2.5 overflow-hidden rounded-full ${
                  known ? 'bg-ink/60' : 'border border-dashed border-ink-line'
                }`}
              >
                {known ? (
                  <span
                    className="block h-full rounded-full bg-verdant"
                    style={{ width: `${Math.max(2, ((point.value as number) / max) * 100)}%` }}
                  />
                ) : null}
              </span>
              <span className="tabular w-16 text-right font-mono text-[11px] text-bone">
                {known ? formatValue(point.value as number) : 'unknown'}
              </span>
            </li>
          )
        })}
      </ul>
      <ValuesTable points={chart.points} unit={chart.unit} />
    </div>
  )
}

type LocatedPoint = { index: number; value: number }

function LineChart({ chart }: { chart: ResearchChart }) {
  const points = chart.points
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]))
  const max = values.length > 0 ? Math.max(...values, 0) || 1 : 1
  const x = (index: number) =>
    PAD.left + (points.length === 1 ? PLOT_W / 2 : (index / (points.length - 1)) * PLOT_W)
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H

  const segments: LocatedPoint[][] = []
  let current: LocatedPoint[] = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push({ index, value: point.value })
  })
  if (current.length > 0) segments.push(current)

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max)
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${chart.title}. Values in ${chart.unit}. Missing points appear as gaps, not zero.`}
      >
        <title>{chart.title}</title>
        <desc>
          {values.length} dated values shown. Gaps mark periods with no verified value.
        </desc>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(var(--ink-line))"
              strokeDasharray="4 4"
            />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-bone-faint text-[10px]">
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`${point.label}-${index}`}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-bone-faint text-[10px]"
            >
              {point.label}
            </text>
          ) : null,
        )}

        {segments.map((segment, segmentIndex) => (
          <g key={segmentIndex}>
            <polyline
              fill="none"
              stroke="rgb(var(--verdant))"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(' ')}
            />
            {segment.map((point) => (
              <circle
                key={point.index}
                cx={x(point.index)}
                cy={y(point.value)}
                r={2.5}
                fill="rgb(var(--ink-soft))"
                stroke="rgb(var(--verdant))"
                strokeWidth={2}
              />
            ))}
          </g>
        ))}
      </svg>
      <ValuesTable points={points} unit={chart.unit} />
    </div>
  )
}

/** A chart with no dated points is an empty state, never a flat zero line. */
export function Chart({ chart, sourceLabel }: { chart: ResearchChart; sourceLabel?: string | null }) {
  return (
    <figure className="panel flex h-full flex-col p-4 sm:p-5">
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-[16px] text-bone">{chart.title}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
            {chart.kind} · {chart.unit}
            {sourceLabel ? ` · ${sourceLabel}` : ''}
          </p>
        </div>
        <ProvenanceBadge provenance={chart.provenance} />
      </figcaption>

      {chart.points.length === 0 ? (
        <EmptyState
          title="No dated series available"
          body={chart.note ?? 'A series appears only when a verified, dated source is connected.'}
        />
      ) : chart.kind === 'bar' ? (
        <BarChart chart={chart} />
      ) : (
        <LineChart chart={chart} />
      )}

      {chart.note && chart.points.length > 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-bone-faint">{chart.note}</p>
      ) : null}
    </figure>
  )
}
