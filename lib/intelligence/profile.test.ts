import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { profileFromTenant } from './profile'
import { emptyProfile } from './types'

describe('profileFromTenant', () => {
  it('returns the honest empty profile for a missing row', () => {
    expect(profileFromTenant(null)).toEqual(emptyProfile())
    expect(profileFromTenant(undefined)).toEqual(emptyProfile())
  })

  it('keeps unknown and whitespace-only values null, never a fake default', () => {
    const profile = profileFromTenant({ industry: '   ', sector: '' }, '   ')
    expect(profile.industry).toBe('')
    expect(profile.subIndustry).toBeNull()
    expect(profile.website).toBeNull()
    expect(profile.country).toBeNull()
    expect(profile.companyName).toBeNull()
    expect(profile.productsServices).toBeNull()
    expect(profile.businessModel).toBeNull()
    expect(profile.customerSegment).toBeNull()
    expect(profile.objectives).toEqual([])
  })

  it('maps only the reviewed fields plus the tenant website', () => {
    const profile = profileFromTenant({ industry: '  Retail ', sector: 'Specialty retail' }, ' https://example.in ')
    expect(profile.industry).toBe('Retail')
    expect(profile.subIndustry).toBe('Specialty retail')
    expect(profile.website).toBe('https://example.in')
    // No reviewed country column exists; a migration and custody review are due first.
    expect(profile.country).toBeNull()
    expect(profile.geography).toBeNull()
    expect(profile.companyName).toBeNull()
    expect(profile.productsServices).toBeNull()
    expect(profile.businessModel).toBeNull()
    expect(profile.customerSegment).toBeNull()
    expect(profile.objectives).toEqual([])
  })

  it('preserves null fields on a partially filled row', () => {
    const profile = profileFromTenant({ industry: 'Healthcare', sector: null })
    expect(profile.industry).toBe('Healthcare')
    expect(profile.subIndustry).toBeNull()
    expect(profile.website).toBeNull()
    expect(profile.country).toBeNull()
  })

  it('still reads the site address when no metadata row exists', () => {
    const profile = profileFromTenant(null, 'https://example.in')
    expect(profile.industry).toBe('')
    expect(profile.website).toBe('https://example.in')
  })
})

describe('tenant research profile read', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'profile.ts'), 'utf8')

  it('selects only reviewed metadata columns and never probes website or country there', () => {
    expect(src).toContain("select('industry, sector')")
    expect(src).not.toContain("select('industry, sector, website, country')")
    expect(src).not.toMatch(/from\('tenant_metadata'\)\s*\.select\([^)]*\bcountry\b/)
  })

  it('takes the tenant id from the membership proof for local snapshot scoping', () => {
    expect(src).toContain('resolveRequestTenant')
    expect(src).toContain('const tenantId = tenant.active.tenantId')
  })
})
