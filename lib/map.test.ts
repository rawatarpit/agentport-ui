import { describe, expect, it } from 'vitest'

import { parseInventory, propose, reconcile, slugFor, suggestKind } from './map.js'

/**
 * Frontend/backend mapping. Every test asserts a security-relevant outcome:
 * hostile pastes must fail closed, shadow routes must surface un-promoted,
 * and proposed names must be safe to become capability identifiers.
 */
describe('parseInventory', () => {
  it('refuses non-JSON with a reason, never a throw', () => {
    const r = parseInventory('this is not json {{{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/JSON/)
  })

  it('refuses JSON without an endpoint list', () => {
    expect(parseInventory('{"foo": 1}').ok).toBe(false)
  })

  it('accepts a bare array as well as the envelope shape', () => {
    expect(parseInventory('[{"method":"GET","path":"/a"}]').ok).toBe(true)
    expect(parseInventory('{"endpoints":[{"method":"GET","path":"/a"}]}').ok).toBe(true)
  })

  it('refuses absurd sizes before allocating', () => {
    const big = JSON.stringify({ endpoints: new Array(5001).fill({ method: 'GET', path: '/x' }) })
    const r = parseInventory(big)
    expect(r.ok).toBe(false)
  })
})

describe('reconcile', () => {
  it('sorts declared+hit, hit-only, and declared-only into their buckets', () => {
    const b = reconcile([
      { method: 'GET', path: '/a', provenance: ['discover'], liveHits: 3 },
      { method: 'POST', path: '/shadow', provenance: ['capture'], liveHits: 9 },
      { method: 'GET', path: '/old', provenance: ['discover'], liveHits: 0 },
    ])
    expect(b.corroborated.map((e) => e.path)).toEqual(['/a'])
    expect(b.undeclared.map((e) => e.path)).toEqual(['/shadow'])
    expect(b.unused.map((e) => e.path)).toEqual(['/old'])
    expect(b.dropped).toBe(0)
  })

  it('drops garbage rows and counts them instead of failing the batch', () => {
    const b = reconcile([
      { method: 'GET', path: '/a', provenance: ['discover'], liveHits: 1 },
      { method: 'BREW', path: '/a' },
      { method: 'GET', path: 'no-leading-slash' },
      { method: 'GET', path: '/b', liveHits: 0 },
    ])
    expect(b.corroborated).toHaveLength(1)
    expect(b.dropped).toBe(3)
  })

  it('treats an explicit declared flag as authoritative over provenance', () => {
    const b = reconcile([{ method: 'GET', path: '/a', declared: true, liveHits: 2 }])
    expect(b.corroborated).toHaveLength(1)
  })
})

describe('suggestKind + slugFor', () => {
  it('reads are GET/HEAD, everything else starts as write', () => {
    expect(suggestKind('GET')).toBe('read')
    expect(suggestKind('HEAD')).toBe('read')
    expect(suggestKind('POST')).toBe('write')
    expect(suggestKind('DELETE')).toBe('write')
  })

  it('derives stable readable slugs', () => {
    expect(slugFor('GET', '/products')).toBe('getProducts')
    expect(slugFor('POST', '/orders/:id/items')).toBe('postOrdersIdItems')
    expect(slugFor('DELETE', '/')).toBe('deleteRoot')
  })
})

describe('propose', () => {
  it('emits one proposal per endpoint with stable keys', () => {
    const b = reconcile([{ method: 'GET', path: '/a', provenance: ['discover'], liveHits: 1 }])
    const ps = propose(b)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ key: 'GET /a', name: 'getA', kind: 'read', bucket: 'corroborated' })
  })
})
