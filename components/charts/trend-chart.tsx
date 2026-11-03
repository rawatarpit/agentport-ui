'use client'

import { useMemo, useState } from 'react'
import type { WeeklyPoint } from '@/lib/analytics-shape'

type SeriesKey = 'asked' | 'denied' | 'held' | 'executed'

const SERIES: Array<{ key: SeriesKey; label: string; color: string }> = [
  { key: 'asked', label: 'Asked', color: 'rgb(var(--bone-faint))' },
  { key: 'denied', label: 'Refused', color: 'rgb(var(--rust))' },
  { key: 'held', label: 'Held', color: 'rgb(var(--amber))' },
  { key: 'executed', label: 'Executed', color: 'rgb(var(--verdant))' },
]

const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 18, right: 18, bottom: 36, left: 44 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

function weekLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return week
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)
}

/**
 * Interactive weekly trend. Hover a week for a tooltip; toggle a series in the
 * legend. The chart is a client component so the server page stays a thin data
 * reader and the interaction never requires a round trip.
 */
export function TrendChart({ points }: { points: WeeklyPoint[] }) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set())
  const [active, setActive] = useState<number | null>(null)

  const visible = SERIES.filter((s) => !hidden.has(s.key))
  const max = useMemo(
    () => Math.max(1, ...points.flatMap((p) => visible.map((s) => p[s.key]))),
    [points, visible],
  )

  if (points.length === 0) return null

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W)
  const y = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t)))]
  const labelEvery = Math.max(1, Math.ceil(points.length / 7))
  const activePoint = active === null ? null : points[active]

  const toggle = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (visible.length > 1) next.add(key)
      return next
    })
  }

  return (
    <div
      className="relative"
      onMouseLeave={() => setActive(null)}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {SERIES.map((s) => {
          const off = hidden.has(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!off}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                off
                  ? 'border-ink-line text-bone-faint'
                  : 'border-ink-line bg-ink-soft text-bone'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: off ? 'rgb(var(--bone-faint))' : s.color }}
              />
              {s.label}
            </button>
          )
        })}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="Weekly agent requests by decision. Use the legend to show or hide a series; hover a week for exact counts."
      >
        <title>Weekly agent requests by decision</title>
        <desc>
          {points.length} weeks shown. Hover a week for asked, refused, held, and
          executed counts. Missing weeks are absent, not zero.
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
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-bone-faint text-[10px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <text
            key={`label-${p.week}`}
            x={x(i)}
            y={HEIGHT - 10}
            textAnchor="middle"
            className="fill-bone-faint text-[10px]"
          >
            {i % labelEvery === 0 ? weekLabel(p.week) : ''}
          </text>
        ))}

        {visible.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
            />
            {points.map((p, i) => (
              <circle
                key={`${s.key}-${p.week}`}
                cx={x(i)}
                cy={y(p[s.key])}
                r={active === i ? 4 : 2.5}
                fill="rgb(var(--ink-soft))"
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
          </g>
        ))}

        {points.map((p, i) => {
          const step = points.length === 1 ? PLOT_W : PLOT_W / (points.length - 1)
          return (
            <rect
              key={`hit-${p.week}`}
              x={x(i) - step / 2}
              y={PAD.top}
              width={step}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          )
        })}
      </svg>

      {activePoint ? (
        <div
          className="pointer-events-none absolute top-12 z-10 min-w-[140px] -translate-x-1/2 rounded-lg border border-ink-line bg-ink-soft p-3 text-[11px] shadow-lg"
          style={{ left: `${(x(active as number) / WIDTH) * 100}%` }}
        >
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-bone-faint">
            Week of {weekLabel(activePoint.week)}
          </p>
          <dl className="mt-2 space-y-1">
            {visible.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-bone-dim">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </dt>
                <dd className="tabular font-mono text-bone">{activePoint[s.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}