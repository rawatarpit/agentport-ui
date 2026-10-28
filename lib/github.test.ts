import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac, generateKeyPairSync } from 'node:crypto'

import { candidatePrivateKeys, createAppJwt, exchangeOAuthCode, extractPemArmor, hasOurInstallation, listUserInstallations, normalizeAppPrivateKey, pickOurInstallation, verifyInstallationOwnership, verifyWebhookSignature } from './github.js'

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
  it('mintInstallationTokenFor refuses non-numeric installations', async () => {
    const { mintInstallationTokenFor } = await import('./github.js')
    const r = await mintInstallationTokenFor(Number.NaN, { appId: '1', privateKey: '' })
    assert.equal(r.ok, false)
    assert.equal((r as { reason: string }).reason, 'unknown installation')
  })

  it('mintInstallationTokenFor names setup, not secrets, when unconfigured', async () => {
    const { mintInstallationTokenFor } = await import('./github.js')
    const r = await mintInstallationTokenFor(123, { appId: '', privateKey: '' })
    assert.equal(r.ok, false)
    const text = JSON.stringify(r)
    assert.ok(!text.includes('PRIVATE'), 'key material reached the reason')
  })

  it('openInstallPr refuses a missing repo before touching the network', async () => {
    const { openInstallPr } = await import('./github.js')
    const r = await openInstallPr({
      installationToken: 'x',
      repoFullName: 'not-a-repo',
      files: [{ path: 'agentport/manifest.json', content: '{}' }],
      prTitle: 't',
      prBody: 'b',
    })
    assert.equal(r.ok, false)
    assert.equal((r as { reason: string }).reason, 'pick a repository first')
  })

  it('openInstallPr refuses unsafe or duplicate paths before touching the network', async () => {
    const { openInstallPr } = await import('./github.js')
    for (const files of [
      [{ path: '../escape.txt', content: 'x' }],
      [{ path: '.git/config', content: 'x' }],
      [
        { path: 'agentport/manifest.json', content: '{}' },
        { path: 'agentport/manifest.json', content: '{}' },
      ],
    ]) {
      const r = await openInstallPr({
        installationToken: 'x',
        repoFullName: 'o/r',
        files,
        prTitle: 't',
        prBody: 'b',
      })
      assert.equal(r.ok, false)
    }
  })

  it('readRepoFile refuses unsafe paths before touching the network', async () => {
    const { readRepoFile } = await import('./github.js')
    const r = await readRepoFile({
      installationToken: 'x',
      repoFullName: 'o/r',
      path: '../secrets',
    })
    assert.equal(r.ok, false)
    assert.equal((r as { reason: string }).reason, 'file path is not safe')
  })

  it('readPrState refuses a missing repo before touching the network', async () => {
    const { readPrState } = await import('./github.js')
    const r = await readPrState({ installationToken: 'x', repoFullName: 'nope', prNumber: 1 })
    assert.equal(r.ok, false)
  })

  it('readRepoTree refuses malformed repo and ref before touching the network', async () => {
    const { readRepoTree } = await import('./github.js')
    for (const repoFullName of ['nope', 'a/b/c', '', '../x', 'a/..']) {
      const r = await readRepoTree({ installationToken: 'x', repoFullName, ref: 'main' })
      assert.equal(r.ok, false)
      assert.equal((r as { reason: string }).reason, 'repository name is not owner/name')
    }
    for (const ref of ['', 'main branch', 'a'.repeat(129)]) {
      const r = await readRepoTree({ installationToken: 'x', repoFullName: 'o/r', ref })
      assert.equal(r.ok, false)
    }
  })
})

describe('private-key paste normalization', () => {
  const { privateKey } = rs256Keypair()
  const singleLine = privateKey.replace(/\n/g, '\\n')

  it('round-trips every paste shape back to a signing key', () => {
    const variants = [
      privateKey,
      singleLine,
      `"${singleLine}"`,
      `'${privateKey}'`,
      privateKey.replace(/\n/g, '\r\n'),
      `  ${singleLine}  `,
      `\\"${singleLine}\\"`,
    ]
    for (const v of variants) {
      const jwt = createAppJwt('12345', normalizeAppPrivateKey(v), 1791300000000)
      assert.ok(jwt.split('.').length === 3, 'variant must mint')
    }
  })

  it('refuses non-strings and truncated keys without throwing', () => {
    assert.equal(normalizeAppPrivateKey(null), '')
    assert.equal(normalizeAppPrivateKey(42), '')
    const cut = normalizeAppPrivateKey(privateKey.slice(0, 100))
    let threw = false
    try {
      createAppJwt('12345', cut, 1791300000000)
    } catch {
      threw = true
    }
    assert.ok(threw, 'a truncated key must still fail closed at sign time')
  })

  it('tries a base64 envelope before giving up, never garbage', () => {
    const b64 = Buffer.from(privateKey, 'utf8').toString('base64')
    const cands = candidatePrivateKeys(b64)
    assert.ok(cands.length >= 2, 'base64 input yields a decoded candidate')
    const good = cands.find((c) => {
      try {
        createAppJwt('12345', c, 1791300000000)
        return true
      } catch {
        return false
      }
    })
    assert.ok(good, 'one candidate must mint')
    assert.deepEqual(candidatePrivateKeys('short'), ['short'])
    // A clean PEM yields the direct form first; the 64-col rewrap may add an
    // equivalent second candidate — every candidate must mint.
    const clean = candidatePrivateKeys(privateKey)
    assert.equal(clean[0], normalizeAppPrivateKey(privateKey))
    for (const c of clean) {
      const jwt = createAppJwt('12345', c, 1791300000000)
      assert.ok(jwt.split('.').length === 3, 'every candidate must mint')
    }
  })

  it('rebuilds armor damaged by rich-text copies', () => {
    // Zero-width spaces + smart dashes + NBSP inside the body, smart quotes
    // around the whole thing (built from code points, never literals): all
    // damage, no key material.
    const LQ = String.fromCharCode(0x201c)
    const RQ = String.fromCharCode(0x201d)
    const EM = String.fromCharCode(0x2014)
    const ZWSP = String.fromCharCode(0x200b)
    const damaged =
      LQ +
      privateKey
        .replace(/-----/g, EM + EM + EM + EM + EM)
        .split('\n')
        .join('\n' + ZWSP)
        .replace(/A/g, 'A ') +
      RQ
    const armor = extractPemArmor(damaged)
    assert.ok(armor, 'armor must be recoverable')
    const jwt = createAppJwt('12345', armor as string, 1791300000000)
    assert.ok(jwt.split('.').length === 3, 'rebuilt armor must mint')
  })

  it('extractPemArmor refuses keyless input', () => {
    assert.equal(extractPemArmor('hello world'), null)
    assert.equal(extractPemArmor(null), null)
    assert.equal(extractPemArmor('-----BEGIN X-----\nAB\n-----END X-----\n'), null)
  })
})

describe('install discovery (code-only callback)', () => {
  const ours = (id: number, at: string) => ({ id, accountLogin: 'acme', accountId: 1, accountType: 'User', installedAt: at, appId: '5225757' })

  it('picks the latest install of our App only', () => {
    const rows = [
      ours(1, '2026-10-14T10:00:00.000Z'),
      { ...ours(2, '2026-10-15T10:00:00.000Z') },
      { id: 9, accountLogin: 'other', accountId: 9, accountType: 'User', installedAt: '2026-10-16T10:00:00.000Z', appId: '999' },
    ]
    assert.deepEqual(pickOurInstallation(rows, '5225757'), ours(2, '2026-10-15T10:00:00.000Z'))
  })

  it('refuses foreign apps, non-positive ids, blank App ID, and empties', () => {
    assert.equal(pickOurInstallation([{ ...ours(1, ''), appId: '999' }], '5225757'), null)
    assert.equal(pickOurInstallation([{ ...ours(0, ''), appId: '5225757' }], '5225757'), null)
    assert.equal(pickOurInstallation([ours(1, '')], ''), null)
    assert.equal(pickOurInstallation([], '5225757'), null)
  })

  it('refuses a victim installation id that is not in the caller authorization', () => {
    const authorized = [ours(1, '2026-10-14T10:00:00.000Z'), ours(2, '2026-10-15T10:00:00.000Z')]
    expect(hasOurInstallation(authorized, '5225757', 2)).toBe(true)
    // Same App, but another merchant's installation id.
    expect(hasOurInstallation(authorized, '5225757', 999)).toBe(false)
    // Same id, but another App's installation.
    expect(hasOurInstallation([{ ...ours(7, ''), appId: '999' }], '5225757', 7)).toBe(false)
    expect(hasOurInstallation(authorized, '', 1)).toBe(false)
    expect(hasOurInstallation(authorized, '5225757', 0)).toBe(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listUserInstallations never leaks the user token into its reason', async () => {
    const token = 'USERTOKEN123'
    const r = await listUserInstallations(token)
    const text = JSON.stringify(r)
    assert.ok(!text.includes(token), 'the user token reached the reason')
    if (r.ok) assert.ok(Array.isArray(r.value), 'ok carries a list')
  })

  it('follows a same-origin rel=next page', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              installations: [
                { id: 1, account: { login: 'acme', id: 1, type: 'User' }, app_id: 5225757 },
              ],
            }),
            {
              status: 200,
              headers: {
                link: '<https://api.github.com/user/installations?per_page=100&page=2>; rel="next"',
              },
            },
          )
        }
        return new Response(
          JSON.stringify({
            installations: [
              { id: 2, account: { login: 'acme', id: 1, type: 'User' }, app_id: 5225757 },
            ],
          }),
          { status: 200 },
        )
      }),
    )
    const r = await listUserInstallations('token')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.map((i) => i.id)).toEqual([1, 2])
    expect(calls).toHaveLength(2)
  })

  it('ignores a rel=next link pointing at another origin', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        return new Response(
          JSON.stringify({
            installations: [
              { id: 1, account: { login: 'acme', id: 1, type: 'User' }, app_id: 5225757 },
            ],
          }),
          {
            status: 200,
            headers: {
              link: '<https://evil.example/user/installations?page=2>; rel="next"',
            },
          },
        )
      }),
    )
    const r = await listUserInstallations('token')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.map((i) => i.id)).toEqual([1])
    expect(calls).toBe(1)
  })
})


describe('installation ownership', () => {
  const personal = (id: number, accountId: number) => ({
    id,
    accountLogin: 'acme',
    accountId,
    accountType: 'User',
    installedAt: '',
    appId: '5225757',
  })
  const org = (id: number, login: string) => ({
    id,
    accountLogin: login,
    accountId: 900,
    accountType: 'Organization',
    installedAt: '',
    appId: '5225757',
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts a personal installation only for the same GitHub user id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 42, login: 'acme' }), { status: 200 })),
    )
    expect((await verifyInstallationOwnership('token', '5225757', 1, [personal(1, 42)])).ok).toBe(true)
    expect((await verifyInstallationOwnership('token', '5225757', 1, [personal(1, 43)])).ok).toBe(false)
  })

  it('accepts an organization installation only for an active admin', async () => {
    const membership = (role: string, state: string) =>
      vi.fn(async () => new Response(JSON.stringify({ role, state }), { status: 200 }))

    vi.stubGlobal('fetch', membership('admin', 'active'))
    expect((await verifyInstallationOwnership('token', '5225757', 2, [org(2, 'acme-org')])).ok).toBe(true)

    vi.stubGlobal('fetch', membership('member', 'active'))
    expect((await verifyInstallationOwnership('token', '5225757', 2, [org(2, 'acme-org')])).ok).toBe(false)

    vi.stubGlobal('fetch', membership('admin', 'pending'))
    expect((await verifyInstallationOwnership('token', '5225757', 2, [org(2, 'acme-org')])).ok).toBe(false)
  })

  it('refuses an installation id absent from the caller list without any API call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await verifyInstallationOwnership('token', '5225757', 999, [personal(1, 42)])).ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
