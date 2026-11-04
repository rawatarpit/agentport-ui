import Link from 'next/link'
import { CapabilitiesEditor, type InventoryCap } from '@/components/capabilities-editor'
import { PageHeader } from '@/components/ui/page-header'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

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

  const { data, error } = await tenant.supabase
    .from('agent_capabilities')
    .select('name,method,path,kind,origin')
    .eq('tenant_id', tenant.active.tenantId)
    .order('name', { ascending: true })

  const inventory: InventoryCap[] | null = error ? null : ((data ?? []) as InventoryCap[])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discover"
        title="What agents can see"
        description="The approved route inventory, the current draft, and the discovery catalogue's field names. A catalogue entry is a description; only a mapped or approved route can run. Deciding what an agent may know is a different decision from how far it may go."
        actions={
          <>
            <Link href="/map" className="btn btn-primary">
              Map routes
            </Link>
            <Link href="/go-live#capabilities" className="btn">
              Go-live step
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
        <CapabilitiesEditor inventory={inventory} />
      )}
    </div>
  )
}
