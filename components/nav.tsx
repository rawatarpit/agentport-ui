'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/setup', label: 'Get started' },
  { href: '/', label: 'Overview' },
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/rules', label: 'Rules' },
  { href: '/policies', label: 'Limits' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/connect', label: 'Connect' },
  { href: '/chat', label: 'Storefront chat' },
]

/**
 * The shell's wayfinding. The active route wears the verdant edge so the
 * merchant always knows which surface they are reading — on a dense console
 * with ten siblings, "where am I" is asked constantly and must be answered
 * without reading.
 */
export function Nav() {
  const path = usePathname()
  const item = (l: { href: string; label: string }, mobile: boolean) => {
    const active = path === l.href
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? 'page' : undefined}
        className={`btn ${mobile ? 'justify-center' : ''} ${
          active ? 'border-verdant/60 bg-verdant/10 text-bone' : ''
        }`}
      >
        {l.label}
      </Link>
    )
  }

  return (
    <header className="border-b border-ink-line py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-verdant/40 bg-verdant/10 font-display text-lg text-verdant">
            A
          </span>
          <span>
            <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-verdant">
              Agent Port
            </span>
            <span className="block font-display text-2xl leading-tight text-bone">Console</span>
          </span>
        </Link>
        <nav className="hidden flex-wrap gap-1 md:flex" aria-label="Primary">
          {links.map((l) => item(l, false))}
        </nav>
        <details className="w-full md:hidden">
          <summary className="btn w-full cursor-pointer justify-center">Menu</summary>
          <nav className="mt-2 grid grid-cols-2 gap-1" aria-label="Primary">
            {links.map((l) => item(l, true))}
          </nav>
        </details>
      </div>
    </header>
  )
}
