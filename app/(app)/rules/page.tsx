import Link from 'next/link'
import { RulesEditor } from '@/components/rules-editor'
import { DenialReasons } from '@/components/denial-reasons'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Limits"
        title="What needs a human, and what is always no"
        description="Refused, held, capped — in words you would use with staff. Saving here writes a draft you can review. Nothing is live until it is approved and the hosted governor reports it."
        actions={
          <Link href="/go-live#publish" className="btn btn-primary">
            Publish from go-live
          </Link>
        }
      />
      <EnforcingPanel draftLabel="rules draft" />
      <DenialReasons />
      <RulesEditor />
      <p className="font-mono text-[11px] text-bone-faint">
        Publishing lives on the go-live path so there is one signature and one record:{' '}
        <Link href="/go-live#publish" className="link">Go to publish</Link>.
      </p>
    </div>
  )
}
