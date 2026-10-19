# Workflow — Production release (Netlify deploy)

This console is what merchants act on. A bad deploy can show a merchant a false
picture of what their agents are permitted to do without crashing anything.
Release slowly and say what changed.

## 1. Pre-flight

- `npm test` green with the count quoted, `npm run typecheck` clean,
  `npm run build` clean — quote the real output (this is the same build
  Netlify runs)
- Clean working tree; nothing unreviewed in the diff
- `git log` read; every commit belongs to this deploy
- `GET /api/github` on the target origin checked when env or GitHub code
  changed: `configured: true`, nothing missing — quote the response

## 2. Classify the change for merchants

| Change | Treatment |
| --- | --- |
| A badge, count, status, or label changes meaning | **Major for trust** + note saying what an existing merchant observes differently |
| A new column selected by any read | **Blocked** unless custody-cleared (secrets/CVV/passwords never; tier-scoped otherwise) |
| Draft/live labelling or digest display changes | **Major for trust** + note |
| Approval queue shape changes | **Major for trust** + note |
| New route or screen | Minor, with its empty state pinned by test |
| Internal fix, no observable change | Patch |

Display states are public contracts even though they are not TypeScript
exports. Judge them as contracts.

## 3. Review chain — all four, no exceptions

`test-engineer` → `code-reviewer` → `security-reviewer` → `release-manager`

## 4. Deploy inspection

Before promoting a deploy, confirm:

- no secrets, no `.env`, no `.pem`, no absolute developer paths in the repo
- env vars set on Netlify (not in files); secret-like `NEXT_PUBLIC_*` absent
  or guard-covered
- the deploy log's build matches the local `npm run build` (same routes)

## 5. Display-contract notes

If anything in the table above says major for trust, the deploy note must say:
what changed, what a merchant must do (usually: nothing), and what they will
observe without changing anything.

## 6. Rollback

State the rollback path before promoting: Netlify rollback to which deploy,
and are the reads forward-compatible? **A view the new deploy changes must
still render honestly if rolled back.** If it cannot, that is a blocker, not
a footnote.

## 7. Report

What a merchant will notice · display-contract notes · verification output ·
`/api/github` state · rollback path. Never ship around a gate; say which gate
failed and why.
