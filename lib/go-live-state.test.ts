import { describe, expect, it } from 'vitest'
import { deriveGoLiveState, type GoLiveInputs } from '@/lib/go-live-state'

const base: GoLiveInputs = {
  tenantId: 'tenant-1',
  businessName: 'Acme',
  role: 'owner',
  siteUrl: null,
  drafts: { setup: false, rules: false, capabilities: false },
  draftMapped: 0,
  inventoryCount: 0,
  installations: [],
  pullRequests: [],
  merged: false,
  liveArtifact: null,
}

const installation = {
  installationId: 177742314,
  accountLogin: 'acme',
  installerLogin: 'acme-owner',
  receivedAt: '2026-11-02T00:00:00.000Z',
}

const pullRequest = {
  repo: 'acme/site',
  number: 1,
  url: 'https://github.com/acme/site/pull/1',
  branch: 'agentport/install',
  installationId: 177742314,
  recordedAt: '2026-11-02T00:00:00.000Z',
}

function stateOf(overrides: Partial<GoLiveInputs> = {}) {
  return deriveGoLiveState({ ...base, ...overrides })
}

function stepState(input: ReturnType<typeof stateOf>, id: string) {
  return input.steps.find((s) => s.id === id)?.state
}

describe('deriveGoLiveState', () => {
  it('starts at the site address and keeps publish blocked', () => {
    const s = stateOf()
    expect(s.phase).toBe('not-started')
    expect(s.nextStep?.id).toBe('site')
    expect(stepState(s, 'site')).toBe('current')
    expect(stepState(s, 'capabilities')).toBe('blocked')
    expect(stepState(s, 'publish')).toBe('blocked')
  })

  it('moves to map once a site exists, never inventing capabilities', () => {
    const s = stateOf({ siteUrl: 'https://acme.example' })
    expect(s.nextStep?.id).toBe('capabilities')
    expect(stepState(s, 'capabilities')).toBe('current')
    expect(stepState(s, 'rules')).toBe('blocked')
  })

  it('does not gate publish on GitHub or a merged PR', () => {
    const s = stateOf({
      siteUrl: 'https://acme.example',
      draftMapped: 2,
      drafts: { setup: true, rules: false, capabilities: true },
    })
    expect(s.nextStep?.id).toBe('github')
    expect(stepState(s, 'github')).toBe('current')
    expect(stepState(s, 'publish')).toBe('current')

    const merged = stateOf({
      siteUrl: 'https://acme.example',
      draftMapped: 2,
      drafts: { setup: true, rules: false, capabilities: true },
      installations: [installation],
      pullRequests: [pullRequest],
      merged: true,
    })
    expect(stepState(merged, 'publish')).toBe('current')
  })

  it('marks verify as the next action once an artifact is stored', () => {
    const s = stateOf({
      siteUrl: 'https://acme.example',
      draftMapped: 2,
      drafts: { setup: true, rules: false, capabilities: true },
      installations: [installation],
      pullRequests: [pullRequest],
      merged: true,
      liveArtifact: { version: 3, publishedAt: '2026-11-02T00:00:00.000Z' },
    })
    expect(s.published).toBe(true)
    expect(s.phase).toBe('live')
    expect(stepState(s, 'publish')).toBe('done')
    expect(stepState(s, 'verify')).toBe('current')
    expect(s.nextStep?.id).toBe('verify')
  })

  it('counts approved inventory but refuses to call a cleared draft publishable', () => {
    const s = stateOf({ siteUrl: 'https://acme.example', inventoryCount: 4, drafts: { setup: true, rules: false, capabilities: false } })
    expect(s.mappedCount).toBe(4)
    expect(s.draftMapped).toBe(0)
    expect(s.publishable).toBe(false)
    expect(stepState(s, 'capabilities')).toBe('current')
    expect(stepState(s, 'publish')).toBe('blocked')
  })

  it('sends a manual-installer publish to verify, not back to GitHub', () => {
    const s = stateOf({
      siteUrl: 'https://acme.example',
      draftMapped: 2,
      drafts: { setup: true, rules: false, capabilities: true },
      liveArtifact: { version: 1, publishedAt: '2026-11-02T00:00:00.000Z' },
    })
    expect(s.installations).toEqual([])
    expect(s.pullRequests).toEqual([])
    expect(s.phase).toBe('live')
    expect(s.nextStep?.id).toBe('verify')
  })
})
