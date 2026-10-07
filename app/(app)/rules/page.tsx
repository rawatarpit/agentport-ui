import { RulesEditor } from '@/components/rules-editor'
import { DenialReasons } from '@/components/denial-reasons'
import { GolivePanel } from '@/components/golive-panel'
import { EnforcingPanel } from '@/components/enforcing-panel'

export const dynamic = 'force-dynamic'

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Limits</p>
        <h2 className="mt-2 font-display text-3xl text-bone">What needs a human, and what is always no</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Refused, held, capped — in words you would use with staff. Saving here
          writes a draft you can review. Nothing is live until it is merged and
          your runtime reports it.
        </p>
      </div>
      <EnforcingPanel draftLabel="rules draft" />
      <DenialReasons />
      <RulesEditor />
      <GolivePanel />
    </div>
  )
}
