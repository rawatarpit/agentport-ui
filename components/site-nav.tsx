import Link from 'next/link'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { ThemeToggle } from '@/components/theme-toggle'

/** The canonical public IA. The homepage mirrors this list; do not fork it. */
export const LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/platform', label: 'Platform' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/developers', label: 'Developers' },
  { href: '/security', label: 'Security' },
] as const

const LINK_CLASS =
  'rounded-md px-2.5 py-2 font-mono text-[12px] text-bone-dim transition-colors hover:bg-ink/50 hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdant/60'

/**
 * The one public header. Desktop shows every destination; the mobile sheet is
 * a <details> element so navigation works without client JavaScript.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-line/60 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/home" aria-label="AgentPort home" className="shrink-0">
          <AgentPortLogo size={28} />
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={LINK_CLASS}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden w-[92px] sm:block">
            <ThemeToggle />
          </div>
          <Link href="/login" className="btn btn-quiet btn-sm hidden px-3 py-1.5 sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-sm hidden px-3 py-1.5 sm:inline-flex">
            Get started
          </Link>
          <Link href="/pilot" className="btn btn-primary btn-sm hidden px-3 py-1.5 sm:inline-flex">
            Request a pilot
          </Link>

          <details className="relative lg:hidden">
            <summary
              aria-label="Open navigation menu"
              className={`${LINK_CLASS} inline-flex cursor-pointer list-none items-center border border-ink-line [&::-webkit-details-marker]:hidden`}
            >
              Menu
            </summary>
            <nav
              aria-label="Mobile navigation"
              className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-lg border border-ink-line bg-ink-soft p-2 shadow-xl"
            >
              <ul className="space-y-0.5">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={`${LINK_CLASS} block`}>
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li className="border-t border-ink-line pt-1.5">
                  <Link href="/login" className={`${LINK_CLASS} block`}>
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className={`${LINK_CLASS} block`}>
                    Get started
                  </Link>
                </li>
                <li>
                  <Link href="/pilot" className={`${LINK_CLASS} block text-verdant`}>
                    Request a pilot
                  </Link>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
