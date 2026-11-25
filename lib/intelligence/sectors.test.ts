import { describe, expect, it } from 'vitest'
import { setupIndustryValue, setupSectorValue } from './sectors'

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
