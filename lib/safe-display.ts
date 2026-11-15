/**
 * Caller-supplied names reach the console as ledger metadata. The governor
 * bounds their length but does not redact them, so a caller can put an email,
 * a card number or an SSN in `agent_label`. Mask the obvious shapes at the
 * display boundary. The ledger value is unchanged; upstream redaction is still
 * the real fix.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// Match a candidate run of digits and the separators the governor permits,
// then decide by digit count. Counting characters is wrong: `2024-11-20` is
// eight digits and must survive, while `4111/1111/1111/1111` is sixteen and
// must not. No `\b` anchors, so `abc4111111111111` is caught too.
const NUMERIC_CANDIDATE = /[0-9](?:[0-9 ._\-:/()@]*[0-9])?/g
const MIN_PII_DIGITS = 9

export function safeAgentLabel(label: string | null | undefined): string | undefined {
  const trimmed = label?.trim()
  if (!trimmed) return undefined
  return trimmed
    .replace(EMAIL, '[redacted]')
    .replace(NUMERIC_CANDIDATE, (match) =>
      match.replace(/\D/g, '').length >= MIN_PII_DIGITS ? '[redacted]' : match,
    )
}
