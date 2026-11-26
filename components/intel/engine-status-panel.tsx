import { IntelligenceStateStrip } from './state-strip'
import { META, resolveIntelligenceState } from '@/lib/intelligence/state-meta'

/**
 * Research-engine availability is not governor health. The state is resolved
 * through the reviewed vocabulary so an unproven healthy value can never reach
 * the page as a badge.
 */
export function EngineStatusPanel({ state }: { state: unknown }) {
  const resolved = resolveIntelligenceState(state)
  const detail = resolved
    ? META[resolved].detail
    : 'The research engine state is unknown. No result is inferred.'

  return (
    <section aria-label="Research engine status" className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Research engine</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-bone-dim">{detail}</p>
        </div>
        {resolved ? (
          <IntelligenceStateStrip state={resolved} />
        ) : (
          <span className="rounded-lg border border-ink-line bg-ink-soft/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-dim">
            State: unknown
          </span>
        )}
      </div>
      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-bone-faint">
        This describes research availability only. It is not enforcement, governor health, or proof that a
        capability is live.
      </p>
    </section>
  )
}
