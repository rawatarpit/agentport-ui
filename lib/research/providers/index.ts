import type { ResearchProviderAdapter } from '../types'
import { githubPublicProvider } from './github-public'
import { secEdgarProvider } from './sec-edgar'
import { worldBankProvider } from './world-bank'

/**
 * Providers that are implemented in this repo and reachable without secrets.
 *
 * The static `lib/research/registry.ts` slots remain the capability
 * declaration layer. This is the connection layer: each adapter here reports
 * `available` and its `collect` can fetch real public evidence. Providers that
 * need a credential (for example Companies House) are not listed here until
 * the exact env var is configured.
 */

export const configuredResearchProviders: readonly ResearchProviderAdapter[] = Object.freeze([
  Object.freeze(worldBankProvider),
  Object.freeze(secEdgarProvider),
  Object.freeze(githubPublicProvider),
])

export function getConfiguredProvider(id: string): ResearchProviderAdapter | null {
  return configuredResearchProviders.find((provider) => provider.id === id) ?? null
}

export const configuredProviderIds: readonly string[] = Object.freeze(
  configuredResearchProviders.map((provider) => provider.id),
)
