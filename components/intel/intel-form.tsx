'use client'

import { useEffect, useState } from 'react'
import { Select, type SelectOption } from '@/components/ui/select'
import { track } from '@/lib/funnel-events'
import {
  BUSINESS_MODELS,
  CUSTOMER_SEGMENTS,
  INDUSTRY_FAMILIES,
  reviewedSelectValue,
} from '@/lib/intelligence/sectors'
import type { ResearchProfile } from '@/lib/intelligence/types'

const familyOptions: SelectOption[] = [
  { value: '', label: 'Choose a family, or type your own below' },
  ...INDUSTRY_FAMILIES.map((item) => ({ value: item.id, label: item.label })),
]

const businessModelOptions: SelectOption[] = [
  { value: '', label: 'Not specified' },
  ...BUSINESS_MODELS.map((label) => ({ value: label, label })),
]

const customerSegmentOptions: SelectOption[] = [
  { value: '', label: 'Not specified' },
  ...CUSTOMER_SEGMENTS.map((label) => ({ value: label, label })),
]

/**
 * A plain GET form: the report URL carries the answers, so the report page can
 * stay a server component and nothing is written to a store on submit.
 */
function familyForProfile(profile: ResearchProfile | undefined): string {
  if (!profile) return ''
  const fromSubIndustry = INDUSTRY_FAMILIES.find((item) =>
    profile.subIndustry ? item.subcategories.includes(profile.subIndustry) : false,
  )
  if (fromSubIndustry) return fromSubIndustry.id
  return INDUSTRY_FAMILIES.find((item) => item.label === profile.industry)?.id ?? ''
}

export function IntelForm({ initialProfile }: { initialProfile?: ResearchProfile }) {
  const [submitting, setSubmitting] = useState(false)
  const initialFamily = INDUSTRY_FAMILIES.find((item) => item.id === familyForProfile(initialProfile)) ?? null
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? '')
  const [industry, setIndustry] = useState(initialProfile?.industry ?? '')
  const [subIndustry, setSubIndustry] = useState(() =>
    reviewedSelectValue(initialProfile?.subIndustry, initialFamily?.subcategories ?? []),
  )
  const [geography, setGeography] = useState(initialProfile?.geography ?? initialProfile?.country ?? '')
  const family = INDUSTRY_FAMILIES.find((item) => item.id === familyId) ?? null
  const subIndustryOptions: SelectOption[] = [
    { value: '', label: family ? 'Not specified' : 'Choose a family first' },
    ...(family?.subcategories.map((label) => ({ value: label, label })) ?? []),
  ]

  useEffect(() => {
    track({ event_type: 'intelligence_page_viewed' })
  }, [])

  const handleFamilyChange = (value: string) => {
    const next = INDUSTRY_FAMILIES.find((item) => item.id === value) ?? null
    setFamilyId(value)
    setSubIndustry('')
    if (next) {
      setIndustry(next.label)
      track({ event_type: 'industry_selected' })
    }
  }

  const handleIndustryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIndustry(event.target.value)
    track({ event_type: 'industry_selected' })
  }

  const handleGeographyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setGeography(event.target.value)
    track({ event_type: 'geography_selected' })
  }

  return (
    <form
      action="/intelligence/report"
      method="GET"
      aria-busy={submitting}
      onSubmit={() => setSubmitting(true)}
      className="panel space-y-5 p-5 sm:p-7"
    >
      <div>
        <label htmlFor="industry-family" className="field-label">
          Industry family <span className="font-normal text-bone-faint">(optional shortcut)</span>
        </label>
        <Select
          id="industry-family"
          options={familyOptions}
          value={familyId}
          onChange={handleFamilyChange}
        />
        <p className="field-help">A navigation aid only. It carries no market figures or claims.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="company-name" className="field-label">
            Company name <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <input
            id="company-name"
            name="companyName"
            className="input"
            maxLength={120}
            autoComplete="organization"
            placeholder="e.g. Acme Retail"
            defaultValue={initialProfile?.companyName ?? ''}
          />
        </div>
        <div>
          <label htmlFor="industry" className="field-label">
            Industry
          </label>
          <input
            id="industry"
            name="industry"
            className="input"
            required
            maxLength={120}
            autoComplete="organization-title"
            list="industry-suggestions"
            placeholder="e.g. Specialty retail"
            value={industry}
            onChange={handleIndustryChange}
          />
          <datalist id="industry-suggestions">
            {INDUSTRY_FAMILIES.flatMap((item) => [item.label, ...item.subcategories]).map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sub-industry" className="field-label">
            Sub-industry <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <Select
            id="sub-industry"
            name="subIndustry"
            options={subIndustryOptions}
            value={subIndustry}
            disabled={!family}
            onChange={setSubIndustry}
          />
        </div>
        <div>
          <label htmlFor="geography" className="field-label">
            Geography / country <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <input
            id="geography"
            name="country"
            className="input"
            maxLength={80}
            autoComplete="country-name"
            placeholder="e.g. India"
            value={geography}
            onChange={handleGeographyChange}
          />
          <input type="hidden" name="geography" value={geography} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="website" className="field-label">
            Website <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <input
            id="website"
            name="website"
            type="url"
            className="input"
            maxLength={300}
            autoComplete="url"
            placeholder="https://example.com"
            defaultValue={initialProfile?.website ?? ''}
          />
        </div>
        <div>
          <label htmlFor="products-services" className="field-label">
            Products / services <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <input
            id="products-services"
            name="productsServices"
            className="input"
            maxLength={400}
            placeholder="e.g. Groceries, prepared food"
            defaultValue={initialProfile?.productsServices ?? ''}
          />
        </div>
      </div>

      <div>
        <label htmlFor="objective" className="field-label">
          What would you like agents to help with? <span className="font-normal text-bone-faint">(optional)</span>
        </label>
        <textarea
          id="objective"
          name="objective"
          className="input min-h-[90px] resize-y"
          maxLength={500}
          placeholder="e.g. Let agents answer product questions and prepare orders for review"
          defaultValue={initialProfile?.objectives.join(', ') ?? ''}
        />
        <p className="field-help">Separate several aims with commas. They become interpretation inputs, not evidence.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="business-model" className="field-label">
            Business model <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <Select
            id="business-model"
            name="businessModel"
            options={businessModelOptions}
            defaultValue={reviewedSelectValue(initialProfile?.businessModel, BUSINESS_MODELS)}
          />
        </div>
        <div>
          <label htmlFor="customer-segment" className="field-label">
            Customer segment <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <Select
            id="customer-segment"
            name="customerSegment"
            options={customerSegmentOptions}
            defaultValue={reviewedSelectValue(initialProfile?.customerSegment, CUSTOMER_SEGMENTS)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-5">
        <button type="submit" className="btn btn-primary px-5 py-2.5" disabled={submitting}>
          {submitting ? 'Opening your report…' : 'Generate preview'}
        </button>
        <p aria-live="polite" className="sr-only">
          {submitting ? 'Opening your report. Public sources are read on the server.' : ''}
        </p>
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            Public providers are used when available. Any section without a source stays unknown — no invented numbers.
          </p>
      </div>
    </form>
  )
}
