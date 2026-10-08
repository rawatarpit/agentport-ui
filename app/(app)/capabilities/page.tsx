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
      </div>

      <CapabilitiesEditor />
    </div>
  )
}