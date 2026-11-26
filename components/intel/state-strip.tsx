import {
  META,
  resolveIntelligenceState,
  toneClass,
  type IntelligenceBackendState,
  type IntelligenceState,
} from '@/lib/intelligence/state-meta'

export type { IntelligenceBackendState, IntelligenceState } from '@/lib/intelligence/state-meta'

export function IntelligenceStateStrip({ state }: { state: unknown }) {
  const resolved = resolveIntelligenceState(state)
  if (!resolved) return null
  const meta = META[resolved]
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass(meta.tone)}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">State: {meta.label}</span>
        <span className="text-[12px] leading-relaxed">{meta.detail}</span>
      </div>
    </div>
  )
}
