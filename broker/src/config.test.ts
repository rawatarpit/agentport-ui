import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

describe('broker config', () => {
  it('reads the pinned database CA file path', () => {
    const config = loadConfig({
      BROKER_DATABASE_URL: 'postgres://example',
      BROKER_DATABASE_CA_FILE: '/etc/agentport/supabase-root-2021-ca.pem',
    } as NodeJS.ProcessEnv)

    expect(config.databaseUrl).toBe('postgres://example')
    expect(config.databaseCaFile).toBe('/etc/agentport/supabase-root-2021-ca.pem')
  })
})
