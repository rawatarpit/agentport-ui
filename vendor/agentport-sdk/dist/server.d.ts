import { AgentPort } from './agent.js';
import type { AgentPortFile } from './config.js';
import { AnalyticsRecorder } from './analytics.js';
export interface ServeOptions {
    port: number;
    host?: string;
    /** Printed per request. Off by default so a request log is a choice. */
    verbose?: boolean;
}
export interface RunningServer {
    port: number;
    close: () => Promise<void>;
}
export declare function startAgent(config: AgentPortFile, env: NodeJS.ProcessEnv | undefined, options: ServeOptions): Promise<{
    port: AgentPort;
    server: RunningServer;
    analytics?: AnalyticsRecorder;
}>;
//# sourceMappingURL=server.d.ts.map