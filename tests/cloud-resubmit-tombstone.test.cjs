const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud-store.js'), 'utf8');
const storeKey = 'pc_mock_store_v28';
const campaign = 'Lineman - Goodie อร่อยทุกคำ (Oct 26)';
const campaignKey = 'promo::c::' + encodeURIComponent(campaign);
const deletedAt = Date.now() - 60_000;
const previousBlock = { w: [], m: { '2026-10': [{ campaign, shortName: 'Old Goodie', itStatus: 'PENDING' }] }, _ts: 0 };
const cloud = {
  keys: { 'promo::meta': '{}', 'promo::deleted': JSON.stringify({ [campaign]: deletedAt }), [campaignKey]: JSON.stringify(previousBlock) },
  meta: { 'promo::meta': 1, 'promo::deleted': 2, [campaignKey]: 3 },
  version: 4,
};
const data = new Map([[storeKey, JSON.stringify({ months: {} })]]);
const localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
  get length() { return data.size; },
};
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});
async function fetchMock(url, options = {}) {
  const pathname = new URL(url).pathname;
  const method = options.method || 'GET';
  if (pathname === '/promo/store' && method === 'GET') {
    return response({ ok: true, keys: { ...cloud.keys }, meta: { ...cloud.meta } });
  }
  if (pathname === '/promo/meta' && method === 'GET') {
    return response({ ok: true, meta: { ...cloud.meta } });
  }
  if (pathname.startsWith('/promo/store/') && method === 'PUT') {
    const key = decodeURIComponent(pathname.slice('/promo/store/'.length));
    const body = JSON.parse(options.body);
    assert.equal(body.expectedUpdatedAt, cloud.meta[key] ?? null);
    cloud.keys[key] = body.value;
    cloud.meta[key] = cloud.version++;
    return response({ ok: true, updated_at: cloud.meta[key] });
  }
  if (pathname.startsWith('/promo/store/') && method === 'GET') {
    const key = decodeURIComponent(pathname.slice('/promo/store/'.length));
    return key in cloud.keys
      ? response({ ok: true, value: cloud.keys[key], updated_at: cloud.meta[key] })
      : response({ ok: false }, 404);
  }
  throw new Error(`Unexpected request ${method} ${pathname}`);
}
const sandbox = {
  localStorage, fetch: fetchMock, URL, Date, Math,
  console: { log() {}, warn() {}, error() {} },
  navigator: { onLine: true },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
  document: { readyState: 'loading', hidden: false, addEventListener() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  PC_API: { reloadFromStorage() {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

(async () => {
  await assert.rejects(() => sandbox.PC_CLOUD.readCampaignRows(campaign), /ทะเบียนลบเก่า/);
  await sandbox.PC_CLOUD.pull();
  localStorage.setItem(storeKey, JSON.stringify({
    months: { '2026-10': [{ campaign, shortName: 'LM-Goodie1[263]', itStatus: 'PENDING' }] },
  }));
  await sandbox.PC_CLOUD.syncNow();
  const block = JSON.parse(cloud.keys[campaignKey]);
  assert.ok(block._ts > deletedAt, 'a newly resubmitted campaign must outrank its old deletion');
  assert.equal((await sandbox.PC_CLOUD.readCampaignRows(campaign))[0].shortName, 'LM-Goodie1[263]');
  await sandbox.PC_CLOUD.pull();
  const restored = JSON.parse(localStorage.getItem(storeKey));
  assert.equal(restored.months['2026-10'][0].campaign, campaign);
  console.log('Cloud resubmission after old tombstone: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
