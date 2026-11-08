const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { validateRightsChange } = require('../middleware/rightsValidation');

const secret = 's1-dev-07-test-secret';
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const execute = vm.runInThisContext(
    `(function(module, exports, require, process, console) {\n${fs.readFileSync(filename, 'utf8')}\n})`,
    { filename },
  );
  execute(module, module.exports,
    name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
    { env: { JWT_SECRET: secret } }, { log() {}, error() {} });
  return module.exports;
}

test('rights validation normalizes All/None and rejects ambiguous or invalid grants', () => {
  function check(body) {
    const req = { body };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    let passed = false;
    validateRightsChange(req, res, () => { passed = true; });
    return { req, res, passed };
  }
  const all = check({ selection: 'all' });
  assert.equal(all.passed, true);
  assert.equal(all.req.rightsChanges.length, 5);
  assert.deepEqual(all.req.rightsChanges.at(-1).actions, ['view']);
  const none = check({ modules: [{ module: 'customer', selection: 'none' }] });
  assert.deepEqual(none.req.rightsChanges, [{ module: 'customer', enabled: false, actions: [] }]);
  const invalid = [
    null, [], {}, { modules: [] }, { selection: 'ALL' }, { selection: 'all', modules: [] },
    { modules: [{ module: 'unknown', enabled: true }] },
    { modules: [{ module: 'customer', enabled: 'true' }] },
    { modules: [{ module: 'customer', enabled: true, actions: null }] },
    { modules: [{ module: 'customer', enabled: true, actions: { view: 1 } }] },
    { modules: [{ module: 'customer', enabled: false, actions: { view: true } }] },
    { modules: [{ module: 'reports', enabled: true, actions: { delete: true } }] },
    { modules: [{ module: 'customer', selection: 'all', enabled: true }] },
    { modules: [{ module: 'customer', enabled: true }, { module: 'customer', enabled: false }] },
  ];
  for (const body of invalid) {
    const result = check(body);
    assert.equal(result.passed, false, JSON.stringify(body));
    assert.equal(result.res.code, 400);
  }
});

test('S1-DEV-07 rights assignment and database audit integration', {
  skip: process.env.S1_DEV_07_DB_TEST !== '1',
}, async t => {
  const schema = `s1_dev_07_${process.pid}`;
  const pool = new Pool({ options: `-c search_path=${schema},public`, max: 10 });
  t.after(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });
  await pool.query(`CREATE SCHEMA ${schema}`);
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../HopeDB_audit.sql.txt'), 'utf8');
  await pool.query(schemaSql.slice(0, schemaSql.indexOf('DROP TABLE IF EXISTS employee')));
  const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/007_user_module_rights.sql'), 'utf8');
  await pool.query(migration);
  const db = { pool, query: (sql, params) => pool.query(sql, params) };
  const service = load('services/rightsManagement.js', { '../config/db': db });
  const controller = load('controllers/rightsController.js', { '../services/rightsManagement': service });
  const auth = load('middleware/authMiddleware.js', { '../config/db': db });
  const rightsRouter = load('routes/rightsRoutes.js', {
    '../middleware/authMiddleware': auth, '../controllers/rightsController': controller,
  });
  const existingHandlers = Object.fromEntries(
    ['getUsers', 'createUser', 'updateUser', 'toggleBlockUser', 'approveUser', 'updateUserRole', 'deleteUser']
      .map(name => [name, (req, res) => res.sendStatus(204)])
  );
  const router = load('routes/userRoutes.js', {
    './rightsRoutes': rightsRouter, '../middleware/authMiddleware': auth,
    '../controllers/userController': existingHandlers,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const token = id => jwt.sign({ userId: id, role: 'superadmin' }, secret);
  async function request(method, url, actorId, body) {
    const response = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(actorId ? { Authorization: `Bearer ${token(actorId)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function reset() {
    await pool.query('DELETE FROM app_user; ALTER SEQUENCE app_user_user_id_seq RESTART WITH 1');
    await pool.query(`INSERT INTO app_user (username,email,password_hash,role,status)
      VALUES ('owner','owner@example.invalid','hash','superadmin','active'),
             ('manager','manager@example.invalid','hash','admin','active'),
             ('regular','regular@example.invalid','hash','user','active'),
             ('pending','pending@example.invalid','hash','user','pending')`);
  }
  const logs = async () => (await pool.query("SELECT * FROM audit_log WHERE table_name = 'user_module_rights' ORDER BY audit_id")).rows;
  const customer = actions => ({ modules: [{ module: 'customer', enabled: true, actions }] });

  await t.test('catalog, default-deny state and current-role authorization', async () => {
    await reset();
    assert.equal((await request('GET', '/3/rights')).status, 401);
    assert.equal((await request('GET', '/rights/modules', 3)).status, 403);
    assert.equal((await request('GET', '/3/rights', 3)).status, 403);
    assert.equal((await request('PATCH', '/3/rights', 3, { selection: 'all' })).status, 403);
    assert.equal((await request('PATCH', '/3/rights', 4, { selection: 'all' })).status, 403);
    const catalog = await request('GET', '/rights/modules', 2);
    assert.equal(catalog.status, 200);
    assert.deepEqual(catalog.body.modules.map(entry => entry.label), ['Customer', 'Product', 'Human Resources', 'Sales', 'Reports']);
    const initial = await request('GET', '/3/rights', 2);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.modules.length, 5);
    assert.ok(initial.body.modules.every(entry => !entry.enabled && entry.none && !entry.all));
    assert.equal((await request('GET', '/1/rights', 2)).status, 403);
    assert.equal((await request('PATCH', '/1/rights', 2, { selection: 'all' })).status, 403);
    assert.equal((await request('GET', '/999/rights', 1)).status, 404);
    for (const id of ['0', '1junk', '-1', '2147483648']) {
      assert.equal((await request('GET', `/${id}/rights`, 1)).status, 400);
    }
    await pool.query("UPDATE app_user SET is_blocked = TRUE WHERE user_id = 2");
    assert.equal((await request('PATCH', '/3/rights', 2, { selection: 'all' })).status, 403);
    await assert.rejects(service.saveRights(2, 3, []), { status: 403 });
  });

  await t.test('selected actions, module checkbox and no-op saves audit only actual changes', async () => {
    await reset();
    const before = (await logs()).length;
    const saved = await request('PATCH', '/3/rights', 2, customer({ view: true, edit: true }));
    assert.equal(saved.status, 200);
    assert.equal(saved.body.changed, 1);
    const entry = saved.body.modules[0];
    assert.equal(entry.enabled, true);
    assert.deepEqual(entry.actions, { view: true, add: false, edit: true, delete: false, restore: false });
    const log = (await logs()).at(-1);
    assert.equal(log.action, 'ADD');
    assert.equal(log.action_by, 'manager');
    assert.equal(log.record_key, '3|customer');
    assert.equal(log.old_values, null);
    assert.deepEqual(log.new_values.actions, ['view', 'edit']);
    assert.ok(log.action_at);
    const noOp = await request('PATCH', '/3/rights', 2, customer({ view: true, edit: true }));
    assert.equal(noOp.body.changed, 0);
    assert.equal((await logs()).length, before + 1);
    const disabled = await request('PATCH', '/3/rights', 1, { modules: [{ module: 'customer', enabled: false }] });
    assert.equal(disabled.body.modules[0].enabled, false);
    const edited = (await logs()).at(-1);
    assert.equal(edited.action, 'EDIT');
    assert.equal(edited.action_by, 'owner');
    assert.deepEqual(edited.old_values.actions, ['view', 'edit']);
    assert.deepEqual(edited.new_values.actions, []);
  });

  await t.test('global and per-module All/None respect Reports actions and preserve other modules', async () => {
    await reset();
    const before = (await logs()).length;
    const all = await request('PATCH', '/3/rights', 1, { selection: 'all' });
    assert.equal(all.status, 200);
    assert.equal(all.body.changed, 5);
    assert.ok(all.body.modules.every(entry => entry.enabled && entry.all));
    assert.deepEqual(all.body.modules.at(-1).actions, { view: true });
    assert.equal((await logs()).length, before + 5);
    const partial = await request('PATCH', '/3/rights', 1, { modules: [{ module: 'sales', selection: 'none' }] });
    assert.equal(partial.body.changed, 1);
    assert.equal(partial.body.modules.find(entry => entry.module === 'sales').enabled, false);
    assert.equal(partial.body.modules.find(entry => entry.module === 'customer').all, true);
    const none = await request('PATCH', '/3/rights', 1, { selection: 'none' });
    assert.equal(none.body.changed, 4);
    assert.ok(none.body.modules.every(entry => !entry.enabled && entry.none));
    await pool.query(migration);
    assert.equal((await logs()).length, before + 10, 'migration rerun must preserve audit history');
  });

  await t.test('validation never mutates rights or writes audit rows', async () => {
    await reset();
    const before = (await logs()).length;
    for (const body of [
      {}, { selection: 'all', modules: [] },
      { modules: [{ module: 'reports', enabled: true, actions: { add: true } }] },
      { modules: [{ module: 'customer', enabled: false, actions: { view: true } }] },
    ]) assert.equal((await request('PATCH', '/3/rights', 1, body)).status, 400);
    assert.equal((await logs()).length, before);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_module_rights')).rows[0].n, 0);
  });

  await t.test('audit failure rolls back the entire multi-module save', async () => {
    await reset();
    const before = (await logs()).length;
    await pool.query(`CREATE FUNCTION reject_sales_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN IF NEW.record_key = '3|sales' THEN RAISE EXCEPTION 'simulated audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_sales_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_sales_audit()`);
    try {
      assert.equal((await request('PATCH', '/3/rights', 1, { selection: 'all' })).status, 500);
      assert.equal((await logs()).length, before);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_module_rights')).rows[0].n, 0);
    } finally {
      await pool.query('DROP TRIGGER reject_sales_audit ON audit_log; DROP FUNCTION reject_sales_audit()');
    }
  });

  await t.test('concurrent saves audit the committed predecessor, not a stale snapshot', async () => {
    await reset();
    const before = (await logs()).length;
    const results = await Promise.all([
      request('PATCH', '/3/rights', 1, customer({ view: true })),
      request('PATCH', '/3/rights', 2, customer({ edit: true })),
    ]);
    assert.ok(results.every(result => result.status === 200));
    const entries = (await logs()).slice(before);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[1].old_values, entries[0].new_values);
    const current = (await pool.query('SELECT * FROM user_module_rights WHERE user_id=3')).rows[0];
    assert.deepEqual(current, entries[1].new_values);
  });

  await t.test('cascading rights removals are audited with the deleting superadmin identity', async () => {
    await reset();
    await request('PATCH', '/3/rights', 2, customer({ view: true }));
    const users = load('services/userManagement.js', { '../config/db': db });
    await users.mutateUser(1, 3, 'delete', {});
    const deletion = (await logs()).at(-1);
    assert.equal(deletion.action, 'DELETE');
    assert.equal(deletion.action_by, 'owner');
    assert.equal(deletion.new_values, null);
    assert.deepEqual(deletion.old_values.actions, ['view']);
    await assert.rejects(pool.query("UPDATE audit_log SET action_by='tampered'"), /append-only/);
    await assert.rejects(pool.query('DELETE FROM audit_log'), /append-only/);
    await assert.rejects(pool.query('TRUNCATE audit_log'), /append-only/);
  });
});
