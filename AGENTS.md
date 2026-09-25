# Agent Port Console — agent instructions

## What this repository is

The business-facing side of Agent Port: a merchant console for a small commerce
business that has exposed capabilities to external AI agents. It answers four
questions, and nothing else:

1. What may agents do? (`/policies`)
2. What have they actually done? (`/ledger`)
3. What is waiting on a human? (`/approvals`)
4. Does the customer still convert? (`/chat`)

It is the enforcement surface of the Agent Operating Environment thesis
(`relayforge/business-agent-environment.md`). It is not a marketing site and not
a general admin panel.

## Stack

Next.js 14 App Router, React 18, TypeScript strict, Tailwind, dark-first.
The SDK is consumed as a `file:` sibling at `../agentport-sdk` and is
transpiled via `transpilePackages`. Treat the SDK as a dependency with an
invariant contract — see its `AGENTS.md` — not as code to edit from here.

## Invariants

1. **The console never decides policy.** It displays what the SDK's policy
   engine returned. If a rule needs to change, change it in the SDK. A second
   implementation of the rules in the UI is a divergence bug waiting to happen.
2. **A held request is shown as not-yet-executed.** Never render a pending
   approval as a success, a pending payment, or a confirmed order.
3. **A refusal is shown with its reason.** Never collapse a 403 into "something
   went wrong". The reason is what makes a control trustworthy to the person
   reading it.
4. **The ledger is read-only in the UI.** No edit, no delete, no "mark as
   reviewed" that mutates the record. Rendering is the only permitted verb.
5. **Capabilities are not fetched from the client at build time.** The manifest
   is served by a route handler from the live registry, so it cannot describe
   something the enforcement path does not do.
6. **No secret reaches the client.** `verifyIdentity()` is the only place a
   credential is interpreted, it runs server-side in a route handler, and the
   resolved identity is never echoed back.

## Working rules

- **Server components by default.** Add `'use client'` only for genuine
  interaction. Four of the five pages need no client JavaScript at all.
- **Match the existing tone.** Dense, dark, mono for identifiers and labels,
  a display serif for headings. This surface is read for long stretches by
  someone who runs a shop, so legibility beats decoration.
- **Status colours are semantic.** `verdant` for allowed, `amber` for held,
  `rust` for refused, never decorative. A green badge must never mean "looks
  fine" when it means "policy allowed this".
- **The tables are dense on purpose.** `tabular-nums` on every figure, because
  these are numbers a merchant will check against their bank.
- **Prefer the type from the SDK.** `LedgerEntry`, `PendingApproval`,
  `PolicyDecision` — do not redeclare a local shape that drifts from them.

## Verify before you claim done

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

## Common mistakes

- Rendering a pending approval with an order id or a charge confirmation.
- Copy styling a `LedgerEntry` rather than importing the type.
- Adding a client component to a page that only reads.
- Hardcoding a policy value in the UI instead of reading it from the manifest.
- Treating the fixtures in `lib/agentport.ts` as the real contract. They are
  fixtures; the enforcement path around them is the product.
