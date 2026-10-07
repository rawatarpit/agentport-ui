# AgentPort — the whole system, top to bottom

**Dashboard + Supabase backend + runtime.** One document, written from the top
down, so the shape is visible before the parts.

Status of record — SDK `npm run verify` → **626 tests, 625 pass, 0 fail, 1
skipped**. Backend **21 migrations applied** to
 `xqsfzhhgfhdemencsmii`, edge functions `analytics-ingest` and
 `agentport-team` **both ACTIVE v10** (verified via functions list).
 UI `npm run build` + `npm run lint` clean.

Authoritative sources: SDK `ARCHITECTURE.md` §0 · SDK
`dashboard_runtime_integration.md` §7 · UI `TASKS.md` · SDK `TASKS.md`.

---

## 1. The one sentence

**An agent gets a governed interface to a business's capabilities, and every
decision it makes lands in an append-only ledger the merchant owns.**

Everything below is machinery for keeping that sentence true.

---

## 2. The three roles, and the one that matters

| | Control plane (us) | Merchant | Runtime (their machine) |
| --- | --- | --- | --- |
| Authors capabilities & policy | **yes** | reviews | no |
| Signs the artifact | **no** | **yes — by merging the PR** | verifies, per request |
| Decides allow / deny / hold | **never** | no | **yes, synchronously** |
| Works with us unreachable | no | n/a | **yes** |

Three roles, not two. Conflating them is how a control becomes decorative.

**If we author the rules governing their money and push one with no ceiling, the
runtime enforces it faithfully and writes a perfectly valid append-only row
describing a decision the merchant never authorised.** Nothing would be forged.
The rule would simply be ours — and the ledger's entire value would be gone.

That is why the **PR merge is the signature**. Not a button in our dashboard: a
merge, in their repo, against branch protection they built for another purpose.
A dashboard "Approve" asks for trust; a merge exercises a control they already own.

---

## 3. Topology

```
   AGENT ──▶ merchant's runtime ──▶ their DB         agent-facing. THEIRS.
                │  ▲
                │  │  signed config artifact (runtime pulls & verifies)
                │  └───────────────────────┐
                │                          ▼
                └── aggregates ────▶  SUPABASE (our backend)   inbound. OURS.
                                        ▲
   BROWSER ──────────────────────────────┘   dashboard = UI over Supabase only
```

| Address | Owner | Read by |
| --- | --- | --- |
| manifest `baseUrl` — the merchant's public runtime endpoint | **merchant** | external agents |
| ingest endpoint — config, heartbeat, analytics | **us** | the runtime, outbound only |
| dashboard origin — login, authoring, panel | **us** | the browser |

The runtime is configured with exactly **one** of these — ours — and is never
told the first, because it *is* that address.

**The dashboard is a UI. It is not the backend, and it is not on the data path.**
No route in `app/api/` may relay ingest: that queues every merchant's push
traffic behind this app's deploys and function concurrency, and turns "is the
backend up" into a question about a UI.

> **Fixed.** The manifest serves the merchant's `websiteUrl` setting, falling
> back to the request's own origin with an honest note when unset. There is no
> dashboard-origin variable — nothing compiled-in can go stale.

---

## 4. The data-class rule

One boundary, and every part of the system obeys it.

| Class | Examples | Goes to |
| --- | --- | --- |
| **Personal / sensitive** | request parameters, amounts, instruments, customer PII, free text | **the customer's own backend only — never us** |
| **Everything else** | capability, `kind`, `assurance`, `count`, window, rule, denial reason, set sizes, `rowDigest`, runtime metadata, config | **Supabase** |

Personal data never reaches us — not aggregated on its way, not hashed and looked
up, not "just the first four."

### Conversion: the one payment-adjacent question we answer

```text
orders.create     succeeded 47   failed 3   window 2026-W41
```

Not `₹4,999  2026-10-04T10:42:07Z  agent-7`, for two independent reasons:
**capability + amount + precise timestamp is joinable** against the merchant's own
payment processor, and it makes us a party to the transaction — which makes "we
never hold payment credentials" true in form and false in substance. Timestamps
are windowed so a boolean cannot be joined to anything.

**Consequence, accepted deliberately: the dashboard can never show a merchant
their own revenue.** The answer is *"amounts live in your ledger, not ours"* —
`agent-port ledger` reads them, with `evaluated`, `configHash` and `rule` on
every row. This is the boundary, not a missing feature. Do not "helpfully" add
an amount to a dashboard query.

### `rowDigest` — completeness without disclosure

Each pushed event carries a hash of the full local ledger row, which never leaves
the merchant's machine. **We hold the digest; they hold the row.** A merchant
disputing a decision reads the local row, recomputes, and it matches. We can be
shown to have received *every* event without ever being *given* an amount —
because a hash is not a disclosure.

---

## 5. Supabase — our hosted backend

### 5a. Schema (21 migrations, all applied)

| Table | Holds |
| --- | --- |
| `tenants` | one row per merchant; push-key opt-in, retention, updated-at |
| `capability_names` | the allowlist — names provisioned by an operator |
| `push_batches` | one row per push; `pushId` for replay rejection |
| `analytics_events` | counts keyed by (capability, rule, kind) |
| `analytics_caller_metrics` | set **sizes** per window, never summable |
| `schema_snapshots` / `schema_tables` / `schema_columns` | merchant table **names** only — never rows |
| `release_purge_receipts` / `tenant_deletion_receipts` | append-only receipts for destructive ops |
| `audit` | our own operational audit |

### 5b. Guard functions — the trust boundary is enforced *in the database*

Enumerated vocabularies are **functions, not just code**, so a hand-written
`INSERT` or a restored dump cannot smuggle a value past them:
`analytics_event_kinds`, `analytics_denial_reasons`, `analytics_assurances`,
`analytics_policy_rule_is_allowed`, `analytics_capability_name_is_allowed`,
`analytics_push_versions`, `analytics_metric_keys`.

Destructive-op refusals: `agentport_refuse_update`, `agentport_refuse_truncate`,
`agentport_refuse_live_delete`, `release_object_is_immutable`,
`schema_shape_row_immutable`.

Retention is enforced by `agentport_enforce_retention_window` +
`agentport_purge_expired`, and tenant deletion writes a receipt rather than
vanishing.

### 5c. Edge functions

| Function | State |
| --- | --- |
| `analytics-ingest` | **ACTIVE v10.** Verifies the per-tenant push key, validates the payload digest, refuses unregistered capability names, collapses to counts. `verify_jwt=false` because it authenticates its own HMAC and must answer unauthenticated callers with 401 |
| `agentport-team` | **ACTIVE v10**, `verify_jwt=true`. Invite / set_role / remove / list. Refuses self-escalation, admin-creates-owner, and removal of an owner; returns no email addresses |

**Why analytics ingest currently returns `503 ingest_unavailable`.** It is **not**
a missing SQL function. The edge function picks its door from the validated body
— `agentport_ingest_push` or `agentport_ingest_schema` (`index.ts:1475`) — and
both are live; `authenticator` is correctly a member of `agentport_ingest_caller`.
The cause is that `callIngestRpc` (`index.ts:1454`) reads three env vars and fails
closed if any is empty, and **neither `AGENTPORT_INGEST_JWT` nor
`AGENTPORT_PUSH_PEPPER` is set.** Deployed secrets are the 7 platform-managed
ones. Setting those two values opens the path.

> An earlier draft of this document blamed a missing `public.agentport_ingest`
> "guarded entry point". **Nothing calls that function**, and writing it would
> add a third, unguarded, uncalled door. There is a stale comment at
> `index.ts:1381` making the same claim about `agentport_ingest_push`, which
> migration `13800` created.

### 5d. Identity (added 2026-10-05)

**GoTrue is deployed.** Email/password signup and login need no code and no edge
function — `supabase.auth.signUp()` / `signInWithPassword()` are the whole
implementation. Reimplementing password hashing here would be a second trust
path, which `AGENTS.md` §9 forbids. What is missing is SMTP, so confirmation and
reset emails have nowhere to go.

The AgentPort layer on top of it:

- `tenants.owner_id`, and `tenant_members(tenant_id, user_id, role)` with `owner` / `admin` / `viewer`.
- `agentport_provision_tenant` fires on `auth.users` INSERT and mints the tenant plus its first owner — in the database, atomically with the signup, so there is no window where a user exists with no tenant.
- `agentport_is_tenant_member()` is `SECURITY DEFINER` with `search_path` pinned, because the read policies call it and a policy on a table cannot call a function whose own read is policed by that same policy.
- `agentport_refuse_last_owner` refuses to let a tenant lose its last owner, on both delete and demotion.
- **5 views with `security_invoker = true`**, so RLS applies *through* them: `v_tenant_home`, `v_capability_activity`, `v_conversion`, `v_denial_reasons`, `v_schema_inventory`. A plain view is evaluated as its owner and would hand every member every tenant's rows.
- `agentport_user_id_by_email` resolves an address to a uid for invites. `service_role` only — verified that `anon` and `authenticated` are refused. It is the one function whose answer is "does this person have an account", so no browser-reachable role may ask it.

**Everything above is deployed against a database with zero tenants and zero
events.** The machinery is verified; it has never carried a customer's data.

## 6. The dashboard (this app)

Next.js on Netlify, talking to Supabase server-side.

| Route | Question | State |
| --- | --- | --- |
| `/` | Where do I stand? | **fabricated** — reads a `Map()` |
| `/setup` | Four questions, then one line | **done** |
| `/connect` | How does this reach my runtime? | honest `missing`/`done` per step |
| `/capabilities` | What may agents do? | **done** — drafts, never live |
| `/rules` | What is refused, held, capped? | **done** — save-time validation |
| `/policies` | Why does each rule sit where it does? | **done**, read-only |
| `/ledger` | What happened, including refusals? | **fixtures** |
| `/approvals` | What is waiting on me? | **fixtures** |
| `/analytics` | Is it working? | **fabricated** |
| `/chat` | Does it still convert when governed? | **done** |

Agent-facing, not human-facing: `GET /.well-known/agent.json` (advisory,
unauthenticated by design), `POST /.well-known/agent/invoke` (verifies the
token — never trusts the manifest).

Dashboard APIs (browser ↔ dashboard; the runtime never calls these in
production — it talks to Supabase directly):

| Endpoint | Purpose | State |
|---|---|---|
| `POST /api/signup` · `GET/PUT /api/me` | our account, current merchant, runtime URL setting | working, demo tenant until magic-link sessions land |
| `GET/PUT /api/drafts/:section` | per-tenant drafts (`setup`, `capabilities`, `rules`), validated at save | working |
| `GET/POST /api/golive` | summary + typed-confirm publish → signed version + digest | working |
| `GET /api/config` | signed live config for the tenant snippet, or 404 `not deployed` | working |
| `POST /api/sync` | signed policy receiver: HMAC, fresh timestamp, push-id dedupe, kill-switch refused | dev-only — 503 in production |
| `POST /api/analytics` | digest-verified counts + runtime heartbeat | dev-only — 503 in production |
| `GET /api/connect` | front-door steps as computed state | working |

Every refusal carries a machine-readable `reason`. Drafts never deploy;
publishing signs a version; only the runtime heartbeat turns it live on screen.

### The honesty defect

**`lib/store.ts` is six `new Map()`s in process memory. No route touches the
database.** So `/analytics` and the enforcing digest on `/` are fabricated after
a restart, and `POST /api/analytics` accepts a push only to count it into RAM —
which is why "point the runtime at the dashboard" looked necessary when it is not.

**Every "live" surface has three states — `connected`, `unknown`, `stale` — and
`unknown` is a first-class answer**, never a spinner or a blank. A panel showing
optimistic status for a runtime it cannot reach would be *decorative*.

The enforcing digest is sourced from the runtime's push, **never computed here**:
a dashboard-derived digest reports a config as live the moment it was saved, which
is exactly the wrong answer and indistinguishable from the right one.

---

## 7. The flow, end to end

**1 · Merchant authors** — connect data (names only, never rows) → define
capabilities → write rules. Save-time validation; drafts never go live.

**2 · GitHub install** — OAuth on selected repositories → branch
`agentport/install` → PR → **their CI/CD runs** → merge. *Not built.*

**3 · The artifact reaches the runtime** — merge publishes a signed artifact →
runtime fetches, **verifies the merchant's signature locally**, refuses
unsigned / stale / unknown-tenant. Kill switch excluded by type, monotonic
locally. *Not built — the hinge.*

**4 · Runtime installs** — SDK embedded in their app, or `agent-port serve`.
Exposure is an allowlist. *Built.*

**5 · The request path** — kill switch first → identity → exposure → delegation
→ ceilings → approval → execute → append. *Built, and the strongest part of the
system.*

**6 · The human in the loop** — held requests wait; `agent-port approve`
**re-runs evaluation at commit**, so a kill switch flipped mid-hold denies it. *Built.*

**7 · Logs flow out** — aggregates + `rowDigest` to a merchant-configured
webhook. *Producer built; receiver blocked on the SQL wrapper.*

**8 · Prove** — `/ledger` and `agent-port ledger`, tenant-scoped, read-only, no
edit verb. Append-only by construction. *SDK built; UI is fixtures.*

**9 · Evolve** — edit rules, Sync, runtime pulls. Rollback is a revert. *Not built.*

### Two different "approvals" — do not conflate

| | Where | What |
| --- | --- | --- |
| **Policy approval** | dashboard | **None.** The merchant is the sole authority over their own money; setup already asks them to confirm each piece. Edit freely — **Sync is the act of publishing.** |
| **Runtime approval** | runtime | `requiresApproval` holds an individual *request* for a human. Different mechanism, different place. Invariant 3: denials are evaluated before approvals. |

---

## 8. The webhook, and the one table

We ask the merchant for **one projection table** (counts, digests, liveness —
never their ledger) and for **a webhook to our ingest endpoint**, Razorpay-style:
their side pushes, to an address they chose.

**We never hold a credential into their database.** Standing read access to a
customer's production DB is a path from our SaaS into their data, converts
custody from structural into promissory, and fails their own security review.

| Who fires it | Cost to merchant |
| --- | --- |
| **The SDK** — already writing the row, POSTs on flush | none; already installed |
| Postgres HTTP trigger (`pg_net`) on `INSERT` | a migration; **puts our endpoint in their commit path** |

Prefer the SDK. The trigger cannot be bypassed by code that forgets to send —
a real advantage, not worth the coupling, since our latency becomes their write
latency.

**Receiver requirements, before anyone builds it:** per-tenant signature
verified first · **server** receipt time, never the caller's `pushedAt` · dedupe
by event id (delivery is at-least-once) · tolerate out-of-order arrival · never
on the enforcement path · **kill switch excluded from this channel too**.

A spoofed green is worse than no signal: unauthenticated, anyone can POST
"tenant X is healthy" and we render a live panel for a runtime that is off —
and the merchant trusts that panel.

---

## 9. Security boundaries

- **Offline is a mode, not an outage.** Config cached and re-fetched; analytics
  queued and retried; the runtime **keeps enforcing what it has** when we are
  unreachable. The moment evaluation depends on our availability, our outage
  becomes a merchant's payment outage.
- **The kill switch is local and monotonic.** No sync, update or rollback clears
  a locally engaged kill switch.
- **The runtime holds a per-tenant push key** — revocable, one write path. It
  never holds a database credential. `service_role` bypasses RLS and stays
  server-side; `next.config.mjs` **fails the build** if a `NEXT_PUBLIC_` name
  would inline it.
- **The manifest is advisory.** Unauthenticated so an assistant can find the
  business. Authoritative policy is the signed artifact, verified locally.
- **Approval re-evaluates.** A hold measured against one authority and committed
  against another would let a human approve a write the user never delegated.
- **Delegation is a ceiling**, enforced at request *and* commit, and frozen for
  the life of a hold.

---

## 10. What is missing, in order

1. **The config artifact channel.** Nothing downstream works without it.
2. **The `agentport_ingest` SQL wrapper** — unblocks authenticated end-to-end push.
3. **Dashboard on Supabase** — delete the `Map()`; every honest panel depends on it.
4. **GitHub App** — OAuth, branch, PR. Also the merchant's signature.
5. **Delete or dev-only the demo ingest routes.**
6. Durable `/ledger` and `/approvals`; show `rowDigest`.
7. Projection table DDL + webhook receiver.
8. Sessions — a handle identifies, it does not authorise.
9. Linux SEA binaries + a signed release.
10. Rotate the compromised Supabase PAT (owner action).

Full detail: UI `TASKS.md` · SDK `TASKS.md`.