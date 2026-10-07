# GitHub App — `agentport-installer`

> **No secrets in this file.** App ID and Client ID below are public
> identifiers (shown on the App settings page to anyone who can see the App).
> The private key, client secret, and webhook secret live in exactly two
> places: the owner's machine and the Netlify server environment. If a secret
> ever lands in this repo, rotate it at
> `github.com/settings/apps/agentport-installer` — do not just delete the
> line, git history keeps everything.

## Registration record

| Field | Value |
|---|---|
| App name | `agentport-installer` |
| Owner | `@rawatarpit` |
| App ID | `5225757` |
| Client ID | `Iv23lieMFkAWHSHsWM3w` |
| Homepage URL | `https://agentport.relayforge.in` |
| Callback URL | `https://agentport.relayforge.in/api/github/callback` |
| Setup URL | _(blank — with OAuth-during-install on, GitHub lands on the callback URL)_ |
| Webhook URL | `https://agentport.relayforge.in/api/github/webhook` |
| Webhook | Active, SSL verification on |
| Visibility | Any account |
| Registered | 2026-10-07 |

## Permissions (minimum)

| Area | Setting |
|---|---|
| Repository → Contents | Read & write |
| Repository → Pull requests | Read & write |
| Repository → Checks | Read-only |
| Repository → Metadata | Read-only (mandatory) |
| Everything else | No access |

## Events

`installation`, `installation_repositories` (automatic — not listed as
optional), `pull_request`, `check_run`. Everything else off. Rationale in
`github-app-setup.md` §6.

## Credentials (locations only — values never here)

| # | Env var | Source | Status |
|---|---|---|---|
| 1 | `GITHUB_APP_ID` | Settings page (`5225757`) | _set on Netlify_ |
| 2 | `GITHUB_APP_PRIVATE_KEY` | `.pem` downloaded 2026-10-07, kept at `/Users/arpitrawat/Downloads/agentport-installer.2026-10-07.private-key.pem` (verified valid RSA, 1679 bytes) | _set on Netlify_ |
| 3 | `GITHUB_WEBHOOK_SECRET` | Owner-generated 2026-10-07 | _set on Netlify_ |
| 4 | `GITHUB_CLIENT_ID` | Settings page (`Iv23lieMFkAWHSHsWM3w`) | _set on Netlify_ |
| 5 | `GITHUB_CLIENT_SECRET` | Generated on settings page 2026-10-07 | _set on Netlify_ |

Flip each status when confirmed live. `GET /api/github` reports
`configured: true` only when all five resolve server-side.

## Code that consumes this

- `lib/github.ts` — HMAC verify, App JWT mint, OAuth exchange, installation-token mint
- `app/api/github/webhook/route.ts` — deliveries
- `app/api/github/callback/route.ts` — install landing
- `app/api/github/route.ts` — state (`configured`, `missing`, PR state)
- `lib/github.test.ts` — 5 tests
- `github-app-manifest.json` — registration shape (historical now; the App exists)
- `github-app-setup.md` — the fill-in form used to create it

## Rotation runbook

1. **Webhook secret:** App settings → change secret → update Netlify → redeploy.
   Old deliveries fail closed (401), nothing breaks open.
2. **Client secret:** Generate new → update Netlify. In-flight OAuth codes
   issued against the old one fail exchange and redirect to
   `/connect?github=oauth-bad_verification_code` — safe retry by reinstalling.
3. **Private key:** Generate new → update Netlify → old key dies immediately.
   Installation tokens minted under it expire within the hour regardless.
   Re-download is impossible — new key means new file, same handling.
