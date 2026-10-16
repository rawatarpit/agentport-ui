# AgentPort Plan — record of decision (2026-10-16)

Owner's plan, adopted as the build order. Status is updated in place; anything
marked `built` names the commit or route that proves it.

## Thesis

Adopt like Analytics, pay for the watch, sign by merge. Custody, survival,
and signature are structural moats — not features, not copy.

## Positioning

- **Google Analytics for agent governance:** drop-in worker, verified decision
  proofs (counts + digests), merchant keeps their data.
- "We can't leak what we never hold" — security reviews end in one sentence.
- "Our outage never ungoverns you" — enforcement is local; screens say
  unknown, never green.
- "The merge is the signature" — policy goes live through their commit,
  regulator-auditable.

## Pricing (resolves 2026-10-14 priced memo)

- Founding pilot (SentraZero): **free**, hand-held, in exchange for the
  friction log and a reference. Terms in [`PILOT_TERMS.md`](PILOT_TERMS.md).
- Paid **proof tier**: retained ledger, digests, retention windows,
  compliance exports, multi-site views. Worker compute free (runs in their
  account). Never price amounts analytics — never held.
- The earlier ₹15k + ₹4,999/mo founding-pilot figure is superseded by this
  plan. The decision memo (`agentportUi/`) is historical context, not terms.

## Phase 0 — Unblock (now)

1. `/api/github/diag` output decides the key-bytes question. — **built**
   (session-gated shape metadata; live JWT→GitHub proof is the open
   follow-up, not a second endpoint).
2. Signed-in install via dashboard button → green → test PR → merge. —
   **built** (install state flow: issue → consume; buttons start the state
   flow, not bare GitHub links). Throwaway-repo proof is the owner action.
3. SentraZero manual path: config drop → push → Netlify deploys → dashboard
   onboarding → first live heartbeat. — **built** (`GET /api/golive/file` +
   Download button; same compiler as the PR path). Runtime wiring (SDK +
   routes + push key) is install-call work, not part of the drop.

## Phase 1 — SentraZero pilot (in progress)

- One merchant, hand-held end to end: install → answers → PR → merge → live
  digest → policy change → effect observed.
- Friction log becomes onboarding copy (kept in `PILOT_TERMS.md` §log).
- Pilot metrics: [`/api/metrics/pilot`](app/api/metrics/pilot/route.ts).

## Phase 2 — Frictionless adoption (scoped, not built)

- One-click-deploy worker (their account, their boundary). New primitive:
  needs product-thesis before build — a worker we ship is code running as
  us, and the custody line must be drawn before it, not after.
- State flow default; discovery fallback. — state flow **built**; discovery
  fallback open.
- Disconnect UI on existing DELETE route. — **built**.

## Phase 3 — Paid proof tier (scoped, not built)

Retention, tamper-evident history, exports, alerting on stale/unknown. The
row digest exists today (`row_digest`); retention windows and exports do
not. Nothing here weakens custody: the tier sells longer proof, never more
data.

## Phase 4 — Hosted enforcement (guardrail, no build)

Only with a signed custody exception + thesis review first. Amounts
in-transit, never stored, SDK-owned engine. Until then the invariant stands:
authorisation is local, and no sync, update, or rollback clears a locally
engaged kill switch. This phase is a fence, not a roadmap item.

## Metrics (defined; endpoint reports what rows prove)

- Time-to-first-proof (tenant created → first install/PR/push evidence).
- Installs reaching merged PR.
- Setup/callback failure-cause split.
- Stale/unknown hours (push recency per tenant).
- 30-day pilot retention.
- The endpoint reports `unknown` for anything rows cannot prove — metrics
  that invent data are decorative.
