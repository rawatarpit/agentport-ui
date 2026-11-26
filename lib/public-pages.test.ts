import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FUNNEL_EVENT_TYPES } from '@/lib/funnel-event-types'

const ROOT = process.cwd()
const PAGE_PATHS = {
  platform: 'app/(site)/platform/page.tsx',
  pilot: 'app/(site)/pilot/page.tsx',
  solutions: 'app/(site)/solutions/page.tsx',
  'how-it-works': 'app/(site)/how-it-works/page.tsx',
  developers: 'app/(site)/developers/page.tsx',
  security: 'app/(site)/security/page.tsx',
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
  it('exports a default page and metadata from every new page', () => {
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      const src = source(file)
      expect(src, file).toMatch(/export default function \w+Page\(/)
      expect(metadataBlock(src), file).not.toBe('')
    }
  })

  it('gives every page unique metadata with a canonical path and consistent social cards', () => {
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
      expect(stringValue(openGraph, 'url')).toBe(`https://agentport.relayforge.in/${page}`)
      expect(openGraph, file).toMatch(/\btype:\s*'website'/)
      expect(openGraph, file).toMatch(/\bsiteName:\s*'AgentPort'/)
      expect(stringValue(twitter, 'title')).toBe(title)
      expect(stringValue(twitter, 'description')).toBe(description)
      expect(twitter, file).toMatch(/\bcard:\s*'summary'/)

      titles.push(title)
      descriptions.push(description)
    }
    expect(new Set(titles).size).toBe(Object.keys(PAGE_PATHS).length)
    expect(new Set(descriptions).size).toBe(Object.keys(PAGE_PATHS).length)
  })

  it('keeps the new routes in the public middleware allowlist', () => {
    const middleware = source('middleware.ts')
    expect(middleware).toContain("'/platform'")
    expect(middleware).toContain("'/pilot'")
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

  it('contains no forbidden pilot copy on any new public page', () => {
    for (const [page, file] of Object.entries(PAGE_PATHS)) {
      const src = source(file)
      for (const forbidden of FORBIDDEN_COPY) {
        expect(src, `${file}: ${forbidden.name}`).not.toMatch(forbidden.pattern)
      }
    }
  })
})

describe('conversion page claims stay bounded', () => {
  it('states the platform stages, status vocabulary and request path', () => {
    const src = pageSource('platform')
    for (const stage of ['Understand', 'Connect', 'Control', 'Operate']) {
      expect(src).toContain(`title: '${stage}'`)
    }
    for (const label of ['available', 'draft', 'requires supported integration', 'illustrative']) {
      expect(src).toContain(`label: '${label}'`)
    }
    for (const step of ['Agent', 'Compatible client', 'Hosted governor', 'Decision', 'Business action']) {
      expect(src).toContain(`title: '${step}'`)
    }
    expect(src).toContain('The ledger records the decision; it does not execute the action.')
    expect(src).toContain('Discovery manifest is advisory')
    expect(src).toContain('Drafts are not live')
    expect(src).toContain('Approvals are hosted decisions')
    expect(src).toContain('Row-level security')
    expect(src).toContain('unknown, never zero')
  })

  it('records only the allowlisted section views with no payload', () => {
    const platform = pageSource('platform')
    const pilot = pageSource('pilot')
    expect(platform).toContain("import { SectionViewTracker } from '@/components/landing/section-view-tracker'")
    expect(trackerTarget(platform, 'integration_section_viewed')).not.toBe('')
    expect(platform).toContain(`id="${trackerTarget(platform, 'integration_section_viewed')}"`)
    expect(pilot).toContain("import { ContactForm } from '@/components/contact-form'")
    expect(pilot).toContain("import { SectionViewTracker } from '@/components/landing/section-view-tracker'")
    expect(trackerTarget(pilot, 'pilot_section_viewed')).not.toBe('')
    expect(pilot).toContain(`id="${trackerTarget(pilot, 'pilot_section_viewed')}"`)
    for (const file of [PAGE_PATHS.platform, PAGE_PATHS.pilot]) {
      expect(source(file), file).not.toMatch(/\btrack\s*\(|event_type:/)
    }
  })

  it('states only the documented founding-pilot terms', () => {
    const src = pageSource('pilot')
    for (const phrase of [
      '₹0',
      'selected participants',
      'One environment',
      'Assisted setup',
      'Limited capabilities',
      'Initial policy configuration',
      'allow, hold and refuse',
      'activity and audit records',
      'exit at any time',
      'hosting, database and third-party costs remain your responsibility',
      'scope and eligibility are agreed before onboarding',
    ]) {
      expect(src.toLowerCase()).toContain(phrase.toLowerCase())
    }
  })

  it('reframes solutions around three buyer segments with the same integration boundary', () => {
    const src = pageSource('solutions')
    for (const segment of [
      'B2B suppliers / distributors',
      'Transactional ecommerce / D2C',
      'SaaS / structured workflow',
    ]) {
      expect(src).toContain(segment)
    }
    const boundaries = src.match(/requires a supported integration to be governed/g) ?? []
    expect(boundaries.length).toBeGreaterThanOrEqual(3)
    expect(src).toContain('What is deliberately absent')
    expect(src).toContain('Request a pilot')
  })

  it('adds a compact status legend that explains every rendered card label', () => {
    const src = pageSource('how-it-works')
    expect(src).toContain('Twelve steps, with the status shown at every one.')
    const legendStart = src.indexOf('const LEGEND')
    const legendBlock = src.slice(legendStart, src.indexOf('] as const', legendStart))
    const legendLabels = [...legendBlock.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
    expect(legendLabels).toEqual(
      expect.arrayContaining(['available', 'illustrative', 'planned', 'externally sourced research']),
    )
    const statusBlock = src.slice(src.indexOf('const STATUS'), legendStart)
    const statusLabels = [...statusBlock.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
    expect(statusLabels.length).toBeGreaterThan(0)
    for (const label of statusLabels) {
      expect(legendLabels, `${label} has no legend definition`).toContain(label)
    }
    expect(src).toContain('Request a pilot')
    expect((src.match(/\bn: '\d\d'/g) ?? []).length).toBe(12)
  })

  it('lists the exact supported discovery targets and the hosted write contract', () => {
    const src = pageSource('developers')
    expect(stringArray(src, 'SUPPORTED_TARGETS')).toEqual([
      'Next.js',
      'Vite',
      'Astro',
      'Nuxt',
      'Remix',
      'SvelteKit',
      'Gatsby',
      'static/postbuild',
    ])
    expect(src).toContain('No universal compatibility is promised.')
    expect(src).toContain('GET → confirm → write')
    expect(src).toMatch(/hosted governor is authoritative/i)
    expect(src).toContain('Request a pilot')
  })

  it('keeps the custody ladder, privacy projection and hosted approval boundary', () => {
    const src = pageSource('security')
    expect(src).toContain('Shared tier — payloads in transit')
    expect(src).toContain('Enterprise tier — aggregates only')
    expect(src).toContain('Never persisted in either tier: CVV, passwords, API keys, raw credentials.')
    expect(src).toContain('The ledger has a privacy projection')
    expect(src).toContain('Unknown is not healthy')
    expect(src).toContain('not a browser decision button')
    expect(src).toContain('First-party funnel events')
    expect(src).toContain('Request a pilot')
  })
})

describe('public SEO stays answer-free', () => {
  it('indexes only stable public routes in the sitemap', () => {
    const sitemap = source('app/sitemap.ts')
    for (const route of [
      '/platform',
      '/pilot',
      '/solutions',
      '/how-it-works',
      '/developers',
      '/security',
    ]) {
      expect(sitemap).toContain(route)
    }
    expect(sitemap).toContain('/home')
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

describe('pilot contact form stays honest and payload-free', () => {
  // Both the homepage and the pilot page render this component; reading either
  // page source sees only <ContactForm />, never the copy inside it.
  const contactForm = source('components/contact-form.tsx')

  it('carries no reply-time or service-level promise', () => {
    expect(contactForm).not.toMatch(/reply within|one business day|business day|same[- ]day|\bSLA\b|service-level/i)
    expect(contactForm).not.toContain('One reply, no list')
  })

  it('emits only allowlisted funnel names with no payload', () => {
    const calls = [...contactForm.matchAll(/track\(\{[^}]*\}\)/g)].map((match) => match[0])
    expect(calls).toEqual([
      "track({ event_type: 'pilot_form_started' })",
      "track({ event_type: 'pilot_form_submitted' })",
      "track({ event_type: 'pilot_requested' })",
      "track({ event_type: 'pilot_form_submission_failed' })",
    ])
    for (const name of [
      'pilot_form_started',
      'pilot_form_submitted',
      'pilot_requested',
      'pilot_form_submission_failed',
    ]) {
      expect(FUNNEL_EVENT_TYPES).toContain(name)
    }
    expect(contactForm).toContain('if (body.recorded === true)')
  })
})
