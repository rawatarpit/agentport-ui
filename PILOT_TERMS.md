# Pilot + Proof-Tier Terms (2026-10-16)

Terms in writing, per the plan. Plain language; the legal form follows this,
not the other way round.

## Founding pilot — SentraZero (free)

- **Price:** ₹0. In exchange: hand-held onboarding, a friction log we may
  quote (anonymised on request), and a reference call for future merchants.
- **Scope:** 1 environment · their stack (Next.js + Go + Supabase) · governed
  actions fair-use for a pilot (abuse reverts to a quota we state in
  advance, never silently).
- **Pace:** read-only week 1 → one approval-gated write week 2 → policy
  change with observed effect before close.
- **Support:** install call + first-proof session + same-day responses on
  business days. No SLA — this pilot is how we earn the right to offer one.
- **Exit:** anytime, one click (remove member / rotate key / uninstall App /
  local kill-switch). The ledger stays theirs; aggregates carry retention +
  deletion receipts. Leaving never deletes their proof.
- **What we never promise in pilot:** auto-enforce on save (merge is the
  signature), dashboard approvals (CLI), revenue/amount views (custody),
  uptime (enforcement is local; our outage never ungoverns them).

## Paid proof tier (when Phase 3 ships)

- **You pay for the watch:** retained ledger beyond the base window,
  tamper-evident history (digest-chained), compliance exports (CSV/JSON of
  your own rows), stale/unknown alerting, multi-site views.
- **Priced per site** for the proof stream. Worker compute stays free (runs
  in their account).
- **Never sold:** amounts analytics (never held), enforcement hosting
  (Phase 4 guardrail), broader data collection. The tier sells longer proof,
  never more data.

## Friction log (pilot evidence → onboarding copy)

| Date | Friction | Cause | Fix / copy |
|---|---|---|---|
| 2026-10-14 | "No account yet" on site-address save while signed in | `/api/me` read RAM demo maps, not the Supabase tenant | Session→tenant resolution; structural guard test |
| 2026-10-14 | Install on GitHub, dashboard says missing-installation | Blank Setup URL → GitHub never redirected with the install id | Install state flow (issue → consume); buttons start state, not bare links |
| | | | |
