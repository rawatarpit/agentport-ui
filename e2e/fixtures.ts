import { existsSync } from 'node:fs'
import { test as base, expect, type Page } from '@playwright/test'
import { blockedReason } from './blockers'
import { authStatePath } from './global-setup'

/**
 * Authenticated fixtures are opt-in. A missing storage state is a skip, never
 * an anonymous page pretending to prove a tenant workflow.
 */
export const test = base.extend<{ merchantPage: Page }>({
  merchantPage: async ({ browser }, use) => {
    if (!existsSync(authStatePath())) {
      test.skip(
        true,
        blockedReason(
          'authenticated-context',
          'E2E_CREDENTIALS_NOT_SET',
          'No dedicated E2E merchant session was created by global setup.',
        ),
      )
    }
    const context = await browser.newContext({ storageState: authStatePath() })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect }
