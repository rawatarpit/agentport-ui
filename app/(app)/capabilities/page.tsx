import Link from 'next/link'
import { CapabilitiesEditor, type InventoryCap } from '@/components/capabilities-editor'
import { PageHeader } from '@/components/ui/page-header'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * The capability names the active config actually serves.
 *
 * The inventory table keeps rows for capabilities that were removed on purpose:
 * the apply RPC preserves their classification so re-adding one does not
 * silently reset it to `internal`/held. That means the inventory is a superset
 * of what is live, and rendering it as "Approved" overstates what the governor
 * will execute. `tenant_config_versions` has no member SELECT policy, so the
 * page proves membership first (resolveRequestTenant) and then reads with the
 * service role, the same pattern as the publish routes.
 *
 * Null means unknown: the inventory renders unfiltered with an honest caveat
 * rather than claiming a capability is dead.
 */
async function readActiveCapabilityNames(tenantId: string): Promise<string[] | null> {
  try {
    const admin = createAdminClient()
    const { data: runtime, error: runtimeError } = await admin
      .from('tenant_runtime')
      .select('active_config_version')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (runtimeError) return null
    const version = Number(
      (runtime as { active_config_version?: unknown } | null)?.active_config_version ?? 0,
    )
    if (!Number.isInteger(version) || version <= 0) return []
    const { data: row, error } = await admin
      .from('tenant_config_versions')
      .select('capabilities')
      .eq('tenant_id', tenantId)
      .eq('version', version)
      .maybeSingle()
    if (error || !row) return null
    const caps = (row as { capabilities?: unknown }).capabilities
    if (!Array.isArray(caps)) return null
    const names: string[] = []
    for (const cap of caps) {
      if (!cap || typeof cap !== 'object') return null
      const name = (cap as { name?: unknown }).name
      if (typeof name !== 'string') return null
      names.push(name)
    }
    return names
  } catch {
    return null
  }
}

/**
 * What agents can see. The inventory is the approved table, not the draft:
 * a field hidden in an unsaved draft has not been hidden from anyone yet.
 */
export default async function CapabilitiesPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading the inventory.</p>
      </div>
    )
  }

  const [{ data, error }, activeNames] = await Promise.all([
    tenant.supabase
      .from('agent_capabilities')
      // The column is snake_case (data_class); PostgREST columns are
      // case-sensitive, so a bare `dataClass` here errors 42703 and the whole
      // inventory reads unknown. Alias it to the shape the editor expects.
      .select('name,method,path,kind,origin,dataClass:data_class')
      .eq('tenant_id', tenant.active.tenantId)
      .order('name', { ascending: true }),
    readActiveCapabilityNames(tenant.active.tenantId),
  ])

  const inventory: InventoryCap[] | null = error ? null : ((data ?? []) as InventoryCap[])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discover"
        title="What agents can see"
        description="Your capabilities in one list. Add an API or remove one and apply — the hosted governor serves the change on its next poll. No rebuild, no pull request. A catalogue entry alone is a description; only a mapped route can run."
        actions={
          <>
            <Link href="/map" className="btn">
              Scan site
            </Link>
            <Link href="/go-live" className="btn">
              First-time setup
            </Link>
          </>
        }
      />

      {inventory === null ? (
        <div className="panel p-5">
          <p className="text-[13px] text-rust" role="alert">
            The capability inventory could not be read. This is unknown — not an empty inventory.
            Reload to try again.
          </p>
        </div>
      ) : (
        <CapabilitiesEditor inventory={inventory} activeNames={activeNames} />
      )}
    </div>
  )
}
