'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Member = { user_id: string; role: string; created_at: string }

/**
 * FRONTEND.md §4 — the team page.
 *
 * Calls `agentport-team` with the session JWT; the function enforces
 * owner/admin/viewer asymmetry and refuses self-escalation, so this UI hides
 * what the function refuses — it never decides who may do what. Refusals
 * stay coarse (`forbidden`, `last_owner`): mapping them to "no such account"
 * would build an account-existence oracle, so the one plain sentence allowed
 * is the last-owner rule, which is a business rule, not a lookup.
 */
export default function TeamPage() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Invites the function accepted this visit. The member list only shows
  // people already in; this shows the ones on their way — invited, waiting
  // for them to sign in and appear above. Cleared on reload, honestly so:
  // a session list, not a record.
  const [invited, setInvited] = useState<Array<{ email: string; role: string }>>([])

  const call = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) throw new Error('Signed out — sign in again.')
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agentport-team`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...extra }),
    })
    const body = (await res.json()) as { ok?: boolean; reason?: string; members?: Member[] }
    if (!res.ok || body.ok !== true) throw new Error(body.reason ?? `Request refused (${res.status}).`)
    return body
  }, [])

  const load = useCallback(async () => {
    try {
      const body = await call('list')
      setMembers(body.members ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the team.')
    }
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await call(action, extra)
      if (action === 'invite') {
        setMsg(`Invited ${extra.email} as ${extra.role}. They need an account first — addresses without one stay unadded, and we do not say which.`)
        setInvited((list) =>
          list.some((i) => i.email === extra.email) ? list : [...list, { email: extra.email ?? '', role: extra.role ?? 'viewer' }],
        )
      } else setMsg('Done.')
      setEmail('')
      await load()
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Refused.'
      setErr(reason === 'last_owner' ? 'A company must keep at least one owner.' : reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Team</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Who else can do this</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Owners manage everything; admins can invite people; viewers can only
          look. Nobody can give themselves a bigger role, and the last owner
          cannot be removed — this screen shows those refusals plainly, in
          words, instead of hiding the buttons and leaving you guessing.
        </p>
      </div>

      <div className="panel p-5">
        <p className="label">Members</p>
        {!members ? (
          <p className="mt-2 text-[13px] text-bone-faint">Loading…</p>
        ) : members.length === 0 ? (
          <p className="mt-2 text-[13px] text-bone-dim">Just you, so far.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-[13px]">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0">
                <span className="font-mono text-[12px] text-bone" title={m.user_id}>{m.user_id.slice(0, 8)}…</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-bone-faint">{m.role}</span>
                  {m.role !== 'owner' ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => act('remove', { userId: m.user_id })} aria-label={`Remove member ${m.user_id.slice(0, 8)}`}>
                      Remove
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel space-y-4 p-6">
        <p className="label">Invite</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="min-w-64 flex-1 border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant"
            value={email}
            inputMode="email"
            placeholder="teammate@shop.in"
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email to invite"
          />
          <label className="field-label" htmlFor="team-role">Role</label>
          <select
            id="team-role"
            className="input w-auto"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="viewer">Viewer — can only look</option>
            <option value="admin">Admin — can invite people</option>
          </select>
          <button type="button" className="btn btn-primary" disabled={busy || !email} onClick={() => act('invite', { email, role })}>
            {busy ? 'Working…' : 'Invite'}
          </button>
        </div>
        {msg ? <p className="text-[13px] text-bone" role="status">{msg}</p> : null}
        {err ? <p className="text-[13px] text-rust" role="alert">{err}</p> : null}
        {invited.length > 0 ? (
          <ul className="space-y-1.5">
            {invited.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="font-mono text-[12px] text-bone-dim">{i.email}</span>
                <span className="font-mono text-[11px] text-amber">invited as {i.role} — waiting for them to sign in</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
