# AgentPort Dashboard

> **The whole system, top to bottom — dashboard, Supabase backend, runtime — is
> [`SYSTEM.md`](SYSTEM.md).** Start there. This file is the dashboard only.

The business side of AgentPort: what external AI agents may do to a small
business, what they have done, what is waiting on a human, and how to change
those without writing code.

This is not a marketing site. It is the surface a shop owner uses to decide
whether to let a stranger's bot spend their money — and the place where they
say what that bot is allowed to try.

**Name is provisional.** The package and directory are still `agentport-console`
and `agentport-ui`; do not rename them as a side effect of another change.

> ## ✅ Build gates are green
>
> `npm run typecheck`, `npm run lint`, and `npm run build` all pass. Money
> is written in **minor units** end to end (`{ minor, currency }` — rupees in,
> paise out, converted once at the edge), ledger rows carry `configHash` +
> `tenantId`, and the SDK is consumed as a `file:` sibling at
> `../agentport-sdk`.
>
> The `amount` → `minor` rename is a hundredfold trap — rupees and paise. Two
> rules govern this repo: it authors configuration but never evaluates it, and
> an identity is never a value the caller chose.

## Where this sits

Two things are called AgentPort: the runtime and this dashboard.

| | Authors | Decides | Runs in |
| --- | --- | --- | --- |
| **Runtime** (`../agentport-sdk`) | no | **yes, synchronously** | the merchant's app |
| **This dashboard** (this repo) | yes | **never** | our infrastructure |

This dashboard does the authoring, sync, and analytics half; the runtime does
the deciding. Nothing a merchant types passes through a machine we operate
before it becomes a rule. **It is not the enforcement point** — the AgentPort
runtime inside the merchant's own application is, and it is the only thing
that can say yes or no.

### This dashboard is a UI. Supabase is the backend.

That distinction is load-bearing, and the code drifted away from it before this
line existed. Every count, push, sync receipt and merchant in `lib/store.ts` is
a `new Map()` — process memory. **No route in `app/api/` touches the database.**
So the numbers on `/analytics` and the enforcing digest on `/` are fabricated
after a process restart, and `POST /api/analytics` accepts a push only to count
it into RAM.

`ARCHITECTURE.md` §0 in the SDK repo is canonical. Two rules follow:

- **The dashboard is not the backend, and not on the data path.** A push must
  reach the ingest edge function, never a Next.js route — otherwise every
  merchant's ingest traffic queues behind this app's deploys and function
  concurrency, and "is the backend up" becomes a question about a UI.
- **The database is read server-side only**, with `SUPABASE_SERVICE_ROLE_KEY`,
  which bypasses row-level security and must never reach a browser.
  `next.config.mjs` fails the build if a `NEXT_PUBLIC_`-prefixed name would
  inline it.

### How logs reach us: a webhook the merchant configures

We ask the merchant for **one table** (a projection — counts, digests, liveness —
never their ledger) and for a **webhook to our ingest endpoint**, in the shape
Razorpay, Stripe and Shopify already teach. Their side pushes; we never hold a
credential into their database. SDK `ARCHITECTURE.md` §4a is canonical.

Prefer the SDK firing it over a database trigger: a Postgres HTTP trigger puts
our endpoint inside the merchant's commit path, which makes our latency their
write latency.

### What this dashboard can and cannot show

**It can never show a merchant their own revenue.** That is the direct
consequence of the custody boundary, not a missing feature, and the answer it
gives is *"amounts live in your ledger, not ours"* — `agent-port ledger` reads
those, with `evaluated`, `configHash` and `rule` on every row.

The rule is one line: **personal data goes to the merchant's own backend and
never reaches us.** Parameters, amounts, instruments, customer PII, free text.
Not aggregated on the way here, not hashed, not "just the first four."
Everything else — capability, kind, assurance, count, window, rule, reason, set
sizes, `rowDigest` — comes to Supabase.

The one payment-adjacent question we accept is conversion, as a boolean per
capability per window:

```text
orders.create     succeeded 47   failed 3   window 2026-W41
```

Not `₹4,999 at 10:42:07` — that is joinable against the merchant's own payment
processor, and it makes us a party to the transaction. Normative form:
`agentport-sdk/dashboard_runtime_integration.md` §7.

### Three addresses, three owners

| Address | Owner | Read by |
| --- | --- | --- |
| manifest `baseUrl` — the merchant's public runtime endpoint | **the merchant** | external agents |
| ingest endpoint — config, heartbeat, analytics | **us** | the runtime, outbound only |
| dashboard origin — login, authoring, panel | **us** | the browser |

The runtime is configured with exactly one of these — ours. It is never told the
first, because it *is* that address.

> **Known bug.** `lib/agentport.ts` passes `NEXT_PUBLIC_AGENTPORT_BASE_URL` into
> `new AgentPort({ baseUrl })`, which `manifest()` publishes as the agent-facing
> execution endpoint. So the manifest currently advertises **this dashboard** to
> every external assistant — correct only because the demo runs the SDK
> in-process here. Fix: make the manifest's `baseUrl` a merchant setting, and
> give the snippet its own dashboard-origin variable. See SDK `ARCHITECTURE.md` §0.

## The screens

| Route | Question | Verb | State |
| --- | --- | --- | --- |
| `/` | Where do I stand? | see/set | enforcing digest + age, onboarding links |
| `/setup` | Four questions, then copy one line | set | working — rupees in, minor units out |
| `/capabilities` | What may agents do, and which fields do they see? | set | working — drafts read **not deployed** |
| `/rules` | What is refused, what is held, what is capped? | set | working — save-time validation, drafts never live-coloured |
| `/policies` | What may agents do, and why does each rule sit where it does? | see | working, read-only |
| `/ledger` | What have agents actually done, including the refusals? | see | working, read-only, rows carry `configHash` |
| `/approvals` | What is waiting on me, and has it run yet? | see | read-only — buttons stay inert, approvals happen in the CLI |
| `/analytics` | Is it working? | see | working — counts by capability and rule, never rows or amounts |
| `/connect` | How does this reach my runtime? | set | working — honest `missing`/`done` per step until credentials exist |
| `/chat` | Does the customer still convert when the assistant is governed? | see | working |

Two routes are for agents, not for humans:

- `GET /.well-known/agent.json` — the discovery manifest
- `POST /.well-known/agent/invoke` — the execution endpoint

**The manifest is advisory.** It is unauthenticated by design so an assistant can
learn the business exists, and nothing enforces against it. Authoritative policy
is the signed artifact, verified in the runtime.

## The two verbs, and the line between them

```
   SEE  what agents may do · what they did · what is held
   SET  what agents may do · which fields show · what needs a human
```

**This dashboard authors configuration. It never evaluates it.** A rule typed here
becomes configuration, is compiled to code, and is decided by the SDK in the
merchant's own runtime. There is deliberately no helper anywhere in this repo
that answers "is this allowed?" — a second answer would mean the merchant reads
whichever of the two happened to render.

Nothing typed here is in force until that generated code is committed and
running. The dashboard shows a **draft**, and a capability it cannot prove is
deployed is shown as **not deployed**. That is a legitimate answer on day one.
The enforcing panel reports only what the runtime pushed — digest plus age —
and says **unknown** when the assertion is missing or stale. It never computes
a digest from a draft.

## What the enforcement path actually does

Verified over real HTTP against the policy configured in `lib/agentport.ts`:

```bash
npm run build && npm run start
```

**No credential is refused silently, and none is trusted blindly.** The route
delegates to `verifyIdentity` (server-only): a missing or unverifiable
credential produces a *recorded* 403 with a named reason, never a 500 and
never an allow.

```bash
curl -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' \
  -d '{"capability":"checkInventory","input":{"sku":"EX-140"}}'
# 403 {"status":"denied","reason":"identity_expired",...} — and the denial is on the ledger
```

A credential the business issued gets the engine's real answer: `200` for an
allowed call, `202` with `pending_approval` for a held write (never an order
id or charge confirmation), `403` with a machine-readable reason for a
refusal. An agent that cannot tell why it was refused will either retry
forever or route around the control, so a generic refusal is treated as a
bug rather than a style choice.

### Identity is verified, never self-asserted

`app/.well-known/agent/invoke/route.ts` calls `verifyIdentity()` and hands the
result straight to `invoke`. A bad credential yields an `unverified` identity
with no scopes, which the engine refuses with a named reason. The verification
detail is logged server-side and never returned — a response saying which half
of a forgery was wrong teaches an attacker how to fix it.

`AGENTPORT_SIGNING_SECRET` and any database keys are server-only and never
carry a `NEXT_PUBLIC_` prefix — the client build fails if one is set that way
(see `next.config.mjs`). No token is minted and no approval is granted from
the browser; both stay in the CLI.

## APIs

| Endpoint | Purpose | State |
|---|---|---|
| `POST /api/signup` · `GET /api/me` | our account + current merchant | working, demo tenant until magic-link sessions land |
| `GET/PUT /api/drafts/:section` | per-tenant drafts (`setup`, `capabilities`, `rules`), validated at save | working |
| `GET/POST /api/golive` | summary + typed-confirm publish → signed version + digest | working |
| `GET /api/config` | signed live config for the tenant snippet, or 404 `not deployed` | working |
| `POST /api/sync` | signed policy receiver: HMAC, fresh timestamp, push-id dedupe, kill-switch refused | working, receipts only — applying is a runtime restart |
| `POST /api/analytics` | digest-verified counts + runtime heartbeat (the panel's only writer) | working |
| `GET /api/connect` | front-door steps as computed state | working |

Every refusal carries a machine-readable `reason`. Drafts never deploy;
publishing signs a version; only the runtime heartbeat turns it live on screen.

## Why the chat page refuses to finish an order

`/chat` is the half of the thesis about money coming in. Discovery happens on
someone else's surface; the conversation and the customer record happen here.
That only works if the assistant on your own surface is held to the same policy
as a cold agent arriving from a search engine.

So when a shopper asks to buy something, the assistant gets a 202 and tells them
the truth: a human has to approve it, it is waiting now, and nothing has been
charged. When a shopper asks for a refund, the assistant gets a 403 and says it
cannot do that, rather than guessing or pretending.

An assistant that quietly completes a purchase it was not authorised to complete
is worse than one that refuses. The refusal is the product.

## Stack

Next.js 14 App Router, React 18, TypeScript strict, Tailwind. The SDK is
consumed as a `file:` sibling at `../agentport-sdk`.

**Ledger:** the runtime writes rows into the merchant's own database; this
dashboard receives counts, never rows. `InMemoryLedger` is deliberately not
imported from the SDK root — it lives in the SDK's testing entry so that
reaching for it in production is a greppable act rather than an autocomplete
accident.

The capabilities in `lib/agentport.ts` are fixtures — they return a hardcoded
catalogue. In production they call the merchant's real catalogue, inventory and
order APIs. The policy engine and the ledger do not know or care which, which is
the point: the enforcement path is identical either way.

**One thing the fixtures get wrong that matters:** `createOrder` declares
`amountMinor` in its input schema and sets no `policyInputKeys` or
`policyInputFor`, so the order ceiling is measured against a number the *caller*
supplied. An agent that wants an order approved sends a small `amountMinor` and
the merchant's threshold is never reached. Declare the authoritative figure, or
resolve it with `policyInputFor`, before treating any order limit as enforced.

## Development

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

Node 20 or newer. After changing anything under `app/.well-known/`, exercise the
curl calls above. A dashboard that renders correctly over a broken
enforcement path is worse than no dashboard, because it looks trustworthy.

## Deploy (Netlify)

`netlify.toml` builds with `npm run build` and publishes `.next` (Essential
Next.js plugin). Set secrets in the site settings, never in the repo:

- `AGENTPORT_SIGNING_SECRET` — required, server-only
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — as needed, anon key only

Never a service-role key, access token, or `NEXT_PUBLIC_*` secret. One known
build caveat: `@agentport/sdk` is a `file:../agentport-sdk` sibling, which a
clean Netlify clone does not have — publish or vendor the SDK at the pinned
tag before connecting the site.

## Relationship to the Agent Operating Environment thesis

This is the business-facing surface of the Agent Operating Environment thesis. The
thesis argues that a business needs a machine-native interface so agents can
discover, understand and execute approved actions without operating the human
interface — and that the business keeps control of permissions and a complete
audit layer. The runtime SDK enforces that. This dashboard is where the
merchant sets it and where they see it working, or does not.
