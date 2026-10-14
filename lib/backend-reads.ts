import { createClient } from '@/lib/supabase/server'

/**
 * Backend reads for liveness truth (P1).
 *
 * Every function here answers from Supabase via the session client (anon key
 * + cookies), so RLS scopes rows to the caller's own tenants. No service
 * role, no key material, no fallback to RAM — an empty/error result is
 * returned as null/false and the caller renders `unknown`/honest-empty.
 *
 * Custody (AGENTS.md 6): explicit column lists only. The PII email column
 * and the append-auth MAC are never selected on any dashboard path —
 * `v_tenant_home` already excludes them, and the lists below keep it that
 * way even if the table gains columns later.
 */

export type HomeRow = {
  tenant_id: string
  display_name: string
  last_push_at: string | null
  event_count: number
  member_count: number
  my_role: string
}

export type PushRow = {
  digest: string
  pushedAt: string
  eventCount: number
}

export type LiveArtifactRow = {
  version: number
  publishedAt: string
}

/**
 * Normalise a bytea payload hash to lowercase hex without a `\x` prefix.
 * Supabase may return bytea as `\x…` text; a short/missing value means the
 * digest is unusable — callers treat that as unknown, never as zero.
 */
export function normalizePayloadSha(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const hex = v.startsWith('\\x') ? v.slice(2) : v
  if (!/^[0-9a-fA-F]{16,}$/.test(hex)) return null
  return hex.toLowerCase()
}

/** Latest push_batches row mapped to the enforcing input. Null = unknown. */
export function pushRecordToRow(r: {
  payload_sha256: unknown
  received_at: string
  event_count: number
}): PushRow | null {
  const digest = normalizePayloadSha(r.payload_sha256)
  if (!digest) return null
  if (!r.received_at || !Number.isFinite(Date.parse(r.received_at))) return null
  return { digest, pushedAt: r.received_at, eventCount: r.event_count }
}

/** One home row: business identity + liveness, never amounts or PII. */
export async function getHome(): Promise<HomeRow | null> {
  try {
    const db = createClient()
    const { data, error } = await db
      .from('v_tenant_home')
      .select('tenant_id, display_name, last_push_at, event_count, member_count, my_role')
      .maybeSingle()
    if (error || !data) return null
    const r = data as Partial<HomeRow>
    if (!r.tenant_id || !r.display_name) return null
    // Preserve nullability: a missing count is unknown, never zero; a
    // missing role is unknown, never an invented membership.
    const eventCount = typeof r.event_count === 'number' && Number.isFinite(r.event_count) ? r.event_count : null
    const memberCount = typeof r.member_count === 'number' && Number.isFinite(r.member_count) ? r.member_count : null
    if (eventCount === null || memberCount === null) return null
    return {
      tenant_id: r.tenant_id,
      display_name: r.display_name,
      last_push_at: r.last_push_at ?? null,
      event_count: eventCount,
      member_count: memberCount,
      my_role: typeof r.my_role === 'string' ? r.my_role : 'unknown',
    }
  } catch {
    return null
  }
}

/** Newest push receipt. Null until the runtime's first real push lands. */
export async function getLatestPush(tenantId?: string): Promise<PushRow | null> {
  try {
    const db = createClient()
    let q = db.from('push_batches').select('tenant_id, payload_sha256, received_at, event_count')
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data, error } = await q.order('received_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    const r = data as { payload_sha256: unknown; received_at: string; event_count: number }
    return pushRecordToRow(r)
  } catch {
    return null
  }
}

/** Any analytics event yet? Counts flow via the ingest edge function. */
export async function hasAnalyticsEvents(tenantId?: string): Promise<boolean> {
  try {
    const db = createClient()
    let q = db.from('analytics_events').select('event_id')
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data, error } = await q.limit(1)
    if (error || !data) return false
    return (data as unknown[]).length > 0
  } catch {
    return false
  }
}

/** Latest published artifact version for the "go live" step. Null = none. */
export async function getLiveArtifact(tenantId?: string): Promise<LiveArtifactRow | null> {
  try {
    const db = createClient()
    let q = db.from('policy_artifacts').select('tenant_id, version, published_at')
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data, error } = await q.order('version', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    const r = data as { version: number; published_at: string }
    if (!Number.isInteger(r.version)) return null
    if (!r.published_at || !Number.isFinite(Date.parse(r.published_at))) return null
    return { version: r.version, publishedAt: r.published_at }
  } catch {
    return null
  }
}
