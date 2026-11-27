import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('proof page stays a read-only truth surface', () => {
  const page = read('app/(app)/proof/page.tsx')
  const state = read('lib/proof-state.ts')
  const manifest = read('app/api/discovery/check/route.ts')
  const insights = read('app/(app)/insights/page.tsx')

  it('gates on the active tenant before admin-backed reads', () => {
    expect(page).toContain('export const dynamic = \'force-dynamic\'')
    expect(page.indexOf('resolveRequestTenant()')).toBeLessThan(page.indexOf('readAppliedConfig('))
    expect(page).toContain("tenant.active.status !== 'active'")
  })

  it('uses only reviewed reads and no second trust path', () => {
    for (const source of [page, state]) {
      expect(source).not.toContain('createAdminClient')
      expect(source).not.toContain('service_role')
      expect(source).not.toMatch(/from\(['"]ledger_entries['"]\)/)
      expect(source).not.toMatch(/select\(['"]\*['"]\)/)
      expect(source).not.toContain('seedDemoPush')
      expect(source).not.toContain('demoEnforcing')
    }
    expect(page).not.toMatch(/\bonSubmit\b|\bPOST\b|approveAction|publish\/approve|approvals\/confirm/)
  })

  it('keeps decision, outcome, serving, applied and enforcing claims separate', () => {
    expect(page).toContain('held, not executed')
    expect(page).toContain('not recorded')
    expect(page).toContain('Served manifest')
    expect(page).toContain('Applied config')
    expect(page).toContain('Live push')
    expect(state).toContain("kind: 'not-comparable'")
    expect(read('components/proof/proof-served-manifest.tsx')).toContain('version label matches')
  })

  it('renders failed reads and absent activity as unknown, never zero', () => {
    expect(page).toContain("{holdsRead.failed ? 'unknown' : holdsRead.rows.length}")
    expect(page).toContain('title="Hold queue read failed"')
    expect(page).toContain('title="Ledger read failed"')
    expect(page).toContain('The ledger could not be read. Unknown, not zero.')
    expect(page).toContain('title="No decisions recorded"')
    expect(page).toContain('That is an empty window, not proof that no agent ever acted.')
    expect(page).toContain("{enforcing.status === 'live' ? 'live' : 'unknown'}")
    expect(page).toMatch(/appliedProof\.state === 'none'[\s\S]{0,120}'unknown'/)
  })

  it('forwards every manifest check outcome to the proof panel', () => {
    const discovery = read('components/discovery-check.tsx')
    const served = read('components/proof/proof-served-manifest.tsx')
    expect(discovery).toContain('onResult?.(null)')
    expect(discovery).toContain('onResult?.(body)')
    expect(discovery).toContain('onResult?.(error)')
    expect(served).toContain('onResult={setResult}')
  })

  it('binds served proof to the tenant and returns no foreign manifest', () => {
    expect(manifest).toContain("servedTenantId !== tenant.active.tenantId")
    expect(manifest).toMatch(/status: 'error'[\s\S]*?reason: 'The served manifest belongs to another work/)
    expect(manifest).not.toMatch(/return Response\.json\(\{ status: 'ok', url, httpStatus: res\.status, manifest \}\)/)
  })

  it('reads real engine status on the server and never paints ready green', () => {
    expect(insights).toContain('getIntelligenceEngineStatus()')
    expect(insights).toContain('<EngineStatusPanel state={engineProofState(engine)} />')
    expect(insights).not.toContain("EngineStatusPanel state={readFailed")
    expect(insights).toContain('<Callout tone="warning" title="Profile could not be read">')
  })
})
