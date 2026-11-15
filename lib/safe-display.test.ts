import { describe, expect, it } from 'vitest'
import { safeAgentLabel } from './safe-display'

describe('safeAgentLabel', () => {
  it('leaves ordinary labels alone', () => {
    expect(safeAgentLabel('flow-bot')).toBe('flow-bot')
    expect(safeAgentLabel('  Gift finder ')).toBe('Gift finder')
  })

  it('treats empty labels as absent', () => {
    expect(safeAgentLabel(null)).toBeUndefined()
    expect(safeAgentLabel(undefined)).toBeUndefined()
    expect(safeAgentLabel('   ')).toBeUndefined()
  })

  it('masks an email and numeric PII in common separators', () => {
    expect(safeAgentLabel('buyer@example.com')).toBe('[redacted]')
    expect(safeAgentLabel('4111 1111 1111 1111')).toBe('[redacted]')
    expect(safeAgentLabel('4111.1111.1111.1111')).toBe('[redacted]')
    expect(safeAgentLabel('4111_1111_1111_1111')).toBe('[redacted]')
    expect(safeAgentLabel('4111:1111:1111:1111')).toBe('[redacted]')
    expect(safeAgentLabel('4111/1111/1111/1111')).toBe('[redacted]')
    expect(safeAgentLabel('card 4111-1111-1111-1111')).toBe('card [redacted]')
    expect(safeAgentLabel('123-45-6789')).toBe('[redacted]')
    expect(safeAgentLabel('123 45 6789')).toBe('[redacted]')
    expect(safeAgentLabel('123_45_6789')).toBe('[redacted]')
    expect(safeAgentLabel('123456789')).toBe('[redacted]')
    expect(safeAgentLabel('abc4111111111111')).toBe('abc[redacted]')
    expect(safeAgentLabel('x123456789x')).toBe('x[redacted]x')
    expect(safeAgentLabel('call +1 415 555 0100')).toBe('call +[redacted]')
    expect(safeAgentLabel('call (415) 555-0100')).toBe('call ([redacted]')
  })

  it('does not mask ordinary dates and order labels', () => {
    expect(safeAgentLabel('bot-2024-11-20')).toBe('bot-2024-11-20')
    expect(safeAgentLabel('order-1000-2000')).toBe('order-1000-2000')
    expect(safeAgentLabel('v1.2.3.4')).toBe('v1.2.3.4')
  })
})
