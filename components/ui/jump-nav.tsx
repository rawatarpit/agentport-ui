import type { ReactNode } from 'react'

/** Anchored page map for long public pages. No new routes, no JS. */
export function JumpNav({ label, items }: { label: string; items: Array<{ href: string; label: string }> }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2 border-y border-ink-line/60 py-4">
      <span className="label mr-1">{label}</span>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="rounded-full border border-ink-line px-3 py-1.5 font-mono text-[11px] text-bone-dim transition-colors hover:border-verdant hover:text-bone"
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
