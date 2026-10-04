# AgentPort Dashboard — the hosted UI

Not the enforcement point. Never the enforcement point.

## What this repository is

**This repo is the dashboard UI.** There are only two things: the runtime
(the SDK and CLI, running inside the merchant's own app, which decides) and
this dashboard (authoring, sync, analytics — which never decides). There is
one dashboard, one tenant login, and one set of capabilities.

A merchant arrives here with a GitHub account and no repository. They authorise the
App, review a pull request, pick which capabilities to keep, and sync it to their
runtime. Later they come back to read analytics.

**Name is provisional.** The package and directory are still `agentport-console`
and `agentport-ui`. Do not rename them as a side effect of another change.

## Where this sits

| | What it is | Decides? | Where it runs |
| --- | --- | --- | --- |
| **Runtime** (`../agentport-sdk`) | the SDK and CLI | **yes, synchronously** | the merchant's app |
| **This repo** | authoring, sync, analytics | **never** | our infrastructure |

The distinction that matters is not *which product* but **whose infrastructure it
runs on**, and that applies only to the runtime.

The two-thing contract that governs all of it lives in `../agentport-sdk/AGENTS.md`
invariant 9 and in [`../agentport-sdk/docs/PRODUCT-CLOUD.md`](../agentport-sdk/docs/PRODUCT-CLOUD.md).
It spans the two; it is meaningless in one of them.

**The one sentence a merchant must be able to repeat:** this dashboard helps you
decide what AI may do, and the AgentPort runtime inside your own application is
what enforces it.

## The two channels

The runtime does two separate things with the outcome of every decision, and this
repo is on the receiving end of both directions.

```text
  this repo  ─── PUSH ────→  runtime   (the controlled environment: capabilities
     │                        and policy — added, edited, deleted)
     │
     └───←── receives ─────  runtime   (analytics + the configHash it is actually
                                      enforcing)
```

**The ledger goes to the merchant's own database and never comes here.** We do not
receive rows, so there is no redaction step to get wrong and nothing to classify.
What lands in the merchant's database is theirs to read, keep, and query for as
long as they want — including after they stop paying us.

**Sync is a push, and it is an inbound attack surface on a merchant's live site.**
It is not an admin endpoint. It needs a signature over the payload, a distinct
credential, rotation, and replay protection — and **the kill switch must not be
in the sync payload, by type**, so a policy swap can never re-enable what a human
turned off.

## Stack

Next.js 14 App Router, React 18, TypeScript strict, Tailwind, dark-first.
The SDK is consumed as a `file:` sibling at `../agentport-sdk` and is
transpiled via `transpilePackages`. Treat the SDK as a dependency with an
invariant contract — see its `AGENTS.md` — not as code to edit from here.

## Invariants

1. **The console authors policy. The SDK evaluates it. Never the other way
   round.** A rule typed here becomes configuration, is compiled to code, and is
   decided by the SDK in the merchant's runtime. If a change would let this repo
   answer *"is this allowed?"* without the SDK, it is not a feature, it is a
   bypass.
2. **A second compiler is not a second policy engine.** We compile the
   *configuration language* to `expose()` calls and policy literals. We do not
   evaluate those calls, and we must not be able to predict their result. Any
   helper that takes a capability and returns allow/deny in this repo is a bug.
3. **A draft is never rendered as live.** Nothing a merchant types is in force
   until the generated code is committed and running in their runtime. Draft,
   built and live are three states with three treatments. If the console cannot
   prove a capability is deployed, it says **not deployed**.
4. **Every entry carries a config hash.** What decided a call, and what version of
   the rules decided it, is part of the record. A ledger entry without one cannot
   be reconciled against the config that produced it, and a merchant who cannot
   reconcile a dispute has no dispute process.
   > **Currently unmet.** The `/ledger` table renders Request, Agent, Capability,
   > Decision, Rule, Approval, Result — and no config hash. This invariant and the
   > repo's own "common mistakes" list already contradict each other. Fix the table
   > before claiming the screen works.
5. **A held request is shown as not-yet-executed.** Never render a pending
   approval as a success, a pending payment, or a confirmed order.
6. **A refusal is shown with its reason.** Never collapse a 403 into "something
   went wrong". The reason is what makes a control trustworthy to the person
   reading it.
7. **The ledger is read-only in the UI.** No edit, no delete, no "mark as
   reviewed" that mutates the record. Rendering is the only permitted verb. This
   is unchanged by the addition of the authoring verb.
8. **Capabilities are not fetched from the client at build time.** The manifest
   is served by a route handler from the live registry, so it cannot describe
   something the enforcement path does not do.
9. **No secret reaches the client, and no payment credential ever enters this
   repo.** `verifyIdentity()` is the only place a credential is interpreted, it
   runs server-side in a route handler, and the resolved identity is never echoed
   back. Gateway keys, webhook secrets and card data are not our surface at all —
   the merchant's backend mints payment links and their webhook confirms them.
10. **Every destructive action is two-step.** The kill switch, and the removal of
     a capability, require a typed confirmation. The only fast careless action in
     this product should be a refusal.
11. **An identity is never a value the caller chose.** The agent's `agentId` must
    come from verifying a credential the business issued — never from a bearer
    token, a header, a query parameter, or a field in the request body. Trust
    arrives from a credential with named scopes that expires; a self-asserted
    string is an `unverified` claim and must be recorded as one.
    > **Currently violated.** `verifyIdentity()` in
    > `app/.well-known/agent/invoke/route.ts` sets `agentId` to the bearer token
    > verbatim and hands back `scopes: ['*']` with a freshly minted five-minute
    > expiry on every request. Anyone sending `Authorization: Bearer superadmin` is
    > `superadmin`, with every scope, forever. The comment directly above it says
    > *"It must never trust an agentId supplied in the request body"* — and then
    > trusts the one in the header. Same defect, different header.
    >
    > It is honestly labelled as a demo in `PRODUCT.md`, and that label is load
    > bearing. Removing it in a UI commit is a blocker, not a cosmetic change. A
    > caller-chosen identity is never acceptable as a shipped state, whatever the
    > label says.
12. **This surface never grants an approval.** `/approvals` is read-only and its
    buttons stay inert. Approving here would put a second, differently-available
    approver in front of a real-money decision, and the approver's identity would
    not land on the ledger row the way a CLI approver's does. Notifications about a
    held request are fine; granting one from a browser is the boundary crossing.
13. **The manifest this repo serves is advisory.** Nothing enforces against
    `/.well-known/agent.json`, and it is unauthenticated by design so an assistant
    can learn the business exists. A doctored copy misleads an agent — a nuisance.
    If any client treated it as authoritative and could then talk the runtime into
    a laxer read, that is a bypass. Authoritative policy is the signed artifact,
    verified in the runtime.
14. **In-memory is not an interim state here.** The SDK moved `InMemoryLedger` out
    of its default entry and into `../agentport-sdk/src/testing.ts`, on purpose: a
    merchant reaching for it in production gets a `Map` with a cap, and a pilot
    reporting from one has no proof of anything. Importing it from the package root
    now fails to resolve **by design**, so the mistake is greppable rather than an
    autocomplete accident. Use `SqlLedger`.
15. **The enforcing digest comes from a runtime, never from a draft.** What the
    panel reports as live is the `configHash` the runtime pushed, not one this repo
    computes from an open draft. A dashboard-derived digest would report a config as
    live the moment it was saved — indistinguishable from the right answer, and
    exactly wrong.
16. **`not deployed` and `unknown` are values, not blanks.** A saved-but-unmerged
    draft is not running. A stale heartbeat is not healthy. Both render as explicit
    states, because "Runtime ● Online" that is four hours old leads a merchant to
    either panic-disable everything or ignore status forever.
17. **Sync never carries the kill switch.** It replaces policy, and
    `emergencyKillSwitch` is a plain boolean, so an unguarded payload silently
    re-enables a switch a human engaged during an incident. The payload type must
    `Omit<…, 'emergencyKillSwitch'>` — the same rule the SDK's public manifest
    already applies because a published boolean turned the unauthenticated document
    into a readiness oracle. Enforced by a type, not by review.
18. **Multi-tenant isolation is not a feature.** Two shops choosing the same
    `intentId` is ordinary. `SqlLedger` is keyed on `(tenant_id, intent_id)` for
    exactly this reason, and shop B must never read shop A's data at any endpoint
    here.

## Working rules

- **No visual QA. Ever.** Do not run headless browsers, screenshot tools,
  responsive-layout checks, contrast audits, or any other visual verification in
  this repo. The maintainer does all visual review. Verify with types, build, and
  real HTTP status codes. If a task appears to require a visual check, say so and
  stop — do not run one.
- **Server components by default.** Add `'use client'` only for genuine
  interaction. The read-only pages need no client JavaScript at all.
- **Validate at save time, not at run time.** A schema error discovered by an
  agent is a support ticket and a lost booking. The editor rejects a bad
  capability on save, and the compiled output typechecks against the SDK types.
- **The wizard speaks the merchant's language.** "Cap single bookings at 8", not
  `max_amount_per_invocation`. Technical vocabulary belongs in a tooltip at most,
  and never in the only label on a field.
- **Match the existing tone.** Dense, dark, mono for identifiers and labels,
  a display serif for headings. The verification surface is read for long
  stretches by someone who runs a shop, so legibility beats decoration.
- **Status colours are semantic.** `verdant` for allowed, `amber` for held,
  `rust` for refused, never decorative. A green badge must never mean "looks
  fine" when it means "policy allowed this". The same applies to a saved draft:
  it must not wear the colour of a live rule.
- **The tables are dense on purpose.** `tabular-nums` on every figure, because
  these are numbers a merchant will check against their bank.
- **Prefer the type from the SDK.** `LedgerEntry`, `PendingApproval`,
  `PolicyDecision` — do not redeclare a local shape that drifts from them. The
  config schema is the same rule in the other direction: it is one schema, shared
  with the compiler, not a shape retyped per screen.

## Verify before you claim done

> ### This gate is currently red
>
> `npx tsc --noEmit` reports **17 errors**. `npm run build` and `npm run start`
> below do not currently work, so the three status codes are *last known good*, not
> a description of today. Fix the drift before quoting any output from this repo.
>
> The SDK moved under this console. Three contracts changed:
>
> | Was | Now |
> | --- | --- |
> | `import { InMemoryLedger } from '@agentport/sdk'` | not exported. Use `SqlLedger` (invariant 14) |
> | `maxOrderValue: { amount, currency }` | `{ minor, currency }` — **minor units** |
> | `input: { q: 'string' }` | `InputSchema`, so `{ q: { type: 'string' } }` |
>
> The `amount` → `minor` rename is the minor-unit trap the SDK's own `AGENTS.md`
> warns about: rupees and paise are a hundredfold apart, and a policy written
> against the old field name does not mean what it says.

```bash
npm run build      # must compile and typecheck cleanly
npm run typecheck
```

Then exercise the enforcement path, because a console that renders but whose
route handler is broken is worse than no console:

```bash
npm run start &
curl -s localhost:3000/.well-known/agent.json | jq '.capabilities[].name'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' -H 'authorization: Bearer test' \
  -d '{"capability":"checkInventory","input":{"sku":"EX-140"}}'   # expect 200
# same with createOrder above the threshold                          # expect 202
# same with requestRefund                                             # expect 403
```

Expect `200`, `202`, `403` in that order. If any differs, stop and report which
one and why before changing the UI.

**A `202` must mean held, never placed.** Confirm the response body says
`pending_approval` and that no order id or charge confirmation appears anywhere
in it.

**A ceiling must be measured against the merchant's figure, not the caller's.**
`createOrder` declares `amountMinor` in its input schema and no `policyInputKeys`
or `policyInputFor`, so the engine currently reads the amount out of the request
body — meaning the agent picks the number the merchant's threshold is measured
against. Send a small `amountMinor` and the ceiling is never reached. Declare the
figure, or resolve it with `policyInputFor`, before treating any order limit as
enforced.

If you touched the configuration path, three more checks apply, and none of them
are optional:

```bash
npm run build          # the generated capability file must typecheck against the SDK
# the draft/live badge must read "not deployed" for a capability that was never built
# a saved rule must not appear in /rules with the colour of an enforced rule
```

## Common mistakes

- Rendering a pending approval with an order id or a charge confirmation.
- Writing a helper that answers "is this allowed?" in this repo. See invariant 2.
- Showing a saved draft with the visual treatment of a live rule. See invariant 3.
- Rendering a ledger entry without its config hash, or inventing one.
- Copy styling a `LedgerEntry` rather than importing the type.
- Adding a client component to a page that only reads.
- Hardcoding a policy value in the UI instead of reading it from the manifest.
- Treating the fixtures in `lib/agentport.ts` as the real contract. They are
  fixtures; the enforcement path around them is the product.
- Letting a wizard field require a term the merchant does not know.
- Assuming a rule is live because it saved successfully. It saved; it did not ship.
- Deriving an identity from the `Authorization` header. See invariant 11.
- Letting `.env.example` advertise a variable nothing reads. `AGENTPORT_SIGNING_KEY`
  is currently in `.env.example` and consumed by no code in this repo — a control
  that reads like a control is the same failure as `UserDelegation.scope` in the
  SDK: documented, and enforcing nothing.
- Importing a ledger adapter from the package root. See invariant 14.
- Restating the split as "the console and the cloud." There are two things:
  the runtime and this dashboard. **This repo is the dashboard UI.**
  There is no third thing.
- Treating a draft as an answer this repo can act on. The runtime decides;
  see `TASKS.md` Phase 3.
- Describing the "enforcing" state from a draft, a local file, or a cached value
  rather than a value the runtime pushed. See invariant 15.
- Adding a Supabase personal access token to this app. It is an account-admin
  credential, it does not belong behind a web framework, and this app has an open
  authentication bypass until `TASKS.md` 1.1 is fixed. See `TASKS.md` Supabase.
- Adding the kill switch to any payload this repo sends. See invariant 17.
- Reading or proxying a ledger row. The runtime writes those into the merchant's own
  database; we get aggregates and nothing else.

## Further reading

- [`TASKS.md`](./TASKS.md) — every task, ordered by the merchant's path, with
  honest status per step
- [`PRODUCT.md`](PRODUCT.md) — what this console is allowed to claim
- [`../agentport-sdk/docs/PRODUCT-RUNTIME.md`](../agentport-sdk/docs/PRODUCT-RUNTIME.md)
  — the enforcement primitive, and the CLI under dashboard-first install
- [`../agentport-sdk/docs/PRODUCT-CLOUD.md`](../agentport-sdk/docs/PRODUCT-CLOUD.md)
  — the hosted dashboard: the front door, and why it may never decide
