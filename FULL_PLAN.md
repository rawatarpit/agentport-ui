# AgentPort — Full Plan (2026-10-16, consolidated)

Supersedes the 2026-10-14 priced memo. Companions: `ARCHITECTURE_FINAL.md`
(worker/API/analytics map), `PILOT_TERMS.md` (terms + friction log),
SDK `SIDECAR.md` (universal runtime design), `SYSTEM.md`/`TASKS.md`
(status of record).

## 1. Thesis

Adopt like Analytics, pay for the watch, sign by merge. Custody, survival,
and signature are structural moats — not features, not copy.

## 2. Positioning

- Google Analytics for agent governance: drop-in worker, verified decision
  proofs (counts + digests), merchant keeps their data.
- "We can't leak what we never hold" — security reviews end in one sentence.
- "Our outage never ungoverns you" — enforcement is local; screens say
  unknown, never green.
- "The merge is the signature" — policy goes live through their commit,
  regulator-auditable.

## 3. Product (5 + 13 + 22 + 4 + 1)

- **5 enforcement primitives** (their server, free): DISCOVER → IDENTIFY →
  AUTHORIZE → EXECUTE → PROVE. 8 policy rules, fixed order, kill-switch
  first. 666 SDK tests.
- **13 dashboard screens** (ours, paid tier): Home, Connect, Capabilities,
  Rules, Policies, Ledger, Approvals, Analytics, Map, Setup, Onboarding,
  Team, Chat. 26 API routes behind them, all tenant-scoped.
- **22 tables + 6 views + 4 edge functions** (our Supabase): tenants,
  memberships, decision rows, counts, installs, drafts, PRs, receipts.
  No amounts/instruments/emails/contents columns anywhere.
- **1 config file + 1 truck**: `agentport.config.ts` (policy + names only)
  via GitHub App PR. Merge adopts; heartbeat proves.

## 4. Pricing

- Founding pilot (SentraZero): **free** — hand-held, friction log +
  reference in exchange. Read-only week 1, one held write week 2, no SLA.
- Paid proof tier per site: retained ledger, digest-chained history,
  compliance exports, stale/unknown alerting, multi-site views. Worker
  compute free (their account). Never price amounts analytics — never held.
- Exit anytime, one click; ledger stays theirs.

## 5. Delivery rule (decided 2026-10-16)

PR happens exactly once (installation, full kit). All later changes flow
the dashboard publish channel: tiered ceremony (click safe-direction,
typed risky-direction, wall for kill-switch/scopes) → signed artifact
(HMAC, tenant secret, monotonic version) → runtime verifies/applies/
heartbeats → live on digest match. Rollback = restore-a-version. Staging
may auto-apply; production merge-gates until the pilot earns otherwise.

## 6. Entry model (three doors)

1. **Known assistants** — merchant-issued scoped expiring keys (pilot path).
2. **Human-delegated** — customer grants scope; credential bounded by
   merchant-grant ∩ user-delegation (`onBehalfOf`, frozen per hold).
3. **Public readers** — unverified, read-only, rate-limited, logged.
Discovery: `/.well-known/agent.json` + `llms.txt` + per-page headers/meta +
honest `robots.txt` pointer. No cloaking. Bypass = named denial + ledger
row (self-incriminating by design).

## 7. Runtime universality

Contract is HTTP + a file: `/.well-known/agent.json` (menu) +
`POST /invoke` (the deciding door). Today: SDK in-process (TS/Next.js),
HttpSource to any backend (frozen same-origin, redirects refused).
Phase 2: sidecar binary beside any stack (Unix socket, per-process
credential). Same law, two housings. Serverless holds state in the DB,
never memory.

## 8. Phases + status

- **Phase 0 (done):** diag endpoint; install state flow; manual config
  download (same compiler as PR); `/api/me` on Supabase tenant;
  `tenants.website_url` migration via CLI; metrics endpoint; opencode
  roster tracked in UI repo.
- **Phase 1 (in progress):** SentraZero hand-held — install → answers →
  PR → merge → live digest → policy change → effect observed. Needs:
  throwaway-PR proof, push main, first push, week-1 reads, week-2 held
  write. Friction log → onboarding copy.
- **Phase 2 (designed):** one-click worker + sidecar (8 pre-build specs
  gate construction); discovery fallback. Disconnect UI built.
- **Phase 3 (scoped):** retention, tamper-evident history, exports,
  alerting. Row digests exist; rest unbuilt.
- **Phase 4 (fence):** hosted enforcement only with signed custody
  exception + thesis review. No build.

## 9. Metrics (endpoint reports rows, never inference)

Time-to-first-proof · installs reaching merged PR · setup failure-cause
split · stale/unknown hours · 30-day pilot retention. `GET
/api/metrics/pilot`, caller-scoped, nulls where unprovable.

## 10. Invariants (non-negotiable, both repos)

SDK 8 (authorization first, specific denials, denials-before-approvals,
kill-switch first/local/monotonic, append-only ledger, redaction incl.
arrays, never trust agenthood, allowlist exposure) + dashboard 8 (unknown
never green, no fixtures, draft≠live, RLS is the control, no service_role
in browser, custody boundary, approvals displayed-not-decided, GitHub
least-privilege). Local decisions, merchant-signed artifacts, aggregates
only, no auto-update, no second compilers, no second trust paths.

## 11. Open owner actions (in order)

1. `git push` both mains (UI ~7 commits, SDK migrations + SIDECAR).
2. Throwaway-repo install proof → test PR → merge.
3. Rotate `12345678` (lived in chat) + chat-exposed PAT/JWT; mint prod
   push key.
4. SentraZero install call → first push → week-1 reads → week-2 held write.
5. Restart opencode in agentport-ui (tracked roster loads).

## 12. Decision log (dated owner calls)

**2026-10-17 — Shared tier: payloads may flow through us (GA-level analytics).**
Owner decided: in the shared (hosted-worker) tier, personal data passing the
execution path — e.g. a customer's phone number typed into the merchant's
chatbot — is acceptable, because it is already the merchant's data in the
merchant's API structure and it transit-reaches the merchant backend anyway;
the worker is a governed hop in an existing path, not a new collector.
Consequences, accepted:

- Shared tier sells GA-grade analytics (users, sessions, journeys, funnel,
  conversion, per-capability and per-agent splits) built from what already
  flows — no pixels, no scripts, no instrumentation.
- Enterprise tier is unchanged and *becomes the custody answer*: same
  binary on the merchant's backend, nothing about a call transits us;
  what we receive stays aggregates-only. The custody ladder is the
  pricing: free and visible to us → paid and invisible to us.
- Runtime invariants do NOT change in either tier: append-only ledger,
  redaction, authorization before execution, local synchronous decisions,
  kill-switch local/monotonic. What changed is the custody line between
  tiers, not the runtime's own rules.
- Still never persisted, in either tier: CVV, passwords, credentials,
  API keys/secrets. Per-tenant storage; deletable on request; DPDP-aware
  posture is a build requirement for the analytics store, not docs.

**2026-10-17 — Stack + hosting for the shared worker.**

- **The binary = the same TypeScript core, compiled to a single
  executable (Node SEA, Node 22).** No Go/Rust rewrite: the worker would
  re-implement the enforced policy logic in a second language, breaking
  the "no second compilers / no second trust paths" rule and creating a
  second enforcement surface that tests can't cover. One codebase ships
  as the npm package *and* the executable; compile per-arch on CI.
- **Hosting = the owner's existing fleet of small servers — no new
  infrastructure decisions.** The binary is a stateless single
  executable (Caddy + systemd, no Docker on small boxes); the request
  path never waits on a database. Workers carry thousands→millions of
  merchant requests and push only GA analytics events to Supabase;
  Supabase is the memory, not the mouth. This per-request fleet load is
  the stated cost justification for the shared tier's fee.
- **Host ladder:** existing fleet for pilot (drop-in, same artifact) →
  dedicated paid host behind the fleet LB at first paying tenant or >5
  tenants (=our outage is merchants' chatbot outages; paid service
  needs a load-balanced target, not one box) → GA = redundant fleet
  nodes + managed DB. Moves are rsync + restart — no rebuild, same
  artifact.
- **Analytics store = Postgres on the same Supabase project, separate
  schema, tenant-guarded columns, partitioned by window, materialized
  aggregates for the dashboard.** ClickHouse only when volume demands,
  not before. §12 never-persisted list (CVV/passwords/secrets),
  per-tenant deletion, and DPDP posture apply to this schema from day one.

**2026-10-17 — Language boundary, refined: enforcement goes Rust, plumbing
stays TS.** Owner decided. Keep unchanged: the Supabase project (migrations
+ edge functions), and the dashboard (Next.js). Change to Rust: the SDK
enforcement core (policy engine, ceilings, redaction, ledger shaping,
artifact verify) and the worker — so the shared fleet and the enterprise
sidecar are the same compiled binary, hosted: ours for shared, theirs for
enterprise. The seam is deliberately data, not code: signed artifact JSON,
ledger row shapes, canonical digests, and Supabase REST are the whole ABI
between the Rust world and the TS world. **Full phased plan:
`../agentport-sdk/RUST_MIGRATION.md`** (X0 pilot TS → X1 contracts → X2
core port → X3 worker → X4 shadow + flip; invariants there are enforced by
conformance fixtures, not prose).

Migration gates, in order (none skipped):

1. TS pilot path finishes first — worker API, AgentPort integration,
   ledger + analytics write-back — and stands as the executable spec.
2. A conformance suite: same artifact + request corpus → byte-identical
   decisions, ledger rows, refusal messages; runs against TS now, Rust
   later. This is the only guard for the known semantic bug classes
   (fail-open ceilings, redaction traps), which memory safety does not fix.
3. Canonical JSON (RFC-8785-style) fixed before the first line of Rust:
   JSON.stringify vs serde disagree on key order, floats, escapes, and
   configHash/digests/signatures sit on byte-equality of serialization.
4. New sibling repo `agentport-core`; port order blueprint/expand/secrets
   → artifact/identity → policy → agent → ledger. TS core feature-frozen
   at parity; both tiers flip together — one compiler either way.

Interim realities, accepted: two cores exist during migration (TS serves
the pilot); the current TS npm SDK remains the adoption path until the Rust
core also ships a WASM front for in-process merchants; the SEA config
(`sea-config.json`) is scaffolding for the TS interim binary only.
