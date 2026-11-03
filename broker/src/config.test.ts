// Broker config tests
import { describe, expect, it } from 'vitest'
import { caPath } from './config'

describe('broker config', () => {
  it('pins the Supabase root CA path', () => {
    expect(caPath).toBe('/opt/agentport-github-broker/supabase-root-2021-ca.pem')
  })
})
