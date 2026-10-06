# TASKS — AgentPort, complete

Referenced from code by section number (e.g. `TASKS.md 5.7`). **Those references
are the point of this file** — a comment that cites a section is a claim that the
section exists, so renumbering here breaks the reader's ability to check it.

**Whole system, top to bottom: [`SYSTEM.md`](SYSTEM.md).**

**This file is the complete list — dashboard, Supabase backend, and runtime.**
§1–§7 are the dashboard. **§8 is the backend, §9 is the runtime**, §10 is
permanently open, §11 is done and must not regress. Nothing is duplicated in
`agentport-sdk/TASKS.md`; the split is here, and that file is now the short
pointer back to this one.

The dashboard is a **UI over Supabase**, not the backend and not on the data
path. Architecture: `agentport-sdk/ARCHITECTURE.md` §0. Data classification:
`agentport-sdk/dashboard_runtime_integration.md` §7.

**Every "live" surface has three states — `connected`, `unknown`, `stale` — and
`unknown` is a first-class answer.** A panel that showed optimistic status for a
runtime it cannot reach would be decorative, which is the failure the whole
architecture exists to prevent.

---

## 1. Connect the runtime

| # | Task | State |
| --- | --- | --- |
| 1.1 | Signup + tenant record | **demo** — `POST /api/signup` writes one merchant to `lib/store.ts` (process RAM). No credential is issued and no session starts; Supabase Auth magic links are **not built** |
| 1.2 | Website URL onboarding | **done** — `PUT /api/me` stores `websiteUrl` (https only, localhost for dev); the manifest advertises it, with an honest fallback note until set |
| 1.3 | GitHub App OAuth — selected repositories, minimum scopes | **blocked** — needs merchant-owned App ID, secret, webhook secret |
| 1.4 | Sync payload type that **cannot** express the kill switch | **done** — `SyncPayload` in `lib/enforcing.ts` is `Omit<Policy, 'emergencyKillSwitch'>` |
| 1.5 | Repository selection → branch `agentport/install` → PR | **not built** |
| 1.6 | Mirror CI checks + deployment status onto the PR | **not built** |

**1.3–1.6 are how the product gets in the door**, not a peripheral integration.
The merge of that PR is also the merchant's signature — the only place they act
through branch protection they built for another purpose, which is what makes
"the merchant signs their own policy" structural rather than a promise.

## 2. The ledger is durable and server-side

| # | Task | State |
| --- | --- | --- |
| 2.1 | Replace `InMemoryLedger` with real reads from Supabase | **not built** — `lib/store.ts` is six `new Map()`s in process RAM |
| 2.2 | `/ledger` reads the durable projection | **not built** — currently fixtures |
| 2.3 | Declared `policyInput` is authoritative over caller-supplied amounts | **done in SDK** — `lib/agentport.ts` declares `amountMinor`; without it the agent picks its own amount and picks it small |
| 2.4 | `/approvals` reads the durable queue, server-side | **not built** — `app/approvals/page.tsx` is fixtures, and its own comment says so |
| 2.5 | Show `rowDigest` so a counted row is verifiable against the merchant's local row | **not built** |

**2.1 is the honesty defect.** Every number on `/analytics` and the digest on `/`
is fabricated after a process restart. `POST /api/analytics` accepts a push and
counts it into memory.

## 3. Capabilities

| # | Task | State |
| --- | --- | --- |
| 3.1 | Capability editor with declared fields | **done** |
| 3.2 | Drafts never render as live | **done** |
| 3.3 | Field projection applied to handler results | **not built** (SDK side too) |
| 3.4 | A saved capability that has not merged is `not deployed` | **done** |

**3.4:** hiding a field changes the *advisory* manifest an agent reads. It does
not change what the ledger records and does not change enforcement. This screen
must never imply otherwise.

## 4. Policy and sync

| # | Task | State |
| --- | --- | --- |
| 4.1 | Rules editor — refusals, holds, caps, with save-time validation | **done** |
| 4.2 | Read-only policy view explaining why each rule sits where it does | **done** |
| 4.3 | **No approval gate on policy changes** | **decided** — the merchant is the sole authority over their own money, and setup already asks them to confirm each piece. Edit freely; **Sync is the act of publishing.** |
| 4.4 | Kill switch UI, monotonic locally | **done (dashboard half)** — `POST /api/kill-switch` flips the live row on a typed business name, both directions; panel on `/policies`. Runtime-local monotonicity (surviving restarts/rollbacks) is the runtime's job |
| 4.5 | Sync payload replaces policy wholesale | **done** (type only) |

**Do not confuse 4.3 with runtime approval.** A capability's `requiresApproval`
and the held-request queue are a *different mechanism in a different place* — an
individual runtime request waiting on a human, enforced in the runtime. Removing
the merchant's policy-approval gate does not touch it. Invariant 3: denials are
evaluated before approvals; a request that can never be permitted is never queued.

## 5. Tenant, proof, and liveness

| # | Task | State |
| --- | --- | --- |
| 5.1 | Enforcing panel with three honest states | **done** — states render from the store; before the first real push it holds the seeded demo heartbeat (`lib/store.ts`) |
| 5.2 | Panel reads the durable push record | **not built** — the record exists (`RuntimePush` in the store) but the store is RAM, so it is not durable |
| 5.3 | Enforcing digest + age, **sourced from the runtime's push, never computed here** | **done in shape, demo in source** — `POST /api/analytics` heartbeat is the panel's only writer; until a real push lands, the writer is the seeded demo heartbeat |
| 5.4 | Conversion as boolean per capability per window | **not built** |
| 5.5 | `unknown` rendered as a first-class state, never a spinner or blank | **done** |
| 5.6 | Server-side Supabase reads with `SUPABASE_SERVICE_ROLE_KEY`, never exposed | **not built** — no route touches the DB |
| 5.7 | `tenantId` stamped by the ledger, **never taken from the request** | **done in SDK** |

**5.3 is the control that stops a merchant believing the wrong thing is live.** A
dashboard-derived digest reports a config as live the moment it was saved —
which is exactly the wrong answer and indistinguishable from the right one.

**5.6:** the service role key bypasses row-level security. It must never reach a
browser; `next.config.mjs` fails the build if a `NEXT_PUBLIC_`-prefixed name
would inline it.

## 6. Onboarding

| # | Task | State |
| --- | --- | --- |
| 6.1 | Four questions, then one line — the end state is a command they paste | **done** |
| 6.2 | `/policies` merchant-language rules editor | **partial** |
| 6.3 | Chat page demonstrates governed conversion | **done** |
| 6.4 | Log stream panel: projection DDL, webhook URL + secret, SDK-vs-trigger, delivery receipts | **partial** — panel shows the ingest endpoint, key state, and delivery state honestly; DDL (B4) and the receiver (B1/B5) are not built |
| 6.5 | Test-event button — one round trip, shown | **done** — `POST /api/test-event`, dev-only, on `/connect` |

**6.4:** we ask the merchant for **one projection table** (counts, digests,
liveness — never their ledger) and for **a webhook to our ingest endpoint**,
Razorpay-style. Their side pushes; we never hold a credential into their
database. Prefer the **SDK** firing it — a Postgres HTTP trigger puts our
endpoint inside their commit path, so our latency becomes their write latency.

## 7. What to push to GitHub

Push source and config. **Never push a secret.** `.env.local` is gitignored and
that covers nothing else.

**Never use a `NEXT_PUBLIC_` prefix on:** `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ACCESS_TOKEN`, `AGENTPORT_SIGNING_SECRET`. The prefix inlines the
value into client JavaScript — no runtime check, no warning, no trace in the
repo. The service role key reads every tenant; the access token is
account-admin and can drop the database. `next.config.mjs` fails the build on
these three by name, and **the name is the protection** — do not weaken the list
without replacing the check.

Safe to commit: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`,
`NEXT_PUBLIC_AGENTPORT_BASE_URL`.

> `NEXT_PUBLIC_AGENTPORT_BASE_URL` is build-time inlined, so a value compiled as
> `localhost` ships as `localhost` until you rebuild. It is **not** the manifest's
> `baseUrl` — see `lib/agentport.ts`, which currently conflates them.
---

## 8. Backend — Supabase

Schema is **13 migrations, applied**. `analytics-ingest` is **ACTIVE v3**. What
is missing is the guarded entry point, not the database.

| # | Task | State |
| --- | --- | --- |
| B1 | **`public.agentport_ingest` — do NOT write it** | **withdrawn as a task, path proven live 2026-10-06.** Fresh 7-day test key minted for Northwind, real push accepted `200 {eventsWritten: 2}`, rows read back (`asked` + `denied` keeping `policy_denied`). Key auth, body validation, digest, and pepper all proven against the deployed function |
| B2 | Edge secrets `AGENTPORT_PUSH_PEPPER` + `AGENTPORT_INGEST_JWT` | **done — both set and the path works end-to-end** (see B1). Test key expires 2026-10-13; production per-merchant keys still need an operator |
| B3 | Authenticated end-to-end push against the hosted receiver | **done 2026-10-06** — `200`, receipt, rows verified by direct read. Negatives proven: no key → 401, bad shape → 4xx |
| B4 | Projection-table DDL for the merchant to install | **not built** — one table, counts + digests, never their ledger |
| B5 | Webhook receiver: per-tenant signature, **server** receipt time, dedupe by event id, out-of-order tolerance, retries + dead-letter | **not built.** A spoofed green is worse than no signal |
| B6 | Forwarder vs. the SDK pushing directly | **decided** — the SDK pushes. A forwarder is an extra credential, an extra hop, and a new place to leak |
| B7 | Config-distribution endpoint — the backend half of the hinge | **not built.** No equivalent of `analytics-ingest` serves policy |
| B8 | Durable read model so `/ledger` and `/approvals` stop being fixtures | **partial** — tables and the ledger exist; **no dashboard route reads the DB** |
| B9 | Configure GoTrue email delivery | **autoconfirm ON 2026-10-06, mail flows deliberately undone.** Signups mint sessions with zero emails (proven live end-to-end). Password reset page and team invites exist in UI but have no delivery behind them — **left undone by owner decision**, not by backlog: no SMTP is configured and none is planned until real merchants need recovery. Revisit when the UI is allowed to promise "check your email" |
| B11 | ~~Fix `service_role` able to execute `agentport_ingest_schema`~~ | **done** — migration `14500`. Verified `service_role_can_still_execute = false`. That function has no caller authentication at all, so the GRANT *was* the access control |
| B17 | ~~`authenticated` can read nothing~~ | **fixed — `20260930114700`.** RLS policies were inert: Postgres checks table privilege *before* row security, and `authenticated` had no grants. Only a real GoTrue session token found it. `authenticated` is now SELECT-only, deliberately |
| B18 | ~~`v_retention_overdue` is a cross-tenant disclosure~~ | **fixed — `security_invoker=true`.** It ran as `postgres` and exposed every tenant's retention state; a blanket view grant would have shipped the leak |
| B19 | ~~viewer can change roles / remove members~~ | **fixed.** `set_role` and `remove` lacked the `canManage` guard that `invite` had. Self-escalation was refused, which is why review missed it |
| B20 | ~~`supabase/config.toml` contradicts the live architecture~~ | **partly fixed.** Added `[functions.agentport-team] verify_jwt = true` (was inheriting a permissive default). `[api] enabled = false` / `[auth] enabled = false` are still stale prose |
| B21 | ~~no index for the `capability_names` member-read policy~~ | **fixed — `20260930114800`.** Correlated subquery on `analytics_events` by `capability_id`; the rollup index leads with `tenant_id`, which that query does not constrain, so every catalogue row drove a scan. Added `(capability_id, tenant_id)` |
| B22 | ~~PUBLIC EXECUTE on 19 trigger/event-trigger functions~~ | **fixed — `20260930114800`.** Not reachable today (PostgREST cannot expose a `trigger` return type; an event trigger cannot be SELECTed) and recorded as such, but three are SECURITY DEFINER and the argument for leaving it was only "nothing reaches it now" |
| B23 | ~~`config.toml` says `[api] enabled = false` and `[auth] enabled = false`~~ | **open.** Both are now false for the live project — GoTrue issues the session tokens the whole read path depends on and PostgREST serves `/rest/v1`. Local-dev prose that contradicts the deployed architecture |
| B12 | Identity, tenancy, RLS, and dashboard views | **done** — migrations `14300`, `14400`, `14500`. `tenant_members`, owner/admin/viewer, membership predicate (SECURITY DEFINER, path pinned), signup trigger, last-owner guard, **5 `security_invoker` views** |
| B13 | Provision the first tenant + push key | **done.** `Northwind Sports` (`70b23ed8…`), 3 capability names, push key minted and **accepted by the receiver** — so key auth, body validation and the pepper are all proven live |
| B16 | ~~No tooling to mint a push key~~ | **done** — `agentport-sdk/scripts/mint-push-key.mjs`. The pepper is SHA-256'd before use as the HMAC key, which is invisible at mint time and surfaces only as a 401 `invalid_key` at push time. `--check` verifies an existing key in constant time |
| B14 | ~~Email→user lookup for invites~~ | **done** — migration `14600`. `agentport_user_id_by_email`, service_role only, `anon`/`authenticated` verified refused |
| B15 | `agentport-team` edge function (invite / set_role / remove / list) | **done, deployed v3.** `verify_jwt=true`. Refuses self-escalation, admin-creates-owner, and removing an owner. Returns no email addresses |
| B10 | Rotate the Supabase PAT | **still owner action, but not for the reason I gave.** The PAT **works** — it is not expired. The risk is its *blast radius*: `POST /database/query` executes as `postgres` with `rolbypassrls`, so the token is write-capable against the whole database, not merely a Management API read |

---

## 9. Runtime — the SDK / CLI / binary

The enforcement path is the strongest part of the system. The gap is everything
that **feeds** it.

| # | Task | State |
| --- | --- | --- |
| R1 | **Config artifact channel** — backend publishes, runtime fetches | **crypto primitive done 2026-10-06** — `src/artifact.ts` (merchant Ed25519 keypair, canonical bytes over `stableStringify`, sign/verify, kill-switch refused, tenant/version bound) + 8 tests, SDK suite 634/633 green. Still pending: provision ceremony (keypair at tenant provision, private-key delivery), distribution endpoint (B7), runtime load-path verify + offline cache. Committed SDK-side locally (`d9f5ebd`, no remote to push to) |
| R2 | Merchant signs via **PR merge**; runtime verifies **locally** per request | **not built** |
| R3 | Reject unsigned, stale, or unknown-tenant artifacts | **not built** |
| R4 | Offline: cache config, **keep enforcing** when we are unreachable | **not built.** Our outage must not become a merchant's payment outage |
| R5 | Kill switch excluded from sync **by type**, monotonic locally | **partial** — excluded by type; there is no sync to exclude it from |
| R6 | `onBehalfOf` enforced as an **intersection** of merchant grant and user grant | **done** — request path `agent.ts:531`, commit path `agent.ts:862`, `delegation_insufficient`, 8 tests |
| R7 | Field projection applied to handler results | **not built** (UI 3.3 is the same task) |
| R8 | In-page discovery surface | **not built** |
| R9 | `connect-assistant` (MCP channel) | **not built** |
| R10 | Publish a **signed** release — `0.1.0+source` is not publishable | **blocked** on R11 |
| R11 | Linux SEA binaries — targets are `linux-x64` / `linux-arm64`; this host is `darwin-arm64` | **blocked** on a Linux runner |
| R12 | Four test files still spawn stale `dist/` instead of `dist-test/` | **not built** |
| R14 | Sessions — handle, resubmit, recovery | **not built.** *An agent acting for a person and an agent acting for nobody are the same call until a handle can be replayed into an authority.* That is the remaining shape of the gap — **not** delegation, which is enforced |
| R13 | **Re-run code + test + security review after the R12-era fixes** | **not built — and it gates the release.** Reviews were green *before* the analytics/CLI/architecture changes; none has run since. VETO stands until all three are clean |

---

## 10. Permanently open — needs a decision, not an implementation

| # | Question | State |
| --- | --- | --- |
| O1 | A write executes, then the ledger append **fails** | **not built.** Handlers run first, then append; a failure loses the evidence and the merchant cannot reconcile what they authorised |
| O2 | Export full-fidelity logs to us | **decided: no.** `capability + amount + precise timestamp` is joinable against their processor and makes us a party to the transaction. The answer is "amounts live in your ledger, not ours" |
| O3 | Show the merchant their own revenue in the dashboard | **decided: no.** The consequence of O2. `agent-port ledger` reads it, locally |

---

## 11. Done — do not regress

Each was a real defect, found by review and mutation-proven.

| # | Fixed |
| --- | --- |
| D1 | Policy-input assembly duplicated across the authorisation and commit paths — the same bug three times. Now one `assemblePolicyInput`, called by both |
| D2 | Ceiling rules guarded by `amount !== undefined` — an unreadable amount **skipped** the ceiling instead of failing it. `amount_unmeasurable` / `units_unmeasurable` now deny |
| D3 | A declared figure no longer leaves the caller's payload aliases readable; `policyInputFor` is per-request, not a constant |
| D4 | Ceiling scoping gates on `access === 'write'` plus `ceilingExempt` — **never** on `dataClass === 'payment'`, which is merchant-chosen and unverified |
| D5 | `approve()` re-runs `evaluate()` at commit — kill switch flipped mid-hold, and a credential that expired mid-hold, both deny |
| D6 | `redact()` handles a **top-level** array; key matching is whole-name and word-token, so `company` and `shipping` survive while `customerEmail` and `cardToken` do not |
| D7 | `assurance` is required and `NOT NULL`; a request with no identity records `unverified` / `unidentified` |
| D8 | `intentId` claimed durably before the handler runs — retries replay, a reused id with different input is `intent_conflict` |
| D9 | Append-only by construction: `BEFORE UPDATE`/`DELETE` triggers abort, and a test asserts the SDK emits no `UPDATE` or `DELETE` |
| D10 | Logger wired in every production construction, enforced structurally by `test/architecture.test.ts` |
| D11 | Logger redaction bounded, injection-safe, and unable to throw into the enforcement path |
| D12 | `agent-port ledger` — read-only, tenant-scoped, no edit verb |
| D13 | `agent-port ledger-table` — prints canonical DDL without opening a database |
| D14 | Analytics producer — aggregate-only, off the request path, offline-tolerant, unref'd interval, flush on SIGINT/SIGTERM |
| D15 | Test review — 14 blockers found and fixed; mutations prove each |

---

## B24 — ingest transport (2026-10-05)

Three defects prevented any analytics event from being stored. Fixed in the
database; the edge-side fix is written and **deployed only when a PAT with
`edge_functions_write` is available**.

| # | Defect | Status |
| --- | --- | --- |
| B24.1 | `authenticator` is `NOINHERIT`, so its membership in `agentport_ingest_caller` conferred no privilege. Grant existed, was inert. Fixed by direct grants — `20260930115000`. | done |
| B24.2 | Supabase gateway rejects any request lacking an `apikey`, before reading `Authorization`. Edge sent `Authorization` only. Fixed by sending `apikey`; verified it widens nothing. | **done, live** |
| B24.3 | No issuable credential for the `authenticator` JWT. Replaced by `agentport_edge` — `20260930114900`, left `NOLOGIN` pending reachability proof. | partially blocked |

**Assertions, not membership checks.** `pg_auth_members` passes on a `NOINHERIT`
role. Every future ingest grant must be asserted with `has_function_privilege`.

### BLOCKED — requires an owner action

1. **Rotate the project JWT signing secret.** It was pasted into a chat
   transcript. Every token the project can mint is derivable from it, including
   `service_role`. Rotate, then re-run `scripts/mint-ingest-jwt.py --apply`.
2. **Issue a PAT with `edge_functions_write`.** The current PAT writes secrets
   and auth config but returns 403 on `POST /v1/projects/{ref}/functions/deploy`.
   Nothing after 2026-10-05 can be deployed until this exists. Also a good moment
   to replace a write-capable PAT with a least-privilege one.
3. **Re-establish egress to Postgres** if the direct-DB transport is preferred
   over the JWT: 5432 and both pooler ports are currently unreachable.

| B24.4 | `normalizeMetric` emitted `unverifiedCallers: null`; the SQL reads key presence via jsonb `?`, so every push with caller metrics was refused as "never both". Fixed by omitting the absent key, and by making `NormalMetric` fields optional so the defect cannot re-compile. | **done, live** |

### RESOLVED — first analytics push stored

```
HTTP 200 {"ok":true,"pushId":"ff8358e3-…","replay":false,
          "eventsWritten":3,"callerMetricsWritten":1}
```

Verified by reading the rows, not the response: `push_batches.event_count = 3`
with digest, three `analytics_events` (one `denied` keeping its
`denial_reason`/`policy_rule`), one `analytics_caller_metrics` row with
`verified_caller_count = 47` and `unverified_caller_count` NULL.

Edge functions now: `analytics-ingest` v10 (`verify_jwt=false`),
`agentport-team` v10 (`verify_jwt=true`). A temporary `ap-probe` function was
deployed to read runtime env and has been **deleted**.

### Still yours

1. **Rotate `sbp_fca4c07…`** and the project **JWT signing secret** — both were
   pasted into this conversation. The JWT secret derives every token the project
   can mint, including `service_role`. After rotating the JWT secret, re-run
   `scripts/mint-ingest-jwt.py --apply`.
2. `~/.config/opencode/agentport.supabase.env` holds a stale token that 401s.
3. Outbound Postgres (5432 and both pooler ports) is still unreachable, so
   `agentport_edge` stays `NOLOGIN` by design. The JWT path works; the role is a
   credential-free fallback, not a requirement.

---

## 12. Enterprise production readiness — the dashboard

Added 2026-10-05 after reading every route, page and lib file in this repo, and
running the gates. **Numbering continues from §1–§11; nothing above was
renumbered**, because code cites these sections by number and renumbering breaks
the reader's ability to check a claim.

**Where the dashboard actually is.** It builds and typechecks
(`npm run build` → 15 routes; `tsc --noEmit` → exit 0). The hosted ingest path
is genuinely wired: `POST /api/analytics` verifies the real push digest through
the SDK's `analyticsProjectionBytes`, refuses on mismatch with `403` **before
storing**, and returns `503` in production pointing at the edge function. The
kill switch is monotonic by two independent guards (§1.4, §4.x). The enforcing
digest is sourced from the runtime's push rather than computed locally, which is
the control that stops a merchant believing the wrong thing is live. **This is
not 5%.** What is missing is durability, identity, and the config trust chain —
and those are the three things that decide whether a merchant can deploy it.

### 12.1 What blocks a production deploy

| # | Task | State |
| --- | --- | --- |
| 12.1.1 | **No authentication on any route.** There is no `middleware.ts`. `GET /api/config` returns the full policy, the capability list and the kill-switch state to any unauthenticated caller, and `resolveTenant()` returns `AGENTPORT_TENANT ?? 'example-shoes'` — one constant for the whole process | **not built** — the most urgent item in this file |
| 12.1.2 | `GET /api/config`'s own comment claims "in production this answers only a snippet credential". **No such check exists in the code.** The payload names what is forbidden and what is held | **comment asserts a control that does not exist** |
| 12.1.3 | Supabase Auth magic links, session start, and sign-out | **not built** — §1.1 records the same gap |
| 12.1.4 | Per-merchant authorisation on every route, not one shared tenant constant | **not built** |
| 12.1.5 | CSRF protection on state-changing routes (`golive`, `kill-switch`, `sync`, `me`) | **not built** |
| 12.1.6 | Rate limiting on `/api/analytics` and the auth routes | **not built** |

**12.1.1 and 12.1.2 are the same defect seen twice.** A comment describing a
control reads as one during review. This is the failure mode the SDK's own
`AGENTS.md` warns about — a comment that asserts something untrue is more
dangerous than no comment, because the next reader deletes the missing code
believing it was already written.

### 12.2 Durability — the honesty defect

| # | Task | State |
| --- | --- | --- |
| 12.2.1 | Replace the six `new Map()`s in `lib/store.ts:59-65` with server-side Supabase reads | **not built** — every number on `/analytics` and the digest on `/` is fabricated after a restart |
| 12.2.2 | `seedDemoPush()` (`lib/store.ts:72`) removed once a real push can land | **not built** |
| 12.2.3 | `/ledger` reads the durable projection | **not built** — fixtures, and **honestly labelled** in the page text |
| 12.2.4 | `/approvals` reads `SqlApprovalStore` server-side | **not built** — worse than §2.4 records: `app/approvals/page.tsx:13` is a module-level `const PENDING = [...]`, not even the store, and **no disclosure comment** |
| 12.2.5 | **Strip `amount` and `items` from the `/approvals` fixture.** | **done** — fixtures and render now show capability, agent, reason (no figures), rule. Reasons were rewritten, not just hidden: the old ones carried amounts in prose |
| 12.2.6 | Show `rowDigest` so a counted row is verifiable against the merchant's local row | **not built** — and **`rowDigest` does not exist in the SDK either.** `dashboard_runtime_integration.md` §7 lists it as a field that *does* go to us, so this is an SDK prerequisite, not a UI task |
| 12.2.7 | `lib/supabase.ts` grows from presence-reporting into real reads | **not built** — its current design is right: presence only, no value held, and no client constructed without credentials |

> **On 12.2.5.** `/approvals` is the one screen where a human approves a payment,
> and it currently displays an amount and line items. The boundary in
> `agentport-sdk/dashboard_runtime_integration.md` §7 is that amounts and
> parameters never reach us. A fixture is not a breach — nothing is transmitted —
> but it establishes a column, and a column is how an amount ends up in a
> dashboard query later. The approval screen should show **capability, agent,
> reason for hold, and the rule that fired.** Not the figure.

### 12.3 The config trust chain — the hinge

| # | Task | State |
| --- | --- | --- |
| 12.3.1 | Keep `configDigest` (`src/agent.ts:1695`) exactly as it is | **done, and correct** — it is a plain SHA-256 drift tag, not a signature |
| 12.3.2 | **Replace `digestFor`'s shared `AGENTPORT_SIGNING_SECRET` HMAC with a tenant-scoped Ed25519 merchant keypair** | **not built** — see the note below |
| 12.3.3 | Sign the canonical artifact bytes, not the digest | **not built** |
| 12.3.4 | Runtime verifies with the merchant's **public** key, locally, offline | **not built** |
| 12.3.5 | Reject unsigned, stale-version, and unknown-tenant artifacts. Fail closed | **not built** |
| 12.3.6 | Cache the last valid config; **keep enforcing when we are unreachable** | **not built** |
| 12.3.7 | Kill switch excluded from the **artifact type**, not only from `SyncPayload` | **partial** — §1.4 proves it for `SyncPayload`; the artifact type does not exist yet |
| 12.3.8 | Reuse `cosignVerifier()` rather than adding a second trust path | **not built** — `src/upgrade.ts:308` already argues two verifiers is the same mistake as two enforcement surfaces |

**Why 12.3.2, stated precisely, because the current code is not yet broken.**
`configDigest()` is `sha256(stableStringify(config))` — no key, integrity only.
`digestFor()` (`lib/golive.ts:204`) HMACs with `AGENTPORT_SIGNING_SECRET`, which
`src/upgrade.ts:1507` documents as **ours to make**: the platform's, not the
merchant's. Today that value is only ever *compared*, so it is sound.

It becomes a defect the moment F4 makes it load-bearing. If the key that says
"the merchant authorised this" is ours, then we authoring the rules and pushing
one with no ceiling produces a runtime that verifies faithfully and writes a
**valid, append-only row describing a decision the merchant never authorised.**
Nothing is forged — the rule is simply ours, and the ledger's entire value is
gone. That failure is undetectable by inspecting the row, because every column is
internally consistent.

The asymmetry that makes distribution safe: we may hold the merchant's **public**
key, because a public key cannot sign anything. That is the whole reason this is
Ed25519 keypairs and not a shared secret.

**Migration cost, now:** one demo tenant, and `configHash` in `lib/agentport.ts:66`
is the literal string `'a1b2c3d4e5f6a1b2'`. Cheap today, expensive after F4 ships
with a live runtime and a published artifact whose key model changed underneath
the merchant.

### 12.4 Deployment hygiene

| # | Task | State |
| --- | --- | --- |
| 12.4.1 | **Make `npm run lint` a gate.** | **done — correction.** The audit claimed `next lint` finds no ESLint config and blocks interactively. Wrong in this tree: `.eslintrc.json` exists and `npm run lint` exits clean, verified non-interactively. The gate is real; keep it in CI (12.4.3) |
| 12.4.2 | Security headers in `next.config.mjs` — CSP, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` | **done, minus CSP on purpose** — static headers ship from `next.config.mjs` (mirrored in `netlify.toml`); no CSP because Next hydration needs inline scripts and an `unsafe-inline` CSP is theatre. HSTS stays host-side so localhost never pins |
| 12.4.3 | CI running typecheck + lint + build on every PR | **done** — `.github/workflows/ci.yml` runs typecheck, lint, `npm test`, build. The SDK checkout step fails with instructions instead of guessing a repo slug |
| 12.4.4 | Keep the existing `NEXT_PUBLIC_`-service-role build guard | **done and real** — `next.config.mjs:27-34` throws on `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `…_ACCESS_TOKEN`, `…_SIGNING_SECRET` |
| 12.4.5 | Confirm `netlify.toml`'s SDK dependency strategy still resolves in CI | **not verified** — the comment at line 13 warns `npm ci` fails without a published package or pre-build step |

### 12.5 Correctness

| # | Task | State |
| --- | --- | --- |
| 12.5.1 | `lib/agentport.ts:72` — `baseUrl: process.env.NEXT_PUBLIC_AGENTPORT_BASE_URL ?? 'http://localhost:3000'` | **live defect** |
| 12.5.2 | Make `baseUrl` a merchant setting. `app/.well-known/agent.json/route.ts` already overrides it from `websiteUrl` and emits an honest `note` when unset — **that fix is in the right place and `lib/agentport.ts` should not contradict it** | **done at the route** — the in-process default stays a labelled demo fallback on purpose: the store imports that module for `configHash`, so reading the merchant there is a module cycle that crashes at import. Documented in the file |
| 12.5.3 | A missing baseUrl must not silently become the dashboard's own origin | **done** — the manifest route emits the fallback **plus** the note; silent was the defect, labelled is the fix |
| 12.5.4 | Add tests. There is **no test directory** in this repo — `package.json` has no `test` script | **done (unit)** — vitest, `npm test`, `lib/gates.test.ts`: 10 tests over validators + enforcing states. Enforcement path stays the SDK's, tested there |

**12.5.1 is the same bug the manifest route's comment says it already fixed**
("Was the live bug in README/SYSTEM: the two addresses were conflated"). The
override works; the underlying default still points at the dashboard.

### 12.6 Still blocked on someone else

| # | Task | Blocked on |
| --- | --- | --- |
| 12.6.1 | GitHub App OAuth, repo selection, `agentport/install` branch, PR with mirrored CI (§1.3, §1.5, §1.6) | merchant-owned App ID, private key, webhook secret |
| 12.6.2 | Linux SEA binaries and a signed release | a linux runner and release tag |
| 12.6.3 | Rotate `sbp_fca4c07…` and the project JWT signing secret | owner action — see "Still yours" above |
| 12.6.4 | Config artifact verify + offline cache (the SDK half of 12.3) | SDK implementation, then security review |

### 12.7 What this dashboard must never do

Not tasks. Constraints that make several tasks above obvious in hindsight.

- **Add an amount, instrument, or free-text field to any dashboard query.** The
  answer to "show me my revenue" is *"amounts live in your ledger, not ours."*
- **Call the agent runtime from a request handler.** Authorisation is local and
  synchronous; a per-request call to us makes our outage the merchant's payment
  outage.
- **Trust the unauthenticated manifest as authoritative policy.** It is advisory
  by design so an assistant can learn the business exists.
- **Read operational rows with the anon key, or loosen RLS to make that work.**
- **Expose a service-role key to the browser.**
- **Ship a comment that describes a control the code does not have** (12.1.2).
