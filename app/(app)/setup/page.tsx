import Link from 'next/link'
import { SetupWizard } from '@/components/setup-wizard'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

/**
 * The wizard the merchant actually arrives at.
 *
 * Four questions, then one line. The end state is a saved draft they can
 * publish — not a file to edit here, and not a change that silently does
 * nothing.
 */
export default function SetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Get started"
        title="Four questions"
        description="These answers become your first safety rules: what agents may do on their own, what waits for your approval, and what is always refused. Two minutes, plain words, no jargon — and nothing takes effect until you publish it."
        actions={
          <Link href="/go-live" className="btn btn-primary">
            Open go-live
          </Link>
        }
      />

      <SetupWizard />
    </div>
  )
}
