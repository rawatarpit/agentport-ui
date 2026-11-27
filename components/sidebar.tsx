'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * Navigation is grouped by the merchant's decision, not by the database:
 * research before install, operate after, and installation as its own step.
 * Every href here is a route that exists in this app — a dead link in the shell
 * is worse than a missing one, because it implies a capability we do not have.
 */
const GROUPS = [
  {
    label: 'Intelligence',
    items: [
      { href: '/insights', label: 'Insights' },
      { href: '/insights/opportunities', label: 'Opportunities' },
      { href: '/insights/readiness', label: 'Readiness' },
      { href: '/insights/saved', label: 'Saved reports' },
      { href: '/funnel', label: 'Funnel' },
      { href: '/assessment', label: 'Assessment' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/', label: 'Overview' },
      { href: '/approvals', label: 'Approvals' },
      { href: '/ledger', label: 'Ledger' },
      { href: '/proof', label: 'Proof' },
      { href: '/activity', label: 'Activity' },
      { href: '/capabilities', label: 'Capabilities' },
      { href: '/rules', label: 'Rules' },
      { href: '/policies', label: 'Limits & stop' },
      { href: '/permissions', label: 'Permissions' },
      { href: '/analytics', label: 'Evidence' },
      { href: '/agent-analytics', label: 'Agent analytics' },
      { href: '/marketing-analytics', label: 'Marketing analytics' },
      { href: '/map', label: 'Map routes' },
      { href: '/setup', label: 'Setup' },
      { href: '/go-live', label: 'Go live' },
      { href: '/connect', label: 'Connect' },
      { href: '/identity', label: 'User sessions' },
      { href: '/team', label: 'Team' },
    ],
  },
  {
    label: 'Installation',
    items: [{ href: '/install', label: 'Install' }],
  },
]

export function Sidebar({
  businessName,
  published,
}: {
  businessName: string
  published: boolean | null
}) {
  const path = usePathname()

  const item = (href: string, label: string) => {
    const active = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
          active
            ? 'bg-verdant/10 text-bone before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-verdant'
            : 'text-bone-dim hover:bg-ink-soft hover:text-bone'
        }`}
      >
        <span>{label}</span>
        {href === '/go-live' && published === false ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-amber">setup</span>
        ) : null}
        {href === '/go-live' && published === true ? (
          <span aria-hidden="true" className="text-[11px] text-verdant">✓</span>
        ) : null}
        {href === '/go-live' && published === null ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-bone-faint">?</span>
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
            {published === null ? (
              <StatusPill tone="unknown">Unknown</StatusPill>
            ) : (
              <StatusPill tone={published ? 'live' : 'draft'}>{published ? 'Live' : 'Not live'}</StatusPill>
            )}
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
