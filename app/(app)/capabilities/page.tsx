import { CapabilitiesEditor } from '@/components/capabilities-editor'

export const dynamic = 'force-dynamic'

export default function CapabilitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">DISCOVER</p>
        <h1 className="mt-2 font-display text-3xl text-bone">What agents can see</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Everything your runtime exposes, and which fields an agent is told about. Kept
          separate from limits on purpose: deciding what an agent may know is a different
          decision from deciding how far it may go, and they usually happen at different
          times.
        </p>
        <p className="mt-3 font-mono text-[12px] text-bone-dim">
          New routes? <a className="underline" href="/map">Map them from discover output</a> —
          corroborated, shadow, and dead surface reconciled before anything publishes.
        </p>
      </div>

      <CapabilitiesEditor />
    </div>
  )
}