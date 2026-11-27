import { chromium, type FullConfig } from '@playwright/test'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { blockedReason, blockerPath } from './blockers'

/**
 * Browser auth state lives in an OS temp file with 0600 permissions, never in
 * the repository. A global teardown removes it. The file is created only when
 * dedicated E2E credentials are supplied against a non-production origin.
 */
export const authStatePath = (): string => join(tmpdir(), 'agentport-e2e-storage-state.json')

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL?.toString() ?? ''
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true })
  // Each run owns its blocker log; stale blockers from a previous run must not
  // appear as current release evidence.
  writeFileSync(blockerPath(), '', 'utf8')
  writeFileSync(join(process.cwd(), 'test-results', 'run.json'), `${JSON.stringify({ baseURL, startedAt: new Date().toISOString() })}\n`, 'utf8')

  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  const readOnly = process.env.E2E_LIVE_READ_ONLY === '1'
  if (!email || !password || readOnly) {
    console.log(
      blockedReason(
        'authenticated-context',
        readOnly ? 'E2E_LIVE_READ_ONLY' : 'E2E_CREDENTIALS_NOT_SET',
        'Authenticated E2E contexts are disabled; public browser checks still run.',
      ),
    )
    return
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${baseURL}/login`)
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })

    if (page.url().includes('/select-workspace')) {
      const tenantId = process.env.E2E_TENANT_ID
      if (!tenantId) {
        console.log(
          blockedReason(
            'isolated-tenant',
            'E2E_TENANT_NOT_SET',
            'The login has more than one workspace and E2E_TENANT_ID was not supplied.',
          ),
        )
        return
      }
      // The workspace choice is the same server-checked API the product uses;
      // no test-only selection path exists.
      const response = await page.request.post(`${baseURL}/api/workspace`, {
        data: { tenantId },
        headers: { origin: new URL(baseURL).origin },
      })
      if (!response.ok()) {
        console.log(
          blockedReason(
            'isolated-tenant',
            'E2E_TENANT_SELECTION_FAILED',
            'The dedicated test tenant could not be selected through the product API.',
          ),
        )
        return
      }
      await page.goto(baseURL)
    }

    const context = page.context()
    if (existsSync(authStatePath())) unlinkSync(authStatePath())
    // Create with 0600 before Playwright writes: no window where a session
    // state file is group- or world-readable.
    const handle = openSync(authStatePath(), 'wx', 0o600)
    closeSync(handle)
    await context.storageState({ path: authStatePath() })
    chmodSync(authStatePath(), 0o600)
  } finally {
    await browser.close()
  }
}
