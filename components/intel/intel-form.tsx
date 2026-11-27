'use client'

import { useEffect, useRef, useState } from 'react'
import { AnswerJourney } from '@/components/intel/answer-journey'
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

const STEPS = [
  'What industry are you in?',
  'What is your company called?',
  'Where is your website?',
  'Where do you operate?',
  'What do you sell?',
  'What should agents help with?',
  'Which business model fits?',
  'Who are your customers?',
  'Ready to build your preview?',
] as const

/**
 * A plain GET form presented one question at a time.
 *
 * Every named input stays mounted in a hidden wrapper. Unmounting an inactive
 * step would lose uncontrolled answers; disabling it would suppress the custom
 * Select's hidden inputs. Neither is acceptable — the report URL must carry
 * exactly what the visitor entered, in the original ten fields.
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
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  const initialFamily = INDUSTRY_FAMILIES.find((item) => item.id === familyForProfile(initialProfile)) ?? null
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? '')
  const [industry, setIndustry] = useState(initialProfile?.industry ?? '')
  const [subIndustry, setSubIndustry] = useState(() =>
    reviewedSelectValue(initialProfile?.subIndustry, initialFamily?.subcategories ?? []),
  )
  const [geography, setGeography] = useState(initialProfile?.geography ?? initialProfile?.country ?? '')
  const [companyName, setCompanyName] = useState(initialProfile?.companyName ?? '')
  const [website, setWebsite] = useState(initialProfile?.website ?? '')
  const [productsServices, setProductsServices] = useState(initialProfile?.productsServices ?? '')
  const [objective, setObjective] = useState(initialProfile?.objectives.join(', ') ?? '')
  const [businessModel, setBusinessModel] = useState(() =>
    reviewedSelectValue(initialProfile?.businessModel, BUSINESS_MODELS),
  )
  const [customerSegment, setCustomerSegment] = useState(() =>
    reviewedSelectValue(initialProfile?.customerSegment, CUSTOMER_SEGMENTS),
  )

  const family = INDUSTRY_FAMILIES.find((item) => item.id === familyId) ?? null
  const subIndustryOptions: SelectOption[] = [
    { value: '', label: family ? 'Not specified' : 'Choose a family first' },
    ...(family?.subcategories.map((label) => ({ value: label, label })) ?? []),
  ]

  useEffect(() => {
    track({ event_type: 'intelligence_page_viewed' })
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const handleFamilyChange = (value: string) => {
    const next = INDUSTRY_FAMILIES.find((item) => item.id === value) ?? null
    setFamilyId(value)
    setSubIndustry('')
    setError(null)
    if (next) {
      setIndustry(next.label)
      track({ event_type: 'industry_selected' })
    }
  }

  const handleIndustryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIndustry(event.target.value)
    setError(null)
    track({ event_type: 'industry_selected' })
  }

  const handleGeographyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setGeography(event.target.value)
    track({ event_type: 'geography_selected' })
  }

  const handleNext = () => {
    if (step === 0 && industry.trim().length === 0) {
      setError('Choose a family or type your industry to continue.')
      return
    }
    setError(null)
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.closest('[role="combobox"]') || target.tagName === 'BUTTON') return
    if (target.tagName === 'TEXTAREA' && event.shiftKey) return
    event.preventDefault()
    if (step === STEPS.length - 1) event.currentTarget.requestSubmit()
    else handleNext()
  }

  const summary = [
    { term: 'Industry', value: industry || 'Not provided' },
    { term: 'Company', value: companyName || 'Not provided' },
    { term: 'Website', value: website || 'Not provided' },
    { term: 'Geography', value: geography || 'Not provided' },
  ]

  return (
    <form
      action="/intelligence/report"
      method="GET"
      noValidate
      aria-busy={submitting}
      onSubmit={() => setSubmitting(true)}
      onKeyDown={handleFormKeyDown}
      className="panel-strong mx-auto w-full max-w-3xl overflow-hidden"
    >
      <div className="border-b border-ink-line px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">Build your preview</p>
          <p className="font-mono text-[11px] text-bone-faint">
            Question {String(step + 1).padStart(2, '0')} of {STEPS.length}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-9 gap-1" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`h-1 rounded-full ${index <= step ? 'bg-verdant' : 'bg-ink-line/70'}`}
            />
          ))}
        </div>
      </div>

      <div className="min-h-[520px] px-5 py-10 sm:px-8 sm:py-14">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-balance font-display text-[clamp(1.65rem,4vw,2.4rem)] leading-[1.08] tracking-[-0.02em] text-bone outline-none"
        >
          {STEPS[step]}
        </h2>

        <div hidden={step !== 0} className="mt-8 max-w-2xl space-y-5">
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
            <p className="field-help">A shortcut only. It fills the industry answer below.</p>
          </div>
          <div>
            <label htmlFor="industry" className="field-label">Industry</label>
            <input
              id="industry"
              name="industry"
              className="input text-[16px]"
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
            <p className="field-help">
              Your industry — or products/services only when this is blank — is the GitHub public repository
              search term. Do not put secrets in these fields.
            </p>
          </div>
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
        </div>

        <div hidden={step !== 1} className="mt-8 max-w-2xl">
          <label htmlFor="company-name" className="field-label">Company name</label>
          <input
            id="company-name"
            name="companyName"
            className="input text-[16px]"
            maxLength={120}
            autoComplete="organization"
            placeholder="e.g. Acme Retail"
            defaultValue={initialProfile?.companyName ?? ''}
            onChange={(event) => setCompanyName(event.target.value)}
          />
          <p className="field-help">
            If supplied, this is matched locally against the public SEC ticker list; only the resulting CIK is
            fetched. Blank skips that lookup.
          </p>
        </div>

        <div hidden={step !== 2} className="mt-8 max-w-2xl">
          <label htmlFor="website" className="field-label">Website</label>
          <input
            id="website"
            name="website"
            type="url"
            className="input text-[16px]"
            maxLength={300}
            autoComplete="url"
            placeholder="https://example.com"
            defaultValue={initialProfile?.website ?? ''}
            onChange={(event) => setWebsite(event.target.value)}
          />
          <p className="field-help">Used only to interpret the preview and, after signup, in your own saved profile.</p>
        </div>

        <div hidden={step !== 3} className="mt-8 max-w-2xl">
          <label htmlFor="geography" className="field-label">Geography / country</label>
          <input
            id="geography"
            name="country"
            className="input text-[16px]"
            maxLength={80}
            autoComplete="country-name"
            placeholder="e.g. India"
            value={geography}
            onChange={handleGeographyChange}
          />
          <input type="hidden" name="geography" value={geography} />
          <p className="field-help">
            Selects a country row from a World Bank dataset on our server. It is not sent as a search term.
          </p>
        </div>

        <div hidden={step !== 4} className="mt-8 max-w-2xl">
          <label htmlFor="products-services" className="field-label">Products / services</label>
          <input
            id="products-services"
            name="productsServices"
            className="input text-[16px]"
            maxLength={400}
            placeholder="e.g. Groceries, prepared food"
            defaultValue={initialProfile?.productsServices ?? ''}
            onChange={(event) => setProductsServices(event.target.value)}
          />
          <p className="field-help">A short list is enough. If industry is blank, this becomes the public search term.</p>
        </div>

        <div hidden={step !== 5} className="mt-8 max-w-2xl">
          <label htmlFor="objective" className="field-label">What would you like agents to help with?</label>
          <textarea
            id="objective"
            name="objective"
            className="input min-h-[140px] resize-y text-[16px]"
            maxLength={500}
            placeholder="e.g. Let agents answer product questions and prepare orders for review"
            defaultValue={initialProfile?.objectives.join(', ') ?? ''}
            onChange={(event) => setObjective(event.target.value)}
          />
          <p className="field-help">Separate several aims with commas. They become interpretation inputs, not evidence.</p>
        </div>

        <div hidden={step !== 6} className="mt-8 max-w-2xl">
          <label htmlFor="business-model" className="field-label">Business model</label>
          <Select
            id="business-model"
            name="businessModel"
            options={businessModelOptions}
            defaultValue={reviewedSelectValue(initialProfile?.businessModel, BUSINESS_MODELS)}
            onChange={setBusinessModel}
          />
        </div>

        <div hidden={step !== 7} className="mt-8 max-w-2xl">
          <label htmlFor="customer-segment" className="field-label">Customer segment</label>
          <Select
            id="customer-segment"
            name="customerSegment"
            options={customerSegmentOptions}
            defaultValue={reviewedSelectValue(initialProfile?.customerSegment, CUSTOMER_SEGMENTS)}
            onChange={setCustomerSegment}
          />
        </div>

        <div hidden={step !== 8} className="mt-8 space-y-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {summary.map((item) => (
              <div key={item.term} className="rounded-lg border border-ink-line p-4">
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">{item.term}</dt>
                <dd className="mt-1 break-words text-[13px] text-bone">{item.value}</dd>
              </div>
            ))}
          </dl>
          <AnswerJourney />
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            Public providers are used when available. Any section without a source stays unknown — no invented numbers.
          </p>
        </div>

        {error ? (
          <p className="mt-5 text-[13px] text-rust" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-line px-5 py-4 sm:px-8">
        <button type="button" className="btn btn-sm" onClick={handleBack} disabled={step === 0 || submitting}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button key="continue" type="button" className="btn btn-primary px-5 py-2.5" onClick={handleNext}>
            Continue
          </button>
        ) : (
          <button key="submit" type="submit" className="btn btn-primary px-5 py-2.5" disabled={submitting}>
            {submitting ? 'Opening your report…' : 'Generate preview'}
          </button>
        )}
        <p aria-live="polite" className="sr-only">
          {submitting ? 'Opening your report. Public sources are read on the server.' : ''}
        </p>
      </div>
    </form>
  )
}
