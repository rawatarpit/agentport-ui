# Workflow — Bug fix

## 1. Reproduce and trace

Never guess. Trace the real path: route → server context (RLS or
`service_role`?) → view/table → render. Name the exact line where behaviour
diverges from expectation — including which identity the query ran as.

State the reproduction as a command or a test, not a description.

## 2. Root cause

Distinguish carefully between:

- the **symptom** (the wrong badge, the empty screen, the 500)
- the **cause** (the RLS predicate that excludes the caller, the `null`
  rendered as `0`, the unverified read)
- the **reason the cause existed** (nobody tested the empty shape)

Fix the cause. A fix at the symptom recurs.

## 3. Blast radius

`impact-analyzer`: is this the only place with the bug? Look for the same mistake
in a sibling route or component — the same wrong context, the same optimistic
zero, the same seed. Fix all instances or explain why not.

## 4. Fix minimally

The smallest change that removes the cause. No opportunistic refactors in a bug
fix — they hide whether the fix worked.

## 5. Regression test, same commit

A bug fix without a test is a change of behaviour with no guard. The test must fail
on the parent commit and pass on the fixed one. Say so explicitly in the commit
message. If the bug was a dishonest display, the test asserts the honest one.

## 6. Review

`code-reviewer` → `test-engineer` → `security-reviewer` (if in the five areas)

## 7. Report

Root cause, the exact fix, why it recurred, the regression test, and what else you
checked for the same bug.
