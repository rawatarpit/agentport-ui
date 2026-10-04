# Threshold Console

The business side of Threshold: what external AI agents may do to a small
business, what they have done, what is waiting on a human, and how to change
those without writing code.

This is not a marketing site. It is the surface a shop owner uses to decide
whether to let a stranger's bot spend their money — and, increasingly, the
place where they say what that bot is allowed to try.

**Name is provisional.** The package and directory are still `agentport-console`
and `agentport-ui`. See the naming section in
[`../agentport-sdk/PRODUCT.md`](../agentport-sdk/PRODUCT.md).

> ## ⚠️ This repo does not currently compile
>
> `npx tsc --noEmit` reports **17 errors**, because the SDK moved under this
> console. `npm run build`, `npm run start`, and every curl example below are
> **last known good, not a description of today.** Three contracts changed:
>
> | Was | Now |
> | --- | --- |
> | `import { InMemoryLedger } from '@agentport/sdk'` | not a root export. Use `SqlLedger` |
> | `maxOrderValue: { amount, currency }` | `{ minor, currency }` — **minor units** |
> | `input: { q: 'string' }` | `InputSchema`: `{ q: { type: 'string' } }` |
>
> The `amount` → `minor` rename is a hundredfold trap — rupees and paise. See
> [`AGENTS.md`](./AGENTS.md) for the full gate and for the two invariants these
> touch.

## Where this sits

Three things are called AgentPort, and this is the third:

| | Authors | Decides | Runs in |
| --- | --- | --- | --- |
| **Runtime** (`../agentport-sdk`) | no | **yes, synchronously** | the merchant's app |
| **Cloud** — not built | yes | **never** | our infrastructure |
| **This console** | yes | **never** | **the merchant's app** |

This console does the Cloud's authoring half without any of its hosting, so
nothing a merchant types passes through a machine we operate before it becomes a
rule. **It is not the enforcement point** — the AgentPort runtime inside the
merchant's own application is, and it is the only thing that can say yes or no.
See [`../agentport-sdk/docs/PRODUCT-CLOUD.md`](../agentport-sdk/docs/PRODUCT-CLOUD.md).

## The screens

| Route | Question | Verb | State |
| --- | --- | --- | --- |
| `/` | Where do I stand? | set | standing summary; a live feed is planned |
| `/policies` | What may agents do, and why does each rule sit where it does? | see | working, read-only |
| `/ledger` | What have agents actually done, including the refusals? | see | **not durable** — reads a fixture seed, and no `configHash` column |
| `/approvals` | What is waiting on me, and has it run yet? | see | fixtures — buttons are inert, and stay inert |
| `/chat` | Does the customer still convert when the assistant is governed? | see | working |
| `/capabilities` `/rules` | What may agents do, and under what conditions? | set | **not built** |
| `/setup` | Four questions, then copy one line | set | **not built** |

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

**This console authors configuration. It never evaluates it.** A rule typed here
becomes configuration, is compiled to code, and is decided by the SDK in the
merchant's own runtime. There is deliberately no helper anywhere in this repo
that answers "is this allowed?" — a second answer would mean the merchant reads
whichever of the two happened to render.

Nothing typed here is in force until that generated code is committed and
running. The console shows a **draft**, and a capability it cannot prove is
deployed is shown as **not deployed**. That is a legitimate answer on day one.

## What the enforcement path actually does

**Last known good**, at commit time, over real HTTP, with the policy configured in
`lib/agentport.ts`. The commands below do not run today — see the compile warning
at the top.

```bash
npm run build && npm run start
```

**A read is allowed.**

```bash
curl -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' -H 'authorization: Bearer gpt-shopping' \
  -d '{"capability":"checkInventory","input":{"sku":"EX-140"}}'
# 200 {"status":"ok","data":{"sku":"EX-140","available":true,"stock":6},...}
```

**A write is held for a human, and says so.**

```bash
curl -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' -H 'authorization: Bearer gpt-shopping' \
  -d '{"capability":"createOrder","input":{"items":[{"sku":"EX-140","quantity":1}],"amountMinor":31400}}'
# 202 {"status":"pending_approval","approval":{"requestId":"req_...","reason":"Order of 31400 INR is above the 25000 INR approval threshold.",...}}
```

**A forbidden capability is refused with a reason.**

```bash
curl -X POST localhost:3000/.well-known/agent/invoke \
  -H 'content-type: application/json' -H 'authorization: Bearer perplexity' \
  -d '{"capability":"requestRefund","input":{"orderId":"ord_1042"}}'
# 403 {"status":"denied","reason":"policy_denied","detail":"The business has forbidden external agents from calling requestRefund.",...}
```

Note the last one. It is a 403 with a machine-readable reason, not a 500 and not
a bare "forbidden". An agent that cannot tell why it was refused will either
retry forever or route around the control, so a generic refusal is treated as a
bug in the SDK rather than a style choice.

### The identity in these examples is a demo, and it is an open door

Every curl above sends `Authorization: Bearer gpt-shopping`. That token **is** the
agent's identity:

```ts
// app/.well-known/agent/invoke/route.ts
const token = header.replace(/^Bearer\s+/i, '').trim()
const agentId = token || 'anonymous'
return { agentId, scopes: ['*'], credentialId: `cred_${agentId}`, … }
```

Send `Authorization: Bearer superadmin` and you are `superadmin`, with every
scope, with a freshly minted five-minute expiry on every request. There is no
credential to verify. The comment above the function says *"It must never trust an
agentId supplied in the request body"* — and then trusts the one in the header.

This is labelled a demo in `PRODUCT.md` and in `AGENTS.md` invariant 11, and that
label is load bearing: **removing it is a blocker, not a cosmetic change.** A
real verifier resolves a short-lived, scoped, expiring credential the business
issued, and records `assurance: 'unverified'` for anything weaker.

`.env.example` advertises `AGENTPORT_SIGNING_KEY` and **no code in this repo
reads it.** A control that reads like a control is the same failure the SDK
records as `UserDelegation.scope`: documented, and enforcing nothing.

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

**Ledger:** use `SqlLedger` from the package root. `InMemoryLedger` is deliberately
not exported there — it moved to `../agentport-sdk/src/testing.ts` so that reaching
for it in production is a greppable act rather than an autocomplete accident. A
pilot reporting from a `Map` with a cap has no proof of anything.

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
three curl calls above. A console that renders correctly over a broken
enforcement path is worse than no console, because it looks trustworthy.

## Relationship to the Agent Operating Environment thesis

This is the business-facing surface of the Agent Operating Environment thesis. The
thesis argues that a business needs a machine-native interface so agents can
discover, understand and execute approved actions without operating the human
interface — and that the business keeps control of permissions and a complete
audit layer. The SDK (`agentport-sdk`) enforces that. This console is where the
merchant sets it and where they see it working, or does not.

## Further reading

- [`TASKS.md`](./TASKS.md) — every task, ordered by the merchant's path
- [`PRODUCT.md`](PRODUCT.md) — why this console exists, what it is allowed to
  claim, and what it deliberately leaves out
- [`AGENTS.md`](./AGENTS.md) — the invariants, including authoring versus
  evaluating and caller-chosen identities
- [`../agentport-sdk/docs/PRODUCT-RUNTIME.md`](../agentport-sdk/docs/PRODUCT-RUNTIME.md)
  — the enforcement primitive: CLI, SDK, and its gaps
- [`../agentport-sdk/docs/PRODUCT-CLOUD.md`](../agentport-sdk/docs/PRODUCT-CLOUD.md)
  — the hosted control plane, unbuilt, and why it may never decide
- [`../agentport-sdk/AGENTS.md`](../agentport-sdk/AGENTS.md) — the invariants this
  console inherits, and the three-role table both products sit inside
- [`../agentport-sdk/PRODUCT.md`](../agentport-sdk/PRODUCT.md) — the product this
  console is evidence for
- [`TASKS.md`](./TASKS.md) — every task, ordered by the merchant's path
  and in which gate
