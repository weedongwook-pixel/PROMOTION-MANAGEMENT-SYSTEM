const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Item Set Cloud-first save commits before browser cache and leaves no local submission on failure', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
  const context = { localStorage, URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const original = data.get('pc_mock_store_v28');
  context.PC_CLOUD_FIRST_FORMS = true;
  let sent = null;
  context.PC_CLOUD = {
    async savePreparedCampaignRows(rows, batchId, actor) { sent = { rows, batchId, actor }; return { ok: true }; },
    async pull() {},
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cloud item set test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-receipt-001', submissionBatchId: 'itemset-batch-001', submittedBy: 'Bow' }];
  assert.equal(await context.PC_API.saveBulkProposal(item), 'SUCCESS');
  assert.equal(sent.batchId, 'itemset-batch-001');
  assert.equal(sent.rows[0].submissionId, 'itemset-receipt-001');
  assert.equal(data.get('pc_mock_store_v28'), original, 'the campaign must not be saved locally before Cloud commits');

  context.PC_CLOUD.savePreparedCampaignRows = async () => { throw new Error('Cloud unavailable'); };
  await assert.rejects(() => context.PC_API.saveBulkProposal(item), /Cloud unavailable/);
  assert.equal(data.get('pc_mock_store_v28'), original, 'a failed Cloud save must not leave an apparent local success');
});

test('E-Voucher Item Set reserves its coupon code in the same Cloud commit', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = { URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const original = [...data.entries()];
  let sent;
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async readCloudKey(key) {
      assert.equal(key, 'pc_code_counter_v1');
      return { value: JSON.stringify({ types: { coupon: { cursor: 500, seeded: true } }, reservations: {}, log: [] }), updatedAt: 7 };
    },
    async savePreparedCampaignRows(rows, batchId, actor, extraWrites) {
      sent = { rows, batchId, actor, extraWrites };
      return { ok: true };
    },
    async pull() {},
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cloud EV test', shortName: 'EV A', postCate: 'E-Voucher',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-ev-receipt-001', submissionBatchId: 'itemset-ev-batch-001', submittedBy: 'Bow' }];
  assert.equal(await context.PC_API.saveBulkProposal(item), 'SUCCESS');
  assert.equal(sent.rows[0].codePromotion, 'IC0501');
  assert.equal(sent.extraWrites[0].key, 'pc_code_counter_v1');
  assert.equal(sent.extraWrites[0].expectedUpdatedAt, 7);
  assert.deepEqual([...data.entries()], original);
});

test('Cloud receipt stays successful when post-commit browser cache is full', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = { URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout: fn => setImmediate(fn), clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async savePreparedCampaignRows() { return { ok: true }; },
    async pull() { context.__PC_PERSIST_FAIL = 'quota'; throw new Error('QuotaExceededError'); },
    enabled() { return true; },
    hasPending() { return true; },
    async syncNow() { throw new Error('legacy pending write'); },
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cache full test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-cache-receipt-001', submissionBatchId: 'itemset-cache-batch-001', submittedBy: 'Bow' }];
  const result = await new Promise((resolve, reject) => {
    context.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).saveBulkProposal(item);
  });
  assert.equal(result, 'SUCCESS');
});
