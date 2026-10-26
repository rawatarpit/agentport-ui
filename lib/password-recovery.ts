/**
 * Password-recovery copy. GoTrue's messages are accurate but not actionable
 * for a merchant: "Auth session missing!" does not say the link expired.
 * These helpers turn the reasons this screen can actually meet into specific
 * instructions, while leaving unknown failures untouched rather than hiding
 * them behind a generic sentence.
 */

export function passwordUpdateError(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('expired') ||
    m.includes('invalid') ||
    m.includes('session missing') ||
    m.includes('not valid') ||
    m.includes('already used')
  ) {
    return 'That recovery link has expired or was already used. Request a new one below.'
  }
  if (m.includes('password should be at least') || m.includes('password is too short') || m.includes('weak')) {
    return 'That password is too weak — use at least 8 characters.'
  }
  if (m.includes('same as the old password') || m.includes('different from the old')) {
    return 'Choose a password different from the one you used before.'
  }
  return message || 'Could not update the password — try again.'
}

export function newPasswordError(password: string, confirmation: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password !== confirmation) return 'The two passwords do not match.'
  return null
}
