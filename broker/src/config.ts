import { normalizeAppPrivateKey } from '@/lib/github'

/**
 * Broker configuration is read once at process start.
 *
 * The broker is the only component that holds GitHub App credentials. The
 * console receives a shared service token and a user JWT, never a GitHub
 * secret. Missing values are reported by name, never by value.
 */
export type BrokerConfig = {
  port: number
  supabaseUrl: string
  supabaseAnonKey: string
  githubAppId: string
  githubAppPrivateKey: string
  githubClientId: string
  githubClientSecret: string
  githubWebhookSecret: string
  brokerToken: string
  stateFile: string
  databaseUrl: string
  workerUrl: string
  consoleOrigin: string
}

function read(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? '').trim()
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BrokerConfig {
  const port = Number(read(env, 'PORT') || '8790')
  return {
    port: Number.isSafeInteger(port) && port > 0 && port < 65_536 ? port : 8790,
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
    workerUrl: read(env, 'AGENTPORT_WORKER_URL'),
    consoleOrigin: read(env, 'CONSOLE_ORIGIN') || 'https://agentport.relayforge.in',
  }
}

/** The GitHub App values the connect screen reports as missing. */
export function missingGithubConfig(config: BrokerConfig): string[] {
  return [
    !config.githubAppId && 'GITHUB_APP_ID — from the App settings page',
    !config.githubAppPrivateKey && 'GITHUB_APP_PRIVATE_KEY — server-only',
    !config.githubWebhookSecret && 'GITHUB_WEBHOOK_SECRET — set on the App',
    !config.githubClientId && 'GITHUB_CLIENT_ID — App settings page',
    !config.githubClientSecret && 'GITHUB_CLIENT_SECRET — server-only',
  ].filter((v): v is string => typeof v === 'string')
}

/** Fail before serving if the broker cannot authenticate a caller. */
export function fatalConfigProblems(config: BrokerConfig): string[] {
  return [
    !config.supabaseUrl && 'SUPABASE_URL',
    !config.supabaseAnonKey && 'SUPABASE_ANON_KEY',
    !config.brokerToken && 'GITHUB_BROKER_TOKEN',
  ].filter((v): v is string => typeof v === 'string')
}
