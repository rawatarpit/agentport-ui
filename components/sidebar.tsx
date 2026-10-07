'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Sections follow the user flow, in order: start (account → questions →
 * connect the repo), configure (what agents may do and under what
 * conditions), operate (what happened and what waits). A sidebar ordered by
 * the journey onboards; one ordered by the data model merely navigates.
 */
const SECTIONS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: 'Start',
    links: [
      { href: '/setup', label: 'Get started' },
      { href: '/connect', label: 'Connect GitHub' },
    ],
  },
  {
    title: 'Configure',
    links: [
      { href: '/capabilities', label: 'Capabilities' },
      { href: '/rules', label: 'Rules' },
      { href: '/policies', label: 'Limits' },
      { href: '/team', label: 'Team' },
    ],
  },
  {
    title: 'Operate',
    links: [
      { href: '/', label: 'Overview' },
      { href: '/ledger', label: 'Ledger' },
      { href: '/approvals', label: 'Approvals' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  {
    title: 'Try',
    links: [{ href: '/chat', label: 'Storefront chat' }],
  },
]

/**
 * The product shell: sidebar on desktop, disclosure on mobile.
 *
 * Sections follow the user's day, not the data model — operate what is
 * running, configure what it may do, build how it connects. The footer shows
 * who is signed in (from the session, never a guess) and the way out.
 */
export function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setEmail(data.session?.user.email ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const signOut = async () => {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

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

      {SECTIONS.map((s) => (
        <nav key={s.title} aria-label={s.title}>
          <p className="label px-2">{s.title}</p>
          <ul className="mt-1 space-y-0.5">
            {s.links.map((l) => {
              const active = path === l.href
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-md px-2 py-2 font-mono text-[12.5px] transition-colors ${
                      active
                        ? 'border-l-2 border-verdant bg-verdant/10 text-bone'
                        : 'border-l-2 border-transparent text-bone-dim hover:bg-ink-soft hover:text-bone'
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      ))}

      <div className={`${mobile ? '' : 'mt-auto'} space-y-2 border-t border-ink-line pt-4`}>
        <div className="px-2">
          <ThemeToggle />
        </div>
        {email ? (
          <div className="space-y-2 px-2">
            <p className="truncate font-mono text-[11px] text-bone-faint">{email}</p>
            <button type="button" className="btn w-full justify-center" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-2 px-2">
            <Link href="/login" className="btn btn-primary w-full justify-center">
              Sign in
            </Link>
          </div>
        )}
      </div>
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
