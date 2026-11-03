import type { ReactNode } from 'react'

export type StatusTone = 'live' | 'ready' | 'draft' | 'blocked' | 'unknown'

const TONES: Record<StatusTone, string> = {
  live: 'border-verdant/40 bg-verdant/10 text-verdant',
  ready: 'border-verdant/30 bg-verdant/5 text-verdant',
  draft: 'border-amber/40 bg-amber/10 text-amber',
  blocked: 'border-rust/40 bg-rust/10 text-rust',
  unknown: 'border-ink-line bg-ink/40 text-bone-faint',
}

/**
 * A status is never just a colour. The dot carries the tone, the word carries
 * the meaning, and the same word appears in the checklist and the overview.
 */
export function StatusPill({
  tone,
  children,
  className = '',
}: {
  tone: StatusTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-sans text-[10.5px] font-medium uppercase tracking-[0.06em] ${TONES[tone]} ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
