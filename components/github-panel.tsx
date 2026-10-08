'use client'

import { useCallback, useEffect, useState } from 'react'

type Installation = { installationId: number; accountLogin: string; receivedAt: string }
type Repo = { id: number; fullName: string; defaultBranch: string; private: boolean }
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
  const [picked, setPicked] = useState<string[]>([])
  const [opened, setOpened] = useState<Array<{ repo: string; url: string; number: number }>>([])
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
    setPicked([])
    try {
      const res = await fetch(`/api/github/repos?installation=${id}`)
      const body = await res.json()
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Could not list repositories.')
      setRepos(body.repos)
      if (body.repos.length === 1) setPicked([body.repos[0].fullName])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not list repositories.')
    }
  }, [])



  useEffect(() => {
    void loadInstallations()
  }, [loadInstallations])

  useEffect(() => {
    if (installationId !== null) void loadRepos(installationId)
  }, [installationId, loadRepos])

  const toggle = (fullName: string) =>
    setPicked((p) => (p.includes(fullName) ? p.filter((r) => r !== fullName) : [...p, fullName]))

  const openPrs = async () => {
    if (installationId === null || picked.length === 0) return
    setBusy(true)
    setErr(null)
    setOpened([])
    try {
      const done: Array<{ repo: string; url: string; number: number }> = []
      for (const repo of picked) {
        const res = await fetch('/api/github/pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ installationId, repo }),
        })
        const body = await res.json()
        if (body.status !== 'ok') throw new Error(`${repo}: ${body.reason ?? 'could not open the pull request.'}`)
        done.push({ repo, url: body.pr.url, number: body.pr.number })
        setOpened([...done])
      }
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
        {opened.length > 0 ? (
          <span className="font-mono text-[11px] text-verdant">
            {opened.length} pull request{opened.length === 1 ? '' : 's'} opened
          </span>
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
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="gh-install">Installed on</label>
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
              <p className="field-label">Repositories</p>
              {!repos ? (
                <p className="text-[13px] text-bone-faint">Pick an installation first.</p>
              ) : repos.length === 0 ? (
                <p className="text-[13px] text-bone-dim">No repositories on this installation — add some in the App settings, then check again.</p>
              ) : (
                <ul className="space-y-1.5">
                  {repos.map((r) => (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-3 text-[13px]">
                        <input
                          type="checkbox"
                          checked={picked.includes(r.fullName)}
                          onChange={() => toggle(r.fullName)}
                          aria-label={`Select ${r.fullName}`}
                        />
                        <span className="font-mono text-bone">{r.fullName}</span>
                        <span className="text-[12px] text-bone-faint">
                          {r.private ? 'private' : 'public'} · {r.defaultBranch}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy || installationId === null || picked.length === 0} onClick={openPrs}>
              {busy ? 'Opening…' : `Open install PR${picked.length > 1 ? `s (${picked.length})` : ''}`}
            </button>
            {picked.length === 0 && (repos?.length ?? 0) > 0 ? (
              <span className="font-mono text-[11px] text-bone-faint">pick at least one repo — the button stays off until then</span>
            ) : (
              <span className="font-mono text-[11px] text-bone-faint">one PR per repo · re-running updates, never duplicates</span>
            )}
          </div>
          {opened.length > 0 ? (
            <ul className="space-y-1.5">
              {opened.map((o) => (
                <li key={o.repo} className="text-[13px]">
                  <span className="font-mono text-[12px] text-bone">{o.repo}</span>
                  {' → '}
                  <a href={o.url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-verdant underline underline-offset-4">
                    PR #{o.number}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
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
