import { describe, expect, it } from 'vitest'
import {
  buildInstallPackageFrom,
  buildManualInstaller,
  detectPublishTarget,
  normaliseWorkerUrl,
} from '@/lib/install-package'

const base = {
  drafts: {
    setup: { ceilingMinor: 25000, hardCeilingMinor: 100000, alwaysAsk: true, forbidRefunds: true },
    capabilities: { hidden: { createOrder: ['amountMinor'] } },
  },
  tenantId: 'tenant-1',
  business: 'Acme',
  siteUrl: 'https://acme.example',
  workerUrl: 'https://governor.agentport.dev',
}

describe('normaliseWorkerUrl', () => {
  it('requires an absolute hosted URL', () => {
    expect(normaliseWorkerUrl('').ok).toBe(false)
    expect(normaliseWorkerUrl('governor.agentport.dev').ok).toBe(false)
    expect(normaliseWorkerUrl('http://governor.agentport.dev').ok).toBe(false)
    expect(normaliseWorkerUrl('https://user:pass@governor.agentport.dev').ok).toBe(false)
    expect(normaliseWorkerUrl('https://governor.agentport.dev?x=1').ok).toBe(false)
  })
  it('accepts https and localhost development, without a trailing slash', () => {
    expect(normaliseWorkerUrl('https://governor.agentport.dev/')).toEqual({
      ok: true,
      url: 'https://governor.agentport.dev',
    })
    expect(normaliseWorkerUrl('http://localhost:8787').ok).toBe(true)
  })
  it('routes a tenant through its own path and refuses another tenant path', () => {
    expect(normaliseWorkerUrl('https://governor.agentport.dev/', 'tenant-1')).toEqual({
      ok: true,
      url: 'https://governor.agentport.dev/t/tenant-1',
    })
    expect(normaliseWorkerUrl('https://governor.agentport.dev/t/tenant-1/', 'tenant-1').ok).toBe(true)
    expect(normaliseWorkerUrl('https://governor.agentport.dev/t/tenant-2', 'tenant-1').ok).toBe(false)
    expect(normaliseWorkerUrl('https://governor.agentport.dev/api', 'tenant-1').ok).toBe(false)
  })
})

describe('detectPublishTarget', () => {
  it('recognises source directories and build outputs', () => {
    expect(detectPublishTarget(['next.config.mjs', 'app/page.tsx'])).toMatchObject({
      dir: 'public',
      mode: 'direct',
      framework: 'next',
    })
    expect(detectPublishTarget(['svelte.config.js'])).toMatchObject({
      dir: 'static',
      mode: 'direct',
      framework: 'sveltekit',
    })
    expect(detectPublishTarget(['vite.config.ts', 'public/index.html'])).toMatchObject({
      dir: 'public',
      mode: 'direct',
    })
    expect(detectPublishTarget(['dist/index.html'])).toMatchObject({
      dir: 'dist',
      mode: 'build-output',
    })
    expect(detectPublishTarget(['index.html'])).toMatchObject({
      dir: '.',
      mode: 'direct',
      framework: 'static-root',
    })
  })

  it('targets the website package in a monorepo instead of the repository root', () => {
    expect(
      detectPublishTarget([
        'package.json',
        'apps/web/package.json',
        'apps/web/next.config.mjs',
        'apps/web/public/favicon.ico',
      ]),
    ).toMatchObject({ root: 'apps/web', dir: 'public', framework: 'next' })
  })

  it('refuses to guess when two packages both look like websites', () => {
    const target = detectPublishTarget([
      'apps/web/next.config.mjs',
      'apps/admin/next.config.mjs',
    ])
    expect(target.ambiguous).toBe(true)
    const r = buildInstallPackageFrom({ ...base, publishTarget: target })
    expect(r.ok).toBe(false)
  })
})

describe('buildInstallPackageFrom', () => {
  it('writes the discovery folder and the served files, never a policy file', () => {
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: 'public', mode: 'direct', framework: 'next' },
      now: new Date('2026-10-24T00:00:00.000Z'),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const paths = r.value.files.map((f) => f.path)
    expect(paths).toContain('agentport/manifest.json')
    expect(paths).toContain('agentport/config.json')
    expect(paths).toContain('agentport/publish.mjs')
    expect(paths).toContain('agentport/verify.mjs')
    const verify = r.value.files.find((f) => f.path === 'agentport/verify.mjs')
    expect(verify?.content).toContain("live.business !== config.business")
    expect(verify?.content).not.toContain('live.baseUrl !== config.workerUrl')
    expect(paths).toContain('public/.well-known/agent.json')
    expect(paths).toContain('public/.well-known/agent-access.html')
    expect(paths).toContain('public/llms.txt')
    expect(paths).not.toContain('agentport.config.ts')
    expect(r.value.manifest).toMatchObject({
      generatedBy: 'agentport',
      business: 'Acme',
      baseUrl: 'https://governor.agentport.dev/t/tenant-1',
    })
    expect(r.value.manifest).not.toHaveProperty('emergencyKillSwitch')
    expect(r.value.config).not.toHaveProperty('signingSecret')
    expect(r.value.config).not.toHaveProperty('serviceRoleKey')
  })

  it('keeps a monorepo package self-contained under its own root', () => {
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { root: 'apps/web', dir: 'dist', mode: 'build-output', framework: 'bundler' },
      packageJson: JSON.stringify({ scripts: { build: 'vite build' } }),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const paths = r.value.files.map((f) => f.path)
    expect(paths).toContain('apps/web/agentport/manifest.json')
    expect(paths).toContain('apps/web/agentport/publish.mjs')
    expect(paths).toContain('apps/web/package.json')
    expect(paths).not.toContain('agentport/manifest.json')
    expect(r.value.config.packageRoot).toBe('apps/web')
    expect(r.value.config.publishDir).toBe('dist')
  })

  it('adds one postbuild hook for a build-output target and preserves existing scripts', () => {
    const packageJson = JSON.stringify({
      name: 'site',
      scripts: { build: 'vite build', postbuild: 'echo done' },
    })
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: 'dist', mode: 'build-output', framework: 'bundler' },
      packageJson,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const pkg = r.value.files.find((f) => f.path === 'package.json')
    expect(pkg).toBeDefined()
    const parsed = JSON.parse(pkg!.content) as { scripts: Record<string, string> }
    expect(parsed.scripts.build).toBe('vite build')
    expect(parsed.scripts.postbuild).toBe('echo done && node agentport/publish.mjs')
    expect(parsed.scripts['agentport:publish']).toBe('node agentport/publish.mjs')
    expect(r.value.files.map((f) => f.path)).not.toContain('dist/.well-known/agent.json')
  })

  it('refuses to overwrite another provider’s manifest or access page', () => {
    const manifest = buildInstallPackageFrom({
      ...base,
      existingManifest: JSON.stringify({ generatedBy: 'someone-else' }),
    })
    expect(manifest.ok).toBe(false)
    const page = buildInstallPackageFrom({
      ...base,
      existingAccessPage: '<html>someone else</html>',
    })
    expect(page.ok).toBe(false)
  })

  it('merges the Agent Port block into an existing llms.txt instead of replacing it', () => {
    const existing = '# Acme docs\n\nKeep this line.\n'
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
      existingLlms: existing,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const llms = r.value.files.find((f) => f.path === 'llms.txt')
    expect(llms?.content).toContain('Keep this line.')
    expect(llms?.content).toContain('<!-- agentport:begin -->')
    expect(llms?.content).toContain('<!-- agentport:end -->')
  })

  it('escapes the business name in generated HTML and Markdown', () => {
    const r = buildInstallPackageFrom({
      ...base,
      business: '<script>alert("x")</script>',
      publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const html = r.value.files.find((f) => f.path === 'agentport/agent-access.html')?.content ?? ''
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    const readme = r.value.files.find((f) => f.path === 'agentport/README.md')?.content ?? ''
    expect(readme).not.toContain('<script>')
    expect(readme).toContain('\\<script\\>')
  })

  it('refuses an unsafe publish directory', () => {
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: '../outside', mode: 'direct', framework: 'x' },
    })
    expect(r.ok).toBe(false)
  })

  it('manual installer writes the same files and does not execute policy', () => {
    const r = buildInstallPackageFrom({ ...base })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const script = buildManualInstaller(r.value.files)
    expect(script).toContain('agentport/manifest.json')
    expect(script).toContain('writeFileSync')
    expect(script).not.toContain('evaluate(')
    expect(script).not.toContain('emergencyKillSwitch')
  })
})
