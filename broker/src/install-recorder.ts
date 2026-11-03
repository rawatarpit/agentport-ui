// Install recorder for GitHub broker
// Records GitHub install events for the agentport broker service
export type InstallRecorder = {
  record: (opts: {
    tenantId: string
    installationId: number
    accountLogin: string
    installerLogin: string | null
  }) => Promise<boolean>
}