import type { AgentWorkflow } from '@/lib/intelligence/types'

function humanLabel(value: AgentWorkflow['humanConfirmation']): string {
  if (value === 'required') return 'Human confirmation: required before any write or change.'
  if (value === 'recommended') return 'Human confirmation: recommended.'
  return 'Human confirmation: none stated for read-only template; writes still require confirmation.'
}

export function WorkflowList({ workflows }: { workflows: AgentWorkflow[] }) {
  if (workflows.length === 0) return null
  return (
    <div className="space-y-4">
      {workflows.map((workflow) => (
        <article key={workflow.id} className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">Template workflow</p>
              <h3 className="font-display text-[18px] leading-tight text-bone">{workflow.workflowName}</h3>
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">
              <span className="rounded border border-ink-line px-2 py-1">interpretation · low confidence</span>
              <span className="rounded border border-ink-line px-2 py-1">unverified capability</span>
              <span className="rounded border border-amber/40 bg-amber/10 px-2 py-1 text-amber">template only — not executable</span>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-bone-dim">{workflow.customerProblem}</p>
          <p className="text-[13px] leading-relaxed text-bone-dim">{workflow.businessOpportunity}</p>

          <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
            <div><dt className="label">Required capability</dt><dd className="mt-1 text-bone-dim">{workflow.requiredCapability}</dd></div>
            <div><dt className="label">Access</dt><dd className="mt-1 text-bone-dim">{workflow.access}</dd></div>
            <div><dt className="label">Authentication</dt><dd className="mt-1 text-bone-dim">{workflow.authentication}</dd></div>
            <div><dt className="label">Human confirmation</dt><dd className="mt-1 text-bone-dim">{humanLabel(workflow.humanConfirmation)}</dd></div>
            <div><dt className="label">Dependencies</dt><dd className="mt-1 text-bone-dim">{workflow.technicalDependencies.join(', ') || 'Unknown'}</dd></div>
            <div><dt className="label">Required data</dt><dd className="mt-1 text-bone-dim">{workflow.requiredData.join(', ') || 'Unknown'}</dd></div>
          </dl>

          <div className="rounded-lg border border-ink-line bg-ink-soft/20 p-3 text-[12px] leading-relaxed text-bone-dim">
            <p className="label">Evidence / exact negations</p>
            <p className="mt-1">{workflow.evidenceStatement}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Not a live capability.</li>
              <li>Not enabled.</li>
              <li>Not a merchant configuration.</li>
              <li>Not deployable from this report.</li>
              <li>Not executable without explicit merchant review and approval in the real system.</li>
              <li>No amount, ceiling, or spend limit is inferred by this template.</li>
            </ul>
          </div>
        </article>
      ))}
    </div>
  )
}
