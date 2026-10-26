'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type WorkspaceChoice = {
  tenantId: string
  role: string
  displayName: string | null
}

/**
 * The explicit tenant decision. Nothing is preselected: the server refuses to
 * guess between memberships, so the picker asks once and writes the choice to
 * an httpOnly cookie through the same server-side membership check.
 */
export function WorkspacePicker({
  workspaces,
  activeTenantId,
  notice,
  nextPath = '/',
}: {
  workspaces: WorkspaceChoice[]
  activeTenantId: string | null
  notice: string | null
  nextPath?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const choose = async (tenantId: string) => {
    setBusy(tenantId)
    setErr(null)
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (!res.ok || body.status !== 'ok') throw new Error(body.reason ?? 'Could not select that workspace.')
      router.push(nextPath)
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not select that workspace.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-[13px] leading-relaxed text-bone" role="status">
          {notice}
        </p>
      ) : null}

      <ul className="space-y-2">
        {workspaces.map((w) => {
          const selected = w.tenantId === activeTenantId
          return (
            <li key={w.tenantId}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                  selected ? 'border-verdant/60 bg-verdant/10' : 'border-ink-line hover:border-verdant/50'
                }`}
                disabled={busy !== null}
                onClick={() => void choose(w.tenantId)}
                aria-pressed={selected}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-bone">
                    {w.displayName ?? w.tenantId}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-bone-faint">
                    {w.role} · {w.tenantId.slice(0, 8)}…
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-bone-faint">
                  {busy === w.tenantId ? 'Selecting…' : selected ? 'Current' : 'Use this'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {err ? (
        <p className="rounded-md border border-rust/40 bg-rust/10 px-3 py-2 text-[13px] leading-relaxed text-bone" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}
