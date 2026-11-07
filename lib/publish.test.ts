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
  const hosted = `https://governor.example.test/t/${tenant}`
  it('accepts the tenant-scoped hosted URL with or without a trailing slash', () => {
    expect(publicBaseUrlProblem(hosted, tenant)).toBeNull()
    expect(publicBaseUrlProblem(`${hosted}/`, tenant)).toBeNull()
  })
  it('requires the value: activation succeeds but the worker refuses to boot without it', () => {
    expect(publicBaseUrlProblem(undefined, tenant)).toContain('required')
    expect(publicBaseUrlProblem('', tenant)).toContain('required')
  })
  it('refuses a different tenant path or a base origin with no tenant path', () => {
    expect(publicBaseUrlProblem('https://governor.example.test', tenant)).toContain(`/t/${tenant}`)
    expect(publicBaseUrlProblem('https://governor.example.test/t/someone-else', tenant)).toContain(`/t/${tenant}`)
  })
  it('refuses cleartext, credentials, query strings and fragments', () => {
    expect(publicBaseUrlProblem(`http://governor.example.test/t/${tenant}`, tenant)).toContain('https')
    expect(publicBaseUrlProblem(`https://user:pass@governor.example.test/t/${tenant}`, tenant)).toContain('credentials')
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
    publicBaseUrl: 'https://governor.example.test/t/f4d7c3e1-34a4-4e78-8dfd-97f80399b055',
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

  it('the retired artifact routes refuse and point at the DB apply path', () => {
    for (const p of ['approve', 'artifact']) {
      const s = src(p)
      expect(s, `${p} refuses with 410`).toContain('410')
      expect(s, `${p} points at apply`).toContain('/api/publish/apply')
      expect(s, `${p} must not write artifacts`).not.toContain('policy_artifacts')
      expect(s, `${p} must not verify signatures`).not.toContain('verifySignedArtifact')
    }
  })

  it('apply resolves owner/admin from the session and writes through one RPC', () => {
    const s = src('apply')
    expect(s).toContain('resolveCallerRole')
    expect(s).toContain('tierForChange')
    expect(s).toContain('agentport_apply_tenant_config')
    expect(s).not.toContain('service_role')
    // The inventory moves inside the RPC transaction, never a second write.
    expect(s).not.toContain(".from('agent_capabilities')")
  })
})

describe('database publishing', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const read = (p: string) => readFileSync(join(here, '..', p), 'utf8')

  it('the publish panel applies through the database, with no browser signing', () => {
    const s = read('components/golive-panel.tsx')
    expect(s).toContain('/api/publish/apply')
    expect(s).not.toContain('signArtifact')
    expect(s).not.toContain('ensurePublishKey')
    expect(s).not.toContain('loadPublishKey')
    expect(s).not.toContain('keyMatchesPin')
    expect(s).not.toContain('browser-publish-key')
  })

  it('the apply route writes a config version, not an artifact', () => {
    const s = read('app/api/publish/apply/route.ts')
    expect(s).toContain('agentport_apply_tenant_config')
    expect(s).toContain('tenant_config_versions')
    expect(s).not.toContain('policy_artifacts')
    expect(s).not.toContain('verifySignedArtifact')
    expect(s).not.toContain('publicBaseUrl')
    expect(s).not.toContain('normaliseWorkerUrl')
  })

  it('browser key code never reaches for the server crypto or Supabase clients', () => {
    const s = read('lib/browser-publish-key.ts')
    expect(s).not.toContain("node:crypto")
    expect(s).not.toContain('@/lib/supabase')
    expect(s).not.toContain('SERVICE_ROLE')
    expect(s).toContain("'use client'")
  })

  it('status reads the applied config, not an artifact or a key pin', () => {
    const s = read('app/api/publish/status/route.ts')
    expect(s).toContain('tenant_config_versions')
    expect(s).not.toContain('pinnedPublicKey')
    expect(s).not.toContain('policy_artifacts')
  })
})
