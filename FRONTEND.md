# FRONTEND — wiring, auth, and everything left

**Companion to [`TASKS.md`](TASKS.md) (the task list) and [`SYSTEM.md`](SYSTEM.md)
(what the system is).** This file is the *build order* for the dashboard: what
to wire first, what each page renders, and what is deliberately not built.

Status of record — UI `npm run build` + `npm run lint` clean · SDK 626 tests,
625 pass · Supabase 21 migrations applied, `agentport-team` v1 ACTIVE.

---

## 1. What the backend gives you now

This changed on 2026-10-05 and it unblocks most of the list. Before it, the
dashboard had nothing to read. Now:

| Thing | Where | What you get |
| --- | --- | --- |
| Signup | `supabase.auth.signUp()` | Creates the user; a DB trigger mints the tenant and makes them `owner` |
| Session | `supabase.auth.onAuthStateChange` | The only auth state the app needs |
| **Your tenant** | `select * from v_tenant_home` | One row. Includes `my_role`, `member_count`, `last_push_at` |
| Capability counts | `v_capability_activity` | Per capability per ISO week: asked / denied / held / approved / executed |
| **Conversion** | `v_conversion` | `succeeded` / `failed` **booleans** per capability per window |
| Why refused | `v_denial_reasons` | `denial_reason` + `policy_rule` + occurrences per week |
| Schema inventory | `v_schema_inventory` | Table/column **counts** only |
| Team | `agentport-team` edge function | `list` / `invite` / `set_role` / `remove` |

**All five views are `security_invoker = true`**, so RLS applies through them. A
member sees only their own tenant. Use the **anon** key for all of this from the
browser — never `service_role`. `service_role` bypasses RLS and is the one key
that must never reach a browser.

> `last_push_at` is `NULL` until a real push lands. Render that as **unknown**,
> never as "healthy". A panel that shows optimistic status for a runtime it
> cannot reach is the decorative control this whole system exists to prevent.

---

## 2. Auth — there is no auth code to write

Supabase ships GoTrue. Email/password signup, login, refresh, reset and brute-
force throttling already work. **No edge functions, no password handling, no
session storage in our code.** Calling it directly from the browser is the whole
implementation.

```ts
// signup — email + password. No custom endpoint.
await supabase.auth.signUp({ email, password, options: { data: { business_name } } })

// login
await supabase.auth.signInWithPassword({ email, password })

// session — one listener, mounted once, in a client component
supabase.auth.onAuthStateChange((_e, session) => setSession(session))

// sign out
await supabase.auth.signOut()
```

**Do not add a `users` table, a password column, a token table, or a JWT
verification routine.** Anything of that sort is a second trust path next to
GoTrue, and it will drift from it.

### Pages needed

| Route | Notes |
| --- | --- |
| `/login` | Email + password. Link to signup and to password reset |
| `/signup` | Email + password + business name. Business name goes in `options.data` and the trigger reads it |
| `/reset-password` | `supabase.auth.resetPasswordForEmail`, then `updateUser({ password })` after the recovery link |
| `/auth/callback` | For the email-confirmation link. Exchanges the code, then redirects |
| `/onboarding` | Runs after first login: does a tenant exist? (`v_tenant_home`) → yes → `/capabilities`, no → `/setup` |

**Email confirmation.** Decide whether to require it. If on, `signUp` returns a
user with **no session** and the app must show "check your email" rather than
navigating to `/capabilities` — a new user who lands on a dashboard with an
empty tenant sees a broken product. If off, say so out loud: it is a real
trade-off, not a default.

---

## 3. Wiring — kill `lib/store.ts` last, not first

`lib/store.ts` is six `new Map()`s plus a `Set`, and `DEMO_TENANT =
'example-shoes'` is hardcoded at line 13. **Every surface you migrate will be a
visible improvement, so do them in this order** — each step leaves the app
working:

| # | Step | Replaces |
| --- | --- | --- |
| 1 | `lib/supabase/client.ts` — one browser client, anon key | `lib/supabase.ts` (which only returns booleans) |
| 2 | `/login`, `/signup`, middleware redirect when no session | `POST /api/signup` |
| 3 | `/` home reads `v_tenant_home` | seeded demo heartbeat |
| 4 | `/analytics` reads `v_capability_activity` + `v_conversion` | fabricated numbers |
| 5 | `/rules` panel reads `v_denial_reasons` | fixtures |
| 6 | `/ledger` + `/approvals` | fixtures — **needs the durable projection first** |
| 7 | `/team` page → `agentport-team` | nothing |
| 8 | Delete `app/api/analytics` + `app/api/config` | RAM ingest |
| 9 | Delete `lib/store.ts` | everything |

Step 6 is blocked: there is no durable read model for decisions yet. Steps 1–5,
7 and 8 are unblocked **today**.

### Middleware

```ts
// middleware.ts — redirect when signed out. Cheap gate, not authorisation.
const { data: { session } } = await supabase.auth.getSession()
if (!session && isProtected(path)) return NextResponse.redirect(new URL('/login', req.url))
```

**Middleware is not authorisation.** It runs on the edge and can be bypassed; it
exists to keep unauthenticated users out of pages, not to protect data. Data is
protected by RLS, which is in the database and cannot be skipped by a client.

---

## 4. Team page

`POST {SUPABASE_URL}/functions/v1/agentport-team` with the session JWT.
The function already enforces owner/admin/viewer asymmetry and refuses
self-escalation, so **the UI hides what the function refuses** — it does not
decide who may do what.

| Action | Who | Notes |
| --- | --- | --- |
| `list` | any member | Returns `user_id`, `role`, `created_at`. **No email addresses** — deliberate |
| `invite` | owner, admin | Address must already have an account. Admin cannot invite an owner |
| `set_role` | owner, admin | Owner-only for anything involving `owner` |
| `remove` | owner, admin | Owner-only to remove an owner |

Every refusal returns a coarse reason (`forbidden`, `not_added`, `last_owner`).
**Do not map these to "this person has no account" in the UI** — the coarseness
is the point; a distinct message is an account-existence oracle.

`last_owner` (409) is a real business rule, so *that* one deserves a plain
sentence: "A company must keep at least one owner."

---

## 5. Responsiveness

There is no design system in the repo. The minimum that is not embarrassing:

- **Breakpoints** — 375 (phone), 768 (tablet), 1280 (desktop). Test 375 first; it is where a data table breaks worst.
- **Tables** — every analytics view is tabular. Below 768px each row becomes a stacked card: capability name on top, counts as labelled pairs. Do **not** horizontal-scroll a 6-column table on a phone and call it done.
- **`/capabilities`, `/rules`** — single-column form on mobile, two-column on desktop.
- **Nav** — collapses to a sheet. Six routes plus `/team` will not fit a top bar at 375px.
- **Tap targets** — 44px minimum. A `viewer`-only user is often on a phone.
- **`prefers-reduced-motion`** — honour it; the status transitions are the only motion in the app and they are decorative.
- **The three honest states must survive a narrow screen.** `unknown` is the state most likely to get dropped in a mobile redesign, and dropping it is how a dead runtime renders as healthy.

Run `npm run build` and check for horizontal overflow at 375px. There is no
screenshot gate in CI, so this is a manual step until one exists.

---

## 6. Environment

`.env.local` already has what is needed. Two rules:

- **`SUPABASE_SERVICE_ROLE_KEY` must never be `NEXT_PUBLIC_`.** `next.config.mjs`
  fails the build if one is. Do not work around that check.
- **`NEXT_PUBLIC_AGENTPORT_BASE_URL` is currently misused.** `lib/agentport.ts`
  passes it into `new AgentPort({ baseUrl })`, and `manifest()` publishes that as
  the **agent-facing runtime endpoint** — so the manifest tells every external
  assistant to send execution requests to this dashboard. Split it:

  ```ts
  // WRONG — publishes the dashboard as the agent's runtime endpoint
  new AgentPort({ baseUrl: process.env.NEXT_PUBLIC_AGENTPORT_BASE_URL! })

  // RIGHT — the merchant's own runtime, and where we host the dashboard
  new AgentPort({ baseUrl: merchantRuntimeUrl })   // e.g. https://api.acme.test
  dashboardOrigin = process.env.NEXT_PUBLIC_AGENTPORT_BASE_URL!
  ```

---

## 7. What is still not built

**Blocked on the backend (not UI work):**

- `/ledger` and `/approvals` — no durable read model for decisions. The data is in the merchant's local ledger and their webhook projection, not in a queryable table yet.
- The **config artifact channel** — the runtime has no way to fetch policy. Nothing works end-to-end until it exists.
- GitHub App install flow (branch → PR → merge as the signature).

**Genuinely UI work, not blocked:**
- Responsive pass (§5) — **done**: nav collapses to a disclosure under 768px,
  ledger + policies tables render as labelled cards on phones, 44px targets on
  coarse pointers, `prefers-reduced-motion` kills transitions.
- Empty, loading, and error states — **partial**: connect/golive/test flows
  carry all three; the three draft editors now surface load failures instead
  of silently defaulting. Tables still assume seeded rows.
- `/team` page — **not built**.
- Delete `app/api/analytics`, `app/api/config`, and `lib/store.ts` — **not built**,
  correctly: the RAM store is the only backend until Supabase reads land.
- Fix the `baseUrl` conflation (§6) — **done at the manifest route** (see TASKS 12.5.2).

**Decided NOT to build:**

- Merchant revenue on the dashboard. Amounts live in their ledger.
- Full-fidelity logs in our database.
- An approval gate on policy changes. The merchant is the sole authority over their own money; **Sync is the act of publishing.**

---

## 8. Definition of done for the dashboard

1. No `new Map()` behind any rendered surface, and `lib/store.ts` deleted.
2. No `NEXT_PUBLIC_` service-role key; the build check still passes.
3. No route under `app/api/` relays ingest or reads analytics from RAM.
4. Every table renders `unknown` before its first real push, and no surface shows a healthy runtime it cannot reach.
5. A `viewer` sees read-only pages and cannot reach a mutating route.
6. Works at 375px with no horizontal overflow.
7. `npm run build` and `npm run lint` clean.
