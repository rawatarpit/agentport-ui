# GitHub App setup — fill this in as you go

Create at: `https://github.com/settings/apps/new`
Guide: [`github-app-manifest.json`](./github-app-manifest.json) (same values, machine-readable)

Convention: lines starting with `>` are recommendations. Replace the
`__BLANKS__` with your values. Nothing here is secret — secrets are generated
by GitHub during creation and go straight into env vars, never into this file.

---

## 1. Identity

- **App name:** `__agentport-installer__`
  > Names are global. If taken, use `agentport-installer-rawatarpit`.
  > Lowercase, hyphens, no spaces either way.

- **Description:** (markdown supported — suggested copy below, edit freely)
  ```markdown
  Installs the AgentPort runtime wiring into your website repo.

  Opens branch `agentport/install` with the agent snippet, CLI config, and
  runtime hooks, then opens a pull request your CI checks and you review.
  **Your merge is the signature** — nothing is live until you approve it.

  Requests minimum scopes: repository contents and pull requests (write, to
  open the branch and PR), checks and metadata (read-only, to mirror CI
  status). It cannot read secrets, run workflows, or touch anything outside
  the repositories you select at install.
  ```

- **Homepage URL:** `__https://agentport.relayforge.in__`
  > Your deployed dashboard origin. Editable after creation — use a URL you
  > control for now if the UI isn't deployed yet. Never `localhost`.

## 2. Authorizing users

- **Redirect URI:** `https://agentport.relayforge.in/api/github/callback`
  > Must match this path exactly — it is what the callback route implements.
  > Keep the domain identical to §1.

- [ ] **Request user authorization (OAuth) during installation:** CHECKED
  > We need the installer's identity to link the installation to their tenant.

- [ ] **Expire user authorization tokens:** CHECKED
  > Refresh-token hygiene, free.

- [ ] **Allow wildcard matching:** UNCHECKED

- [ ] **Enable Device Flow:** UNCHECKED

## 3. Post installation

- **Setup URL:** `https://agentport.relayforge.in/connect?github=installed`
  > Lands the merchant back in onboarding after install.

- [ ] **Redirect on update:** UNCHECKED

## 4. Webhook

- [ ] **Active:** CHECKED

- **Webhook URL:** `https://agentport.relayforge.in/api/github/webhook`
  > Must be HTTPS and publicly reachable, or deliveries fail silently.

- **Secret:** click **Generate** at creation.
  > Goes straight to `GITHUB_WEBHOOK_SECRET`. Never into this file.

## 5. Permissions (minimum — leave everything else on No access)

| Area | Value |
|---|---|
| Repository → Contents | **Read & write** |
| Repository → Pull requests | **Read & write** |
| Repository → Checks | **Read-only** |
| Repository → Metadata | Read-only (mandatory) |
| Everything else (Secrets, Actions, Administration, …) | **No access** |

## 6. Events

Subscribe to exactly these four:

- [ ] `installation`
- [ ] `installation_repositories`
- [ ] `pull_request`
- [ ] `check_run`

## 7. Install target

- [ ] **Any account**
  > "Only on this account" makes it uninstallable by every merchant.
  > This allows installation, not marketplace listing (separate step).

---

## 8. After creation — collect these five (server-side only)

| # | Value | Goes to |
|---|---|---|
| 1 | App ID (top of the App settings page): `__` | `GITHUB_APP_ID` |
| 2 | Private key (Generate → downloads a `.pem` **once**): `__filename__` | `GITHUB_APP_PRIVATE_KEY` (file contents) |
| 3 | Webhook secret (from §4): `__` | `GITHUB_WEBHOOK_SECRET` |
| 4 | Client ID (App settings page, shown after creation): `__` | `GITHUB_CLIENT_ID` |
| 5 | Client secret (Generate on the App settings page): `__` | `GITHUB_CLIENT_SECRET` |

4–5 are the OAuth pair for the install callback (§2). They surfaced during
implementation — the original three-credential list could not complete the
user-authorisation exchange. Never `NEXT_PUBLIC_`-prefixed — the build guard
in `next.config.mjs` fails the build if any of these would inline into
browser JavaScript. That failure is the control working.

---

## 9. Engineering status

Built 2026-10-06 against env vars (no credentials needed to merge):
`lib/github.ts` (webhook HMAC verify, App JWT mint, OAuth exchange,
installation-token mint — no Octokit dependency, by design),
`/api/github/webhook` (verify-before-read, unknown events acked never
errored), `/api/github/callback` (code exchange once, installer login
kept, user token dropped never stored), `/api/github` state (all five
credentials reported). Tests: `lib/github.test.ts`, 5 passing
(`npm test` = `vitest run`). Typecheck + build clean.

Still yours: the App itself (§1–§7 above), the five env vars (§8), and
then `agentport/install` branch + PR automation — the layer above the
installation token this ships.
