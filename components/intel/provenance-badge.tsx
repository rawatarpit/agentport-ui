import { Chip, type ChipTone } from '@/components/ui/chip'
import type { Confidence, Provenance } from '@/lib/intelligence/types'

const TONES: Record<Provenance, ChipTone> = {
  verified: 'info',
  reported: 'info',
  derived: 'info',
  interpretation: 'warn',
  forecast: 'warn',
  illustrative: 'warn',
  unknown: 'neutral',
}

const LABELS: Record<Provenance, string> = {
  verified: 'verified',
  reported: 'reported',
  derived: 'derived',
  interpretation: 'interpretation',
  forecast: 'estimate',
  illustrative: 'illustrative',
  unknown: 'unknown',
}

const EXPLANATIONS: Record<Provenance, string> = {
  verified: 'Confirmed from a submitted field or a cited source.',
  reported: 'Stated by a named source, with its period shown.',
  derived: 'Calculated from cited values; the method is disclosed.',
  interpretation: 'A reasoned reading of the profile, not measured demand.',
  forecast: 'A conditional estimate, never a default value.',
  illustrative: 'Invented for layout review; not a citation or market research.',
  unknown: 'No source is connected. Rendered as unknown, never zero.',
}

/**
 * Provenance is part of the value, not chrome beside it. A badge never uses a
 * success colour: a sourced profile fact is not a claim about the market.
 */
export function ProvenanceBadge({
  provenance,
  confidence,
}: {
  provenance: Provenance
  confidence?: Confidence
}) {
  const label =
    confidence && confidence !== 'unknown'
      ? `${LABELS[provenance]} · ${confidence} confidence`
      : LABELS[provenance]

  return (
    <Chip tone={TONES[provenance]} title={EXPLANATIONS[provenance]}>
      {label}
    </Chip>
  )
}
