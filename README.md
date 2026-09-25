# Agent Port Console

The business side of Agent Port: what external AI agents may do to a small
commerce business, what they have done, and what is waiting on a human.

This is not a marketing site. It is an operations surface, read by someone who
runs a shop and needs to decide whether to let a stranger's bot spend their
money.

## The four questions

| Route | Question |
| --- | --- |
| `/` | Where do I stand? |
| `/policies` | What may agents do, and why does each rule sit where it does? |
| `/ledger` | What have agents actually done, including the refusals? |
| `/approvals` | What is waiting on me, and has it run yet? |
| `/chat` | Does the customer still convert when the assistant is governed? |

Two routes are for agents, not for humans:

- `GET /.well-known/agent.json` — the discovery manifest
- `POST /.well-known/agent/invoke` — the execution endpoint

## What the enforcement path actually does

Exercised over real HTTP, with the policy configured in `lib/agentport.ts`:

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

The capabilities in `lib/agentport.ts` are fixtures — they return a hardcoded
catalogue. In production they call the merchant's real catalogue, inventory and
order APIs. The policy engine and the ledger do not know or care which, which is
the point: the enforcement path is identical either way.

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
interface — and that the business keeps control of permissions and a complete audit
layer. The SDK (`agentport-sdk`) enforces that. This console is where the merchant
sees it working, or does not.

Why this console exists, what it is allowed to claim, and what it deliberately
leaves out are in [`PRODUCT.md`](PRODUCT.md).
