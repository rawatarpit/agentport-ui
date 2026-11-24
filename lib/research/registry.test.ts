import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { getResearchProvider, listResearchProviders } from './registry.js'
import { RESEARCH_CATEGORIES } from './types.js'

const CHECKED_AT = '2026-11-23T09:00:00.000Z'

describe('static research provider registry', () => {
  it('declares exactly six slots, one per category, with unique ids and names', () => {
    const providers = listResearchProviders()
    expect(providers).toHaveLength(6)
    const categories = providers.flatMap((provider) => provider.capabilities.map((c) => c.category))
    expect([...categories].sort()).toEqual([...RESEARCH_CATEGORIES].sort())
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(6)
    expect(new Set(providers.map((provider) => provider.name)).size).toBe(6)
    for (const provider of providers) {
      expect(provider.version).toBeTruthy()
      expect(provider.capabilities[0].evidenceTypes.length).toBeGreaterThan(0)
    }
  })

  it('reports explicit unavailability with a caller-supplied checkedAt', () => {
    for (const provider of listResearchProviders()) {
      expect(provider.status({ checkedAt: CHECKED_AT })).toEqual({
        state: 'unavailable',
        reason: 'not_configured',
        checkedAt: CHECKED_AT,
      })
    }
  })

  it('accepts an injected clock and never claims availability', () => {
    const clock = () => new Date('2026-06-01T12:00:00.000Z')
    for (const provider of listResearchProviders()) {
      const status = provider.status({ clock })
      expect(status.state).toBe('unavailable')
      expect(status.checkedAt).toBe('2026-06-01T12:00:00.000Z')
      expect(provider.collect).toBeUndefined()
    }
  })

  it('resolves a known slot and returns null for an unknown one', () => {
    const first = listResearchProviders()[0]!
    expect(getResearchProvider(first.id)).toBe(first)
    expect(getResearchProvider('no-such-provider')).toBeNull()
  })

  it('contains no network, storage or secret access in its own source', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'registry.ts'), 'utf8')
    expect(source).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|process\s*\.\s*env|service_role|NEXT_PUBLIC_|createClient|node:fs|writeFile|localStorage|api[_-]?key/i,
    )
  })
})
