import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('new proof surface keeps a usable responsive shape', () => {
  const page = read('app/(app)/proof/page.tsx')
  const served = read('components/proof/proof-served-manifest.tsx')
  const discovery = read('components/discovery-check.tsx')

  it('stacks on small screens and expands on desktop', () => {
    expect(page).toMatch(/grid gap-3 sm:grid-cols-2 xl:grid-cols-4/)
    expect(read('components/ui/page-header.tsx')).toMatch(/sm:flex-row/)
    expect(page).toMatch(/grid gap-3 sm:grid-cols-2/)
    expect(page).toMatch(/grid gap-2 text-\[13px\] text-bone-dim sm:grid-cols-3/)
  })

  it('keeps wide evidence tables scrollable instead of overflowing', () => {
    expect(page).toContain('overflow-x-auto')
    expect(page).toContain('min-w-[720px]')
  })

  it('keeps controls tappable and focus-visible in the reused check', () => {
    expect(discovery).toContain('btn btn-primary')
    expect(read('app/globals.css')).toMatch(/\.btn[\s\S]*?focus-visible/)
    expect(served).toContain('grid gap-3 sm:grid-cols-3')
  })
})
