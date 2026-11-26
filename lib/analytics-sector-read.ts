import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sectorPercentileBand } from '@/lib/analytics-sector'
import { SETUP_SECTOR_VALUES } from '@/lib/intelligence/sectors'

/**
 * Server-only sector benchmark read shared by the Overview page and the API
 * route. It never performs an HTTP request to itself: a header-derived origin
 * would let a caller choose which "benchmark" the console displays.
 *
 * Exact cohort counts, medians and percentiles stay withheld. A coarse band is
 * the only cross-tenant fact a caller may see.
 */
export type SectorBenchmarkRead = {
  status: 'ok'
  hasSector: boolean
  sector: string | null
  industry: string | null
  peerCount: null
  medianEvents: null
  myEvents: number | null
  percentile: null
  percentileBand: string | null
}

function result(partial: {
  hasSector: boolean
  sector: string | null
  industry: string | null
  myEvents?: number | null
  percentileBand?: string | null
}): SectorBenchmarkRead {
  return {
    status: 'ok',
    hasSector: partial.hasSector,
    sector: partial.sector,
    industry: partial.industry,
    peerCount: null,
    medianEvents: null,
    myEvents: partial.myEvents ?? null,
    percentile: null,
    percentileBand: partial.percentileBand ?? null,
  }
}

/** `null` means the read failed. The caller must render `unknown`, not `not set`. */
export async function readSectorBenchmark(tenantId: string): Promise<SectorBenchmarkRead | null> {
  // Caller's own metadata: RLS-scoped session client.
  const { data: meta, error: metaError } = await createClient()
    .from('tenant_metadata')
    .select('sector, industry')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (metaError) return null

  const sector = meta?.sector ?? null
  const industry = meta?.industry ?? null

  if (!sector) return result({ hasSector: false, sector: null, industry: null })

  // A legacy free-text sector is not a cohort key: letting a caller choose an
  // arbitrary string is how a two-tenant cohort is engineered.
  if (!(SETUP_SECTOR_VALUES as readonly string[]).includes(sector)) {
    return result({ hasSector: true, sector, industry })
  }

  const admin = createAdminClient()

  // Cross-tenant peer IDs: service_role, server-side only. No raw row leaves
  // this function.
  const { data: peers, error: peersError } = await admin
    .from('tenant_metadata')
    .select('tenant_id')
    .eq('sector', sector)

  if (peersError) return null

  const peerTenantIds = peers.map((p) => p.tenant_id)
  if (peerTenantIds.length === 0) return result({ hasSector: true, sector, industry })

  const { data: homes, error: homesError } = await admin
    .from('v_tenant_home')
    .select('tenant_id, event_count')
    .in('tenant_id', peerTenantIds)

  if (homesError) return null

  const eventCounts = homes
    .map((h) => h.event_count)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
    .sort((a, b) => a - b)

  const myRow = homes.find((h) => h.tenant_id === tenantId)
  const myEvents =
    typeof myRow?.event_count === 'number' && Number.isFinite(myRow.event_count) ? myRow.event_count : null

  return result({
    hasSector: true,
    sector,
    industry,
    myEvents,
    percentileBand: sectorPercentileBand(myEvents, eventCounts),
  })
}
