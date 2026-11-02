'use client'

import { useState } from 'react'
import { Badge } from '@/components/stat'
import {
  DEMO_SCENARIOS,
  type DemoCapability,
  type DemoDecision,
  type DemoExecution,
} from '@/lib/landing-demo'

const DECISION_TONE: Record<DemoDecision, 'allow' | 'held' | 'deny'> = {
  allow: 'allow',
  hold: 'held',
  refuse: 'deny',
}

const EXECUTION_TONE: Record<DemoExecution, 'idle' | 'held' | 'deny'> = {
  not_yet_observed: 'idle',
  waiting_for_approval: 'held',
  not_executed: 'deny',
}

const EXECUTION_LABEL: Record<DemoExecution, string> = {
  not_yet_observed: 'Not yet observed',
  waiting_for_approval: 'Waiting for approval',
  not_executed: 'Not executed',
}

const ORDER: DemoCapability[] = [
  'searchProducts',
  'createOrder',
  'requestRefund',
  'deleteAccount',
]

/**
 * The page's one interactive element. It is deliberately a sample: the
 * decisions are fixed, no request leaves the browser, and every panel is
 * labelled illustrative. The result panel distinguishes the policy decision
 * from the execution outcome, because conflating them is how a hold starts to
 * look like a completed action.
 */
export function DecisionDemo() {
  const [selected, setSelected] = useState<DemoCapability>('createOrder')
  const result =
    DEMO_SCENARIOS.find((scenario) => scenario.capability === selected) ?? DEMO_SCENARIOS[0]

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-line px-4 py-3">
          <span className="label">Sample requests</span>
          <span className="rounded-full border border-ink-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-bone-faint">
            Illustrative
          </span>
        </div>

        <ul className="divide-y divide-ink-line/70">
          {ORDER.map((capability) => {
            const scenario =
              DEMO_SCENARIOS.find((item) => item.capability === capability) ?? DEMO_SCENARIOS[0]
            const active = scenario.capability === selected
            return (
              <li key={scenario.capability}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(scenario.capability)}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-verdant/60 ${
                    active ? 'bg-verdant/5' : 'hover:bg-ink/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      active ? 'bg-verdant' : 'bg-ink-line'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-bone">
                      {scenario.capability}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-bone-faint">
                      {scenario.request}
                    </span>
                  </span>
                  <Badge tone={DECISION_TONE[scenario.decision]}>{scenario.decision}</Badge>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="border-t border-ink-line bg-ink/40 px-4 py-3 text-[11px] leading-relaxed text-bone-faint">
          A sample policy, not a live merchant environment. Amounts and rules are
          examples only.
        </p>
      </div>

      <div className="panel overflow-hidden" aria-live="polite">
        <div className="flex items-center justify-between gap-3 border-b border-ink-line px-4 py-3">
          <span className="label">Decision</span>
          <Badge tone={DECISION_TONE[result.decision]}>{result.decision}</Badge>
        </div>

        <dl className="divide-y divide-ink-line/70">
          {[
            ['Capability', result.capability],
            ['Request', result.request],
            ['Context', result.context],
            ['Policy', result.policy],
          ].map(([key, value]) => (
            <div key={key} className="grid grid-cols-[0.55fr_1fr] gap-4 px-4 py-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-bone-faint">
                {key}
              </dt>
              <dd className="font-mono text-[12px] leading-relaxed text-bone">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-ink-line/70 px-4 py-4">
          <p className="label">Reason</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{result.reason}</p>
        </div>

        <div className="border-t border-ink-line/70 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">Execution outcome</p>
            <Badge tone={EXECUTION_TONE[result.execution]}>
              {EXECUTION_LABEL[result.execution]}
            </Badge>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            {result.executionNote}
          </p>
        </div>

        <p className="border-t border-ink-line bg-ink/40 px-4 py-3 font-mono text-[10px] leading-relaxed text-bone-faint">
          A decision is not an execution result. A held request has not run.
        </p>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-bone-faint lg:col-span-2">
        The governor evaluates the amount as request context. The console and
        ledger do not store or return order values.
      </p>
    </div>
  )
}
