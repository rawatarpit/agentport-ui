import { describe, expect, it } from 'vitest'
import {
  DEMO_CEILING_INR,
  DEMO_CONSOLE_FIELDS,
  DEMO_ORDER_INR,
  DEMO_SCENARIOS,
  evaluateDemoRequest,
} from './landing-demo'

describe('landing page decision demo', () => {
  it('holds an order above the soft ceiling and does not execute it', () => {
    const result = evaluateDemoRequest({
      capability: 'createOrder',
      amountInr: DEMO_ORDER_INR,
    })
    expect(result.decision).toBe('hold')
    expect(result.execution).toBe('waiting_for_approval')
    expect(result.executionNote).toMatch(/not executed/i)
  })

  it('allows an order within the ceiling without claiming success', () => {
    const result = evaluateDemoRequest({
      capability: 'createOrder',
      amountInr: DEMO_CEILING_INR,
    })
    expect(result.decision).toBe('allow')
    expect(result.execution).toBe('not_yet_observed')
    expect(result.executionNote).toMatch(/not proof/i)
  })

  it('holds refunds for approval', () => {
    const result = evaluateDemoRequest({ capability: 'requestRefund' })
    expect(result.decision).toBe('hold')
    expect(result.execution).toBe('waiting_for_approval')
  })

  it('refuses a destructive capability before execution', () => {
    const result = evaluateDemoRequest({ capability: 'deleteAccount' })
    expect(result.decision).toBe('refuse')
    expect(result.execution).toBe('not_executed')
    expect(result.reason).toMatch(/never queued for approval/i)
  })

  it('never puts an amount in the console-facing fields', () => {
    expect(DEMO_CONSOLE_FIELDS).not.toContain('amount')
    expect(DEMO_CONSOLE_FIELDS).not.toContain('amountInr')
    expect(DEMO_CONSOLE_FIELDS).not.toContain('orderValue')
  })

  it('covers the four capabilities the page names', () => {
    expect(DEMO_SCENARIOS.map((scenario) => scenario.capability)).toEqual([
      'searchProducts',
      'createOrder',
      'requestRefund',
      'deleteAccount',
    ])
  })
})
