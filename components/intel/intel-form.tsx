'use client'

import { useEffect, useRef, useState } from 'react'
import { AnswerJourney } from '@/components/intel/answer-journey'
import { FormPhaseRail, formPhase } from '@/components/intel/form-phase-rail'
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
 * One question per screen, Typeform-style.
 *
 * Every named input stays mounted in a hidden wrapper. Unmounting an inactive
 * step would lose uncontrolled answers; disabling it would suppress the custom
 * Select's hidden inputs. Neither is acceptable — the report URL must carry
 * exactly what the visitor entered, in the original ten fields.
 *
 * The rail counts form work, never research progress: research begins only
 * after the GET handoff completes on the server.
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
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
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
    // Desktop visitors can type immediately; coarse pointers get the heading
    // so the phone keyboard does not pop open on every step. The live region
    // above the viewport announces the question either way.
    const active = viewportRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`)
    const field =
      active?.querySelector<HTMLElement>('[data-autofocus]') ??
      active?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, [role="combobox"]')
    const finePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
    if (finePointer && field) field.focus()
    else headingRef.current?.focus()
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
    setDirection('forward')
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setError(null)
    setDirection('back')
    setStep((current) => Math.max(current - 1, 0))
  }

  const jumpTo = (index: number) => {
    setError(null)
    setDirection(index < step ? 'back' : 'forward')
    setStep(Math.max(0, Math.min(index, STEPS.length - 1)))
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

  const stepAnim = direction === 'back' ? 'tf-step-back' : 'tf-step-forward'
  const isLast = step === STEPS.length - 1

  const summary = [
    { term: 'Industry', value: industry || 'Not provided', step: 0 },
    { term: 'Company', value: companyName || 'Not provided', step: 1 },
    { term: 'Website', value: website || 'Not provided', step: 2 },
    { term: 'Geography', value: geography || 'Not provided', step: 3 },
    { term: 'Products / services', value: productsServices || 'Not provided', step: 4 },
    { term: 'Agent goals', value: objective || 'Not provided', step: 5 },
    { term: 'Business model', value: businessModel || 'Not provided', step: 6 },
    { term: 'Customer segment', value: customerSegment || 'Not provided', step: 7 },
  ]

  return (
    <form
      action="/intelligence/report"
      method="GET"
      noValidate
      aria-busy={submitting}
      onSubmit={() => setSubmitting(true)}
      onKeyDown={handleFormKeyDown}
      className="panel-strong relative mx-auto w-full max-w-3xl overflow-hidden"
    >
      <div className="border-b border-ink-line px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">Build your preview</p>
          <FormPhaseRail step={step} total={STEPS.length} />
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`h-1 flex-1 rounded-full transition-colors ${index <= step ? 'bg-verdant' : 'bg-ink-line/70'}`}
            />
          ))}
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative flex min-h-[440px] flex-col justify-center px-5 py-10 sm:min-h-[520px] sm:px-8 sm:py-14"
      >
        <div className="mx-auto w-full max-w-2xl">
          <div key={step} className={stepAnim}>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-verdant">
              {formPhase(step)} · Question {String(step + 1).padStart(2, '0')}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-3 text-balance font-display text-[clamp(1.8rem,4.2vw,2.7rem)] leading-[1.06] tracking-[-0.02em] text-bone outline-none"
            >
              {STEPS[step]}
            </h2>
          </div>
          <p aria-live="polite" className="sr-only">
            Question {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>

          <div className="mt-8">
            <div data-step={0} hidden={step !== 0} className={`space-y-5 ${step === 0 ? stepAnim : ''}`}>
              <div>
                <label htmlFor="industry-family" className="field-label">
                  Industry family <span className="font-normal text-bone-faint">(optional shortcut)</span>
                </label>
                <Select
                  id="industry-family"
                  size="lg"
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
                  data-autofocus
                  className="tf-input"
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
                  size="lg"
                  options={subIndustryOptions}
                  value={subIndustry}
                  disabled={!family}
                  onChange={setSubIndustry}
                />
              </div>
            </div>

            <div data-step={1} hidden={step !== 1} className={`max-w-2xl ${step === 1 ? stepAnim : ''}`}>
              <label htmlFor="company-name" className="field-label">Company name</label>
              <input
                id="company-name"
                name="companyName"
                data-autofocus
                className="tf-input"
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

            <div data-step={2} hidden={step !== 2} className={`max-w-2xl ${step === 2 ? stepAnim : ''}`}>
              <label htmlFor="website" className="field-label">Website</label>
              <input
                id="website"
                name="website"
                type="url"
                data-autofocus
                className="tf-input"
                maxLength={300}
                autoComplete="url"
                placeholder="https://example.com"
                defaultValue={initialProfile?.website ?? ''}
                onChange={(event) => setWebsite(event.target.value)}
              />
              <p className="field-help">Used only to interpret the preview and, after signup, in your own saved profile.</p>
            </div>

            <div data-step={3} hidden={step !== 3} className={`max-w-2xl ${step === 3 ? stepAnim : ''}`}>
              <label htmlFor="geography" className="field-label">Geography / country</label>
              <input
                id="geography"
                name="country"
                data-autofocus
                className="tf-input"
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

            <div data-step={4} hidden={step !== 4} className={`max-w-2xl ${step === 4 ? stepAnim : ''}`}>
              <label htmlFor="products-services" className="field-label">Products / services</label>
              <input
                id="products-services"
                name="productsServices"
                data-autofocus
                className="tf-input"
                maxLength={400}
                placeholder="e.g. Groceries, prepared food"
                defaultValue={initialProfile?.productsServices ?? ''}
                onChange={(event) => setProductsServices(event.target.value)}
              />
              <p className="field-help">A short list is enough. If industry is blank, this becomes the public search term.</p>
            </div>

            <div data-step={5} hidden={step !== 5} className={`max-w-2xl ${step === 5 ? stepAnim : ''}`}>
              <label htmlFor="objective" className="field-label">What would you like agents to help with?</label>
              <textarea
                id="objective"
                name="objective"
                data-autofocus
                className="tf-input min-h-[150px] resize-y"
                maxLength={500}
                placeholder="e.g. Let agents answer product questions and prepare orders for review"
                defaultValue={initialProfile?.objectives.join(', ') ?? ''}
                onChange={(event) => setObjective(event.target.value)}
              />
              <p className="field-help">Separate several aims with commas. They become interpretation inputs, not evidence.</p>
            </div>

            <div data-step={6} hidden={step !== 6} className={`max-w-2xl ${step === 6 ? stepAnim : ''}`}>
              <label htmlFor="business-model" className="field-label">Business model</label>
              <Select
                id="business-model"
                name="businessModel"
                size="lg"
                options={businessModelOptions}
                defaultValue={reviewedSelectValue(initialProfile?.businessModel, BUSINESS_MODELS)}
                onChange={setBusinessModel}
              />
            </div>

            <div data-step={7} hidden={step !== 7} className={`max-w-2xl ${step === 7 ? stepAnim : ''}`}>
              <label htmlFor="customer-segment" className="field-label">Customer segment</label>
              <Select
                id="customer-segment"
                name="customerSegment"
                size="lg"
                options={customerSegmentOptions}
                defaultValue={reviewedSelectValue(initialProfile?.customerSegment, CUSTOMER_SEGMENTS)}
                onChange={setCustomerSegment}
              />
            </div>

            <div data-step={8} hidden={step !== 8} className={`space-y-5 ${step === 8 ? stepAnim : ''}`}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {summary.map((item) => (
                  <div key={item.term} className="rounded-xl border border-ink-line bg-ink/30 p-4">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">{item.term}</dt>
                    <dd className="mt-1 break-words text-[13px] text-bone">{item.value}</dd>
                    <button
                      type="button"
                      onClick={() => jumpTo(item.step)}
                      aria-label={`Edit ${item.term}`}
                      className="mt-2 font-mono text-[10.5px] text-verdant underline-offset-4 hover:underline"
                    >
                      Edit
                    </button>
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
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-line px-5 py-4 sm:px-8">
        <button type="button" className="btn btn-quiet btn-sm" onClick={handleBack} disabled={step === 0 || submitting}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {isLast ? (
            <button key="submit" type="submit" className="btn btn-primary px-6 py-2.5" disabled={submitting}>
              {submitting ? 'Opening your report…' : 'Generate preview'}
            </button>
          ) : (
            <>
              <span className="hidden font-mono text-[11px] text-bone-faint sm:inline">Press Enter ↵</span>
              <button key="continue" type="button" className="btn btn-primary px-6 py-2.5" onClick={handleNext}>
                Continue
              </button>
            </>
          )}
        </div>
        <p aria-live="polite" className="sr-only">
          {submitting ? 'Opening your report. Public sources are read on the server.' : ''}
        </p>
      </div>

      {submitting ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ink/85 px-6 text-center backdrop-blur-sm"
        >
          <svg
            className="h-6 w-6 animate-spin text-verdant motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="font-display text-[20px] text-bone">Opening your report…</p>
          <p className="max-w-sm font-mono text-[11px] leading-relaxed text-bone-faint">
            Public sources are read on the server. No completion estimate is shown.
          </p>
        </div>
      ) : null}
    </form>
  )
}
