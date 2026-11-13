'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { SESSION_SCOPES, SESSION_SCOPE_LABELS, type SessionScope } from '@/lib/identity-settings'

type Identity = {
  verifyUrl: string | null
  jwksUrl: string | null
  issuer: string | null
  audience: string | null
  defaultScope: string
  userScopes: Record<string, string>
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * User sessions: who may act for a merchant's end users, and with what ceiling.
 *
 * The page never decides authority. It sends configuration to the RPC through
 * /api/identity (owner/admin only, role from the session) and renders what the
 * governor will enforce on its next reload. The verifier still has to name the
 * user; this screen only chooses the ceiling once it does.
 */
export default function IdentityPage() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [verifyUrl, setVerifyUrl] = useState('')
  const [jwksUrl, setJwksUrl] = useState('')
  const [issuer, setIssuer] = useState('')
  const [audience, setAudience] = useState('')
  const [defaultScope, setDefaultScope] = useState<SessionScope>('read')
  const [overrideUser, setOverrideUser] = useState('')
  const [overrideScope, setOverrideScope] = useState<SessionScope>('read')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/identity', { cache: 'no-store' })
      const body = (await res.json()) as {
        status?: string
        reason?: string
        identity?: Identity | null
        canEdit?: boolean
      }
      if (!res.ok || body.status !== 'ok') {
        throw new Error(body.reason ?? `Request refused (${res.status}).`)
      }
      const current = body.identity ?? null
      setIdentity(current)
      setCanEdit(body.canEdit === true)
      setVerifyUrl(current?.verifyUrl ?? '')
      setJwksUrl(current?.jwksUrl ?? '')
      setIssuer(current?.issuer ?? '')
      setAudience(current?.audience ?? '')
      setDefaultScope(
        current && SESSION_SCOPES.includes(current.defaultScope as SessionScope)
          ? (current.defaultScope as SessionScope)
          : 'read',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the identity configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const write = useCallback(
    async (payload: Record<string, unknown>, success: string) => {
      setBusy(true)
      setMsg(null)
      setErr(null)
      try {
        const res = await fetch('/api/identity', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = (await res.json()) as { status?: string; reason?: string }
        if (!res.ok || body.status !== 'ok') {
          throw new Error(body.reason ?? `Request refused (${res.status}).`)
        }
        setMsg(success)
        await load()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Refused.')
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const saveIdentity = () =>
    write(
      {
        action: 'set_identity',
        verifyUrl,
        jwksUrl,
        issuer,
        audience,
        defaultScope,
      },
      'Saved. Live sessions end when the governor reloads this config, then new sessions use the new ceiling.',
    )

  const addOverride = () =>
    write(
      { action: 'set_user_scope', userId: overrideUser, scope: overrideScope },
      'Saved the per-user ceiling.',
    )

  const removeOverride = (userId: string) =>
    write({ action: 'clear_user_scope', userId }, 'Removed the per-user ceiling.')

  // A stored identity row is not the same as a working verifier: the governor
  // does not yet verify JWKS-only sources, so only a verify URL opens sessions.
  const configured = identity !== null && Boolean(identity.verifyUrl)
  const overrides = Object.entries(identity?.userScopes ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User sessions"
        title="Acting for a merchant's end users"
        description="Your agent can act for a signed-in user only after your own login vouches for them. This screen chooses the ceiling that user gets. The verifier proves who they are; it does not decide what they may do."
      />

      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">Status</p>
            <p className="mt-1 text-[13px] text-bone-dim">
              {loading
                ? 'Loading…'
                : configured
                  ? 'User sessions are configured for this business.'
                  : 'No identity source is configured. The governor refuses every session request.'}
            </p>
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
              configured ? 'text-verdant' : 'text-amber'
            }`}
          >
            {configured ? 'Configured' : 'Closed'}
          </span>
        </div>
        {identity?.updatedAt ? (
          <p className="mt-3 font-mono text-[11px] text-bone-faint">
            Last changed {new Date(identity.updatedAt).toLocaleString()}
            {identity.updatedBy ? ` by ${identity.updatedBy.slice(0, 8)}…` : ''}
          </p>
        ) : null}
      </div>

      <div className="panel space-y-4 p-6">
        <div>
          <p className="label">Identity source</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            The public endpoint the governor calls to turn a user token into a subject. Use your
            existing login&apos;s verify endpoint. Changes reload the governor.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="field-label">Verify URL</span>
            <input
              className="input"
              value={verifyUrl}
              onChange={(e) => setVerifyUrl(e.target.value)}
              placeholder="https://your-site.com/functions/v1/agent-identity"
              disabled={!canEdit || busy}
              inputMode="url"
            />
          </label>
          <label className="space-y-1.5">
            <span className="field-label">JWKS URL</span>
            <input
              className="input"
              value={jwksUrl}
              onChange={(e) => setJwksUrl(e.target.value)}
              placeholder="https://your-site.com/.well-known/jwks.json"
              disabled={!canEdit || busy}
              inputMode="url"
            />
            <span className="block text-[11px] text-bone-faint">
              Stored for key-based verification, but the governor does not verify JWKS-only
              sources yet. Set a verify URL for working sessions.
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Issuer (optional)</span>
            <input
              className="input"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="https://your-site.com/auth/v1"
              disabled={!canEdit || busy}
            />
          </label>
          <label className="space-y-1.5">
            <span className="field-label">Audience (optional)</span>
            <input
              className="input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="authenticated"
              disabled={!canEdit || busy}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="field-label">Default session ceiling</span>
          <select
            className="input md:w-96"
            value={defaultScope}
            onChange={(e) => setDefaultScope(e.target.value as SessionScope)}
            disabled={!canEdit || busy}
          >
            {SESSION_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {SESSION_SCOPE_LABELS[scope]}
              </option>
            ))}
          </select>
          <span className="block text-[12px] text-bone-faint">
            Applies to any verified user without an override. Least privilege is read.
          </span>
        </label>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={saveIdentity}>
              {busy ? 'Saving…' : 'Save identity settings'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                write(
                  { action: 'set_identity' },
                  'Identity source cleared. Sessions are closed until you configure one again.',
                )
              }
            >
              Close sessions
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-bone-faint">Only the owner or an admin can change this.</p>
        )}
      </div>

      <div className="panel space-y-4 p-6">
        <div>
          <p className="label">Per-user ceilings</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            Optional. Overrides the default for one subject. The verifier&apos;s own scope can only
            narrow this, never widen it. Use the user id your verify endpoint returns (for Supabase,
            the auth user id).
          </p>
        </div>

        {overrides.length === 0 ? (
          <p className="text-[13px] text-bone-faint">No overrides — everyone uses the default.</p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {overrides.map(([userId, scope]) => (
              <li
                key={userId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0"
              >
                <span className="font-mono text-[12px] text-bone" title={userId}>
                  {userId}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-bone-faint">{scope}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => removeOverride(userId)}
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="min-w-64 flex-1 border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant"
              value={overrideUser}
              onChange={(e) => setOverrideUser(e.target.value)}
              placeholder="user id from the verifier"
              disabled={busy}
              aria-label="User id"
            />
            <select
              className="input w-auto"
              value={overrideScope}
              onChange={(e) => setOverrideScope(e.target.value as SessionScope)}
              disabled={busy}
              aria-label="Override scope"
            >
              {SESSION_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || overrideUser.trim().length === 0}
              onClick={addOverride}
            >
              {busy ? 'Saving…' : 'Add override'}
            </button>
          </div>
        ) : null}

        {msg ? (
          <p className="text-[13px] text-bone" role="status">
            {msg}
          </p>
        ) : null}
        {err ? (
          <p className="text-[13px] text-rust" role="alert">
            {err}
          </p>
        ) : null}
      </div>

      <div className="panel p-5">
        <p className="label">How the ceiling composes</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-bone-dim">
          <li>The verifier names the user. No user, no session.</li>
          <li>The per-user override, or the default, sets the base ceiling.</li>
          <li>If the verifier also returns a scope, the narrower of the two wins.</li>
          <li>The capability&apos;s own access and the agent&apos;s request narrow it again.</li>
        </ol>
        <p className="mt-3 text-[12px] text-bone-faint">
          The ledger records the represented user and the enforced scope on every allow and denial.
          Sessions last 15 minutes; a config change reloads the governor and ends live sessions.
        </p>
      </div>
    </div>
  )
}
