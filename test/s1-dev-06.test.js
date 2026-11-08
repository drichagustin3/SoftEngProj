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

const secret = 's1-dev-06-test-secret';
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

test('authentication uses current account state and fails closed on database errors', async () => {
  let account = { user_id: 1, username: 'current_name', role: 'user', status: 'active', is_blocked: false };
  let databaseFailed = false;
  let lookups = 0;
  const auth = load('middleware/authMiddleware.js', {
    '../config/db': { query: async () => {
      lookups++;
      if (databaseFailed) throw new Error('database unavailable');
      return { rows: account ? [account] : [] };
    } },
  });
  async function check(payload) {
    const req = { headers: { authorization: `Bearer ${jwt.sign(payload, secret)}` } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    let passed = false;
    await auth(req, res, () => { passed = true; });
    return { req, res, passed };
  }
  const authorized = await check({ userId: 1, role: 'superadmin', username: 'old_name' });
  assert.equal(authorized.passed, true);
  assert.equal(authorized.req.user.role, 'user');
  assert.equal(authorized.req.user.username, 'current_name');
  for (const status of ['pending', 'blocked', 'disabled', 'disapproved']) {
    account.status = status;
    const result = await check({ userId: 1 });
    assert.equal(result.res.code, 403);
    assert.equal(result.passed, false);
  }
  account.status = 'active';
  account.is_blocked = true;
  assert.equal((await check({ userId: 1 })).res.code, 403);
  account = null;
  assert.equal((await check({ userId: 1 })).res.code, 403);
  databaseFailed = true;
  assert.equal((await check({ userId: 1 })).res.code, 503);
  const before = lookups;
  assert.equal((await check({ userId: '1' })).res.code, 403);
  assert.equal((await check({ userId: 1, exp: 1 })).res.code, 403);
  assert.equal(lookups, before);
});

test('S1-DEV-06 routes, active-account checks and concurrent last-superadmin protection', {
  // Run only in a disposable cluster; these tests create a private schema.
  skip: process.env.S1_DEV_06_DB_TEST !== '1',
}, async t => {
  const schema = `s1_dev_06_${process.pid}`;
  const pool = new Pool({ options: `-c search_path=${schema},public`, max: 10 });
  t.after(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });
  await pool.query(`CREATE SCHEMA ${schema}`);
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../HopeDB_audit.sql.txt'), 'utf8');
  await pool.query(schemaSql.slice(0, schemaSql.indexOf('DROP TABLE IF EXISTS employee')));
  // Exercise the migration against the old constraint as well as the fresh schema.
  await pool.query("ALTER TABLE app_user DROP CONSTRAINT app_user_status_check; ALTER TABLE app_user ADD CONSTRAINT app_user_status_check CHECK (status IN ('pending','active','blocked','disapproved'))");
  await pool.query(fs.readFileSync(path.resolve(__dirname, '../migrations/006_user_disabled_status.sql'), 'utf8'));
  const db = { pool, query: (sql, params) => pool.query(sql, params) };
  const service = load('services/userManagement.js', { '../config/db': db });
  const controller = load('controllers/userController.js', {
    '../config/db': db, '../services/userManagement': service,
  });
  const auth = load('middleware/authMiddleware.js', { '../config/db': db });
  const router = load('routes/userRoutes.js', {
    '../controllers/userController': controller, '../middleware/authMiddleware': auth,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', load('routes/authRoutes.js', {
    '../controllers/authController': load('controllers/authController.js', { '../config/db': db }),
  }));
  app.use('/api/users', router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const token = (id, role = 'superadmin') => jwt.sign({ userId: id, role }, secret);
  async function request(method, url, jwtToken, body) {
    const response = await fetch(url.startsWith('/api/') ? base.replace('/api/users', '') + url : base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function reset(twoSuperadmins = false) {
    await pool.query('TRUNCATE app_user RESTART IDENTITY CASCADE');
    await pool.query(`INSERT INTO app_user (username,email,password_hash,role,status)
      VALUES ('owner','owner@example.invalid','hash','superadmin','active'),
             ('pending','pending@example.invalid','hash','user','pending'),
             ('admin','admin@example.invalid','hash','admin','active'),
             ('regular','regular@example.invalid','hash','user','active')`);
    if (twoSuperadmins) {
      await pool.query("INSERT INTO app_user (username,email,password_hash,role,status) VALUES ('backup','backup@example.invalid','hash','superadmin','active')");
    }
  }

  await t.test('registration, approval, admin designation and real login', async () => {
    await reset();
    const body = { username: 'new_user', email: 'new_user@example.invalid', password: 'test-password-123' };
    const registered = await request('POST', '/api/auth/register', undefined, body);
    assert.equal(registered.status, 201);
    const id = registered.body.user.user_id;
    const credentials = { email: body.email, password: body.password };
    assert.equal((await request('POST', '/api/auth/login', undefined, credentials)).status, 403);
    assert.equal((await request('PATCH', `/${id}/approve`, token(1))).status, 200);
    assert.equal((await request('PATCH', `/${id}/role`, token(1), { role: 'admin' })).status, 200);
    const login = await request('POST', '/api/auth/login', undefined, credentials);
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'admin');
    assert.equal((await request('GET', '/', login.body.token)).status, 200);
    assert.equal((await request('PUT', `/${id}`, token(1), { status: 'disabled' })).status, 200);
    assert.equal((await request('GET', '/', login.body.token)).status, 403);
    assert.equal((await request('POST', '/api/auth/login', undefined, credentials)).status, 403);
    assert.equal((await request('DELETE', `/${id}`, token(1))).status, 200);
  });

  await t.test('approval, designation, permissions and validation', async () => {
    await reset();
    assert.equal((await request('PATCH', '/2/approve')).status, 401);
    assert.equal((await request('PATCH', '/2/approve', token(3))).status, 403, 'stale superadmin claim must not authorize admin');
    assert.equal((await request('PATCH', '/2/approve', token(2))).status, 403, 'pending actor must not authenticate');
    assert.equal((await request('PATCH', '/4/role', token(3), { role: 'admin' })).status, 403);
    assert.equal((await request('PUT', '/2', token(3), { status: 'active' })).status, 403);
    assert.equal((await request('PATCH', '/2/block', token(3))).status, 400, 'admin cannot approve via block/unblock');
    assert.equal((await request('PATCH', '/2/approve', token(1))).status, 200);
    assert.equal((await request('PATCH', '/2/approve', token(1))).status, 400);
    const promoted = await request('PATCH', '/2/role', token(1), { role: 'admin' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.user.role, 'admin');
    assert.equal(promoted.body.user.password_hash, undefined);
    assert.equal((await request('PATCH', '/999/approve', token(1))).status, 404);
    for (const id of ['1junk', '0', '-1', '2147483648']) {
      assert.equal((await request('PATCH', `/${id}/role`, token(1), { role: 'admin' })).status, 400);
    }
    for (const body of [{}, { role: 'root' }, { role: null }, { role: 'admin', is_blocked: false }]) {
      assert.equal((await request('PATCH', '/4/role', token(1), body)).status, 400);
    }
    assert.equal((await request('PUT', '/4', token(1), { username: 123 })).status, 400);
    assert.equal((await request('PUT', '/4', token(1), { status: 'disabled' })).status, 200);
    assert.equal((await request('GET', '/', token(4))).status, 403, 'disabled users must be denied');
    await pool.query("UPDATE app_user SET is_blocked = TRUE WHERE user_id = 3");
    assert.equal((await request('PATCH', '/2/approve', token(3))).status, 403);
  });

  await t.test('every removal/disable path protects the sole active superadmin', async () => {
    await reset();
    // Inactive/blocked superadmins must not count as a replacement.
    await pool.query("UPDATE app_user SET role = 'superadmin' WHERE user_id = 2");
    await pool.query("UPDATE app_user SET role = 'superadmin', is_blocked = TRUE WHERE user_id = 3");
    const attempts = [
      ['PATCH', '/1/block'], ['DELETE', '/1'],
      ['PATCH', '/1/role', { role: 'admin' }],
      ['PUT', '/1', { role: 'user' }],
      ...['blocked', 'disabled', 'pending', 'disapproved'].map(status => ['PUT', '/1', { status }]),
    ];
    for (const [method, url, body] of attempts) {
      const response = await request(method, url, token(1), body);
      assert.equal(response.status, 400);
      assert.equal(response.body.message, 'Cannot remove or disable the last remaining superadmin');
    }
    assert.equal((await request('PUT', '/1', token(1), { username: 'renamed' })).status, 200);
    const row = (await pool.query('SELECT * FROM app_user WHERE user_id = 1')).rows[0];
    assert.equal(row.role, 'superadmin');
    assert.equal(row.status, 'active');
    assert.equal(row.is_blocked, false);
  });

  await t.test('backup superadmin permits changes, and stale/deleted actors lose access', async () => {
    for (const [method, url, body] of [
      ['PATCH', '/5/role', { role: 'admin' }],
      ['PUT', '/5', { status: 'disabled' }],
      ['PATCH', '/5/block'], ['DELETE', '/5'],
    ]) {
      await reset(true);
      assert.equal((await request(method, url, token(1), body)).status, 200);
      assert.equal((await request('PATCH', '/2/approve', token(5))).status, 403);
    }
    await reset(true);
    await service.mutateUser(1, 1, 'role', { role: 'admin' });
    await assert.rejects(service.mutateUser(1, 2, 'approve', {}), { status: 403 });
  });

  await t.test('concurrent cross-demotions, self-demotions and deletions retain an active superadmin', async () => {
    for (const [action, targetSelf] of [['role', false], ['role', true], ['delete', true]]) {
      await reset(true);
      const results = await Promise.allSettled([
        service.mutateUser(1, targetSelf ? 1 : 5, action, { role: 'admin' }),
        service.mutateUser(5, targetSelf ? 5 : 1, action, { role: 'admin' }),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const count = await pool.query("SELECT COUNT(*)::int AS n FROM app_user WHERE role = 'superadmin' AND status = 'active' AND NOT is_blocked");
      assert.equal(count.rows[0].n, 1);
    }
  });
});
