import { Callout } from '@/components/ui/callout'

const TERMS = [
  {
    term: 'Fact',
    detail: 'A verified or reported statement tied to a submitted field or a named source with a period.',
  },
  {
    term: 'Estimate',
    detail: 'A conditional figure from a dated model. It is never used to fill a missing value by default.',
  },
  {
    term: 'Derived',
    detail: 'A number calculated from cited values, with the calculation and its inputs disclosed.',
  },
  {
    term: 'Interpretation',
    detail: 'A reasoned reading of the profile or a product principle. It is not measured demand.',
  },
  {
    term: 'Illustrative',
    detail: 'A fictional value used only to review the layout. It is not a citation and not market research.',
  },
  {
    term: 'Unknown',
    detail: 'Nothing is connected. It renders as unknown, never as zero or a healthy state.',
  },
]

/** The citation key stays on the page so a badge can never outrun its meaning. */
export function ProvenancePanel() {
  return (
    <Callout tone="info" title="How to read the evidence labels">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {TERMS.map((item) => (
          <div key={item.term}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-bone">{item.term}</dt>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-bone-dim">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </Callout>
  )
}
