'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CONSOLE_NAV, sectionForPath } from '@/lib/console-nav'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * Navigation is grouped by the merchant's decision, not by the database.
 *
 * Every href is a literal route in CONSOLE_NAV: a dead link would imply a
 * capability we do not have. Groups are disclosed one at a time so the shell
 * reads as a journey instead of a 25-item feature inventory.
 */
export function Sidebar({
  businessName,
  published,
}: {
  businessName: string
  published: boolean | null
}) {
  const path = usePathname()
  const currentSection = sectionForPath(path).id

  const item = (href: string, label: string, hint: string) => {
    const active = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        title={hint}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
          active
            ? 'bg-verdant/10 text-bone before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-verdant'
            : 'text-bone-dim hover:bg-ink-soft hover:text-bone'
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
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

      <nav aria-label="Console" className="space-y-2">
        {CONSOLE_NAV.map((group) => (
          <details
            key={group.id}
            open={group.id === currentSection}
            className="rounded-lg border border-transparent open:border-ink-line/70 open:bg-ink/20"
          >
            <summary className="cursor-pointer list-none px-2.5 py-2 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                <span className="label">{group.label}</span>
                <span className="font-mono text-[10px] text-bone-faint">{group.items.length}</span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-bone-faint/70">{group.description}</span>
            </summary>
            <ul className="mt-0.5 space-y-0.5 px-1 pb-2">
              {group.items.map((link) => (
                <li key={link.href}>{item(link.href, link.label, link.hint)}</li>
              ))}
            </ul>
          </details>
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
      </div>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-line bg-ink-soft/60 px-3 py-6 md:flex">
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
