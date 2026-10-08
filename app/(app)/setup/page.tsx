import { SetupWizard } from '@/components/setup-wizard'

export const dynamic = 'force-dynamic'

/**
 * The wizard the merchant actually arrives at.
 *
 * TASKS.md 6.1: four questions, then one line. The end state is a command they
 * can paste into their own project — not a file to edit here, and not a saved
 * change that silently does nothing.
 */
export default function SetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Get started</p>
          <h1 className="mt-2 font-display text-3xl text-bone">Four questions</h1>
          <p className="prose-bone mt-3 max-w-[68ch]">
            These answers become your first safety rules: what agents may do on
            their own, what waits for your approval, and what is always
            refused. Two minutes, plain words, no jargon — and everything can
            be changed later. Nothing here takes effect until you publish it.
          </p>
      </div>

      <SetupWizard />
    </div>
  )
}