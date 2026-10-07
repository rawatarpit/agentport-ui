import type { ReactNode } from 'react'

/**
 * The one centered column every auth screen shares: brand mark, title,
 * card, footer link. A merchant meets this product here; it should feel
 * deliberate, not default.
 */
export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  lede?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-verdant/40 bg-verdant/10 font-display text-xl text-verdant">
          A
        </span>
        <div>
          <p className="label">{eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl text-bone">{title}</h2>
          {lede ? <p className="prose-bone mt-2 text-[14px]">{lede}</p> : null}
        </div>
      </div>
      <div className="auth-card">{children}</div>
      {footer ? <div className="text-center text-[13px] text-bone-dim">{footer}</div> : null}
    </div>
  )
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-rust/40 bg-rust/10 px-3 py-2 text-[13px] leading-relaxed text-bone" role="alert">
      {children}
    </p>
  )
}
