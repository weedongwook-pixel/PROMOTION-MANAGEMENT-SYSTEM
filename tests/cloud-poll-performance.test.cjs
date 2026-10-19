const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud-store.js'), 'utf8');
const start = source.indexOf('  async function poll() {');
const end = source.indexOf('  function startPolling()', start);
assert.ok(start >= 0 && end > start);

const known = { 'promo::meta': 1, 'promo::c::A': 2 };
let latest = { ...known };
let metaCalls = 0, fullPulls = 0, refreshed = 0, pending = false, failMeta = false;
const sandbox = {
  _polling: false, _hydrated: true, _cloudMtime: known,
  document: { hidden: false },
  enabled: () => true, pendingLocal: () => pending,
  remoteMeta: async () => { metaCalls++; if (failMeta) throw new Error('meta unavailable'); return latest; },
  sameVersion: (a, b) => Number(a) === Number(b),
  pull: async () => { fullPulls++; return { changed: true }; },
  failReset() {}, setStatus() {}, showRefreshPill() { refreshed++; }, failSoft() {},
  Object
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

(async () => {
  await sandbox.poll();
  assert.equal(metaCalls, 1);
  assert.equal(fullPulls, 0, 'an unchanged poll must not download the whole store');

  latest = { ...known, 'promo::c::B': 3 };
  await sandbox.poll();
  assert.equal(fullPulls, 1, 'a new Cloud key must trigger a guarded full pull');
  assert.equal(refreshed, 1);

  failMeta = true;
  await sandbox.poll();
  assert.equal(fullPulls, 2, 'meta failure must retain the previous full-pull fallback');

  pending = true;
  await sandbox.poll();
  assert.equal(metaCalls, 3, 'pending local writes must block a poll');
  console.log('Unchanged Cloud polls use metadata only: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
