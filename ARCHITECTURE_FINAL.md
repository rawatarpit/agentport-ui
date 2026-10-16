# AgentPort — Final Architecture (2026-10-16)

The whole system on one page: plan, worker, API map, analytics. Status words:
LIVE (proven), BUILT (coded, proving), DESIGNED (spec'd, no code), TODO.

## 1. Final plan

- **Install:** one PR lands the `agentport/` kit → merchant merges → deploys.
  (LIVE mechanics; kit-contents expansion TODO with installer owner.)
- **Updates:** dashboard publish channel, never another PR. Tiered ceremony,
  signed artifact, heartbeat proof. (DESIGNED; durable-publish TODO.)
- **Pilot:** SentraZero free, hand-held, SDK-in-Next.js + HttpSource to Go.
- **Paid tier:** longer proof (retention, exports, alerting, multi-site) —
  never more data. (TODO.)
- **Universal runtime:** sidecar binary, Phase 2. (DESIGNED in SIDECAR.md.)
- **Fence:** hosted enforcement only with signed custody exception. No build.

## 2. The worker doing the actual job

The worker is the **SDK engine** (`src/`: `agent.ts` invoke pipeline →
`policy.ts` ordered rules → `ledger.ts` append → `sql.ts`/`sqlite.ts`
durable store). Today it runs **in-process** (TypeScript/Next.js route);
Phase 2 it runs as a **sidecar binary** beside any stack. Same law, two
housings. Every agent request runs: kill-switch → credential/scope →
forbidden → restricted class → absolute ceiling (deny, never queue) →
approval ceilings (hold) → rate limit → execute-or-freeze → record with
`configHash` + `evaluated` + tenant stamp.

## 3. API map — where agent calls live once `agentport/` is in GitHub

The folder in their repo (`agentport.config.ts`, manifest, invoke, head
snippet, middleware, sync, `llms.txt` at root) deploys with their site. All
agent traffic enters here and only here:

| Agent calls | Lives in | Runs on | Enforced by | Proof lands in |
|---|---|---|---|---|
| `GET /.well-known/agent.json` | their repo → their server | their hosting | static file built from config (advisory, unauthenticated by design) | — (nothing to prove) |
| `POST /invoke` | their repo → their server | their hosting | SDK engine, local signed config, sync decision | merchant ledger (their DB) + aggregates up |
| `GET /llms.txt`, head meta, response headers | their repo → every page | their hosting | — (pointers, not decisions) | — |
| `POST` dashboard publish | our Netlify | our hosting | tiered ceremony + signed artifact | approval log + artifact store |
| heartbeat/push `POST` ingest | edge function | our Supabase | HMAC, digest, dedupe, allowlisted keys | `push_batches`, `analytics_events`, `analytics_caller_metrics` |
| approvals `agent-port approve` | merchant terminal | merchant machine | CLI, frozen request, named approver | ledger `approval` block |

No other door exists: unregistered capability → named denial + ledger row.
No credential/scope → refused pre-execution. Frozen same-origin callouts,
redirects refused. Agent words never reach the decision (policy is code).

## 4. Supabase analytics — how everything is tracked

Our Supabase holds **proof aggregates only** (22 tables, 6 views, 4 edge
functions). Columns that exist nowhere: amounts, instruments, emails,
file contents, parameters.

- **Telemetry write path:** runtime signs check-ins (digest + counts +
  push-id) → `analytics-ingest` validates (HMAC, 64-hex digest, windowed
  timestamps, key allowlist — unknown keys refused, deducts) →
  `push_batches` (one row per push, immutable, 409 on conflict) →
  `analytics_events` (capability × kind × assurance × rule × reason counts)
  → `analytics_caller_metrics` (verified/unverified callers per window).
- **Console read path:** `console_decisions` (dashboard-visible rows, RLS) →
  `listDecisions`/`listHolds` → ledger/approvals screens. Digests per row
  (`v_decision_digests`), denial reasons (`v_denial_reasons`), activity per
  capability per week (`v_capability_activity`), conversion boolean per
  window (`v_conversion`), tenant home (`v_tenant_home`: members, events,
  last push, role).
- **Install/onboarding state:** `tenants` (+`website_url`), `tenant_members`
  (owner/admin/viewer), `github_install_states`, `github_installations`,
  `dashboard_drafts` (setup/capabilities/rules), `install_pull_requests`.
- **Governance of the store itself:** append-only triggers (UPDATE/DELETE
  abort), CHECK vocabularies, `(tenant_id, intent_id)` uniqueness,
  retention windows + purge receipts, teardown carveouts, probe fixtures.

## 5. Changes by layer (LIVE vs TODO)

- **Frontend (dashboard):** LIVE — 13 screens, install state flow,
  disconnect, download-config, metrics endpoint, diag. TODO — durable
  publish UI with tiered ceremony, artifact/rollback display, proof-tier
  screens (retention/exports/alerting), metrics display.
- **Backend (Supabase):** LIVE — 30+ migrations applied, 4 edge functions
  ACTIVE, RLS isolation proven per tenant. TODO — durable publish record +
  approval log tables, retention/exports machinery, operator aggregates.
- **Worker (runtime):** LIVE — SDK engine, HttpSource (frozen same-origin,
  no redirects), local ledger, CLI approve. TODO — artifact pull/verify/
  apply + keep-N + heartbeat (production channel), sidecar binary per
  SIDECAR.md (8 pre-build specs gate it), one-click deploy (thesis first).
