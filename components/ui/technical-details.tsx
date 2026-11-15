import type { ReactNode } from 'react'

/**
 * A small disclosure for audit references that should not sit on screen.
 *
 * The ledger stays verifiable without turning the console into a wall of
 * UUIDs: the row is visible, the reference is one click away.
 */
export function TechnicalDetails({
  label = 'Technical details',
  children,
  className = '',
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <details className={`group mt-1.5 text-[10.5px] leading-relaxed text-bone-faint/70 ${className}`}>
      <summary className="cursor-pointer select-none list-none font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint/60 transition-colors hover:text-bone-dim focus-visible:text-bone-dim [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
          {label}
        </span>
      </summary>
      <div className="mt-1.5 space-y-1 break-all font-mono">{children}</div>
    </details>
  )
}
