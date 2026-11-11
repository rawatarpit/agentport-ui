import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * PostgREST columns are snake_case and case-sensitive. A select that names a
 * camelCase column (`dataClass`) returns 42703 and the screen honestly falls
 * back to unknown — which is exactly what /capabilities and /go-live did after
 * data class was surfaced. These guards pin the column name so the read cannot
 * silently regress into "unknown".
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = ['app/(app)/capabilities/page.tsx', 'app/(app)/go-live/page.tsx']

function source(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('agent_capabilities column names', () => {
  it('reads data_class and aliases it to the UI shape', () => {
    for (const rel of PAGES) {
      expect(source(rel), rel).toContain('dataClass:data_class')
    }
  })

  it('never names a bare camelCase dataClass column in a select', () => {
    // `dataClass` is legal only as a PostgREST alias (`dataClass:data_class`);
    // as a bare token it is read as a column name and fails 42703.
    const bare = /\.select\([^)]*\bdataClass\b(?!\s*:)/
    for (const rel of PAGES) {
      expect(source(rel), rel).not.toMatch(bare)
    }
  })
})
