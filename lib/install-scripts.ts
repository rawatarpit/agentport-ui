/**
 * Client discovery scripts, embedded at build time.
 *
 * These are the exact files the hosted console writes into a merchant's
 * `agentport/` folder. Keep this file generated from the pilot package in
 * sentra-website-main/agentport; the scripts are client-side only and must
 * never gain policy evaluation, credentials, a ledger or an execution path.
 */
export const PUBLISH_SCRIPT = `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = dirname(here)
const configPath = join(here, 'config.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const target = config.publishDir === '.' ? packageRoot : join(packageRoot, config.publishDir)
const at = (rel) => join(target, rel)
const fail = (message) => {
  console.error('agentport: ' + message)
  process.exit(1)
}

const trimSlash = (value) => {
  let s = String(value ?? '')
  while (s.endsWith('/')) s = s.slice(0, -1)
  return s
}
const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

// The hosted governor is the source of truth. Copying a local manifest would let
// a stale snapshot advertise capabilities the client never selected, and the
// site would promise what the governor refuses. Fetch live and fail closed.
const res = await fetch(config.manifestUrl, {
  headers: { accept: 'application/json' },
  cache: 'no-store',
}).catch(() => null)
if (res === null || !res.ok) fail('could not read the hosted manifest; refusing to publish a stale snapshot')
const text = await res.text()
let live
try {
  live = JSON.parse(text)
} catch {
  fail('hosted manifest is not valid JSON')
}

// Identity is the tenant governor, not the display name: a business may be
// renamed in the console after install, and that must not fail the build.
const sameTenant =
  (Boolean(config.workerUrl) && typeof live.baseUrl === 'string' &&
    trimSlash(live.baseUrl) === trimSlash(config.workerUrl)) ||
  (Boolean(config.manifestUrl) && typeof live.endpoints?.manifest === 'string' &&
    trimSlash(live.endpoints.manifest) === trimSlash(config.manifestUrl))
if (live.version !== '1.0') fail('hosted manifest version is not 1.0')
if (!sameTenant) fail('hosted manifest is for a different tenant')
if (typeof live.business !== 'string' || live.business.trim() === '') fail('hosted manifest has no business name')
if (live.authentication?.scheme !== 'bearer') fail('hosted manifest does not advertise bearer authentication')
if (!Array.isArray(live.capabilities)) fail('hosted manifest has no capability list')

const business = live.business.trim()
const businessDescription = String(
  config.businessDescription ||
  'Governed, auditable access to this business\\'s capabilities for AI agents.',
).trim()
const manifestUrl = String(live.endpoints?.manifest ?? config.manifestUrl)
const executeUrl = String(live.endpoints?.execute ?? config.executeUrl)
const tokenUrl = String(live.endpoints?.token ?? live.authentication?.tokenEndpoint ?? '')
const autoIssue = Array.isArray(live.authentication?.autoIssue) ? live.authentication.autoIssue : []
const capabilities = live.capabilities
const capByName = new Map(capabilities.map((cap) => [cap.name, cap]))

const names = capabilities.map((cap) => cap.name)
if (new Set(names).size !== names.length) fail('hosted manifest has duplicate capability names')
for (const name of autoIssue) {
  const cap = capByName.get(name)
  if (!cap) fail('autoIssue names a capability that is not in the manifest: ' + name)
  if (cap.dataClass !== 'public') {
    fail('autoIssue includes a non-public capability: ' + name + ' (' + String(cap.dataClass) + ')')
  }
}
const publicCaps = autoIssue.map((name) => capByName.get(name))
const capDescription = (cap) =>
  typeof cap.description === 'string' && cap.description.trim() !== ''
    ? cap.description.trim()
    : [cap.method, cap.path].filter(Boolean).join(' ') || 'No description.'

const siteUrl = trimSlash(config.siteUrl)
const guideDir = String(config.agentGuidesDir || 'agent').replace(/^\\/+|\\/+$/g, '')
if (!/^[A-Za-z0-9._-]+$/.test(guideDir)) fail('agentGuidesDir must be a simple path segment')
const guideUrl = (file) => siteUrl ? \`\${siteUrl}/\${guideDir}/\${file}\` : \`/\${guideDir}/\${file}\`
const accessUrl = siteUrl ? \`\${siteUrl}/.well-known/agent-access.html\` : '/.well-known/agent-access.html'
const llmsFullUrl = siteUrl ? \`\${siteUrl}/llms-full.txt\` : '/llms-full.txt'
const connectorUrl = String(config.connectorUrl || config.mcpUrl || '').trim()
const hasConnector = connectorUrl !== ''
const docsUrl = String(config.docsUrl || '').trim()
const supportUrl = String(config.supportUrl || '').trim()
const privacyUrl = String(config.privacyUrl || '').trim()
const termsUrl = String(config.termsUrl || '').trim()

mkdirSync(join(target, '.well-known'), { recursive: true })
mkdirSync(join(target, guideDir), { recursive: true })
// Redirect mode serves the manifest from a server route. Writing a local copy
// would both go stale and collide with that route, so remove it instead.
if (config.manifestMode === 'redirect') {
  rmSync(at('.well-known/agent.json'), { force: true })
} else {
  writeFileSync(at('.well-known/agent.json'), text)
}

const digest = createHash('sha256').update(text).digest('hex')
if (config.manifestSha256 !== digest || config.business !== business) {
  config.manifestSha256 = digest
  // The display name is mutable; keep the committed config in step with the
  // governor so a rename does not leave a misleading local snapshot.
  config.business = business
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n')
}

const publicCapItems = publicCaps.length === 0
  ? ['  <li>None are auto-issued. Ask the business for a scoped grant.</li>']
  : publicCaps.map((cap) =>
    \`  <li><code>\${esc(cap.name)}</code> — \${esc(capDescription(cap))}</li>\`)

const guideItems = [
  \`  <li><a href="\${esc(guideUrl('custom.md'))}">Custom agent guide</a></li>\`,
  ...(hasConnector ? [
    \`  <li><a href="\${esc(guideUrl('chatgpt.md'))}">ChatGPT guide</a></li>\`,
    \`  <li><a href="\${esc(guideUrl('claude.md'))}">Claude guide</a></li>\`,
  ] : []),
]

const contactItems = [
  ...(docsUrl ? [\`  <li><a href="\${esc(docsUrl)}">Documentation</a></li>\`] : []),
  ...(supportUrl ? [\`  <li><a href="\${esc(supportUrl)}">Support</a></li>\`] : []),
  ...(privacyUrl ? [\`  <li><a href="\${esc(privacyUrl)}">Privacy</a></li>\`] : []),
  ...(termsUrl ? [\`  <li><a href="\${esc(termsUrl)}">Terms</a></li>\`] : []),
]

const html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  '  <title>Agent access — ' + esc(business) + '</title>',
  '  <meta name="description" content="' + esc(businessDescription) + '">',
  '  <link rel="alternate" type="application/json" href="' + esc(manifestUrl) + '">',
  '  <link rel="describedby" type="text/plain" href="' + esc(llmsFullUrl) + '">',
  '  <meta name="agentport-manifest" content="' + esc(manifestUrl) + '">',
  '  <style>',
  '    body{font:16px/1.55 system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.25rem;color:#18181b}',
  '    code{background:#f4f4f5;padding:.1rem .35rem}',
  '    li{margin:.35rem 0}',
  '    .muted{color:#52525b}',
  '  </style>',
  '</head>',
  '<body>',
  '  <h1>' + esc(business) + ' — agent access</h1>',
  '  <p>' + esc(businessDescription) + '</p>',
  '  <p>Agents discover the capability set, then call the hosted Agent Port governor. The governor authorises every call, executes it, and records the decision. This page is static and makes no policy decision.</p>',
  '',
  '  <h2>Connect an assistant</h2>',
  '  <p>Send your assistant this page or the guide below. It can read the manifest and request a short-lived, capability-scoped credential. The assistant cannot grant itself permissions.</p>',
  '  <ul>',
  ...guideItems,
  '  </ul>',
  '',
  '  <h2>Discovery</h2>',
  '  <ul>',
  '    <li>Manifest: <a href="' + esc(manifestUrl) + '">' + esc(manifestUrl) + '</a></li>',
  ...(tokenUrl === '' ? [] : [
    '    <li>Token: <a href="' + esc(tokenUrl) + '">' + esc(tokenUrl) + '</a></li>',
  ]),
  ...(executeUrl === '' ? [] : [
    '    <li>Invoke: <a href="' + esc(executeUrl) + '">' + esc(executeUrl) + '</a></li>',
  ]),
  '    <li>Full context: <a href="' + esc(llmsFullUrl) + '">' + esc(llmsFullUrl) + '</a></li>',
  '  </ul>',
  '',
  '  <h2>Public, auto-issued capabilities</h2>',
  '  <ul>',
  ...publicCapItems,
  '  </ul>',
  '  <p>Only registered public reads are auto-issued. Writes and private reads require a human grant. The kill switch is evaluated first; denials name the rule that fired.</p>',
  '',
  '  <h2>Every call is recorded</h2>',
  '  <p>The hosted governor appends agent identity, represented user, capability, redacted parameters, policy decision, rule, approval, result and duration to an append-only ledger. There is no update or delete path.</p>',
  '',
  ...(contactItems.length === 0 ? [] : [
    '  <h2>Contact and legal</h2>',
    '  <ul>',
    ...contactItems,
    '  </ul>',
  ]),
  '  <p class="muted">This page is a discovery pointer. It carries no policy engine, credential, ledger, approval queue or execution path.</p>',
  '  <!-- generated by agentport -->',
  '</body>',
  '</html>',
  '',
].join('\\n')
writeFileSync(at('.well-known/agent-access.html'), html)

const begin = '<!-- agentport:begin -->'
const end = '<!-- agentport:end -->'
const mergeBlock = (rel, block) => {
  const path = at(rel)
  if (!existsSync(path)) {
    writeFileSync(path, block + '\\n')
    return
  }
  const current = readFileSync(path, 'utf8')
  const start = current.indexOf(begin)
  const finish = current.indexOf(end)
  if (start >= 0 && finish > start) {
    writeFileSync(path, current.slice(0, start) + block + current.slice(finish + end.length))
  } else {
    writeFileSync(path, current.trimEnd() + '\\n\\n' + block + '\\n')
  }
}

const authLines = tokenUrl === ''
  ? [
    '- Ask the business for a business-issued, short-lived credential.',
    '- The credential names the capability and its scopes.',
  ]
  : [
    '- Token endpoint: ' + tokenUrl,
    '- Request body: {"capability":"<name>","agent":{"name":"<your-agent>"}}',
    '- The governor returns a short-lived bearer scoped to that capability (' +
      String(Number(live.authentication?.tokenTtlSeconds) || 300) + ' seconds).',
    '- The self-declared agent name is audit metadata, not a verified identity.',
  ]

const publicLines = publicCaps.length === 0
  ? ['- None are auto-issued. Ask the business for a scoped grant.']
  : publicCaps.map((cap) => '- ' + cap.name + ': ' + capDescription(cap))

const contactLines = [
  ...(docsUrl ? ['- Documentation: ' + docsUrl] : []),
  ...(supportUrl ? ['- Support: ' + supportUrl] : []),
  ...(privacyUrl ? ['- Privacy: ' + privacyUrl] : []),
  ...(termsUrl ? ['- Terms: ' + termsUrl] : []),
]

const llmsBlock = [
  begin,
  '# ' + business + ' — agent access',
  '',
  '> ' + businessDescription,
  '',
  '## Canonical discovery',
  '- Manifest: ' + manifestUrl,
  '- Human and agent access page: ' + accessUrl,
  '- Full context: ' + llmsFullUrl,
  '',
  '## Connect an agent',
  '- Custom agent guide: ' + guideUrl('custom.md'),
  ...(hasConnector ? [
    '- ChatGPT guide: ' + guideUrl('chatgpt.md'),
    '- Claude guide: ' + guideUrl('claude.md'),
  ] : []),
  '- If a user sends you this file or a guide link, follow that guide. Do not change your own permissions.',
  '',
  '## Public, auto-issued capabilities',
  ...publicLines,
  '',
  '## Authentication',
  ...authLines,
  '',
  '## Limits and approvals',
  '- Only registered public reads are auto-issued.',
  '- Writes and private reads require a human grant.',
  '- The kill switch is evaluated before every other rule.',
  '- A denial names the reason, rule, caller-safe detail and request id.',
  '- Every call is recorded by the hosted governor.',
  '',
  ...(contactLines.length === 0 ? [] : [
    '## Contact and legal',
    ...contactLines,
    '',
  ]),
  '## Notes',
  '- This file is a discovery and onboarding pointer, not policy.',
  '- The manifest is authoritative. Do not infer capabilities that are not listed.',
  '- Public pages remain public and may be scraped. Governed data is reachable only through Agent Port.',
  end,
].join('\\n')
mergeBlock('llms.txt', llmsBlock)

const llmsFullBlock = [
  begin,
  '# ' + business + ' — full agent context',
  '',
  '> ' + businessDescription,
  '',
  '## What this business does',
  businessDescription,
  '',
  '## Canonical endpoints',
  '- Manifest: ' + manifestUrl,
  '- Access page: ' + accessUrl,
  ...(tokenUrl === '' ? [] : ['- Token: ' + tokenUrl]),
  ...(executeUrl === '' ? [] : ['- Invoke: ' + executeUrl]),
  '',
  '## Public capabilities',
  ...publicLines,
  '',
  '## Authentication',
  ...authLines,
  '',
  '## Approvals and limits',
  '- Public reads are auto-issued.',
  '- Writes and private reads require a human grant.',
  '- The kill switch is evaluated first.',
  '- Denials are specific: reason, rule, detail and request id.',
  '',
  '## Data handling',
  '- Public marketing pages remain public and scrapeable.',
  '- Governed business data is reachable only through the hosted governor.',
  '- The governor redacts sensitive values, including inside arrays, before the ledger records them.',
  '- The ledger is append-only. There is no update or delete path.',
  '',
  ...(contactLines.length === 0 ? [] : [
    '## Contact and legal',
    ...contactLines,
    '',
  ]),
  '## Notes',
  '- The manifest is authoritative. This file is an onboarding aid, not policy.',
  '- An agent is never trusted for being an agent. Trust comes from a business-issued credential with named scopes.',
  end,
].join('\\n')
mergeBlock('llms-full.txt', llmsFullBlock)

const generatedMarker = '<!-- agentport:generated -->'
const writeGenerated = (rel, body) => {
  const path = at(rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, generatedMarker + '\\n\\n' + body.trimStart() + '\\n')
}
const removeGenerated = (rel) => {
  const path = at(rel)
  if (existsSync(path) && readFileSync(path, 'utf8').startsWith(generatedMarker)) rmSync(path)
}

const exampleCap = publicCaps[0]?.name || '<capability>'
const customGuide = [
  '# Connect a custom agent to ' + business,
  '',
  'This guide is for an agent or developer wiring an agent to ' + business + '. Read the manifest; do not guess endpoints.',
  '',
  '## Discovery',
  '- Manifest: ' + manifestUrl,
  '- Access page: ' + accessUrl,
  '- Full context: ' + llmsFullUrl,
  '',
  '## 1. Get a scoped credential',
  tokenUrl === ''
    ? 'Ask the business for a business-issued, short-lived credential scoped to the capability you need.'
    : [
      'POST ' + tokenUrl,
      'Content-Type: application/json',
      '',
      '{"capability":"' + exampleCap + '","agent":{"name":"your-agent"}}',
      '',
      'The response contains a short-lived bearer token. Send it as \`Authorization: Bearer <token>\`. The self-declared agent name is audit metadata, not a verified identity.',
    ].join('\\n'),
  '',
  '## 2. Invoke the capability',
  executeUrl === ''
    ? 'The manifest names the invoke endpoint.'
    : [
      'POST ' + executeUrl,
      'Authorization: Bearer <token>',
      'Content-Type: application/json',
      '',
      '{"capability":"' + exampleCap + '","arguments":{},"agent":{"name":"your-agent"}}',
    ].join('\\n'),
  '',
  '## 3. Read a denial',
  'A refusal carries a machine-readable \`reason\`, the \`rule\` that fired, a caller-safe \`detail\` and a \`requestId\`. Do not retry blindly and do not route around the control. Do not ask a human to approve something policy has already denied.',
  '',
  '## What is auto-issued',
  ...publicLines,
  '',
  '## What requires a human',
  '- Writes and private reads.',
  '- Any capability not listed above.',
  '- A request that the kill switch or policy has already denied.',
  '',
  '## Rules',
  '- Use the token only for the capability it names.',
  '- Do not treat a user-agent string as identity.',
  '- Do not cache or reuse an expired token.',
  '- Every call is evaluated and recorded by the hosted governor.',
  '',
  'This guide makes no policy decision. The hosted governor remains the authority.',
].join('\\n')
writeGenerated(join(guideDir, 'custom.md'), customGuide)

if (hasConnector) {
  const chatgptGuide = [
    '# Connect ChatGPT to ' + business,
    '',
    'Use the hosted Agent Port connector: ' + connectorUrl,
    '',
    '## Steps',
    '1. Open the connector URL in ChatGPT.',
    '2. Sign in to ' + business + ' and grant the scopes you want the assistant to use.',
    '3. Ask ChatGPT to use the connector for a public read.',
    '4. If a tool needs a write or private read, expect a human approval step.',
    '',
    '## Rules',
    '- The connector holds no local secret in this repository.',
    '- Every tool call goes through the hosted governor.',
    '- ChatGPT cannot grant itself a scope or approve its own request.',
    '- A denial names the rule; read it instead of retrying blindly.',
    '',
    'This guide makes no policy decision. The hosted governor remains the authority.',
  ].join('\\n')
  const claudeGuide = [
    '# Connect Claude to ' + business,
    '',
    'Use the hosted Agent Port connector: ' + connectorUrl,
    '',
    '## Steps',
    '1. Add the connector URL in Claude.',
    '2. Sign in to ' + business + ' and grant the scopes you want the assistant to use.',
    '3. Ask Claude to use the connector for a public read.',
    '4. If a tool needs a write or private read, expect a human approval step.',
    '',
    '## Rules',
    '- The connector holds no local secret in this repository.',
    '- Every tool call goes through the hosted governor.',
    '- Claude cannot grant itself a scope or approve its own request.',
    '- A denial names the rule; read it instead of retrying blindly.',
    '',
    'This guide makes no policy decision. The hosted governor remains the authority.',
  ].join('\\n')
  writeGenerated(join(guideDir, 'chatgpt.md'), chatgptGuide)
  writeGenerated(join(guideDir, 'claude.md'), claudeGuide)
} else {
  // A connector guide without a connector is a dead end. Remove only files
  // this generator owns; never delete a merchant-authored guide.
  removeGenerated(join(guideDir, 'chatgpt.md'))
  removeGenerated(join(guideDir, 'claude.md'))
}

console.log('agentport: wrote the hosted governor manifest and onboarding guides into ' + config.publishDir)
`

export const VERIFY_SCRIPT = `#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = dirname(here)
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'))
const target = config.publishDir === '.' ? packageRoot : join(packageRoot, config.publishDir)
const at = (rel) => join(target, rel)
const localOnly = process.argv.includes('--local')

const failures = []
const warnings = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}
const warn = (message) => warnings.push(message)

const read = (rel) => {
  try {
    return readFileSync(at(rel), 'utf8')
  } catch {
    return null
  }
}
const readSource = (rel) => {
  try {
    return readFileSync(join(packageRoot, rel), 'utf8')
  } catch {
    return null
  }
}

const get = async (url, options = {}) => {
  const res = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    ...options,
  }).catch(() => null)
  if (res === null) return { status: 0, text: '', headers: new Headers() }
  return { status: res.status, text: await res.text(), headers: res.headers }
}

const getText = async (url) => {
  const res = await get(url)
  return res.status === 200 ? res.text : null
}

const trimSlash = (value) => {
  let s = String(value ?? '')
  while (s.endsWith('/')) s = s.slice(0, -1)
  return s
}

// generatedAt changes between governor reads; it is not part of the selection.
const canon = (value) => {
  if (Array.isArray(value)) return value.map(canon)
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (key !== 'generatedAt') out[key] = canon(value[key])
    }
    return out
  }
  return value
}

const escapeRe = (value) => value.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
const boundary = (value) => new RegExp('(^|[^A-Za-z0-9_])' + escapeRe(value) + '([^A-Za-z0-9_]|$)')

const liveRes = await get(config.manifestUrl, { headers: { accept: 'application/json' } })
let live = null
check(liveRes.status === 200, 'hosted manifest returned ' + liveRes.status)
if (liveRes.status === 200) {
  try {
    live = JSON.parse(liveRes.text)
  } catch {
    check(false, 'hosted manifest is not valid JSON')
  }
}

const siteUrl = trimSlash(config.siteUrl)
const guideDir = String(config.agentGuidesDir || 'agent').replace(/^\\/+|\\/+$/g, '')
const connectorUrl = String(config.connectorUrl || config.mcpUrl || '').trim()
const hasConnector = connectorUrl !== ''

if (live !== null) {
  const sameTenant =
    (Boolean(config.workerUrl) && typeof live.baseUrl === 'string' &&
      trimSlash(live.baseUrl) === trimSlash(config.workerUrl)) ||
    (Boolean(config.manifestUrl) && typeof live.endpoints?.manifest === 'string' &&
      trimSlash(live.endpoints.manifest) === trimSlash(config.manifestUrl))
  check(live.version === '1.0', 'hosted manifest version is not 1.0')
  check(sameTenant, 'hosted manifest is for a different tenant')
  check(live.authentication?.scheme === 'bearer', 'hosted manifest does not advertise bearer authentication')
  check(typeof live.business === 'string' && live.business.trim() !== '', 'hosted manifest has no business name')
  check(Array.isArray(live.capabilities), 'hosted manifest has no capability list')
  check(
    typeof live.business === 'string' && Array.isArray(live.capabilities),
    'manifest is not an AgentPort manifest (possible A2A card overwrite)',
  )
}

let servedText = null
if (localOnly && config.manifestMode === 'redirect') {
  const route = readSource('app/.well-known/agent.json/route.ts')
  check(route !== null, 'no redirect route found at app/.well-known/agent.json/route.ts')
  if (route !== null) {
    check(route.includes(config.manifestUrl), 'redirect route does not point at the canonical manifest')
  }
  check(
    read('.well-known/agent.json') === null,
    'a stale .well-known/agent.json snapshot is still present in the publish dir',
  )
} else if (localOnly) {
  servedText = read('.well-known/agent.json')
  check(servedText !== null, 'no local published manifest found; run publish first')
} else {
  servedText = await getText(new URL('/.well-known/agent.json', siteUrl).toString())
  check(servedText !== null, 'served manifest is missing')
}

if (servedText !== null) {
  let served = null
  try {
    served = JSON.parse(servedText)
  } catch {
    check(false, 'served manifest is not valid JSON')
  }
  if (served !== null && live !== null) {
    check(
      JSON.stringify(canon(served)) === JSON.stringify(canon(live)),
      'published manifest does not match the hosted governor selection',
    )
  }
  // generatedAt changes between governor reads, so a raw digest is not a
  // stable contract. The canonical comparison above is the authority.
}

const caps = live !== null && Array.isArray(live.capabilities) ? live.capabilities : []
const names = caps.map((cap) => cap.name)
const autoIssue = live !== null && Array.isArray(live.authentication?.autoIssue)
  ? live.authentication.autoIssue
  : []
const capByName = new Map(caps.map((cap) => [cap.name, cap]))
check(new Set(names).size === names.length, 'hosted manifest has duplicate capability names')
for (const name of autoIssue) {
  const cap = capByName.get(name)
  check(Boolean(cap), 'autoIssue names a capability not in the manifest: ' + name)
  if (cap) check(cap.dataClass === 'public', 'autoIssue includes a non-public capability: ' + name)
}
const publicCaps = autoIssue.map((name) => capByName.get(name)).filter(Boolean)
const nonPublicNames = caps.filter((cap) => cap.dataClass !== 'public').map((cap) => cap.name)

if (caps.length > 0 && caps.every((cap) => !('input' in cap) && !('output' in cap))) {
  warn('manifest capabilities have no input/output schemas; protocol clients cannot build typed actions')
}
if (caps.some((cap) => /^(GET|POST|PUT|PATCH|DELETE) \\//.test(String(cap.description || '')))) {
  warn('manifest descriptions are path-level; add behavior descriptions')
}

const llmsText = localOnly
  ? read('llms.txt')
  : await getText(new URL('/llms.txt', siteUrl).toString())
check(llmsText !== null, 'llms.txt is missing')
if (llmsText !== null) {
  check(llmsText.includes(config.manifestUrl), 'llms.txt does not name the canonical manifest')
  check(llmsText.includes(guideDir + '/custom.md'), 'llms.txt does not link the custom agent guide')
  for (const cap of publicCaps) {
    check(boundary(cap.name).test(llmsText), 'llms.txt does not name public capability ' + cap.name)
  }
  for (const name of nonPublicNames) {
    check(!boundary(name).test(llmsText), 'llms.txt leaks non-public capability ' + name)
  }
  if (publicCaps.length === 0) check(llmsText.includes('None'), 'llms.txt does not explain that nothing is auto-issued')
  if (!hasConnector) {
    check(!llmsText.includes(guideDir + '/chatgpt.md'), 'llms.txt advertises a ChatGPT guide without connectorUrl')
    check(!llmsText.includes(guideDir + '/claude.md'), 'llms.txt advertises a Claude guide without connectorUrl')
  }
}

const fullText = localOnly
  ? read('llms-full.txt')
  : await getText(new URL('/llms-full.txt', siteUrl).toString())
check(fullText !== null, 'llms-full.txt is missing')
if (fullText !== null) {
  if (live !== null) check(fullText.includes(live.business), 'llms-full.txt does not name the business')
  for (const name of nonPublicNames) {
    check(!boundary(name).test(fullText), 'llms-full.txt leaks non-public capability ' + name)
  }
}

const accessText = localOnly
  ? read('.well-known/agent-access.html')
  : await getText(new URL('/.well-known/agent-access.html', siteUrl).toString())
check(accessText !== null, 'agent-access.html is missing')
if (accessText !== null) {
  check(accessText.includes(config.manifestUrl), 'agent-access.html does not name the canonical manifest')
  check(accessText.includes(guideDir + '/custom.md'), 'agent-access.html does not link the custom agent guide')
  for (const name of nonPublicNames) {
    check(!boundary(name).test(accessText), 'agent-access.html leaks non-public capability ' + name)
  }
}

const tokenUrl = live === null
  ? ''
  : String(live.endpoints?.token ?? live.authentication?.tokenEndpoint ?? '')
const executeUrl = live === null
  ? String(config.executeUrl || '')
  : String(live.endpoints?.execute ?? config.executeUrl ?? '')
const customText = localOnly
  ? read(join(guideDir, 'custom.md'))
  : await getText(new URL('/' + guideDir + '/custom.md', siteUrl).toString())
check(customText !== null, 'custom agent guide is missing')
if (customText !== null) {
  check(customText.includes(config.manifestUrl), 'custom agent guide does not name the manifest')
  if (tokenUrl) check(customText.includes(tokenUrl), 'custom agent guide does not name the token endpoint')
  if (executeUrl) check(customText.includes(executeUrl), 'custom agent guide does not name the invoke endpoint')
  for (const name of nonPublicNames) {
    check(!boundary(name).test(customText), 'custom agent guide leaks non-public capability ' + name)
  }
}

for (const [file, label] of [['chatgpt.md', 'ChatGPT'], ['claude.md', 'Claude']]) {
  const text = localOnly
    ? read(join(guideDir, file))
    : await getText(new URL('/' + guideDir + '/' + file, siteUrl).toString())
  if (hasConnector) {
    check(text !== null, label + ' guide is missing')
    if (text !== null) check(text.includes(connectorUrl), label + ' guide does not name the connector')
  } else if (text !== null) {
    if (text.startsWith('<!-- agentport:generated -->')) {
      check(false, label + ' guide is a stale generated guide; remove it or set connectorUrl')
    } else {
      warn(label + ' guide exists without connectorUrl; review it')
    }
  }
}

if (localOnly) {
  check(!existsSync(at('.well-known/ai-plugin.json')), 'ai-plugin.json must not exist; it is deprecated and not an Agent Port artifact')
} else {
  const aiPlugin = await get(new URL('/.well-known/ai-plugin.json', siteUrl).toString())
  check(aiPlugin.status === 404, 'ai-plugin.json must return 404; it is deprecated and not an Agent Port artifact')
}

const robotsSource = readSource('app/robots.ts')
if (robotsSource !== null) {
  check(robotsSource.includes('GPTBot'), 'app/robots.ts does not name GPTBot')
  check(robotsSource.includes('ClaudeBot'), 'app/robots.ts does not name ClaudeBot')
} else {
  warn('app/robots.ts was not found; add AI crawler rules for this framework')
}
if (!localOnly) {
  const robotsText = await getText(new URL('/robots.txt', siteUrl).toString())
  check(robotsText !== null, 'robots.txt is missing')
  if (robotsText !== null) {
    check(robotsText.includes('Disallow: /internal'), 'robots.txt does not disallow /internal')
    check(robotsText.includes('Sitemap:'), 'robots.txt does not name the sitemap')
    if (!robotsText.includes('GPTBot')) {
      warn('live robots.txt does not name AI crawlers yet; deploy app/robots.ts')
    }
  }
}

const layoutSource = readSource('app/layout.tsx')
if (layoutSource !== null) {
  check(layoutSource.includes('agent.json'), 'app/layout.tsx does not declare the agent.json alternate link')
  check(layoutSource.includes('application/json'), 'app/layout.tsx alternate link is not application/json')
} else {
  warn('app/layout.tsx was not found; add the agent.json alternate link for this framework')
}
if (!localOnly) {
  const homepage = await getText(siteUrl + '/')
  check(homepage !== null, 'homepage is missing')
  if (homepage !== null && (!homepage.includes('alternate') || !homepage.includes('agent.json'))) {
    warn('live homepage does not expose the agent.json alternate link yet; deploy the staged app/layout.tsx change')
  }
}

const generatedPaths = [
  '.well-known/agent.json',
  'llms.txt',
  'llms-full.txt',
  '.well-known/agent-access.html',
  join(guideDir, 'custom.md'),
  ...(hasConnector ? [join(guideDir, 'chatgpt.md'), join(guideDir, 'claude.md')] : []),
]
const secretPatterns = [
  ['vsk token', /vsk_[A-Za-z0-9]+/],
  ['sk token', /sk-[A-Za-z0-9]{20,}/],
  ['private key', /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/],
  ['supabase service role', /SUPABASE_SERVICE_ROLE/],
  ['agentport secret', /AGENTPORT_[A-Z0-9_]*SECRET/],
]
for (const rel of generatedPaths) {
  const text = read(rel)
  if (text === null) continue
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) failures.push(label + ' found in ' + rel)
  }
}

for (const message of warnings) console.warn('agentport: warning: ' + message)
if (failures.length > 0) {
  for (const message of failures) console.error('agentport: ' + message)
  process.exit(1)
}
console.log(
  'agentport: discovery verified' +
  (localOnly ? ' locally' : ' against the hosted governor'),
)
`
