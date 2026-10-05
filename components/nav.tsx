import Link from 'next/link'

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

export function Nav() {
  return (
    <header className="border-b border-ink-line py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-verdant">
            Agent Port
          </p>
          <h1 className="font-display text-2xl text-bone">Example Shoes</h1>
        </div>
        {/* Desktop: the full row. Mobile: a disclosure — ten links will not
            fit a 375px bar, and a wrapped wall of buttons is not navigation. */}
        <nav className="hidden flex-wrap gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn">
              {l.label}
            </Link>
          ))}
        </nav>
        <details className="w-full md:hidden">
          <summary className="btn w-full cursor-pointer justify-center">Menu</summary>
          <nav className="mt-2 grid grid-cols-2 gap-1" aria-label="Primary">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="btn justify-center">
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  )
}
