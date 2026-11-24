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
