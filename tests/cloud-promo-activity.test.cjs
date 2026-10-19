const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('audit events use immutable per-event Cloud keys and can be read back by date', async () => {
  const keys = { 'promo::meta': '{}' }, meta = { 'promo::meta': 1 };
  let version = 1, posts = 0, activityReads = 0;
  const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
  const fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname, method = options.method || 'GET';
    if (pathname === '/promo/meta') return reply({ ok: true, meta: { ...meta } });
    if (pathname.startsWith('/promo/store/')) {
      const key = decodeURIComponent(pathname.slice('/promo/store/'.length));
      if (method === 'GET') {
        if (key.startsWith('promo::activity::')) activityReads++;
        return key in keys ? reply({ ok: true, value: keys[key], updated_at: meta[key] }) : reply({}, 404);
      }
      if (method === 'PUT') {
        const body = JSON.parse(options.body), expected = key in meta ? meta[key] : null;
        if (body.expectedUpdatedAt !== expected) return reply({}, 409);
        keys[key] = body.value; meta[key] = version++; posts++;
        return reply({ ok: true, updated_at: meta[key] });
      }
    }
    throw new Error(`Unexpected ${method} ${pathname}`);
  };
  const data = new Map();
  const localStorage = {
    getItem: key => data.get(key) ?? null, setItem: (key, val) => data.set(key, String(val)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
  const sandbox = { localStorage, fetch, URL, Date, Math, navigator: { onLine: true },
    console: { log() {}, warn() {}, error() {} }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    document: { readyState: 'loading', hidden: false, addEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cloud-store.js'), 'utf8'), sandbox);
  await sandbox.PC_CLOUD.pull();
  const first = { id: 'ACT-1', date: '2026-10-02', at: '2026-10-02T08:00:00Z', campaign: 'Goodie', kind: 'ADDED', user: 'Bow' };
  const second = { id: 'ACT-2', date: '2026-10-02', at: '2026-10-02T09:00:00Z', campaign: 'Goodie', kind: 'CANCELLED', user: 'IT' };
  await Promise.all([sandbox.PC_CLOUD.appendActivity(first), sandbox.PC_CLOUD.appendActivity(second)]);
  assert.equal(posts, 2);
  const found = await sandbox.PC_CLOUD.readActivity('2026-10-02');
  assert.deepEqual(Array.from(found, x => x.id).sort(), ['ACT-1', 'ACT-2']);
  await sandbox.PC_CLOUD.appendActivity(first); // retry does not duplicate
  assert.equal(posts, 2);
  await assert.rejects(() => sandbox.PC_CLOUD.appendActivity({ ...first, kind: 'REDUCED' }), /ไม่ตรงกัน/);
  assert.equal((await sandbox.PC_CLOUD.readActivity('2026-10-03')).length, 0);
  const beforePoll = activityReads;
  await sandbox.PC_CLOUD.pull();
  assert.equal(activityReads, beforePoll, 'normal Cloud refresh must not download all audit events');
});
