const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const { getDatabaseOptions } = require('../config/database');
const { readMigrations, runMigrations } = require('../scripts/migrate');

const execute = promisify(execFile);
const projectRoot = path.resolve(__dirname, '..');
async function fixture(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hopedb-migrations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [name, sql] of Object.entries(files)) await fs.writeFile(path.join(directory, name), sql);
  return directory;
}

test('database configuration validates ports without requiring a running database', () => {
  assert.equal(getDatabaseOptions({}).database, 'hopedb');
  assert.equal(getDatabaseOptions({ DB_PORT: '5433', DB_USER: 'student' }).port, 5433);
  for (const port of ['abc', '5432oops', '-1', '0', '65536', '1.2']) {
    assert.throws(() => getDatabaseOptions({ DB_PORT: port }), /DB_PORT/);
  }
});

test('migration discovery rejects invalid names, duplicate versions and empty files', async t => {
  for (const files of [
    { 'bad_name.sql': 'SELECT 1;' },
    { '001_first.sql': 'SELECT 1;', '001_duplicate.sql': 'SELECT 2;' },
    { '001_empty.sql': '' },
    { '001_unbalanced.sql': 'BEGIN; SELECT 1;' },
  ]) {
    const directory = await fixture(t, files);
    await assert.rejects(readMigrations(directory));
  }
});

test('S1-DBA-01 migration runner PostgreSQL integration', {
  skip: process.env.S1_DBA_01_DB_TEST !== '1',
}, async t => {
  const database = `dba01_${process.pid}`;
  const admin = new Pool();
  await admin.query(`CREATE DATABASE ${database}`);
  const pool = new Pool({ database, max: 4 });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  });
  const reset = () => pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const quiet = () => {};

  await t.test('status does not create history tables; empty database connection check works', async t => {
    const directory = await fixture(t, { '001_example.sql': 'SELECT 1;' });
    const output = [];
    await runMigrations({ pool, directory, status: true, log: message => output.push(message) });
    assert.ok(output.some(line => line === 'pending  001_example.sql'));
    const exists = await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
    assert.equal(exists.rows[0].name, null);
    const result = await execute(process.execPath, ['scripts/check-db.js'], {
      cwd: projectRoot,
      env: { ...process.env, DB_HOST: process.env.PGHOST, DB_PORT: process.env.PGPORT,
        DB_USER: process.env.PGUSER, DB_PASSWORD: process.env.PGPASSWORD || '', DB_NAME: database },
    });
    assert.match(result.stdout, /PostgreSQL connection successful/);
    assert.ok(result.stdout.includes(database));
  });

  await t.test('numeric order, legacy wrappers, function bodies and repeat runs', async t => {
    const directory = await fixture(t, {
      '010_second.sql': "INSERT INTO migration_probe VALUES (10);",
      '002_first.sql': `-- Legacy transaction wrapper
        BEGIN;
        CREATE TABLE migration_probe (n INTEGER);
        DO $$ BEGIN INSERT INTO migration_probe VALUES (2); END; $$;
        COMMIT;`,
    });
    await runMigrations({ pool, directory, log: quiet });
    await runMigrations({ pool, directory, log: quiet });
    const rows = await pool.query('SELECT n FROM migration_probe ORDER BY n');
    assert.deepEqual(rows.rows, [{ n: 2 }, { n: 10 }]);
    const history = await pool.query('SELECT count(*)::int AS n FROM public.schema_migrations');
    assert.equal(history.rows[0].n, 2);
    const output = [];
    await runMigrations({ pool, directory, status: true, log: message => output.push(message) });
    assert.ok(output.includes('applied  002_first.sql'));
  });

  await t.test('changed and missing applied migrations stop before new SQL is executed', async t => {
    await reset();
    const directory = await fixture(t, { '001_probe.sql': 'CREATE TABLE checksum_probe (n INTEGER);' });
    await runMigrations({ pool, directory, log: quiet });
    await fs.writeFile(path.join(directory, '002_new.sql'), 'CREATE TABLE must_not_run (n INTEGER);');
    await fs.appendFile(path.join(directory, '001_probe.sql'), '\n-- changed after applying');
    await assert.rejects(runMigrations({ pool, directory, log: quiet }), /was changed/);
    assert.equal((await pool.query("SELECT to_regclass('must_not_run') AS name")).rows[0].name, null);
    await fs.unlink(path.join(directory, '001_probe.sql'));
    await assert.rejects(runMigrations({ pool, directory, log: quiet }), /missing from disk/);
  });

  await t.test('failed wrapped SQL rolls back schema, data and history; corrected SQL can be retried', async t => {
    await reset();
    const directory = await fixture(t, {
      '001_fail.sql': 'BEGIN; CREATE TABLE rollback_probe (n INTEGER); INSERT INTO missing_table VALUES (1); COMMIT;',
    });
    await assert.rejects(runMigrations({ pool, directory, log: quiet }), /001_fail.sql failed/);
    const result = await pool.query("SELECT to_regclass('rollback_probe') AS probe, to_regclass('public.schema_migrations') AS history");
    assert.deepEqual(result.rows[0], { probe: null, history: null });
    await fs.writeFile(path.join(directory, '001_fail.sql'), 'CREATE TABLE rollback_probe (n INTEGER);');
    await runMigrations({ pool, directory, log: quiet });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.schema_migrations')).rows[0].n, 1);
  });

  await t.test('concurrent runners execute each migration once', async t => {
    await reset();
    const directory = await fixture(t, {
      '001_once.sql': 'CREATE TABLE once_probe (n INTEGER); SELECT pg_sleep(0.15); INSERT INTO once_probe VALUES (1);',
    });
    await Promise.all([
      runMigrations({ pool, directory, log: quiet }),
      runMigrations({ pool, directory, log: quiet }),
    ]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM once_probe')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.schema_migrations')).rows[0].n, 1);
  });

  await t.test('existing 006 and 007 migrations run through the CLI without changing their files', async t => {
    await reset();
    const source = await fs.readFile(path.join(projectRoot, 'HopeDB_audit.sql.txt'), 'utf8');
    const directory = await fixture(t, {
      '001_auth_fixture.sql': source.slice(0, source.indexOf('DROP TABLE IF EXISTS employee')),
      '006_user_disabled_status.sql': await fs.readFile(path.join(projectRoot, 'migrations/006_user_disabled_status.sql'), 'utf8'),
      '007_user_module_rights.sql': await fs.readFile(path.join(projectRoot, 'migrations/007_user_module_rights.sql'), 'utf8'),
    });
    const env = { ...process.env, DB_HOST: process.env.PGHOST, DB_PORT: process.env.PGPORT,
      DB_USER: process.env.PGUSER, DB_PASSWORD: process.env.PGPASSWORD || '', DB_NAME: database };
    const applied = await execute(process.execPath, ['scripts/migrate.js', '--dir', directory], { cwd: projectRoot, env });
    assert.match(applied.stdout, /Applied 3 migration/);
    const again = await execute(process.execPath, ['scripts/migrate.js', '--dir', directory], { cwd: projectRoot, env });
    assert.match(again.stdout, /Database is up to date/);
    assert.equal((await pool.query("SELECT to_regclass('user_module_rights') AS name")).rows[0].name, 'user_module_rights');
    await pool.query("INSERT INTO app_user (username,email,password_hash,status) VALUES ('fixture','fixture@example.invalid','hash','disabled')");
    await assert.rejects(execute(process.execPath, ['scripts/check-db.js'], {
      cwd: projectRoot, env: { ...env, DB_NAME: `missing_${process.pid}` },
    }), err => err.code === 1 && /Database check failed/.test(err.stderr));
  });
});
