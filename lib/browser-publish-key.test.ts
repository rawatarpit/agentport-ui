import { describe, expect, it } from 'vitest'
import { verify } from 'node:crypto'
import { canonicalArtifactBytes, type SignedArtifact } from '@/lib/artifact-canonical'
import {
  generatePublishKey,
  keyMatchesPin,
  pemFromSpki,
  signArtifact,
} from '@/lib/browser-publish-key'

const artifact: SignedArtifact = {
  tenantId: 'f4d7c3e1-34a4-4e78-8dfd-97f80399b055',
  version: 3,
  policy: { b: 2, a: [1, { y: 2, x: 1 }] },
  capabilities: [{ name: 'searchProducts' }],
  publicBaseUrl: 'https://governor.example.test/t/f4d7c3e1-34a4-4e78-8dfd-97f80399b055',
}

describe('browser publishing key', () => {
  it('signs the same canonical bytes the server verifies', async () => {
    const key = await generatePublishKey(artifact.tenantId)
    const signed = await signArtifact(artifact, key)
    expect(
      verify(
        null,
        Buffer.from(canonicalArtifactBytes(artifact), 'utf8'),
        signed.publicKey,
        Buffer.from(signed.signature, 'base64'),
      ),
    ).toBe(true)
    expect(
      verify(
        null,
        Buffer.from(canonicalArtifactBytes({ ...artifact, version: 4 }), 'utf8'),
        signed.publicKey,
        Buffer.from(signed.signature, 'base64'),
      ),
    ).toBe(false)
  })

  it('keeps the private key non-extractable after generation', async () => {
    const key = await generatePublishKey(artifact.tenantId)
    expect(key.privateKey.extractable).toBe(false)
    await expect(globalThis.crypto.subtle.exportKey('pkcs8', key.privateKey)).rejects.toThrow()
  })

  it('returns a pin-comparable SPKI PEM', async () => {
    const key = await generatePublishKey(artifact.tenantId)
    expect(key.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true)
    expect(key.publicKeyPem.endsWith('-----END PUBLIC KEY-----\n')).toBe(true)
    expect(keyMatchesPin(key, key.publicKeyPem.trim())).toBe(true)
    expect(keyMatchesPin(key, null)).toBe(true)
    const other = await generatePublishKey(artifact.tenantId)
    expect(keyMatchesPin(key, other.publicKeyPem)).toBe(false)
  })

  it('frames raw SPKI bytes as PEM without base64 line overflow', () => {
    const spki = new Uint8Array(70).fill(7).buffer
    const pem = pemFromSpki(spki)
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
    const lines = pem.split('\n').filter((line) => line !== '' && !line.startsWith('-----'))
    expect(body.length).toBeGreaterThan(0)
    expect(lines.every((line) => line.length <= 64)).toBe(true)
  })
})
