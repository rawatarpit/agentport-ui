import { expect, test } from './fixtures'
import { BLOCKER_CODES, blockedReason } from './blockers'

/**
 * Each step of the requested acceptance journey is present. Steps that cannot
 * be exercised against the delivered backend record a stable blocker and skip;
 * they never mock a successful response or claim a passed journey.
 */
const step = (number: number, name: string) => `journey-${String(number).padStart(2, '0')}-${name}`

/** The ledger is a table at >=768px and a labelled card list on phones. */
async function expectLedgerReadable(page: import('@playwright/test').Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280
  if (width < 768) {
    await expect(page.locator('ul.md\\:hidden > li').first()).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
  } else {
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /decision/i })).toBeVisible()
  }
}
const needsReset = () => process.env.E2E_FIXTURE_RESET_CONTRACT !== 'delivered'
const needsIntelligence = () => process.env.E2E_INTELLIGENCE_WORKER_CONTRACT !== 'delivered'
const needsGitHub = () => !process.env.E2E_GITHUB_INSTALLATION_ID

function skipMissing(condition: boolean, code: string, detail: string): void {
  if (condition) test.skip(true, blockedReason(test.info().title, code, detail))
}

test('01 prospect signup', async ({ page }) => {
  test.info().annotations.push({ type: 'scope', description: 'Signup form presence only; durable account creation needs a reset contract.' })
  skipMissing(
    needsReset(),
    BLOCKER_CODES.noFixtureReset,
    'Prospect signup creates a durable tenant; no server-agent fixture reset/teardown contract was delivered.',
  )
  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: 'Your shop, governed' })).toBeVisible()
})

test('02 business profile submission', async ({ page }) => {
  test.info().annotations.push({ type: 'scope', description: 'Public GET form presence only; hosted profile submission is blocked.' })
  skipMissing(
    needsIntelligence(),
    BLOCKER_CODES.noIntelligenceWorker,
    'No hosted Intelligence base URL, session/profile contract, or worker availability was delivered.',
  )
  await page.goto('/intelligence')
  await expect(page.locator('form')).toHaveAttribute('method', 'GET')
})

test('03 research job creation', async ({ page }) => {
  test.info().annotations.push({ type: 'scope', description: 'Preview control presence only; no research job is created by this step.' })
  skipMissing(
    needsIntelligence(),
    BLOCKER_CODES.noIntelligenceWorker,
    'No hosted prospect-reports or research-requests endpoint is available to this frontend.',
  )
  await page.goto('/intelligence')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
})

test('04 actual job status observation', async ({ page }) => {
  test.info().annotations.push({ type: 'scope', description: 'Engine status surface presence only; no hosted job status is observed.' })
  skipMissing(
    needsIntelligence(),
    BLOCKER_CODES.noIntelligenceWorker,
    'The queued/claimed/running/completed/failed/exhausted vocabulary exists as a skeleton, but no console route observes real jobs.',
  )
  await page.goto('/insights')
  await expect(page.getByText('Research engine')).toBeVisible()
})

test('05 completed persisted report retrieval', async ({ merchantPage }) => {
  test.info().annotations.push({ type: 'scope', description: 'Saved-report surface presence only; the report shown is console-owned public-source data.' })
  skipMissing(
    needsIntelligence(),
    BLOCKER_CODES.noIntelligenceWorker,
    'No hosted persisted personalised report contract is available; saved reports here are console-owned public-source snapshots.',
  )
  await merchantPage.goto('/insights/saved')
  await expect(merchantPage.getByRole('heading', { name: /saved report/i }).first()).toBeVisible()
})

test('06 evidence and source rendering', async ({ page }) => {
  await page.goto('/intelligence/report?sample=1')
  await expect(page.getByText('Every figure on this page is invented.')).toBeVisible()
  test.info().annotations.push({
    type: 'scope',
    description: 'Public fictional sample only; not a persisted personalised report.',
  })
})

test('07 installation handoff', async ({ page }) => {
  test.info().annotations.push({ type: 'scope', description: 'Sample handoff link presence only; no persisted hosted report flow was available.' })
  skipMissing(
    process.env.E2E_INTELLIGENCE_WORKER_CONTRACT !== 'delivered',
    BLOCKER_CODES.noIntelligenceWorker,
    'Installation handoff from a persisted hosted report cannot be tested without a hosted report.',
  )
  await page.goto('/intelligence/report?sample=1')
  await expect(page.getByRole('link', { name: 'Continue to installation' })).toBeVisible()
})

test('08 merchant installation', async ({ merchantPage }) => {
  skipMissing(
    needsGitHub(),
    BLOCKER_CODES.noGitHubFixture,
    'No dedicated GitHub App installation id, repository, and reset contract were supplied.',
  )
  await merchantPage.goto('/install')
  await expect(merchantPage.getByText(/install/i).first()).toBeVisible()
})

test('09 discovery verification', async ({ merchantPage }) => {
  await merchantPage.goto('/go-live')
  await expect(merchantPage.getByRole('button', { name: 'Check canonical manifest' })).toBeVisible()
  test.info().annotations.push({
    type: 'scope',
    description: 'Shows the real check control; clicking it is gated by live worker availability and is not simulated.',
  })
})

test('10 dashboard data retrieval', async ({ merchantPage }) => {
  await merchantPage.goto('/')
  await expect(merchantPage.getByText(/what is live/i).first()).toBeVisible()
  // The dedicated tenant's real state decides which tiles render. A synthetic
  // unknown row would be a fixture, so this step only asserts the read surface
  // is present; the unknown/zero contracts are pinned by unit guards.
  test.info().annotations.push({
    type: 'scope',
    description: 'Real tenant tiles only; no synthetic unknown state is asserted.',
  })
})

test('11 crawler observations', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noCrawlerFeed,
    'No tenant-scoped crawler observation feed with identity, operator, verification and source coverage was delivered.',
  )
  await merchantPage.goto('/map')
})

test('12 agent activity', async ({ merchantPage }) => {
  await merchantPage.goto('/ledger')
  await expectLedgerReadable(merchantPage)
})

test('13 governor health', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noGovernorHealthRoute,
    'Rust /healthz exists in server code but is not publicly routed and no console health contract was delivered.',
  )
  await merchantPage.goto('/proof')
})

test('14 integration health', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noIntegrationHealth,
    'No tenant-scoped endpoint combining governor, worker, backend and merchant integration health was delivered.',
  )
  await merchantPage.goto('/proof')
})

test('15 protected write preparation', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noGovernanceBrowserPath,
    'Browser prepare/confirm authority is not enabled; approvals remain read-only by invariant 7.',
  )
  await merchantPage.goto('/approvals')
})

test('16 human confirmation', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noGovernanceBrowserPath,
    'The console confirmation page is a read-only reference; no delivered browser decision contract exists.',
  )
  await merchantPage.goto('/approvals')
})

test('17 governor execution outcome', async ({ merchantPage }) => {
  skipMissing(
    true,
    BLOCKER_CODES.noGovernanceBrowserPath,
    'No browser execution result contract was delivered; the console reads ledger rows only.',
  )
  await merchantPage.goto('/ledger')
})

test('18 audit record retrieval', async ({ merchantPage }) => {
  await merchantPage.goto('/ledger')
  await expectLedgerReadable(merchantPage)
})

test(step(6, 'sample-is-not-persisted'), async ({ page }) => {
  await page.goto('/intelligence/report?sample=1')
  await expect(page.getByText('Create an account for your own assessment')).toBeVisible()
  await expect(page.getByText(/does not save anything/i)).toBeVisible()
})
