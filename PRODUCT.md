# AgentPort Dashboard — product definition

Why this product exists, what it is allowed to claim, and what it deliberately
does not do.

**Name is provisional.** The working name is Threshold; the package and directory
are still `agentport-console` and `agentport-ui`. See the naming section in
[`../agentport-sdk/PRODUCT.md`](../agentport-sdk/PRODUCT.md) for why the rename
is cheap now and expensive later.

---

## One line

The merchant arrives with a GitHub account and leaves with a governed install —
and later comes back to see whether it worked.

---

## Where this sits

**This repo is the dashboard UI.** There are only two things: the runtime
(the SDK, which decides, inside the merchant's own app) and this dashboard
(which authors, syncs, and reports, and never decides). An earlier version of
this document described a third thing — a "cloud" beside the "console" — that
was discovered on disk rather than derived from the merchant flow, and the
split created a question no merchant can answer — *which one do I look at?*

| | Authors | Decides | Runs in |
| --- | --- | --- | --- |
| **Runtime** (`../agentport-sdk`) | no | **yes, synchronously** | the merchant's app |
| **This dashboard** (this repo) | yes | **never** | our infrastructure |

The distinction that matters is not *which product* but **whose infrastructure it
runs on**, and that applies only to the runtime.

### The blur to design against is specific

A merchant reads "AgentPort dashboard" and concludes a hosted thing is deciding
whether their refund went through. It is not. Every screen here renders what the
runtime in their own deployment already decided, and the honest fix is never a
disclaimer in this document — it is the dashboard showing the enforcing digest and
its age, sourced from the runtime, next to whatever draft is being edited.

---

## The merchant's path

```text
 1. sign in with GitHub          auth, and their identity, in one step
 2. install the App              repo granted. We never see a password.
 3. we analyse their repo        locally, in their workflow. Names and types only.
 4. review a pull request        ← THE SIGNATURE. Their review, their merge.
 5. pick the capabilities        the ones they keep, the ones they hide
 6. add their own                another API, database, or system
 7. set the environment, SYNC    pushed inbound to their runtime
 ───────────────── their site is now governed ─────────────────
 8. come back next week          analytics and comparisons
 9. open their own database      the ledger table we asked them to create
```

### Step 9 is the trust anchor

The ledger is written by the runtime into **a table in the merchant's own
database**. We never receive it.

That is stronger than careful redaction, because there is nothing to redact — the
raw row never travels. What reaches this dashboard is deliberately dull: counts,
capability names, reasons, durations, `assurance`, set sizes.

The merchant keeps that ledger whether or not they keep paying us, and they read it
with any SQL client they already have.

---

## What this is

The console has **two verbs** and one hard boundary between them.

```
   ┌────────────────────────┐         ┌────────────────────────┐
   │  SEE                   │         │  SET                  │
   │                        │         │                        │
   │  what agents may do    │         │  what agents may do    │
   │  what they did         │  ───▶   │  which fields show     │
   │  what is held          │         │  what needs a human    │
   │  what is refused       │         │  what the agent is told│
   │                        │         │                        │
   │  every screen here     │         │  saved as config       │
   │  today, and it stays   │         │  → code, in their repo │
   └────────────────────────┘         └────────────────────────┘
        the reason they trust it            the reason they keep it
```

**The boundary: this console authors configuration. It never evaluates it.**

```
   WHAT THE CONSOLE DOES          WHAT THE CONSOLE MUST NEVER DO
   ─────────────────────          ────────────────────────────
   writes rules down              decide whether a rule fired
   shows a result                 compute a decision
   renders a refusal              soften, summarise or invent one
   reads the ledger               write to the ledger
   generates code                 run the code
```

The merchant writes the policy in their own words; the SDK evaluates it in their
own runtime. The compiler in between is a **second, independent implementation**
of the *configuration language* — not of the policy engine. If it could reach an
answer on its own, the merchant would be reading whichever of the two rendered.

> **This is the change from the previous version of this document.** It used to
> say policy is code, reviewed like code, and that editing it in the browser was
> out of scope. That was correct when the console only displayed a policy another
> human had written. It stops being correct the moment a café owner without an
> engineer is the person who needs the change. See the reversal section in
> [`../agentport-sdk/PRODUCT.md`](../agentport-sdk/PRODUCT.md).

---

## Two users, and they are not the same person

### The anxious owner — 11pm, something unexpected happened

Not a security researcher. Not a developer. Someone with six SKUs and a real
order they need to be sure was or was not placed. They are not browsing, they
are anxious, and they want the bad news first.

**This has one hard consequence: the console must be complete about failures.** A
surface that only looks good when everything was allowed is advertising that
failures do not happen. Hiding refusals to make the product look smoother would
destroy the exact trust the console exists to create.

### The owner setting it up — 10am, first coffee, no engineer

They have a website, a phone number, a booking system they don't own, and about
fifteen minutes. They do not know what an idempotency key is, and must never be
shown one.

**This has one hard consequence: every safety property has to be invisible.** The
retry-safety, the redaction, the redaction of their supplier's cost price, the
two-step confirmation on the kill switch — all of it is a default, none of it is
a setting they are asked to understand.

**The design fails if these two users collide on one screen.** Verification is
dense and technical; setup is a wizard with four questions. Same product, two
surfaces, and the wizard hands off to the dense view.

---

## The screens

The four questions are unchanged. They are simply no longer the whole product.

| Screen | Question | Verb | State |
| --- | --- | --- | --- |
| `/` **Live** | What are agents doing right now? | set | **planned** — today a standing summary |
| `/policies` | What may agents do, and what do they see? | see | **working**, read-only |
| `/capabilities` | What may agents do, and which fields do agents see? | set | **planned** — the editor |
| `/rules` | What is refused, what is held, what is capped? | set | **planned** |
| `/ledger` | What have they done? | see | **working**, read-only |
| `/approvals` | What is waiting on me? | see | **fixtures** — buttons are inert |
| `/chat` | Does the customer still convert? | see | **working** |
| `/settings` | Who else can do this, and how do I stop it all? | set | **planned** |
| `/setup` | Four questions, then copy this line | set | **planned** |

`/policies` is read-only today and the target splits it in two: `/capabilities`
is the *what*, `/rules` is the *under what conditions*. Splitting them is worth
the extra route only because they are edited by different people at different
times — a café owner changes what an agent can see, and thinks about limits
later. **Until both exist, `/policies` stays the single read-only screen and
nothing in this repo pretends otherwise.**

`/chat` earns its place for a specific reason. A merchant's fear is that
governing agents will cost them sales. The honest answer is that discovery
happens on someone else's surface while the conversation happens here — but only
if the assistant on your own surface is held to the same policy as a cold agent.
This page exists to make that claim checkable rather than theoretical.

**The old "four pages is a feature" argument is retired, and it was not wrong.**
It was true for a read-only surface, and the reason to keep it was that a
merchant has to be able to hold the console in their head. That reason still
stands, so the new rule is narrower: **the dense verification surface stays
small, and everything that changes the world lives behind a wizard.**

```
   TARGET dense surface — read for hours
   ┌───────────────────────────────────────────────────────────┐
   │  Live · Capabilities · Rules · Activity · Approvals       │
   │  five screens, every one of them a table or a feed        │
   └───────────────────────────────────────────────────────────┘

   setup — once, behind a wizard
   ┌───────────────────────────────────────────────────────────┐
   │  four questions → the artefacts → deploy                  │
   └───────────────────────────────────────────────────────────┘
```

The rule the wizard has to satisfy: **it ends, and the merchant lands in the
dense surface with something already true.** Not an empty console they have to
configure before it shows anything.

---

## The draft / live boundary

This is the part that is easy to get wrong and expensive to get wrong, so it is
stated as a rule rather than a design detail.

**Nothing a merchant types is in force until the generated code is committed and
running in their runtime.** The console shows a draft. The merchant's runtime
holds the truth. If a draft were rendered as though it were live, the console
would be the enforcement path by accident — the one thing every other document
in this repo forbids.

```
   DRAFT    what you are editing        in the console only
   BUILT    what the compiler produced  in their repo, reviewable
   LIVE     what their runtime enforces read from the manifest
              └─ carries a config hash, and every ledger entry does too
```

Three states, three different visual treatments, and a hash that ties them
together. A capability shown as live must be one their running build actually
serves. If the console cannot prove that, it says the capability is **not
deployed** — which is a legitimate and common answer on day one.

---

## What this console is allowed to claim

This is the most important section in the document, and authoring surfaces make
it harder, not easier. A field that promises a control the code does not contain
is a worse lie than a missing feature, because the merchant stops checking.

| Allowed | Forbidden |
| --- | --- |
| A held request is waiting for approval | A held request has been placed, paid, or confirmed |
| A call was refused, with the rule that fired | A generic "something went wrong" |
| A capability is exposed to agents | A capability is *safe* |
| A draft rule is saved | A draft rule is in force |
| A field is hidden from agents | A field is safe to omit from the ledger |
| Fixtures demonstrating a code path | Real measurements of this business |
| The ledger is complete | The ledger is tamper-proof (the DB aborts `UPDATE`/`DELETE`; **only while the merchant keeps our triggers** — see the caveat) |
| The merchant's gateway holds the money | The console is part of the payment path |
| A sync was sent | The sync landed (`configHash` mismatched) |
| A runtime reported 4 hours ago | The runtime is enabled |
| This dashboard has the detail | This dashboard can show the detail (it cannot — the rows are in the merchant's own DB) |

The pattern: **a console that overstates is worse than no console**, because it
converts an absence of evidence into false confidence.

The specific failure to design against: an approval queue that renders an order
id next to a pending request. A merchant glances at it, sees an order reference,
and assumes the order exists. That is a real-money error caused entirely by
layout.

The second, newer failure: a rule editor that shows a green tick beside a rule
whose generated code has not been deployed. Same class of error, same cause.

---

## Design position

- **Dark and dense.** Read for long stretches by someone who runs a shop.
  Legibility beats decoration.
- **Mono for identifiers, display serif for headings.** A `requestId` is a thing
  you copy into a search box; it should look like one.
- **`tabular-nums` on every figure.** These are numbers reconciled against a
  bank statement. Misaligned digits read as a wrong number.
- **Status colour is semantic, never decorative.** `verdant` = allowed, `amber`
  = held, `rust` = refused. A green badge must never mean "looks fine" when it
  means "policy allowed this". Someone is making a decision from that colour.
- **The refusal is a feature.** Do not soften refusal copy to make the console
  look friendlier. The refusal is what the buyer is paying for.
- **The wizard is in the merchant's language.** "Cap single bookings at 8" — not
  `max_amount_per_invocation`. The technical name goes in a tooltip, if anywhere.
- **Nothing destructive is one click.** The kill switch and the loss of a
  capability are two-step and typed. The only thing in this product that should
  be fast and careless is a refusal.

---

## Out of scope

- **Deciding policy.** The dashboard shows what the SDK returned and authors the
  text the SDK will read. A second implementation of the *rules* is a divergence
  bug waiting to happen.
- **Mutating the ledger.** Rendering is the only permitted verb. An audit trail
  that can be edited is not one.
- **Receiving a ledger row.** The runtime writes those into the merchant's own
  database and we get aggregates. No export, no "download the ledger", no endpoint
  that proxies a row back.
- **Holding the merchant's database credentials.** `agent-port ledger-table`
  *prints* DDL for them to run; the generator emits config into their repo.
  Neither connects. If this dashboard ever needs to read their ledger, the design
  is wrong — the answer is a query they run.
- **Minting an agent credential.** A credential derived from a dashboard session
  cannot distinguish an employee from an algorithm in the ledger, which is the
  specific failure this product exists to prevent. `agent-port token` is where that
  lives, and it stays in the CLI.
- **Carrying the kill switch in a sync payload.** It replaces policy, and
  `emergencyKillSwitch` is a plain boolean. The payload type must
  `Omit<…, 'emergencyKillSwitch'>` so a swap cannot re-enable what a human turned
  off.
- **A hosted enforcement path.** Nothing in this repo may become a dependency of
   the authorization decision, and nothing it produces may hold session state.
   This is the dashboard half of the two-thing contract in `../agentport-sdk/AGENTS.md`
   invariant 9, and it is the reason the dashboard is specified as *never
   decides* rather than as *decides, slowly*.
- **Payment credentials.** The console never sees, stores, or forwards a gateway
  key. The merchant's backend mints payment links with their own key and the
  merchant's webhook confirms them. Not a later task — a design constraint.
- **Growth analytics.** Funnels, cohorts and A/B testing are not this product.
  *Intent* data — which unexposed capabilities agents keep asking for — is
  different: it is a configuration decision aid, it answers a question the
  merchant is already asking, and it is the one number here that comes from
  refusals rather than from tracking people.
- **Running the merchant's backend.** The console generates a file. The merchant
  commits it, like any other code.

---

## Status

Honest as of today. Nothing in the authoring column exists, and **the repo does
not currently compile.**

| Area | State |
| --- | --- |
| `/`, `/ledger`, `/chat` | **Working.** Read from the live policy engine and ledger |
| `/approvals` | **Fixtures.** The store has no list, reject or consumed state, so the buttons are inert |
| `/.well-known/agent.json` | **Working**, generated from the live registry |
| `/.well-known/agent/invoke` | **Last known good** — 200 / 202 / 403 confirmed over HTTP at commit time. `npm run typecheck` is currently red, so this is not a claim about today |
| Identity verification | **Demo, and an auth bypass.** Any bearer token becomes a wildcard-scoped identity with a fresh five-minute expiry. See `AGENTS.md` invariant 11 |
| Persistence | **Removed from the SDK's public entry.** `InMemoryLedger` moved to `../agentport-sdk/src/testing.ts` deliberately; importing it from the root no longer resolves. Use `SqlLedger` |
| Setup wizard, capabilities editor, rules editor | **Not built.** See [`TASKS.md`](./TASKS.md) Phase 6 |
| Config compiler, draft/live tracking | **Not built** |
| Responsive and visual QA | **Deliberately not automated.** The maintainer does all visual review |

Three lines in that table matter more than the rest.

The **demo identity verifier** must stay labelled as a demo in code and in the
README — removing that label in a UI commit is a blocker, not a cosmetic change.
It is currently the difference between a labelled demo and an open endpoint that
promises whoever asks for a token.

The **in-memory ledger** used to mean the Activity screen was incapable of proving
anything. That is no longer a gap to close later; the SDK now refuses the import
from the package root on purpose, so there is no interim state to describe. The
screen is unproven until it reads `SqlLedger`.

The **`configHash` column** is missing from `/ledger` while `AGENTS.md` invariant 4
requires it. An invariant the screens violate is worse than a missing invariant,
because a reviewer trusts it.

### Known drift from the SDK

`npx tsc --noEmit` → **17 errors.** Three contracts moved under this console:
`InMemoryLedger` is no longer a root export, `maxOrderValue` takes `{ minor,
currency }` rather than `{ amount, currency }`, and `input` is now an
`InputSchema` (`{ q: { type: 'string' } }`) rather than a map of bare strings. The
`amount` → `minor` rename is the minor-unit trap: rupees and paise differ by a
hundredfold, so the `maxOrderValue` currently written in `lib/agentport.ts` does
not mean what it appears to mean.

---

## The test of whether this is working

Two tests, one for each user.

The anxious owner should be able to say, after using it once: *"I know what the
agents did, I know what I approved, and I know what I refused."*

The owner setting it up should be able to say: *"I did not need to understand
any of this, and I know exactly what is live."*

If either says *"the console looks nice"*, it is decoration, and the SDK's real
guarantee is going unclaimed.

---

## Related

- `AGENTS.md` — the invariants, including the one about authoring versus
  evaluating, and the one about caller-chosen identities
- `README.md` — running it, and the three status codes demonstrated
- [`../agentport-sdk/docs/PRODUCT-RUNTIME.md`](../agentport-sdk/docs/PRODUCT-RUNTIME.md)
  — the enforcement primitive: what the CLI and SDK do, and the gaps
- [`../agentport-sdk/docs/PRODUCT-CLOUD.md`](../agentport-sdk/docs/PRODUCT-CLOUD.md)
  — the hosted dashboard (this repo): the front door, and why it may never decide
- [`../agentport-sdk/PRODUCT.md`](../agentport-sdk/PRODUCT.md) — the product this
  console is evidence for, and the decision this reversal came from
- [`TASKS.md`](./TASKS.md) — every task, ordered by the merchant's path
  in which gate
- `.opencode/workflows/product-thesis.md` — the process for revisiting any of this
