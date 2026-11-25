import { describe, expect, it } from 'vitest'
import { parseResearchProfile, profileFromParams } from './types'

describe('parseResearchProfile', () => {
  it('refuses a blank or malformed profile instead of storing an empty report', () => {
    expect(parseResearchProfile(null)).toBeNull()
    expect(parseResearchProfile({})).toBeNull()
    expect(parseResearchProfile({ industry: '   ' })).toBeNull()
    expect(parseResearchProfile({ industry: 'Retail', objectives: 'not a list' })).toBeNull()
  })

  it('keeps only reviewed fields and normalises them', () => {
    expect(
      parseResearchProfile({
        industry: '  Specialty   retail ',
        country: ' India ',
        objectives: [' Grow agents ', 'Grow agents'],
        injected: 'ignored',
      }),
    ).toEqual({
      industry: 'Specialty retail',
      subIndustry: null,
      country: 'India',
      geography: null,
      companyName: null,
      website: null,
      productsServices: null,
      businessModel: null,
      customerSegment: null,
      objectives: ['Grow agents'],
    })
  })

  it('rebuilds the full preview profile from carried query answers', () => {
    const params = new URLSearchParams({
      industry: 'Specialty retail',
      subIndustry: 'Grocery',
      country: 'India',
      geography: 'South Asia',
      companyName: 'Shop Example',
      website: 'https://shop.example',
      productsServices: 'Groceries, prepared food',
      businessModel: 'Subscription',
      customerSegment: 'D2C',
      objective: 'Answer questions, Prepare orders',
    })

    expect(profileFromParams(params)).toMatchObject({
      industry: 'Specialty retail',
      subIndustry: 'Grocery',
      country: 'India',
      geography: 'South Asia',
      companyName: 'Shop Example',
      website: 'https://shop.example',
      productsServices: 'Groceries, prepared food',
      businessModel: 'Subscription',
      customerSegment: 'D2C',
      objectives: ['Answer questions', 'Prepare orders'],
    })
  })
})
