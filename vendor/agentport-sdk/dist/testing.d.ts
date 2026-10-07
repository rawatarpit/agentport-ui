/**
 * Test doubles. Not part of the default entry point.
 *
 * A merchant who reaches for `InMemoryLedger` in production gets a `Map` with
 * a cap, and `AGENTS.md` already records it as disqualifying as evidence: a
 * pilot that reports from it has no proof of anything. Keeping these out of the
 * root export means shipping them costs nothing and importing them is a
 * deliberate, greppable act rather than an autocomplete accident.
 *
 * They remain re-exported from where they are defined so that the runtime
 * defaults in `AgentPort` — which fall back to the in-memory approval and
 * idempotency stores — keep working without `src/` importing `src/testing.ts`.
 */
export { InMemoryApprovalStore, InMemoryIdempotencyStore } from './agent.js';
export { InMemoryLedger } from './ledger.js';
//# sourceMappingURL=testing.d.ts.map