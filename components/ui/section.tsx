import type { ReactNode } from 'react'

/**
 * A titled block inside a page. The heading is a real heading, not a label,
 * so the document outline stays readable when a merchant uses a screen reader
 * or jumps between sections.
 */
export function Section({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-tight text-bone">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
