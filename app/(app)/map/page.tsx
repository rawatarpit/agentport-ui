import Link from 'next/link'
import { MapWorkbench } from '@/components/map-workbench'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default function MapPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discover"
        title="Map your routes to capabilities"
        description="Crawl your public site or paste agent-port discover, capture, or inventory output. This page reconciles corroborated, undeclared, and unused routes — you pick which endpoints become executable capabilities."
        actions={
          <>
            <Link href="/capabilities" className="btn btn-primary">
              View mapped routes
            </Link>
            <Link href="/go-live#capabilities" className="btn">
              Go-live step
            </Link>
          </>
        }
      />

      <MapWorkbench />
    </div>
  )
}
