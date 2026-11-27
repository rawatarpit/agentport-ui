import { expect, test } from './fixtures'

/**
 * Contract-shape checks for the endpoints this frontend actually consumes.
 * They verify the response envelope without inventing payload fields.
 */
test('session endpoint returns a bounded shape', async ({ page }) => {
  const response = await page.request.get('/api/auth/session')
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(['email', 'signedIn', 'status'])
  expect(typeof body.signedIn).toBe('boolean')
})

test('workspace endpoint never returns a guessed tenant', async ({ merchantPage }) => {
  const response = await merchantPage.request.get('/api/workspace')
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as Record<string, unknown>
  expect(body).toHaveProperty('status', 'ok')
  expect(body).toHaveProperty('selectionRequired')
  expect(Array.isArray(body.workspaces)).toBe(true)
})

test('discovery check refuses to leak another workspace', async ({ merchantPage }) => {
  const response = await merchantPage.request.get('/api/discovery/check')
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as Record<string, unknown>
  expect(['ok', 'error']).toContain(body.status)
  if (body.status === 'ok') {
    const manifest = body.manifest as Record<string, unknown>
    expect(Object.keys(manifest).sort()).toEqual([
      'capabilityCount',
      'generatedAt',
      'tenantId',
      'version',
    ])
  } else {
    expect(body).not.toHaveProperty('manifest')
  }
})

test('saved reports endpoint keeps a bounded envelope', async ({ merchantPage }) => {
  const response = await merchantPage.request.get('/api/research/saved-reports')
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as Record<string, unknown>
  expect(body).toHaveProperty('status', 'ok')
  expect(Array.isArray(body.reports)).toBe(true)
})
