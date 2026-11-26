/**
 * The two product areas answer different questions. Keeping the distinction on
 * the page prevents an interpretation about the market from being read as a
 * live merchant capability.
 */
export function ExperienceBoundary() {
  return (
    <section aria-labelledby="experience-boundary-heading" className="panel p-4 sm:p-5">
      <p className="label">Experience boundary</p>
      <h2 id="experience-boundary-heading" className="mt-2 font-display text-[20px] text-bone">
        Intelligence explains the market. Operations proves what happened here.
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">Intelligence</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            Public research, tenant interpretations, readiness observations and discussion-only workflows.
            Nothing here is a live capability, an executed action, or a decision made by the console.
          </p>
        </div>
        <div className="rounded-lg border border-ink-line p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">Operations</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            Existing ledger, approval, capability and analytics screens show what AgentPort actually observed
            for this tenant. Intelligence links to them read-only; it does not duplicate or control them.
          </p>
        </div>
      </div>
      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-bone-faint">
        No browser approval, publish, execute, or write control appears here. The hosted governor decides and
        the ledger records proof.
      </p>
    </section>
  )
}
