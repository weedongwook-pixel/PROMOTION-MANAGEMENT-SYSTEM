const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class FakeDB {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const db = this;
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        const row = db.rows.get(args[0]);
        if (!row) return null;
        return sql.includes('SELECT v,updated_at') ? { ...row } : { updated_at: row.updated_at };
      },
      async all() {
        return { results: [...db.rows].map(([k, row]) => ({ k, ...row })) };
      },
      async run() {
        if (sql.startsWith('INSERT')) {
          if (db.rows.has(args[0])) return { meta: { changes: 0 } };
          db.rows.set(args[0], { v: args[1], updated_at: args[2] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE')) {
          const row = db.rows.get(args[0]);
          if (!row || row.updated_at !== args[3]) return { meta: { changes: 0 } };
          db.rows.set(args[0], { v: args[1], updated_at: Math.max(args[2], row.updated_at + 1) });
          return { meta: { changes: 2 } };
        }
        if (sql.startsWith('DELETE')) {
          const row = db.rows.get(args[0]);
          if (!row || row.updated_at !== args[1]) return { meta: { changes: 0 } };
          db.rows.delete(args[0]);
          return { meta: { changes: 2 } };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
  }
}

(async () => {
  const source = require('./helpers/sync-worker-source.cjs')();
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
  const env = { DB: new FakeDB(), SYNC_TOKEN: 'test-token' };
  const call = async (method, route, body, authenticated = true) => {
    const request = new Request(`https://example.com${route}`, {
      method,
      headers: authenticated ? { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' } : {},
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await call('GET', '/promo/meta', undefined, false)).status, 401);
  assert.equal((await call('POST', '/promo/store', { 'promo::c::A': 'old' })).status, 428);
  assert.equal((await call('PUT', '/promo/store/promo%3A%3Ac%3A%3AA', 'old')).status, 428);
  const first = await call('PUT', '/promo/store/promo%3A%3Ac%3A%3AA', { value: 'new', expectedUpdatedAt: null });
  assert.equal(first.status, 200);
  assert.equal((await call('PUT', '/promo/store/promo%3A%3Ac%3A%3AA', { value: 'stale', expectedUpdatedAt: null })).status, 409);
  const second = await call('PUT', '/promo/store/promo%3A%3Ac%3A%3AA', { value: 'newer', expectedUpdatedAt: first.body.updated_at });
  assert.equal(second.status, 200);
  assert.ok(second.body.updated_at > first.body.updated_at);
  assert.equal((await call('PUT', '/promo/store/promo%3A%3Ac%3A%3AA', { value: 'stale', expectedUpdatedAt: first.body.updated_at })).status, 409);
  assert.equal((await call('DELETE', '/promo/store/promo%3A%3Ac%3A%3AA', { expectedUpdatedAt: first.body.updated_at })).status, 409);
  assert.equal((await call('GET', '/promo/store/promo%3A%3Ac%3A%3AA')).body.value, 'newer');
  assert.equal((await call('DELETE', '/promo/store/promo%3A%3Ac%3A%3AA', { expectedUpdatedAt: second.body.updated_at })).status, 200);
  assert.equal((await call('GET', '/promo/store/promo%3A%3Ac%3A%3AA')).status, 404);
  console.log('Sync Worker version guard: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
