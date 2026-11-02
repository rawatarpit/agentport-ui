import type { ReactNode } from 'react'

/**
 * Empty is an answer. It says what is missing, why it is missing, and the one
 * thing that changes it — never a centred shrugging illustration.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-ink-line bg-ink/30 px-5 py-8 text-center">
      <p className="font-display text-[18px] text-bone">{title}</p>
      <div className="mx-auto mt-2 max-w-[58ch] text-[13px] leading-relaxed text-bone-dim">{body}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
