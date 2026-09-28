const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const month = '2026-09';
const row = (campaign, shortName, itemCode, saleMode, itemSet, promo) => ({
  campaign, shortName, itemCode, itemNameEN: shortName, qty: '1', gross: '99', price: '99',
  typePromotion: 'Item Set', promoType: 'Item Set', saleMode,
  codeItemSet: itemSet || '', itemPromotion: itemSet || '', codePromotion: promo || '',
  kitchen: shortName, cate: 'Promotion set', cateRemark: 'Promotion set', stores: 'ALL', itStatus: 'PENDING'
});
const rows = [
  row('SOURCE', 'Original', '1001', 'Take Away', '1079001', 'P9001'),
  row('SOURCE2', 'Original2', '1002', 'Lineman', '1079002', 'P9002'),
  row('TARGET', 'Shared', '2002', 'Grab', '', 'P9001'),
  row('ACCIDENT', 'Accidental', '3003', 'Grab', '', 'P9001')
];
const data = new Map([
  ['pc_mock_store_v28', JSON.stringify({
    months: { [month]: rows }, npdProducts: [{ itemCode: '1079001', itemNameEN: 'Original master' }],
    _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1
  })],
  ['pc_product_promo', JSON.stringify({
    '1079001': [{ typePromo: 'Price Promotion', prCode: 'P9001', net: '99', desc1: 'Original',
      saleMode: 'Take Away', _fromItemSet: true, _fromItemSetKey: 'SOURCE||Original' }]
  })]
]);
const localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
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
const update = (rowIdx, campaign, sourceShortName, shortName, itemSet, promo, itemCode) => ({
  rowIdx: String(rowIdx), campaign, month, sourceShortName, shortName, promoType: 'Item Set',
  promoCode: promo, itemPromo: itemSet, kitchenName: shortName, itemCode, itemNameEN: shortName,
  qty: '1', price: '99', discount: '0', netPrice: '99', cateRemark: 'Promotion set'
});

// Merely typing an existing pair is not a deliberate reuse.
assert.equal(api.savePosButton('ACCIDENT', 'Accidental', '1079001').status, 'success');
assert.match(api.saveSettlementBatch(month, [update(5, 'ACCIDENT', 'Accidental', 'Accidental', '1079001', 'P9001', '3003')]), /^DUP_PROMO\|P9001\|SOURCE\|1079001$/);
assert.match(api.saveSettlementBatch(month, [update(5, 'ACCIDENT', 'Accidental', 'Accidental', '1079001', 'P9003', '3003')]), /^DUP_ITEMSET\|1079001\|SOURCE$/);
assert.match(api.saveSettlementBatch(month, [update(5, 'ACCIDENT', 'Accidental', 'Accidental', '1079001', 'P9003', '1001')]), /^DUP_ITEMSET\|1079001\|SOURCE$/);

// Reusing a different 107 does not license an unrelated Promotion code.
assert.equal(api.savePosButton('TARGET', 'Shared', '1079002', { fromCamp: 'SOURCE2', fromShort: 'Original2' }).status, 'success');
assert.equal(api.confirmPosReuse('TARGET', 'Shared', '1079002').status, 'success');
assert.match(api.saveSettlementBatch(month, [update(4, 'TARGET', 'Shared', 'Shared', '1079002', 'P9001', '2002')]), /^DUP_PROMO\|P9001\|SOURCE\|1079001$/);

// IT-confirmed reuse of the exact pair can finish work in another Sale Mode.
assert.equal(api.savePosButton('TARGET', 'Shared', '1079001', { fromCamp: 'SOURCE', fromShort: 'Original' }).status, 'success');
assert.equal(api.confirmPosReuse('TARGET', 'Shared', '1079001').status, 'success');
assert.equal(api.saveSettlementBatch(month, [update(4, 'TARGET', 'Shared', 'Renamed shared', '1079001', 'P9001', '2002')]), 'SUCCESS');
let stored = JSON.parse(data.get('pc_mock_store_v28'));
assert.equal(stored.months[month][2].itStatus, 'COMPLETE');
assert.equal(stored.months[month][2].saleMode, 'Grab');
assert.equal(stored.npdProducts.find(p => p.itemCode === '1079001').itemNameEN, 'Original master');
assert.equal(api.isPosReuseConfirmed('TARGET', 'Renamed shared', '1079001'), true);

// Saving again updates this button's binding, without replacing the source.
assert.equal(api.saveSettlementBatch(month, [update(4, 'TARGET', 'Renamed shared', 'Renamed shared', '1079001', 'P9001', '2002')]), 'SUCCESS');
const bindings = JSON.parse(data.get('pc_product_promo'))['1079001'].filter(p => p.prCode === 'P9001');
assert.equal(bindings.length, 2);
assert.equal(bindings.find(p => p._fromItemSetKey === 'SOURCE||Original').saleMode, 'Take Away');
assert.equal(bindings.find(p => p._fromItemSetKey === 'TARGET||Renamed shared').saleMode, 'Grab');

// A previously completed shared pair remains editable without recreating the
// product master, even if it predates explicit reuse metadata.
const legacyRows = [
  row('SOURCE', 'Original', '1001', 'Take Away', '1079001', 'P9001'),
  Object.assign(row('LEGACY', 'Old shared', '2002', 'Grab', '1079001', 'P9001'), { itDoneDate: '2026-09-20' })
];
const legacyData = new Map([['pc_mock_store_v28', JSON.stringify({
  months: { [month]: legacyRows }, npdProducts: [{ itemCode: '1079001', itemNameEN: 'Original master' }],
  _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1
})]]);
const legacyStorage = {
  getItem: key => legacyData.has(key) ? legacyData.get(key) : null,
  setItem: (key, value) => legacyData.set(key, String(value)),
  removeItem: key => legacyData.delete(key),
  key: index => [...legacyData.keys()][index] || null,
  get length() { return legacyData.size; }
};
const legacySandbox = {
  localStorage: legacyStorage, console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
  fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math
};
legacySandbox.window = legacySandbox;
legacySandbox.PC_REAL_PROMOS = [];
vm.createContext(legacySandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'mock-backend.js'), 'utf8'), legacySandbox);
assert.equal(legacySandbox.PC_API.saveSettlementBatch(month, [update(3, 'LEGACY', 'Old shared', 'Old shared', '1079001', 'P9001', '2002')]), 'SUCCESS');
assert.equal(JSON.parse(legacyData.get('pc_mock_store_v28')).npdProducts.find(p => p.itemCode === '1079001').itemNameEN, 'Original master');

// The IT confirmation dialog must actually call the backend after approval.
async function testSettlementButton() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'IT_Settlement.html'), 'utf8');
  const start = html.indexOf('  window.saveCampaign = function(');
  const end = html.indexOf('  /* ---- extend / reduce / cancel ---- */', start);
  assert.ok(start >= 0 && end > start);
  const fields = {
    '.f-code': { disabled: false, value: 'P9001' }, '.f-type': { value: 'Item Set' },
    '.f-itempromo': { value: '1079001', id: 'item-field', getAttribute: () => '107' },
    '.f-kitchen': { value: 'Shared' }, '.f-net': { value: '99' },
    '.f-short': { value: 'Renamed shared' }, '.f-itemcode': { value: '2002' },
    '.f-itemname': { value: 'Renamed shared' }, '.f-qty': { value: '1' },
    '.f-gross': { value: '99' }, '.f-disc': { value: '0' }
  };
  const tr = {
    style: {},
    getAttribute: key => ({ 'data-short-name': 'Renamed shared', 'data-is-itemset': '1',
      'data-builder-code': '1079001', 'data-change-status': '', 'data-row-idx': '4' })[key] || '',
    querySelector: key => fields[key]
  };
  const remark = { value: 'Promotion set', classList: { add() {}, remove() {} } };
  const card = {
    dataset: {}, getAttribute: key => key === 'data-sale-mode' ? 'Grab' : '',
    querySelectorAll: () => [tr],
    querySelector: key => key === '.f-cate-remark' ? remark : key === '.f-branch-note' ? { value: '' } : null
  };
  let allow = false, saves = 0, lastResult = '';
  const runner = {
    withSuccessHandler(fn) { this.success = fn; return this; },
    withFailureHandler() { return this; },
    saveSettlementBatch(m, updates) { saves++; lastResult = api.saveSettlementBatch(m, updates); this.success(lastResult); }
  };
  sandbox.google = { script: { run: runner } };
  sandbox.PC_COUNTER = { findForField: () => null };
  sandbox.itFieldEntry = () => null;
  sandbox.itEsc = value => String(value);
  sandbox.itConfirmIfReserved = () => {};
  sandbox.itCardOf = () => card;
  sandbox.loadITTasks = () => {};
  sandbox.Swal = {
    fire(options) {
      if (options && options.title === 'ยืนยันใช้รหัส Item Set เดิม') {
        assert.match(options.html, /Grab/);
        return Promise.resolve({ isConfirmed: allow });
      }
      return Promise.resolve({ isConfirmed: true });
    },
    showLoading() {}
  };
  vm.runInContext(html.slice(start, end), sandbox);
  sandbox.saveCampaign('TARGET', month);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves, 0);
  assert.notEqual(card.dataset.itSavePending, '1');
  allow = true;
  sandbox.saveCampaign('TARGET', month);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves, 1);
  assert.equal(lastResult, 'SUCCESS');
  assert.notEqual(card.dataset.itSavePending, '1');
}

testSettlementButton().then(() => console.log('Item Set reuse settlement and IT confirmation: OK'))
  .catch(error => { console.error(error); process.exitCode = 1; });
