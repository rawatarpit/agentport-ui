import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Retired as a router: sign-in lands on the overview, whose onboarding card
 * owns the whole journey (account → repo → merge → publish) in one voice.
 * Kept as an alias so old links and emails land somewhere true instead of
 * 404ing.
 */
export default async function OnboardingPage() {
  redirect('/')
}
