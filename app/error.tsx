'use client'

/**
 * Route error boundary, styled like the console. A merchant who hits a
 * runtime failure must see that their money actions hold and nothing was
 * charged, not a dev-style crash screen. `reset()` re-renders the route;
 * the safest retry a dashboard can offer.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-start gap-8 px-6 pt-[18vh] text-center">
      <div>
        <p className="label">Something broke</p>
        <h1 className="mt-2 font-display text-3xl text-bone">
          This page failed to render
        </h1>
        <p className="prose-bone mt-3">
          The failure is on this screen, not on your agents: held orders stay
          held, decisions stay recorded in the ledger, and the kill switch,
          wherever you left it, has not moved. Nothing executed because a page
          could not draw.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button type="button" onClick={reset} className="btn sm:w-auto">
          Try again
        </button>
        <a href="/" className="btn sm:w-auto">
          Back to the overview
        </a>
      </div>
      {error.digest ? (
        <p className="font-mono text-[11px] text-bone/50">
          error digest: {error.digest}
        </p>
      ) : null}
    </main>
  )
}
