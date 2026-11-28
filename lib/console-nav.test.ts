import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CONSOLE_NAV, itemsForSection, sectionForPath } from '@/lib/console-nav'

const root = process.cwd()
const appRoot = join(root, 'app')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name === 'page.tsx') out.push(path)
  }
  return out
}

function routeForPage(file: string): string {
  const rel = relative(appRoot, file).replace(/\/?page\.tsx$/, '')
  const segments = rel.split('/').filter(Boolean).filter((segment) => !/^\(.*\)$/.test(segment))
  return `/${segments.join('/')}`
}

describe('console navigation', () => {
  const hrefs = CONSOLE_NAV.flatMap((group) => group.items.map((item) => item.href))
  const routes = new Set(walk(appRoot).map(routeForPage))

  it('resolves every item to a real page route', () => {
    for (const href of hrefs) expect(routes, href).toContain(href)
  })

  it('has no duplicates and keeps one source of truth per route', () => {
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('covers every static signed-in page except workspace selection', () => {
    const staticPages = [...routes].filter(
      (route) => !route.startsWith('/(site)') && !route.includes('[') && !['/login', '/signup', '/reset-password', '/select-workspace', '/home', '/intelligence', '/intelligence/report'].includes(route),
    )
    for (const route of staticPages) expect(hrefs, route).toContain(route)
  })

  it('maps dynamic child paths to their parent section', () => {
    expect(sectionForPath('/insights/saved/abc').id).toBe('research')
    expect(sectionForPath('/approvals/confirm/request-1').id).toBe('operate')
    expect(itemsForSection('operate').some((item) => item.href === '/proof')).toBe(true)
  })

  it('uses decision-language section labels', () => {
    expect(CONSOLE_NAV.map((group) => group.label)).toEqual([
      'State',
      'Configure',
      'Launch',
      'Operate',
      'Research',
      'Workspace',
    ])
  })
})
