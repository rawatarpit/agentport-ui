/**
 * Asks the database what it is, by running the one query every dialect agrees
 * to answer.
 *
 * `SELECT version()` is close to universal but its *output* is not: Postgres
 * returns `PostgreSQL 16.2 on x86_64...`, MySQL returns `8.0.36`, SQLite
 * returns `3.45.1`. So this parses prefixes rather than assuming a shape, and
 * an unrecognised string is an error rather than a default. Defaulting to
 * sqlite here would run SQLite catalog queries against a Postgres server, and
 * the failure would surface as an empty schema — which a merchant reads as "I
 * have no tables" rather than "we guessed wrong".
 */
export function parseVersion(raw, asked) {
    if (typeof raw !== 'string' || raw.length === 0) {
        throw new Error('introspection: the database returned no version string. A dialect cannot be guessed ' +
            'from an empty response, because guessing wrong reports an empty schema and a ' +
            'merchant reads that as "my shop has no tables".');
    }
    const lower = raw.toLowerCase();
    // A named product is decisive on its own, whatever was asked. Postgres and
    // MariaDB name themselves; MySQL may or may not.
    if (lower.startsWith('postgresql'))
        return { dialect: 'postgres', serverVersion: raw };
    if (lower.includes('mariadb'))
        return { dialect: 'mysql', serverVersion: raw };
    // A bare dotted version is NOT decidable from the string, and pretending
    // otherwise is the bug this branch exists to avoid. MySQL's `SELECT version()`
    // answers `8.0.36`. `sqlite_version()` answers `3.53.3`. Both are bare dotted
    // numbers, and no amount of pattern-matching separates them — the test suite
    // caught exactly that, having been written the other way round first.
    //
    // So the answer comes from *which query was asked*, not from what came back.
    // The string is only able to contradict the question, never to answer it.
    if (/^\d+\.\d+(\.\d+)*/.test(lower)) {
        if (asked !== undefined)
            return { dialect: asked, serverVersion: raw };
        throw new Error(`introspection: this database reported the bare version "${raw}", which does not identify ` +
            'an engine — MySQL and SQLite both answer in this form. Refusing to guess, because the ' +
            'catalog queries differ and a wrong guess reports an empty schema to the merchant.');
    }
    if (lower.startsWith('mysql'))
        return { dialect: 'mysql', serverVersion: raw };
    if (lower.startsWith('sqlite'))
        return { dialect: 'sqlite', serverVersion: raw };
    throw new Error(`introspection: this database reported "${raw.slice(0, 80)}", which is not a dialect we ` +
        'know. Refusing to guess — the catalog queries differ per dialect and a wrong guess reads ' +
        'to the merchant as an empty schema.');
}
/**
 * The query each dialect answers with its own name.
 *
 * SQLite is the exception that justifies the map. `SELECT version()` is not a
 * SQLite function — it is a SQL-standard aggregate that SQLite does not
 * implement — so a single query works on Postgres and MySQL and fails on the
 * one engine that actually ships in this package. SQLite exposes the same
 * information as `SELECT sqlite_version()`, which is a function.
 *
 * That is worth stating because it is the kind of detail that is discovered in
 * production, on the engine 100% of current merchants run: the failure was
 * `no such function: version`, and the fallback is to guess the dialect from
 * the driver we already opened — which is the guessing this module exists to
 * prevent, and which would have meant reporting an empty schema for a database
 * that has tables in it.
 */
const VERSION_QUERY = {
    postgres: 'SELECT version()',
    mysql: 'SELECT version()',
    sqlite: 'SELECT sqlite_version()',
};
/**
 * Asks the database what it is.
 *
 * Each candidate dialect is asked with its own query and the answer is parsed
 * back, rather than the dialect being assumed and then verified. The reason is
 * that a wrong assumption is not a loud failure: it produces an empty table
 * list, and a merchant reads that as "my shop has no tables" rather than "we
 * guessed wrong" — and then has no reason to distrust the rest of the output.
 *
 * So the loop only *offers* a dialect. The string the database returns is what
 * decides.
 */
export async function probeDialect(driver) {
    const errors = [];
    for (const dialect of ['sqlite', 'postgres', 'mysql']) {
        let rows;
        try {
            const result = await driver.run(VERSION_QUERY[dialect]);
            rows = Array.isArray(result.rows) ? result.rows : [];
        }
        catch (err) {
            // Expected for every dialect but one. Recorded rather than raised so the
            // final error can name what was tried — a merchant whose server rejects
            // all three needs to know we asked, not that we never tried.
            errors.push(`${dialect}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
        const row = rows[0];
        if (row === null || typeof row !== 'object') {
            errors.push(`${dialect}: returned no row`);
            continue;
        }
        // The version string is read positionally. Dialects name the column
        // differently (`version()`, `version`, `sqlite_version()`) and a driver
        // may or may not preserve that spelling, so there is exactly one string
        // value in the row and reading the first one cannot miss a naming choice.
        const raw = firstString(row);
        if (raw === undefined) {
            errors.push(`${dialect}: returned no version string`);
            continue;
        }
        // The dialect that was asked is passed in, because for SQLite and MySQL the
        // answer is a bare version number and only the question identifies it.
        const parsed = parseVersion(raw, dialect);
        // A named product contradicting the question is still a mismatch: Postgres
        // answering `sqlite_version()` means something is wrong with the driver, and
        // trusting the query over that string would query the wrong catalog.
        if (parsed.dialect !== dialect) {
            errors.push(`${dialect}: answered with a ${parsed.dialect} version string`);
            continue;
        }
        return parsed;
    }
    throw new Error('introspection: could not determine the database type. Asked each of sqlite, postgres and ' +
        `mysql and none answered:\n  ${errors.join('\n  ')}\n` +
        '  Refusing to guess — the catalog queries differ per dialect, and a wrong guess reads to ' +
        'the merchant as an empty schema.');
}
/** First string value in a row, whatever the driver named the column. */
function firstString(row) {
    for (const value of Object.values(row)) {
        if (typeof value === 'string' && value.length > 0)
            return value;
    }
    return undefined;
}
/**
 * SQLite catalog reads. Two statements because SQLite has no single
 * information_schema: `sqlite_master` gives the table list, and `PRAGMA
 * table_info` gives columns one table at a time.
 *
 * Both filters are on `name`, and neither filters rows — `sqlite_master` holds
 * schema, and the `type = 'table'` filter is there to drop indexes, triggers
 * and views, not to hide data.
 */
async function introspectSqlite(driver) {
    const listed = await driver.run("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables = [];
    for (const entry of listed.rows) {
        const name = tableName(entry);
        if (name === undefined)
            continue;
        // The table name goes in as a binding, not spliced into the statement.
        // `PRAGMA table_info` does not accept a placeholder for its argument, so
        // the quote is doubled rather than the value trusted: a table named
        // `a"b` becomes `a""b`, and a name carrying a quote cannot close the
        // identifier and append a second statement.
        const quoted = `"${name.replace(/"/g, '""')}"`;
        const info = await driver.run(`PRAGMA table_info(${quoted})`);
        tables.push({
            name,
            columns: info.rows.map((column) => ({
                name: columnName(column),
                type: columnType(column),
            })),
        });
    }
    return tables;
}
/**
 * Postgres and MySQL share one query, and differ only in the schema filter.
 * `information_schema.columns` is the standard catalog in both, and it holds
 * column definitions — never values.
 */
async function introspectInformationSchema(driver, schemaFilter) {
    const result = await driver.run('SELECT table_name, column_name, data_type FROM information_schema.columns ' +
        `WHERE ${schemaFilter} ORDER BY table_name, ordinal_position`);
    const byTable = new Map();
    for (const row of result.rows) {
        const record = row;
        const table = asString(record.table_name);
        const column = asString(record.column_name);
        if (table === undefined || column === undefined)
            continue;
        const type = asString(record.data_type) ?? 'unknown';
        const existing = byTable.get(table);
        if (existing === undefined)
            byTable.set(table, [{ name: column, type }]);
        else
            existing.push({ name: column, type });
    }
    return [...byTable].map(([name, columns]) => ({ name, columns }));
}
/**
 * Produces the schema. Async, and never synchronous.
 *
 * That is not an accident of the driver interface: `Driver.runSync` exists for
 * `Capability.policyInputFor`, which must resolve before policy decides. A
 * ceiling has to be measured before a handler is willing to run. Introspection
 * is not a capability and is never measured against a ceiling, so it uses the
 * async path and a network driver that cannot do sync work is unaffected.
 */
export async function introspect(driver) {
    const { dialect, serverVersion } = await probeDialect(driver);
    const tables = dialect === 'sqlite'
        ? await introspectSqlite(driver)
        : await introspectInformationSchema(driver, dialect === 'postgres' ? "table_schema = 'public'" : 'table_schema = DATABASE()');
    return {
        version: 1,
        dialect,
        serverVersion,
        // Sorted, because two runs against an unchanged database must produce
        // byte-identical output: this snapshot is hashed and that hash is what
        // proves to the merchant what they approved is what we received.
        tables: [...tables].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    };
}
function asString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function tableName(row) {
    if (row === null || typeof row !== 'object')
        return undefined;
    return asString(row.name);
}
function columnName(row) {
    const record = (row ?? {});
    return asString(record.name) ?? '';
}
function columnType(row) {
    const record = (row ?? {});
    // SQLite's `type` is whatever the author wrote, including empty. Postgres
    // calls it `data_type`; `PRAGMA table_info` calls it `type`. Accepting an
    // empty type is deliberate — a typeless SQLite column is real, and reporting
    // it as `unknown` would misrepresent the merchant's database to them.
    return asString(record.type) ?? asString(record.data_type) ?? '';
}
//# sourceMappingURL=introspect.js.map