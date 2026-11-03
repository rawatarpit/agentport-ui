import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  info: 'border-ink-line bg-ink/40',
  success: 'border-verdant/30 bg-verdant/[0.06]',
  warning: 'border-amber/40 bg-amber/[0.07]',
  danger: 'border-rust/40 bg-rust/[0.07]',
}

const LABELS: Record<Tone, string> = {
  info: 'text-bone-faint',
  success: 'text-verdant',
  warning: 'text-amber',
  danger: 'text-rust',
}

/**
 * A callout is for a decision the reader has to make, not decoration.
 *
 * `role` is chosen by tone: a successful check is a status, a warning or a
 * refusal is an alert. That distinction is what makes a screen reader announce
 * the thing that matters instead of every coloured box.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${TONES[tone]}`}
      role={tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? (
        <p className={`font-sans text-[10.5px] font-semibold uppercase tracking-[0.08em] ${LABELS[tone]}`}>{title}</p>
      ) : null}
      <div className={`text-[13px] leading-relaxed text-bone-dim ${title ? 'mt-2' : ''}`}>{children}</div>
      {action ? <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}
