import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Local runs without a dedicated merchant session are allowed to skip. CI is
 * not: an authenticated pass must exist at all three viewports before the E2E
 * stage can be called green. Public-only and production read-only runs may opt
 * out explicitly, but that opt-out is visible in the CI command.
 */
if (process.env.CI !== '1' || process.env.E2E_PUBLIC_ONLY === '1' || process.env.E2E_LIVE_READ_ONLY === '1') {
  process.exit(0)
}

const resultsPath = join(process.cwd(), 'test-results', 'e2e-results.json')
if (!existsSync(resultsPath)) {
  console.error('CI E2E gate: no test-results/e2e-results.json was produced.')
  process.exit(1)
}

/** @type {{ suites?: Array<{ specs?: Array<{ file?: string, tests?: Array<{ projectName?: string, status?: string }> }>, suites?: unknown[] }> }} */
const results = JSON.parse(readFileSync(resultsPath, 'utf8'))

const passed = new Set()
/** @typedef {{ specs?: Array<{ file?: string, tests?: Array<{ projectName?: string, status?: string }> }>, suites?: unknown[] }} Suite */
/** @param {Suite[]} suites */
const walk = (suites) => {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        // Playwright's JSON reporter marks a green test as `expected`; the
        // result entries carry `passed`. Accept both reporter spellings.
        if ((test.status === 'passed' || test.status === 'expected') && spec.file?.includes('merchant.spec.ts')) {
          passed.add(test.projectName ?? 'unknown')
        }
      }
    }
    if (suite.suites) walk(suite.suites)
  }
}
walk(results.suites ?? [])

const required = ['desktop', 'tablet', 'mobile']
const missing = required.filter((project) => !passed.has(project))
if (missing.length > 0) {
  console.error(
    `CI E2E gate: authenticated merchant coverage passed in ${[...passed].join(', ') || 'no projects'}; missing ${missing.join(', ')}.`,
  )
  process.exit(1)
}
console.log('CI E2E gate: authenticated merchant coverage passed at desktop, tablet and mobile.')
