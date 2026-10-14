import { MapWorkbench } from '@/components/map-workbench'

export const dynamic = 'force-dynamic'

export default function MapPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">DISCOVER</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Map your routes to capabilities</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Paste <span className="font-mono text-[13px] text-bone-dim">agent-port discover</span>,{' '}
          <span className="font-mono text-[13px] text-bone-dim">capture</span>, or{' '}
          <span className="font-mono text-[13px] text-bone-dim">inventory</span> output. This page
          reconciles it into corroborated, undeclared, and unused — you pick
          which endpoints become capabilities, and the draft flows into the
          same publish path as everything else. Repo-tree scanning and live
          URL crawling arrive later; pasted output is the channel that works
          today.
        </p>
      </div>

      <MapWorkbench />
    </div>
  )
}
