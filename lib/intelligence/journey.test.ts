import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const exists = (path: string): boolean => existsSync(join(ROOT, path))
const contains = (source: string, phrase: string): boolean =>
  source.replace(/\s+/g, ' ').includes(phrase.replace(/\s+/g, ' '))

const intelligence = read('app/(site)/intelligence/page.tsx')
const form = read('components/intel/intel-form.tsx')
const journey = read('components/intel/answer-journey.tsx')
const steps = read('components/intel/intel-form.tsx')
const coverage = read('components/intel/report-coverage.tsx')
const report = read('app/(site)/intelligence/report/page.tsx')
const loading = read('app/(site)/intelligence/report/loading.tsx')
const home = read('app/(site)/home/page.tsx')
const funnel = read('app/(app)/funnel/page.tsx')
const nav = read('components/site-nav.tsx')
const layout = read('app/(site)/layout.tsx')
const middleware = read('middleware.ts')
const sitemap = read('app/sitemap.ts')

describe('intelligence answer journey is stated at the point of disclosure', () => {
  it('keeps a compact disclosure in the final form step and on the report', () => {
    expect(form).toContain('<AnswerJourney />')
    expect(report).toContain('<AnswerJourney />')
    expect(intelligence).toContain('id="preview-form"')
    expect(intelligence).not.toContain('<AnswerJourney />')
    expect(intelligence).not.toContain('id="answer-journey"')
  })

  it('presents the profile as a minimal stepped form without fake research progress', () => {
    expect(form).toContain('const STEPS = [')
    expect(form).toContain('<FormPhaseRail step={step} total={STEPS.length} />')
    expect(form).toContain('onClick={handleNext}')
    expect(form).toContain('onClick={handleBack}')
    expect(form).toContain('<button key="continue" type="button"')
    expect(form).toContain('<button key="submit" type="submit"')
    expect(form).toContain('hidden={step !==')
    expect(form).not.toMatch(/progress\s*(?:bar|%)|\d+%/)
  })

  it('states the actual destinations without claiming no data leaves the browser', () => {
    expect(contains(journey, 'GET form puts your answers in the report URL')).toBe(true)
    expect(contains(journey, 'edit, revisit and signup links carry them too')).toBe(true)
    expect(contains(journey, 'World Bank dataset on our server')).toBe(true)
    expect(contains(journey, 'SEC ticker list')).toBe(true)
    expect(contains(journey, 'GitHub public repository search term')).toBe(true)
    expect(contains(journey, 'leaving it blank makes the public preview skip the SEC lookup')).toBe(true)
    expect(contains(journey, 'your industry answer is used for that local match')).toBe(false)
    expect(
      contains(
        journey,
        'Website, objective, business model and customer segment are not sent to those three providers',
      ),
    ).toBe(true)
  })

  it('narrows persistence and telemetry claims to what the code does', () => {
    expect(contains(journey, 'saves no profile or report rows')).toBe(true)
    expect(contains(journey, 'allowlisted event name, the page pathname with no query string')).toBe(true)
    expect(contains(journey, 'tenant-scoped report snapshot')).toBe(true)
    expect(contains(journey, 'only if you save them there')).toBe(true)
    expect(contains(journey, 'not set as your discovery origin')).toBe(true)
    expect(journey).not.toContain('nothing leaves')
  })

  it('links the disclosure to a section that exists on the public home page', () => {
    expect(journey).toContain('href="/home#how"')
    expect(home).toContain('<section id="how"')
  })

  it('keeps one tracked hero demo emitter', () => {
    expect([...home.matchAll(/event="hero_demo_cta_clicked"/g)]).toHaveLength(1)
  })

  it('adds an honest submit state without a fake progress claim', () => {
    expect(form).toContain('const [submitting, setSubmitting] = useState(false)')
    expect(form).toContain('onSubmit={() => setSubmitting(true)}')
    expect(form).toContain('aria-busy={submitting}')
    expect(form).toContain('Opening your report…')
    expect(form).not.toMatch(/progress\s*(?:bar|%)|\d+%/)
  })

  it('shows a server-side pending route with no timer or completion claim', () => {
    expect(loading).toContain('Reading public sources…')
    expect(loading).toContain('This is a server render, not a progress estimate')
    expect(loading).not.toMatch(/progress\s*(?:bar|%)|\d+%|setTimeout|setInterval/)
  })
})

describe('report arrival shows request-time evidence coverage', () => {
  it('derives coverage from the rendered report, not a second request', () => {
    expect(report).toContain('<RequestCoverage report={report} />')
    expect(coverage).toContain('export function RequestCoverage')
    expect(coverage).not.toMatch(/\bfetch\s*\(/)
    expect(coverage).toContain('kind !== \'sample\'')
  })

  it('renders absence as none or unknown, never a healthy zero', () => {
    expect(coverage).toContain("sources.length === 0 ? 'none' : String(sources.length)")
    expect(coverage).toContain('Unknown')
    expect(coverage).toContain('Computed from this request')
    expect(coverage).toContain('No AI traffic or search visibility measurement')
  })
})

describe('public pilot and fee surfaces are removed', () => {
  it('removes the pilot route and the pilot contact write path', () => {
    expect(exists('app/(site)/pilot/page.tsx')).toBe(false)
    expect(exists('app/api/contact/route.ts')).toBe(false)
    expect(exists('components/contact-form.tsx')).toBe(false)
  })

  it('removes pilot and fee wording from public navigation and pages', () => {
    for (const [name, source] of [
      ['home', home],
      ['intelligence', intelligence],
      ['nav', nav],
      ['layout', layout],
      ['middleware', middleware],
      ['sitemap', sitemap],
    ] as const) {
      expect(source, name).not.toContain('/pilot')
      expect(source, name).not.toMatch(/founding pilot/i)
      expect(source, name).not.toMatch(/₹0|no agentport fee/i)
    }
  })

  it('renders FAQ once and answers where the answers go', () => {
    expect([...home.matchAll(/<section id="faq"/g)]).toHaveLength(1)
    expect(home).toContain('Where do my company answers go when I use this preview?')
    expect(home).toContain('Is this a live report about my company?')
  })

  it('marks retained pilot funnel labels as history with no live emitter', () => {
    for (const block of funnel.matchAll(/\b(pilot_[a-z_]+):\s*\{([\s\S]*?)\n  \}/g)) {
      expect(block[1]).toMatch(/^pilot_/)
      expect(block[2]).toContain('historical')
      expect(block[2]).toContain('no new events are emitted')
    }
    expect(funnel).toContain('pilot requests before the public pilot path was removed, preview starts after')
  })
})
