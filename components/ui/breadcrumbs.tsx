'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CONSOLE_NAV, sectionForPath } from '@/lib/console-nav'

function dynamicLabel(pathname: string): string | null {
  const match = pathname.match(/^\/approvals\/confirm\/[^/]+$/)
  if (match) return 'Confirmation reference'
  if (/^\/insights\/saved\/[^/]+$/.test(pathname)) return 'Saved report'
  return null
}

/** Presentational route context. No tenant data, no state claim, no action. */
export function Breadcrumbs() {
  const path = usePathname()
  if (path === '/') return null
  const section = sectionForPath(path)
  const item = section.items.find((entry) =>
    entry.href === '/' ? path === '/' : path === entry.href || path.startsWith(`${entry.href}/`),
  )
  const label = dynamicLabel(path) ?? item?.label ?? section.label

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-bone-faint">
      <Link href="/" className="hover:text-bone">Overview</Link>
      <span aria-hidden="true">/</span>
      <span>{section.label}</span>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="text-bone-dim">{label}</span>
    </nav>
  )
}
