# Team Protocol — AgentPort Console

All agents operate as one engineering organization. No agent works alone.

This is the **merchant-visible half** of a security product. Nothing here
enforces, but everything here is acted on: a merchant who believes a draft is
live, a zero is healthy, or an amount is private when it is shown, makes a
real decision on a false display. That governs everything below.

## Default flow

```
Request
  ↓
Product Manager
  ↓
Architect
  ↓
Impact Analyzer
  ↓
Specialist Engineer (routes / views / github / reads)
  ↓
Test Engineer
  ↓
Code Reviewer
  ↓
Security Reviewer   ← veto
  ↓
Release Manager
```

## Collaboration rules

### Before coding, always consult

- `product-manager` — is this worth building?
- `architect` — is it the smallest safe surface?
- `impact-analyzer` — what else does it break?

### For any change to RLS reads, tenant isolation, webhook/OAuth, service_role handling, or the GitHub App

Mandatory, and `security-reviewer` has veto:

- `security-reviewer`
- `impact-analyzer`
- `code-reviewer`
- `test-engineer`

Use `.opencode/workflows/security-change.md`. The display of a security
decision is part of the security decision.

### For screens, routes, or API changes

Include `policy-engineer` when the change touches the rules editors,
kill-switch control, or the approval queue display.
Use `.opencode/workflows/build-feature.md`.

### For bug fixes

Use `.opencode/workflows/fix-bug.md`. Required chain: `debugger` →
`impact-analyzer` → engineer → `test-engineer` → `code-reviewer`.

The regression test lands in the **same commit** as the fix. A fix without a
test is an untested change of behaviour.

### For proof-tier, metrics, or disconnect work

Use `.opencode/workflows/build-feature.md` with mandatory `security-reviewer`:
exports and retention touch custody, metrics touch honesty, disconnect touches
the install lifecycle. New columns or tables need the custody review before
code. Follow the plan (`AGENTPORT_PLAN.md`): Phase 2+ is scoped, Phase 4 is a
fence — build neither by accident.

### For product or thesis work

Mandatory: `product-manager`, `architect`, `impact-analyzer`.
Use `.opencode/workflows/product-thesis.md`.

### Before completion

Mandatory review by: `test-engineer`, `code-reviewer`, `security-reviewer`,
`release-manager`.

## The invariants

From `AGENTS.md`. Any change touching these is a security change.

1. Unknown, never green.
2. No fixtures, no fallback to memory.
3. Draft ≠ live.
4. RLS is the control; the app is convenience.
5. `service_role` never reaches the browser.
6. Amounts and PII never leave the merchant's database.
7. Approvals visible here, decided elsewhere.
8. GitHub least-privilege and merchant-revocable.

## Things that are never acceptable

- A `0`, a green badge, or a seeded heartbeat where the data is `null`.
  "Temporary demo data" in a merchant-visible path is a lie with a TODO on it.
- A dashboard query that selects an amount, instrument, email, or free-text
  column, even if the component "doesn't render it yet". Selection is exposure.
- A `service_role` query from a path the caller's RLS context could answer,
  or an RLS query that fails open to empty on a server route.
- A browser approve/commit control added for convenience. That moves the trust
  boundary; it needs a security change, not a feature commit.
- Widening GitHub scopes or events to make an integration work. Ask for the
  minimum that works, and record why each scope is needed.
- Treating a green test run as sufficient verification for a change in the
  five areas. The test asserts what you thought to assert.

## Rule

If a change affects another domain, that specialist must be considered.

Think in systems, not files. Every change either strengthens the merchant's
ability to see the truth, or weakens it. There is no third category.
