import type { MetadataRoute } from 'next'

/**
 * Only stable, answer-free public routes belong here. `/intelligence/report`
 * carries visitor answers in its query string and is deliberately excluded.
 */
const BASE_URL = 'https://agentport.relayforge.in'

const PUBLIC_ROUTES = [
  '/home',
  '/intelligence',
  '/solutions',
  '/platform',
  '/how-it-works',
  '/pilot',
  '/developers',
  '/security',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date('2026-11-26'),
    changeFrequency: route === '/intelligence' ? 'weekly' : 'monthly',
    priority: route === '/home' ? 1 : route === '/intelligence' || route === '/pilot' ? 0.9 : 0.7,
  }))
}
