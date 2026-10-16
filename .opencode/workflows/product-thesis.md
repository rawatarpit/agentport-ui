# Workflow — Product thesis

For scope, positioning, pricing, roadmap, pilot terms, or a new screen family.
These are lab decisions, not engineering tickets.

## 1. Problem

State the problem in the merchant's words, not ours. Who has it, how often, and
what they do today instead. If the answer is "they are fine currently", say so.

## 2. Buyer vs user

An external AI agent is the **user** of the governed capability. The merchant is
the **buyer** of the console, and they pay for seeing the truth, not for pretty
charts. The merchant's objection is acting on a false display, and it is the
real one.

Design for the objection, not for the demo.

## 3. Is the problem real, and is the economics nameable?

- Name the metric the merchant already tracks (refunds, tickets, agent-handled
  requests).
- Name the one we want them to start tracking because of us (decisions with
  proof attached).
- If neither is nameable, this is not a product yet.

## 4. MVP

The smallest thing that makes the merchant's objection go away.

Explicitly:

- what is in
- what is out
- what "working" looks like, as a testable statement (including what the
  empty state shows)

## 5. Risks

Rank by severity × likelihood. Name the one that would kill the thesis, and say
what early signal would tell us it is happening.

## 6. Check the invariants survive

A scope expansion that weakens any invariant in `AGENTS.md` is not a scope
expansion. It is a regression. Say so. A screen that cannot stay truthful at
its edges is not an MVP — it is a liability with a launch date.

## Output

Problem · Buyer · MVP · Metric · Kill risk · Early signal. Then a recommendation,
including "not yet" when that is the honest answer.
