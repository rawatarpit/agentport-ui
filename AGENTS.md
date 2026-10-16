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
6. **Amounts and PII never leave the merchant's database.** The dashboard
   shows counts, decisions, digests — never amounts, instruments, emails, or
   free text. Do not "helpfully" add an amount to a dashboard query; that is
   the custody boundary (`dashboard_runtime_integration.md` §7), not a missing
   feature.
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

## Verify before you claim done

```bash
npm test && npm run typecheck && npm run build
```

Tests (51 and growing), `tsc --noEmit`, and the production build — all three
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
