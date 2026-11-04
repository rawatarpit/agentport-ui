import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Structural gates for the App Router.
 *
 * The 404 the merchant saw was not a missing route: `/map` and `/rules` were
 * route modules with no default export, so Next treated each module as a
 * server-component "Module" and static generation failed. These tests make
 * that class of bug, and dead links to deleted pages, fail before a deploy.
 */

const ROOT = process.cwd()

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full)
  }
  return out
}

/** app/(app)/map/page.tsx → /map; app/(app)/page.tsx → / */
function routeForPage(file: string): string {
  const rel = relative(join(ROOT, 'app'), file)
  const withoutPage = rel.replace(/\/?page\.tsx$/, '')
  const segments = withoutPage
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment))
  return `/${segments.join('/')}`
}

describe('App Router modules', () => {
  const pages = walk(join(ROOT, 'app')).filter((f) => f.endsWith('page.tsx'))

  it('finds every route module', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it('gives every page.tsx a default export', () => {
    for (const file of pages) {
      const source = readFileSync(file, 'utf8')
      expect(/export\s+default\s+/.test(source), `${relative(ROOT, file)} has no default export`).toBe(true)
    }
  })

  it('resolves every literal internal href to a page route', () => {
    const routes = new Set(pages.map(routeForPage))
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
    const missing: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/href\s*[=:]\s*["'](\/[^"']*)["']/g)) {
        const href = match[1].split('#')[0].split('?')[0]
        if (!href.startsWith('/') || href.startsWith('/api/')) continue
        if (!routes.has(href)) missing.push(`${relative(ROOT, file)} → ${href}`)
      }
    }

    expect(missing).toEqual([])
  })
})

describe('analytics reads the readable projection', () => {
  const readers = [
    'components/analytics-view.tsx',
    'app/api/analytics/route.ts',
    'app/api/marketing/analytics/route.ts',
  ]

  it('never queries v_ledger_agent_demand, which is denied to authenticated', () => {
    for (const file of readers) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      expect(source.includes(".from('v_ledger_agent_demand')"), file).toBe(false)
      expect(source.includes('.from("v_ledger_agent_demand")'), file).toBe(false)
    }
  })
})
