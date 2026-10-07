import { configHash } from '@/lib/agentport'

/**
 * Tenant-scoped persistence for the dashboard.
 *
 * Single-process `Map` store, seeded like the ledger fixtures in
 * `lib/agentport.ts`. Every record is keyed by tenant first — the day this
 * moves to Supabase, the key becomes `(tenant_id, …)` and nothing else about
 * the call sites changes. Until Supabase Auth lands there is exactly one
 * tenant: `resolveTenant()` says so out loud instead of pretending.
 */

export const DEMO_TENANT = 'demo-tenant'

/** Single-tenant demo. Supabase Auth sessions replace this — see /connect step 1. */
export function resolveTenant(): string {
  return process.env.AGENTPORT_TENANT ?? DEMO_TENANT
}

export type Merchant = {
  id: string
  email: string
  businessName: string
  /** Merchant's public runtime endpoint — the manifest's baseUrl. Null until set. */
  websiteUrl: string | null
  createdAt: string
}

export type DraftSection = 'setup' | 'capabilities' | 'rules'

export type DraftRecord = {
  section: DraftSection
  tenantId: string
  payload: unknown
  updatedAt: string
}

export type LiveCapability = { name: string; hiddenFields: string[] }

export type LiveConfig = {
  tenantId: string
  version: number
  /** HMAC of the canonical policy+capabilities — the digest the panel reports. */
  digest: string
  policy: Record<string, unknown>
  capabilities: LiveCapability[]
  /** Merchant-controlled, two-step only. Never leaves this repo in a sync payload. */
  emergencyKillSwitch: boolean
  confirmedAt: string
  confirmedBy: string
}

export type RuntimePush = { tenantId: string; digest: string; pushedAt: string }

export type SyncReceipt = { tenantId: string; pushId: string; digest: string; receivedAt: string }

export type CountRow = { capability: string; rule: string; decision: string; n: number }

const merchants = new Map<string, Merchant>()
const drafts = new Map<string, DraftRecord>()
const live = new Map<string, LiveConfig>()
const pushes = new Map<string, RuntimePush>()
const syncs = new Map<string, SyncReceipt>()
const counts = new Map<string, CountRow[]>()
const seenPushIds = new Set<string>()

const key = (tenantId: string, section: string) => `${tenantId}:${section}`

let seeded = false

/**
 * Demo heartbeat removed: the panel now renders `unknown` until a real push
 * lands (POST /api/analytics carrying configHash + pushedAt, dev only — the
 * production path is the Supabase heartbeat). A seeded "live 4 minutes ago"
 * was the fabricated panel this whole architecture exists to prevent.
 * `seedDemoPush` is kept for tests only and is never called by the app.
 */
export function seedDemoPush(now = Date.now()): void {
  if (seeded) return
  seeded = true
  pushes.set(DEMO_TENANT, {
    tenantId: DEMO_TENANT,
    digest: configHash,
    pushedAt: new Date(now - 4 * 60_000).toISOString(),
  })
}

export function getMerchant(tenantId: string): Merchant | null {
  return merchants.get(tenantId) ?? null
}

export function findMerchantByEmail(email: string): Merchant | null {
  const needle = email.trim().toLowerCase()
  for (const m of merchants.values()) {
    if (m.email.toLowerCase() === needle) return m
  }
  return null
}

export function createMerchant(email: string, businessName: string): Merchant {
  const m: Merchant = {
    id: `mer_${Math.random().toString(36).slice(2, 10)}`,
    email: email.trim(),
    businessName: businessName.trim(),
    websiteUrl: null,
    createdAt: new Date().toISOString(),
  }
  merchants.set(resolveTenant(), m)
  return m
}

/** Normalise a merchant runtime URL or refuse it with a reason. */
export function normaliseWebsiteUrl(v: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof v !== 'string' || v.trim().length === 0) {
    return { ok: false, reason: 'Give the public https:// address your runtime serves.' }
  }
  let u: URL
  try {
    u = new URL(v.trim())
  } catch {
    return { ok: false, reason: 'That is not a URL — it needs a scheme and a host, e.g. https://shop.example.' }
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') {
    return { ok: false, reason: 'The runtime endpoint must be https:// (localhost allowed for development only).' }
  }
  return { ok: true, url: u.toString().replace(/\/$/, '') }
}

export function setWebsiteUrl(tenantId: string, url: string): Merchant | null {
  const m = merchants.get(tenantId)
  if (!m) return null
  m.websiteUrl = url
  return m
}

export function getDraft(tenantId: string, section: DraftSection): DraftRecord | null {
  return drafts.get(key(tenantId, section)) ?? null
}

export function putDraft(tenantId: string, section: DraftSection, payload: unknown): DraftRecord {
  const r: DraftRecord = { section, tenantId, payload, updatedAt: new Date().toISOString() }
  drafts.set(key(tenantId, section), r)
  return r
}

export function getLive(tenantId: string): LiveConfig | null {
  return live.get(tenantId) ?? null
}

export function publishLive(cfg: Omit<LiveConfig, 'confirmedAt'>): LiveConfig {
  const row: LiveConfig = { ...cfg, confirmedAt: new Date().toISOString() }
  live.set(cfg.tenantId, row)
  return row
}

export function getPush(tenantId: string): RuntimePush | null {
  return pushes.get(tenantId) ?? null
}

export function recordPush(tenantId: string, digest: string, pushedAt: string): RuntimePush {
  const row: RuntimePush = { tenantId, digest, pushedAt }
  pushes.set(tenantId, row)
  return row
}

export function recordSync(tenantId: string, pushId: string, digest: string): SyncReceipt {
  const row: SyncReceipt = { tenantId, pushId, digest, receivedAt: new Date().toISOString() }
  syncs.set(key(tenantId, pushId), row)
  seenPushIds.add(`${tenantId}:${pushId}`)
  return row
}

export function hasSync(tenantId: string): boolean {
  for (const k of syncs.keys()) {
    if (k.startsWith(`${tenantId}:`)) return true
  }
  return false
}

export function alreadySawPush(tenantId: string, pushId: string): boolean {
  return seenPushIds.has(`${tenantId}:${pushId}`)
}

export function addCounts(tenantId: string, rows: CountRow[]): CountRow[] {
  const cur = counts.get(tenantId) ?? []
  for (const r of rows) {
    const hit = cur.find((c) => c.capability === r.capability && c.rule === r.rule && c.decision === r.decision)
    if (hit) hit.n += r.n
    else cur.push({ ...r })
  }
  counts.set(tenantId, cur)
  return cur
}

export function getCounts(tenantId: string): CountRow[] {
  return counts.get(tenantId) ?? []
}

export function hasAnalytics(tenantId: string): boolean {
  return (counts.get(tenantId) ?? []).length > 0
}

/** A GitHub App installation linked to a tenant. RAM until the durable
 *  read model lands (TASKS.md 12.2) — same posture as every other map here:
 *  restart loses it, and nothing below pretends otherwise. */
export type Installation = {
  installationId: number
  accountLogin: string
  repositories: string[]
  installerUserId: string | null
  receivedAt: string
}

const installations = new Map<string, Installation[]>()

export function recordInstallation(tenantId: string, inst: Omit<Installation, 'receivedAt'>): Installation[] {
  const row: Installation = { ...inst, receivedAt: new Date().toISOString() }
  const cur = installations.get(tenantId) ?? []
  const ix = cur.findIndex((r) => r.installationId === row.installationId)
  if (ix >= 0) cur[ix] = row
  else cur.push(row)
  installations.set(tenantId, cur)
  return cur
}

export function removeInstallation(tenantId: string, installationId: number): void {
  installations.set(
    tenantId,
    (installations.get(tenantId) ?? []).filter((r) => r.installationId !== installationId),
  )
}

export function getInstallations(tenantId: string): Installation[] {
  return installations.get(tenantId) ?? []
}

/**
 * The install pull request per tenant repo. One row per repo: opening again
 * updates the same PR (same branch), so this record is replaced, never
 * appended. RAM like the rest of the store — restart loses it, and the
 * dashboard re-derives it from GitHub on next read.
 */
export type PullRequestRecord = {
  repo: string
  number: number
  url: string
  branch: string
  installationId: number
  recordedAt: string
}

const pullRequests = new Map<string, PullRequestRecord[]>()

export function recordPullRequest(tenantId: string, pr: Omit<PullRequestRecord, 'recordedAt'>): void {
  const cur = pullRequests.get(tenantId) ?? []
  const ix = cur.findIndex((r) => r.repo === pr.repo)
  const row: PullRequestRecord = { ...pr, recordedAt: new Date().toISOString() }
  if (ix >= 0) cur[ix] = row
  else cur.push(row)
  pullRequests.set(tenantId, cur)
}

export function getPullRequests(tenantId: string): PullRequestRecord[] {
  return pullRequests.get(tenantId) ?? []
}
