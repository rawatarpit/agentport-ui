import { createHash, randomBytes } from 'node:crypto'

/**
 * One-time install states (spec §8). A random 32-byte state is issued when
 * an owner/admin starts installation; only its SHA-256 hash is stored,
 * bound to (tenant, initiator, purpose, expiry). The Setup-URL callback
 * consumes it atomically — missing, expired, or replayed states reject.
 * The raw state is a correlation value, never a credential: it travels in
 * the browser redirect only, and the installation id arriving with it is
 * still mint-verified before anything records.
 */

export const INSTALL_STATE_TTL_MS = 10 * 60_000
export const GITHUB_APP_SLUG = 'agentport-installer'

export type InstallStatePurpose = 'install' | 'oauth'

export function newInstallState(now = Date.now()): {
  state: string
  stateHash: string
  expiresAt: string
} {
  const state = randomBytes(32).toString('base64url')
  return { state, stateHash: hashInstallState(state), expiresAt: new Date(now + INSTALL_STATE_TTL_MS).toISOString() }
}

export function hashInstallState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex')
}

export function installUrlFor(state: string): string {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`
}

export type SetupParams =
  | { ok: true; installationId: number; setupAction: 'install' | 'update'; state: string }
  | { ok: false; reason: string }

/** Validate Setup-URL query params. Everything here is untrusted input. */
export function validateSetupParams(input: {
  installationId: unknown
  setupAction: unknown
  state: unknown
}): SetupParams {
  const id = typeof input.installationId === 'string' ? Number(input.installationId) : input.installationId
  if (!Number.isSafeInteger(id) || (id as number) <= 0) {
    return { ok: false, reason: 'installation id is not a positive integer' }
  }
  if (input.setupAction !== 'install' && input.setupAction !== 'update') {
    return { ok: false, reason: 'setup action is not install or update' }
  }
  if (typeof input.state !== 'string' || input.state.length === 0 || input.state.length > 256) {
    return { ok: false, reason: 'state is missing or malformed' }
  }
  return { ok: true, installationId: id as number, setupAction: input.setupAction, state: input.state }
}

export type ConsumedState =
  | { ok: true; tenantId: string; initiatedBy: string; purpose: InstallStatePurpose }
  | { ok: false; reason: string }

/**
 * Pure shape-check on a consumed row. The atomicity (single
 * UPDATE...RETURNING with consumed_at IS NULL AND expires_at > now())
 * lives in the query; this decides what a returned row means. A row is
 * unusable when consumed or expired — the caller renders link-nothing.
 */
export function asConsumedState(
  row: { tenant_id: unknown; initiated_by: unknown; purpose: unknown; consumed_at: unknown; expires_at: unknown } | null,
  now = Date.now(),
): ConsumedState {
  if (!row || typeof row.tenant_id !== 'string' || typeof row.initiated_by !== 'string') {
    return { ok: false, reason: 'no live state row' }
  }
  if (row.purpose !== 'install' && row.purpose !== 'oauth') {
    return { ok: false, reason: 'unknown state purpose' }
  }
  if (row.consumed_at !== null) return { ok: false, reason: 'state already consumed' }
  if (typeof row.expires_at !== 'string' || Date.parse(row.expires_at) <= now) {
    return { ok: false, reason: 'state expired' }
  }
  return { ok: true, tenantId: row.tenant_id, initiatedBy: row.initiated_by, purpose: row.purpose }
}
