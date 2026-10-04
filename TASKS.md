# TASKS — AgentPort Cloud

Every task, ordered by **the merchant's path**, not by what is easiest to build.
Status is honest: `done`, `partial`, or `missing`. A task that reads as more
finished than it is worse than an empty list.

**Last verified:** `npm run build`, `npm run typecheck`, and `npm run lint` all
clean, and the gate below run against a production build — not a dev server.

Read [`AGENTS.md`](./AGENTS.md) first — the invariants there are why several of
these tasks look strange.

---

## The flow

```text
 1. sign in with GitHub          auth, and their identity, in one step
 2. install the App              repo granted. We never see a password.
 3. analyse the repo             locally, in their workflow. Names and types only.
 4. review a pull request        ← THE SIGNATURE. Their review, their merge.
 5. pick the capabilities        the ones they keep, the ones they hide
 6. add their own                another API, database, or system
 7. set the environment, SYNC    pushed inbound to their runtime
 8. come back next week          analytics and comparisons
 9. open their own database      the ledger table we asked them to create
```

**Where the work actually is:** steps 1–2 and 7 are entirely missing. Steps 3–5
are done, in the SDK, and need surfacing.

**Step 8 is closer than it looks, and this was verified against the live project
rather than inferred from the repository:** all 13 migrations are applied
(`local == remote`), and the `analytics-ingest` edge function is `ACTIVE` on
version 3. The destination is finished and running. The *only* missing piece is
constructing the sender — `createFetchAnalyticsSink` exists in the SDK and nothing
ever calls it. There is no pipe to lay. Someone has to turn it on.

Steps 1, 2, 4 and 7 need a **registered GitHub OAuth App** and a real
installation flow. Those cannot be completed without an account on the merchant's
side; the code is not the blocker, the credentials are.

| Step | Status | Where |
| --- | --- | --- |
| 1 GitHub auth | **missing** | — |
| 2 App install | **missing** | — |
| 3 Repo analysis | **built** | SDK `discover` / `capture` / `hook` |
| 4 PR + merge | **missing** | needs a real GitHub App |
| 5 Pick capabilities | **built** | SDK `inventory` |
| 6 Add another API/DB | **built** | SDK `expose()` |
| 7 Sync | **missing** | — |
| 8 Analytics | **sender missing** | destination **verified live**; nothing constructs the sender |
| 9 Own ledger | **partial** | `SqlLedger` built; `agent-port ledger` missing |

---

## The two channels

The runtime does two separate things with every decision, and the distinction is
the custody boundary, expressed in code.

```text
     their site                          their database
  ┌────────────────┐
  │    runtime     │───── 1. LEDGER ──────→│ agentport_ledger │
  │                │                        │  every row       │
  │  decides ──────┼───── 2. ANALYTICS ───→│ Supabase (ours) │
  └────────────────┘         opt-in          │  counts, reasons │
                                            └──────────────────┘
```

**We never receive a ledger row.** The runtime writes it into a table in the
merchant's own database. There is no redaction step to get wrong, because the raw
row does not travel. The merchant reads it with any SQL client they already have,
and keeps it if they stop paying us.

**What comes to us is deliberately dull:** counts, capability names, reasons,
durations, `assurance`, set sizes. The Supabase privilege model already enforces
this — `anon` and `authenticated` are revoked at the schema level and the ingest
role can append and nothing else.

---

## Phase 0 — Unblock

Nothing below is verifiable until this is done. The repo does not compile.

**Done.** 0 errors → 0, build clean, lint clean. 0.4 resolved by *wiring* the
signing secret rather than deleting it: the SDK reads `AGENTPORT_SIGNING_SECRET`,
and `.env.example` had been advertising `AGENTPORT_SIGNING_KEY`, so the variable
was wrong **and** unread.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 0.1 | Fix the 15 `tsc` errors | Three SDK contracts moved: `InMemoryLedger` left the root export, money fields take `{ minor, currency }`, `input` is an `InputSchema` | `npm run typecheck` clean |
| 0.2 | Rewrite the policy in `lib/agentport.ts` | The current `{ amount: 25_000 }` does not mean what it appears to mean | Typechecks, and a test asserts the intended ceiling |
| 0.3 | Re-run the three curl calls | The README transcripts predate the SDK changes | 200 / 202 / 403 in that order, captured fresh |
| 0.4 | Delete or wire `AGENTPORT_SIGNING_KEY` | It is in `.env.example` and read by nothing. A control that reads like a control is the same failure as `UserDelegation.scope` in the SDK | One or the other, decided |

**Gate: met.** `npm run build`, `npm run typecheck`, `npm run lint` all clean.

---

## Phase 1 — Security

One public endpoint currently trusts the caller.

**Done, and proven against a running server rather than a type checker.** The
bypass is dead: `Authorization: Bearer superadmin` was `superadmin` holding
`scopes: ['*']` with a fresh five-minute expiry; it is now a `403` with the named
reason `identity_expired`, and so are a missing token and a tampered signature.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 1.1 | Replace `verifyIdentity()` | Today the bearer token **is** the `agentId`, with `scopes: ['*']` and a fresh five-minute expiry per request. `Authorization: Bearer superadmin` **is** `superadmin`, with everything. The comment above it forbids trusting the request *body*; the code trusts the request *header* | A business-issued, scoped, expiring credential resolves to an `AgentIdentity`. A caller cannot choose its own `agentId` |
| 1.2 | Record `assurance` honestly | `unverified` is the only truthful value until a signature is derived | Every rendered entry carries `verified` or `unverified`, and `unverified` is never shown as authority |
| 1.3 | Keep `/approvals` inert, and say why | Browser approvals put a second, differently-available approver in front of a real-money decision, and their identity would not land on the row the way a CLI approver's does | Buttons stay disabled with a visible reason |
| 1.4 | Never accept the kill switch from a payload | Sync replaces policy and `emergencyKillSwitch` is a plain boolean. The SDK's public manifest already types it permanently `undefined` because a published boolean turned the unauthenticated document into a **readiness oracle** | The sync payload type `Omit<…, 'emergencyKillSwitch'>` — enforced by the compiler |

**Gate: met.** Every untrusted call returns `403` with a specific reason and
writes a ledger row; a signed credential gets `200`. `insufficient_scope` and
`unknown_capability` now name themselves, so an agent can act on the refusal
instead of retrying it.

---

## Phase 2 — The record must be true

The PROVE primitive. A wrong number here is worse than no screen.

**Done**, with one finding worth keeping: running the gate proved that a figure
the engine cannot read **denies** rather than skips, so `createOrder` refused
*every* legitimate order until `policyInputFor` declared `units` as well as
`amountMinor`. Declaring one figure on the policy is not enough — one unreadable
figure denies the whole request. The refusal was correct; the capability was
wrong.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 2.1 | Adopt `SqlLedger` | The SDK moved `InMemoryLedger` into `src/testing.ts` deliberately, so production use is greppable rather than accidental. A pilot reporting from a `Map` with a cap has no proof of anything | Reads durable rows |
| 2.2 | **Add the `configHash` column to `/ledger`** | `AGENTS.md` invariant 4 requires it and the table omits it. A row saying `rule: max_order_value` with no amount, no ceiling and no config version cannot be reconciled against the config that produced it | Every row renders its hash and reconciles to a `configDigest` |
| 2.3 | Declare an authoritative figure on `createOrder` | The order ceiling is measured against `amountMinor` **supplied by the caller**. An agent wanting an order approved sends a small number and the threshold is never reached | `policyInputKeys` or `policyInputFor` supplies it |
| 2.4 | Refuse to render a row without its numbers | An unreadable amount must not skip the ceiling. That is a fail-open rule under a fail-closed merge, and it is the worst bug this codebase has shipped | `amount_unmeasurable` renders as a refusal with its reason |

**Gate: met.** A held `createOrder` row renders
`rule: max_order_value`, `Measured: amount=33,800  threshold=25,000  unit=minor`,
and its `configHash`. The merchant can say what decided it and against what.

---

## Phase 3 — Front door (steps 1–2, 4)

The merchant arrives here. This is the whole acquisition surface.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 3.1 | GitHub OAuth | This is the merchant's identity, and the org that installs becomes the `tenantId` the ledger already requires | A merchant signs in and an org is recorded |
| 3.2 | App installation + repo select | We analyse their repo **in their workflow** — names and types only, never their rows, never their DB credentials | The App installs and a repo is chosen |
| 3.3 | Generate the PR | The generated file must typecheck against the SDK, so the generator **ships in the CLI** (`agent-port codegen`), not here. If it lived only in the cloud, producing a policy would require reaching us | A branch opens with a typed `expose()` and policy |
| 3.4 | Merge is the signature | Nothing may affect a running system without it. **We cannot merge into a protected branch**, and that is the property, not a limitation | A draft saved but not merged renders `not deployed` |
| 3.5 | Candidate list from `inventory` | `inventory` already computes `CORROBORATED`, `USED-NEVER-DECLARED`, `DECLARED-NEVER-USED`. The middle bucket is the product: an endpoint that appears in no contract a reviewer would read | The merchant picks what to keep, and can hide fields |

**Gate:** a merchant with no repository goes from sign-in to a merged PR, and a
capability saved but not merged is visibly not deployed.

---

## Phase 4 — Sync (step 7)

The fast path. **This is an inbound attack surface on a merchant's live site.**

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 4.1 | Sync receiver on the runtime | Capabilities and policy, added / edited / deleted, delivered inbound | A capability added here reaches the live runtime after a sync |
| 4.2 | Sign the payload | This endpoint accepts configuration from the internet. An unsigned channel is remote code execution on a merchant's site | The runtime refuses an unsigned or replayed payload |
| 4.3 | Distinct credential + rotation + replay protection | A shared admin secret does not survive one being leaked | Compromise of one merchant's credential reaches no other tenant |
| 4.4 | Visible failure | The merchant must never believe a change landed when it did not | A `configHash` the dashboard does not recognise is an explicit state, never a blank |
| 4.5 | Never carry the kill switch | See 1.4. Enforced by type | A payload cannot express it |

**Merge is durable, sync is fast.** Neither replaces the other, and a `configHash`
on every row preserves the record regardless of which path a change came in by.

**Gate:** with the network cut, the runtime keeps enforcing and the dashboard
shows `unknown` rather than a stale `enabled`.

---

## Phase 5 — Reading it back (steps 8–9)

The merchant comes back after a week. Everything on that screen must be something
the runtime asserted.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 5.1 | Construct the analytics sender | `createFetchAnalyticsSink` exists in the SDK and **is never constructed**. The destination is confirmed live, so this one function call is the whole of the remaining work on the analytics path — and it is the single highest-value task in this file | One push lands in `analytics_events` |
| 5.2 | Confirm the ingest path end to end | `agentport_ingest_push` is a `SECURITY DEFINER` function, all 13 migrations are applied, and `analytics-ingest` is `ACTIVE` v3 — so this is now a *verification*, not a build | A push returns a receipt rather than `503 ingest_unavailable` |
| 5.3 | Show the enforcing digest and age | The one control that stops a merchant believing the wrong thing is live. **Sourced from the runtime's push**, never computed here — a dashboard-derived digest reports a config as live the moment it is saved | The panel reads *"enforcing `abc123`, 4 min old"* from a runtime assertion |
| 5.4 | Comparison over time | What the merchant came for: are refusals falling, are approvals piling up, which capability is being called | A week-over-week view that survives a runtime disappearing |
| 5.5 | `agent-port ledger` in the CLI | The rows are theirs and always were, but today the CLI can write every row and read none back. Until it can read one, "open your own database" means writing SQL by hand | The merchant can read their own ledger without writing SQL |
| 5.6 | `agent-port ledger-table` | Prints the DDL we ask them to run, including the immutability triggers. **Prints; never connects** | A merchant can create the table unaided |
| 5.7 | Multi-tenant isolation | Two shops choosing the same `intentId` is ordinary. `SqlLedger` is keyed on `(tenant_id, intent_id)` for exactly this | Shop B can never read shop A's data at any endpoint |
| 5.8 | Multi-environment list | Each environment enforces its own config and they are not assumed consistent. A stale heartbeat renders **`unknown`, never `enabled`** | A four-hour-old runtime does not render healthy |

**Append-only caveat, and the docs must say so.** Today the DB aborts `UPDATE`
and `DELETE`. A merchant who owns the table owns the triggers. If they drop them,
the guarantee degrades to **"the SDK never issues an `UPDATE` or a `DELETE`"** — a
weaker claim, already asserted by a test. Never describe it as the stronger one
after shipping.

---

## Phase 6 — The authoring surface

The reason this exists: the person who needs a policy change is a café owner.

**6.1 and 6.2 done.** `/setup` asks four questions and ends in one copyable
command; amounts are entered in rupees and converted to minor units once, in one
place. `/capabilities` is split from `/limits` for the reason the split exists.
**6.3–6.5 not built** — `/policies` still exists and still labels itself in
engineering terms, which is exactly what 6.4 says must not ship.

| # | Task | Why | Done when |
| --- | --- | --- | --- |
| 6.1 | `/setup` — four questions, then one line | The wizard ends and the merchant lands in the dense view with something already true | Four questions, a copyable line, a populated screen |
| 6.2 | `/capabilities` — what agents may see | Split from `/rules` because the owner changes what an agent can see and thinks about limits later | Fields can be hidden and the effect shows in the manifest |
| 6.3 | `/rules` — refused, held, capped | Same reason | A rule saves as a **draft** and its generated code is reviewable |
| 6.4 | The merchant's language in every label | "Cap single bookings at 8", never `max_amount_per_invocation`. A technical term in the only label on a field is a support ticket | No label requires a term the merchant does not know |
| 6.5 | Validate at save time | A schema error discovered by an agent is a lost booking | The editor rejects a bad capability on save and the output typechecks |

---

## Supabase — what this app needs, and what it must never get

The schema already exists in `../agentport-sdk/supabase/`: 13 migrations covering
`analytics_tenants`, `analytics_events`, `analytics_push_batches`,
`analytics_caller_metrics`, `analytics_capability_names`, `schema_tables`, and
`release_storage`, plus retention controls, a push-batch delete guard, and deletion
receipt gates. The privilege model is deliberate — `anon` and `authenticated` are
revoked at the schema level, and `agentport_ingest_caller` can append and nothing
else.

**Verified 2026-10-04 against project `xqsfzhhgfhdemencsmii`:** all 13
migrations applied and in step, `analytics-ingest` deployed and `ACTIVE` on
version 3. The managed destination is live and correct.

**The project is live and reachable.** Verified with the CLI: `supabase link`
succeeds, all 13 migrations are applied and in step, `analytics-ingest` is
deployed and `ACTIVE` on version 3.

**Do not put a Supabase personal access token in this repository.** A PAT is an
**account-admin** credential: it can read every API key, create projects, and drop
the database. Nothing a Next.js app needs. Three concrete reasons it would be
actively harmful here:

1. **This app has a public endpoint with an authentication bypass right now** (task
   1.1). An account-admin credential behind it is not a risk to schedule.
2. **`NEXT_PUBLIC_` variables are bundled into client JavaScript.** One accidental
   prefix ships an admin key to every visitor's devtools. `.gitignore` covers
   `.env` and `.env.local`, which stops commits and does nothing for bundling.
3. **It collapses the separation the schema already draws.** Management (migrations,
   key rotation, project settings) is CLI/CI/`supabase-admin` work. App access is a
   narrow, scoped key. A PAT hands the first to the second.

**What the app should hold instead**, all server-side only, in `.env.local`:

| Variable | Scope | Used for |
| --- | --- | --- |
| `SUPABASE_URL` | public | project URL |
| `SUPABASE_ANON_KEY` | public, RLS-gated | reading rows **as the signed-in merchant**, so RLS does the tenant isolation |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, never `NEXT_PUBLIC_`** | the narrow writes the RLS-scoped path cannot make |

Prefer the `anon` key plus the merchant's session JWT wherever it works: the row
level security already written into these migrations then enforces tenant
isolation in the database rather than in application code, which is the only place
it cannot be forgotten.

---

## What to push to GitHub

Two repositories, one App, and a short list of things that must never be pushed.
Getting this wrong is unrecoverable in a way a bad commit is not.

### The two repos

| Repo | Contains | Push on |
| --- | --- | --- |
| `agentport-ui` | **this** — the hosted product | every merge to `main` |
| `agentport-sdk` | the runtime, CLI, binary | every tagged release |

**The PR the merchant reviews is generated into *their* repository**, not into
either of these. That third repo is theirs, and their merge is the signature. It is
not a repo we push to.

### Push this

- Source: `app/`, `lib/`, `components/`
- Config that carries no secret: `package.json`, `package-lock.json`, `tsconfig*.json`,
  `tailwind.config.*`, `next.config.*`
- `.env.example` — **placeholders only.** It is tracked, so a real value in it is a
  leaked credential on the public internet the moment the repo is not private.
- SQL and migrations
- Docs: `AGENTS.md`, `PRODUCT.md`, `README.md`, `TASKS.md`

### Never push this

| What | Why |
| --- | --- |
| `.env.local`, `.env` | gitignored, and a real credential in git survives every future "we'll rotate it" |
| Any Supabase **personal access token** | account-admin: reads every API key, creates projects, drops the database |
| `SUPABASE_SERVICE_ROLE_KEY` | bypasses RLS, so it sees every tenant's rows |
| `NEXT_PUBLIC_*` values that are not actually public | the bundler inlines these into client JavaScript. There is no warning — the key just ships |
| `.next/`, `out/`, `*.tsbuildinfo` | build output; already gitignored |
| `node_modules/` | already gitignored |
| Another merchant's data | the dashboard is multi-tenant. One leaked row is a disclosure with a customer's name on it |

### The one that catches people

> **`.gitignore` stops commits. It does nothing about `NEXT_PUBLIC_`.**

A `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` is gitignored in spirit and shipped in
fact, because the bundler inlines it into the JavaScript every browser downloads.
The only protection is the variable *name*.

Add to `next.config.js` so this fails at build time rather than at someone's
security review:

```js
// Fail the build if a server-only Supabase key is exposed to the client bundle.
const forBuild = new Set(['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ACCESS_TOKEN'])
for (const key of Object.keys(process.env)) {
  if (forBuild.has(key)) {
    throw new Error(
      `${key} is set. NEXT_PUBLIC_ variables are inlined into client JavaScript. ` +
        `A service-role key or a personal access token in this bundle is readable ` +
        `by every visitor. Remove the prefix and rebuild.`,
    )
  }
}
```

### Before every first push

```bash
git status --short                    # is anything here that shouldn't be?
git ls-files | grep -iE '\.env|secret|token|credential'   # only .env.example may match
grep -rIn 'SUPABASE_.*=' --include='*.ts' --include='*.tsx' --include='*.js' . | grep -v node_modules
git log --all -p -S 'sbp_' -- .        # any Supabase token ever committed?
```

That last one matters after the fact, because a committed secret stays in history
no matter what the current tree looks like, and rotation is the only real remedy.

### Supabase project access

Migrations and key rotation are **CLI and CI** work, using a personal access token
in the environment — never from this app:

```bash
export SUPABASE_ACCESS_TOKEN='…'        # from the Supabase dashboard
npx supabase link --project-ref <ref>
npx supabase db push
```

Keep the token in your shell profile or a CI secret, not in this repository. The
`supabase-admin` tooling is the right home for project-level operations.

---

## Explicitly not here

- **Deciding policy.** A helper here that answers "is this allowed?" is a bypass,
  not a feature (invariant 2).
- **Receiving a ledger row.** We get aggregates. No export, no "download the
  ledger", no endpoint that proxies a row back.
- **Holding the merchant's database credentials.** `agent-port ledger-table`
  *prints* DDL; the generator emits config into their repo. Neither connects. If
  this app needs to read their ledger, the design is wrong — the answer is a query
  they run.
- **Writing to the ledger.** Rendering is the only permitted verb.
- **Minting an agent credential.** A credential derived from a dashboard session
  cannot distinguish an employee from an algorithm in the ledger, which is the
  specific failure this product exists to prevent. `agent-port token` is where that
  lives, and it stays in the CLI.
- **A hosted approval queue.** Notifications about a held request, yes.
- **A Supabase PAT.** See above.

---

## The gate for every phase

```bash
npm run build
npm run typecheck
npm run start &
curl -s localhost:3000/.well-known/agent.json | jq '.capabilities[].name'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' -H 'authorization: Bearer test' \
  -d '{"capability":"checkInventory","input":{"sku":"EX-140"}}'   # expect 200
# createOrder above the threshold                                    # expect 202
# requestRefund                                                       # expect 403
```

**No visual QA in this repo, ever.** Types, build, and real HTTP status codes. The
maintainer does all visual review — if a task appears to need a visual check, say
so and stop.

A dashboard that renders correctly over a broken enforcement path is worse than no
dashboard, because it looks trustworthy.