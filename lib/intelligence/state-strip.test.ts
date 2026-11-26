import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveIntelligenceState, toneClass } from './state-meta'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const strip = readFileSync(join(root, 'components/intel/state-strip.tsx'), 'utf8')
const metaSource = readFileSync(join(root, 'lib/intelligence/state-meta.ts'), 'utf8')
const reportView = readFileSync(join(root, 'components/intel/report-view.tsx'), 'utf8')
const savedPage = readFileSync(join(root, 'app/(app)/insights/saved/[id]/page.tsx'), 'utf8')

const metaBlock = metaSource.slice(metaSource.indexOf('export const META'), metaSource.indexOf('export function toneClass'))

function states(): Array<{ key: string; label: string; tone: string }> {
  const matches = [...metaBlock.matchAll(/^\s{2}(\w+):\s*\{\s*label:\s*'([^']+)'\s*,\s*tone:\s*'([^']+)'/gm)]
  // The regex captures exactly these three groups for every match.
  return matches.map((match) => ({ key: match[1]!, label: match[2]!, tone: match[3]! }))
}

describe('intelligence state strip', () => {
  it('accepts exactly the reviewed status vocabulary', () => {
    expect(states().map((state) => state.key).sort()).toEqual(
      [
        'unresearched',
        'illustrative',
        'sourced',
        'unavailable',
        'not_configured',
        'partial',
        'failed',
        'loading',
        'refreshing',
      ].sort(),
    )
  })

  it('resolves only known string states and renders nothing for null or unmapped values', () => {
    expect(resolveIntelligenceState('sourced')).toBe('sourced')
    expect(resolveIntelligenceState('ready')).toBeNull()
    expect(resolveIntelligenceState('toString')).toBeNull()
    expect(resolveIntelligenceState(null)).toBeNull()
    expect(resolveIntelligenceState(0)).toBeNull()
  })

  it('never paints a healthy tone, a ready label, or a fabricated zero', () => {
    for (const state of states()) {
      expect(state.label, state.key).not.toMatch(/ready|green|zero|healthy|live/i)
      expect(state.tone, state.key).not.toMatch(/good|green/)
    }
    expect(strip).not.toMatch(/\?\s*0\b|>0<|\bzero\b/i)
    expect(toneClass('blue')).not.toMatch(/verdant|good|green/i)
    expect(toneClass('blue')).toContain('text-bone')
  })

  it('says an engine is not connected rather than claiming a healthy result', () => {
    const unavailable = states().filter((state) => ['unavailable', 'not_configured'].includes(state.key))
    expect(unavailable).toHaveLength(2)
    for (const state of unavailable) {
      expect(state.tone).toBe('neutral')
      expect(metaBlock).toContain("detail: 'No intelligence engine is connected. Results remain unknown.'")
    }
  })

  it('renders the stored report dataMode, never a regenerated state', () => {
    expect(reportView).toContain('<IntelligenceStateStrip state={report.dataMode} />')
    expect(savedPage).toContain('<ReportView report={row.report} sampleLabel="" />')
    expect(savedPage).not.toMatch(/dataMode:|buildSampleReport/)
  })
})
