'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * GitHub onboarding: install → branch → PR → merge.
 *
 * Renders the delivery flow as a checklist driven by GET /api/github. With
 * no App credentials the panel says what mints each value instead of
 * offering a button that cannot work — the day the credentials land, only
 * the API changes; this screen already knows the shape.
 */
export function GithubPanel() {
  const [state, setState] = useState<{ configured: boolean; missing: string[]; flow: string[] } | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/github')
      const body = await res.json()
      if (body.status !== 'ok') throw new Error()
      setState(body)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">GitHub — website repo delivery</p>
        {!state ? null : state.configured ? (
          <span className="font-mono text-[11px] text-verdant">connected</span>
        ) : (
          <span className="font-mono text-[11px] text-bone-faint">not connected</span>
        )}
      </div>

      {failed ? (
        <p className="text-[13px] text-rust" role="alert">Could not read GitHub state.</p>
      ) : !state ? (
        <p className="text-[13px] text-bone-faint">Reading GitHub state…</p>
      ) : state.configured ? (
        <ol className="space-y-2 text-[13px] leading-relaxed text-bone-dim">
          {state.flow.map((f, i) => (
            <li key={f}> <span className="font-mono text-bone-faint">{i + 1}.</span> {f}</li>
          ))}
        </ol>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            The App lives in your GitHub account and is installed on the website
            repo — that is how the runtime gets in the door. It does not exist
            yet, so here is exactly what creates it:
          </p>
          <ul className="space-y-2 text-[13px] leading-relaxed text-bone-dim">
            {state.missing.map((m) => (
              <li key={m}>· <span className="font-mono text-[12px] text-bone">{m.split(' — ')[0]}</span>
                <span className="text-bone-faint"> — {m.split(' — ')[1]}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => void load()}>
            Check again
          </button>
        </>
      )}
    </div>
  )
}
