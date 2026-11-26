import Link from 'next/link'

const LINKS = [
  { href: '/ledger', label: 'Ledger', note: 'Read-only activity records.' },
  { href: '/capabilities', label: 'Capabilities', note: 'Draft editor — saving never deploys.' },
  { href: '/approvals', label: 'Approvals', note: 'Visible context only. Decisions happen in the hosted approval path.' },
] as const

export function OperateLinks() {
  return (
    <section className="panel space-y-3 p-5 sm:p-6">
      <p className="label">Operate</p>
      <h2 className="font-display text-[20px] leading-tight text-bone">Read-only navigation</h2>
      <p className="text-[13px] leading-relaxed text-bone-dim">
        Operate links are read-only navigation. Opening them does not deploy, publish, approve, enable, or execute this report or any template on it.
      </p>
      <div className="flex flex-wrap gap-2">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="btn btn-secondary px-4 py-2">
            {link.label}
          </Link>
        ))}
      </div>
      <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-bone-faint">
        {LINKS.map((link) => (
          <li key={link.href}>{link.label}: {link.note}</li>
        ))}
      </ul>
    </section>
  )
}
