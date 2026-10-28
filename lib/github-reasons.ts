/**
 * Callback reasons are machine strings; the merchant reads a sentence.
 *
 * Kept pure and shared so the dashboard and the legacy /connect diagnostics
 * never disagree about what GitHub just did.
 */
export function githubReasonText(reason: string): string {
  if (reason.startsWith('oauth-')) return `The sign-in step failed (${reason.slice('oauth-'.length)}). Nothing was linked.`
  if (reason === 'missing-installation') return 'GitHub did not report an installation. It may have been cancelled halfway.'
  if (reason === 'sign-in-required')
    return 'You were not signed in here when GitHub returned, so nothing was linked. Sign in first, then install again.'
  if (reason === 'installation-unverified')
    return 'GitHub named an installation we could not verify — it may have been removed, or our App key is stale. Nothing was linked.'
  if (reason === 'installation-unknown')
    return 'That installation does not exist or was removed — nothing was linked. Install the App on the repo, then return here.'
  if (reason === 'installation-key')
    return 'Our GitHub App credential was refused — nothing was linked. This is our side: report it and we will rotate the App key.'
  if (reason === 'installation-key-missing')
    return 'Our GitHub App ID or private key is empty on the server — nothing was linked. This is our side: report it.'
  if (reason === 'installation-key-parse')
    return 'Our GitHub App private key does not parse — it was likely truncated or altered on paste. Nothing was linked. This is our side: report it and we will re-paste the key.'
  if (reason === 'installation-key-auth')
    return 'GitHub rejected our App credential — the key does not match the App ID, or the key was rotated away. Nothing was linked. This is our side: report it.'
  if (reason === 'install-incomplete')
    return 'GitHub authorized you but named no installation of this App yet — finish the install step on GitHub with the same account, then return here. Nothing was linked.'
  if (reason === 'installation-ambiguous')
    return 'GitHub authorized more than one installation of this App for your account. Start again from Connect a GitHub repo and name the repo you want. Nothing was linked.'
  if (reason === 'install-use-dashboard')
    return 'That install came back without proof of ownership. Start again from Connect a GitHub repo on the dashboard; nothing was linked.'
  if (reason === 'GitHub organization admin required')
    return 'That installation belongs to an organization you do not administer. Ask an organization owner to install it, then return here. Nothing was linked.'
  if (reason === 'installation belongs to another GitHub account')
    return 'That installation belongs to a different GitHub account. Sign in with the account that installed it, then retry. Nothing was linked.'
  if (reason === 'could not verify GitHub organization ownership')
    return 'We could not verify that you administer that GitHub organization. An organization owner must install the App, or grant the App Members read access. Nothing was linked.'
  if (reason === 'install-state-invalid')
    return 'That install link expired or was already used — start again from Connect a GitHub repo. Nothing was linked.'
  if (reason === 'install-state-session')
    return 'That install link belongs to a different signed-in session — start again from Connect a GitHub repo. Nothing was linked.'
  if (reason === 'installation-id-invalid')
    return 'GitHub returned an installation id we cannot read. Start again from Connect a GitHub repo. Nothing was linked.'
  if (reason === 'install-state-missing')
    return 'That arrival carried no install link — installs must start from the Connect a GitHub repo button below (not from GitHub directly), so the return can be tied to your business. Nothing was linked.'
  if (reason === 'installation-attached')
    return 'That installation is already linked to a different business — nothing was changed. Disconnect it there first if it should move.'
  if (reason === 'install-record')
    return 'Could not record the installation — nothing was linked. Try again; if it persists, report it.'
  if (reason === 'install-start')
    return 'Could not start installation — confirm you are signed in as owner or admin, then retry. Nothing was linked.'
  if (reason === 'oauth-unconfigured') return 'Our side is not ready to receive the sign-in yet.'
  if (reason === 'broker-unreachable')
    return 'Our GitHub service did not answer — nothing was linked. Try again in a moment; if it persists, report it.'
  return `Something interrupted the install (${reason}). Nothing was linked.`
}
