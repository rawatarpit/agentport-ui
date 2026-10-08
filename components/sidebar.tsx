'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type SetupState = { done: boolean; total: number } | null

/**
 * Wayfinding ordered by the journey: Home, then Setup (which finishes and
 * folds away), then Run, then Try. The Setup group reads /api/connect and
 * collapses to a single checked row once its steps are done — navigation
 * that completes instead of nagging. Auth pages never see this shell;
 * route groups keep them out by folder, not by memory.
 */
const SETUP_HREFS = ['/setup', '/connect', '/capabilities', '/rules']

export function Sidebar() {
  const path = usePathname()
  const [setup, setSetup] = useState<SetupState>(null)

  useEffect(() => {
    let live = true
    fetch('/api/connect')
      .then((r) => r.json())
      .then((body: { status: string; steps?: Array<{ n: string; state: string }> }) => {
        if (!live || body.status !== 'ok' || !body.steps) return
        const wanted = new Set(['2', '3', '4', '6'])
        const mine = body.steps.filter((s) => wanted.has(s.n))
        const done = mine.filter((s) => s.state === 'done').length
        setSetup({ done: done === mine.length && mine.length > 0, total: mine.length })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const item = (href: string, label: string) => {
    const active = path === href
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`block rounded-md px-2 py-2 font-mono text-[12.5px] transition-colors ${
          active
            ? 'border-l-2 border-verdant bg-verdant/10 text-bone'
            : 'border-l-2 border-transparent text-bone-dim hover:bg-ink-soft hover:text-bone'
        }`}
      >
        {label}
      </Link>
    )
  }

  const setupLinks = (
    <ul className="mt-1 space-y-0.5">
      <li>{item('/setup', 'Get started')}</li>
      <li>{item('/connect', 'Connect repo')}</li>
      <li>{item('/capabilities', 'Capabilities')}</li>
      <li>{item('/rules', 'Rules')}</li>
    </ul>
  )

  const body = (mobile: boolean) => (
    <div className={`flex ${mobile ? '' : 'min-h-0 flex-1 flex-col gap-6 overflow-y-auto'} flex-col gap-6`}>
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
        <p className="label px-2">Home</p>
        <ul className="mt-1 space-y-0.5">
          <li>{item('/', 'Overview')}</li>
        </ul>
      </nav>

      <nav aria-label="Setup">
        {setup?.done ? (
          <Link href="/connect" className="flex items-center justify-between rounded-md px-2 py-2">
            <span className="label">Setup</span>
            <span className="font-mono text-[11px] text-verdant">done ✓</span>
          </Link>
        ) : (
          <>
            <p className="label px-2">Setup</p>
            {setupLinks}
          </>
        )}
      </nav>

      <nav aria-label="Run">
        <p className="label px-2">Run</p>
        <ul className="mt-1 space-y-0.5">
          <li>{item('/ledger', 'Ledger')}</li>
          <li>{item('/approvals', 'Approvals')}</li>
          <li>{item('/analytics', 'Analytics')}</li>
          <li>{item('/policies', 'Limits')}</li>
          <li>{item('/team', 'Team')}</li>
        </ul>
      </nav>

      <nav aria-label="Try">
        <p className="label px-2">Try</p>
        <ul className="mt-1 space-y-0.5">
          <li>{item('/chat', 'Storefront demo')}</li>
        </ul>
      </nav>
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
