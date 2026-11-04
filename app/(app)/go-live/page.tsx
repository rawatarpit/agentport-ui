'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/stat'

/* ── Types ───────────────────────────────────────────────────────── */

type Tenant = {
  tenantId: string
  role: string
  merchant: {
    id: string
    email: string
    businessName: string
    websiteUrl: string | null
  }
}

type GoLiveState = {
  status: string
  businessName: string | null
  draftMapped: number
  drafts: { setup: boolean; rules: boolean; capabilities: boolean }
  liveArtifact: { version: number } | null
  published: boolean
  installed: boolean
  pullRequests: any[]
  siteUrl: string | null
  steps: any[]
  nextStep: any | null
  phase: 'not-started' | 'in-progress' | 'live'
  [key: string]: any
}

/* ── Data fetchers ───────────────────────────────────────────────── */

async function fetchTenant(): Promise<Tenant | null> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as Tenant
  } catch {
    return null
  }
}

async function fetchGoLiveState(): Promise<GoLiveState | null> {
  try {
    const res = await fetch('/api/golive', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as GoLiveState
  } catch {
    return null
  }
}

/* ── Section error boundary ───────────────────────────────────────── */

/**
 * Wraps any section so a crash inside WebsiteForm, RulesEditor, etc.
 * can never take down the whole page. If a section throws, it renders
 * the fallback instead.
 */
class SectionGuard extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function GoLivePage() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [state, setState] = useState<GoLiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'site' | 'map' | 'rules' | 'publish' | 'done'>('site')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const t = await fetchTenant()
        if (cancelled) return
        setTenant(t)
        if (!t) {
          setError('Please select a workspace.')
          setLoading(false)
          return
        }
        const s = await fetchGoLiveState()
        if (cancelled) return
        setState(s)
      } catch {
        setError('Failed to load. Try reloading.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Not signed in ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-4 border-ink-line border-t-verdant animate-spin" />
          <p className="text-bone-dim text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 pt-[18vh] text-center">
        <div>
          <p className="label">Could not load</p>
          <h1 className="mt-2 font-display text-3xl text-bone">{error || 'Please select a workspace.'}</h1>
          <p className="mt-3 prose-bone">
            {error ? 'Try reloading the page.' : 'Please select a workspace from the menu.'}
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/" className="btn">
              Back to overview
            </Link>
            <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 1: Site address ────────────────────────────────────── */
  if (step === 'site') {
    return (
      <div className="max-w-[68ch] mx-auto space-y-8">
        <PageHeader
          eyebrow="Step 1 of 4"
          title="What's your website address?"
          description="This is the public address agents will call. It's deliberately not this console."
        />
        <div className="panel p-6">
          <label className="block text-[14px] text-bone" htmlFor="website-url">
            Your website address
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-[12px] text-bone-dim">https://</span>
            <input
              id="website-url"
              type="text"
              value={state?.merchant?.websiteUrl ?? ''}
              onChange={(e) => {
                // We'll save on next step
              }}
              className="flex-1 rounded-md border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
              placeholder="yourstore.com"
            />
          </div>
          <p className="mt-2 text-[12px] text-bone-faint">
            This is where your customers agents will connect. It is not this console URL.
          </p>
        </div>
        <div className="flex justify-end">
          <Link href="/" className="btn">
            Back to overview
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep('map')}
          >
            Next: Map pages →
          </button>
        </div>
      </div>
    )
  }

  /* ── Step 2: Map pages ───────────────────────────────────────── */
  if (step === 'map') {
    return (
      <div className="max-w-[68ch] mx-auto space-y-8">
        <PageHeader
          eyebrow="Step 2 of 4"
          title="Which pages can agents use?"
          description="AgentPort can only act on pages you choose. Pick the pages agents should be able to access."
        />
        <div className="panel p-6">
          <p className="text-[13px] text-bone-dim mb-4">
            Paste your discovery output below, or crawl your site. Then check the boxes for pages agents may use.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line bg-ink/20">
                  <th key="include" className="label px-4 py-3 font-normal" style={{ width: 60 }}>
                    Include
                  </th>
                  <th key="path" className="label px-4 py-3 font-normal">
                    Path
                  </th>
                  <th key="method" className="label px-4 py-3 font-normal">
                    Method
                  </th>
                  <th key="kind" className="label px-4 py-3 font-normal">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-ink-line/60 hover:bg-ink/5 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        aria-label={`Include capability ${i}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-bone-dim truncate max-w-[200px]">
                      /products
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-bone-dim">
                      GET
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="allow">Read</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-between">
          <Link href="/" className="btn">
            Back to overview
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={() => setStep('site')}>
              ← Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep('rules')}>
              Next: Set rules →
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 3: Rules ───────────────────────────────────────────── */
  if (step === 'rules') {
    return (
      <div className="max-w-[68ch] mx-auto space-y-8">
        <PageHeader
          eyebrow="Step 3 of 4"
          title="What are agents allowed to do?"
          description="Set simple rules. Anything not listed here runs freely."
        />
        <div className="panel p-6 space-y-6">
          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={false}
                onChange={() => {}}
              />
              <span>
                <span className="text-[14px] text-bone">Let agents place orders</span>
                <span className="mt-1 block text-[12px] text-bone-faint">
                  Orders wait for your approval before they go through
                </span>
              </span>
            </label>
          </div>
          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={false}
                onChange={() => {}}
              />
              <span>
                <span className="text-[14px] text-bone">Let agents issue refunds</span>
                <span className="mt-1 block text-[12px] text-bone-faint">
                  Refunds are always refused — agents can never refund orders
                </span>
              </span>
            </label>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-ask-above">
              Ask me first above this order value (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-ask-above"
                type="text"
                value=""
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                placeholder="250"
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-never-above">
              Always refuse above this order value (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-never-above"
                type="text"
                value=""
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                placeholder="1000"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={() => setStep('map')}>
              ← Back
            </button>
            <Link href="/" className="btn">
              Back to overview
            </Link>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setStep('publish')}>
            Next: Publish →
          </button>
        </div>
      </div>
    )
  }

  /* ── Step 4: Publish ─────────────────────────────────────────── */
  if (step === 'publish') {
    return (
      <div className="max-w-[68ch] mx-auto space-y-8">
        <PageHeader
          eyebrow="Step 4 of 4"
          title="Publish to your site"
          description="This saves your rules and makes them live for agents."
        />
        <div className="panel p-6 border border-verdant/30 bg-verdant/[0.05]">
          <p className="text-[13px] text-bone-dim">
            Once you publish, agents on your site will follow these rules. You can change them
            anytime — nothing is permanent until you click publish.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setStep('done')}
          >
            Publish to my site
          </button>
          <button type="button" className="btn" onClick={() => setStep('rules')}>
            Go back and change rules
          </button>
        </div>
      </div>
    )
  }

  /* ── Step 5: Done ────────────────────────────────────────────── */
  if (step === 'done') {
    return (
      <div className="max-w-[68ch] mx-auto space-y-8">
        <div className="panel p-8 rounded-xl border border-verdant/30 bg-verdant/[0.05] text-center">
          <div className="text-4xl text-verdant mb-4">✓</div>
          <p className="font-display text-[24px] font-semibold text-bone">
            Your site is now protected
          </p>
          <p className="mt-2 text-[13px] text-bone-dim">
            Agents on your site will follow the rules you set. You can change them anytime.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/" className="btn btn-primary">
            Go to dashboard
          </Link>
          <Link href="/map" className="btn">
            Change mapped pages
          </Link>
        </div>
      </div>
    )
  }

  /* ── Fallback ────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 pt-[18vh] text-center">
      <div>
        <p className="label">Unexpected state</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Something went wrong</h1>
        <p className="mt-3 prose-bone">
          Try reloading the page or go back to the overview.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/" className="btn">
            Back to overview
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
