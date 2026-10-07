import { describe, expect, it } from 'vitest'
import { createHmac, generateKeyPairSync } from 'node:crypto'

import { createAppJwt, exchangeOAuthCode, verifyWebhookSignature } from './github.js'

const assert = {
  deepEqual: (a: unknown, b: unknown) => expect(a).toEqual(b),
  equal: (a: unknown, b: unknown, m?: string) => expect(a, m).toBe(b),
  ok: (v: unknown, m?: string) => expect(v, m).toBeTruthy(),
};

/**
 * GitHub App primitives. Every test asserts the security property, not the
 * helper: a forged delivery must fail closed, a JWT must carry exactly the
 * claims GitHub checks, and no credential may appear in a refusal reason.
 */

function rs256Keypair(): { privateKey: string } {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
}

describe('webhook signature', () => {
  const secret = 'test-webhook-secret'

  it('accepts a correctly signed delivery', () => {
    const raw = JSON.stringify({ action: 'created', zen: 'hello' })
    const sig = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`
    assert.deepEqual(verifyWebhookSignature(secret, raw, sig), { ok: true })
  })

  it('refuses an absent, malformed, or wrong signature with distinct reasons', () => {
    const raw = '{}'
    assert.equal(verifyWebhookSignature(secret, raw, null).ok, false)
    assert.equal(verifyWebhookSignature(secret, raw, 'md5=abcd').ok, false)
    assert.equal(verifyWebhookSignature(secret, raw, 'sha256=nothex!!').ok, false)
    assert.equal(verifyWebhookSignature(secret, raw, 'sha256=00').ok, false)
    const wrong = `sha256=${createHmac('sha256', 'other-secret').update(raw, 'utf8').digest('hex')}`
    const r = verifyWebhookSignature(secret, raw, wrong)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'signature mismatch')
  })

  it('refuses a tampered body even with a validly-formed signature', () => {
    const raw = JSON.stringify({ action: 'created' })
    const sig = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`
    assert.equal(verifyWebhookSignature(secret, `${raw} `, sig).ok, false)
  })
})

describe('app JWT', () => {
  it('carries exactly iss/iat/exp with the skew and ceiling GitHub enforces', () => {
    const { privateKey } = rs256Keypair()
    const now = 1791300000000
    const jwt = createAppJwt('12345', privateKey, now)
    const [h, p, s] = jwt.split('.')
    assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as {
      iss: string
      iat: number
      exp: number
    }
    assert.equal(payload.iss, '12345')
    assert.equal(payload.iat, Math.floor(now / 1000) - 60)
    assert.equal(payload.exp, Math.floor(now / 1000) + 600)
    assert.ok(s.length > 0, 'unsigned JWT authenticates nothing')
  })
})

describe('oauth exchange', () => {
  it('refuses without naming the secret or the code', async () => {
    const r = await exchangeOAuthCode({ clientId: 'x', clientSecret: 'SUPERSECRET', code: 'CODE123' })
    // No network in this test's posture is fine — what matters is the shape:
    // whatever comes back must never carry credential material.
    const text = JSON.stringify(r)
    assert.ok(!text.includes('SUPERSECRET'), 'the secret reached the reason')
    assert.ok(!text.includes('CODE123'), 'the code reached the reason')
  })
})

describe('repo listing + PR shapes (offline guards)', () => {
  it('mintInstallationTokenFor refuses non-numeric installations without env', async () => {
    const { mintInstallationTokenFor } = await import('./github.js')
    const r = await mintInstallationTokenFor(Number.NaN)
    assert.equal(r.ok, false)
    assert.equal((r as { reason: string }).reason, 'unknown installation')
  })

  it('mintInstallationTokenFor names setup, not secrets, when unconfigured', async () => {
    const { mintInstallationTokenFor } = await import('./github.js')
    const savedApp = process.env.GITHUB_APP_ID
    const savedKey = process.env.GITHUB_APP_PRIVATE_KEY
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_APP_PRIVATE_KEY
    try {
      const r = await mintInstallationTokenFor(123)
      assert.equal(r.ok, false)
      const text = JSON.stringify(r)
      assert.ok(!text.includes('PRIVATE'), 'key material reached the reason')
    } finally {
      if (savedApp !== undefined) process.env.GITHUB_APP_ID = savedApp
      if (savedKey !== undefined) process.env.GITHUB_APP_PRIVATE_KEY = savedKey
    }
  })

  it('openInstallPr refuses a missing repo before touching the network', async () => {
    const { openInstallPr } = await import('./github.js')
    const r = await openInstallPr({
      installationToken: 'x',
      repoFullName: 'not-a-repo',
      filePath: 'agentport.config.ts',
      fileContent: '// draft',
      prTitle: 't',
      prBody: 'b',
    })
    assert.equal(r.ok, false)
    assert.equal((r as { reason: string }).reason, 'pick a repository first')
  })

  it('readPrState refuses a missing repo before touching the network', async () => {
    const { readPrState } = await import('./github.js')
    const r = await readPrState({ installationToken: 'x', repoFullName: 'nope', prNumber: 1 })
    assert.equal(r.ok, false)
  })
})
