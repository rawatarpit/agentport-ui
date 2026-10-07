#!/usr/bin/env node
import { loadConfig } from './config-file.js';
import { doctor, ConfigError, UnenforceableConfigError } from './config.js';
import { startAgent } from './server.js';
import { openSqlite, installSqliteSchema } from './sqlite.js';
import { SqlApprovalStore, SqlLedger, SqlIdempotencyStore, LEDGER_DDL, } from './sql.js';
import { buildCapabilities } from './capabilities.js';
import { AgentPort, configDigest } from './agent.js';
import { issueToken } from './identity.js';
import { createStderrLogger } from './logger.js';
import { loadArtifactPolicy, ArtifactLoadError } from './artifact-load.js';
import { POLICY_OUTCOMES } from './types.js';
import { BINARY_VERSION, LEDGER_SCHEMA_VERSION, RELEASE_CERTIFICATE_IDENTITY, RELEASE_OIDC_ISSUER, applyUpdate, classifyChannel, clearUpdateState, cosignVerifier, describeUpdatePolicy, downloadArtifact, downloadManifest, parseUpdateState, platformKey, readUpdateState, recoverPendingUpgrade, updateStatePath, verifyUpdate, versionHealthCheck, } from './upgrade.js';
/**
 * `agent-port` — the merchant-local agent.
 *
 * No framework, no dependencies. A merchant runs this on their own machine,
 * next to their own site; our servers are not contacted on any request path, so
 * an outage here is an outage here and nowhere else.
 *
 * `init` is the first command because the person installing this is usually not
 * the person who wrote the integration, and a merchant who cannot get it running
 * does not enable it. It writes a config that passes `doctor` rather than a
 * template, because a first run that reports eight problems is a first run that
 * gets abandoned.
 */
const HELP = `agent-port — a governed, auditable interface to your business

  agent-port init [--config agent-port.config.json] [--business "Your shop"]
                 [--ledger agent-port.db] [--tenant id] [--url https://example.com]
      Write a working config, create the ledger, and print the next steps.
      Run this first. The person installing this is usually not the person who
      wrote the integration. Never overwrites an existing config.
      Only the bundled SQLite driver ships, so the ledger is a local file set
      with --ledger. There is no --dsn.

  agent-port connect [--ledger agent-port.db] [--out agent-port.schema.json]
                   [--push --endpoint https://… ]   # AGENTPORT_PUSH_KEY required
      Read your database and write the table and column names to a local file.
      Reads schema only — no rows. This is what the dashboard needs before it
      can show you your tables.

      Nothing is sent unless you pass --push, and --push also needs your push
      key from the dashboard. --out is written either way, so a failed upload
      still leaves you with the answer on disk.

  agent-port discover [--cwd .] [--out agent-port.endpoints.json]
      List the HTTP endpoints your backend exposes.

      Asks your framework for its own routes — Next.js, Rails, Laravel — and
      reads an OpenAPI 3 JSON contract when one is present, which is where field
      names come from. Writes a draft inventory of method, path, field names and
      types, and where each was seen. No database is opened, no port is bound,
      and nothing is sent anywhere.

      Field names and types only. Examples, defaults and enum values from the
      spec are dropped, because they are usually realistic.

      A route table contains no request data and neither does the field list, so
      this discloses only shapes. It is a draft: serve does not read it and it
      grants nothing. Frameworks and files we recognise but cannot read are
      listed on stdout, never dropped quietly.

  agent-port hook [--out agent-port.hook.mjs]
      Capture the calls your server makes, not just the ones a browser makes.

      Writes a loader into your project and prints the command to run with it:

        node --import ./agent-port.hook.mjs ./node_modules/.bin/next dev

      This is the gap capture cannot cover. In a Next.js app most fetching
      happens on the server — Server Components and Server Actions never pass a
      browser — so a browser-only capture is confidently incomplete.

      The generated files are readable on purpose: this one runs inside your
      server process with access to your environment. It wraps one function and
      cannot change a response. Values are never recorded, and requests carrying
      Authorization or Cookie are not recorded at all.

  agent-port inventory <files...> [--out agent-port.inventory.json]
      Reconcile every pass into one list.

      Takes any mix of agent-port discover, capture and server-hook output and
      folds them into one table, sorted into three buckets:

        CORROBORATED           named by a route or contract, and hit live
        USED, NEVER DECLARED   a live request to something no pass named
        DECLARED, NEVER USED   named, no traffic seen

      The middle bucket is the one worth reading first: a reachable endpoint
      that appears in no contract a reviewer would read. The last bucket may
      simply be admin-only routes — capture only sees traffic someone generated.

      Anything a pass could not read is carried through the merge, tagged with
      the file that reported it, rather than dropped.

  agent-port capture --upstream <url> --allow-origin <origin> [--seconds 60]
                     [--port 8478] [--host 127.0.0.1] [--out agent-port.calls.json]
                     [--max-paths 10000]
      Record which endpoints your frontend actually calls.

      Starts a relay on loopback, forwards everything to --upstream untouched so
      your site behaves normally, and writes the endpoints that were reached.
      Bounded: it records for --seconds and then stops.

      --upstream is your own API and is fixed for the session, because a relay
      that takes a destination from the request can be pointed anywhere.
      --allow-origin is your site's origin, and there is no default and no
      wildcard: any page in a browser can reach 127.0.0.1, so a request from an
      origin you did not name is refused rather than forwarded.

      Field names and types only, never values. Requests carrying Authorization
      or Cookie are forwarded but NOT recorded, so authenticated-only endpoints
      are absent from the file — a contract or a route dump still names them.

  agent-port serve [--port 8477] [--config agent-port.config.json] [--host 127.0.0.1]
      Run the agent. Serves the manifest and the invoke endpoint.

  agent-port doctor [--config agent-port.config.json]
      Check the config and the environment. Run this before serve.

  agent-port token --agent <id> --scope <scope> [--ttl 3600] [--config <path>]
      Mint a bearer credential. Hand it to your assistant.

  agent-port pending
      List requests waiting for a human.

  agent-port ledger [--limit 50] [--capability <name>] [--agent <id>]
                    [--decision allow|deny|require_approval] [--since <iso>] [--json]
      Read your own ledger. A reader only: there is no edit verb, because the table
      has no update path.

  agent-port ledger-table [--sql]
      Print the DDL for the ledger table. Never connects, never creates anything.

  agent-port approve --request <id> --by <who>
      Approve a held request. Runs the merchant's query, or refuses.

  agent-port secret
      Print a new signing secret.

  agent-port keys --out <dir>
      Generate the merchant's Ed25519 signing keypair for policy artifacts.
      Writes the PRIVATE key to <dir>/merchant-private.pem with mode 0600 and
      prints the PUBLIC key to stdout. The private half is never printed,
      never logged, and never leaves this machine — it signs, nothing else.
      Refuses to overwrite: a keypair that silently replaces itself silently
      invalidates every artifact the old one signed.

  agent-port publish --key <private-pem> [--public-key <public-pem>]
                     [--version N] [--out artifact.json]
      Sign this config's policy into a merchant-signed artifact envelope.
      The public key is registered alongside the artifact so the distribution
      endpoint and the runtime can pin it; when --public-key is given it must
      match the signing key or the publish is refused. Prints the envelope to
      stdout, or writes it to --out with mode 0600.

  agent-port upgrade [--accept-schema-change]
      Check for a signed release, verify it, and replace this binary.

  agent-port version
      Print the version, the ledger schema, and the update trust pins.

  agent-port help

The database password is read from AGENTPORT_DB_PASSWORD and the signing
secret from AGENTPORT_SIGNING_SECRET. Neither is stored in the config file and
neither leaves this machine.`;
function parseArgs(argv) {
    // A leading `--flag` is a flag, not a command. `agent-port --version` used
    // to be read as a request for a command literally named `--version`, which
    // fell through to config loading — so the health check that decides whether
    // a signed release starts was asking a binary that answered with a config
    // error and exit 1.
    const [first = 'help', ...rest] = argv;
    const command = first.startsWith('--') ? 'help' : first;
    const tail = first.startsWith('--') ? [first, ...rest] : rest;
    const flags = {};
    const positionals = [];
    for (let i = 0; i < tail.length; i++) {
        const arg = tail[i];
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }
        const eq = arg.indexOf('=');
        if (eq !== -1) {
            flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        }
        else {
            const next = tail[i + 1];
            if (next && !next.startsWith('--')) {
                flags[arg.slice(2)] = next;
                i++;
            }
            else {
                flags[arg.slice(2)] = true;
            }
        }
    }
    return { command, flags, positionals };
}
function die(message) {
    process.stderr.write(`agent-port: ${message}\n`);
    process.exit(1);
}
/**
 * `agent-port init` — the setup path, and the first command a merchant runs.
 *
 * It writes a config, creates the ledger, and prints the next three steps. Three
 * properties make it worth having rather than shipping a README:
 *
 * 1. **It never overwrites.** A second `init` refuses and names the file. A
 *    setup command that silently replaces a working config with a template is a
 *    merchant's ledger path and capability grants replaced by a default.
 * 2. **The config it writes passes `doctor` with zero errors.** It is validated
 *    before it is written, and a config that would not start is not a first
 *    step. The starter capability is a read with an `internal` data class and
 *    NO ceiling configured, because a ceiling with no authoritative figure
 *    behind it is `amount_unmeasurable` — `doctor` names that exact trap and a
 *    generated file must not walk into it.
 * 3. **It creates the ledger.** DDL runs here, so the first `serve` does not
 *    fail on a missing table, and the merchant sees the file appear.
 *
 * The password and the signing secret are NOT written and NOT asked for here.
 * They go in the environment, and the printed next steps say so, because a
 * secret in a config file is a secret in every backup of that file.
 */
/**
 * `agent-port connect` — read the merchant's schema, write it next to the
 * ledger, print it.
 *
 * This is the smallest honest slice of onboarding, and it is deliberately not
 * the whole thing. It reads the database, it writes a local file, and it
 * uploads nothing. Everything it does is reversible by deleting one file.
 *
 * Why it stops there: the schema is the input to the merchant's decisions, so
 * the first thing that must be true is that reading it is harmless and
 * inspectable. If `connect` also uploaded to a dashboard we do not control,
 * then the first version of this feature would already have a network path in
 * it, and the review that path deserves would be entangled with the part that
 * only reads catalogs.
 *
 * The file it writes is the artifact the dashboard will eventually accept, in
 * the exact shape `src/introspect.ts` produces — so the upload is a transport
 * change, not a data change.
 */
async function runConnect(flags) {
    const { writeFile, chmod } = await import('node:fs/promises');
    const { openSqlite } = await import('./sqlite.js');
    const { introspect } = await import('./introspect.js');
    const path = typeof flags.ledger === 'string' ? flags.ledger : 'agent-port.db';
    const target = typeof flags.out === 'string' ? flags.out : 'agent-port.schema.json';
    let handle;
    try {
        handle = await openSqlite({ path });
    }
    catch (err) {
        die(`cannot open ${path}: ${err instanceof Error ? err.message : String(err)}\n` +
            '  If that is not your shop database, point at the right file with --ledger <path>.');
    }
    let snapshot;
    try {
        // Never `SELECT *`. This reads catalogs — table names, column names,
        // declared types — and there is no code path through which a row value
        // could enter this file. That is the property the whole feature rests on.
        snapshot = await introspect(handle.driver);
    }
    catch (err) {
        handle.close();
        die(`introspection failed: ${err instanceof Error ? err.message : String(err)}\n` +
            '  Nothing was written. Only schema was being read.');
    }
    handle.close();
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    // `init` writes 0600 and this does too, and the reason is not the same.
    // A ledger holds decisions; a schema holds the shape of the merchant's
    // database. Column names alone are reconnaissance for anyone who reads them,
    // and the mode should not depend on which file a given merchant happened to
    // ask us to write.
    await writeFile(target, body, { mode: 0o600 });
    await chmod(target, 0o600);
    process.stdout.write(`read ${snapshot.serverVersion}\n`);
    process.stdout.write(`  dialect  ${snapshot.dialect}\n`);
    process.stdout.write(`  tables   ${snapshot.tables.length}\n`);
    for (const table of snapshot.tables) {
        process.stdout.write(`\n  ${table.name}\n`);
        for (const column of table.columns) {
            const type = column.type === '' ? '(no declared type)' : column.type;
            process.stdout.write(`    ${column.name}  ${type}\n`);
        }
    }
    process.stdout.write(`\nwritten to ${target}\n`);
    // Uploading is opt-in and separate from reading, on purpose.
    //
    // Reading a schema is harmless and local: one file, deletable, no network.
    // Sending it is a disclosure — column names are reconnaissance for anyone who
    // reads them, and a merchant who ran `connect` to *look* at their own tables
    // has not consented to publishing their database shape to us. So the flag is
    // required, and the local file is written either way: a failed upload leaves
    // the merchant with the answer on disk rather than nothing.
    if (flags.push !== true) {
        process.stdout.write('No rows were read and nothing was sent anywhere.\n');
        return;
    }
    const endpoint = typeof flags.endpoint === 'string' ? flags.endpoint : '';
    const pushKey = process.env.AGENTPORT_PUSH_KEY ?? '';
    if (endpoint === '' || pushKey === '') {
        die('--push needs both --endpoint <url> and AGENTPORT_PUSH_KEY in the environment.\n' +
            '  Your push key comes from the dashboard and names your shop inside its signature, so\n' +
            '  there is nothing to config file that would be safer there.');
    }
    const { createFetchSchemaSink, pushSchema } = await import('./schema-push.js');
    const sink = createFetchSchemaSink({ endpoint, pushKey });
    const result = await pushSchema({ sink, schema: snapshot });
    if (!result.ok) {
        process.stderr.write(`schema upload failed: ${result.reason}${result.detail ? ` (${result.detail})` : ''}\n`);
        if (result.status !== 0)
            process.stderr.write(`  receiver said HTTP ${result.status}\n`);
        process.stderr.write(`  your schema is still on disk at ${target}\n`);
        process.exit(1);
    }
    process.stdout.write(`\nuploaded ${result.tablesWritten} tables, ${result.columnsWritten} columns\n`);
    process.stdout.write('Your dashboard will show them once it has the selection screen.\n');
}
async function runInit(target, flags) {
    const { existsSync } = await import('node:fs');
    const { writeFile, chmod } = await import('node:fs/promises');
    if (existsSync(target)) {
        die(`${target} already exists. Refusing to overwrite it — a second init would replace\n` +
            '  your capabilities, policy and ledger path with defaults. Edit it, or pass\n' +
            '  --config <path> to write a new one somewhere else.');
    }
    const business = typeof flags.business === 'string' ? flags.business : 'My shop';
    const baseUrl = typeof flags.url === 'string' ? flags.url : 'https://example.com';
    const ledgerPath = typeof flags.ledger === 'string' ? flags.ledger : 'agent-port.db';
    // A `--dsn` is refused rather than half-supported, INCLUDING the sqlite forms
    // it used to accept and then discard. It previously let `file:shop.db` and
    // `shop.db` through, wrote neither into the config, and printed a next-steps
    // block naming a ledger the merchant never got. A flag that is accepted,
    // ignored, and reported as honoured is worse than a flag that is refused:
    // the merchant believes their database path is configured and finds out at
    // the first request, against a file that already has their real ledger in it.
    if (typeof flags.dsn === 'string') {
        die('--dsn is not supported: only the bundled SQLite driver ships, and the ledger\n' +
            '  path is set with --ledger. Your ledger is a local file, not a connection\n' +
            '  string, so there is nothing for a DSN to configure yet.');
    }
    const config = {
        business,
        // A local identifier, not an identity. It is stamped on every ledger row so
        // two installs on one machine stay separable, and it is NOT derived from our
        // systems — a merchant must be able to run this with us unreachable.
        tenantId: typeof flags.tenant === 'string' ? flags.tenant : `local-${process.pid}`,
        baseUrl,
        database: { driver: 'sqlite', path: ledgerPath },
        capabilities: [
            {
                name: 'read_settings',
                description: 'Read this shop\'s own settings.',
                access: 'read',
                dataClass: 'internal',
                // Declared, not `{}`. The query binds `:key` from the payload, and a
                // schema of `{}` declares the whole payload as having no properties — so
                // `doctor` passed it and the first real invoke failed inside the driver
                // with "needed :key" instead of being refused with a reason naming the
                // missing field. A scaffold that passes validation and then fails at
                // execution teaches the merchant that the tool is broken, and the
                // failure lands in a place they cannot act on.
                input: {
                    key: { type: 'string', required: true, maxLength: 200 },
                },
                // A real statement against a real table the merchant creates, so the
                // first run exercises the whole path end to end instead of reporting ok
                // for a capability that could never do anything.
                query: 'SELECT key, value FROM settings WHERE key = :key',
                bindings: { key: 'key' },
            },
        ],
        // No ceiling. A generated config that configures `absoluteMaxOrderValue`
        // alongside a capability with no authoritative figure behind it produces
        // `amount_unmeasurable` on the first write — `doctor` names that trap, and a
        // scaffold that walks into it teaches the merchant that the tool is broken.
        // Ceilings are added deliberately, with the figure the merchant's own data
        // can supply.
        policy: {},
    };
    // Validated before it is written, so `init` cannot leave behind a file that
    // the next command refuses. Same code path as `doctor`, deliberately: a
    // scaffold that satisfies a validator nobody else uses is a scaffold that
    // does not start.
    let report;
    try {
        report = doctor(config, process.env);
    }
    catch (err) {
        die(`the generated config is not valid: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (report.errors.length > 0) {
        die(`the generated config does not pass its own validation:\n${report.errors.map((e) => `  - ${e}`).join('\n')}\n` +
            '  This is a bug in `init`. Nothing was written.');
    }
    await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    // The config carries no password today, but it carries the ledger path and
    // the policy, and 0644 would let any local account read the merchant's rules.
    await chmod(target, 0o600);
    // The ledger is created here so the first `serve` finds a working database.
    // A failure here is reported but does not undo the config: the file is valid
    // and the merchant can fix the path and re-run. Deleting a config they may
    // have edited to fix it would be a worse outcome than an error.
    let ledgerNote = '';
    try {
        const handle = await openSqlite({ path: ledgerPath });
        await installSqliteSchema(handle);
        handle.close();
        ledgerNote = `  ledger    ${ledgerPath} created`;
    }
    catch (err) {
        ledgerNote = `  ledger    NOT created: ${err instanceof Error ? err.message : String(err)}`;
    }
    process.stdout.write(`agent-port initialised ${target}\n${ledgerNote}\n\n`);
    process.stdout.write('next, in order:\n' +
        '\n' +
        '  1. export AGENTPORT_SIGNING_SECRET=$(agent-port secret)\n' +
        '     It stays in your shell. It is never written to the config, and it\n' +
        '     never leaves this machine. Losing it revokes every token you issued.\n' +
        '\n' +
        '  2. agent-port doctor                           # must print "ok"\n' +
        '  3. agent-port serve\n' +
        '\n' +
        '  4. agent-port token --agent my-chatbot --scope "capability:read_settings"\n' +
        '     Hand that to your chatbot. It is scoped and it expires.\n' +
        '\n' +
        'The generated capability reads a `settings` table, so create it before you\n' +
        'expect it to return anything:\n' +
        '\n' +
        "  sqlite3 agent-port.db 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)'\n" +
        '\n' +
        'Your own tables, capabilities and policy go in:\n' +
        `  ${target}  — then re-run doctor\n`);
    for (const note of report.notes) {
        process.stderr.write(`  note: ${note}\n`);
    }
}
/**
 * `agent-port keys --out <dir>` — provision-time merchant keypair.
 *
 * `generateMerchantKeypair` existed with nothing calling it at provision,
 * which is the shape of a control that is believed and is not there: the
 * artifact channel needs a merchant key, and without this command the only
 * way to get one is to write the crypto call by hand. This is the call.
 *
 * The private half is written to one file with 0600 and never printed,
 * never logged, and never transmitted. Every error below names paths, never
 * key material — a PEM in an error string is a PEM in a support thread.
 */
async function runKeys(outDir) {
    const { existsSync, mkdirSync } = await import('node:fs');
    const { writeFile, chmod } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { generateMerchantKeypair } = await import('./artifact.js');
    if (outDir === '')
        die('keys requires --out <dir>: the directory the keypair is written to.');
    mkdirSync(outDir, { recursive: true });
    const privatePath = join(outDir, 'merchant-private.pem');
    const publicPath = join(outDir, 'merchant-public.pem');
    // Refuse to overwrite. A signing identity that silently replaces itself
    // silently invalidates every artifact the old one signed, and the failure
    // arrives at the next startup as an unverifiable artifact — far from the
    // command that caused it.
    for (const existing of [privatePath, publicPath]) {
        if (existsSync(existing)) {
            die(`${existing} already exists. Refusing to overwrite it — generate into an empty\n` +
                '  directory, or move the old keypair aside first. A replaced merchant key\n' +
                '  invalidates every signed artifact the old one produced.');
        }
    }
    const { publicKeyPem, privateKeyPem } = generateMerchantKeypair();
    await writeFile(privatePath, privateKeyPem, { mode: 0o600 });
    await chmod(privatePath, 0o600);
    await writeFile(publicPath, publicKeyPem, { mode: 0o644 });
    process.stdout.write(publicKeyPem);
    if (!publicKeyPem.endsWith('\n'))
        process.stdout.write('\n');
    process.stderr.write(`wrote ${privatePath} (0600, private — never shares this file)\n`);
    process.stderr.write(`wrote ${publicPath}\n`);
}
/**
 * `agent-port publish` — sign the config's policy into a distributable envelope.
 *
 * Reads the local config, builds the artifact the runtime verifies
 * (`tenantId`, `version`, `policy`, capability names), signs it with the
 * merchant's PRIVATE key, and emits `{ artifact, signature, publicKey }`.
 * The public key travels alongside the artifact so the first publish
 * self-registers the key the runtime pins; a `--public-key` that does not
 * match the signing key refuses the publish rather than registering a key
 * that cannot verify what was just signed.
 *
 * Key material never reaches stdout, stderr, or an error: stdout carries the
 * envelope (public key included, private half excluded by construction) and
 * errors name files and versions only.
 */
async function runPublish(flags, configPath) {
    const { readFile, writeFile, chmod } = await import('node:fs/promises');
    const { signArtifact, verifyArtifact } = await import('./artifact.js');
    const { createPublicKey } = await import('node:crypto');
    const keyPath = typeof flags.key === 'string' ? flags.key : die('publish requires --key <private-pem>: the merchant private key from `agent-port keys`.');
    const versionRaw = typeof flags.version === 'string' ? flags.version : '1';
    if (!/^\d+$/.test(versionRaw) || Number(versionRaw) < 1) {
        die(`--version must be a positive whole number, not ${versionRaw}`);
    }
    const version = Number(versionRaw);
    let config;
    try {
        config = loadConfig(configPath);
    }
    catch (err) {
        if (err instanceof ConfigError) {
            process.stderr.write(`${err.message}\n`);
            process.exit(1);
        }
        throw err;
    }
    // Refused before any key is read (SF-7). An engaged kill switch cannot ride
    // inside the artifact — verifyArtifact refuses the payload — so publishing
    // with it on signs bytes that can never load, bricking the next deploy
    // until someone notices, switches off, re-publishes, and re-engages. Fail
    // here with the true reason instead of at self-verify with a misleading one.
    // The local switch stays engaged throughout; publishing never touches it.
    if (config.policy !== undefined &&
        typeof config.policy === 'object' &&
        config.policy !== null &&
        config.policy.emergencyKillSwitch === true) {
        die('the local kill switch is engaged: turn it off, publish, then re-engage. ' +
            'The artifact cannot carry the switch and the runtime re-asserts the local one.');
    }
    const readKey = async (path, what) => {
        try {
            return await readFile(path, 'utf8');
        }
        catch (err) {
            die(`cannot read the ${what} at ${path}: ${err.message}`);
        }
    };
    const privateKeyPem = await readKey(keyPath, 'merchant private key');
    let publicKeyPem;
    if (typeof flags['public-key'] === 'string') {
        publicKeyPem = await readKey(flags['public-key'], 'merchant public key');
    }
    else {
        // Derived, not supplied: the public half of the signing key, which is
        // safe to register because it can verify and cannot sign.
        try {
            publicKeyPem = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
        }
        catch (err) {
            die(`the key at ${keyPath} is not a usable private key: ${err.message}`);
        }
    }
    const artifact = {
        tenantId: config.tenantId,
        version,
        policy: (config.policy ?? {}),
        capabilities: (config.capabilities ?? []).map((c) => ({ name: c.name })),
    };
    let signature;
    try {
        signature = signArtifact(artifact, privateKeyPem).signature;
    }
    catch (err) {
        die(`signing failed with the key at ${keyPath}: ${err.message}`);
    }
    // The envelope is verified before it leaves this machine: a publish that
    // cannot verify is a broken artifact plus a registered key that disagrees
    // with it, and the failure would otherwise arrive at startup, far away.
    const check = verifyArtifact({ artifact, signature }, publicKeyPem, { expectedTenantId: config.tenantId });
    if (!check.ok) {
        die('the public key does not match the signing key: the envelope just signed ' +
            `does not verify (${check.reason}). Refusing to publish a key that cannot verify its own artifact.`);
    }
    const envelope = `${JSON.stringify({ artifact, signature, publicKey: publicKeyPem }, null, 2)}\n`;
    if (typeof flags.out === 'string') {
        await writeFile(flags.out, envelope, { mode: 0o600 });
        await chmod(flags.out, 0o600);
        process.stderr.write(`published artifact v${version} for tenant ${config.tenantId} to ${flags.out} (signed locally)\n`);
        return;
    }
    process.stdout.write(envelope);
}
/**
 * `agent-port upgrade` — the binary replacing itself, and nothing else.
 *
 * The order here is the whole security property of B6.2 and it is not
 * rearranged for convenience: fetch the manifest, fetch the bytes, verify the
 * signature, and only then let `applyUpdate` touch the file on disk. Nothing
 * unverified is executed, not even to find out whether it works — an update
 * path that runs the candidate first is an update path that runs whatever the
 * release host served.
 */
async function runUpgrade(flags, selfPath) {
    if (flags['reset-state'] === true || flags.resetState === true) {
        if (!selfPath)
            die('cannot locate this binary to reset its update state');
        const cleared = await clearUpdateState(selfPath);
        process.stdout.write(cleared.removed
            ? `cleared update state at ${cleared.path}\n`
            : `there was no update state at ${cleared.path}\n`);
        return;
    }
    if (!selfPath)
        die('cannot locate this binary to replace. Run the installed copy, not `node main.js`.');
    // The recorded install is the floor for a downgrade check, and it is a
    // separate source from the build stamp on purpose: a stamp that was never
    // written must not silently lower the bar.
    const recorded = await readUpdateState(selfPath);
    const state = recorded.ok
        ? recorded.state
        : undefined;
    if (!recorded.ok) {
        process.stderr.write(`agent-port: ignoring the update state file: ${recorded.detail}\n`);
    }
    const origin = describeUpdatePolicy().manifestOrigin;
    let manifest;
    try {
        manifest = await downloadManifest();
    }
    catch (err) {
        die(`could not reach the update channel at ${origin}: ${err.message}`);
    }
    process.stdout.write(`channel ${origin} offers ${manifest.version} for ${platformKey()}\n`);
    let artifact;
    try {
        // No digest is passed here on purpose. An earlier version compared the
        // checksum during transport, which ran a check before the signature and
        // threw instead of refusing. The parameter no longer exists, so the
        // ordering cannot be reintroduced by a caller.
        artifact = await downloadArtifact(manifest.url);
    }
    catch (err) {
        die(`could not download the release: ${err.message}`);
    }
    // The downloaded bytes stay on disk until the install has either succeeded
    // or been refused. `applyUpdate` installs from this exact path, and the
    // installer re-hashes it, so a temp file disposed early would be a file
    // that no longer exists by the time it is asked for.
    let verdict;
    let payloadBytes;
    try {
        const { readFile } = await import('node:fs/promises');
        payloadBytes = await readFile(artifact.path);
        verdict = await verifyUpdate(manifest, payloadBytes, {
            currentVersion: state?.lastVersion ?? BINARY_VERSION,
            platform: platformKey(),
            manifestOrigin: origin,
            verifier: cosignVerifier(),
            state,
            ledgerSchemaVersion: LEDGER_SCHEMA_VERSION,
            payloadPath: artifact.path,
        });
    }
    catch (err) {
        await artifact.dispose();
        die(`could not verify the release: ${err.message}`);
    }
    const finish = async () => {
        await artifact.dispose();
    };
    try {
        if (verdict.status === 'up_to_date') {
            process.stdout.write(`already on ${BINARY_VERSION}\n`);
            return;
        }
        if (verdict.status === 'refused') {
            process.stderr.write(`agent-port: refusing this release — ${verdict.reason ?? 'unknown'}: ${verdict.detail}\n`);
            process.stderr.write(`  checks run: ${verdict.steps.join(' -> ')}\n`);
            process.exitCode = 1;
            return;
        }
        // Narrowed once. Every gate below reads the same manifest, and a release
        // that verified with no manifest attached would otherwise be handled as
        // if it were a real one.
        const offered = verdict.manifest;
        if (!offered) {
            process.stderr.write('agent-port: the release verified but carried no manifest. Refusing to install it.\n');
            process.exitCode = 1;
            return;
        }
        const channel = verdict.channel ?? classifyChannel(BINARY_VERSION, offered.version);
        const crossesSchema = offered.ledgerSchemaVersion !== LEDGER_SCHEMA_VERSION;
        if (offered.artifact === 'installer') {
            process.stdout.write(`this release is an installer, not a self-applying binary.\n` +
                `  version ${offered.version}, ledger schema ${offered.ledgerSchemaVersion} (this build: ${LEDGER_SCHEMA_VERSION})\n` +
                '  download it from the release page and install it; nothing on this machine is replaced for you.\n');
            return;
        }
        if (crossesSchema && flags['accept-schema-change'] !== true && flags.acceptSchemaChange !== true) {
            // The ledger is append-only and has no update path, so an older binary
            // against a newer schema is the one error this project cannot recover
            // from. This is never automatic, whatever the channel says.
            process.stderr.write(`agent-port: this release changes the ledger schema (${LEDGER_SCHEMA_VERSION} -> ${offered.ledgerSchemaVersion}).\n` +
                '  The ledger is append-only, so this is never installed automatically.\n' +
                '  Re-run with --accept-schema-change once you have a backup of the ledger file.\n');
            process.exitCode = 1;
            return;
        }
        const automatic = verdict.automatic && !crossesSchema;
        if (!automatic && flags.yes !== true) {
            process.stdout.write(`${offered.version} is available (${channel ?? 'release'}).\n` +
                '  This channel requires a human. Re-run with --yes to install it.\n' +
                '  checks run: ' + verdict.steps.join(' -> ') + '\n');
            return;
        }
        const outcome = await applyUpdate(verdict, {
            targetPath: selfPath,
            mode: automatic ? 'automatic' : 'manual',
            acceptSchemaChange: flags['accept-schema-change'] === true || flags.acceptSchemaChange === true,
            ledgerSchemaVersion: LEDGER_SCHEMA_VERSION,
            fromVersion: BINARY_VERSION,
            source: { kind: 'file', path: artifact.path, sha256: artifact.sha256 },
            healthCheck: versionHealthCheck(),
        });
        if (outcome.status === 'applied') {
            process.stdout.write(`installed ${outcome.to} (${outcome.path})\n`);
            if (outcome.health === 'passed') {
                process.stdout.write('  the new binary reported its own version, so it starts\n');
            }
            return;
        }
        if (outcome.status === 'rolled_back') {
            process.stderr.write(`agent-port: the release did not start, so it was rolled back — ${outcome.reason}: ${outcome.detail}\n`);
            process.exitCode = 1;
            return;
        }
        process.stderr.write(`agent-port: ${outcome.reason}: ${outcome.detail}\n`);
        process.exitCode = 1;
    }
    finally {
        await finish();
    }
}
/**
 * `agent-port discover` — list the endpoints a merchant's backend exposes.
 *
 * This is `connect` for the HTTP side of the boundary. It asks each framework
 * for its own route table and writes the answer to a local file. It reads no
 * database, opens no port, and sends nothing.
 *
 * Two properties are deliberate.
 *
 * **It asks, it does not infer.** `src/discover.ts` runs each framework's own
 * route command and parses its JSON. A source scan would have to guess what the
 * code does, and that guess needs a parser per language — so it could never be
 * language-agnostic. A route dump is the framework answering for itself, which
 * is why this works for a stack we have never seen as long as the framework can
 * be asked.
 *
 * **A route table holds no request data.** There is no field in
 * `bin/rails routes` that could contain a customer's name, because the request
 * that would contain one has not happened. That makes this the safe half of
 * discovery, and it is deliberately built before the half that is not — a
 * merchant who stops here has disclosed only route shapes.
 *
 * The file is a *draft inventory*, not a manifest. It is not loaded by `serve`
 * and it grants nothing. `access`, `dataClass` and per-endpoint credentials are
 * the merchant's decisions, and a tool that inferred them from the verb would
 * call `POST /charges` a read.
 */
async function runDiscover(flags) {
    const { writeFile, chmod, readFile, readdir } = await import('node:fs/promises');
    const { execFile } = await import('node:child_process');
    const { join } = await import('node:path');
    const { promisify } = await import('node:util');
    const { discoverEndpoints } = await import('./discover.js');
    const run = promisify(execFile);
    const cwd = typeof flags.cwd === 'string' ? flags.cwd : process.cwd();
    const target = typeof flags.out === 'string' ? flags.out : 'agent-port.endpoints.json';
    const snapshot = await discoverEndpoints({
        exec: async (cmd, args, dir) => {
            // `bin/rails` is a project script, not a PATH lookup, so it is run as
            // `./bin/rails`. A merchant's global `rails` may belong to a different
            // application, and enumerating a stranger's routes is worse than
            // enumerating none.
            const call = cmd === 'bin/rails' ? `./bin/rails` : cmd;
            try {
                const { stdout } = await run(call, args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 });
                return { stdout: String(stdout), code: 0 };
            }
            catch (err) {
                const code = typeof err.code === 'number' ? err.code : 1;
                return { stdout: err instanceof Error ? err.message : String(err), code };
            }
        },
        exists: async (path) => {
            try {
                await readFile(path);
                return true;
            }
            catch {
                // Not a file — it may still be the directory we are about to walk.
                try {
                    await readdir(path);
                    return true;
                }
                catch {
                    return false;
                }
            }
        },
        readFile: async (path) => readFile(path, 'utf8'),
        listFiles: async (dir) => {
            const out = [];
            // Depth is capped because a route handler cannot usefully nest deeper
            // than this, and an unbounded walk of a merchant's `.next` directory
            // would be an unbounded read of files we do not need.
            const walk = async (current, prefix, depth) => {
                if (depth > 12)
                    return;
                let entries;
                try {
                    entries = await readdir(current, { withFileTypes: true });
                }
                catch {
                    return;
                }
                for (const entry of entries) {
                    if (entry.name === 'node_modules' || entry.name.startsWith('.'))
                        continue;
                    const next = join(current, entry.name);
                    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
                    if (entry.isDirectory())
                        await walk(next, path, depth + 1);
                    else
                        out.push(path);
                }
            };
            await walk(dir, '', 0);
            return out;
        },
    }, cwd);
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    // 0600 for the same reason `connect` writes 0600 and not because the file is
    // a secret: it is reconnaissance. Anyone who reads it learns which endpoints a
    // merchant has and which of them write, and that is an attack surface
    // description whether or not it was meant as one.
    await writeFile(target, body, { mode: 0o600 });
    await chmod(target, 0o600);
    const writes = snapshot.endpoints.filter((e) => e.method !== 'GET' && e.method !== 'HEAD' && e.method !== 'ANY').length;
    const named = snapshot.endpoints.filter((e) => e.request.length + e.response.length + e.parameters.length > 0).length;
    process.stdout.write(`scanned ${cwd}\n`);
    if (snapshot.observedBy.length === 0) {
        process.stdout.write('  no adapter read a route table\n');
    }
    for (const source of snapshot.observedBy)
        process.stdout.write(`  read by  ${source}\n`);
    process.stdout.write(`  endpoints ${snapshot.endpoints.length} (${writes} that are not GET, HEAD or ANY)\n`);
    process.stdout.write(`  with field names ${named} of ${snapshot.endpoints.length}\n`);
    if (snapshot.skipped.length > 0) {
        // Said out loud rather than only in the file, because "no endpoints" and
        // "we could not read your framework" must not read the same.
        process.stdout.write(`\n  NOT read: ${snapshot.skipped.join('\n           ')}\n`);
        process.stdout.write('  Nothing was skipped silently. Those endpoints are absent from this file.\n');
    }
    if (snapshot.warnings.length > 0) {
        // Warnings are the cases that read as complete because nothing failed.
        process.stdout.write(`\n  ${snapshot.warnings.length} warning(s) — fields were missed:\n`);
        for (const warning of snapshot.warnings)
            process.stdout.write(`    ${warning}\n`);
    }
    process.stdout.write(`\nwritten to ${target}\n`);
    process.stdout.write('This is a draft inventory. It is not a manifest, serve does not read it,\n' +
        'and it grants nothing. It carries field names and types, never values.\n' +
        'Classify each endpoint and add credentials by hand.\n');
}
/**
 * `agent-port capture` — watch what the frontend actually calls.
 *
 * A bounded session. The merchant starts it, clicks through their app, stops it,
 * and gets an inventory of the endpoints that were reached. Everything is
 * forwarded upstream untouched, so their site behaves normally while they use
 * it — this is a recorder sitting beside the app, not a gateway in front of it.
 *
 * Two flags are required rather than defaulted, because both are the merchant's
 * decision and a wrong default here is a relay pointed at the wrong place.
 *
 * `--upstream` is where their own API lives, frozen for the session. No caller
 * can change it: a forwarder that takes a URL from the request is an SSRF gadget
 * that no amount of recording policy repairs.
 *
 * `--allow-origin` is the origin permitted to use it, and there is no wildcard
 * and no default. Any page in a browser can send a request to `127.0.0.1`; a
 * request from an origin the merchant did not name is refused, not forwarded.
 *
 * The inventory carries field names and never values, and requests carrying
 * `Authorization` or `Cookie` are forwarded without being recorded at all.
 */
async function runCapture(flags) {
    const { writeFile, chmod } = await import('node:fs/promises');
    const { CallRecorder } = await import('./capture.js');
    const { startCaptureServer } = await import('./capture-server.js');
    const upstream = typeof flags.upstream === 'string' ? flags.upstream : '';
    if (upstream === '') {
        die('--upstream <url> is required, and it is the address of your own API.\n' +
            '  It is fixed for the session on purpose: a relay that takes a destination\n' +
            '  from the request can be pointed anywhere by whoever sends it.');
    }
    const origins = (typeof flags['allow-origin'] === 'string' ? flags['allow-origin'] : '')
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
    if (origins.length === 0) {
        die('--allow-origin <origin> is required, and it takes your site\'s origin.\n' +
            '  There is deliberately no default and no wildcard: any page in a browser\n' +
            '  can send a request to 127.0.0.1, so a request from an origin you did not\n' +
            '  name is refused rather than forwarded.');
    }
    const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1';
    const seconds = typeof flags.seconds === 'string' ? Number(flags.seconds) : 60;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) {
        die(`--seconds must be between 1 and 3600, not ${String(flags.seconds)}`);
    }
    const target = typeof flags.out === 'string' ? flags.out : 'agent-port.calls.json';
    const maxPaths = typeof flags['max-paths'] === 'string' ? Number(flags['max-paths']) : undefined;
    if (maxPaths !== undefined && (!Number.isInteger(maxPaths) || maxPaths < 1)) {
        die(`--max-paths must be a positive integer, not ${String(flags['max-paths'])}`);
    }
    const recorder = new CallRecorder({ allowOrigins: origins, staticThreshold: 2, maxPaths });
    // A merchant has to point a base URL at this, and a printed ephemeral port is
    // not something they can configure a frontend with. Defaulting to the same
    // port `serve` uses means the two do not collide, because capture has stopped
    // before anyone would run serve in the same session.
    const port = typeof flags.port === 'string' ? Number(flags.port) : 8478;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        die(`--port must be an integer between 1024 and 65535, not ${String(flags.port)}`);
    }
    const running = await startCaptureServer({ upstream, recorder, host, port });
    process.stdout.write(`capturing for ${seconds}s\n`);
    process.stdout.write(`  relay      ${running.url}\n`);
    process.stdout.write(`  upstream   ${upstream}\n`);
    process.stdout.write(`  origins    ${origins.join(', ')}\n`);
    process.stdout.write(`\nPoint your frontend's API base URL at ${running.url}, then use your site normally.\n`);
    await new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000).unref();
    });
    await running.close();
    const inventory = recorder.inventory();
    const skipped = recorder.credentialSkipped();
    const overflow = recorder.overflowCount();
    // Annotated, because an unannotated literal is how `skipped: 0` shipped: the
    // shape was invented at the call site and nothing checked it against the
    // contract the union view reads. `isEndpointSnapshot` caught it at runtime,
    // but the build should have refused it.
    const snapshot = {
        version: 1,
        observedBy: ['runtime:capture'],
        endpoints: inventory.map((call) => ({
            method: call.method,
            path: call.pattern,
            provenance: ['runtime:capture'],
            parameters: call.parameters.map((name) => ({ name, type: '' })),
            request: call.body.map((name) => ({ name, type: '' })),
            response: [],
            calls: call.calls,
        })),
        // `skipped` on a snapshot is a list of *sources that could not be read*.
        // The credential skip count is a different thing — requests that were
        // forwarded unrecorded — so it is a warning with the number in the text.
        // Writing the count here produced `skipped: 0`, which is not a list, and
        // the inventory reader rejected its own sibling command's output.
        skipped: [],
        warnings: [
            ...(skipped > 0
                ? [
                    `${skipped} authenticated request(s) were forwarded but NOT recorded, so endpoints only ever called with a token are missing from this file. A contract or a route dump still names them.`,
                ]
                : []),
            ...(overflow > 0
                ? [
                    `${overflow} request(s) named a path past this capture's retention cap and were NOT recorded. Raise it with --max-paths if the app really has that many distinct paths.`,
                ]
                : []),
        ],
    };
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    // 0600 like every other inventory this writes: field names plus call counts
    // describe which endpoints exist and which of them write, and that is an
    // attack surface description whether or not anyone meant it as one.
    await writeFile(target, body, { mode: 0o600 });
    await chmod(target, 0o600);
    const writes = inventory.filter((c) => c.method !== 'GET' && c.method !== 'HEAD').length;
    process.stdout.write(`\nstopped\n`);
    process.stdout.write(`  endpoints  ${inventory.length} (${writes} that are not GET or HEAD)\n`);
    if (skipped > 0)
        process.stdout.write(`  NOT recorded ${skipped} authenticated request(s)\n`);
    if (overflow > 0)
        process.stdout.write(`  NOT recorded ${overflow} request(s) past the path cap\n`);
    process.stdout.write(`  refused    ${running.refused()} cross-origin request(s)\n`);
    process.stdout.write(`\nwritten to ${target}\n`);
    process.stdout.write('Field names and types only, never values. This is a draft inventory: serve\n' +
        'does not read it and it grants nothing. A path seen once reads as /{id}/\n' +
        'by design, because one sighting cannot be told apart from a customer slug.\n');
}
/**
 * `agent-port hook` — capture the traffic that never reaches a browser.
 *
 * Writes two readable files into the merchant's project and prints the command
 * to run with them. It starts nothing itself, because the thing it observes is
 * somebody else's process: their `next dev`, their `node server.js`, their test
 * run.
 *
 * The files are emitted rather than imported from this package on purpose. A
 * merchant is being asked to run code inside their server process, with access
 * to their environment and every secret in it. An opaque specifier in a
 * `NODE_OPTIONS` value is the least reviewable thing a tool can ask for; two
 * files they can open and read is the most reviewable.
 *
 * `--import` imports the file, so there is no loader registration and no second
 * entry point — the file that documents itself is the file that runs. The only
 * other file is the recorder it wraps, copied out of this package so the
 * merchant's server resolves it from their project rather than from a path
 * inside a package that may not be installed there.
 */
async function runHook(flags) {
    const { writeFile, chmod, readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const out = typeof flags.out === 'string' ? flags.out : 'agent-port.hook.mjs';
    const runtimePath = out.replace(/\.mjs$/, '.runtime.mjs');
    const recorderPath = out.replace(/\.mjs$/, '.recorder.mjs');
    // String.raw so the escapes below reach the file as two characters rather than
    // being interpreted here. A template literal turns `\n` into a real newline, which
    // produces a file that fails to parse — and a hook that cannot load is a hook the
    // merchant finds out about at the worst possible moment.
    const loader = String.raw `// Written by agent-port hook. Read it before you run it: this executes
// inside your server process, with access to your environment and every secret
// in it. It wraps one function, records the NAMES of things, and cannot change
// a response or a status code.
//
//   node --import ./${out} ./node_modules/.bin/next dev
//
// It writes nothing unless you set AGENTPORT_HOOK_OUT. Delete both files when
// you are done.
import { writeFileSync } from 'node:fs'
import { installFetchHook, toSnapshot } from './${runtimePath.split('/').pop()}'

const { recorder } = installFetchHook({ allowOrigins: [] })

const out = process.env.AGENTPORT_HOOK_OUT ?? 'agent-port.server-calls.json'
let written = false
const write = () => {
  // Once, on the way out. Two handlers racing would let a reload truncate a
  // good inventory with an empty one, which is the worst possible failure for
  // the file a merchant is about to trust.
  if (written) return
  written = true
  const snapshot = toSnapshot(recorder)
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 })
  process.stderr.write(
    'agent-port: recorded ' + snapshot.endpoints.length + ' server-side endpoint(s) to ' + out + '\n',
  )
  for (const warning of snapshot.warnings) process.stderr.write('agent-port: ' + warning + '\n')
}
// A signal listener *suppresses* Node's default termination, so registering one
// that only flushes leaves the merchant's dev server running straight through
// Ctrl-C — the process writes its inventory and then hangs. Flush, drop our own
// listener, then re-raise the signal so the process dies exactly as it would
// have if this hook were not installed. 'beforeExit' cannot substitute: it never
// fires for a signal.
for (const signal of ['SIGINT', 'SIGTERM']) {
  const onSignal = () => {
    write()
    process.off(signal, onSignal)
    process.kill(process.pid, signal)
  }
  process.on(signal, onSignal)
}
process.on('beforeExit', write)
`;
    // The two modules the hook needs at runtime, copied under agent-port names so
    // nothing generic like `capture.js` lands in the merchant's project and
    // collides with theirs.
    //
    // The one import between them is rewritten rather than both files being dumped
    // under their own names, and the replacement is *asserted*. A silently
    // unrewritten specifier produces a loader that fails to resolve at run time,
    // inside a server process, on the merchant's machine — the worst place to
    // discover a typo.
    const here = fileURLToPath(new URL('.', import.meta.url));
    const hookSource = await readFile(`${here}fetch-hook.js`, 'utf8');
    const SPECIFIER = "from './capture.js'";
    if (!hookSource.includes(SPECIFIER)) {
        die('the hook runtime no longer imports capture.js by that path; agent-port hook\n' +
            '  cannot rewrite it and would emit a loader that fails to load.');
    }
    // Both specifiers come from the paths, never from a literal, so a merchant who
    // passes `--out somewhere/nested/name.mjs` gets files that resolve.
    const recorderName = recorderPath.split('/').pop();
    await writeFile(runtimePath, hookSource.replace(SPECIFIER, `from './${recorderName}'`), { mode: 0o600 });
    await writeFile(recorderPath, await readFile(`${here}capture.js`, 'utf8'), { mode: 0o600 });
    await writeFile(out, loader, { mode: 0o600 });
    await chmod(out, 0o600);
    await chmod(runtimePath, 0o600);
    await chmod(recorderPath, 0o600);
    process.stdout.write(`wrote ${out}, ${runtimePath} and ${recorderPath}.\n\n`);
    process.stdout.write(`  node --import ./${out} <your dev command>\n\n`);
    process.stdout.write('It records method, path pattern, query names and body field names for calls your\n' +
        'server makes — which is where a Next.js app does most of its fetching, because\n' +
        'Server Components and Server Actions never pass a browser. Values are never\n' +
        'recorded. Requests carrying Authorization or Cookie are forwarded but not\n' +
        'recorded at all, and the file says how many.\n\n' +
        'Then reconcile it against your routes and contracts:\n' +
        '  agent-port inventory agent-port.endpoints.json agent-port.server-calls.json\n');
}
/**
 * `agent-port inventory <files...>` — reconcile every pass into one list.
 *
 * Takes any number of inventories written by `discover`, `capture` or the
 * server hook, and folds them into one table sorted into three buckets: named
 * and used, used and never named, named and never used.
 *
 * A separate file per pass is the right unit for *running* a pass — each has
 * its own prerequisites and its own failure modes — and the wrong unit for
 * *reading* one, because a merchant holding three files is being asked to do by
 * hand exactly the reconciliation the tool can do correctly. The bucket that
 * matters is used-but-never-declared: a reachable endpoint that appears in no
 * contract a reviewer would read.
 */
async function runInventory(flags, positionals) {
    const { readFile, writeFile, chmod } = await import('node:fs/promises');
    const { unionInventories, formatReport } = await import('./inventory.js');
    // Comma-separated and space-separated both work, because both are natural at
    // a terminal and a merchant should not have to remember which this one is.
    const files = positionals
        .flatMap((p) => p.split(','))
        .map((f) => f.trim())
        .filter((f) => f !== '');
    if (files.length === 0) {
        die('inventory needs at least one file.\n' +
            '  Pass any mix of `agent-port discover`, `agent-port capture` and the\n' +
            '  server hook output, comma separated:\n' +
            '    agent-port inventory agent-port.endpoints.json agent-port.calls.json');
    }
    const inputs = [];
    for (const file of files) {
        let parsed;
        try {
            parsed = JSON.parse(await readFile(file, 'utf8'));
        }
        catch {
            die(`could not read ${file} as JSON.\n` +
                '  Each argument must be a file an earlier agent-port command wrote.');
        }
        if (!isEndpointSnapshot(parsed)) {
            die(`${file} is not an endpoint inventory.\n` +
                `  Expected version 1 with an endpoints array; found ${describe(parsed)}.\n` +
                '  Point this at agent-port output, not at a route dump or a spec.');
        }
        inputs.push({ file, snapshot: parsed });
    }
    const report = unionInventories(inputs);
    process.stdout.write(`${formatReport(report)}\n`);
    process.stdout.write(`corroborated ${report.corroborated.length} · used-not-declared ` +
        `${report.usedNotDeclared.length} · declared-not-used ${report.declaredNotUsed.length}\n`);
    if (report.warnings.length > 0 || report.skipped.length > 0) {
        // Omissions travel with the merge. A union that quietly drops the passes
        // which could not read something reads as the union that read everything.
        process.stdout.write('\nwhat these inventories do not cover\n');
        for (const s of report.skipped)
            process.stdout.write(`  skipped  ${s.file}: ${s.entry}\n`);
        for (const w of report.warnings)
            process.stdout.write(`  warning  ${w.file}: ${w.entry}\n`);
    }
    const out = typeof flags.out === 'string' ? flags.out : 'agent-port.inventory.json';
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await chmod(out, 0o600);
    process.stdout.write(`\nwritten to ${out}\n`);
}
/** Structural check. A field-by-field validator would be a second schema to drift. */
function isEndpointSnapshot(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return (candidate.version === 1 &&
        Array.isArray(candidate.endpoints) &&
        Array.isArray(candidate.skipped) &&
        Array.isArray(candidate.warnings));
}
/** Names the shape found, so a wrong file is diagnosable without guessing. */
function describe(value) {
    if (value === null || typeof value !== 'object')
        return typeof value;
    const keys = Object.keys(value);
    return keys.length === 0 ? 'an empty object' : `keys ${keys.slice(0, 4).join(', ')}`;
}
/**
 * Returns a flag's value, refusing one the parser turned into a bare boolean.
 *
 * `agent-port ledger --limit` is a typo, not a request for the default. The
 * parser records it as `true`, and callers that coerce it end up acting on a
 * value the merchant never typed.
 */
// The decision vocabulary is read from the engine's own constant rather than
// written out again, so `--decision` cannot drift from the type, from what
// `SqlLedger` stores, or from the schema's CHECK constraint. An earlier version
// of this wrote the three strings out with a comment claiming they were derived,
// which is the kind of claim a reader trusts and a later edit invalidates.
const DECISIONS = POLICY_OUTCOMES;
function requireStringFlag(flags, name) {
    const value = flags[name];
    if (typeof value !== 'string' || value.length === 0) {
        die(`--${name} needs a value`);
    }
    return value;
}
/**
 * Renders the numbers a rule was measured against, for one row of `ledger` output.
 *
 * Empty for a capability that is not registered, because there were no rules to
 * evaluate — so its absence is a fact rather than a gap, and printing `-` for it
 * says so rather than implying the rule was skipped.
 */
function describeEvaluated(evaluated) {
    if (!evaluated || Object.keys(evaluated).length === 0)
        return '-';
    return Object.entries(evaluated)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toLocaleString('en-US') : String(v)}`)
        .join(' ');
}
async function main() {
    const { command, flags, positionals } = parseArgs(process.argv.slice(2));
    // An upgrade that a power cut interrupted is resolved before anything else
    // runs, including `help`. The alternative is a merchant whose binary is
    // half-swapped and who has to be told to run a command on the broken
    // version to find out.
    const selfPath = process.argv[1] ? (await import('node:path')).resolve(process.argv[1]) : '';
    if (selfPath) {
        const recovered = await recoverPendingUpgrade(selfPath);
        if (recovered.status === 'completed') {
            process.stderr.write(`agent-port: finished an interrupted upgrade; now ${recovered.version}\n`);
        }
        else if (recovered.status === 'rolled_back') {
            process.stderr.write(`agent-port: an interrupted upgrade did not start; restored ${recovered.version}\n`);
        }
        else if (recovered.status === 'failed') {
            process.stderr.write(`agent-port: ${recovered.detail}\n`);
        }
    }
    // `--version` is before `help` because the update health check runs the
    // installed binary with `--version`, and a binary that answers a version
    // question with usage text and exit 1 is indistinguishable from a corrupt
    // release. Every update would roll back and present as a flaky network.
    if (command === 'version' || flags.version === true) {
        const policy = describeUpdatePolicy();
        process.stdout.write(`${BINARY_VERSION}\n`);
        if (command === 'version') {
            process.stdout.write(`  ledger schema   ${policy.ledgerSchemaVersion}\n`);
            process.stdout.write(`  manifest origin ${policy.manifestOrigin}\n`);
            process.stdout.write(`  certificate     ${policy.certificateIdentity}\n`);
            process.stdout.write(`  oidc issuer     ${policy.oidcIssuer}\n`);
            process.stdout.write(`  channel         ${policy.channel}\n`);
        }
        return;
    }
    if (command === 'help' || flags.help) {
        process.stdout.write(`${HELP}\n`);
        return;
    }
    if (command === 'upgrade' || flags.resetState === true) {
        await runUpgrade(flags, selfPath);
        return;
    }
    if (command === 'ledger') {
        // Reading the merchant's own rows.
        //
        // The CLI can write every row in this table and until now could read none of
        // them back, which left "your ledger is yours, it is in your database" true in
        // principle and unusable in practice — a merchant who wanted to see what an
        // agent did had to write SQL by hand. This command is the other half of that
        // sentence.
        //
        // It is a *reader*. There is no `--delete`, no `--update`, and no edit verb,
        // because the table has no update path and a command that offered one would be
        // an invitation to break the one guarantee the product makes. Rendering is the
        // only permitted verb.
        const path = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
        const cfg = loadConfig(path);
        const descriptor = cfg.database;
        if (!descriptor)
            die('the config has no `database` block');
        const handle = await openSqlite({ path: descriptor.path });
        try {
            const ledger = new SqlLedger(handle.exec, { tenantId: cfg.tenantId });
            // Every flag here is validated as a *string* before use, because the parser
            // gives a bare `--limit` the value `true`, and `Number(true)` is 1. Without
            // this check `--limit --json` silently printed one row and looked like it
            // honoured a request for the newest. A flag that is present but unusable
            // must say so; a query that quietly answers a different question than the
            // one asked is the failure mode this product exists to prevent.
            // Unknown flags are refused rather than ignored. `--delete` on a
            // read-only command is the obvious one to get wrong, and ignoring it is
            // safe — nothing is deleted — but it prints a normal listing, so the
            // merchant sees output and concludes the flag was honoured. On a command
            // whose whole claim is "there is no edit verb", accepting an edit verb and
            // doing nothing is a worse answer than naming it.
            const KNOWN = new Set(['config', 'limit', 'capability', 'agent', 'decision', 'since', 'json']);
            const unknown = Object.keys(flags).filter((k) => !KNOWN.has(k));
            if (unknown.length > 0) {
                die(`ledger is a reader: ${unknown.map((u) => `--${u}`).join(', ')} not recognised.\n` +
                    '       This command has no edit verb, because the table has no update path.\n' +
                    '       Use `agent-port ledger-table --sql` if you need the DDL.');
            }
            const limit = flags.limit === undefined ? '50' : requireStringFlag(flags, 'limit');
            if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 1000) {
                die('--limit must be a whole number between 1 and 1000');
            }
            const filter = { limit: Number(limit) };
            if (flags.capability !== undefined)
                filter.capability = requireStringFlag(flags, 'capability');
            if (flags.agent !== undefined)
                filter.agentId = requireStringFlag(flags, 'agent');
            if (flags.decision !== undefined) {
                const decision = requireStringFlag(flags, 'decision');
                if (!DECISIONS.includes(decision)) {
                    die(`--decision must be one of ${DECISIONS.join('|')}, not ${decision}`);
                }
                filter.decision = decision; // narrowed by the check above
            }
            if (flags.since !== undefined) {
                const since = requireStringFlag(flags, 'since');
                // Validated rather than passed through. `--since yesterday` is a
                // plausible thing to type, and `since` is compared lexicographically
                // against ISO timestamps, so it matched nothing and the command printed
                // "no rows" — exit 0, no error. A query that answers a different question
                // than the one asked, reported as an empty result, is the failure this
                // command's own flag validation exists to prevent.
                if (Number.isNaN(Date.parse(since))) {
                    die(`--since must be an ISO 8601 timestamp, not ${since}`);
                }
                filter.since = new Date(since).toISOString();
            }
            const entries = await ledger.list(filter);
            if (flags.json) {
                process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
                return;
            }
            if (entries.length === 0) {
                process.stdout.write(`no rows for ${cfg.tenantId} in ${descriptor.path}\n`);
                return;
            }
            // The columns are the ones that answer the question a merchant actually
            // holds a row for: what decided this, which rule, against what numbers, and
            // which config version. A row showing only `allow` answers nothing.
            const rows = entries.map((e) => [
                '',
                '',
                '',
                e.rule,
                '',
                describeEvaluated(e.evaluated),
                e.configHash ?? '-',
            ]);
            const header = ['', '', '', 'RULE', '', 'MEASURED', 'CONFIG'];
            const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
            const line = (cells) => cells.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ').trimEnd();
            process.stdout.write(`${line(header)}\n`);
            for (const row of rows)
                process.stdout.write(`${line(row)}\n`);
            process.stdout.write('');
        }
        finally {
            handle.close();
        }
        return;
    }
    if (command === 'ledger-table') {
        // Prints DDL. Never connects, never creates anything.
        //
        // The distinction is the whole security posture of this command: it is how a
        // merchant brings their own database into the picture without AgentPort ever
        // holding a credential for it. A command that opened a connection would have to
        // ask for one, and a credential we hold is a credential that can leak.
        //
        // Append-only is created here, not hoped for. The triggers below abort UPDATE
        // and DELETE, so the guarantee is enforced by the database rather than by
        // convention — and a merchant who drops the triggers degrades it to "the SDK
        // never issues an UPDATE or a DELETE", which is a weaker claim and is named as
        // such in the footer.
        const target = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
        let path = 'agent-port.db';
        let tenantId = 'your-tenant-id';
        try {
            const cfg = loadConfig(target);
            if (cfg.database?.path)
                path = cfg.database.path;
            if (cfg.tenantId)
                tenantId = cfg.tenantId;
        }
        catch {
            // No config yet is the ordinary case for this command: it is often the first
            // thing a merchant runs, precisely so they can create the table before
            // `init`. Falling back to the documented defaults is correct here, and the
            // footer says which values were assumed.
        }
        if (flags.sql) {
            process.stdout.write(LEDGER_DDL);
            return;
        }
        process.stdout.write(`-- Agentport ledger for tenant: ${tenantId}\n` +
            `-- target database: ${path}\n` +
            '--\n' +
            '-- Run this against the database YOU host. AgentPort never connects to it and\n' +
            '-- never holds a credential for it; it only writes rows here.\n' +
            '--\n' +
            '-- The UPDATE and DELETE triggers are what make the table append-only by\n' +
            '-- construction. Keep them. Without them this table is still append-only by\n' +
            '-- convention, and convention is not append-only.\n' +
            '\n');
        process.stdout.write(LEDGER_DDL);
        process.stdout.write('\n-- Intent store. Keyed on (tenant_id, intent_id) rather than intent_id alone,\n' +
            '-- because an intent id is a merchant-chosen label and two shops choosing the\n' +
            '-- same one is ordinary. Keyed alone, shop B reads shop A\'s outcome and\n' +
            '-- returns it as its own.\n' +
            '--\n' +
            '-- Run with:  sqlite3 ' + path + ' < this-file.sql\n');
        return;
    }
    if (command === 'approve') {
        // The human in the loop, run by the merchant on their own machine. A
        // held write is decided locally, which is the same reason enforcement is:
        // an approval that needed our server would be an approval that our outage
        // can cancel.
        const requestId = typeof flags.request === 'string' ? flags.request : die('approve requires --request <id>');
        const approvedBy = typeof flags.by === 'string' ? flags.by : die('approve requires --by <who>');
        const path = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
        const cfg = loadConfig(path);
        const descriptor = cfg.database;
        if (!descriptor)
            die('the config has no `database` block');
        const handle = await openSqlite({ path: descriptor.path });
        await installSqliteSchema(handle);
        // The commit path enforces the same policy the serve path enforces. Before
        // this, `approve` always read the file while `serve` could be enforcing a
        // signed artifact — so a human approved under one policy and committed
        // under another, which is the duplicated-merge defect AGENTS.md records for
        // the policy-input assembly, in a new place. One helper, called by both.
        const artifactPolicy = await loadArtifactPolicy(cfg);
        const approvedPolicy = artifactPolicy?.policy ?? cfg.policy ?? {};
        const port = new AgentPort({
            business: cfg.business, tenantId: cfg.tenantId, baseUrl: cfg.baseUrl,
            ledger: new SqlLedger(handle.exec, { tenantId: cfg.tenantId }),
            policy: approvedPolicy, clock: () => new Date(),
            // Same digest `serve` stamps, so a row written by `agent-port approve`
            // is comparable with one written by the server that held the request.
            // Unchanged when no artifact is active: the digest is evidence, and an
            // upgrade must not mint new evidence for old decisions.
            configHash: await configDigest(artifactPolicy === undefined ? cfg : { ...cfg, policy: approvedPolicy }),
            // `approve` writes a ledger row for a commit the server already decided.
            // If that row cannot be written, the CLI is the last place the failure is
            // visible, so it does not fall back to the no-op logger.
            logger: createStderrLogger(),
        }, new SqlApprovalStore(handle.exec, { tenantId: cfg.tenantId }), new SqlIdempotencyStore(handle.exec, { tenantId: cfg.tenantId }));
        // The handler is reconstructed from the same config, so a commit re-runs the
        // merchant's real query rather than a stub.
        for (const capability of buildCapabilities(cfg.capabilities ?? [], {
            descriptor,
            driver: handle.driver,
            // `baseUrl` is what makes the http source's frozen destination checkable.
            // Left off, a held http capability would fail to build here while it built
            // fine in `serve` — so `approve` could not commit a request the server was
            // willing to hold.
            baseUrl: cfg.baseUrl,
        })) {
            port.expose(capability);
        }
        const outcome = await port.approve(requestId, approvedBy);
        handle.close();
        process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
        if (outcome.status !== 'ok')
            process.exitCode = 2;
        return;
    }
    if (command === 'pending') {
        // What is waiting on a human, read from the merchant's own record. Without
        // it, a held request is invisible and an operator learns about it only
        // when a customer complains.
        const path = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
        const cfg = loadConfig(path);
        if (!cfg.database)
            die('the config has no `database` block');
        const handle = await openSqlite({ path: cfg.database.path });
        await installSqliteSchema(handle);
        const store = new SqlApprovalStore(handle.exec, { tenantId: cfg.tenantId });
        const rows = await store.listPending();
        handle.close();
        if (rows.length === 0) {
            process.stdout.write('nothing is waiting for approval\n');
            return;
        }
        for (const r of rows) {
            process.stdout.write(`${r.requestId}  ${r.capability}  ${r.at}\n          ${r.detail}\n`);
        }
        return;
    }
    if (command === 'init') {
        // Before `configPath` is resolved, because `init` CREATES that file and
        // reading it first would fail on a machine that has never run this.
        const target = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
        await runInit(target, flags);
        return;
    }
    if (command === 'secret') {
        // A secret is generated, printed once, and never written anywhere. If the
        // merchant loses it they mint a new one and existing credentials stop
        // verifying, which is the correct failure: a lost key must revoke, not
        // silently fall back to something more permissive.
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        process.stdout.write(`${Buffer.from(bytes).toString('base64url')}\n`);
        return;
    }
    if (command === 'keys') {
        // Provision-time, so before config loading like `init`: the keypair this
        // writes is what a future config's artifact block will verify against,
        // and requiring a config would mean the key cannot exist before the thing
        // that names it.
        const outDir = typeof flags.out === 'string' ? flags.out : die('keys requires --out <dir>: the directory the keypair is written to.');
        await runKeys(outDir);
        return;
    }
    if (command === 'token') {
        const agentId = typeof flags.agent === 'string' ? flags.agent : die('token requires --agent <id>');
        const scope = typeof flags.scope === 'string' ? flags.scope : '*';
        const secret = process.env.AGENTPORT_SIGNING_SECRET ?? die('AGENTPORT_SIGNING_SECRET is not set');
        const ttl = flags.ttl ? Number(flags.ttl) : 3600;
        // `--ttl abc` produced a NaN expiry and printed a token that looked valid
        // and never worked; `--ttl -1` printed one already expired.
        if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 31_536_000) {
            die('--ttl must be a whole number of seconds between 1 and 31536000 (one year).');
        }
        const { token, expiresAt } = await issueToken({ agentId, scopes: [scope], ttlMs: ttl * 1000 }, secret);
        process.stdout.write(`${token}\n`);
        process.stderr.write(`agent ${agentId} scope ${scope} expires ${expiresAt}\n`);
        return;
    }
    if (command === 'hook') {
        // Writes files into the merchant's project. Nothing is loaded, nothing is
        // started, and no request is made: the merchant decides when to run it, in
        // a process they chose, having read it.
        await runHook(flags);
        return;
    }
    if (command === 'inventory') {
        // Reads files this binary wrote, and nothing else. No config, no ledger, no
        // network: reconciling inventories must work before anything is governed.
        await runInventory(flags, positionals);
        return;
    }
    if (command === 'capture') {
        // Before config loading, like `discover`. Capturing is a read of the
        // merchant's own traffic against their own API and needs no config, no
        // ledger and no credential — a merchant should be able to see what their
        // site does before deciding whether any of it should be governed.
        await runCapture(flags);
        return;
    }
    if (command === 'discover') {
        // Before config loading, like `connect`. Discovery asks the merchant's
        // framework what it exposes; requiring a config would mean they cannot see
        // their own surface until they have already decided what to expose from it.
        await runDiscover(flags);
        return;
    }
    if (command === 'connect') {
        // Before config loading, like `init`. `connect` reads the database named by
        // --ledger, not the one the config describes, so requiring a config would
        // mean a merchant cannot inspect their own database until they have
        // already configured capabilities against it — which is the wrong order.
        // You cannot choose what to expose from tables you have not been shown.
        await runConnect(flags);
        return;
    }
    const configPath = typeof flags.config === 'string' ? flags.config : 'agent-port.config.json';
    let config;
    try {
        config = loadConfig(configPath);
    }
    catch (err) {
        if (err instanceof ConfigError) {
            // Every problem at once, so a merchant fixes the file in one pass.
            process.stderr.write(`${err.message}\n`);
            process.exit(1);
        }
        throw err;
    }
    if (command === 'publish') {
        // After config loading, because the artifact is built FROM the config: the
        // policy it signs is the file's policy, and the tenant it binds is the
        // file's tenant. Publishing what was not loaded is how a stale file signs
        // a policy nobody reviewed.
        await runPublish(flags, configPath);
        return;
    }
    if (command === 'doctor') {
        const report = doctor(config, process.env);
        if (report.errors.length === 0 && report.notes.length === 0) {
            process.stdout.write(`ok  ${config.business} (${config.tenantId}), ${config.capabilities?.length ?? 0} capabilities\n`);
            return;
        }
        // Exit code distinguishes "a control is not there" from "worth a look", so
        // a script can gate on it without parsing prose.
        if (report.errors.length > 0) {
            process.stderr.write(`${report.errors.length} control(s) will not work as written:\n`);
            for (const e of report.errors)
                process.stderr.write(`  - ${e}\n`);
            process.exitCode = 1;
        }
        if (report.notes.length > 0) {
            process.stdout.write(`${report.notes.length} thing(s) to look at:\n`);
            for (const n of report.notes)
                process.stdout.write(`  - ${n}\n`);
        }
        if (report.errors.length === 0)
            return;
        return;
    }
    if (command !== 'serve')
        die(`unknown command "${command}". Run \`agent-port help\`.`);
    // `requireStringFlag`, not `Number(flags.port)`. The parser gives a bare `--port`
    // the value `true`, `Number(true)` is 1, and 1 passes the range check below —
    // so `agent-port serve --port` tried to bind the privileged port 1 and failed
    // with "permission denied", naming a cause the merchant never typed. `capture`
    // already read this flag correctly; `serve` is the command where the port
    // actually matters.
    const port = flags.port === undefined ? 8477 : Number(requireStringFlag(flags, 'port'));
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        die(`--port must be a number between 1 and 65535`);
    // Refuses to start on a config where a control the merchant believes is set
    // is not. This gate now lives in `startAgent`, before the listener binds — it
    // used to sit here, after the port was already answering, which left a window
    // in which requests were served under a policy that could not enforce.
    let started;
    try {
        started = await startAgent(config, process.env, {
            port,
            host: typeof flags.host === 'string' ? flags.host : '127.0.0.1',
            verbose: flags.verbose === true,
        });
    }
    catch (err) {
        if (err instanceof UnenforceableConfigError) {
            for (const e of err.problems)
                process.stderr.write(`agent-port: ${e}\n`);
            die('refusing to start with a policy that cannot enforce. Fix the config, or run `agent-port doctor`.');
        }
        // The specific fatal for total artifact failure: no valid artifact AND no
        // cache. Named separately from the config gate above because the remedy is
        // different — this is about the signed channel, not the file — and a
        // merchant who sees only "cannot enforce" would edit the file while the
        // signature is what is broken.
        if (err instanceof ArtifactLoadError) {
            process.stderr.write(`agent-port: ${err.message}\n`);
            die(`refusing to serve without a verified policy artifact (${err.reason}). Publish one with\n` +
                '  `agent-port publish`, or check the artifact source, the cache, and the public key.');
        }
        throw err;
    }
    const { server } = started;
    const report = doctor(config, process.env);
    if (report.errors.length > 0) {
        // Unreachable: `startAgent` refuses on exactly these before binding. Kept as
        // a belt-and-braces check rather than removed, because deleting the second
        // of two guards on a security gate is the kind of edit that reads as tidy
        // and is not.
        for (const e of report.errors)
            process.stderr.write(`agent-port: ${e}\n`);
        die('refusing to start with a policy that cannot enforce. Fix the config, or run `agent-port doctor`.');
    }
    process.stdout.write(`agent-port listening on http://127.0.0.1:${server.port}\n`);
    process.stdout.write(`  manifest  /.well-known/agent.json\n`);
    process.stdout.write(`  invoke    /.well-known/agent/invoke\n`);
    process.stdout.write(`  ledger    ${config.database?.path ?? '(unset)'}\n`);
    if (report.notes.length > 0) {
        process.stdout.write(`\n${report.notes.length} thing(s) worth fixing — run \`agent-port doctor\`:\n`);
        for (const n of report.notes)
            process.stdout.write(`  - ${n}\n`);
        process.stdout.write('\n');
    }
    // Ctrl-C is the most natural moment a merchant has to lose analytics, and the
    // window that was mid-flight is exactly the one covering the requests they just
    // made. The periodic timer is `unref`'d, which is right for liveness and wrong
    // for durability, so the last window is flushed here.
    //
    // Bounded, because a shutdown that waits on our host is a shutdown that can
    // hang. A window lost to the deadline is a real loss, but an operator who
    // cannot stop the process has no analytics and no running shop.
    const shutdown = () => {
        const flushed = started.analytics === undefined
            ? Promise.resolve()
            : Promise.race([
                started.analytics.flush().catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 2000)),
            ]);
        void flushed.then(() => server.close()).then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    process.stderr.write(`agent-port: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=main.js.map