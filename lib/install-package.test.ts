import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(paths).toEqual([
      'agentport/config.json',
      'agentport/publish.mjs',
      'agentport/verify.mjs',
      'agentport/README.md',
    ])
    expect(paths).not.toContain('agentport/manifest.json')
    expect(paths).not.toContain('agentport/llms.txt')
    expect(paths).not.toContain('agentport/agent-access.html')
    expect(paths).not.toContain('public/.well-known/agent.json')
    expect(paths).not.toContain('public/llms.txt')
    const publish = r.value.files.find((f) => f.path === 'agentport/publish.mjs')
    const verify = r.value.files.find((f) => f.path === 'agentport/verify.mjs')
    const readme = r.value.files.find((f) => f.path === 'agentport/README.md')
    expect(publish?.content).toContain('config.manifestUrl')
    expect(publish?.content).toContain('live.endpoints')
    expect(publish?.content).toContain('Token endpoint')
    expect(publish?.content).toContain('autoIssue')
    expect(publish?.content).toContain("createHash('sha256').update(text)")
    expect(publish?.content).not.toContain('copyFileSync')
    expect(publish?.content).toContain('llms-full.txt')
    expect(publish?.content).toContain("join(guideDir, 'custom.md')")
    expect(publish?.content).toContain('hosted manifest is for a different tenant')
    expect(publish?.content).not.toContain('hosted manifest is for a different business')
    expect(verify?.content).toContain('hosted manifest is for a different tenant')
    expect(verify?.content).toContain('config.workerUrl')
    expect(verify?.content).toContain('published manifest does not match the hosted governor selection')
    expect(verify?.content).not.toContain('manifestSha256')
    expect(verify?.content).not.toContain("live.business !== config.business")
    expect(readme?.content).toContain('hosted governor is the')
    expect(paths).not.toContain('agentport.config.ts')
    expect(r.value.manifest).toMatchObject({
      generatedBy: 'agentport',
      business: 'Acme',
      baseUrl: 'https://governor.agentport.dev/t/tenant-1',
    })
    expect(r.value.manifest).not.toHaveProperty('emergencyKillSwitch')
    expect((r.value.manifest.capabilities as unknown[]).length).toBe(0)
    expect(r.value.config).not.toHaveProperty('signingSecret')
    expect(r.value.config).not.toHaveProperty('serviceRoleKey')
  })

  it('matches the SDK manifest vocabulary and holds mapped writes', () => {
    const r = buildInstallPackageFrom({
      ...base,
      drafts: {
        setup: { ceilingMinor: 25000, hardCeilingMinor: 100000, alwaysAsk: false, forbidRefunds: true },
        capabilities: {
          hidden: {},
          extra: [
            { name: 'createShipment', method: 'POST', path: '/shipments', kind: 'write' },
            { name: 'getShipment', method: 'GET', path: '/shipments/:id', kind: 'read' },
          ],
        },
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const manifest = r.value.manifest as {
      capabilities: Array<Record<string, unknown>>
      policies: Record<string, unknown>
      authentication: Record<string, unknown>
      errorContract: Array<{ reason: string; detail: string }>
    }
    expect(manifest.capabilities.map((c) => c.name)).toEqual(['createShipment', 'getShipment'])
    const shipment = manifest.capabilities.find((c) => c.name === 'createShipment')
    expect(shipment).toMatchObject({ access: 'write', requiresApproval: true, input: null })
    expect(shipment).not.toHaveProperty('hiddenFields')
    expect(manifest.policies).toHaveProperty('forbidden', ['requestRefund'])
    expect(manifest.policies).not.toHaveProperty('forbiddenCapabilities')
    expect(manifest.authentication).toMatchObject({ scheme: 'bearer', header: 'Authorization' })
    expect(manifest.authentication).not.toHaveProperty('required')
    expect(manifest.errorContract).toEqual(
      expect.arrayContaining([{ reason: 'identity_unverified', detail: expect.any(String) }]),
    )
    expect(manifest.errorContract.some((e) => e.reason === 'handler_error')).toBe(false)
  })

  it('publishes public onboarding facts and only auto-issues public reads', () => {
    const r = buildInstallPackageFrom({
      ...base,
      onboarding: {
        businessDescription: 'We sell industrial parts.',
        docsUrl: 'https://acme.example/docs/',
        supportUrl: 'https://acme.example/support',
        privacyUrl: 'https://acme.example/privacy',
        termsUrl: 'https://acme.example/terms',
        connectorUrl: 'https://connector.acme.example/mcp',
      },
      drafts: {
        setup: base.drafts.setup,
        capabilities: {
          hidden: {},
          extra: [
            {
              name: 'listDocs',
              method: 'GET',
              path: '/docs',
              dataClass: 'public',
              autoIssue: true,
            },
            {
              name: 'listOrders',
              method: 'GET',
              path: '/orders',
              dataClass: 'internal',
              autoIssue: false,
            },
          ],
        },
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.config).toMatchObject({
      businessDescription: 'We sell industrial parts.',
      docsUrl: 'https://acme.example/docs',
      supportUrl: 'https://acme.example/support',
      privacyUrl: 'https://acme.example/privacy',
      termsUrl: 'https://acme.example/terms',
      connectorUrl: 'https://connector.acme.example/mcp',
    })
    const manifest = r.value.manifest as {
      capabilities: Array<Record<string, unknown>>
      authentication: Record<string, unknown>
    }
    expect(manifest.capabilities.find((c) => c.name === 'listDocs')).toMatchObject({
      dataClass: 'public',
      autoIssue: true,
    })
    expect(manifest.capabilities.find((c) => c.name === 'listOrders')).toMatchObject({
      dataClass: 'internal',
      autoIssue: false,
    })
    expect(manifest.authentication.autoIssue).toEqual(['listDocs'])
  })

  it('refuses an invalid onboarding URL before writing a package', () => {
    const r = buildInstallPackageFrom({
      ...base,
      onboarding: { docsUrl: 'http://acme.example/docs' },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('must use https')
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
    expect(paths).toContain('apps/web/agentport/config.json')
    expect(paths).toContain('apps/web/agentport/publish.mjs')
    expect(paths).toContain('apps/web/package.json')
    expect(paths).not.toContain('agentport/config.json')
    expect(paths).not.toContain('apps/web/agentport/manifest.json')
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

  it('adds a prebuild hook so a framework site refreshes the manifest on every deploy', () => {
    const packageJson = JSON.stringify({
      name: 'site',
      scripts: { build: 'next build', prebuild: 'echo prep' },
    })
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: 'public', mode: 'direct', framework: 'next' },
      packageJson,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const pkg = r.value.files.find((f) => f.path === 'package.json')
    expect(pkg).toBeDefined()
    const parsed = JSON.parse(pkg!.content) as { scripts: Record<string, string> }
    expect(parsed.scripts.build).toBe('next build')
    expect(parsed.scripts.prebuild).toBe('node agentport/publish.mjs && echo prep')
    expect(parsed.scripts['agentport:publish']).toBe('node agentport/publish.mjs')
    expect(r.value.files.map((f) => f.path)).toContain('agentport/config.json')
    expect(r.value.files.map((f) => f.path)).not.toContain('public/.well-known/agent.json')
  })

  it('gives a static-root site the publish script but no build hook to run it', () => {
    const packageJson = JSON.stringify({ name: 'site', scripts: { build: 'echo none' } })
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
      packageJson,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const pkg = r.value.files.find((f) => f.path === 'package.json')
    expect(pkg).toBeDefined()
    const parsed = JSON.parse(pkg!.content) as { scripts: Record<string, string> }
    expect(parsed.scripts['agentport:publish']).toBe('node agentport/publish.mjs')
    expect(parsed.scripts.prebuild).toBeUndefined()
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

  it('refreshes an older Agent Port manifest that points at this tenant’s governor', () => {
    const tenantUrl = 'https://governor.agentport.dev/t/tenant-1'
    const legacy = JSON.stringify({
      version: '1.0',
      business: 'Acme',
      baseUrl: tenantUrl,
      endpoints: {
        manifest: `${tenantUrl}/.well-known/agent.json`,
        execute: `${tenantUrl}/.well-known/agent/invoke`,
      },
    })
    const r = buildInstallPackageFrom({ ...base, existingManifest: legacy })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.manifest).toMatchObject({ generatedBy: 'agentport', business: 'Acme' })
  })

  it('still refuses a foreign manifest that does not point at this tenant', () => {
    const foreign = JSON.stringify({
      version: '1.0',
      business: 'Acme',
      baseUrl: 'https://other-provider.example',
      endpoints: { manifest: 'https://other-provider.example/.well-known/agent.json' },
    })
    const r = buildInstallPackageFrom({ ...base, existingManifest: foreign })
    expect(r.ok).toBe(false)
  })

  it('refuses another tenant’s Agent Port manifest', () => {
    const other = JSON.stringify({
      baseUrl: 'https://governor.agentport.dev/t/tenant-2',
      endpoints: { manifest: 'https://governor.agentport.dev/t/tenant-2/.well-known/agent.json' },
    })
    const r = buildInstallPackageFrom({ ...base, existingManifest: other })
    expect(r.ok).toBe(false)
  })

  it('generates a publisher that merges the Agent Port block into an existing llms.txt', () => {
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const publish = r.value.files.find((f) => f.path === 'agentport/publish.mjs')?.content ?? ''
    expect(publish).toContain('<!-- agentport:begin -->')
    expect(publish).toContain('<!-- agentport:end -->')
    expect(publish).toContain('mergeBlock')
    expect(publish).toContain('current.indexOf(begin)')
    expect(publish).toContain('current.slice(0, start)')
  })

  it('escapes the business name in generated Markdown', () => {
    const r = buildInstallPackageFrom({
      ...base,
      business: '<script>alert("x")</script>',
      publishTarget: { dir: '.', mode: 'direct', framework: 'static-root' },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
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
    expect(script).toContain('agentport/config.json')
    expect(script).toContain('writeFileSync')
    expect(script).not.toContain('evaluate(')
    expect(script).not.toContain('emergencyKillSwitch')
  })

  it('generates syntactically valid publish and verify scripts', () => {
    const r = buildInstallPackageFrom({
      ...base,
      publishTarget: { dir: 'public', mode: 'direct', framework: 'next' },
      packageJson: JSON.stringify({ scripts: { build: 'next build' } }),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const dir = mkdtempSync(join(tmpdir(), 'agentport-script-'))
    for (const path of ['agentport/publish.mjs', 'agentport/verify.mjs']) {
      const file = r.value.files.find((f) => f.path === path)
      expect(file).toBeDefined()
      const target = join(dir, path.split('/').join('-'))
      writeFileSync(target, file!.content)
      expect(() => execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' })).not.toThrow()
    }
  })
})
