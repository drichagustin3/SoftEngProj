const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');

const secret = 'isolated-cleanup-test-secret';
function load(file, mocks) {
  const localRequire = createRequire(path.resolve(__dirname, '..', file));
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const execute = vm.runInThisContext(
    `(function(module, exports, require, process, console) {\n${source}\n})`,
    { filename: file },
  );
  execute(module, module.exports,
    name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
    { env: { JWT_SECRET: secret } }, { log() {}, error() {} });
  return module.exports;
}

test('employee access, audit identity, and database failure responses', async t => {
  const queries = [];
  const releases = [];
  let failure;
  let currentAccountRole;
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (failure === 'rollback' && (sql.startsWith('UPDATE') || sql === 'ROLLBACK')) {
        throw new Error('simulated connection loss');
      }
      return { rows: [{ empno: '00001' }], rowCount: 1 };
    },
    release(error) { releases.push(error); },
  };
  const pool = {
    query: client.query,
    async connect() {
      if (failure === 'connect') throw new Error('simulated pool failure');
      return client;
    },
  };
  const app = express();
  // Capture startup while exercising the real Express request pipeline.
  app.listen = () => {};
  const createApp = () => app;
  createApp.json = express.json;
  load('server.js', {
    express: createApp,
    dotenv: { config() {} },
    './config/db': { pool },
    './routes/authRoutes': express.Router(),
    './routes/userRoutes': express.Router(),
    './middleware/authMiddleware': load('middleware/authMiddleware.js', {
      '../config/db': {
        query: async () => ({ rows: [{ user_id: 1, username: 'actual_actor',
          role: currentAccountRole, status: 'active', is_blocked: false }] }),
      },
    }),
    './middleware/roleMiddleware': require('../middleware/roleMiddleware'),
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, url, role) {
    currentAccountRole = role;
    const headers = role ? {
      Authorization: `Bearer ${jwt.sign({ userId: 1, username: 'actual_actor', role }, secret)}`,
    } : {};
    const response = await fetch(base + url, { method, headers });
    return { status: response.status, body: await response.json() };
  }

  const endpoints = [
    ['GET', '/api/employees'],
    ['DELETE', '/api/employees/00001'],
    ['POST', '/api/employees/00001/restore'],
  ];
  for (const [method, url] of endpoints) {
    assert.equal((await request(method, url)).status, 401);
    assert.equal((await request(method, url, 'unknown')).status, 403);
  }
  for (const [method, url] of endpoints.slice(1)) {
    assert.equal((await request(method, url, 'user')).status, 403);
  }
  assert.equal(queries.length, 0, 'denied requests must not touch the database');
  assert.equal((await request('GET', '/api/users/me', 'user')).status, 200);
  assert.equal((await request('GET', '/api/employees?status=all', 'user')).status, 200);
  assert.equal(queries.at(-1).sql, 'SELECT * FROM employee_active');
  assert.equal((await request('GET', '/api/employees?status=inactive', 'admin')).status, 200);
  assert.equal(queries.at(-1).sql, 'SELECT * FROM employee WHERE is_deleted');
  for (const role of ['admin', 'superadmin']) {
    for (const [method, url] of endpoints.slice(1)) {
      queries.length = 0;
      assert.equal((await request(method, url, role)).status, 200);
      assert.equal(queries[0].sql, 'BEGIN');
      assert.equal(queries[1].sql, "SELECT set_config('app.username', $1, true)");
      assert.equal(queries[1].params[0], 'actual_actor');
      assert.equal(queries.at(-1).sql, 'COMMIT');
    }
  }
  assert.equal(releases.length, 4);
  for (failure of ['connect', 'rollback']) {
    for (const [method, url] of endpoints.slice(1)) {
      const response = await request(method, url, 'admin');
      assert.equal(response.status, 500);
      assert.match(response.body.error, /^Unable to /);
    }
  }
  assert.equal(releases.length, 6);
  assert.equal(releases.at(-1).message, 'simulated connection loss');
});

test('idle PostgreSQL pool errors are handled', () => {
  class FakePool extends EventEmitter {
    query(sql, callback) { callback(null, { rows: [] }); }
  }
  const { pool } = load('config/db.js', {
    pg: { Pool: FakePool }, dotenv: { config() {} },
  });
  assert.equal(pool.listenerCount('error'), 1);
  assert.doesNotThrow(() => pool.emit('error', new Error('idle connection lost')));
});
