import { getTenantProfileDb } from '@/lib/durable-store'
import { createClient } from '@/lib/supabase/server'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { cleanText, emptyProfile, profileFromRecord, type ResearchProfile } from './types'

/**
 * Tenant profile for the signed-in Intelligence surfaces.
 *
 * The profile is merchant-declared metadata, not research. Every missing field
 * stays null (industry is the empty string because that is ResearchProfile's
 * honest-empty representation), and no market figure is derived from it.
 * Only reviewed tenant_metadata columns are read here.
 */
export type TenantMetadataRow = {
  industry: string | null
  sector: string | null
}

export type TenantProfileRead = {
  tenantId: string | null
  profile: ResearchProfile
  /** A metadata row was found, even if every field in it was null. */
  metadataFound: boolean
  /** The RLS read itself failed. An empty row is not a failure. */
  readFailed: boolean
}

/**
 * Pure mapping from the reviewed durable fields to the research shape.
 *
 * The site address comes from getTenantProfileDb, not tenant_metadata. Country
 * is deliberately absent: declaring it needs a migration and a custody review,
 * not a wider SELECT on this surface.
 */
export function profileFromTenant(
  row: Partial<TenantMetadataRow> | null | undefined,
  websiteUrl: string | null = null,
): ResearchProfile {
  const empty = emptyProfile()
  const metadata = row && typeof row === 'object' ? row : null
  return profileFromRecord({
    industry: cleanText(metadata?.industry, 120) ?? empty.industry,
    subIndustry: cleanText(metadata?.sector, 120),
    website: cleanText(websiteUrl, 300),
  })
}

/**
 * Read through the session client only. RLS decides which row is visible, and
 * the explicit tenant filter keeps a second membership out of this profile.
 */
export async function readTenantResearchProfile(): Promise<TenantProfileRead> {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return { tenantId: null, profile: emptyProfile(), metadataFound: false, readFailed: false }
  }

  const tenantId = tenant.active.tenantId
  const db = createClient()
  let row: Partial<TenantMetadataRow> | null = null
  let readFailed = false

  try {
    // The reviewed projection is industry + sector only. A wide probe of
    // unreviewed columns could fail the whole read after a schema change.
    const metadata = await db
      .from('tenant_metadata')
      .select('industry, sector')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (metadata.error) readFailed = true
    else row = (metadata.data as Partial<TenantMetadataRow> | null) ?? null
  } catch {
    readFailed = true
  }

  // website_url lives on the SDK-owned tenant row; the same RLS session reads
  // it, so the site address cannot widen custody here.
  const site = readFailed ? null : await getTenantProfileDb(tenantId)
  if (row === null && !site?.websiteUrl) {
    return { tenantId, profile: emptyProfile(), metadataFound: false, readFailed }
  }

  const profile = profileFromTenant(row, site?.websiteUrl ?? null)
  return { tenantId, profile, metadataFound: row !== null, readFailed }
}
