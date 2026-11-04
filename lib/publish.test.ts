import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalArtifactBytes,
  contentDigest,
  publicBaseUrlProblem,
  stableStringify,
  tierForChange,
  verifySignedArtifact,
  type SignedArtifact,
} from '@/lib/publish'

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

describe('publicBaseUrlProblem', () => {
  const tenant = 'f4d7c3e1-34a4-4e78-8dfd-97f80399b055'
  const hosted = `https://governor.agentport.relayforge.in/t/${tenant}`
  it('accepts the tenant-scoped hosted URL with or without a trailing slash', () => {
    expect(publicBaseUrlProblem(hosted, tenant)).toBeNull()
    expect(publicBaseUrlProblem(`${hosted}/`, tenant)).toBeNull()
  })
  it('requires the value: activation succeeds but the worker refuses to boot without it', () => {
    expect(publicBaseUrlProblem(undefined, tenant)).toContain('required')
    expect(publicBaseUrlProblem('', tenant)).toContain('required')
  })
  it('refuses a different tenant path or a base origin with no tenant path', () => {
    expect(publicBaseUrlProblem('https://governor.agentport.relayforge.in', tenant)).toContain(`/t/${tenant}`)
    expect(publicBaseUrlProblem('https://governor.agentport.relayforge.in/t/someone-else', tenant)).toContain(`/t/${tenant}`)
  })
  it('refuses cleartext, credentials, query strings and fragments', () => {
    expect(publicBaseUrlProblem(`http://governor.agentport.relayforge.in/t/${tenant}`, tenant)).toContain('https')
    expect(publicBaseUrlProblem(`https://user:pass@governor.agentport.relayforge.in/t/${tenant}`, tenant)).toContain('credentials')
    expect(publicBaseUrlProblem(`${hosted}?x=1`, tenant)).toContain('query')
    expect(publicBaseUrlProblem(`${hosted}#x`, tenant)).toContain('fragment')
  })
})

describe('contentDigest', () => {
  it('is key-order stable and content-sensitive', () => {
    const a = contentDigest({ b: 1, a: [1, { y: 2, x: 1 }] })
    expect(contentDigest({ a: [1, { x: 1, y: 2 }], b: 1 })).toBe(a)
    expect(contentDigest({ b: 2, a: [1, { y: 2, x: 1 }] })).not.toBe(a)
  })
})

describe('signed artifact verification', () => {
  const artifact: SignedArtifact = {
    tenantId: 'f4d7c3e1-34a4-4e78-8dfd-97f80399b055',
    version: 3,
    policy: { b: 2, a: [1, { y: 2, x: 1 }] },
    capabilities: [{ name: 'searchProducts' }],
    publicBaseUrl: 'https://governor.agentport.relayforge.in/t/f4d7c3e1-34a4-4e78-8dfd-97f80399b055',
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const signature = sign(null, Buffer.from(canonicalArtifactBytes(artifact), 'utf8'), privateKeyPem).toString('base64')

  it('matches the SDK canonical form: sorted keys, absent optionals omitted', () => {
    expect(
      stableStringify({ tenantId: 't', version: 1, policy: { b: 2, a: [1, { y: 2, x: 1 }] }, capabilities: [{ name: 'search' }] }),
    ).toBe('{"capabilities":[{"name":"search"}],"policy":{"a":[1,{"x":1,"y":2}],"b":2},"tenantId":"t","version":1}')
    expect(canonicalArtifactBytes({ ...artifact, baseUrl: undefined })).not.toContain('baseUrl')
  })

  it('accepts a merchant signature over the exact bytes', () => {
    const result = verifySignedArtifact(
      { artifact, signature, publicKey: publicKeyPem },
      { expectedTenantId: artifact.tenantId },
    )
    expect(result.ok).toBe(true)
  })

  it('refuses a different tenant, a tampered policy, and a different key', () => {
    expect(
      verifySignedArtifact({ artifact, signature, publicKey: publicKeyPem }, { expectedTenantId: 'another-tenant' }),
    ).toEqual({ ok: false, reason: 'artifact is for another tenant' })
    expect(
      verifySignedArtifact(
        { artifact: { ...artifact, policy: { ...artifact.policy, a: [1, { x: 1, y: 99 }] } }, signature, publicKey: publicKeyPem },
        { expectedTenantId: artifact.tenantId },
      ),
    ).toEqual({ ok: false, reason: 'signature does not verify against the envelope key' })
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(
      verifySignedArtifact({ artifact, signature, publicKey: other }, { expectedTenantId: artifact.tenantId }),
    ).toEqual({ ok: false, reason: 'signature does not verify against the envelope key' })
  })

  it('refuses kill-switch cargo before verifying anything', () => {
    expect(
      verifySignedArtifact({
        artifact: { ...artifact, policy: { ...artifact.policy, emergencyKillSwitch: true } },
        signature,
        publicKey: publicKeyPem,
      }),
    ).toEqual({ ok: false, reason: 'artifact carries the kill switch — refused' })
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
  it('approval and inventory commit through one atomic RPC', () => {
    const s = src('approve')
    expect(s).toContain('agentport_record_publish_approval')
    expect(s, 'inventory must not be written outside the RPC').not.toContain(".from('agent_capabilities')")
  })
  it('artifact intake refuses kill-switch cargo, verifies the signature, and honors the key pin', () => {
    const s = src('artifact')
    expect(s).toContain('emergencyKillSwitch')
    expect(s).toContain('publish_approvals')
    expect(s).toContain('policy_artifacts')
    expect(s).toContain('verifySignedArtifact')
    expect(s).toContain('policy_public_key_pem')
  })
})
