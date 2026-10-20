const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud-store.js'), 'utf8');
const storeKey = 'pc_mock_store_v28';
const month = '2026-09';
const row = (campaign, status, code) => ({ campaign, shortName: campaign, itStatus: status, codePromotion: code });
const local = { months: { [month]: [row('A', 'PENDING', ''), row('B', 'PENDING', '')] } };
const cloudA = { w: [], m: { [month]: [row('A', 'COMPLETE', 'P100')] }, _ts: 100 };
const cloudB = { w: [], m: { [month]: [row('B', 'COMPLETE', 'P200')] }, _ts: 100 };
const cloud = {
  keys: { 'pc_promo_files': JSON.stringify({f1:{base64:'ORIGINAL'}}), 'promo::meta': '{}', 'promo::c::A': JSON.stringify(cloudA), 'promo::c::B': JSON.stringify(cloudB) },
  meta: { 'pc_promo_files': 1, 'promo::meta': 1, 'promo::c::A': 2, 'promo::c::B': 3 },
  posts: [], nextVersion: 4,
};
const data = new Map([[storeKey, JSON.stringify(local)]]);
const localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => { if(key==='pc_promo_files') throw new Error('QuotaExceededError pc_promo_files'); data.set(key, String(value)); },
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
  get length() { return data.size; },
};
const listeners = {};
let archives = 0, reloads = 0;
let failWrite = false;
const indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        createObjectStore() {}, close() {},
        transaction() {
          const transaction = {
            objectStore() {
              return {
                add() { archives++; queueMicrotask(() => transaction.oncomplete && transaction.oncomplete()); },
                getAllKeys() {
                  const keys = {};
                  queueMicrotask(() => { keys.result = [1]; if (keys.onsuccess) keys.onsuccess();
                    queueMicrotask(() => transaction.oncomplete && transaction.oncomplete()); });
                  return keys;
                },
                delete() {},
              };
            },
          };
          return transaction;
        },
      };
      request.onsuccess();
    });
    return request;
  },
};
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}
async function fetchMock(url, options = {}) {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  const method = options.method || 'GET';
  if (pathname === '/promo/meta' && method === 'GET') return response({ ok: true, meta: { ...cloud.meta } });
  if (pathname === '/promo/store' && method === 'GET') return response({ ok: true, keys: { ...cloud.keys }, meta: { ...cloud.meta } });
  if (pathname.startsWith('/promo/store/') && method === 'PUT') {
    if (failWrite) return response({ ok: false }, 500);
    const key = decodeURIComponent(pathname.slice('/promo/store/'.length));
    const body = JSON.parse(options.body);
    const existing = key in cloud.meta ? cloud.meta[key] : null;
    if (existing !== body.expectedUpdatedAt) return response({ ok: false, error: 'version_conflict' }, 409);
    cloud.posts.push({ [key]: body.value });
    cloud.keys[key] = body.value; cloud.meta[key] = cloud.nextVersion++;
    return response({ ok: true, updated_at: cloud.meta[key] });
  }
  if (pathname.startsWith('/promo/store/') && method === 'GET') {
    const key = decodeURIComponent(pathname.slice('/promo/store/'.length));
    return key in cloud.keys ? response({ ok: true, value: cloud.keys[key], updated_at: cloud.meta[key] }) : response({ ok: false }, 404);
  }
  throw new Error(`Unexpected request ${method} ${pathname}`);
}
const sandbox = {
  localStorage, indexedDB, fetch: fetchMock, URL, Date, Math,
  console: { log() {}, warn() {}, error() {} },
  navigator: { onLine: true },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
  document: { readyState: 'loading', hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  PC_API: { reloadFromStorage() { reloads++; } },
};
sandbox.window = sandbox;
sandbox.addEventListener = (name, fn) => { listeners[name] = fn; };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

(async () => {
  // A restored tab may hold old PENDING rows. Pull must archive them, use Cloud,
  // and refresh the backend's in-memory store without POSTing old campaigns.
  data.set('pc_promo_files',cloud.keys.pc_promo_files);
  await sandbox.PC_CLOUD.pull();
  assert.equal(data.has('pc_promo_files'),false,'Cloud files must not be copied into limited localStorage');
  const campaignRows = await sandbox.PC_CLOUD.readCampaignRows('A');
  assert.equal(campaignRows[0].campaign, 'A', 'submission checks must read the campaign key directly from Cloud');
  assert.equal(archives, 1);
  assert.equal(reloads, 1);
  const afterPull = JSON.parse(data.get(storeKey));
  assert.equal(afterPull.months[month].find(x => x.campaign === 'A').itStatus, 'COMPLETE');
  assert.equal(afterPull.months[month].find(x => x.campaign === 'B').itStatus, 'COMPLETE');
  await sandbox.PC_CLOUD.pushAll();
  assert.equal(cloud.posts.length, 0, 'an unchanged pull must not bulk-upload every campaign');
  data.set('pc_promo_files',JSON.stringify({localOnly:{base64:'UNSYNCED'}}));
  await sandbox.PC_CLOUD.pull();
  assert.match(data.get('pc_promo_files'),/UNSYNCED/,'preserve local-only originals');
  await sandbox.PC_CLOUD.pushAll();
  assert.equal(cloud.posts.length,0,'old local file cache must not replace Cloud originals');
  data.delete('pc_promo_files');

  // A real edit of A sends only A and waits for a read-back acknowledgment.
  afterPull.months[month][0].codePromotion = 'P101';
  localStorage.setItem(storeKey, JSON.stringify(afterPull));
  await sandbox.PC_CLOUD.syncNow();
  assert.equal(cloud.posts.length, 1);
  assert.deepEqual(Object.keys(cloud.posts[0]), ['promo::c::A']);
  assert.equal(JSON.parse(cloud.keys['promo::c::A']).m[month][0].codePromotion, 'P101');

  // A failed write is not reported as success and remains available to retry.
  afterPull.months[month][1].codePromotion = 'P201';
  localStorage.setItem(storeKey, JSON.stringify(afterPull));
  failWrite = true;
  await assert.rejects(() => sandbox.PC_CLOUD.syncNow(), /push 500/);
  assert.equal(cloud.posts.length, 1);
  assert.equal(sandbox.PC_CLOUD.hasPending(), true);
  failWrite = false;
  await sandbox.PC_CLOUD.syncNow();
  assert.equal(cloud.posts.length, 2);

  // If another machine changes B after our pull, this client must refuse to
  // overwrite B with its older version and retain the pending local edit.
  afterPull.months[month][1].codePromotion = 'P202';
  localStorage.setItem(storeKey, JSON.stringify(afterPull));
  cloud.meta['promo::c::B'] = cloud.nextVersion++;
  await assert.rejects(() => sandbox.PC_CLOUD.syncNow(), /CLOUD_CONFLICT:promo::c::B/);
  assert.equal(cloud.posts.length, 2);
  assert.equal(sandbox.PC_CLOUD.hasPending(), true);
  assert.equal(listeners.pagehide, undefined, 'pagehide must not send a blind keepalive write');
  console.log('Cloud sync safety: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
