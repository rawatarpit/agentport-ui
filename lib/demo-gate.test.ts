import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_ENV_FLAG, demoModeEnabled, demoRouteDenial } from '@/lib/demo-gate'

describe('demoModeEnabled', () => {
  it('keeps demo mode on in development and tests', () => {
    expect(demoModeEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(demoModeEnabled({ NODE_ENV: 'test' })).toBe(true)
  })

  it('is off in production unless explicitly enabled', () => {
    expect(demoModeEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(demoModeEnabled({ NODE_ENV: 'production', [DEMO_ENV_FLAG]: '0' })).toBe(false)
    expect(demoModeEnabled({ NODE_ENV: 'production', [DEMO_ENV_FLAG]: '1' })).toBe(true)
    expect(demoModeEnabled({ NODE_ENV: 'production', [DEMO_ENV_FLAG]: 'true' })).toBe(true)
  })
})

describe('demoRouteDenial', () => {
  it('denies unauthenticated production requests with 401', async () => {
    expect(
      await demoRouteDenial({ env: { NODE_ENV: 'production' }, getUserId: async () => null }),
    ).toMatchObject({ status: 401 })
  })

  it('hides demo RAM when authenticated in production without the flag', async () => {
    expect(
      await demoRouteDenial({ env: { NODE_ENV: 'production' }, getUserId: async () => 'u1' }),
    ).toMatchObject({ status: 404 })
  })

  it('allows an authenticated production caller when the flag is explicit', async () => {
    expect(
      await demoRouteDenial({
        env: { NODE_ENV: 'production', [DEMO_ENV_FLAG]: '1' },
        getUserId: async () => 'u1',
      }),
    ).toBeNull()
  })

  it('changes nothing in development or tests', async () => {
    expect(
      await demoRouteDenial({ env: { NODE_ENV: 'development' }, getUserId: async () => null }),
    ).toBeNull()
    expect(
      await demoRouteDenial({ env: { NODE_ENV: 'test' }, getUserId: async () => null }),
    ).toBeNull()
  })
})

describe('RAM-backed routes are gated before touching the demo store', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')
  const routes = [
    'app/api/config/route.ts',
    'app/api/kill-switch/route.ts',
    'app/api/golive/route.ts',
    'app/api/signup/route.ts',
    'app/api/map/crawl/route.ts',
  ]
  for (const route of routes) {
    it(`${route} calls demoGuard before its handler body`, () => {
      expect(read(route)).toContain('demoGuard')
    })
  }
})
