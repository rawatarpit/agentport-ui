import type { ResearchProfile } from '@/lib/intelligence/types'

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-t border-ink-line/70 py-2.5 first:border-t-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-bone-faint">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-bone">{value ?? 'unknown'}</dd>
    </div>
  )
}

/** Combine submitted answers without adding any new claim or evidence. */
function submitted(...values: Array<string | null | undefined>): string | null {
  const parts = values
    .map((value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null))
    .filter((value): value is string => value !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** These are the visitor's own answers, not verified facts about the market. */
export function ProfileSummary({ profile }: { profile: ResearchProfile }) {
  const targetMarket = submitted(profile.customerSegment, profile.geography ?? profile.country)
  const businessDescription = submitted(
    profile.productsServices,
    profile.objectives.length > 0 ? profile.objectives.join(', ') : null,
  )

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="font-display text-[18px] text-bone">
        What you submitted
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
        Profile fields are inputs to this preview. They are not external research and are not saved here.
      </p>
      <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
        <Row label="Industry" value={profile.industry || null} />
        <Row label="Sub-industry" value={profile.subIndustry} />
        <Row label="Country" value={profile.country} />
        <Row label="Website" value={profile.website} />
        <Row label="Business model" value={profile.businessModel} />
        <Row label="Customer segment" value={profile.customerSegment} />
        <Row label="Objective" value={profile.objectives.length > 0 ? profile.objectives.join(', ') : null} />
        <Row label="Target market" value={targetMarket} />
        <Row label="Business description" value={businessDescription} />
      </dl>
      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-bone-faint">
        Target market and Business description are combined views of the answers above, not research findings.
      </p>
    </section>
  )
}
