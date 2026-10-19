import { describe, expect, it } from 'vitest'

import type { AgentIdentity } from '@/lib/contracts'

import {
  appendDecision,
  buildDecisionRow,
  consoleMac,
  isUuidTenant,
  type ConsoleDecisionRow,
} from './console-append.js'

/**
 * Console durable rows. Every test asserts the security property, not the
 * helper: the MAC must match an independently computed vector, raw input
 * must never reach a row, and transport states must never be stored as
 * decisions.
 */

const TENANT = '70b23ed8-bba3-4541-83cf-6b6d1520c827'
const KEY = '0b'.repeat(32)
// Independently computed (Python hmac.new, same inputs) — if this drifts,
// one side changed the domain string and cross-implementation verification
// is already broken.
const EXPECTED_MAC = 'fc27676dbd60b55fdfedd1615cd8c9a8a26c736702fdeac2af4a5a08cd8302e7'

const identity: AgentIdentity = {
  agentId: 'gpt-shopping',
  assurance: 'verified',
  scopes: ['*'],
  credentialId: 'cred_test',
  issuedAt: '2026-10-08T00:00:00.000Z',
  expiresAt: '2026-10-09T00:00:00.000Z',
}

describe('consoleMac', () => {
  it('matches the independently computed vector byte-for-byte', () => {
    expect(consoleMac(TENANT, KEY)).toBe(EXPECTED_MAC)
  })

  it('binds the tenant: a different tenant is a different MAC', () => {
    expect(consoleMac('00000000-0000-4000-8000-000000000000', KEY)).not.toBe(EXPECTED_MAC)
  })
})

describe('isUuidTenant', () => {
  it('accepts uuids and refuses the demo constant', () => {
    expect(isUuidTenant(TENANT)).toBe(true)
    expect(isUuidTenant('demo-tenant')).toBe(false)
    expect(isUuidTenant('')).toBe(false)
    expect(isUuidTenant(undefined)).toBe(false)
  })
})

describe('buildDecisionRow', () => {
  it('carries no parameters, no evaluated figures, no detail prose — by design', () => {
    // The data-class boundary (dashboard_runtime_integration.md §7): amounts,
    // request data and free text never reach this backend. An earlier revision
    // carried redacted parameters + evaluated + detail; review killed all
    // three — evaluated figures ARE amounts, detail embeds amounts, and a
    // redacted amount is still an amount. This test pins the absence, so a
    // future "helpful" field addition goes red rather than shipping silently.
    const outcomes = [
      { status: 'ok', data: {}, requestId: 'req_1' },
      {
        status: 'denied',
        reason: 'policy_denied',
        rule: 'max_order_value',
        detail: 'Order of 500,000 minor units exceeds the ceiling.',
        requestId: 'req_2',
      },
      {
        status: 'pending_approval',
        requestId: 'req_4',
        approval: {
          requestId: 'req_4',
          tenantId: TENANT,
          agentId: 'gpt-shopping',
          capability: 'createOrder',
          input: { amountMinor: 50000, cardToken: 'tok_secret' },
          identity,
          createdAt: '2026-10-08T00:00:00.000Z',
          expiresAt: '2026-10-08T01:00:00.000Z',
          reason: 'Over threshold.',
        },
      },
      { status: 'error', message: 'charge declined for card 4111', requestId: 'req_5' },
    ]
    for (const outcome of outcomes as import('@/lib/contracts').ExecuteOutcome[]) {
      const r = buildDecisionRow({
        tenantId: TENANT,
        identity,
        capability: 'createOrder',
        outcome,
        configHash: 'sha256:ab',
      durationMs: 7,
    })
      expect(r.skip).toBe(false)
      if (r.skip) continue
      const keys = Object.keys(r.row)
      expect(keys).not.toContain('parameters')
      expect(keys).not.toContain('evaluated')
      expect(keys).not.toContain('detail')
      const text = JSON.stringify(r.row)
      expect(text).not.toContain('tok_secret')
      expect(text).not.toContain('50000')
      expect(text).not.toContain('500,000')
      expect(text).not.toContain('4111')
    }
  })

  it('maps denied outcomes exactly, ok outcomes honestly coarsely', () => {
    const denied = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'createOrder',
      outcome: { status: 'denied', reason: 'policy_denied', rule: 'max_order_value', detail: 'Too big.', requestId: 'req_2' },
      configHash: 'sha256:ab',
    durationMs: 7,
    })
    expect(denied).toEqual({
      skip: false,
      row: expect.objectContaining({ decision: 'deny', reason: 'policy_denied', rule: 'max_order_value' }),
    })
    const ok = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'searchProducts',
      outcome: { status: 'ok', data: {}, requestId: 'req_3' },
      configHash: 'sha256:ab',
    durationMs: 7,
    })
    expect(ok).toEqual({
      skip: false,
      row: expect.objectContaining({ decision: 'allow', reason: 'allowed', rule: 'default' }),
    })
  })

  it('never stores the raw held input: approval is rebuilt, not passed through', () => {
    const r = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'createOrder',
      outcome: {
        status: 'pending_approval',
        requestId: 'req_4',
        approval: {
          requestId: 'req_4',
          tenantId: TENANT,
          agentId: 'gpt-shopping',
          capability: 'createOrder',
          input: { amountMinor: 50000, cardToken: 'tok_secret' },
          identity,
          createdAt: '2026-10-08T00:00:00.000Z',
          expiresAt: '2026-10-08T01:00:00.000Z',
          reason: 'Over threshold.',
        },
      },
      configHash: 'sha256:ab',
    durationMs: 7,
    })
    expect(r.skip).toBe(false)
    if (r.skip) return
    expect(r.row.decision).toBe('require_approval')
    expect(r.row.approval).toEqual({ required: true, expiresAt: '2026-10-08T01:00:00.000Z' })
    expect(JSON.stringify(r.row)).not.toContain('tok_secret')
  })

  it('maps handler errors as allowed-but-errored, and skips transport states', () => {
    const err = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'createOrder',
      outcome: { status: 'error', message: 'boom', requestId: 'req_5' },
      configHash: 'sha256:ab',
    durationMs: 7,
    })
    expect(err).toEqual({
      skip: false,
      row: expect.objectContaining({ decision: 'allow', result: 'error', reason: 'handler_error' }),
    })
    const prog = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'createOrder',
      outcome: { status: 'in_progress', requestId: 'req_6', intentId: 'i1' },
      configHash: 'sha256:ab',
    durationMs: 7,
    })
    expect(prog).toEqual({ skip: true, reason: expect.any(String) })
  })
})

describe('unknown outcome statuses skip loudly (S2)', () => {
  it('a future 6th variant never returns undefined into the route', () => {
    const r = buildDecisionRow({
      tenantId: TENANT,
      identity,
      capability: 'c',
      outcome: { status: 'future_variant', requestId: 'req_x' } as unknown as import('@/lib/contracts').ExecuteOutcome,
      configHash: 'sha256:ab',
      durationMs: 7,
    })
    expect(r).toEqual({ skip: true, reason: expect.any(String) })
  })
})

describe('durationMs sanitization', () => {
  it('floors fractions, clamps negatives, and never emits NaN', () => {
    for (const [input, expected] of [
      [7.9, 7],
      [-3, 0],
      [Number.NaN, 0],
    ] as const) {
      const r = buildDecisionRow({
        tenantId: TENANT,
        identity,
        capability: 'c',
        outcome: { status: 'ok', data: {}, requestId: 'req_d' },
        configHash: 'sha256:ab',
        durationMs: input,
      })
      expect(r.skip).toBe(false)
      // NaN serialises to JSON null, which the door coerces to 0 — benign
      // either way, but the sanitizer means the row never depends on it.
      if (!r.skip) expect(r.row.duration_ms).toBe(expected)
    }
  })
})

describe('appendDecision', () => {
  it('refuses to run unconfigured rather than throwing into the request path', async () => {
    const warns: Array<{ event: string; meta: Record<string, unknown> }> = []
    const row: ConsoleDecisionRow = {
      request_id: 'req_7',
      agent_id: 'a',
      assurance: 'verified',
      capability: 'c',
      decision: 'allow',
      reason: 'allowed',
      rule: 'default',
      approval: null,
      result: 'ok',
      config_hash: 'x',
      duration_ms: 7,
    }
    const r = await appendDecision(TENANT, row, {
      url: '',
      anonKey: '',
      consoleKey: '',
      warn: (event, meta) => warns.push({ event, meta }),
    })
    expect(r).toEqual({ ok: false, reason: 'unconfigured' })
    expect(warns.map((w) => w.event)).toEqual(['console_append_skipped'])
  })

  it('an RPC failure returns, warns with the request id only, and never throws (S6a)', async () => {
    // The §9-critical property: the Supabase round-trip must not be able to
    // take the agent response down. Pointed at a closed port so the failure
    // is a refused connection, not a mock — mocks assert the double.
    const warns: Array<{ event: string; meta: Record<string, unknown> }> = []
    const row = {
      request_id: 'req_8',
      agent_id: 'a',
      assurance: 'verified' as const,
      capability: 'c',
      decision: 'allow' as const,
      reason: 'allowed',
      rule: 'default',
      approval: null,
      result: 'ok',
      config_hash: 'x',
      duration_ms: 7,
    }
    const r = await appendDecision(TENANT, row, {
      url: 'http://127.0.0.1:9',
      anonKey: 'anon',
      consoleKey: '00'.repeat(32),
      warn: (event, meta) => warns.push({ event, meta }),
    })
    expect(r.ok).toBe(false)
    expect(warns).toHaveLength(1)
    expect(warns[0]?.event).toBe('console_append_failed')
    // Custody: the warn payload carries the request id and the failure —
    // never the row, never the key, never the tenant beyond the id.
    const meta = JSON.stringify(warns[0]?.meta ?? {})
    expect(Object.keys(warns[0]?.meta ?? {}).sort()).toEqual(['message', 'requestId'])
    expect(meta).not.toContain('00'.repeat(4))
  })
})
