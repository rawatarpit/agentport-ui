import { describe, expect, it } from 'vitest'
import { githubReasonText } from '@/lib/github-reasons'

describe('githubReasonText', () => {
  it('names the install-start failure without blaming the merchant', () => {
    expect(githubReasonText('install-start')).toContain('owner or admin')
    expect(githubReasonText('install-start')).toContain('Nothing was linked')
  })

  it('names a failed install record instead of reporting success', () => {
    expect(githubReasonText('install-record')).toContain('Could not record')
    expect(githubReasonText('install-record')).toContain('nothing was linked')
  })

  it('keeps an unknown reason honest and specific enough to report', () => {
    expect(githubReasonText('some-new-failure')).toContain('some-new-failure')
    expect(githubReasonText('some-new-failure')).toContain('Nothing was linked')
  })
})
