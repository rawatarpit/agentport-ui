import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { profileFromParams } from './types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const form = readFileSync(join(root, 'components/intel/intel-form.tsx'), 'utf8')
const page = readFileSync(join(root, 'app/(site)/intelligence/report/page.tsx'), 'utf8')
const landing = readFileSync(join(root, 'app/(site)/intelligence/page.tsx'), 'utf8')

const EXPECTED_FIELDS = [
  'companyName',
  'industry',
  'subIndustry',
  'country',
  'geography',
  'website',
  'productsServices',
  'objective',
  'businessModel',
  'customerSegment',
]

function emittedFields(): string[] {
  // The regex has one capture group, so every match has a defined first entry.
  return [...form.matchAll(/name="([^"]+)"/g)].map((match) => match[1]!)
}

describe('public report answers survive the GET handoff', () => {
  it('emits every reviewed answer field from the public form', () => {
    expect(emittedFields().sort()).toEqual([...EXPECTED_FIELDS].sort())
  })

  it('keeps companyName, geography and productsServices when the emitted fields are parsed back', () => {
    const params = new URLSearchParams()
    for (const field of emittedFields()) params.set(field, `value-${field}`)
    const profile = profileFromParams(params)
    expect(profile.companyName).toBe('value-companyName')
    expect(profile.geography).toBe('value-geography')
    expect(profile.productsServices).toBe('value-productsServices')
    expect(profile.objectives).toEqual(['value-objective'])
  })

  it('sends country and geography together so both old and new links carry the answer', () => {
    expect(form).toContain('name="country"')
    expect(form).toMatch(/type="hidden"\s+name="geography" value=\{geography\}/)
  })

  it('rebuilds the profile with profileFromParams rather than a partial field list', () => {
    expect(page).toContain('profileFromParams(params)')
    expect(page).not.toContain('profileFromRecord({')
  })

  it('copies every supplied search parameter into the profile parser', () => {
    expect(page).toMatch(/for \(const \[key, value\] of Object\.entries\(searchParams\)\)/)
    expect(page).toContain('params.set(key, v)')
  })

  it('prefills the same reviewed fields on edit without adding a new field', () => {
    expect(form).toContain('initialProfile?: ResearchProfile')
    expect(form).toContain("defaultValue={initialProfile?.companyName ?? ''}")
    expect(form).toContain("defaultValue={initialProfile?.website ?? ''}")
    expect(form).toContain("defaultValue={initialProfile?.productsServices ?? ''}")
    expect(form).toContain("defaultValue={initialProfile?.objectives.join(', ') ?? ''}")
    expect(emittedFields().sort()).toEqual([...EXPECTED_FIELDS].sort())
  })

  it('builds report actions from fixed same-origin bases only', () => {
    expect(page).toContain('/intelligence/report?${query}')
    expect(page).toContain('/intelligence?${query}')
    expect(page).toContain('`/login?next=${encodeURIComponent(reportHref)}`')
    expect(page).toContain("installHref: '/install'")
    expect(page).toContain('resolveRequestTenant()')
    expect(page).not.toMatch(/returnTo|redirect=|href=\{searchParams/)
  })

  it('prefills the landing form with the same public profile parser', () => {
    expect(landing).toContain('profileFromParams(params)')
    expect(landing).toContain('<IntelForm key={params.toString()} initialProfile={initialProfile} />')
  })
})
