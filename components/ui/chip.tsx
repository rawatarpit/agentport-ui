import type { ReactNode } from 'react'

export type ChipTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'

const TONES: Record<ChipTone, string> = {
  neutral: 'border-ink-line bg-ink/40 text-bone-faint',
  good: 'border-verdant/40 bg-verdant/10 text-verdant',
  warn: 'border-amber/40 bg-amber/10 text-amber',
  bad: 'border-rust/40 bg-rust/10 text-rust',
  info: 'border-ink-line bg-ink-soft text-bone-dim',
}

/**
 * A small, non-interactive metadata tag: effect, attribution source, outcome.
 *
 * It is not a button and not a status pill. `title` carries the sentence a
 * chip is too small to say, so a merchant can hover a `declared` tag and read
 * that the name was not verified without leaving the row.
 */
export function Chip({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: ChipTone
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] leading-none ${TONES[tone]}`}
    >
      {children}
      {title ? <span className="sr-only">{title}</span> : null}
    </span>
  )
}
