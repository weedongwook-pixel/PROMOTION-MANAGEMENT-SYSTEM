const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const campaign = 'Extended Item Set';
const header = {
  campaign, shortName: 'Original set', promoType: 'Price Promotion', typePromotion: 'Price Promotion',
  changeStatus: 'EXTENDED', itStatus: 'PENDING', itDoneDate: '2026-09-01',
  start: '2026-09-01', end: '2026-11-30', codePromotion: 'P3001',
  codeItemSet: '1074001', itemPromotion: '1074001', kitchen: 'SET-OLD',
  itemCode: '110109', itemNameEN: 'Original product', gross: 99, discount: 10,
  netPrice: 89, cateRemark: 'Promotion set'
};
const child = {
  ...header, shortName: '', itemCode: '110113', itemNameEN: 'Child product',
  codePromotion: '', codeItemSet: '', itemPromotion: '', kitchen: ''
};
const reduced = {
  campaign: 'Reduced coupon', shortName: 'Original coupon', promoType: 'Item Coupon',
  changeStatus: 'REDUCED', itStatus: 'PENDING', itDoneDate: '2026-09-02',
  start: '2026-09-02', end: '2026-10-15', codePromotion: 'IC301',
  codeItemSet: '', itemPromotion: '', itemCode: '110109'
};
const initial = {
  months: { '2026-09': [header, child, reduced].map(x => ({ ...x })) },
  npdProducts: [{ itemCode: '1074001', itemNameEN: 'Existing set' }],
  codeCounter: { marker: 'unchanged' }, _itemSetDemoVer: 1,
  _showcaseVer: 1, _recipeCustomVer: 1
};
const data = new Map([['pc_mock_store_v28', JSON.stringify(initial)]]);
let failWrite = false;
const localStorage = {
  getItem: k => data.has(k) ? data.get(k) : null,
  setItem: (k, v) => { if (failWrite) throw new Error('QuotaExceededError'); data.set(k, String(v)); },
  removeItem: k => data.delete(k),
  key: i => [...data.keys()][i] || null,
  get length() { return data.size; }
};
const sandbox = {
  localStorage, console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
  fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math
};
sandbox.window = sandbox;
sandbox.PC_REAL_PROMOS = [];
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'mock-backend.js'), 'utf8'), sandbox);

const api = sandbox.PC_API;
const tasks = api.getITTasks('2026-09');
const updateOf = task => ({
  changeOnly: true, month: task.month, rowIdx: task.rowIdx, campaign: task.campaign,
  sourceShortName: task.shortName || '', originalEndDate: task.endDate || '',
  originalPromoCode: task.promoCode || '', originalCodeItemSet: task.builderCode || '',
  originalItemPromotion: task.itemPromo || '', originalItemCode: task.itemCode || ''
});
const originalRows = initial.months['2026-09'];
assert.equal(tasks.length, 3);
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[0]), { ...updateOf(tasks[1]), originalEndDate: 'wrong' }]), 'CHANGE_CONFLICT');
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[0]), updateOf(tasks[0])]), 'CHANGE_CONFLICT');
failWrite = true;
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[0]), updateOf(tasks[1])]), 'STORAGE_ERROR');
failWrite = false;
assert.equal(api.getITTasks('2026-09').length, 3, 'failed local save must roll back the in-memory completion');
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[0]), updateOf(tasks[1])]), 'SUCCESS');
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[2])]), 'SUCCESS');
assert.equal(api.saveSettlementBatch('2026-09', [updateOf(tasks[0])]), 'CHANGE_CONFLICT');

const saved = JSON.parse(data.get('pc_mock_store_v28'));
for (let i = 0; i < 3; i++) {
  const row = saved.months['2026-09'][i];
  assert.equal(row.itStatus, 'COMPLETE');
  assert.ok(row.itDoneDate);
  for (const key of Object.keys(originalRows[i])) {
    if (key === 'itStatus' || key === 'itDoneDate') continue;
    assert.equal(row[key], originalRows[i][key], `row ${i + 1}: ${key}`);
  }
}
assert.deepEqual(saved.npdProducts, initial.npdProducts);
assert.deepEqual(saved.codeCounter, initial.codeCounter);
assert.equal(api.getITTasks('2026-09').length, 0);

// The IT page must send only an acknowledgement, with no code-confirmation or
// Item Set creation path, after the operator confirms the POS date was changed.
async function testPageClose() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'IT_Settlement.html'), 'utf8');
  const start = html.indexOf('  window.saveCampaign = function(');
  const end = html.indexOf('  /* ---- extend / reduce / cancel ---- */', start);
  assert.ok(start >= 0 && end > start);
  const original = [header, child];
  const rows = original.map((row, i) => ({
    getAttribute(key) { return ({
      'data-change-only': '1', 'data-row-idx': String(i + 2),
      'data-short-name': row.shortName, 'data-original-end-date': row.end,
      'data-original-promo-code': row.codePromotion,
      'data-original-code-itemset': row.codeItemSet,
      'data-original-item-promotion': row.itemPromotion,
      'data-original-item-code': row.itemCode
    })[key] || ''; }
  }));
  const card = { dataset: {}, querySelectorAll: () => rows };
  let sent, reserved = false, success;
  const runner = {
    withSuccessHandler(fn) { success = fn; return this; },
    withFailureHandler() { return this; },
    saveSettlementBatch(month, updates) { sent = { month, updates }; }
  };
  const page = {
    window: null, google: { script: { run: runner } },
    Swal: { fire: () => Promise.resolve({ isConfirmed: true }), showLoading() {} },
    console
  };
  page.window = page;
  page.itCardOf = () => card;
  page.itConfirmIfReserved = () => { reserved = true; };
  page.loadITTasks = () => {};
  vm.createContext(page);
  vm.runInContext(html.slice(start, end), page);
  page.saveCampaign(campaign, '2026-09');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.month, '2026-09');
  assert.equal(sent.updates.length, 2);
  assert.equal(sent.updates[0].originalCodeItemSet, '1074001');
  assert.equal(sent.updates[1].originalItemCode, '110113');
  assert.equal(Object.keys(sent.updates[0]).includes('promoCode'), false);
  assert.equal(card.dataset.itSavePending, '1');
  success('SUCCESS');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reserved, false);
  assert.equal(card.dataset.itSavePending, undefined);
}

testPageClose().then(() => console.log('EXTENDED/REDUCED closes all original rows without reserving or changing codes: OK'))
  .catch(error => { console.error(error); process.exitCode = 1; });
