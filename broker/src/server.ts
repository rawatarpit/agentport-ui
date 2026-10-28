import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { loadConfig, fatalConfigProblems, missingGithubConfig } from './config'
import { InstallRecorder } from './install-recorder'
import { InstallStateStore } from './state-store'
import {
  handleCallback,
  handleDiag,
  handleInstall,
  handleInstallations,
  handlePrOpen,
  handlePrState,
  handleRepos,
  handleStatus,
  handleTree,
  handleWebhook,
  type BrokerResponse,
} from './handlers'

const MAX_BODY = 2 * 1024 * 1024

function header(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right) return false
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function send(res: ServerResponse, result: BrokerResponse): void {
  const body = JSON.stringify(result.body)
  res.writeHead(result.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readBody(req: IncomingMessage, max = MAX_BODY): Promise<string> {
  const declared = Number(header(req, 'content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) {
    throw new Error('body too large')
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > max) throw new Error('body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseJson(raw: string): unknown {
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

const config = loadConfig()
const stateStore = new InstallStateStore(config.stateFile)
const recorder = new InstallRecorder(config.databaseUrl)

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname
  const method = req.method ?? 'GET'
  const jwtHeader = header(req, 'authorization') ?? ''
  const jwt = jwtHeader.startsWith('Bearer ') ? jwtHeader.slice('Bearer '.length).trim() : ''

  if (path === '/health' && method === 'GET') {
    send(res, { status: 200, body: { ok: true, rev: 'github-broker-1' } })
    return
  }

  if (path === '/webhook' && method === 'POST') {
    let raw = ''
    try {
      raw = await readBody(req, 1_000_000)
    } catch {
      send(res, { status: 413, body: { status: 'error', reason: 'Delivery body too large.' } })
      return
    }
    send(
      res,
      handleWebhook({
        config,
        rawBody: raw,
        signature: header(req, 'x-hub-signature-256'),
        event: header(req, 'x-github-event') ?? '',
        delivery: header(req, 'x-github-delivery') ?? '',
      }),
    )
    return
  }

  if (!safeEqual(header(req, 'x-agentport-broker-token') ?? '', config.brokerToken)) {
    send(res, { status: 401, body: { status: 'error', reason: 'Broker token missing or invalid.' } })
    return
  }

  if (path === '/status' && method === 'GET') {
    send(res, handleStatus(config))
    return
  }

  if (path === '/diag' && method === 'GET') {
    send(res, await handleDiag({ config, jwt }))
    return
  }

  if (path === '/install' && method === 'POST') {
    let body: unknown
    try {
      body = parseJson(await readBody(req))
    } catch {
      send(res, { status: 400, body: { status: 'error', reason: 'Body must be JSON.' } })
      return
    }
    const tenantId =
      typeof (body as { tenantId?: unknown }).tenantId === 'string'
        ? ((body as { tenantId: string }).tenantId ?? '').trim()
        : ''
    send(res, await handleInstall({ config, jwt, tenantId, stateStore }))
    return
  }

  if (path === '/callback' && method === 'GET') {
    send(
      res,
      await handleCallback({ config, jwt, query: url.searchParams, stateStore, recorder }),
    )
    return
  }

  if (path === '/installations' && method === 'GET') {
    const tenantId = (url.searchParams.get('tenantId') ?? '').trim()
    send(res, await handleInstallations({ config, jwt, tenantId }))
    return
  }

  if (path === '/repos' && method === 'GET') {
    const tenantId = (url.searchParams.get('tenantId') ?? '').trim()
    const installationId = Number(url.searchParams.get('installation') ?? '')
    send(res, await handleRepos({ config, jwt, tenantId, installationId }))
    return
  }

  if (path === '/tree' && method === 'GET') {
    const tenantId = (url.searchParams.get('tenantId') ?? '').trim()
    const installationId = Number(url.searchParams.get('installation') ?? '')
    const repo = (url.searchParams.get('repo') ?? '').trim()
    const ref = (url.searchParams.get('ref') ?? '').trim()
    send(res, await handleTree({ config, jwt, tenantId, installationId, repo, ref }))
    return
  }

  if (path === '/pr/open' && method === 'POST') {
    let body: unknown
    try {
      body = parseJson(await readBody(req))
    } catch {
      send(res, { status: 400, body: { status: 'error', reason: 'Body must be JSON.' } })
      return
    }
    send(res, await handlePrOpen({ config, jwt, body }))
    return
  }

  if (path === '/pr/state' && method === 'GET') {
    const tenantId = (url.searchParams.get('tenantId') ?? '').trim()
    const repo = (url.searchParams.get('repo') ?? '').trim()
    send(res, await handlePrState({ config, jwt, tenantId, repo }))
    return
  }

  send(res, { status: 404, body: { status: 'error', reason: 'Not found.' } })
}

const fatal = fatalConfigProblems(config)
if (fatal.length > 0) {
  console.error(`github broker cannot start; missing: ${fatal.join(', ')}`)
  process.exit(1)
}
if (!config.githubAppPrivateKey || !config.githubClientSecret || !config.githubWebhookSecret) {
  console.warn(`github broker starting without complete GitHub App config: ${missingGithubConfig(config).join('; ')}`)
}
if (!config.databaseUrl) {
  console.warn('github broker has no BROKER_DATABASE_URL; installation recording will fail closed')
}

const server = createServer((req, res) => {
  route(req, res).catch(() => {
    // Never include the request body, headers, JWT or env in a log line.
    console.error(`github broker request failed: ${req.method ?? 'GET'} ${req.url ?? '/'}`)
    if (!res.headersSent) {
      send(res, { status: 500, body: { status: 'error', reason: 'Broker failed.' } })
    } else {
      res.end()
    }
  })
})

server.listen(config.port, '127.0.0.1', () => {
  console.log(`github broker listening on 127.0.0.1:${config.port}`)
})

function shutdown(): void {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
