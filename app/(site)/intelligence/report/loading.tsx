export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="panel p-5 sm:p-7">
        <p className="label">Intelligence preview</p>
        <h1 className="mt-2 font-display text-[26px] leading-tight text-bone">Reading public sources…</h1>
        <p className="prose-bone mt-3 max-w-[75ch]">
          This is a server render, not a progress estimate. The preview checks the public providers relevant to
          the answers you supplied: a World Bank country row, SEC EDGAR only when a company name is present, and
          GitHub public repositories for the industry or product term. A section with no dated source renders unknown.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-hidden="true">
          {['World Bank', 'SEC EDGAR', 'GitHub public'].map((source) => (
            <div key={source} className="rounded-lg border border-ink-line p-4">
              <p className="font-mono text-[11px] text-bone-dim">{source}</p>
              <div className="mt-3 h-2 w-3/4 animate-pulse rounded bg-ink-line/70 motion-reduce:animate-none" />
              <div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-ink-line/50 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
      <p className="max-w-[75ch] font-mono text-[11px] leading-relaxed text-bone-faint">
        No percentage, timer or completion claim is shown because none of those describes the server work.
      </p>
    </div>
  )
}
