import { expect, test } from './fixtures'

/**
 * These tests use the authenticated context created by global setup. If a
 * dedicated tenant session is absent they skip; they never fall back to an
 * anonymous page or an invented row.
 */
test('proof separates applied, served, push and ledger facts', async ({ merchantPage }) => {
  await merchantPage.goto('/proof')
  await expect(merchantPage.getByRole('heading', { name: 'Proof', level: 1 })).toBeVisible()
  await expect(merchantPage.getByText('An applied version is not a served manifest.')).toBeVisible()
  await expect(merchantPage.getByText('held, not executed').first()).toBeVisible()
  await expect(merchantPage.getByRole('columnheader', { name: /decision/i })).toBeVisible()
  await expect(merchantPage.getByRole('columnheader', { name: /outcome/i })).toBeVisible()
  if (await merchantPage.locator('tbody tr').count() === 0) {
    await expect(merchantPage.getByText('No decisions recorded')).toBeVisible()
  } else {
    await expect(merchantPage.getByText('— (not recorded)').first()).toBeVisible()
  }
  await expect(merchantPage.getByRole('button', { name: /approve|decline|execute|publish/i })).toHaveCount(0)
})

test('discovery check stays unchecked until a real fetch', async ({ merchantPage }) => {
  await merchantPage.goto('/proof')
  await expect(merchantPage.getByText('unchecked until you ask')).toBeVisible()
  await expect(merchantPage.getByText('not comparable')).toHaveCount(0)
})

test('insights reports real engine status, never ready', async ({ merchantPage }) => {
  await merchantPage.goto('/insights')
  await expect(merchantPage.getByText('Research engine', { exact: false })).toBeVisible()
  await expect(merchantPage.getByText(/State: (not_configured|unavailable)|State: unknown/)).toBeVisible()
  await expect(merchantPage.getByText('State: ready')).toHaveCount(0)
})

test('ledger and approvals stay read-only and omit forbidden columns', async ({ merchantPage }) => {
  await merchantPage.goto('/ledger')
  await expect(merchantPage.getByRole('heading', { name: /ledger/i }).first()).toBeVisible()
  for (const forbidden of ['amount', 'parameter', 'email', 'error text']) {
    await expect(merchantPage.getByRole('columnheader', { name: new RegExp(forbidden, 'i') })).toHaveCount(0)
  }

  await merchantPage.goto('/approvals')
  await expect(merchantPage.getByText(/does not deploy|not approval|opening the reference/i).first()).toBeVisible()
  await expect(merchantPage.getByRole('button', { name: /approve|decline/i })).toHaveCount(0)
})

test('dashboard pages do not overflow the viewport', async ({ merchantPage }) => {
  for (const path of ['/', '/proof', '/ledger', '/insights', '/approvals']) {
    await merchantPage.goto(path)
    const overflow = await merchantPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} overflowed by ${overflow}px`).toBeLessThanOrEqual(2)
  }
})
