import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentDigest, tierForChange } from '@/lib/publish'

const P = (over: Record<string, unknown> = {}) => ({
  maxOrderValue: { minor: 25_000, currency: 'INR' },
  absoluteMaxOrderValue: { minor: 100_000, currency: 'INR' },
  bulkOrderThreshold: { units: 20 },
  alwaysRequireApproval: ['createOrder'],
  forbiddenCapabilities: ['requestRefund'],
  restrictedDataClasses: ['pii'],
  ...over,
})
const C = (...names: string[]) => names.map((name) => ({ name }))
const kindOf = (known: Record<string, 'read' | 'write'>) => (n: string) => known[n] ?? 'unknown'
const KINDS = kindOf({ searchProducts: 'read', checkInventory: 'read', createOrder: 'write', requestRefund: 'write' })

describe('tierForChange', () => {
  it('first publish is always typed — an unreviewed start is the riskiest change', () => {
    expect(tierForChange(null, { policy: P(), capabilities: C('searchProducts') }, KINDS)).toBe('typed')
  })
  it('narrowing is light: caps removed, ceilings lowered, forbiddens added', () => {
    const next = {
      policy: P({ maxOrderValue: { minor: 10_000, currency: 'INR' }, forbiddenCapabilities: ['requestRefund', 'createOrder'] }),
      capabilities: C('searchProducts'),
    }
    expect(
      tierForChange({ policy: P(), capabilities: C('searchProducts', 'createOrder') }, next, KINDS),
    ).toBe('light')
  })
  it('adding a write capability is typed', () => {
    expect(
      tierForChange({ policy: P(), capabilities: C('searchProducts') }, { policy: P(), capabilities: C('searchProducts', 'createOrder') }, KINDS),
    ).toBe('typed')
  })
  it('adding a read capability is light', () => {
    expect(
      tierForChange({ policy: P(), capabilities: C('searchProducts') }, { policy: P(), capabilities: C('searchProducts', 'checkInventory') }, KINDS),
    ).toBe('light')
  })
  it('raising any ceiling is typed', () => {
    const up = { ...P(), maxOrderValue: { minor: 50_000, currency: 'INR' } }
    expect(tierForChange({ policy: P(), capabilities: C() }, { policy: up, capabilities: C() }, KINDS)).toBe('typed')
  })
  it('removing an approval/forbidden/restriction is typed', () => {
    expect(
      tierForChange({ policy: P(), capabilities: C() }, { policy: P({ alwaysRequireApproval: [] }), capabilities: C() }, KINDS),
    ).toBe('typed')
    expect(
      tierForChange({ policy: P(), capabilities: C() }, { policy: P({ forbiddenCapabilities: [] }), capabilities: C() }, KINDS),
    ).toBe('typed')
  })
  it('granting a ceiling exemption is typed', () => {
    const up = { ...P(), ceilingExempt: ['searchProducts', 'createOrder'] }
    const base = { ...P(), ceilingExempt: ['searchProducts'] }
    expect(tierForChange({ policy: base, capabilities: C() }, { policy: up, capabilities: C() }, KINDS)).toBe('typed')
  })
  it('unknown capability kind fails toward typed', () => {
    expect(
      tierForChange({ policy: P(), capabilities: C() }, { policy: P(), capabilities: C('mysteryCap') }, KINDS),
    ).toBe('typed')
  })
  it('unknown policy keys fail toward typed', () => {
    const up = { ...P(), previewMode: true }
    expect(tierForChange({ policy: P(), capabilities: C() }, { policy: up, capabilities: C() }, KINDS)).toBe('typed')
  })
})

describe('contentDigest', () => {
  it('is key-order stable and content-sensitive', () => {
    const a = contentDigest({ b: 1, a: [1, { y: 2, x: 1 }] })
    expect(contentDigest({ a: [1, { x: 1, y: 2 }], b: 1 })).toBe(a)
    expect(contentDigest({ b: 2, a: [1, { y: 2, x: 1 }] })).not.toBe(a)
  })
})

describe('publish routes hold the boundaries', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = (p: string) => readFileSync(join(here, '..', 'app', 'api', 'publish', p, 'route.ts'), 'utf8')
  it('approve + artifact resolve owner/admin from the session, never service_role', () => {
    for (const p of ['approve', 'artifact']) {
      const s = src(p)
      expect(s, `${p} resolves role`).toContain('resolveCallerRole')
      expect(s, `${p} must not touch service_role`).not.toContain('service_role')
    }
    // Tiering lives at approve time; upload time gates on the approval row.
    expect(src('approve'), 'approve tier-gates').toContain('tierForChange')
    expect(src('artifact'), 'artifact demands prior approval').toContain('publish_approvals')
  })
  it('artifact intake refuses kill-switch cargo and demands prior approval', () => {
    const s = src('artifact')
    expect(s).toContain('emergencyKillSwitch')
    expect(s).toContain('publish_approvals')
    expect(s).toContain('policy_artifacts')
  })
})
