# AgentPort Console

The merchant-facing dashboard for AgentPort: what external AI agents may do to
a business, what they have done, what is waiting on a human, and how to change
those rules without writing code.

**This repository authors and displays; it does not enforce.** Rules authored
here are compiled into the hosted governor's configuration. The merchant's
installed package is a discovery entry point only: it carries no policy engine,
evaluates no rule, and decides nothing. Every screen reports exactly what its
stored rows can prove — a business with no live governor heartbeat reads
`unknown`, never a healthy zero.

See [`DISCOVERY.md`](DISCOVERY.md) for the normative install and discovery
model.

## How it fits together

| | Authors policy | Decides calls | Runs in |
| --- | --- | --- | --- |
| **Hosted governor** (Rust) | no | **yes, synchronously** | Agent Port's infrastructure |
| **This console** | yes | **never** | our infrastructure |
| **Merchant install** | no | **never** | the merchant's website; discovery files only |
| **Supabase** | no | no | the database — RLS is the tenant-isolation control |

Screens: setup, capabilities (drafts), rules, policies, ledger, approvals
(visible here, decided in the CLI), analytics, and connect.

## Stack

- Next.js 14 (App Router), React 18, TypeScript strict, Tailwind
- Supabase (`@supabase/ssr`) — reads are server-side or RLS-scoped; a
  `service_role` key never reaches the browser, and the build fails if a
  `NEXT_PUBLIC_` name would inline one
- Vitest for unit tests
- No runtime SDK dependency: the console carries data-contract types
  (`lib/contracts.ts`) and a configuration compiler (`lib/golive.ts`), never
  the enforcement engine

## Running locally

Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # fill in your own values
npm run dev
```

### Environment

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public project identifiers; rows are protected by RLS |
| `AGENTPORT_SIGNING_SECRET` | server-only HMAC key for agent credentials |
| `AGENTPORT_WORKER_URL` | server-only origin of the hosted Rust governor; required by the install package |
| `GITHUB_APP_ID`, `GITHUB_CLIENT_ID` | public GitHub App identifiers |
| `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | server-only; never `NEXT_PUBLIC_` |

A server-only value must never carry a `NEXT_PUBLIC_` prefix — `next.config.mjs`
fails the production build if it does.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests |
| `npm run lint` | ESLint |

## Deploy

Netlify builds `npm run build` from `main` and publishes `.next`; settings
live in `netlify.toml`. Secrets belong in the site's environment settings,
never in the repository.

## Design rules this codebase holds to

- **Unknown, never green** — a display with no data reads `unknown`, not `0`.
- **Draft ≠ live** — nothing is shown as deployed until the hosted governor
  proves it and the site serves the discovery files.
- **RLS is the control; the app is convenience.**
- **Approvals are visible here, decided elsewhere.**
- **The refusal is the product** — an assistant that refuses honestly beats
  one that completes an action it was never authorized to take.
