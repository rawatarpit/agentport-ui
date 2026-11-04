'use client'

import { canonicalArtifactBytes, type SignedArtifact } from '@/lib/artifact-canonical'

/**
 * Merchant-side publishing key, held by the browser.
 *
 * The console never receives the private key. First publish generates an
 * Ed25519 keypair on the merchant's device, keeps the private half in
 * IndexedDB as a non-extractable CryptoKey, and stores only the public half
 * with the runtime. Later publishes sign the exact approved bytes here and
 * upload the envelope automatically.
 *
 * The trust boundary is unchanged: the hosted governor still verifies the
 * signature against the pinned public key, and the approval row still binds
 * the exact bytes. What disappears is the CLI step, not the proof.
 *
 * Device loss is a key-rotation ceremony. That is deliberately not automated:
 * a browser that could silently replace the merchant key would erase the
 * property the key exists to provide.
 */

const DB_NAME = 'agentport-publish-keys'
const STORE = 'keys'
const DB_VERSION = 1

export type PublishKey = {
  tenantId: string
  privateKey: CryptoKey
  publicKeyPem: string
}

type StoredKey = {
  tenantId: string
  privateKey: CryptoKey
  publicKeyPem: string
}

export type EnsureKeyResult =
  | { ok: true; key: PublishKey; created: boolean }
  | { ok: false; reason: string }

function keyStore(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser cannot store a publishing key.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'tenantId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local key storage.'))
    request.onblocked = () => reject(new Error('Local key storage is blocked by another tab.'))
  })
}

function readStoredKey(db: IDBDatabase, tenantId: string): Promise<StoredKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(tenantId)
    request.onsuccess = () => resolve((request.result as StoredKey | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Could not read the local publishing key.'))
  })
}

function writeStoredKey(db: IDBDatabase, key: StoredKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the local publishing key.'))
    tx.onabort = () => reject(tx.error ?? new Error('Saving the local publishing key was aborted.'))
  })
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** SPKI → PEM so the server and the Rust worker can pin the same bytes. */
export function pemFromSpki(spki: ArrayBuffer): string {
  const base64 = bytesToBase64(spki)
  const body = base64.match(/.{1,64}/g)?.join('\n') ?? base64
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`
}

/**
 * Generate a publish key that cannot be exported again after this function
 * returns. The PKCS#8 bytes exist only long enough to re-import the private
 * key as non-extractable; nothing is written to localStorage.
 */
export async function generatePublishKey(tenantId: string): Promise<PublishKey> {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    throw new Error('This browser does not support Ed25519 signing.')
  }
  const pair = (await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const publicKeyPem = pemFromSpki(await globalThis.crypto.subtle.exportKey('spki', pair.publicKey))
  const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const privateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  return { tenantId, privateKey, publicKeyPem }
}

export async function loadPublishKey(tenantId: string): Promise<PublishKey | null> {
  const db = await keyStore()
  try {
    const stored = await readStoredKey(db, tenantId)
    if (stored === null) return null
    if (
      typeof stored.tenantId !== 'string' ||
      typeof stored.publicKeyPem !== 'string' ||
      stored.publicKeyPem.trim() === '' ||
      typeof stored.privateKey !== 'object' ||
      stored.privateKey === null
    ) {
      throw new Error('The local publishing key is unreadable.')
    }
    return { tenantId, privateKey: stored.privateKey, publicKeyPem: stored.publicKeyPem }
  } finally {
    db.close()
  }
}

export async function ensurePublishKey(tenantId: string): Promise<EnsureKeyResult> {
  try {
    const existing = await loadPublishKey(tenantId)
    if (existing) return { ok: true, key: existing, created: false }
    const key = await generatePublishKey(tenantId)
    const db = await keyStore()
    try {
      await writeStoredKey(db, key)
    } finally {
      db.close()
    }
    return { ok: true, key, created: true }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Could not prepare this device for automatic publishing.',
    }
  }
}

/**
 * Sign the exact canonical artifact the server approved. The envelope carries
 * the public half so first activation can pin it; later activations must
 * match the existing pin.
 */
export async function signArtifact(
  artifact: SignedArtifact,
  key: PublishKey,
): Promise<{ signature: string; publicKey: string }> {
  const bytes = new TextEncoder().encode(canonicalArtifactBytes(artifact))
  const signature = await globalThis.crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, bytes)
  return { signature: bytesToBase64(signature), publicKey: key.publicKeyPem }
}

export function keyMatchesPin(key: PublishKey, pinnedPublicKey: string | null): boolean {
  if (pinnedPublicKey === null || pinnedPublicKey.trim() === '') return true
  return key.publicKeyPem.trim() === pinnedPublicKey.trim()
}
