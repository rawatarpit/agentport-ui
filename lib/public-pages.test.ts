import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE_PATHS = {
  home: 'app/(site)/home/page.tsx',
  intelligence: 'app/(site)/intelligence/page.tsx',
} as const

type PageKey = keyof typeof PAGE_PATHS

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function pageSource(page: PageKey): string {
  return source(PAGE_PATHS[page])
}

function metadataBlock(src: string): string {
  const marker = 'export const metadata: Metadata = {'
  const start = src.indexOf(marker)
  if (start === -1) return ''
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return ''
}

function objectBlock(src: string, key: string): string {
  const marker = `${key}: {`
  const start = src.indexOf(marker)
  if (start === -1) return ''
  const open = start + marker.length - 1
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return ''
}

function stringValue(src: string, key: string): string {
  return src.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1] ?? ''
}

function stringArray(src: string, constant: string): string[] {
  const declared = src.match(new RegExp(`\\bconst\\s+${constant}\\b[\\s\\S]*?=\\s*\\[`))
  if (!declared || declared.index === undefined) return []
  const open = declared.index + declared[0].length - 1
  let depth = 0
  let body = ''
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1
    if (src[i] === ']') {
      depth -= 1
      if (depth === 0) {
        body = src.slice(open + 1, i)
        break
      }
    }
  }
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

function trackerTarget(src: string, event: string): string {
  const pattern = new RegExp(`<SectionViewTracker\\s+event="${event}"\\s+targetId="([^"]+)"`)
  return src.match(pattern)?.[1] ?? ''
}

const FORBIDDEN_COPY: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'SLA or response-time promise',
    pattern: /\bSLA\b|\bresponse[- ]time\b|\bsame[- ]day\b|\bwithin\s+\d+\s+(?:hours?|days?|business days?)\b|\bweek\s*\d\b|\bfirst[- ]proof session\b|\bfair[- ]use\b/i,
  },
  {
    name: 'testimonial, logo, partner or named pilot',
    pattern: /\b(?:trusted by|loved by|testimonials?|case stud(?:y|ies)|customer logos|partner logos|partners include|backed by|named pilots?)\b|\b(?:customers?|merchants?)\s+(?:say|love|praise)\b|\b(?:SentraZero|Acme)\b/i,
  },
  {
    name: 'pricing beyond the documented zero',
    pattern: /\b(?:₹|Rs\.?|INR|\$)\s*[1-9]|\b(?:per month|per seat|per site|paid plan|paid tier|paid proof)\b/i,
  },
  {
    name: 'approval presented as success',
    pattern: /\bapprov(?:e|ed|al)s?\s+(?:as\s+)?(?:success|successful|executed|complete|completed)\b|\b(?:successful|success)\s+approv(?:al|ed)\b|\bapprov(?:al|ed)\s+(?:means|proves|confirms)\b/i,
  },
  {
    name: 'governed before integration',
    pattern: /\b(?:governed|enforced|live)\s+(?:immediately|out of the box|from day one|automatically)\b|\bwe\s+auto[- ]?enforc|\bautomatic(?:ally)?\s+(?:enforced|governed|live)\b|\bwithout\s+(?:an?\s+)?(?:supported\s+)?integration\b/i,
  },
  {
    name: 'AI traffic or visibility measurement claim',
    pattern: /\bmeasure(?:s|d|ment)?\s+(?:AI|agent|chatbot)\s+(?:search\s+)?(?:visibility|traffic|demand)\b|\bAI[- ]generated\s+traffic\b|\bAI\s+(?:search\s+)?visibility\b/i,
  },
  {
    name: 'invented figures or social proof block',
    pattern: /\b\d+(?:\.\d+)?\s*%|\b\d+\s*\+?\s*(?:customers|merchants|businesses|pilots|partners|integrations)\b|<blockquote\b/i,
  },
]

describe('public conversion page structure', () => {
  it('exports a default page and metadata from every remaining public page', () => {
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      const src = source(file)
      expect(src, file).toMatch(/export default function \w+Page\(/)
      expect(metadataBlock(src), file).not.toBe('')
    }
  })

  it('gives every remaining page unique metadata with a canonical path and consistent social cards', () => {
    const titles: string[] = []
    const descriptions: string[] = []
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      const metadata = metadataBlock(source(file))
      const title = stringValue(metadata, 'title')
      const description = stringValue(metadata, 'description')
      expect(title, file).not.toBe('')
      expect(description, file).not.toBe('')
      expect(metadata, file).toContain("metadataBase: new URL('https://agentport.relayforge.in')")
      expect(stringValue(objectBlock(metadata, 'alternates'), 'canonical')).toBe(`/${page}`)

      const openGraph = objectBlock(metadata, 'openGraph')
      const twitter = objectBlock(metadata, 'twitter')
      expect(stringValue(openGraph, 'title')).toBe(title)
      expect(stringValue(openGraph, 'description')).toBe(description)
      expect(openGraph, file).toMatch(/\btype:\s*'website'/)
      expect(stringValue(twitter, 'title')).toBe(title)
      expect(twitter, file).toMatch(/\bcard:\s*'summary'/)

      titles.push(title)
      descriptions.push(description)
    }
    expect(new Set(titles).size).toBe(Object.keys(PAGE_PATHS).length)
    expect(new Set(descriptions).size).toBe(Object.keys(PAGE_PATHS).length)
  })

  it('keeps exactly the two public routes in the middleware allowlist', () => {
    const middleware = source('middleware.ts')
    for (const route of ['/home', '/intelligence']) {
      expect(middleware, `${route} must be publicly open`).toContain(`'${route}'`)
    }
    for (const route of ['/solutions', '/platform', '/how-it-works', '/developers', '/security']) {
      expect(middleware, `${route} must not be publicly open after removal`).not.toContain(`'${route}'`)
    }
  })

  it('keeps Supabase clients, service-role reads and data access out of the new pages', () => {
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      const src = source(file)
      expect(src, file).not.toMatch(/from\s+['"][^'"]*supabase[^'"]*['"]/i)
      expect(src, file).not.toMatch(/\bcreateAdminClient\b|\bcreateServerClient\b|\bcreateClient\b/)
      expect(src, file).not.toMatch(/\bservice_role\b/)
      expect(src, file).not.toMatch(/\.from\s*\(\s*['"]|\.select\s*\(/)
    }
  })

  it('homepage keeps the custody ladder, privacy projection and hosted approval boundary', () => {
    const src = source(PAGE_PATHS.home)
    expect(src).toContain('Shared tier — payloads in transit')
    expect(src).toContain('Enterprise tier — aggregates only')
    expect(src).toContain('Never persisted in either tier: CVV, passwords, API keys, raw credentials.')
    expect(src).toContain('row-level security')
    expect(src).toContain('unknown — not zero')
    expect(src).toContain('no browser approve button')
  })

  it('homepage keeps trust and footer boundaries in the shared layout', () => {
    const layout = source('app/(site)/layout.tsx')
    expect(layout).toContain('Draft is never live')
    expect(layout).toContain('unknown is never healthy')
  })

  it('intelligence page does not claim AI traffic or visibility measurement', () => {
    const src = source(PAGE_PATHS.intelligence)
    expect(src).not.toMatch(/measure AI (search\s+)?(visibility|traffic|demand)/i)
    expect(src).not.toMatch(/measure AI-generated traffic/i)
    expect(src).not.toMatch(/measure AI search visibility/i)
    for (const lens of ['AI ecosystem', 'Consumer behaviour', 'Market signals', 'Geographic intelligence', 'Business implications']) {
      expect(src).toContain(lens)
    }
  })
})

describe('public SEO stays answer-free', () => {
  it('indexes only stable public routes in the sitemap', () => {
    const sitemap = source('app/sitemap.ts')
    for (const route of ['/home', '/intelligence']) {
      expect(sitemap).toContain(route)
    }
    for (const route of ['/solutions', '/platform', '/how-it-works', '/developers', '/security']) {
      expect(sitemap, `${route} must not be indexed after route removal`).not.toContain(route)
    }
    expect(sitemap).toContain('https://agentport.relayforge.in')
    expect(sitemap).not.toMatch(/'\/intelligence\/report'/)
  })

  it('blocks tenant routes, API routes and the answer-bearing report URL', () => {
    const robots = source('app/robots.ts')
    for (const path of ['/api/', '/intelligence/report', '/ledger', '/approvals', '/capabilities', '/funnel']) {
      expect(robots).toContain(`'${path}'`)
    }
    expect(robots).toContain('https://agentport.relayforge.in/sitemap.xml')
  })

  it('opens indexed routes by prefix while keeping the answer-bearing report unindexed', () => {
    const middleware = source('middleware.ts')
    const openRoutes = stringArray(middleware, 'PUBLIC')
    const indexedRoutes = stringArray(source('app/sitemap.ts'), 'PUBLIC_ROUTES')
    expect(middleware).toContain('path === p || path.startsWith(`${p}/`)')
    expect(indexedRoutes.length).toBeGreaterThan(0)
    for (const route of indexedRoutes) {
      expect(openRoutes, `${route} is indexed but gated`).toContain(route)
    }
    for (const route of ['/ledger', '/approvals', '/capabilities', '/funnel']) {
      expect(openRoutes, `${route} must stay gated`).not.toContain(route)
    }
    // The report is reachable by the /intelligence prefix, so the true control
    // is noindex + robots exclusion, not a literal absence from PUBLIC.
    const reportPage = source('app/(site)/intelligence/report/page.tsx')
    expect(reportPage).toContain('index: false')
    expect(reportPage).toContain('follow: false')
    expect(source('app/robots.ts')).toContain("'/intelligence/report'")
    expect(source('app/sitemap.ts')).not.toContain("'/intelligence/report'")
  })
})

describe('public pages have no pilot intake surface', () => {
  it('does not reference the removed contact form or its write route', () => {
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      expect(source(file), page).not.toContain('ContactForm')
      expect(source(file), page).not.toContain('/api/contact')
    }
    expect(existsSync(join(ROOT, 'components/contact-form.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/api/contact/route.ts'))).toBe(false)
  })
})
