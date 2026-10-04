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
        <h2 className="mt-2 font-display text-3xl text-bone">Four questions</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          No jargon, and no file to edit. Answer these and you have a policy you can
          paste into your project and run. Nothing here takes effect until you merge
          it and start your runtime.
        </p>
      </div>

      <SetupWizard />
    </div>
  )
}