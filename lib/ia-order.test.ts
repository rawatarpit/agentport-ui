import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

describe('information architecture is clear without weakening truth', () => {
  const overview = read('app/(app)/page.tsx')
  const proof = read('app/(app)/proof/page.tsx')
  const reportView = read('components/intel/report-view.tsx')
  const reportPage = read('app/(site)/intelligence/report/page.tsx')
  const home = read('app/(site)/home/page.tsx')
  const layout = read('app/(app)/layout.tsx')
  const form = read('components/intel/intel-form.tsx')
  const phase = read('components/intel/form-phase-rail.tsx')
  const analytics = read('app/(app)/analytics/page.tsx')
  const served = read('components/proof/proof-served-manifest.tsx')
  const sidebar = read('components/sidebar.tsx')
  const breadcrumbs = read('components/ui/breadcrumbs.tsx')

  it('makes Overview a single state story with one next action', () => {
    expect(overview.indexOf('<StateStrip')).toBeLessThan(overview.indexOf('<Stat\n'))
    expect(overview).toContain('<SectionIndex')
    expect(overview).not.toMatch(/text-slate-/)
    expect([...overview.matchAll(/label="Published version"/g)]).toHaveLength(0)
    expect([...overview.matchAll(/term: 'Published version'/g)]).toHaveLength(1)
  })

  it('keeps Proof facts separate while giving them anchors', () => {
    for (const id of ['applied-config', 'live-push', 'recorded-decisions']) {
      expect(proof).toContain(`id="${id}"`)
    }
    expect(served).toContain('id="served-manifest"')
    expect(proof).toContain('<SectionIndex')
    expect(proof).toContain('An applied version is not a served manifest.')
  })

  it('puts the report title before arrival evidence', () => {
    expect(reportPage).toContain('arrival={')
    expect(reportView).toContain('arrival?: ReactNode')
    expect(reportView.indexOf('<header')).toBeLessThan(reportView.indexOf('{arrival}'))
    expect(reportView).toContain('<VisualisationCoverage report={report} />')
  })

  it('adds a public page map without changing the public navigation contract', () => {
    expect(home).toContain('<JumpNav')
    for (const id of ['landscape', 'opportunity', 'how', 'controls', 'visibility', 'trust', 'start']) {
      expect(home).toContain(`id="${id}"`)
    }
  })

  it('mounts breadcrumbs once and keeps dynamic labels free of tenant data', () => {
    expect([...layout.matchAll(/<Breadcrumbs \/>/g)]).toHaveLength(1)
    expect(breadcrumbs).toContain("pathname.match(/^\\/approvals\\/confirm\\/[^/]+$/)")
    expect(breadcrumbs).toContain("return 'Confirmation reference'")
    expect(breadcrumbs).toContain("return 'Saved report'")
    expect(breadcrumbs).not.toMatch(/\bfetch\s*\(|process\.env|createClient|service_role|tenantId/)
  })

  it('renders the console navigation from one source of truth', () => {
    expect(sidebar).toContain("import { CONSOLE_NAV, sectionForPath } from '@/lib/console-nav'")
    expect(sidebar).toContain('CONSOLE_NAV.map((group) =>')
    expect(sidebar).not.toMatch(/const GROUPS\s*=/)
  })

  it('keeps every in-page anchor target present', () => {
    const homeAnchors = [...home.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!)
    for (const anchor of homeAnchors) {
      expect([...home.matchAll(new RegExp(`id="${anchor}"`, 'g'))], anchor).toHaveLength(1)
    }
    const proofAnchors = [
      ...proof.matchAll(/href="#([^"]+)"/g),
      ...served.matchAll(/href="#([^"]+)"/g),
    ].map((match) => match[1]!)
    const proofSource = `${proof}\n${served}`
    for (const anchor of proofAnchors) {
      expect([...proofSource.matchAll(new RegExp(`id="${anchor}"`, 'g'))], anchor).toHaveLength(1)
    }
  })

  it('keeps empty or failed overview reads neutral and honest', () => {
    expect(overview).toContain("const holdTone = holdsRead.failed || holdsRead.rows.length === 0 ? 'unknown' : 'blocked'")
    expect(overview).toContain("const pushTone = 'unknown'")
    expect(overview).toContain("const pushValue = decisionsRead.failed || decisionsRead.rows.length === 0 ? 'unknown'")
    expect(overview).toContain('No push heard yet — unknown, not healthy.')
    expect(overview).toContain('The approval queue could not be read. Unknown, not zero.')
    expect(overview).toContain('Applied config is not proof the governor serves it.')
    expect(overview).toContain('An empty window is unknown, not zero.')
    expect([...overview.matchAll(/Next honest step/g)]).toHaveLength(1)
    expect(analytics.replace(/\s+/g, ' ')).toContain(
      'An empty window is not proof that nothing ran, and a failed read stays unknown.',
    )
  })

  it('labels form phases as form work, not research progress', () => {
    expect(form).toContain('<FormPhaseRail step={step} total={STEPS.length} />')
    expect(phase).toContain('Context')
    expect(phase).toContain('Intent')
    expect(phase).toContain('Review')
    expect(phase).toContain("phase === 'Intent' ? 4")
    expect(form).not.toMatch(/progress\s*(?:bar|%)|\d+%/)
  })

  it('removes the stale local-runtime ledger story from Evidence', () => {
    expect(analytics).not.toMatch(/lives in your database|Keep it if you stop paying us/)
    expect(analytics).toContain('hosted governor&apos;s ledger projection')
  })
})
