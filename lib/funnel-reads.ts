import { createClient } from '@/lib/supabase/server'

const ACQUISITION_EVENT_TYPES = [
  'intelligence_viewed',
  'report_generated',
  'report_saved',
  'signup_started',
  'signup_completed',
  'assessment_started',
  'assessment_completed',
  'installation_started',
  'github_app_installed',
  'repository_connected',
  'pull_request_created',
  'configuration_applied',
  'installation_completed',
  'deployment_verified',
  'merchant_profile_completed',
] as const

/** A failed read must produce the same shape as a real read with no rows. */
export const UNKNOWN_ACQUISITION_COUNTS: readonly (number | null)[] =
  ACQUISITION_EVENT_TYPES.map(() => null)

/**
 * Read acquisition event counts for the caller's tenant. A failed read returns
 * a full-length array of nulls; shorter arrays would render as `undefined`,
 * which is neither a number nor an honest unknown.
 */
export async function readAcquisitionCounts(tenantId: string): Promise<(number | null)[]> {
  const db = createClient()
  const { data, error } = await db
    .from('acquisition_events')
    .select('event_type')
    .eq('tenant_id', tenantId)

  if (error || !data) return [...UNKNOWN_ACQUISITION_COUNTS]

  const counts: Record<string, number> = {}
  for (const row of data as Array<{ event_type: string }>) {
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1
  }

  return ACQUISITION_EVENT_TYPES.map((eventType) => counts[eventType] ?? null)
}
