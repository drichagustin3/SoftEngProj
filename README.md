# SoftEngProj

Group 6 - 3 BSCS 1

Scrum Master: Aldrich Rodolf Agustin

UI/UX Developer: Ricky Joe Sanglay

BackEnd Developer

## Student database setup — S1-DBA-01

This project runs Node.js/Express and PostgreSQL directly on your computer or
GitHub Codespace. **Docker is not required.** Tested with Node.js 24 and PostgreSQL
16. Personal verification guides in `docs/` are local-only; this README is the
shared setup reference.

### 1. Install prerequisites

You need Node.js/npm, PostgreSQL server, and the `psql` client. Check:

```bash
node --version
npm --version
psql --version
```

In an Ubuntu 24.04 Codespace, install/start native PostgreSQL if needed:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-16 postgresql-client-16
sudo service postgresql start
pg_isready -h 127.0.0.1 -p 5432
```

If it is already installed and accepting connections, skip installation/startup.
Installing or managing the system service requires sudo permission; the
application itself does not. Avoid starting a second cluster on the same port.

For Windows/macOS, use a native PostgreSQL installation and ensure its service is
running. Run the remaining npm commands from the repository root in your VS Code
terminal. Node/PostgreSQL installation and the OS administrator password are
separate from application login credentials.

### 2. Install application dependencies

```bash
npm ci
```

`npm ci` installs the dependency versions recorded in `package-lock.json`.

### 3. Create the database on a new installation only

If you already have a working `hopedb`, skip this step and retain your existing
database role/password. Do not recreate or reset it.

For a fresh Ubuntu/Codespaces installation:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -f config/postgres/setup.sql
sudo -u postgres psql -c '\password hope_app'
```

The second command prompts for the new database password twice. Nothing appears
while you type or paste; press Enter after each entry. Remember this password for
`DB_PASSWORD` below. It is not your admin user's application login password.

On Windows/macOS, use `psql` as your PostgreSQL administrator instead:

```bash
psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -f config/postgres/setup.sql
psql -h 127.0.0.1 -U postgres -d postgres -c '\password hope_app'
```

`config/postgres/setup.sql` creates a login role named `hope_app` and a database
named `hopedb` owned by that role. The role has no superuser, database-creation, or
role-management privileges. The setup SQL intentionally stops if the role or
database already exists; it never drops existing data.

### 4. Configure the environment

If you do **not** already have `.env`, copy `.env.example` to `.env`. Keep an
existing `.env`; do not overwrite its credentials. For a new Bash setup:

```bash
if [ ! -f .env ]; then cp .env.example .env; fi
```

Edit `.env` in VS Code:

| Variable | Example | Meaning |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL TCP port |
| `DB_NAME` | `hopedb` | Project database |
| `DB_USER` | `hope_app` | Database login role (or your existing role) |
| `DB_PASSWORD` | your chosen password | Password for that database role |
| `PORT` | `3000` | Express HTTP port |
| `JWT_SECRET` | generated value | Secret used for application JWTs |
| `JWT_EXPIRES_IN` | `1d` | JWT expiration |
| `NODE_ENV` | `development` | Local development mode |

Generate a JWT secret, then paste the result into `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Replace the template placeholders. Quote `.env` values containing `#`, for
example `DB_PASSWORD="my#password"`. `.env` is ignored by Git; `.env.example` is
the shared template and contains no real credentials. Express and the database
CLI share `config/database.js`. The CLI loads `.env` from the repository root;
already-set environment variables take precedence.

### 5. Check the connection and inspect migrations

```bash
npm run db:check
npm run db:status
```

`db:check` verifies connectivity and prints the database name, database login,
and PostgreSQL version. It does not print passwords or modify data. `db:status`
lists migration history without creating tables or applying migrations.

**Fresh-database boundary:** S1-DBA-01 provides the database connection and
migration infrastructure. Base/sample-data migrations belong to S1-DBA-02;
catalogue/permission migrations belong to S1-DBA-03. The current `006` and `007`
migrations expect `app_user` to exist, so do not run them on a completely empty
database until the prerequisite schema migrations are supplied. The database
connection and `/api/health` can be checked before application tables exist.

On an **existing project database** that already has `app_user`, apply pending
migrations with:

```bash
npm run db:migrate
npm run db:status
```

Files previously run manually appear pending until recorded by this runner.
The current `006` and `007` files can be rerun against their existing tables;
the first successful runner execution records them. For other future migrations,
check their installation state before treating a manually-run file as pending.

### 6. Start Express

```bash
npm run dev
```

Keep that terminal open. In another terminal:

```bash
curl -i http://localhost:3000/api/health
```

Expected: HTTP 200 with `"status":"OK"` and a PostgreSQL timestamp. Use the port
from `PORT` if it differs from 3000. Application approval/rights endpoints also
need their schema and an existing active admin/superadmin account; this setup
does not create an application administrator or a shared login password.

## Migration runner conventions

- Store reviewed SQL files in `migrations/` using unique numeric prefixes:
  `NNN_description.sql`. Files execute in numeric order.
- `npm run db:migrate` applies pending files. `npm run db:status` reports status.
- Successful executions are recorded in `public.schema_migrations` with filename,
  SHA-256 checksum, and timestamp. Recorded files are skipped on later runs.
- Changed or missing recorded files stop the runner before new SQL is executed.
  Do not edit an applied migration; create a new file for a new change.
- Each file and its history record execute in one transaction on one connection.
  A failed file rolls back and the command exits nonzero. Earlier successful
  files remain applied; after correcting an unapplied failed file, rerun.
- A PostgreSQL advisory lock serializes concurrent runners for the same database.
- The runner owns transaction boundaries. Files may omit transaction markers or
  retain the single outer `BEGIN; ... COMMIT;` pair used by `006`/`007`; that pair
  is removed in memory. Do not add inner transaction-control statements. Functions
  and `DO` blocks can retain their normal PL/pgSQL `BEGIN`/`END` bodies.
- Migrations must work inside a transaction; database creation and commands such
  as `CREATE INDEX CONCURRENTLY` do not belong in this runner.
- There is no automatic down/reset command. Do not delete migration history or
  rerun `HopeDB_audit.sql.txt` as a workaround: the sample script drops business
  tables and history. Data/schema changes belong in reviewed migrations.
- Optional tooling flag: `node scripts/migrate.js --status --dir /path/to/sql`.
  Normal team usage should keep the default `migrations/` directory.

Transaction and locking references: [node-postgres transactions](https://node-postgres.com/features/transactions)
and [PostgreSQL 16 advisory locks](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

## Verification and troubleshooting

```bash
npm test
```

On Ubuntu with `pg_virtualenv` installed, run the full integration suite against
a disposable PostgreSQL cluster:

```bash
pg_virtualenv -t env S1_DBA_01_DB_TEST=1 S1_DEV_06_DB_TEST=1 S1_DEV_07_DB_TEST=1 npm test
```

Without those flags, database integration suites are skipped. The disposable
tests do not change your existing `hopedb`. Runner tests cover ordering, repeat
runs, changed/missing files, rollback, concurrent execution, existing migration
compatibility, and CLI connection failures.

| Symptom | Check |
| --- | --- |
| Connection refused / `ECONNREFUSED` | Start PostgreSQL; check host/port with `pg_isready`. |
| Password authentication failed | Check the PostgreSQL role/password in `.env`, not the application login. |
| Database or role does not exist | Verify `.env` matches the installed cluster; use setup SQL only for a new installation. |
| `app_user` does not exist during migration | The fresh database needs its prerequisite schema migrations; see the DBA-02/03 boundary above. |
| Applied migration was changed | Restore the recorded file and put the new change in a new migration. |
| API health 500 | Check Express logs and run `npm run db:check`. |
| Port 3000 already in use | Reuse/stop your existing Express process or choose a different `PORT`. |
