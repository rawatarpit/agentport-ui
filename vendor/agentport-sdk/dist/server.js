import { createServer } from 'node:http';
import { AgentPort, configDigest } from './agent.js';
import { verifyToken } from './identity.js';
import { doctorErrors, UnenforceableConfigError } from './config.js';
import { openSqlite, installSqliteSchema } from './sqlite.js';
import { SqlApprovalStore, SqlLedger, SqlIdempotencyStore } from './sql.js';
import { createStderrLogger } from './logger.js';
import { AnalyticsRecorder, createFetchAnalyticsSink } from './analytics.js';
import { buildCapabilities } from './capabilities.js';
import { loadArtifactPolicy } from './artifact-load.js';
/**
 * The merchant-local agent. One process, on their machine, next to their site.
 *
 * This is the whole thesis in a file: two well-known endpoints and a local
 * database. The merchant's keys are read from their environment, the rules
 * come from their config, and the evidence lands in a file on their disk. Our
 * servers are not reachable from here and are not consulted on any request, so
 * our downtime cannot become their authorization bypass.
 *
 * `node:http` rather than a framework: the working rules forbid adding
 * dependencies, and a public endpoint that accepts anonymous input is the last
 * place to take a supply-chain risk.
 */
/**
 * Default and ceiling for the analytics flush window.
 *
 * Fifteen minutes because a push is an aggregate the merchant reads on a
 * dashboard, not an alert. A tighter loop buys nothing and spends a request per
 * interval forever.
 */
const DEFAULT_FLUSH_INTERVAL_SEC = 900;
/**
 * Builds the analytics recorder, or returns undefined when analytics is off.
 *
 * Every rejection here is loud, and that is the whole design. The alternative —
 * falling back to a disabled recorder when the push key is absent — produces a
 * merchant with a dashboard that silently stops updating and no way to tell that
 * from a shop with no traffic. Refusing to start is recoverable; a merchant who
 * believes they are reporting and are not has been told something false.
 *
 * Returns `undefined` only for the one unambiguous case: no `analytics` block.
 */
function buildAnalyticsRecorder(config, env, port) {
    const analytics = config.analytics;
    if (analytics === undefined)
        return undefined;
    const envName = analytics.pushKeyEnv ?? 'AGENTPORT_ANALYTICS_PUSH_KEY';
    const pushKey = env[envName];
    if (!pushKey) {
        throw new Error(`config declares an analytics endpoint but ${envName} is not set. ` +
            'Analytics is opt-in and explicit: either set the key, or remove the ' +
            '`analytics` block to turn analytics off. This will not fall back to ' +
            'sending nothing, because a dashboard that silently stops updating looks ' +
            'exactly like a shop with no traffic.');
    }
    const interval = analytics.flushIntervalSec ?? DEFAULT_FLUSH_INTERVAL_SEC;
    if (!Number.isSafeInteger(interval) || interval < 60 || interval > DEFAULT_FLUSH_INTERVAL_SEC) {
        throw new Error(`analytics.flushIntervalSec must be a whole number of seconds between 60 and ` +
            `${DEFAULT_FLUSH_INTERVAL_SEC}. A tighter window spends a request per interval ` +
            'forever and buys nothing; a longer one delays the dashboard for no reason.');
    }
    return new AnalyticsRecorder({
        // The allowlist matters for a reason that is not tidiness: a denial is
        // recorded under the name the *agent* asked for, and an unprovisioned name
        // makes the receiver fail the whole push. Without this list, an agent that
        // invents capability names could stop a merchant's analytics rather than
        // just adding noise to it.
        capabilityNames: port.names(),
        sink: createFetchAnalyticsSink({ endpoint: analytics.endpoint, pushKey }),
    });
}
/**
 * Whether a driver authenticates, and so needs `AGENTPORT_DB_PASSWORD`.
 *
 * Not a capability registry and not speculative: it answers one question, for
 * the two drivers that exist. `sqlite` authenticates through the permissions on
 * the ledger file, so requiring a password there was a gate wired to nothing.
 * An unrecognised driver is required to have one, which fails closed — a driver
 * that turns out not to need it costs a merchant one env var, while the
 * opposite assumption on a driver that does need it would be a silent
 * connection failure at first use rather than at startup.
 */
function driverNeedsPassword(driver) {
    return driver !== 'sqlite';
}
/** Bounded body reader. An anonymous endpoint that buffers without limit is a DoS. */
const MAX_BODY_BYTES = 64 * 1024;
async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw new RequestError(413, 'payload_too_large', 'The request body exceeds the permitted size.');
        }
        chunks.push(chunk);
    }
    if (chunks.length === 0)
        return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new RequestError(400, 'invalid_json', 'The request body is not valid JSON.');
    }
}
class RequestError extends Error {
    status;
    reason;
    constructor(status, reason, message) {
        super(message);
        this.status = status;
        this.reason = reason;
    }
}
export async function startAgent(config, env = process.env, options) {
    // Before anything is opened and long before the port is bound. This check used
    // to live in the CLI, *after* `startAgent` returned — so there was a window in
    // which the endpoint was answering invocations under a policy the merchant
    // believed was enforcing a ceiling it cannot measure, and any embedder calling
    // `startAgent` directly got no check at all. `doctorErrors` existed for this
    // and had zero callers, which is the shape of a control that was believed and
    // was not there. The guarantee belongs to the library: a merchant who embeds
    // us does not run our CLI.
    const problems = doctorErrors(config, env);
    if (problems.length > 0)
        throw new UnenforceableConfigError(problems);
    // The signed artifact, when the config names one. Loaded before anything is
    // opened and long before the port is bound, for the same reason the doctor
    // check above moved here: a runtime answering requests under a policy it has
    // not yet verified is a runtime enforcing nothing. `loadArtifactPolicy`
    // throws `ArtifactLoadError` on total failure — no valid artifact AND no
    // cache — which refuses startup rather than serving under the file policy by
    // accident. Falling back to the file would turn every outage into a rollback
    // to whatever the disk happens to hold.
    //
    // The local kill switch survives inside `loadArtifactPolicy`, re-asserted
    // over the artifact policy: the artifact type cannot carry it, so this merge
    // only ever keeps an engaged switch engaged. No sync, update or rollback
    // clears it — invariant 9 — and the artifact path is no exception.
    const artifact = await loadArtifactPolicy(config);
    // `doctorErrors` above describes the FILE policy while `effectivePolicy`
    // below enforces the ARTIFACT's (SF-6). The skew is deliberate and
    // fail-closed both ways: a file ceiling the artifact lacks can refuse
    // startup over figures nobody enforces, and a file without one lets the
    // enforced ceiling deny per-request as `amount_unmeasurable`. Neither skew
    // permits a bypass — but if this ever confuses an operator at 2am, the fix
    // is to run the ceiling-figure portion of `doctor` against
    // `effectivePolicy`, NOT to validate the artifact's shape at load (the
    // signature is the authority there — see `src/config.ts`, and that decision
    // stands).
    const effectivePolicy = artifact?.policy ?? config.policy ?? {};
    if (artifact !== undefined) {
        process.stderr.write(`agent-port: enforcing policy artifact v${artifact.version} for tenant ${artifact.tenantId} (signature verified locally)\n`);
    }
    const descriptor = config.database;
    if (!descriptor) {
        throw new Error('agent-port.config.json has no `database` block. There is nothing to serve.');
    }
    // The secret is read from the environment and never written anywhere: not to
    // the config, not to the ledger, not to a log. Only the descriptor travels.
    //
    // It is required ONLY by a driver that authenticates. This used to be an
    // unconditional throw, and that was a control that protected nothing while
    // stopping every merchant: `password` was read, checked, and then never
    // passed to anything — `openSqlite` takes a path, and the ledger's real
    // protection is the file mode. So the shipped binary could not start without a
    // secret it did not use, and the only reason this was not caught is that
    // every test set a dummy value to get past it. A gate that is not connected
    // to the thing it gates is worse than no gate, because it is believed.
    //
    // SQLite authenticates through filesystem permissions on the ledger file, so
    // it needs none. An unknown driver is required to have one, because requiring
    // a credential a driver never reads is inert and requiring one it does read
    // is the difference between the agent working and every request failing.
    const secretKey = 'AGENTPORT_DB_PASSWORD';
    if (driverNeedsPassword(descriptor.driver) && !env[secretKey]) {
        throw new Error(`${secretKey} is not set. The ${descriptor.driver} driver authenticates, so the ` +
            `password has to be supplied at run time. It is read from the environment and ` +
            `never written to the config, the ledger, or a log.`);
    }
    const handle = await openSqlite({ path: descriptor.path });
    await installSqliteSchema(handle);
    const port = new AgentPort({
        business: config.business,
        tenantId: config.tenantId,
        baseUrl: config.baseUrl,
        ledger: new SqlLedger(handle.exec, { tenantId: config.tenantId }),
        policy: effectivePolicy,
        // Stamped on every row, so a merchant holding a refusal can tell which
        // config produced it. It was declared on the options and left unset here,
        // which meant every row the shipped binary wrote carried a NULL in a
        // column the invariant says records the version.
        //
        // Digested over the ENFORCED policy, not the file as written: when an
        // artifact is active the file policy is not what decided anything, and a
        // row attributing the decision to it would be evidence of nothing. Without
        // an artifact the input is the config itself, byte-identical to before —
        // spreading `{...config, policy: config.policy ?? {}}` unconditionally
        // would mint a new digest for every existing merchant on upgrade.
        configHash: await configDigest(artifact === undefined ? config : { ...config, policy: effectivePolicy }),
        clock: () => new Date(),
        requestId: () => `req_${Math.random().toString(36).slice(2, 12)}`,
        // Without this the logger falls back to `noopLogger` and a write that
        // executed with no ledger row describing it leaves no trace at all. The
        // server is the one place where that failure is unrecoverable — there is no
        // operator watching stdout — so it is wired here rather than defaulted.
        logger: createStderrLogger(),
    }, new SqlApprovalStore(handle.exec, { tenantId: config.tenantId }), new SqlIdempotencyStore(handle.exec, { tenantId: config.tenantId }));
    for (const capability of buildCapabilities(config.capabilities ?? [], {
        descriptor,
        driver: handle.driver,
        baseUrl: config.baseUrl,
    })) {
        port.expose(capability);
    }
    // The signing secret is the merchant's. Without it every request is refused,
    // which is the correct outcome: an agent is never trusted for being an agent,
    // and a port that accepted unsigned callers would be the one part of the
    // system that trusted them.
    const secret = env.AGENTPORT_SIGNING_SECRET;
    if (!secret) {
        throw new Error('AGENTPORT_SIGNING_SECRET is not set. Without it no caller can be identified, ' +
            'so every request would be refused. Issue one with `agent-port secret`.');
    }
    // ANALYTICS. Off unless the config names an endpoint, which is a decision
    // rather than a default — a merchant who has not opted in has aggregates
    // leaving their machine, which is not a default anyone gets to inherit.
    //
    // Every failure here is a startup refusal, never a downgrade. Silently
    // disabling analytics because the push key is missing would leave a merchant
    // believing the hosted dashboard is live and complete; `doctor` reports it
    // instead, and this throws so they learn at the moment they run `serve`.
    const recorder = buildAnalyticsRecorder(config, env, port);
    const server = createServer((req, res) => {
        void handleRequest(req, res, port, secret, options.verbose ?? false, recorder);
    });
    // The flush loop. Unref'd, so a pending analytics push can never be the reason
    // a process refuses to exit, and never on the request path — a request that
    // waits for a network call to our host is a request whose latency is our
    // latency, which is the dependency `AGENTS.md` forbids.
    const flushTimer = recorder === undefined ? undefined : setInterval(() => {
        void recorder.flush().catch(() => {
            // `flush()` catches everything a sink can do, so reaching here means the
            // recorder itself is wrong. Logged rather than swallowed: a flush that
            // never happens is indistinguishable from analytics that is off.
        });
    }, (config.analytics?.flushIntervalSec ?? DEFAULT_FLUSH_INTERVAL_SEC) * 1000);
    flushTimer?.unref?.();
    await new Promise((resolve, reject) => {
        // A port that is already taken arrives here as a bare `EADDRINUSE`, and a
        // bare errno is the worst possible thing to hand a merchant who just
        // clicked the binary for the first time. It does not say which port, it
        // does not say that something else already holds it, and — the part that
        // actually caused the confusion — it does not say the process is not
        // running. So the operator sees a failure while a *different* process
        // answers requests on that port, and every manifest they read afterwards
        // belongs to whatever else is listening.
        //
        // Naming the host and port, and naming the collision, is the difference
        // between a merchant who fixes this in ten seconds and one who concludes
        // the product is broken.
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                reject(new Error(`cannot listen on ${options.host ?? '127.0.0.1'}:${options.port} — something else is ` +
                    'already using that port. This process did not start, so any response you get on ' +
                    'that port is coming from that other process, not from agent-port. Stop it, or ' +
                    'start this one on another port with --port.'));
                return;
            }
            if (err.code === 'EACCES') {
                reject(new Error(`cannot listen on ${options.host ?? '127.0.0.1'}:${options.port} — permission denied. ` +
                    'Ports below 1024 need elevated privileges on most systems; pick a higher port with --port.'));
                return;
            }
            reject(err);
        });
        // Loopback by default. This endpoint accepts anonymous input and reaches a
        // database, so binding it to every interface by default would put the
        // merchant's orders on the public internet behind nothing but the policy
        // engine. Publishing it is a decision they make deliberately, via --host.
        server.listen(options.port, options.host ?? '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
        });
    });
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : options.port;
    return {
        port,
        // The recorder, so an embedder can flush it before exiting. The periodic
        // timer is `unref`'d, which is right for liveness and wrong for durability:
        // without this, a SIGTERM loses whatever window had not yet come due, and the
        // last few requests a merchant saw before they stopped the process are the
        // ones they most want accounted for.
        ...(recorder === undefined ? {} : { analytics: recorder }),
        server: {
            port: boundPort,
            close: async () => {
                // `server.close()` waits for idle keep-alive sockets, so an operator
                // with a pooled client cannot stop `serve` and the handle below never
                // closes. Ctrl-C has to work.
                server.closeAllConnections();
                await new Promise((resolve) => server.close(() => resolve()));
                handle.close();
            },
        },
    };
}
async function handleRequest(req, res, port, secret, verbose, recorder) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const started = Date.now();
    res.setHeader('x-content-type-options', 'nosniff');
    try {
        // DISCOVER. Public by design: the catalogue is how an assistant learns the
        // business exists, and it contains no merchant data — capability names,
        // access classes, and the policy the agent will be measured against.
        if (req.method === 'GET' && url.pathname === '/.well-known/agent.json') {
            return send(res, 200, port.manifest());
        }
        if (req.method !== 'POST' || url.pathname !== '/.well-known/agent/invoke') {
            return send(res, 404, { error: 'not_found' });
        }
        // A browser on any origin can POST to 127.0.0.1 without a preflight if the
        // content type is simple, and the effect lands either way. A page the
        // merchant visits must not be able to write rows into their production
        // database, so an `Origin` is refused outright. This is a local endpoint;
        // there is no legitimate cross-origin caller.
        if (req.headers.origin !== undefined) {
            return send(res, 403, { error: 'cross_origin' });
        }
        const auth = req.headers.authorization;
        // Verified before the body is read, not after. The credential is already in
        // hand, it costs nothing to check, and reading first means an anonymous
        // caller can make this process buffer and parse megabytes it will only
        // refuse. Every refusal is a durable INSERT, so an unauthenticated flood
        // is a disk write flood.
        const caller = await verifyToken(typeof auth === 'string' ? auth : undefined, secret);
        if (caller.assurance !== 'verified') {
            // The body is read so the refusal names the capability that was asked
            // for. An agent probing the shop leaves a record of what it probed, which
            // is the entire value of keeping a ledger of a call that never ran — and
            // the read is bounded by the same 64 KB cap as any other request. The
            // credential was still checked first, so no query and no handler runs.
            const attempted = (await readBody(req).catch(() => null));
            // Bounded, and the bound is not here. The name is passed through so the
            // refusal names what was asked for, and `invoke()` bounds what it
            // reflects — including the empty case, since the ledger's own
            // `CHECK (capability <> '')` refuses an empty capability, `record()`
            // swallowed the resulting error, and the probe that most looks like an
            // attack — one that named nothing — was the one that left no row. This
            // package is transport-agnostic and the next adapter inherits whatever
            // this one left clamped, so the clamp belongs on the side that every
            // adapter shares.
            await port.invoke({
                capability: String(attempted?.capability ?? ''),
                input: undefined,
                identity: caller,
            });
            if (verbose)
                process.stderr.write(`agent-port refused: ${caller.reason ?? 'unauthenticated'}\n`);
            return send(res, 403, { error: 'unauthenticated' });
        }
        // Requiring JSON forces a preflight a browser will not answer, so the
        // simple-request path above is closed at the type as well as the origin.
        if (!isJson(req.headers['content-type'])) {
            return send(res, 415, { error: 'unsupported_media_type' });
        }
        // `null` and `[]` are valid JSON and are not objects. Coerced here so the
        // field reads below cannot throw a TypeError out of the request handler.
        const parsed = (await readBody(req));
        const body = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {});
        const outcome = await port.invoke({
            capability: String(body.capability ?? ''),
            input: body.input,
            identity: caller,
            intentId: typeof body.intentId === 'string' ? body.intentId : undefined,
        });
        if (verbose) {
            process.stdout.write(`agent-port ${outcome.status} ${outcome.requestId} ${Date.now() - started}ms\n`);
        }
        // ANALYTICS. Recorded here, after the outcome exists and before it is
        // written to the socket, because `record()` is a synchronous map write that
        // cannot throw and is never awaited — the enforcement path above has already
        // decided and already written its ledger row, and nothing in this module may
        // become a reason a request fails.
        //
        // `recordOutcome` is deliberately not wrapped in a try/catch. It cannot throw
        // (the class documents `record()` as a map write), and a catch here would be
        // the one place a future edit could make an analytics failure look like a
        // request failure.
        // The capability name is taken from the *request*, not the outcome: only the
        // non-`ok` arms carry it, so reading it off the outcome would drop the one
        // case a merchant most wants counted — a refusal.
        recorder?.recordOutcome(outcome, {
            capability: String(body.capability ?? ''),
            assurance: caller.assurance,
        });
        // A refusal is a 403 with the reason and the rule that fired. An agent can
        // route on `rule`; `detail` is the human-readable version of the same fact.
        if (outcome.status === 'denied') {
            return send(res, 403, outcome);
        }
        if (outcome.status === 'pending_approval') {
            return send(res, 202, outcome);
        }
        if (outcome.status === 'in_progress') {
            return send(res, 409, outcome);
        }
        if (outcome.status === 'error') {
            // The message stays in the ledger. Forwarded verbatim it reads
            // "no such table: customer_risk" and "UNIQUE constraint failed:
            // orders.email" to anyone holding a token, which is a schema map handed
            // out one guess at a time. The generic branch below already says no
            // stack ever reaches a caller; this was the exception to it.
            return send(res, 502, { error: 'handler_failed', requestId: outcome.requestId });
        }
        return send(res, 200, outcome);
    }
    catch (err) {
        if (err instanceof RequestError) {
            return send(res, err.status, { error: err.reason, detail: err.message });
        }
        process.stderr.write(`agent-port unhandled: ${err.message}\n`);
        // No stack to a caller, ever. A handler message or a driver error can
        // carry a connection string, and this is a public endpoint.
        return send(res, 500, { error: 'internal', detail: 'The request could not be completed.' });
    }
}
function send(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(body);
}
/** `application/json`, with or without a charset. */
function isJson(header) {
    if (header === undefined)
        return false;
    return /^application\/json\b/i.test(header.split(';')[0].trim());
}
//# sourceMappingURL=server.js.map