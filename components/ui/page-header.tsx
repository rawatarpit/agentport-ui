import type { ReactNode } from 'react'

/**
 * One page header, used everywhere.
 *
 * The console had six slightly different versions of "eyebrow, title, lede",
 * which made every screen feel like a separate product. The title is the
 * decision the page is about; the lede is the one sentence a merchant needs
 * before acting. Actions sit beside it on desktop and below it on mobile.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-ink-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-[68ch]">
        <p className="label">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-bone sm:text-[34px]">
          {title}
        </h1>
        {description ? <p className="prose-bone mt-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
