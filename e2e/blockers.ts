import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Stable blocker records. These are not assertions: they tell the release
 * reader exactly which real workflow could not be exercised and why. No text
 * from an error object, stack, or upstream body enters this record.
 */
export type BlockerRecord = {
  step: string
  code: string
  detail: string
}

export const BLOCKER_CODES = {
  noLiveBaseUrl: 'E2E_BASE_URL_NOT_SET',
  noCredentials: 'E2E_CREDENTIALS_NOT_SET',
  noTenant: 'E2E_TENANT_NOT_SET',
  noIntelligenceWorker: 'INTELLIGENCE_WORKER_UNAVAILABLE',
  noCrawlerFeed: 'CRAWLER_OBSERVATIONS_CONTRACT_MISSING',
  noGovernanceBrowserPath: 'BROWSER_GOVERNANCE_PATH_NOT_AUTHORISED',
  noGovernorHealthRoute: 'GOVERNOR_HEALTH_NOT_PUBLICLY_ROUTED',
  noIntegrationHealth: 'INTEGRATION_HEALTH_CONTRACT_MISSING',
  noFixtureReset: 'FIXTURE_RESET_CONTRACT_MISSING',
  noGitHubFixture: 'GITHUB_INSTALL_FIXTURE_NOT_SET',
} as const

export function blockerPath(): string {
  return process.env.E2E_BLOCKER_LOG ?? join(process.cwd(), 'test-results', 'blockers.jsonl')
}

export function recordBlocker(record: BlockerRecord): void {
  const path = blockerPath()
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`, 'utf8')
}

/** Record a stable reason and return the description for Playwright's skip. */
export function blockedReason(step: string, code: string, detail: string): string {
  recordBlocker({ step, code, detail })
  return `SKIP_BLOCKED ${code}: ${detail}`
}
