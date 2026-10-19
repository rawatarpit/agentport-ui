# AgentPort Console

The merchant-facing dashboard for AgentPort: what external AI agents may do to
a business, what they have done, what is waiting on a human, and how to change
those rules without writing code.

**This repository displays; it does not enforce.** Rules authored here are
compiled to a signed configuration artifact that the merchant's own runtime
verifies and enforces locally. Every screen reports exactly what its stored
rows can prove — a business with no push reads `unknown`, never a healthy
zero.

## How it fits together

| | Authors policy | Decides calls | Runs in |
| --- | --- | --- | --- |
| **Runtime** (AgentPort SDK) | no | **yes, synchronously** | the merchant's own app |
| **This console** | yes | **never** | our infrastructure |
| **Supabase** | no | no | the database — RLS is the tenant-isolation control |

Screens: setup, capabilities (drafts), rules, policies, ledger, approvals
(visible here, decided in the CLI), analytics, connect, and a governed chat
demo. Two routes serve agents, not humans: the discovery manifest at
`/.well-known/agent.json` and the invoke endpoint at
`/.well-known/agent/invoke`.

## Stack

- Next.js 14 (App Router), React 18, TypeScript strict, Tailwind
- Supabase (`@supabase/ssr`) — reads are server-side or RLS-scoped; a
  `service_role` key never reaches the browser, and the build fails if a
  `NEXT_PUBLIC_` name would inline one
- Vitest for unit tests
- The runtime SDK (`@agentport/sdk`) is consumed as a local `file:`
  dependency — the prebuilt snapshot must be present at `vendor/agentport-sdk`
  before running `npm install`

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
- **Draft ≠ live** — nothing is shown as deployed until the runtime proves it.
- **RLS is the control; the app is convenience.**
- **Approvals are visible here, decided elsewhere.**
- **The refusal is the product** — an assistant that refuses honestly beats
  one that completes an action it was never authorized to take.
