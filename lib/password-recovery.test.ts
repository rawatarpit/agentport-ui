import { describe, expect, it } from 'vitest'
import { newPasswordError, passwordUpdateError } from '@/lib/password-recovery'

describe('password recovery copy', () => {
  it('names an expired or replayed recovery link specifically', () => {
    for (const message of ['Auth session missing!', 'Invalid token', 'Token has expired', 'code already used']) {
      expect(passwordUpdateError(message)).toMatch(/expired or was already used/i)
    }
  })

  it('names a weak password specifically', () => {
    expect(passwordUpdateError('Password should be at least 6 characters')).toMatch(/too weak/i)
    expect(newPasswordError('short', 'short')).toMatch(/at least 8/i)
  })

  it('refuses mismatched confirmation before the request leaves the browser', () => {
    expect(newPasswordError('long-enough', 'long-enough')).toBeNull()
    expect(newPasswordError('long-enough', 'different')).toMatch(/do not match/i)
  })
})
