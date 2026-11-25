import type { LiveArtifactRow } from '@/lib/backend-reads'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-only read of the applied config: the newest tenant_config_versions row,
 * which is what the hosted governor serves. Never import this into a client
 * bundle — createAdminClient bypasses RLS. Callers must already have proved
 * membership with resolveRequestTenant before calling readAppliedConfig, since
 * that table has no member SELECT policy. Retired artifact readers are not
 * deployment claims and must not be used here.
 */
export type AppliedConfigState =
  | { state: 'unknown' }
  | { state: 'none' }
  | { state: 'live'; version: number; publishedAt: string; policy?: Record<string, unknown> }

export type AppliedLiveRead = {
  row: LiveArtifactRow | null
  unknown: boolean
  published: boolean | null
}

/**
 * Older callers speak in `LiveArtifactRow`. Keep the name but feed it from the
 * applied config version, never from a retired artifact table.
 */
export function appliedConfigToLiveRead(state: AppliedConfigState): AppliedLiveRead {
  if (state.state === 'live') {
    return { row: { version: state.version, publishedAt: state.publishedAt }, unknown: false, published: true }
  }
  if (state.state === 'none') return { row: null, unknown: false, published: false }
  return { row: null, unknown: true, published: null }
}

type ConfigVersionRow = { version?: unknown; created_at?: unknown; policy?: unknown }

/** A malformed row cannot support a "live" claim: that is unknown, not none. */
export function appliedConfigFromRow(row: unknown): AppliedConfigState {
  if (row === null || row === undefined) return { state: 'none' }
  if (typeof row !== 'object') return { state: 'unknown' }
  const r = row as ConfigVersionRow
  const version = r.version
  const createdAt = r.created_at
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return { state: 'unknown' }
  }
  // The version can be live while its policy body is unreadable. Keep the
  // version claim, but leave `policy` absent so callers render values as
  // unknown instead of repeating a retired artifact or an invented default.
  const policy =
    r.policy && typeof r.policy === 'object' && !Array.isArray(r.policy)
      ? (r.policy as Record<string, unknown>)
      : undefined
  return {
    state: 'live',
    version,
    publishedAt: createdAt,
    ...(policy ? { policy } : {}),
  }
}

export type AppliedPolicyValues = {
  ask: number | null
  currency: string | null
  never: number | null
  forbidden: string[] | null
  alwaysAsk: string[] | null
  rate: number | null
}

const minorOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const listOrNull = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null

/** Values the applied policy row can actually prove. Null renders as unknown. */
export function policyValuesFromApplied(policy: Record<string, unknown> | undefined): AppliedPolicyValues {
  const asObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  const max = asObject(policy?.maxOrderValue)
  const absolute = asObject(policy?.absoluteMaxOrderValue)
  const rateLimit = asObject(policy?.rateLimit)
  return {
    ask: minorOrNull(max?.minor),
    currency:
      typeof max?.currency === 'string'
        ? max.currency
        : typeof absolute?.currency === 'string'
          ? absolute.currency
          : null,
    never: minorOrNull(absolute?.minor),
    forbidden: listOrNull(policy?.forbiddenCapabilities),
    alwaysAsk: listOrNull(policy?.alwaysRequireApproval),
    rate: minorOrNull(rateLimit?.requestsPerMinute),
  }
}

/**
 * `undefined` means the runtime row or pointer is unreadable (unknown).
 * `0` means the pointer is explicitly zero: no config is active yet.
 */
export function activeVersionFromRow(row: unknown): number | undefined {
  if (!row || typeof row !== 'object') return undefined
  const raw = (row as { active_config_version?: unknown }).active_config_version
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'string' && raw.trim() === '') return undefined
  const version = Number(raw)
  if (!Number.isInteger(version) || version < 0) return undefined
  return version
}

export async function readAppliedConfig(tenantId: string): Promise<AppliedConfigState> {
  try {
    const { data, error } = await createAdminClient()
      .from('tenant_config_versions')
      .select('version, created_at, policy')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { state: 'unknown' }
    return appliedConfigFromRow(data as ConfigVersionRow | null)
  } catch {
    // A failed read is ignorance, never "nothing published".
    return { state: 'unknown' }
  }
}
