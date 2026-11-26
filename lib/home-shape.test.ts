import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural guards for the public front door. The homepage is prose, not a
 * data read, but it makes promises about the product. These tests catch the
 * ways a marketing page becomes a lie: claiming a measurement we do not have,
 * letting an illustrative panel read as a live record, or blurring draft,
 * approval and execution.
 */

// Read at test time, not at module load: a nav edit must be caught on the next run.
function currentSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

function homeSource(): string {
  return currentSource('app/home/page.tsx')
}

function siteNavSource(): string {
  return currentSource('components/site-nav.tsx')
}

/** A comment may mention a forbidden thing; only rendered source is evidence. */
function renderedSource(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Reads a const array without depending on placement, indentation or `as const`. */
function arrayBlockIn(source: string, constant: string): string {
  const declaration = source.match(new RegExp(`\\bconst\\s+${constant}\\b[\\s\\S]*?=\\s*\\[`))
  if (!declaration || declaration.index === undefined) return ''
  const open = declaration.index + declaration[0].length - 1
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1
    if (source[i] === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return ''
}

/** Parses object fields independently of field order or quote style. */
function objectsIn(source: string, constant: string): Record<string, string>[] {
  return [...arrayBlockIn(source, constant).matchAll(/\{([^{}]*)\}/g)].map((match) => {
    const fields: Record<string, string> = {}
    for (const field of match[1].matchAll(/([A-Za-z_$][\w$]*):\s*(['"`])([^'"`]*)\2/g)) {
      fields[field[1]] = field[3]
    }
    return fields
  })
}

/** Extracts a whole section, including nested <section> elements. */
function sectionById(source: string, id: string): string {
  const start = source.indexOf(`<section id="${id}"`)
  if (start === -1) return ''
  let depth = 0
  let cursor = start
  while (cursor < source.length) {
    const nextOpen = source.indexOf('<section', cursor)
    const nextClose = source.indexOf('</section>', cursor)
    if (nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen)) {
      depth -= 1
      cursor = nextClose + '</section>'.length
      if (depth === 0) return source.slice(start, cursor)
    } else if (nextOpen !== -1) {
      depth += 1
      cursor = nextOpen + '<section'.length
    } else {
      return ''
    }
  }
  return ''
}

function faqAnswer(source: string, question: RegExp): string {
  return objectsIn(source, 'FAQ').find((item) => question.test(item.q ?? ''))?.a ?? ''
}

describe('homepage positioning stays honest', () => {
  it('leads with the AI agent economy narrative, not a governance-only category', () => {
    const home = homeSource()
    const title = home.match(/export const metadata[\s\S]*?\btitle:\s*'([^']+)'/)?.[1] ?? ''
    expect(title).toMatch(/infrastructure for the ai agent economy/i)
    const pillars = objectsIn(home, 'PILLARS')
    expect(pillars.map((pillar) => pillar.name)).toEqual(['Intelligence', 'Access', 'Control'])
    expect(pillars.map((pillar) => pillar.promise?.toLowerCase())).toEqual([
      'understand the shift',
      'enable access',
      'retain control',
    ])
  })

  it('states that publishing is advisory and promises no universal discovery', () => {
    const home = homeSource()
    const access = objectsIn(home, 'PILLARS').find((pillar) => pillar.name === 'Access')?.body ?? ''
    expect(access).toMatch(/grants no permission/i)
    expect(access).toMatch(/does not guarantee discovery/i)
    const answer = faqAnswer(home, /visible in ChatGPT or every other assistant/i)
    expect(answer).toMatch(/^No\./)
    expect(answer).toMatch(/compatible clients/i)
    expect(answer).toMatch(/manifest is advisory/i)
  })

  it('states that AI search visibility is not measured', () => {
    const answer = faqAnswer(homeSource(), /traffic came from AI search/i)
    expect(answer).toMatch(/does not measure AI search visibility/i)
    expect(answer).toMatch(/AI-generated (traffic|demand)/i)
  })

  it('states GET preparation and human confirmation before a governed write', () => {
    const boundary =
      objectsIn(homeSource(), 'BOUNDARIES').find((item) => item.title === 'Human confirmation')?.body ?? ''
    expect(boundary).toMatch(/prepared with GET/i)
    expect(boundary).toMatch(/confirmed by a person/i)
    expect(boundary).toMatch(/before a governed write/i)
  })

  it('states the kill switch scope and that a publish cannot clear it', () => {
    const control = objectsIn(homeSource(), 'CONTROLS').find((item) => item.title === 'Kill switch')?.body ?? ''
    expect(control).toMatch(/stop agent-initiated writes/i)
    expect(control).toMatch(/reads audit-only/i)
    expect(control).toMatch(/website and APIs keep running/i)
    expect(control).toMatch(/cannot be cleared by a publish/i)
  })

  it('states that an unheard ledger is unknown, not a healthy zero', () => {
    const visibility = sectionById(homeSource(), 'visibility')
    expect(visibility).toMatch(/row-level security/i)
    expect(visibility).toMatch(/your own tenant/i)
    expect(visibility).toMatch(/no push, the answer is unknown — not zero/i)
  })

  it('does not present invented figures or testimonials as facts', () => {
    const prose = renderedSource(homeSource())
    expect(prose).not.toMatch(/<blockquote\b/i)
    expect(prose).not.toMatch(/\b\d+(?:\.\d+)?\s*%/)
    expect(prose).not.toMatch(/\b(?:trusted by|our customers say|case study)\b/i)
    const landscape = sectionById(prose, 'landscape')
    expect(landscape).toMatch(/flagged fictional sample/i)
    expect(landscape).toMatch(/invented for interface review/i)
  })

  it('keeps planned capabilities out of the available-now surfaces', () => {
    const home = homeSource()
    const visibility = sectionById(home, 'visibility')
    const plannedAt = visibility.indexOf('Planned — not available today')
    expect(plannedAt).toBeGreaterThan(-1)
    const availableAt = [...visibility.matchAll(/Available now/g)].map((match) => match.index ?? -1)
    expect(availableAt.length).toBeGreaterThan(0)
    expect(availableAt.every((index) => index < plannedAt)).toBe(true)
    expect(visibility.slice(plannedAt)).toMatch(/Longer retention, exports, alerting and multi-site views/i)
    const faq = faqAnswer(home, /planned but not available today/i)
    expect(faq).toMatch(/planned, not shipped/i)
  })
})

describe('homepage approvals stay in the hosted path', () => {
  it('states that an approval decision is not proof of execution', () => {
    const home = homeSource()
    const answer = faqAnswer(home, /Does an approval mean the action succeeded/i)
    expect(answer).toMatch(/decision is not proof that the downstream call (?:worked|succeeded)/i)
    expect(home).toMatch(/A held request has not run/i)
    expect(home).toMatch(/A decision is not proof that the downstream call succeeded/i)
  })

  it('exposes no browser approval control on the public page', () => {
    const prose = renderedSource(homeSource())
    expect(prose).not.toMatch(/<button\b/i)
    expect(prose).not.toMatch(/onClick\s*=/i)
    expect(prose).not.toMatch(/href=["'][^"']*approv/i)
    expect(prose).toMatch(/hosted path where the credential lives/i)
    expect(prose).toMatch(/no browser approve button/i)
  })

  it('keeps the custody ladder and the never-persisted list', () => {
    const home = homeSource()
    const trust = sectionById(home, 'trust')
    expect(trust).toMatch(/Shared tier — payloads in transit/i)
    expect(trust).toMatch(/Enterprise tier — aggregates only/i)
    expect(trust).toMatch(/Never persisted in either tier: CVV, passwords, API keys, raw credentials/i)
    expect(home).toMatch(/does not replace your authentication or your security infrastructure/i)
  })
})

describe('homepage illustrative surfaces are labelled and bounded', () => {
  it('labels decision and activity panels as illustrative', () => {
    const home = homeSource()
    expect(home).toMatch(/aria-label="Example policy decisions — illustrative values"/)
    expect(home).toMatch(/Illustrative — not your data/)
    expect(home).toMatch(/An illustrative activity record/)
    expect(home).toMatch(/>\s*Illustrative\s*</)
  })

  it('selects no amount or personal-data column in the activity table', () => {
    const home = homeSource()
    const headers = [...home.matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map((match) => match[1].trim().toLowerCase())
    const safeColumns = new Set([
      'time',
      'agent',
      'capability',
      'decision',
      'reason',
      'outcome',
      'result',
      'rule',
      'approval',
    ])
    expect(headers.length).toBeGreaterThan(0)
    expect(headers.every((header) => safeColumns.has(header))).toBe(true)
    const rowFields = Object.keys(objectsIn(home, 'AUDIT_ROWS')[0] ?? {})
    expect(rowFields.length).toBeGreaterThan(0)
    for (const fields of [headers.join(' '), rowFields.join(' ')]) {
      expect(fields).not.toMatch(/amount|price|total|payment|email|parameter|detail|error/i)
    }
    expect(home).toMatch(/console view omits parameters and order values/i)
  })

  it('states the draft and unknown boundaries in the footer', () => {
    const home = homeSource()
    const footer = home.slice(home.indexOf('<footer'))
    expect(footer).toMatch(/Draft is never live/i)
    expect(footer).toMatch(/unknown is never healthy/i)
  })
})

describe('homepage navigation does not drift from the public site', () => {
  it('mirrors every shared navigation destination and label', () => {
    const homeEntries = objectsIn(homeSource(), 'PUBLIC_LINKS').map(({ href, label }) => ({ href, label }))
    const siteEntries = objectsIn(siteNavSource(), 'LINKS').map(({ href, label }) => ({ href, label }))
    expect(siteEntries.length).toBeGreaterThan(0)
    expect(siteEntries.every((entry) => entry.href && entry.label)).toBe(true)
    expect(homeEntries).toEqual(siteEntries)
  })

  it('parses nav declarations despite harmless formatting changes', () => {
    const reformatted =
      'const LINKS: ReadonlyArray<{ href: string; label: string }> = [\n  { label: "Home", href: "/home" },\n]'
    expect(objectsIn(reformatted, 'LINKS')).toEqual([{ label: 'Home', href: '/home' }])
  })

  it('uses the exact public IA in both navigation surfaces', () => {
    const expected = [
      { href: '/home', label: 'Home' },
      { href: '/intelligence', label: 'Intelligence' },
      { href: '/solutions', label: 'Solutions' },
      { href: '/platform', label: 'Platform' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/developers', label: 'Developers' },
      { href: '/security', label: 'Security' },
    ]
    const homeEntries = objectsIn(homeSource(), 'PUBLIC_LINKS').map(({ href, label }) => ({ href, label }))
    const siteEntries = objectsIn(siteNavSource(), 'LINKS').map(({ href, label }) => ({ href, label }))
    expect(homeEntries).toEqual(expected)
    expect(siteEntries).toEqual(expected)
  })

  it('mirrors the same utility and conversion CTAs in both navigation surfaces', () => {
    for (const [name, source] of [
      ['homepage', homeSource()],
      ['shared nav', siteNavSource()],
    ] as const) {
      expect(source, name).toContain('href="/login"')
      expect(source, name).toContain('Sign in')
      expect(source, name).toContain('href="/signup"')
      expect(source, name).toContain('Get started')
      expect(source, name).toContain('href="/pilot"')
      expect(source, name).toContain('Request a pilot')
      expect(source, name).not.toContain('Create account')
      expect(source, name).not.toContain('Industry AI intelligence')
    }
  })

  it('makes the hero pilot request the primary tracked conversion', () => {
    const home = homeSource()
    expect(home).toMatch(
      /<TrackedCta[^>]*href="\/pilot"[^>]*event="hero_primary_cta_clicked"[\s\S]*?Request a pilot[\s\S]*?<\/TrackedCta>/,
    )
    expect(home).toMatch(
      /<TrackedCta[^>]*href="\/intelligence"[^>]*event="hero_demo_cta_clicked"[\s\S]*?Explore the industry preview[\s\S]*?<\/TrackedCta>/,
    )
  })

  it('carries no pilot timing or service-level promise', () => {
    const prose = renderedSource(homeSource())
    expect(prose).not.toMatch(/reply within|same-day|business day|\bSLA\b|service-level/i)
  })
})
