import type { ReactNode } from 'react'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'

/**
 * A presentational status line. The caller supplies the value and the honest
 * tone; this component never infers health or turns an unread value into zero.
 */
export function StateStrip({
  items,
}: {
  items: Array<{ term: string; value: string; tone: StatusTone; note?: ReactNode }>
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.term} className="panel-muted p-4">
          <p className="label">{item.term}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={item.tone}>{item.value}</StatusPill>
          </div>
          {item.note ? <p className="mt-2 text-[12px] leading-relaxed text-bone-faint">{item.note}</p> : null}
        </div>
      ))}
    </div>
  )
}
