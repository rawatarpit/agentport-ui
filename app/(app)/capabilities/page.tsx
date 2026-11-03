import Link from 'next/link'
import { CapabilitiesEditor, type InventoryCap } from '@/components/capabilities-editor'
import { PageHeader } from '@/components/ui/page-header'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

export default async function CapabilitiesPage() {
  const tenant = await resolveRequestTenant()
  let inventory: InventoryCap[] = []
  if (tenant.active.status === 'active') {
    const { data } = await tenant.supabase
      .from('agent_capabilities')
      .select('name,method,path,kind,origin')
      .eq('tenant_id', tenant.active.tenantId)
      .order('name', { ascending: true })
    inventory = (data ?? []) as InventoryCap[]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discover"
        title="What agents can see"
        description="Everything the hosted governor exposes, and which fields an agent is told about. Deciding what an agent may know is a different decision from how far it may go."
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

      <CapabilitiesEditor inventory={inventory} />
    </div>
  )
}