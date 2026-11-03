// Broker config. Every field here is read by handlers.ts, caller.ts or
// server.ts; keeping the shape explicit is what lets the Next build typecheck
// the broker without a separate package.
import { normalizeAppPrivateKey } from '@/lib/github'

// Pinned Supabase root CA for the pooler connection. The path is fixed so a
// deployment cannot silently trust a different certificate.
const caPath = '/opt/agentport-github-broker/supabase-root-2021-ca.pem'
export { caPath }

export type BrokerConfig = {
  port: number
  githubAppId: string
  githubAppPrivateKey: string
  githubClientId: string
  githubClientSecret: string
  githubWebhookSecret: string
  brokerToken: string
  stateFile: string
  databaseUrl: string
  databaseCaFile: string
  workerUrl: string
  consoleOrigin: string
  supabaseUrl: string
  supabaseAnonKey: string
}

function read(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? '').trim()
}

export function loadConfig(env: Record<string, string | undefined> = process.env): BrokerConfig {
  const port = Number(read(env, 'PORT') || '8790')
  return {
    port: Number.isSafeInteger(port) && port > 0 && port < 65536 ? port : 8790,
    supabaseUrl: read(env, 'SUPABASE_URL') || read(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read(env, 'SUPABASE_ANON_KEY') || read(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    githubAppId: read(env, 'GITHUB_APP_ID'),
    githubAppPrivateKey: normalizeAppPrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    githubClientId: read(env, 'GITHUB_CLIENT_ID'),
    githubClientSecret: read(env, 'GITHUB_CLIENT_SECRET'),
    githubWebhookSecret: read(env, 'GITHUB_WEBHOOK_SECRET'),
    brokerToken: read(env, 'GITHUB_BROKER_TOKEN'),
    stateFile: read(env, 'BROKER_STATE_FILE') || '/var/lib/agentport-github-broker/state.json',
    databaseUrl: read(env, 'BROKER_DATABASE_URL'),
    databaseCaFile: read(env, 'BROKER_DATABASE_CA_FILE'),
    workerUrl: read(env, 'AGENTPORT_WORKER_URL'),
    consoleOrigin: read(env, 'CONSOLE_ORIGIN') || 'https://agentport.relayforge.in',
  }
}

export function missingGithubConfig(config: BrokerConfig): string[] {
  const missing: string[] = []
  if (!config.githubAppId) missing.push('GITHUB_APP_ID')
  if (!config.githubAppPrivateKey) missing.push('GITHUB_APP_PRIVATE_KEY')
  if (!config.githubClientId) missing.push('GITHUB_CLIENT_ID')
  if (!config.githubClientSecret) missing.push('GITHUB_CLIENT_SECRET')
  if (!config.githubWebhookSecret) missing.push('GITHUB_WEBHOOK_SECRET')
  if (!config.workerUrl) missing.push('AGENTPORT_WORKER_URL')
  if (!config.supabaseUrl) missing.push('SUPABASE_URL')
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY')
  return missing
}

/** Configuration the broker cannot start without: auth for callers and the
 *  token every console request must present. GitHub App keys may be absent
 *  while the App is being provisioned; the /status endpoint reports that. */
export function fatalConfigProblems(config: BrokerConfig): string[] {
  const missing: string[] = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL')
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY')
  if (!config.brokerToken) missing.push('GITHUB_BROKER_TOKEN')
  return missing
}
