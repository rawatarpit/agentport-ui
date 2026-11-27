import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const gate = join(process.cwd(), 'e2e', 'ci-coverage-gate.mjs')

function run(results: unknown): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'agentport-e2e-gate-'))
  try {
    mkdirSync(join(dir, 'test-results'))
    writeFileSync(join(dir, 'test-results', 'e2e-results.json'), JSON.stringify(results), 'utf8')
    const proc = spawnSync(process.execPath, [gate], {
      cwd: dir,
      env: { ...process.env, CI: '1', E2E_PUBLIC_ONLY: '', E2E_LIVE_READ_ONLY: '' },
      encoding: 'utf8',
    })
    return { status: proc.status, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function report(statuses: string[]): unknown {
  return {
    suites: [
      {
        specs: [
          {
            file: 'e2e/merchant.spec.ts',
            tests: statuses.map((projectName) => ({ projectName, status: 'expected' })),
          },
        ],
      },
    ],
  }
}

describe('CI E2E coverage gate', () => {
  it('accepts Playwright expected merchant passes at all three viewports', () => {
    const result = run(report(['desktop', 'tablet', 'mobile']))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('authenticated merchant coverage passed')
  })

  it('fails when any viewport has no authenticated merchant pass', () => {
    const result = run(report(['desktop', 'tablet']))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing mobile')
  })

  it('does not count skipped merchant tests as coverage', () => {
    const result = run({
      suites: [
        {
          specs: [
            {
              file: 'e2e/merchant.spec.ts',
              tests: [
                { projectName: 'desktop', status: 'skipped' },
                { projectName: 'tablet', status: 'skipped' },
                { projectName: 'mobile', status: 'skipped' },
              ],
            },
          ],
        },
      ],
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing desktop, tablet, mobile')
  })
})
