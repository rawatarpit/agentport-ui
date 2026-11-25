/**
 * Industry taxonomy for the acquisition flow.
 *
 * This is a navigation aid, not research: it lets a visitor type a free-text
 * industry and still see useful subcategory prompts. It carries no market
 * figures and no claims about any company.
 */

export type IndustryFamily = {
  id: string
  label: string
  subcategories: string[]
}

export const INDUSTRY_FAMILIES: IndustryFamily[] = [
  {
    id: 'retail',
    label: 'Retail & E-commerce',
    subcategories: ['Specialty retail', 'Grocery', 'Fashion', 'Electronics', 'Home & furniture'],
  },
  {
    id: 'hospitality',
    label: 'Hospitality & Travel',
    subcategories: ['Hotels', 'Restaurants', 'Cafés', 'Travel operators', 'Experiences'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    subcategories: ['Clinics', 'Dental', 'Diagnostics', 'Wellness', 'Pharmacies'],
  },
  {
    id: 'finance',
    label: 'Financial Services',
    subcategories: ['Banking', 'Insurance', 'Lending', 'Payments', 'Wealth'],
  },
  {
    id: 'professional',
    label: 'Professional Services',
    subcategories: ['Legal', 'Accounting', 'Consulting', 'Agencies', 'Recruiting'],
  },
  {
    id: 'technology',
    label: 'Technology',
    subcategories: ['SaaS', 'Developer tools', 'Marketplaces', 'Infrastructure', 'Data'],
  },
  {
    id: 'logistics',
    label: 'Logistics',
    subcategories: ['Freight', 'Last mile', 'Warehousing', 'Fleet', 'Customs'],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    subcategories: ['Industrial', 'Consumer goods', 'Components', 'Contract', 'Materials'],
  },
  {
    id: 'education',
    label: 'Education',
    subcategories: ['Schools', 'Higher education', 'Training', 'Edtech', 'Certification'],
  },
  {
    id: 'real-estate',
    label: 'Real Estate',
    subcategories: ['Residential', 'Commercial', 'Property management', 'Brokerage', 'Construction'],
  },
]

/**
 * The onboarding wizard uses a fixed, coarser vocabulary than the research
 * taxonomy. Mapping at the hand-off keeps the two screens continuous without
 * storing a new taxonomy column or pretending a free-text answer was a choice.
 */
export const SETUP_INDUSTRY_VALUES = [
  'retail', 'healthcare', 'finance', 'education',
  'hospitality', 'manufacturing', 'technology', 'logistics', 'other',
] as const

export const SETUP_SECTOR_VALUES = [
  'e-commerce', 'clinic', 'bank', 'school', 'hotel',
  'factory', 'saas', 'warehouse', 'other',
] as const

const SETUP_INDUSTRIES = new Set<string>(SETUP_INDUSTRY_VALUES)
const SETUP_SECTORS = new Set<string>(SETUP_SECTOR_VALUES)

export function setupIndustryValue(industry: string | null, subIndustry: string | null = null): string {
  const direct = (industry ?? '').trim().toLowerCase()
  if (SETUP_INDUSTRIES.has(direct)) return direct
  const text = `${subIndustry ?? ''} ${industry ?? ''}`.toLowerCase()
  if (/health|clinic|dental|pharma|wellness/.test(text)) return 'healthcare'
  if (/bank|insur|lend|payment|wealth|finance/.test(text)) return 'finance'
  if (/school|education|training|edtech|certification/.test(text)) return 'education'
  if (/hotel|restaurant|cafe|café|travel|hospitality|experience/.test(text)) return 'hospitality'
  if (/factory|industrial|manufactur|component|material/.test(text)) return 'manufacturing'
  if (/developer|saas|software|infrastructure|data|technology/.test(text)) return 'technology'
  if (/freight|warehous|logistics|fleet|customs|last mile/.test(text)) return 'logistics'
  if (/retail|commerce|grocery|fashion|electronics|furniture|shop/.test(text)) return 'retail'
  return 'other'
}

export function setupSectorValue(industry: string | null, subIndustry: string | null = null): string {
  const direct = (subIndustry ?? '').trim().toLowerCase()
  if (SETUP_SECTORS.has(direct)) return direct
  const text = `${subIndustry ?? ''} ${industry ?? ''}`.toLowerCase()
  if (/bank|insur|lend|payment|wealth|finance/.test(text)) return 'bank'
  if (/clinic|dental|diagnostic|wellness|pharma|health/.test(text)) return 'clinic'
  if (/school|education|training|edtech|certification/.test(text)) return 'school'
  if (/hotel|restaurant|cafe|café|travel|hospitality/.test(text)) return 'hotel'
  if (/factory|industrial|manufactur|component|material/.test(text)) return 'factory'
  if (/developer|saas|software|infrastructure|data|technology/.test(text)) return 'saas'
  if (/retail|commerce|e-commerce|shop|store/.test(text)) return 'e-commerce'
  if (/freight|warehous|logistics|fleet|customs|last mile/.test(text)) return 'warehouse'
  // A preview answer that does not map does not become a plausible default:
  // setup offers "other" for exactly this case.
  return 'other'
}

export const BUSINESS_MODELS = [
  'Direct-to-consumer',
  'B2B wholesale',
  'Marketplace',
  'Subscription',
  'Services / retainer',
  'Booking / reservation',
  'SaaS',
  'Franchise',
  'Other',
] as const

export const CUSTOMER_SEGMENTS = [
  'Consumers',
  'Small businesses',
  'Enterprise',
  'Professionals',
  'Public sector',
  'Mixed',
] as const

/** True when the typed industry matches a family or one of its subcategories. */
export function matchIndustryFamily(industry: string): IndustryFamily | null {
  const needle = industry.trim().toLowerCase()
  if (!needle) return null
  return (
    INDUSTRY_FAMILIES.find((family) => {
      if (family.label.toLowerCase() === needle) return true
      return family.subcategories.some((sub) => sub.toLowerCase() === needle)
    }) ?? null
  )
}
