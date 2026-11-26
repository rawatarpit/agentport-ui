/**
 * Durable, tenant-scoped saved research reports.
 *
 * Reads and writes go through the session client, so RLS scopes every row to
 * the caller's own tenant. The table is optional until the migration is
 * applied; callers should treat a missing table as an honest save failure,
 * never as a silent success.
 */

import { createClient } from '@/lib/supabase/server'
import { resolveRequestTenant } from '@/lib/tenant-server'
import type { ResearchProfile, ResearchReport } from '@/lib/intelligence/types'

export type SavedReportRow = {
  id: string
  tenantId: string
  profile: ResearchProfile
  report: ResearchReport | null
  savedAt: string
  updatedAt: string
}

export type SavedReportsResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function rowToSavedReport(row: unknown): SavedReportRow | null {
  const r = row as {
    id?: string | null
    tenant_id?: string | null
    profile?: unknown
    report?: unknown
    saved_at?: string | null
    updated_at?: string | null
  }
  if (!r.id || !r.tenant_id || !r.profile || !r.saved_at) return null
  return {
    id: r.id,
    tenantId: r.tenant_id,
    profile: r.profile as ResearchProfile,
    report: (r.report as ResearchReport) ?? null,
    savedAt: r.saved_at,
    updatedAt: r.updated_at ?? r.saved_at,
  }
}

export async function listSavedReports(
  tenantId: string,
): Promise<SavedReportsResult<SavedReportRow[]>> {
  const db = createClient()
  const { data, error } = await db
    .from('saved_reports')
    .select('id, tenant_id, profile, saved_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('saved_at', { ascending: false })
  if (error || !Array.isArray(data)) return { ok: false, reason: 'Unable to load saved reports.' }
  return {
    ok: true,
    value: (data as unknown[]).map(rowToSavedReport).filter((row): row is SavedReportRow => row !== null),
  }
}

export async function getSavedReport(
  tenantId: string,
  id: string,
): Promise<SavedReportsResult<SavedReportRow | null>> {
  const db = createClient()
  const { data, error } = await db
    .from('saved_reports')
    .select('id, tenant_id, profile, report, saved_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, reason: 'Unable to load the saved report.' }
  if (!data) return { ok: true, value: null }
  return { ok: true, value: rowToSavedReport(data) }
}

export async function saveReport(
  tenantId: string,
  input: { profile: ResearchProfile; report?: ResearchReport | null },
): Promise<SavedReportsResult<{ id: string }>> {
  const db = createClient()
  const { data, error } = await db
    .from('saved_reports')
    .insert({ tenant_id: tenantId, profile: input.profile, report: input.report ?? null })
    .select('id')
    .single()
  if (error || !data) return { ok: false, reason: 'Unable to save the report.' }
  return { ok: true, value: { id: (data as { id: string }).id } }
}

export async function deleteSavedReport(
  tenantId: string,
  id: string,
): Promise<SavedReportsResult<{ deleted: boolean }>> {
  const db = createClient()
  const { data, error } = await db
    .from('saved_reports')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, reason: 'Unable to delete the report.' }
  return { ok: true, value: { deleted: Array.isArray(data) && data.length > 0 } }
}

export async function requiredTenantId(): Promise<string | null> {
  const tenant = await resolveRequestTenant()
  return tenant.active.status === 'active' ? tenant.active.tenantId : null
}
