import type { ReportDataMode } from './types'

// No engine here ever reports `ready`; keeping it out of the vocabulary means
// a state the console cannot prove is a state it cannot paint as healthy.
export type IntelligenceBackendState = 'unavailable' | 'not_configured' | 'partial' | 'failed'

export type IntelligenceState = ReportDataMode | IntelligenceBackendState | 'loading' | 'refreshing'

type StateMeta = {
  label: string
  tone: 'neutral' | 'amber' | 'blue' | 'red'
  detail: string
}

export const META: Record<IntelligenceState, StateMeta> = {
  unresearched: {
    label: 'unresearched',
    tone: 'neutral',
    detail: 'No verified external dataset is connected for this report.',
  },
  illustrative: {
    label: 'illustrative',
    tone: 'amber',
    detail: 'Fictional sample only. Not market research.',
  },
  sourced: {
    label: 'sourced',
    tone: 'blue',
    detail: 'Public evidence is attached where available; gaps stay unknown.',
  },
  unavailable: {
    label: 'unavailable',
    tone: 'neutral',
    detail: 'No intelligence engine is connected. Results remain unknown.',
  },
  not_configured: {
    label: 'not_configured',
    tone: 'neutral',
    detail: 'No intelligence engine is connected. Results remain unknown.',
  },
  partial: {
    label: 'partial',
    tone: 'amber',
    detail: 'Some evidence is available, but gaps remain unknown.',
  },
  failed: {
    label: 'failed',
    tone: 'red',
    detail: 'The intelligence request failed. Results remain unknown.',
  },
  loading: {
    label: 'loading',
    tone: 'neutral',
    detail: 'Checking intelligence state.',
  },
  refreshing: {
    label: 'refreshing',
    tone: 'neutral',
    detail: 'Refreshing intelligence state.',
  },
}

export function toneClass(tone: StateMeta['tone']): string {
  if (tone === 'amber') return 'border-amber/40 bg-amber/10 text-amber'
  // `blue` is descriptive only here: verdant is the system's healthy colour,
  // and one source row must never paint a mostly-unknown report green.
  if (tone === 'blue') return 'border-ink-line bg-ink-soft/30 text-bone'
  if (tone === 'red') return 'border-rust/40 bg-rust/10 text-rust'
  return 'border-ink-line bg-ink-soft/30 text-bone-dim'
}

export function resolveIntelligenceState(value: unknown): IntelligenceState | null {
  if (typeof value !== 'string') return null
  return Object.prototype.hasOwnProperty.call(META, value) ? (value as IntelligenceState) : null
}
