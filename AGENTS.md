# AgentPort Console (agentport-ui) — agent instructions

## What this repository is

The merchant-facing dashboard for AgentPort: a Next.js app (deployed on
Netlify at `agentport.relayforge.in`) backed by the Supabase project the SDK
repo owns. It does not enforce anything. It **shows** — tenant home,
capabilities drafts, rules editors, ledger and approval reads, activity
counts, GitHub install flow — and every screen must tell the truth about
whether what it shows is live.

The SDK decides. The database constrains. This repo displays. Confusing those
three roles is how a dashboard becomes a lie the merchant acts on.

Companions: [`SYSTEM.md`](SYSTEM.md) (whole system top-down),
[`FRONTEND.md`](FRONTEND.md) (build order per page),
[`TASKS.md`](TASKS.md) (task list, the status of record),
[`github-app.md`](github-app.md) (App registration record),
[`AGENTPORT_PLAN.md`](AGENTPORT_PLAN.md) (thesis, positioning, pricing,
phases, metrics — the build order this repo follows),
[`PILOT_TERMS.md`](PILOT_TERMS.md) (pilot + proof-tier terms, friction log).

## Non-negotiable invariants

1. **Unknown, never green.** A tenant with no push renders `unknown` — never a
   healthy zero, never a demo heartbeat. Zero claims a healthy system; `null`
   admits an unheard one. (`v_tenant_home.last_push_at`, enforcing panel,
   analytics-view, business-card.)
2. **No fixtures, no fallback to memory.** Ledger and approvals read durable
   `console_decisions` via RLS. An empty result is an honest empty state.
   `lib/store.ts` keeps `seedDemoPush()` for tests only; `lib/gates.test.ts`
   fails the build if any non-test file outside `store.ts` references it.
   A duplicated demo source is the structural defect; do not reintroduce one.
3. **Draft ≠ live.** Dashboard edits (capabilities, rules) are drafts until the
   merged file reaches the merchant's runtime. Every editor labels draft vs
   deployed, and nothing auto-enforces on save. The merchant's Merge is the
   signature.
4. **RLS is the control; the app is convenience.** Middleware redirects and
   session gates keep honest users out of pages. Data isolation lives in
   `security_invoker` views + `agentport_is_tenant_member()`. A screen that is
   reachable is not a screen that leaks — but a screen that queries outside
   RLS is a breach, not a bug.
5. **`service_role` never reaches the browser.** The build guard in
   `next.config.mjs` fails the build on secret-like `NEXT_PUBLIC_*` vars.
   That failure is the control working. Server routes hold secrets; client
   components hold none.
6. **Custody is a ladder, set by the owner decision of 2026-10-17
   (`FULL_PLAN.md` §12).** Shared tier: requests pass through the hosted
   worker *by design* — a customer's phone number in the chatbot is already
   the merchant's data on the merchant's API path; the worker is the
   governed hop, records full ledger rows, and pushes GA analytics events.
   Enterprise tier: nothing transits us; what we receive is aggregates
   only. **Never persisted, in either tier:** CVV, passwords, API keys,
   raw credentials. The dashboard still reads the tenant's own ledger —
   widening what exists beyond the ladder needs a custody review first.
7. **Approvals are visible here, decided elsewhere.** The queue renders with
   full context; the decision lands via `agent-port approve` in the CLI.
   Never add a browser approve button without a security-change review —
   it moves the trust boundary into a session cookie.
8. **GitHub is least-privilege and merchant-revocable.** Selected repos only,
   minimum scopes (contents+PRs write, checks+metadata read), webhook HMAC
   verified before read, installer identity matched to tenant, user token
   dropped never stored. Revocation must work immediately and silently.

## Working rules
- **Every behaviour change needs a test.** Vitest (`npm test`). Honesty
  shapes need tests too: assert `unknown` renders, assert no amount column is
  selected, assert a structural guard (see `lib/gates.test.ts`).
- **No `any`.** `strict` is on.
- **Comments explain why, not what.** Evaluation order, a security tradeoff,
  a rejected alternative — same bar as the SDK.
- **Server/client boundary is load-bearing.** A secret imported into a client
  component ships to every visitor. When in doubt, keep it in a route handler.
- **Do not add a second trust path.** Reuse the existing session/RLS/GitHub
  shapes rather than inventing parallel auth, parallel push ingestion, or a
  parallel config channel.
- **One compiler, every delivery.** `agentport.config.ts` is compiled once
  (`buildInstallFileFrom`) whether it leaves by PR or by download. A second
  compiler is a fork, and forks drift — the manual path uses the same
  function, not a copy.
- **PR on install, publish channel after.** The install PR lands the kit once
  and the merchant's merge adopts it. Every later change — capabilities
  added or removed, ceilings moved, rules rewritten — flows through the
  dashboard publish channel (tiered ceremony, signed artifact, heartbeat
  proof), never another PR. A new PR for an update is a regression to
  review-theatre: the ceremony lives in the approval, not the git history.
- **Metrics report rows, never inference.** A metric the stored rows cannot
  prove renders `unknown` (null), never zero. Zero installs is a fact; zero
  staleness with no push is a fabrication.
- **The proof tier sells longer proof, never more data.** Retention, exports,
  alerting, multi-site — none of them widen which columns exist or who can
  read them. An export contains the caller's own rows only. A feature that
  needs a new column needs a custody review first.
- **Disconnect is a first-class flow.** Uninstall/revoke must read as missing
  immediately and silently — never as an error, never as a retained row that
  suggests access persists.

## The shared worker (built in the SDK repo — know it, don't build it here)

In the shared tier, enforcement does not run in the merchant's process. The
SDK repo compiles the same core into a hosted worker fleet that: pulls tenant
config from Supabase, serves chatbots (discover + authorized call), executes
the merchant's backend using per-call secret resolution, and writes ledger
rows + analytics events back *after* proving. Roles still hold: this repo
never enforces, never executes, never stores a worker credential. Supabase
receives what the workers push; it is the memory, not the mouth.

## Verify before you claim done

```bash
npm test && npm run typecheck && npm run build
```

Tests (114 and growing), `tsc --noEmit`, and the production build — all three
must be clean. `next lint` is available; the build is what Netlify runs, so
the build passing locally is what predicts the deploy. "It renders in dev"
is not verification.

## Common mistakes to watch for

- Showing `0` where the data is `null` (turns "unheard" into "healthy").
- Reading a new column into a dashboard view without checking it against
  invariant 6 (amounts/PII).
- Adding an API route that queries with `service_role` where the caller's RLS
  context would do — or vice versa, querying RLS where a server-side aggregate
  needs `service_role` and failing open on empty.
- Wiring a demo/seed helper into a page "temporarily". The guard test exists
  because temporary becomes permanent.
- Treating the manifest (`/.well-known/agent.json`) as authoritative. It is
  unauthenticated by design; authoritative policy is the signed artifact the
  runtime verifies locally.
