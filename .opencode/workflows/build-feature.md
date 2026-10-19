# Workflow — Screen, route, or API change

## 1. Product first

`product-manager` answers, before any code:

- What merchant decision does this inform, and what does a misreading cost?
- Is this a display of a security decision (a refusal, an approval, a
  kill-switch, a scope)? Then it is also a security change — say so now.
- Does it need a new query, or does an existing view already answer it?

If the answer is "it makes the console feel complete", stop. Every screen is
a promise to keep it truthful forever.

## 2. Architect

Produce:

- The surface — routes, components, queries, and what stays server-side
- The RLS context for every read (caller RLS, or `service_role` with the
  reason written down)
- The empty rendering for every read (`unknown` wording, not zero)
- The failure modes, and what each shows the merchant

Prefer the smallest surface. A new route is permanent; an internal helper
is not.

## 3. Impact analysis

`impact-analyzer` checks readers, RLS context, display contract, draft/live
labelling, custody ladder (shared vs enterprise tier), server/client boundary, and trust impact.

Two changes are breaking even when no API changes:

- **A display state changes meaning.** Merchants act on badges and counts.
- **A new column is selected.** Custody is decided at selection, not at render.

## 4. Implement

- Match existing patterns. Read the neighbouring route/component first.
- Strict TypeScript. No `any`. No non-null assertion without a comment saying why it
  is safe.
- Secrets stay in route handlers. Nothing secret-named reaches a client component.
- New `NEXT_PUBLIC_*` var only with the build guard covering its class.

## 5. Test

`test-engineer`. Cover the populated shape AND the empty shape. The test must
fail before the change and pass after. If you cannot make it fail first, the
test is not testing the change.

## 6. Review

`code-reviewer` → `test-engineer` → `security-reviewer` (if the five areas are
touched) → `release-manager`

## 7. Report

**What Changed · Why · Files · Impact · Risks · Verification**, with the actual
`npm test && npm run typecheck && npm run build` output quoted.
