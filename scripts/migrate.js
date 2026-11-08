const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
// Session lock coordinates CLI processes across per-file transactions.
const migrationLock = 73461001;

function migrationSql(source) {
  // Existing 006/007 files have one outer BEGIN/COMMIT pair. Remove only that
  // pair so SQL changes and the history record share the runner's transaction.
  // BEGIN inside dollar-quoted PL/pgSQL functions is left intact.
  const leadingBegin = /^((?:(?:\s+)|(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))*)BEGIN\s*;/i;
  const trailingCommit = /COMMIT\s*;\s*$/i;
  const hasBegin = leadingBegin.test(source);
  const hasCommit = trailingCommit.test(source);
  if (hasBegin !== hasCommit) throw new Error('Use either no transaction wrapper or one outer BEGIN; ... COMMIT; pair.');
  return hasBegin ? source.replace(leadingBegin, '$1').replace(trailingCommit, '') : source;
}

async function readMigrations(directory) {
  const files = (await fs.readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name);
  const versions = new Set();
  const migrations = [];
  for (const name of files.sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]))) {
    if (!/^\d{3,}_[a-z0-9_]+\.sql$/.test(name)) {
      throw new Error(`Invalid migration filename: ${name}. Use NNN_description.sql.`);
    }
    const version = Number(name.split('_')[0]);
    if (!Number.isSafeInteger(version) || versions.has(version)) throw new Error(`Duplicate or invalid migration version: ${name}`);
    versions.add(version);
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    if (!source.trim()) throw new Error(`Migration is empty: ${name}`);
    migrations.push({ name, sql: migrationSql(source), checksum: createHash('sha256').update(source).digest('hex') });
  }
  return migrations;
}

async function runMigrations({ pool, directory = path.join(projectRoot, 'migrations'), status = false, log = console.log }) {
  const migrations = await readMigrations(directory);
  const client = await pool.connect();
  let locked = false;
  let releaseError;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLock]);
    locked = true;
    const exists = (await client.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name;
    const history = exists
      ? (await client.query('SELECT name, checksum FROM public.schema_migrations ORDER BY name')).rows : [];
    const byName = new Map(migrations.map(migration => [migration.name, migration]));
    // Verify the complete history before executing any new SQL.
    for (const entry of history) {
      const migration = byName.get(entry.name);
      if (!migration) throw new Error(`Applied migration is missing from disk: ${entry.name}`);
      if (migration.checksum !== entry.checksum) throw new Error(`Applied migration was changed: ${entry.name}. Restore it and add a new migration.`);
    }
    const applied = new Set(history.map(entry => entry.name));
    if (status) {
      log('Migration status (history records, not automatic schema detection):');
      for (const migration of migrations) log(`${applied.has(migration.name) ? 'applied' : 'pending'}  ${migration.name}`);
      if (!migrations.length) log('No SQL migrations found.');
      return;
    }
    let count = 0;
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
          name TEXT PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
        await client.query(migration.sql);
        await client.query('INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum]);
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { releaseError = rollbackError; }
        throw new Error(`${migration.name} failed: ${err.message}`, { cause: err });
      }
      log(`Applied ${migration.name}`);
      count++;
    }
    log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
  } finally {
    if (locked && !releaseError) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [migrationLock]); }
      catch (err) { releaseError = err; }
    }
    client.release(releaseError);
  }
}

async function main() {
  require('dotenv').config({ path: path.join(projectRoot, '.env'), quiet: true });
  let status = false;
  let directory = path.join(projectRoot, 'migrations');
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--status') status = true;
    else if (args[index] === '--dir' && args[index + 1]) directory = path.resolve(args[++index]);
    else throw new Error('Usage: node scripts/migrate.js [--status] [--dir directory]');
  }
  const { Pool } = require('pg');
  const { getDatabaseOptions } = require('../config/database');
  const pool = new Pool(getDatabaseOptions());
  pool.on('error', err => console.error('Database connection error:', err.message));
  try { await runMigrations({ pool, directory, status }); }
  finally { await pool.end(); }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration error:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations, readMigrations, migrationSql };
