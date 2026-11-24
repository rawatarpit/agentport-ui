'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/funnel-events'
import { BUSINESS_MODELS, CUSTOMER_SEGMENTS, INDUSTRY_FAMILIES } from '@/lib/intelligence/sectors'

/**
 * A plain GET form: the report URL carries the answers, so the report page can
 * stay a server component and nothing is written to a store on submit.
 */
export function IntelForm() {
  const [familyId, setFamilyId] = useState('')
  const [industry, setIndustry] = useState('')
  const [subIndustry, setSubIndustry] = useState('')
  const family = INDUSTRY_FAMILIES.find((item) => item.id === familyId) ?? null

  // Track that the intelligence preview was viewed.
  useEffect(() => {
    track({ event_type: 'intelligence_viewed' })
  }, [])

  const handleFamilyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = INDUSTRY_FAMILIES.find((item) => item.id === event.target.value) ?? null
    setFamilyId(event.target.value)
    setSubIndustry('')
    if (next) {
      setIndustry(next.label)
      track({ event_type: 'industry_selected', industry: next.label })
    }
  }

  const handleIndustryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIndustry(event.target.value)
    track({ event_type: 'industry_selected', industry: event.target.value })
  }

  const handleCountryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    track({ event_type: 'geography_selected', geography: event.target.value })
  }

  return (
    <form action="/intelligence/report" method="GET" className="panel space-y-5 p-5 sm:p-7">
      <div>
        <label htmlFor="industry-family" className="field-label">
          Industry family <span className="font-normal text-bone-faint">(optional shortcut)</span>
        </label>
        <select
          id="industry-family"
          className="input"
          value={familyId}
          onChange={handleFamilyChange}
        >
          <option value="">Choose a family, or type your own below</option>
          {INDUSTRY_FAMILIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="field-help">A navigation aid only. It carries no market figures or claims.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
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

        <div>
          <label htmlFor="sub-industry" className="field-label">
            Sub-industry <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <select
            id="sub-industry"
            name="subIndustry"
            className="input"
            value={subIndustry}
            disabled={!family}
            onChange={(event) => setSubIndustry(event.target.value)}
          >
            <option value="">{family ? 'Not specified' : 'Choose a family first'}</option>
            {family?.subcategories.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="country" className="field-label">
            Country <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <input
            id="country"
            name="country"
            className="input"
            maxLength={80}
            autoComplete="country-name"
            placeholder="e.g. India"
            onChange={handleCountryChange}
          />
        </div>
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
        />
        <p className="field-help">Separate several aims with commas. They become interpretation inputs, not evidence.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="business-model" className="field-label">
            Business model <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <select id="business-model" name="businessModel" className="input" defaultValue="">
            <option value="">Not specified</option>
            {BUSINESS_MODELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="customer-segment" className="field-label">
            Customer segment <span className="font-normal text-bone-faint">(optional)</span>
          </label>
          <select id="customer-segment" name="customerSegment" className="input" defaultValue="">
            <option value="">Not specified</option>
            {CUSTOMER_SEGMENTS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-line pt-5">
        <button type="submit" className="btn btn-primary px-5 py-2.5">
          Generate preview
        </button>
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            Public providers are used when available. Any section without a source stays unknown — no invented numbers.
          </p>
      </div>
    </form>
  )
}
