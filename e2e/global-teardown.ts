import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullConfig } from '@playwright/test'
import { authStatePath } from './global-setup'
import { blockerPath } from './blockers'

export default async function globalTeardown(_config: FullConfig) {
  // Only local ephemeral state is removed. No server-side rows are touched: a
  // fixture reset contract has not been delivered and destructive cleanup is
  // never improvised with service_role.
  if (existsSync(authStatePath())) unlinkSync(authStatePath())

  const blockerFile = blockerPath()
  const blockers = existsSync(blockerFile)
    ? readFileSync(blockerFile, 'utf8').trim().split('\n').filter(Boolean)
    : []
  writeFileSync(
    join(process.cwd(), 'test-results', 'summary.json'),
    `${JSON.stringify({ finishedAt: new Date().toISOString(), blockers, remoteFixtureCleanup: 'not-implemented' })}\n`,
    'utf8',
  )
}
