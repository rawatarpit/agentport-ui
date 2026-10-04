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
| B1 | `public.agentport_ingest` — the `SECURITY DEFINER` wrapper that checks, then **sets the role** | **not built.** `agentport_ingest_push` exists; the wrapper never was written. Until it is, every push fails closed with `503 ingest_unavailable` — which is the **correct** behaviour, not a bug. It refuses to write through a role it has not narrowed |
| B2 | Provisioned per-tenant push key (`apk1.*`) | **not provisioned** — needs an operator |
| B3 | Authenticated end-to-end push against the hosted receiver | **blocked** on B1 + B2. Cannot verify until both exist |
| B4 | Projection-table DDL for the merchant to install | **not built** — one table, counts + digests, never their ledger |
| B5 | Webhook receiver: per-tenant signature, **server** receipt time, dedupe by event id, out-of-order tolerance, retries + dead-letter | **not built.** A spoofed green is worse than no signal |
| B6 | Forwarder vs. the SDK pushing directly | **decided** — the SDK pushes. A forwarder is an extra credential, an extra hop, and a new place to leak |
| B7 | Config-distribution endpoint — the backend half of the hinge | **not built.** No equivalent of `analytics-ingest` serves policy |
| B8 | Durable read model so `/ledger` and `/approvals` stop being fixtures | **partial** — tables and the ledger exist; **no dashboard route reads the DB** |
| B9 | Supabase Auth (magic-link sessions) | **not built** — `POST /api/signup` issues no credential and starts no session |
| B10 | Rotate the compromised Supabase PAT in `.env.local` | **blocked** on the owner. `service_role` bypasses RLS |

---

## 9. Runtime — the SDK / CLI / binary

The enforcement path is the strongest part of the system. The gap is everything
that **feeds** it.

| # | Task | State |
| --- | --- | --- |
| R1 | **Config artifact channel** — backend publishes, runtime fetches | **not built. The hinge.** Nothing downstream works without it: a working enforcement point with no way to receive configuration. Every `artifact` hit in `main.ts`/`upgrade.ts` is *our own release* download, not policy |
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
