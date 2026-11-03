import Link from 'next/link'
import { MapWorkbench } from '@/components/map-workbench'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default function MapPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Map pages"
        title="Which pages can agents use?"
        description="AgentPort only acts on pages you choose. Scan your site, pick the pages, then save. Nothing is live for your visitors until you publish."
        actions={
          <Link href="/capabilities" className="btn btn-primary">
            Review mapped pages
          </Link>
        }
      />

      <MapWorkbench />
    </div>
  )
}
