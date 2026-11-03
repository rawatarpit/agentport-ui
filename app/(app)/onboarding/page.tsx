import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Retired as a router: /go-live owns the journey (site → map → rules →
 * GitHub → PR → publish → verify) in one voice. Kept as an alias so old
 * links and emails land somewhere true instead of 404ing.
 */
export default async function OnboardingPage() {
  redirect('/go-live')
}
