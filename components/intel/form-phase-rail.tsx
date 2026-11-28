/**
 * Phases describe the form the merchant is filling, never a research process.
 * Research does not start until the GET handoff completes on the server.
 */
export type FormPhase = 'Context' | 'Intent' | 'Review'

export function formPhase(step: number): FormPhase {
  return step <= 3 ? 'Context' : step <= 7 ? 'Intent' : 'Review'
}

export function FormPhaseRail({ step, total }: { step: number; total: number }) {
  const phase = formPhase(step)
  const phaseStep = phase === 'Context' ? step + 1 : phase === 'Intent' ? step - 3 : total - step
  const phaseTotal = phase === 'Context' ? 4 : phase === 'Intent' ? 4 : 1

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] uppercase tracking-[0.12em]">
      <span className="font-mono text-bone-faint">
        Question {String(step + 1).padStart(2, '0')} of {total}
      </span>
      <span className="font-mono text-verdant">
        {phase} · {phaseStep} of {phaseTotal}
      </span>
    </div>
  )
}
