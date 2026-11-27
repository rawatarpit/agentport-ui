import { expect, test } from './fixtures'

/**
 * These checks need no tenant and create no rows. They are safe to run against
 * a local or dedicated non-production origin under E2E_LIVE_READ_ONLY.
 */
test('signed-out visitor lands on the public home page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Customers are starting to arrive as AI agents.')
})

test('public pages carry no removed pilot or fee surface', async ({ page }) => {
  await page.goto('/home')
  await expect(page.locator('#faq')).toHaveCount(1)
  await expect(page.getByText(/request a pilot/i)).toHaveCount(0)
  await expect(page.getByText(/founding pilot/i)).toHaveCount(0)
  await expect(page.getByText(/₹0|no agentport fee/i)).toHaveCount(0)
})

test('intelligence form validates and uses the shared custom dropdown', async ({ page }) => {
  await page.goto('/intelligence')
  await expect(page.locator('form')).toHaveAttribute('method', 'GET')

  await page.getByRole('button', { name: 'Generate preview' }).click()
  await expect(page).toHaveURL(/\/intelligence$/)

  await page.locator('#industry-family').click()
  await page.getByRole('option', { name: 'Retail & E-commerce' }).click()
  await expect(page.locator('#industry')).toHaveValue('Retail & E-commerce')
  await expect(page.locator('#sub-industry')).toBeEnabled()
})

test('a lower custom dropdown stays open after its own opening scroll', async ({ page }) => {
  await page.goto('/intelligence')
  await page.locator('#customer-segment').scrollIntoViewIfNeeded()
  await page.locator('#customer-segment').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: 'Consumers' })).toBeVisible()
  await page.getByRole('option', { name: 'Consumers' }).click()
  await expect(page.locator('#customer-segment')).toContainText('Consumers')
})

test('public answer handoff is a real GET to the report route', async ({ page }) => {
  await page.goto('/intelligence')
  await page.locator('#industry-family').click()
  await page.getByRole('option', { name: 'Retail & E-commerce' }).click()
  await page.locator('#company-name').fill('Test Company')
  await page.getByRole('button', { name: 'Generate preview' }).click()
  await page.waitForURL((url) => url.pathname === '/intelligence/report', { waitUntil: 'commit' })
  const url = new URL(page.url())
  expect(url.searchParams.get('companyName')).toBe('Test Company')
  expect(url.searchParams.get('industry')).toBe('Retail & E-commerce')
})

test('fictional sample is labelled and contains no live claim', async ({ page }) => {
  await page.goto('/intelligence/report?sample=1')
  await expect(page.getByText('Every figure on this page is invented.')).toBeVisible()
  await expect(page.getByText('Use this only to review the layout.')).toBeVisible()
  await expect(page.getByText(/request a pilot/i)).toHaveCount(0)
})

test('public pages do not overflow the viewport', async ({ page }) => {
  for (const path of ['/home', '/intelligence', '/intelligence/report?sample=1']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} overflowed by ${overflow}px`).toBeLessThanOrEqual(2)
  }
})
