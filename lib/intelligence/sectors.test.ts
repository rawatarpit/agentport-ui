import { describe, expect, it } from 'vitest'
import { BUSINESS_MODELS, CUSTOMER_SEGMENTS, reviewedSelectValue, setupIndustryValue, setupSectorValue } from './sectors'

describe('setup taxonomy hand-off', () => {
  it('maps research labels into the fixed setup vocabulary', () => {
    expect(setupIndustryValue('Retail & E-commerce', 'Specialty retail')).toBe('retail')
    expect(setupSectorValue('Retail & E-commerce', 'Specialty retail')).toBe('e-commerce')
    expect(setupIndustryValue('Healthcare', 'Clinics')).toBe('healthcare')
    expect(setupSectorValue('Healthcare', 'Clinics')).toBe('clinic')
    expect(setupIndustryValue('Technology', 'SaaS')).toBe('technology')
    expect(setupSectorValue('Technology', 'SaaS')).toBe('saas')
  })

  it('keeps unknown answers as other instead of pretending a category', () => {
    expect(setupIndustryValue('Bespoke craft', null)).toBe('other')
    expect(setupSectorValue('Bespoke craft', null)).toBe('other')
  })
})

describe('reviewed dropdown values', () => {
  it('keeps a value only when the reviewed options contain it', () => {
    expect(reviewedSelectValue('Subscription', BUSINESS_MODELS)).toBe('Subscription')
    expect(reviewedSelectValue('Enterprise', CUSTOMER_SEGMENTS)).toBe('Enterprise')
    expect(reviewedSelectValue('', BUSINESS_MODELS)).toBe('')
  })

  it('drops arbitrary prefilled values instead of showing a value no option offered', () => {
    expect(reviewedSelectValue('Bespoke model', BUSINESS_MODELS)).toBe('')
    expect(reviewedSelectValue(null, CUSTOMER_SEGMENTS)).toBe('')
    expect(reviewedSelectValue(undefined, CUSTOMER_SEGMENTS)).toBe('')
  })
})
