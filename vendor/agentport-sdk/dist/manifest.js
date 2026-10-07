/**
 * Builds the /.well-known/agent.json document (DISCOVER).
 *
 * The manifest is generated from what is actually registered and configured,
 * never hand-maintained, so it cannot drift from the enforcement path. An agent
 * reads this to learn what exists, what it needs to authenticate with, and
 * which actions will be held for a human.
 */
export function buildManifest(options) {
    const { business, baseUrl, capabilities, policy, now } = options;
    const root = baseUrl.replace(/\/$/, '');
    const ordered = [...capabilities.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
        version: '1.0',
        business,
        baseUrl: root,
        generatedAt: now.toISOString(),
        capabilities: ordered.map((c) => ({
            name: c.name,
            description: c.description,
            access: c.access,
            dataClass: c.dataClass ?? 'internal',
            requiresApproval: c.requiresApproval === true,
            input: c.input ?? null,
        })),
        authentication: {
            scheme: 'bearer',
            header: 'Authorization',
            note: 'Send a short-lived scoped token. An agent is not trusted because it is an AI agent; it is trusted because the business issued it a credential with named scopes.',
        },
        policies: {
            maxOrderValue: policy.maxOrderValue,
            absoluteMaxOrderValue: policy.absoluteMaxOrderValue,
            rateLimit: policy.rateLimit
                ? {
                    requestsPerMinute: policy.rateLimit.requestsPerMinute,
                    scope: policy.rateLimit.scope ?? 'agent',
                }
                : undefined,
            requiresApproval: policy.alwaysRequireApproval ?? [],
            forbidden: policy.forbiddenCapabilities ?? [],
            restrictedDataClasses: policy.restrictedDataClasses ?? [],
            bulkOrderThreshold: policy.bulkOrderThreshold,
            // Deliberately NOT published. Every other field here is configuration: a
            // ceiling, a threshold, a list of names, and an agent that reads one is
            // learning the rules it will be measured against — which is the point of
            // DISCOVER. The kill switch is not configuration, it is the merchant's
            // live emergency posture, and this endpoint answers before any credential
            // is presented. Publishing it told every unauthenticated caller whether a
            // shop was currently refusing writes, which is a free readiness oracle: an
            // agent (or anyone reading the public catalogue) could watch the flag flip
            // and time its requests to the window where the shop had stopped denying.
            //
            // An agent does not need it, because invariant 2 already covers the case —
            // a write refused under the kill switch carries `rule: 'emergency_kill_switch'`
            // and a detail naming the switch, so the agent learns the state from the
            // refusal itself, which is both accurate and scoped to a caller that was
            // actually trying. The field is omitted rather than sent as `false`,
            // because "this shop is not in an emergency" is also information, and an
            // absent field is the only answer that asserts nothing.
            //
            // Spread conditionally rather than assigned `undefined`, because the
            // difference is load-bearing at the boundary and nothing downstream would
            // have caught it: an explicit `emergencyKillSwitch: undefined` creates the
            // key, `JSON.stringify` then drops it, so the served document was correct
            // and the in-process `manifest()` object was not. An agent embedding the
            // SDK and reading the object directly — the documented way to use DISCOVER
            // without a transport — would have seen the key and could have reported a
            // readiness signal the HTTP manifest deliberately withholds.
        },
        errorContract: [
            { reason: 'unauthenticated', detail: 'No verified agent identity was presented.' },
            { reason: 'identity_expired', detail: 'The presented credential has expired.' },
            { reason: 'insufficient_scope', detail: 'The credential lacks the scope this capability requires.' },
            {
                reason: 'delegation_insufficient',
                detail: "The credential is in scope, but the user who delegated to it permitted less than this call. The user's delegation is a ceiling on the agent, never a floor, so a wider credential cannot widen it.",
            },
            { reason: 'unknown_capability', detail: 'No such capability is registered.' },
            { reason: 'policy_denied', detail: 'A business policy forbids this call. The detail names the rule.' },
            { reason: 'rate_limited', detail: 'Too many requests. The detail carries the retry window.' },
            { reason: 'approval_required', detail: 'Held for a human. Nothing has executed.' },
            { reason: 'approval_rejected', detail: 'A human declined. The call did not run.' },
            {
                reason: 'validation_failed',
                detail: 'The payload does not match what this capability accepts. The detail names each field, and nothing was executed or written.',
            },
        ],
        endpoints: {
            manifest: `${root}/.well-known/agent.json`,
            execute: `${root}/.well-known/agent/invoke`,
        },
    };
}
//# sourceMappingURL=manifest.js.map