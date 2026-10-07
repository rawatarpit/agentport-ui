export { AgentPort } from './agent.js';
export { PolicyEngine } from './policy.js';
export { redact } from './ledger.js';
export { SqlLedger, SqlIdempotencyStore, LEDGER_DDL, LEDGER_DDL_STATEMENTS } from './sql.js';
export { createStderrLogger } from './logger.js';
export { buildManifest } from './manifest.js';
export { AgentPortError, ApprovalRequiredError, PolicyDeniedError, RateLimitedError, UnauthenticatedError, UnknownCapabilityError, } from './errors.js';
export { validateInput, bindParameters, describeIssues } from './validate.js';
// `UnenforceableConfigError` is thrown by `startAgent`, which lives behind
// `./node`. Exporting it here rather than only there means an embedder can name
// it in a `catch` without importing the Node entry, which is the same treatment
// `ConfigError` has always had.
export { parseConfig, doctor, ConfigError, UnenforceableConfigError } from './config.js';
export { SqlApprovalStore, APPROVAL_DDL_STATEMENTS } from './sql.js';
// `startAgent` (node:http), `openSqlite` (node:sqlite) and `loadConfig`
// (node:fs) are exported from `./node`, not here — see src/node.ts and
// test/architecture.test.ts, which fails if this graph reaches a `node:`
// builtin. Importing them from the root was a breaking change in 0.2.0.
export { issueToken, verifyToken } from './identity.js';
export { buildCapabilities, placeholders, sqliteDriver } from './capabilities.js';
export { executeHttp, resolveFrozenTarget, fillSlots, slotsIn, HttpSourceError } from './http.js';
// Analytics is opt-in and additive: nothing in the enforcement path imports
// this module, and the only thing here that can make a network call is
// `createFetchAnalyticsSink`, which refuses to be built without an explicit
// endpoint and push key. It uses the platform `fetch` rather than an import, so
// it stays inside the default graph's "no bare specifier" rule.
export { AnalyticsRecorder, createFetchAnalyticsSink, analyticsProjectionBytes, serializeAnalyticsPush, distinctCallers, callerMetrics, ANALYTICS_EVENT_KINDS, LOCAL_ANALYTICS_FAILURES, } from './analytics.js';
//# sourceMappingURL=index.js.map