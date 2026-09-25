# Agent Port Console — product definition

Why this console exists, what it is allowed to claim, and what it deliberately
does not do.

This document is self-contained. The wider lab thesis lives in the RelayForge repo
and is not required to work here.

---

## One line

The merchant's view of what external AI agents are permitted to do, what they
actually did, and what is waiting on a human.

---

## The problem this solves

A merchant installs Agent Port so agents can act on their business. The moment they
do, the merchant has a question with no good answer: **did it work, and what did
they do?**

Today the honest answer is "check the logs", which is unusable. Log lines are
written for machines, are not queryable by intent, and rarely distinguish a refused
call from a call that never arrived. So the merchant is left in the worst possible
position: having granted an agent access, with no way to verify the grant was
respected.

That gap is the console. Not a dashboard — a **verification surface**. Its job is
to let someone answer "did that agent do what I think it did, and did I approve
that?" in under a minute, including the parts that went wrong.

---

## The user, precisely

**A shop owner, at 11pm, who has just heard that an agent did something
unexpected.**

Not a security researcher. Not a developer. Someone with six SKUs and a real
order they need to be sure was or was not placed. They are not browsing — they are
anxious, and they want the bad news first.

This has one hard consequence: **the console must be complete about failures.** A
surface that only looks good when everything was allowed is advertising that
failures do not happen. Hiding refusals to make the product look smoother would
destroy the exact trust the console exists to create.

---

## The four questions

The console answers four questions. Not five.

| Route | Question | Failure mode it prevents |
| --- | --- | --- |
| `/policies` | What may agents do? | An agent acting beyond what was expected |
| `/ledger` | What have they done? | Being unable to prove what happened |
| `/approvals` | What is waiting on me? | A held action silently expiring, or a blind click-through |
| `/chat` | Does the customer still convert? | Assuming governance costs revenue |

`/chat` is included for a specific reason. A merchant's fear is that governing
agents will cost them sales. The honest answer is that discovery happens on someone
else's surface while the conversation and customer record happen here — but only if
the assistant on your own surface is held to the same policy as a cold agent. So
this page exists to make that claim checkable rather than theoretical.

**Four pages is a feature.** The console is small enough to hold in your head, and
that is part of why it can be trusted. A fifth page needs to displace one.

---

## What this console is allowed to claim

This is the most important section in the document.

| Allowed | Forbidden |
| --- | --- |
| A held request is waiting for approval | A held request has been placed, paid, or confirmed |
| A call was refused, with the rule that fired | A generic "something went wrong" |
| A capability is exposed to agents | A capability is *safe* |
| Fixtures demonstrating a code path | Real measurements of this business |
| The ledger is complete | The ledger is tamper-proof (it is append-only; see the SDK) |

The pattern: **a console that overstates is worse than no console**, because it
converts an absence of evidence into false confidence. Every claim on every screen
must be one the data actually supports.

The specific failure to design against: an approval queue that renders an order id
next to a pending request. A merchant glances at it, sees an order reference, and
assumes the order exists. That is a real-money error caused entirely by layout.

---

## Design position

- **Dark and dense.** Read for long stretches by someone who runs a shop.
  Legibility beats decoration.
- **Mono for identifiers, display serif for headings.** A `requestId` is a thing you
  copy into a search box; it should look like one.
- **`tabular-nums` on every figure.** These are numbers reconciled against a bank
  statement. Misaligned digits read as a wrong number.
- **Status colour is semantic, never decorative.** `verdant` = allowed, `amber` =
  held, `rust` = refused. A green badge must never mean "looks fine" when it means
  "policy allowed this". Someone is making a decision from that colour.
- **The refusal is a feature.** Do not soften refusal copy to make the console look
  friendlier. The refusal is what the buyer is paying for.

---

## Out of scope

- **Deciding policy.** The console displays what the SDK's policy engine returned.
  A second implementation of the rules in the UI is a divergence bug waiting to
  happen, and the merchant would be reading whichever one rendered.
- **Mutating the ledger.** Rendering is the only permitted verb. An audit trail
  that can be edited is not one.
- **A hosted enforcement path.** The console displays; the SDK enforces. Nothing
  in this repo may become a dependency of the authorization decision.
- **Analytics, funnels, or A/B testing.** Not a growth surface. If we need to know
  whether merchants read the ledger, that is a question for a real merchant, not
  for a dashboard.
- **Editing policy in the browser.** Policy is code in the merchant's repo, reviewed
  like code. See `PRODUCT.md` in the SDK.

---

## Status

| Area | State |
| --- | --- |
| All five pages | Working |
| Manifest route | Working, generated from the live registry |
| Invoke route | Working — 200 / 202 / 403 confirmed over HTTP |
| Ledger, policies | Read from the real policy engine |
| `/approvals` | **Fixtures.** Store has no list, reject or consumed state, so the buttons are inert |
| Chat | Calls the real invoke route; refusals surface honestly |
| Identity verification | **Demo.** Any bearer token becomes a wildcard-scoped identity |
| Persistence | In-memory. Restart loses the ledger |
| Responsive and visual QA | **Deliberately not automated.** The maintainer does all visual review |

The demo identity verifier is the most important line in that table. It must stay
labelled as a demo in code and in the README, and removing that label in a UI commit
should be treated as a blocker rather than a cosmetic change.

---

## The test of whether this is working

A merchant should be able to say, after using it once: *"I know what the agents did,
I know what I approved, and I know what I refused."*

If they instead say *"the console looks nice"*, it is decoration, and the SDK's real
guarantee is going unclaimed.

---

## Related

- `AGENTS.md` — the six invariants, which are this document's enforcement
- `README.md` — running it, and the three status codes demonstrated
- `../agentport-sdk/PRODUCT.md` — the product this console is evidence for
- `.opencode/workflows/product-thesis.md` — the process for revisiting any of this
