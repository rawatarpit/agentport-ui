'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * Wayfinding is the product's table of contents, not its checklist.
 *
 * "Go live" is first because that is the job; the other groups are what you
 * operate once it is done. Map routes sits next to Capabilities because a
 * mapped route is the only thing that becomes an executable capability — the
 * catalogue alone is not a runtime. Setup remains a shortcut, not a
 * competing flow.
 */
const GROUPS = [
  {
    label: 'Workspace',
    items: [
      { href: '/', label: 'Overview' },
      { href: '/go-live', label: 'Go live' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/approvals', label: 'Approvals' },
      { href: '/ledger', label: 'Ledger' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/team', label: 'Team' },
    ],
  },
  {
    label: 'Govern',
    items: [
      { href: '/rules', label: 'Rules' },
      { href: '/policies', label: 'Limits & stop' },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/map', label: 'Map routes' },
      { href: '/capabilities', label: 'Capabilities' },
    ],
  },
]

export function Sidebar({
  businessName,
  published,
}: {
  businessName: string
  published: boolean
}) {
  const path = usePathname()

  const item = (href: string, label: string) => {
    const active = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
          active
            ? 'bg-verdant/10 text-bone'
            : 'text-bone-dim hover:bg-ink-soft hover:text-bone'
        }`}
      >
        <span>{label}</span>
        {href === '/go-live' && !published ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-amber">setup</span>
        ) : null}
        {href === '/go-live' && published ? (
          <span aria-hidden="true" className="text-[11px] text-verdant">✓</span>
        ) : null}
      </Link>
    )
  }

  const body = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <Link href="/" className="flex items-center gap-3">
        <AgentPortLogo size={36} markOnly />
        <span>
          <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-verdant">
            Agent Port
          </span>
          <span className="block font-display text-xl leading-tight text-bone">Console</span>
        </span>
      </Link>

      <nav aria-label="Console" className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="label px-2.5">{group.label}</p>
            <ul className="mt-1 space-y-0.5">
              {group.items.map((l) => (
                <li key={l.href}>{item(l.href, l.label)}</li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 border-t border-ink-line pt-4">
        <div className="px-1">
          <p className="label">Workspace</p>
          <p className="mt-1 truncate text-[12.5px] text-bone">{businessName}</p>
          <div className="mt-2">
            <StatusPill tone={published ? 'live' : 'draft'}>{published ? 'Live' : 'Not live'}</StatusPill>
          </div>
        </div>
        <Link href="/setup" className="block px-1 font-mono text-[11px] text-bone-faint hover:text-bone">
          Setup wizard →
        </Link>
      </div>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-line bg-ink-soft/60 px-3 py-6 md:flex">
        {body()}
      </aside>
      <div className="border-b border-ink-line px-5 py-4 md:hidden">
        <details>
          <summary className="btn w-full cursor-pointer justify-center">Menu</summary>
          <div className="mt-4 max-h-[70vh] overflow-y-auto">{body()}</div>
        </details>
      </div>
    </>
  )
}
