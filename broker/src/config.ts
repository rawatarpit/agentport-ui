// Broker config - pinned CA for TLS
const caPath = '/opt/agentport-github-broker/supabase-root-2021-ca.pem';
export { caPath };

// Types for broker integration. Every field here is read by handlers.ts or
// caller.ts; keeping the shape explicit is what lets the Next build typecheck
// the broker without a separate package.
export type BrokerConfig = {
  githubAppId: string
  githubAppPrivateKey: string
  githubClientId: string
  githubClientSecret: string
  githubWebhookSecret: string
  workerUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
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