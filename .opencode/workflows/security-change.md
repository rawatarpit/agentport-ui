# Workflow — Security-sensitive change

Applies to: RLS reads, tenant isolation, GitHub webhook/OAuth, `service_role`
handling, GitHub scopes and events, approval or kill-switch controls. The
display of a security decision is part of the security decision.

`security-reviewer` has veto. If they block, the change does not ship until they
lift it, in writing, with a reason.

## 1. Restate the invariant

Name the specific invariant in `AGENTS.md` this change touches. If you cannot name
one, it is probably not a security change — say so and use `build-feature.md`.

## 2. Threat model before code

Write down, concretely:

- **Who is the attacker?** A hostile agent, a hostile merchant, a compromised
  browser session, or a forged GitHub delivery — including one carrying
  *another* tenant's installation.
- **What do they send?** The literal values: the forged delivery body, the
  replayed OAuth code, the crafted `tenant_id` param — not "malicious input".
- **What do they get?** The literal effect: another tenant's rows, a stored
  token, an approval attributed to the wrong human.
- **What is the blast radius?** One tenant, or every merchant on the deploy?

"Could this be abused?" is not an answer. "A delivery with a valid HMAC from
installation X arrives while the installer session belongs to tenant Y; which
tenant does the repo attach to?" is an answer.

## 3. Consider the cross-tenant case

This console serves many businesses from one deploy. Ask explicitly:

- Can one tenant's session read another tenant's rows through any route?
- Does any error or state surface leak the existence of another tenant's data?
- Do installation logins collide across tenants in a way that could attach a
  repo to the wrong shop?

## 4. Plan the smallest safe change

- What is the minimum diff that fixes the real problem?
- Does it change a route contract? A view shape? A required env var?
- Is there a backwards-compatible path, and is the breaking one worth it?

## 5. Adversarial tests, in the same commit

A test that exercises the happy path proves nothing here. Write the test that
attempts the abuse, and assert it fails safely.

Minimum for each area:

| Area | The test that matters |
| --- | --- |
| Tenant isolation | A session for tenant A cannot read tenant B's rows, and empty is empty — not an error that leaks existence |
| Webhook | An unverified delivery changes nothing; an unknown event acks without error |
| OAuth/callback | A mismatched or replayed code lands visible and unattached, never on the wrong tenant |
| Secrets boundary | A new secret class is unreachable from client code — and the build guard covers it |
| Approval display | A held request cannot be released from the browser, and the queue row carries the authority behind it |
| Kill-switch | The control flips a live row, and no synced shape can express or clear it |
| Empty honesty | Every touched read renders `unknown` on empty, with no forbidden column selected |

## 6. Review chain

`impact-analyzer` → `code-reviewer` → `test-engineer` → `security-reviewer`

## 7. Report

State the invariant, the threat, the diff, the adversarial tests, and anything you
could not cover. "I could not test X" is a required disclosure, not an optional one.

## Never

- Ship with a skipped or `.only`'d test in the security areas.
- Accept "the test already covered that" without reading the test.
- Disable a type check, a lint rule, a test, or the secrets build guard to make
  a change fit.
- Seed demo data into a merchant-visible path "temporarily".
