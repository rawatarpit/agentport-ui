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
  | { state: 'live'; version: number; publishedAt: string }

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

type ConfigVersionRow = { version?: unknown; created_at?: unknown }

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
  return { state: 'live', version, publishedAt: createdAt }
}

export async function readAppliedConfig(tenantId: string): Promise<AppliedConfigState> {
  try {
    const { data, error } = await createAdminClient()
      .from('tenant_config_versions')
      .select('version, created_at')
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
