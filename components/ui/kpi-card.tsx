import type { ReactNode } from 'react'

type Tone = 'default' | 'good' | 'warn' | 'bad'

const COLOURS: Record<Tone, string> = {
  default: 'text-bone',
  good: 'text-verdant',
  warn: 'text-amber',
  bad: 'text-rust',
}

/**
 * One KPI tile. The value is the number the merchant came for; the hint is the
 * honesty label underneath it. A null value renders “unknown”, never 0.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  action,
}: {
  label: string
  value: string | number
  hint: string
  tone?: Tone
  action?: ReactNode
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {action}
      </div>
      <p className={`tabular mt-2 font-display text-[30px] font-semibold leading-none ${COLOURS[tone]}`}>
        {value}
      </p>
      <p className="mt-2 text-[12px] leading-snug text-bone-faint">{hint}</p>
    </div>
  )
}