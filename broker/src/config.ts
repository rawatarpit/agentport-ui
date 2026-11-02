// Broker config - pinned CA for TLS
const caPath = '/opt/agentport-github-broker/supabase-root-2021-ca.pem';
export { caPath };

// Types for broker integration
export type BrokerConfig = {
  githubAppId: string
  githubAppPrivateKey: string
}

export const missingGithubConfig = {}