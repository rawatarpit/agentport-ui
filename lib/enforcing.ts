import type { Policy } from '@agentport/sdk'
import { configHash } from '@/lib/agentport'

/**
 * The enforcing digest and its age — TASKS.md 5.3.
 *
 * The one control that stops a merchant believing the wrong thing is live.
 * Sourced from the runtime's push, never computed here: a dashboard-derived
 * digest reports a config as live the moment it was saved, which is exactly
 * the wrong answer and indistinguishable from the right one.
 *
 * In this single-process demo the "push" is the constant in lib/agentport.ts.
 * In the hosted product it arrives over the analytics channel (counts +
 * configHash, never rows) and this module reads that assertion instead.
 * The shape stays the same so the panel cannot tell the difference — which
 * is the point: the panel renders an assertion, never a guess.
 */

export type EnforcingState =
  | { status: 'live'; digest: string; pushedAt: string }
  | { status: 'unknown'; reason: string }
  | { status: 'not-deployed'; reason: string }

/**
 * Heartbeat freshness bound. Older than this renders `unknown`, never
 * `enabled` — a four-hour-old "Runtime ● Online" makes a merchant conclude
 * agents are ungoverned and either panic-disable everything or ignore status
 * forever. Both destroy the signal.
 */
export const STALE_AFTER_MS = 15 * 60_000

export function enforcingFromPush(opts: {
  digest: string | null
  pushedAt: string | null
  now?: number
}): EnforcingState {
  const now = opts.now ?? Date.now()
  if (!opts.digest || !opts.pushedAt) {
    return { status: 'unknown', reason: 'No runtime push received yet.' }
  }
  const age = now - Date.parse(opts.pushedAt)
  if (!Number.isFinite(age) || age < 0) {
    return { status: 'unknown', reason: 'Push timestamp unreadable.' }
  }
  if (age > STALE_AFTER_MS) {
    return { status: 'unknown', reason: `Last push ${Math.round(age / 60_000)} min ago — stale.` }
  }
  return { status: 'live', digest: opts.digest, pushedAt: opts.pushedAt }
}

/** Demo push: the digest this process enforces, asserted seconds ago. */
export function demoEnforcing(now = Date.now()): EnforcingState {
  return enforcingFromPush({
    digest: configHash,
    pushedAt: new Date(now - 4 * 60_000).toISOString(),
    now,
  })
}

export function ageLabel(pushedAt: string, now = Date.now()): string {
  const ms = now - Date.parse(pushedAt)
  if (!Number.isFinite(ms) || ms < 0) return 'unknown age'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min === 1) return '1 min ago'
  return `${min} min ago`
}

/**
 * Sync payload — TASKS.md 4.5 / 1.4. Replaces policy, so it must not be
 * able to express the kill switch. A payload that can re-enable what a human
 * turned off during an incident is a real-money bug that passes review,
 * because `policy = newPolicy` looks correct. The compiler rejects it here.
 */
export type SyncPayload = {
  capabilities: Array<{ name: string; hiddenFields?: string[] }>
  policy: Omit<Policy, 'emergencyKillSwitch'>
  fromDigest: string
}

/** Compile-time proof the sync payload cannot carry the switch. */
const _noKillSwitch: keyof SyncPayload['policy'] & 'emergencyKillSwitch' extends never
  ? true
  : 'SYNC_PAYLOAD_MUST_OMIT_KILL_SWITCH' = true
void _noKillSwitch
