import { defineConfig, devices } from '@playwright/test'

/**
 * Browser E2E runs are Node-only. Credentials, fixture ids and reset flags are
 * never prefixed NEXT_PUBLIC_ and never imported by app/ or components/.
 *
 * The production origin is refused by default. An explicit read-only production
 * run may inspect public pages, but it cannot use authenticated fixtures or any
 * reset path. No destructive fixture operation exists in this repository.
 */
const PRODUCTION_HOST = 'agentport.relayforge.in'
const baseURL = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const liveReadOnly = process.env.E2E_LIVE_READ_ONLY === '1'
let parsedBase: URL
try {
  parsedBase = new URL(baseURL)
} catch {
  throw new Error('E2E_BASE_URL must be an absolute URL.')
}
if (parsedBase.hostname === PRODUCTION_HOST && !liveReadOnly) {
  throw new Error(
    'Refusing E2E against the production origin. Use a dedicated non-production base URL, or set E2E_LIVE_READ_ONLY=1 for public read-only checks.',
  )
}

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // No network bodies or cookie capture in traces: screenshots and traces
    // may contain tenant data and must not become credential artifacts.
    launchOptions: { slowMo: 0 },
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 3000',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
