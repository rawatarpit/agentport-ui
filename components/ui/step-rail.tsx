export type StepState = 'done' | 'current' | 'blocked' | 'todo'

export type RailStep = {
  id: string
  number: string
  title: string
  summary?: string
  state: StepState
}

const DOT: Record<StepState, string> = {
  done: 'border-verdant bg-verdant text-ink',
  current: 'border-verdant bg-ink text-verdant',
  blocked: 'border-rust bg-rust/10 text-rust',
  todo: 'border-ink-line bg-ink text-bone-faint',
}

const LABEL: Record<StepState, string> = {
  done: 'done',
  current: 'now',
  blocked: 'blocked',
  todo: 'next',
}

/**
 * The pipeline, always visible. A merchant should never have to remember which
 * screen is the next one; the rail names the work in order and links to it.
 *
 * It scrolls horizontally on a phone rather than becoming a disclosure: the
 * sequence is the information.
 */
export function StepRail({ steps }: { steps: RailStep[] }) {
  return (
    <nav aria-label="Go-live steps" className="lg:sticky lg:top-6">
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {steps.map((s) => (
          <li key={s.id} className="min-w-[220px] shrink-0 lg:min-w-0">
            <a
              href={`#${s.id}`}
              aria-current={s.state === 'current' ? 'step' : undefined}
              className={`flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                s.state === 'current'
                  ? 'border-verdant/40 bg-verdant/[0.06]'
                  : 'border-transparent hover:border-ink-line hover:bg-ink/40'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${DOT[s.state]}`}
              >
                {s.state === 'done' ? '✓' : s.number}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] leading-snug text-bone">{s.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-bone-faint">
                    {LABEL[s.state]}
                  </span>
                </span>
                {s.summary ? <span className="mt-0.5 block text-[11.5px] leading-snug text-bone-faint">{s.summary}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
