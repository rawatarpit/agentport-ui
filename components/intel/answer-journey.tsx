import Link from 'next/link'

/**
 * The disclosure lives at the point of first disclosure, not in a footer.
 *
 * Each sentence is bounded to what the code does: the GET form puts answers in
 * URLs, the server queries named public providers, the preview writes no
 * profile or report rows, and telemetry carries no answers. We do not imply
 * answers stay in the browser: geography, company name and industry are used
 * in request-time provider work.
 */
export function AnswerJourney() {
  return (
    <section id="answer-journey" aria-labelledby="answer-journey-heading" className="panel p-5 sm:p-6">
      <p className="label">Before you answer</p>
      <h2 id="answer-journey-heading" className="mt-2 font-display text-[20px] leading-tight text-bone">
        Where your answers go
      </h2>
      <p className="prose-bone mt-3 max-w-[88ch]">
        The GET form puts your answers in the report URL. The edit, revisit and signup links carry them too;
        treat any of those links as containing your answers. Do not put secrets in the fields.
      </p>

      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        <li className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-verdant">01 · On our server</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">
            Your geography answer selects a country row from a World Bank dataset on our server; it is not sent
            as a search term. When you supply a company name, it is matched locally against the SEC ticker list,
            and only the resulting CIK is fetched; leaving it blank makes the public preview skip the SEC lookup.
          </p>
        </li>
        <li className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-verdant">02 · Public search</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">
            Your industry answer — or your products/services answer only if you leave industry blank — is the
            GitHub public repository search term. Website, objective, business model and customer segment are
            not sent to those three providers.
          </p>
        </li>
        <li className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-verdant">03 · What we record</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">
            The public preview saves no profile or report rows. It records only funnel telemetry: an allowlisted
            event name, the page pathname with no query string, and ids.
          </p>
        </li>
        <li className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-verdant">04 · After signup</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">
            When you reach setup with carried answers, the full profile is saved once as a tenant-scoped report
            snapshot. Industry and sector are mapped into reviewed setup choices and prefilled; they reach tenant
            metadata only if you save them there. The website from the link stays in the saved report profile but
            is not set as your discovery origin.
          </p>
        </li>
      </ol>

      <p className="mt-5 max-w-[85ch] font-mono text-[11px] leading-relaxed text-bone-faint">
        Never persisted in either tier: CVV, passwords, API keys, raw credentials.{' '}
        <Link href="/home#how" className="link">
          See how the governed path works
        </Link>
      </p>
    </section>
  )
}
