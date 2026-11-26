import { createClient } from '@/lib/supabase/server'
import { FUNNEL_EVENT_TYPES, SERVER_ONLY_FUNNEL_EVENT_TYPES } from '@/lib/funnel-event-types'
import { SERVER_EVENT_ID_PREFIX } from '@/lib/funnel-route'

/** A failed read must produce the same shape as a real read with no rows. */
export const UNKNOWN_ACQUISITION_COUNTS: readonly (number | null)[] =
  FUNNEL_EVENT_TYPES.map(() => null)

/**
 * Read acquisition event counts for the caller's tenant. A failed read returns
 * a full-length array of nulls; shorter arrays would render as `undefined`,
 * which is neither a number nor an honest unknown.
 */
export async function readAcquisitionCounts(tenantId: string): Promise<(number | null)[]> {
  const db = createClient()
  const { data, error } = await db
    .from('acquisition_events')
    .select('event_type, event_id')
    .eq('tenant_id', tenantId)

  if (error || !data) return [...UNKNOWN_ACQUISITION_COUNTS]

  const serverOnly = new Set<string>(SERVER_ONLY_FUNNEL_EVENT_TYPES)
  const counts: Record<string, number> = {}
  for (const row of data as Array<{ event_type: string; event_id: string | null }>) {
    // Legacy rows written before the namespace existed must not keep proving a
    // milestone that only a server writer can now assert.
    if (serverOnly.has(row.event_type) && !row.event_id?.startsWith(SERVER_EVENT_ID_PREFIX)) continue
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1
  }

  return FUNNEL_EVENT_TYPES.map((eventType) => counts[eventType] ?? null)
}
