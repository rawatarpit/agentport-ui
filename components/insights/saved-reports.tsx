'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Callout } from '@/components/ui/callout'
import { EmptyState } from '@/components/ui/empty-state'
import type { ResearchProfile } from '@/lib/intelligence/types'

/**
 * Durable, tenant-scoped saved research snapshots.
 *
 * Rows live in Supabase under RLS, scoped to the selected workspace. A saved
 * snapshot stores the merchant's profile and the report generated on the server
 * at save time; reopening shows that durable snapshot unchanged. This replaces
 * browser-local-only storage.
 */

function storageError(message: string): string {
  return `Saved reports: ${message}.`
}

function formatSavedAt(value: string | null | undefined): string {
  if (!value) return 'unknown'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : 'unknown'
}

function given(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : 'Not provided'
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-t border-ink-line py-2">
      <dt className="label">{label}</dt>
      <dd className="max-w-[62%] text-right text-[12px] text-bone-dim">{given(value)}</dd>
    </div>
  )
}

const EMPTY_PROFILE: ResearchProfile = {
  industry: '',
  subIndustry: null,
  country: null,
  geography: null,
  companyName: null,
  website: null,
  productsServices: null,
  businessModel: null,
  customerSegment: null,
  objectives: [],
}

export function SavedReports({ profile, tenantId }: { profile: ResearchProfile; tenantId: string | null }) {
  const [reports, setReports] = useState<Array<{ id: string; profile: ResearchProfile; savedAt: string }>>(
    []
  )
  const [selected, setSelected] = useState<{ id: string; profile: ResearchProfile; savedAt: string } | null>(null)
  const [ready, setReady] = useState(tenantId === null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId) return
    setReports([])
    setSelected(null)
    try {
      const res = await fetch(`/api/research/saved-reports`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.status !== 'ok') throw new Error(typeof body?.reason === 'string' ? body.reason : `List failed (${res.status}).`)
      const rows = Array.isArray(body?.reports) ? body.reports : []
      setReports(
        rows
          .filter(
            (row: unknown) =>
              row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string',
          )
          .map(
            (row: { id: string; profile?: unknown; savedAt?: unknown }) => ({
              id: row.id,
              profile: isProfile(row.profile) ? (row.profile as ResearchProfile) : EMPTY_PROFILE,
              savedAt: typeof row.savedAt === 'string' ? row.savedAt : '',
            }),
          ),
      )
    } catch (err) {
      setError(storageError(err instanceof Error ? err.message : 'Unable to load saved reports.'))
    } finally {
      setReady(true)
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  const saveCurrent = useCallback(async () => {
    if (!tenantId) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/research/saved-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.status !== 'ok' || !body?.savedReportId) {
        throw new Error(typeof body?.reason === 'string' ? body.reason : `Save failed (${res.status}).`)
      }
      await load()
    } catch (err) {
      setError(storageError(err instanceof Error ? err.message : 'Unable to save.'))
    } finally {
      setSaving(false)
    }
  }, [tenantId, profile, load])

  const remove = useCallback(
    async (id: string) => {
      setError(null)
      setDeleting(id)
      try {
        const res = await fetch(`/api/research/saved-reports?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.status !== 'ok') {
          throw new Error(typeof body?.reason === 'string' ? body.reason : `Delete failed (${res.status}).`)
        }
        await load()
        if (selected?.id === id) setSelected(null)
      } catch (err) {
        setError(storageError(err instanceof Error ? err.message : 'Unable to delete.'))
      } finally {
        setDeleting(null)
      }
    },
    [selected, load],
  )

  const refresh = useCallback(
    async (id: string) => {
      setError(null)
      setRefreshing(id)
      try {
        const res = await fetch(`/api/research/saved-reports/${encodeURIComponent(id)}/refresh`, {
          method: 'POST',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.status !== 'ok') {
          throw new Error(typeof body?.reason === 'string' ? body.reason : `Refresh failed (${res.status}).`)
        }
        await load()
      } catch (err) {
        setError(storageError(err instanceof Error ? err.message : 'Unable to refresh.'))
      } finally {
        setRefreshing(null)
      }
    },
    [load],
  )

  const isProfile = (value: unknown): value is ResearchProfile => {
    if (!value || typeof value !== 'object') return false
    const p = value as Partial<ResearchProfile>
    return (
      typeof p.industry === 'string' &&
      (p.subIndustry === null || typeof p.subIndustry === 'string') &&
      (p.country === null || typeof p.country === 'string') &&
      (p.geography === null || typeof p.geography === 'string') &&
      (p.companyName === null || typeof p.companyName === 'string') &&
      (p.website === null || typeof p.website === 'string') &&
      (p.productsServices === null || typeof p.productsServices === 'string') &&
      (p.businessModel === null || typeof p.businessModel === 'string') &&
      (p.customerSegment === null || typeof p.customerSegment === 'string') &&
      Array.isArray(p.objectives) &&
      p.objectives.every((objective: unknown) => typeof objective === 'string')
    )
  }

  const visibleReports = reports

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Saved to your workspace">
        These snapshots live in your AgentPort account under RLS, not only in
        this browser. Reopening shows the original stored snapshot — figures
        are never silently regenerated. Use Refresh to generate a new version
        while keeping the previous snapshot.
      </Callout>

      <section className="panel p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!tenantId || saving}
            onClick={saveCurrent}
            className={`btn ${!tenantId ? 'btn-secondary' : 'btn-primary'} px-4 py-2.5`}
          >
            {saving ? 'Saving this report' : 'Save this report'}
          </button>
          <p className="font-mono text-[11px] leading-relaxed text-bone-dim">
            Saves the profile and a server-generated report body. Not live, not an install, and not a market claim.
          </p>
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
      </section>

      <section className="space-y-3">
        <h2 className="label">Saved reports</h2>
        {!ready ? (
          <p className="text-bone-faint">Loading saved reports…</p>
        ) : error && visibleReports.length === 0 ? (
          <div className="panel p-5" role="alert">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-rust">Unable to load saved reports</p>
            <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{error}</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <EmptyState
            title="No saved reports yet"
            body="Generate an industry report, then save the profile from this page."
          />
        ) : (
          <ul className="space-y-3">
            {visibleReports.map((report) => (
              <li key={report.id} className="border border-ink-line rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-[16px] leading-tight text-bone">
                      {given(report.profile.industry)}
                    </h3>
                    <Detail label="Country" value={report.profile.country} />
                    <Detail label="Website" value={report.profile.website} />
                    <Detail label="Saved" value={formatSavedAt(report.savedAt)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/insights/saved/${report.id}`} className="btn btn-primary px-4 py-2.5">
                      Reopen report
                    </Link>
                    <button
                      disabled={refreshing === report.id || deleting === report.id}
                      onClick={() => refresh(report.id)}
                      className="btn btn-secondary px-4 py-2.5"
                    >
                      {refreshing === report.id ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button
                      disabled={deleting === report.id}
                      onClick={() => remove(report.id)}
                      className="btn btn-secondary px-4 py-2.5"
                    >
                      {deleting === report.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
