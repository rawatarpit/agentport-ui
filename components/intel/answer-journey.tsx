import Link from 'next/link'

/**
 * A compact replacement for the former four-card disclosure.
 *
 * The form still submits by GET, so the URL contract must be stated at the
 * point where a visitor starts typing. This is deliberately one small note,
 * not a section: the truth survives, the wall of cards does not.
 */
export function AnswerJourney() {
  return (
    <div
      id="answer-journey"
      role="note"
      aria-label="How your answers travel"
      className="rounded-xl border border-ink-line bg-ink-soft/40 px-4 py-3 text-[12px] leading-relaxed"
    >
      <p className="text-bone-dim">
        The GET form puts your answers in the report URL. The edit, revisit and signup links carry them too;
        treat any of those links as containing your answers.{' '}
        <span className="font-medium text-bone">Do not put secrets in the fields.</span>
      </p>
      <p className="mt-1.5 text-bone-faint">
        Geography selects a country row from a World Bank dataset on our server; company name is matched locally against the SEC
        ticker list, and leaving it blank makes the public preview skip the SEC lookup. Industry — or
        products/services only when industry is blank — is the GitHub public repository search term. Website,
        objective, business model and customer segment are not sent to those three providers. This preview saves
        no profile or report rows; it records an allowlisted event name, the page pathname with no query string,
        and ids. After signup, carried
        answers are saved once as a tenant-scoped report snapshot; industry and sector reach tenant metadata only
        if you save them there, and the carried website is not set as your discovery origin. Never persisted in
        either tier: CVV, passwords, API keys, raw credentials.{' '}
        <Link href="/home#how" className="link">
          Full details
        </Link>
      </p>
    </div>
  )
}
