import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { profileFromParams } from './types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const form = readFileSync(join(root, 'components/intel/intel-form.tsx'), 'utf8')
const select = readFileSync(join(root, 'components/ui/select.tsx'), 'utf8')
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

describe('public report form uses the one custom dropdown', () => {
  it('replaces every native select with the shared custom Select', () => {
    expect(form).toMatch(/import \{ Select[^\n]*\} from '@\/components\/ui\/select'/)
    expect(form).not.toContain('<select')
    expect([...form.matchAll(/<Select\b/g)]).toHaveLength(4)
  })

  it('keeps the reviewed empty-option labels explicit', () => {
    for (const label of [
      'Choose a family, or type your own below',
      'Not specified',
      'Choose a family first',
    ]) {
      expect(form).toContain(`'${label}'`)
    }
  })

  it('normalizes prefilled dropdown values against the reviewed option sets', () => {
    expect(form).toContain('reviewedSelectValue(initialProfile?.subIndustry, initialFamily?.subcategories ?? [])')
    expect(form).toContain('reviewedSelectValue(initialProfile?.businessModel, BUSINESS_MODELS)')
    expect(form).toContain('reviewedSelectValue(initialProfile?.customerSegment, CUSTOMER_SEGMENTS)')
  })

  it('does not serialize a disabled Select through its hidden input', () => {
    expect(select).toMatch(/name && !disabled \? <input type="hidden" name=\{name\} value=\{current\}/)
  })

  it('keeps a selected option visible while its hidden input carries the submitted value', () => {
    expect(select).toContain('const display = selected?.label ?? (current === \'\' ? (placeholder ?? \'Select…\') : current)')
    expect(select).toContain('aria-selected={isSelected}')
  })

  it('does not close the menu from the scroll it triggers while opening', () => {
    expect(select).toContain('const openingScroll = useRef(false)')
    expect(select).toContain('if (openingScroll.current) return')
    expect(select).toContain('openingScroll.current = true')
    expect(select).toContain('window.requestAnimationFrame')
  })

  it('disables subIndustry until a reviewed family is selected', () => {
    expect(form).toMatch(
      /<Select\s+id="sub-industry"[\s\S]*?name="subIndustry"[\s\S]*?disabled=\{!family\}[\s\S]*?\/>/,
    )
  })

  it('keeps industry as free text backed by the unchanged datalist', () => {
    expect(form).toMatch(
      /<input[\s\S]*?id="industry"[\s\S]*?name="industry"[\s\S]*?required[\s\S]*?list="industry-suggestions"[\s\S]*?value=\{industry\}[\s\S]*?\/>/,
    )
    expect(form).toMatch(
      /<datalist id="industry-suggestions">[\s\S]*?INDUSTRY_FAMILIES\.flatMap\(\(item\) => \[item\.label, \.\.\.item\.subcategories\]\)[\s\S]*?<\/datalist>/,
    )
  })

  it('keeps the family shortcut filling industry and clearing sub-industry', () => {
    expect(form).toContain('onChange={handleFamilyChange}')
    expect(form).toContain("setSubIndustry('')")
    expect(form).toContain('setIndustry(next.label)')
    expect([...form.matchAll(/track\(\{ event_type: 'industry_selected' \}\)/g)]).toHaveLength(2)
  })
})
