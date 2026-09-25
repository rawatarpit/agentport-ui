import Link from 'next/link'

const links = [
  { href: '/', label: 'Overview' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/policies', label: 'Policies' },
  { href: '/approvals', label: 'Approvals' },
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
        <nav className="flex flex-wrap gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
