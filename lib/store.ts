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

export const DEMO_TENANT = 'example-shoes'

/** Single-tenant demo. Supabase Auth sessions replace this — see /connect step 1. */
export function resolveTenant(): string {
  return process.env.AGENTPORT_TENANT ?? DEMO_TENANT
}

export type Merchant = {
  id: string
  email: string
  businessName: string
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

/** Demo heartbeat so the panel has something true to render before a real push lands. */
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
    createdAt: new Date().toISOString(),
  }
  merchants.set(resolveTenant(), m)
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
  seedDemoPush()
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
