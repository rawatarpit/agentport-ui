'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Wayfinding, kept short on purpose: seven items cover the whole product.
 * Everything else (setup wizard, capabilities detail, demo chat) stays
 * routable and linked from where it is used — a sidebar is for going
 * places daily, not for inventorying routes. Setup progress folds away
 * when done instead of nagging.
 */
const PRIMARY = [
  { href: '/', label: 'Overview' },
  { href: '/connect', label: 'Connect repo' },
  { href: '/rules', label: 'Rules' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/team', label: 'Team' },
]

const MORE = [
  { href: '/setup', label: 'Get started' },
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/policies', label: 'Limits & stop' },
  { href: '/chat', label: 'Storefront demo' },
]

export function Sidebar() {
  const path = usePathname()
  const [setupDone, setSetupDone] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/connect')
      .then((r) => r.json())
      .then((body: { status: string; steps?: Array<{ n: string; state: string }> }) => {
        if (!live || body.status !== 'ok' || !body.steps) return
        const wanted = new Set(['1', '2', '3', '4'])
        const mine = body.steps.filter((s) => wanted.has(s.n))
        setSetupDone(mine.length > 0 && mine.every((s) => s.state === 'done'))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const item = (href: string, label: string, done?: boolean) => {
    const active = path === href
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center justify-between rounded-md px-2 py-2 font-mono text-[12.5px] transition-colors ${
          active
            ? 'border-l-2 border-verdant bg-verdant/10 text-bone'
            : 'border-l-2 border-transparent text-bone-dim hover:bg-ink-soft hover:text-bone'
        }`}
      >
        <span>{label}</span>
        {done ? <span aria-hidden="true" className="text-[11px] text-verdant">✓</span> : null}
      </Link>
    )
  }

  const onMoreRoute = ['/setup', '/capabilities', '/policies', '/chat'].includes(path)

  const body = (mobile: boolean) => (
    <div className={`flex ${mobile ? '' : 'min-h-0 flex-1 flex-col gap-5 overflow-y-auto'} flex-col gap-5`}>
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-verdant/40 bg-verdant/10 font-display text-lg text-verdant">
          A
        </span>
        <span>
          <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-verdant">
            Agent Port
          </span>
          <span className="block font-display text-xl leading-tight text-bone">Console</span>
        </span>
      </Link>

      <nav aria-label="Primary">
        <ul className="space-y-0.5">
          {PRIMARY.slice(0, 2).map((l) => (
            <li key={l.href}>{item(l.href, l.label, l.href === '/connect' && setupDone === true)}</li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Manage">
        <p className="label px-2">Run</p>
        <ul className="mt-1 space-y-0.5">
          {PRIMARY.slice(2).map((l) => (
            <li key={l.href}>{item(l.href, l.label)}</li>
          ))}
        </ul>
      </nav>

      <details open={onMoreRoute || undefined}>
        <summary className="cursor-pointer rounded-md px-2 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint hover:text-bone" aria-label="More pages">
          More
        </summary>
        <ul className="mt-1 space-y-0.5">
          {MORE.map((l) => (
            <li key={l.href}>{item(l.href, l.label)}</li>
          ))}
        </ul>
      </details>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-2 overflow-hidden border-r border-ink-line px-4 py-6 md:flex">
        {body(false)}
      </aside>
      <div className="border-b border-ink-line px-5 py-4 md:hidden">
        <details>
          <summary className="btn w-full cursor-pointer justify-center">Menu</summary>
          <div className="mt-4">{body(true)}</div>
        </details>
      </div>
    </>
  )
}
