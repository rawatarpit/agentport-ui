'use client'

import { useCallback, useEffect, useState } from 'react'

type Installation = { installationId: number; accountLogin: string; receivedAt: string }
type Repo = { id: number; fullName: string; defaultBranch: string; private: boolean }
type PrLive = { state: 'open' | 'merged' | 'closed'; merged: boolean; checks: string; url: string; repo: string; number: number } | null

const INSTALL_URL = 'https://github.com/apps/agentport-installer/installations/new'

/**
 * GitHub onboarding, end to end: install → pick repo → open PR → watch it.
 *
 * Each step renders what the server can prove. No App credentials: the exact
 * shopping list, no button that cannot work. Installed but no repo picked:
 * the picker. PR opened: live branch, CI rollup, merge state, and the link —
 * refreshed on demand, never implied. The merge stays the merchant's.
 */
export function GithubPanel() {
  const [installations, setInstallations] = useState<Installation[] | null>(null)
  const [installationId, setInstallationId] = useState<number | null>(null)
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [repo, setRepo] = useState('')
  const [pr, setPr] = useState<PrLive | 'missing' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadInstallations = useCallback(async () => {
    try {
      const res = await fetch('/api/github/installations')
      const body = await res.json()
      if (body.status !== 'ok') throw new Error('Could not read installations.')
      setInstallations(body.installations)
      if (body.installations.length === 1) setInstallationId(body.installations[0].installationId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read installations.')
    }
  }, [])

  const loadRepos = useCallback(async (id: number) => {
    setRepos(null)
    try {
      const res = await fetch(`/api/github/repos?installation=${id}`)
      const body = await res.json()
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Could not list repositories.')
      setRepos(body.repos)
      if (body.repos.length === 1) setRepo(body.repos[0].fullName)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not list repositories.')
    }
  }, [])

  const loadPr = useCallback(async (name?: string) => {
    try {
      const res = await fetch(`/api/github/pr${name ? `?repo=${encodeURIComponent(name)}` : ''}`)
      const body = await res.json()
      if (body.status !== 'ok' || !body.pr || body.pr.state === 'none') {
        setPr('missing')
        return
      }
      setPr(body.pr)
    } catch {
      setPr('missing')
    }
  }, [])

  useEffect(() => {
    void loadInstallations()
    void loadPr()
  }, [loadInstallations, loadPr])

  useEffect(() => {
    if (installationId !== null) void loadRepos(installationId)
  }, [installationId, loadRepos])

  const openPr = async () => {
    if (installationId === null || !repo) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/github/pr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId, repo }),
      })
      const body = await res.json()
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Could not open the pull request.')
      await loadPr(repo)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the pull request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">GitHub — website repo delivery</p>
        {pr && pr !== 'missing' ? (
          <a href={pr.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-verdant underline underline-offset-4">
            PR #{pr.number} · {pr.state}{pr.state === 'open' ? ` · checks ${pr.checks}` : ''}
          </a>
        ) : (
          <span className="font-mono text-[11px] text-bone-faint">no pull request yet</span>
        )}
      </div>

      {!installations ? (
        <p className="text-[13px] text-bone-faint">Reading installations…</p>
      ) : installations.length === 0 ? (
        <>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            Install the App on the website repo — two clicks, you pick the repo,
            we never see your password. Until then there is nothing to show, and
            this screen will not pretend otherwise.
          </p>
          <a href={INSTALL_URL} target="_blank" rel="noreferrer" className="btn btn-primary">
            Install the GitHub App
          </a>
          <p className="font-mono text-[11px] text-bone-faint">
            after installing you land back here — press check again
          </p>
          <button type="button" className="btn" onClick={() => void loadInstallations()}>
            Check again
          </button>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="gh-install">Installation</label>
              <select
                id="gh-install"
                className="input"
                value={installationId ?? ''}
                onChange={(e) => setInstallationId(Number(e.target.value))}
              >
                <option value="" disabled>Choose…</option>
                {installations.map((i) => (
                  <option key={i.installationId} value={i.installationId}>
                    {i.accountLogin || `installation ${i.installationId}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="gh-repo">Repository</label>
              <select
                id="gh-repo"
                className="input"
                value={repo}
                disabled={!repos}
                onChange={(e) => setRepo(e.target.value)}
              >
                <option value="" disabled>{repos ? 'Choose…' : 'Pick an installation first'}</option>
                {(repos ?? []).map((r) => (
                  <option key={r.id} value={r.fullName}>
                    {r.fullName}{r.private ? ' (private)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy || installationId === null || !repo} onClick={openPr}>
              {busy ? 'Opening…' : pr && pr !== 'missing' ? 'Update the pull request' : 'Open the pull request'}
            </button>
            <span className="font-mono text-[11px] text-bone-faint">branch agentport/install — re-running updates, never duplicates</span>
          </div>
        </>
      )}

      {err ? <p className="text-[13px] text-rust" role="alert">{err}</p> : null}
      <p className="text-[12px] leading-relaxed text-bone-faint">
        You merge. That merge is your signature — nothing here can merge for you,
        and review happens in your repo under protections you already own.
      </p>
    </div>
  )
}
