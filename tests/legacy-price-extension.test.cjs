const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const campaign = 'ดีลล็อคLFF';
const old = {
  month: '2025-11', campaign, shortName: 'LM-ดีลล็อคLFF[43]',
  promoType: 'Price Promotion', typePromotion: 'Price Promotion',
  codePromotion: 'P2933', codeItemSet: '', itemPromotion: '',
  itemCode: '1072873', itemNameEN: 'LM-ดีลล็อคLFF[43]',
  kitchen: '', changeStatus: 'EXTENDED', itStatus: 'PENDING',
  itDoneDate: '2025-11-28', end: '2026-12-31', cateRemark: 'Promotion Set'
};
const newer = {
  month: '2026-04', campaign, shortName: 'LM-ดีลล็อคLFF[45]',
  promoType: 'Price Promotion', typePromotion: 'Price Promotion',
  codePromotion: 'P3277', codeItemSet: '', itemPromotion: '',
  itemCode: '1073187', kitchen: '', changeStatus: '', itStatus: 'COMPLETE',
  itDoneDate: '2026-04-29', end: '2026-06-30'
};
const initial = {
  working: [old, newer].map(x => ({ ...x })),
  months: { '2025-11': [{ ...old }], '2026-04': [{ ...newer }] },
  npdProducts: [{ itemCode: '1072873', itemNameEN: 'LFF master' }],
  _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1
};
const data = new Map([['pc_mock_store_v28', JSON.stringify(initial)]]);
const localStorage = {
  getItem: k => data.has(k) ? data.get(k) : null,
  setItem: (k, v) => data.set(k, String(v)),
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
const tasks = api.getITTasks('2025-11');
assert.equal(tasks.length, 1);
assert.equal(tasks[0].promoCode, 'P2933');
assert.equal(tasks[0].itemCode, '1072873');
assert.equal(tasks[0].itDoneDate, '2025-11-28');

const update = {
  changeOnly: true, month: '2025-11', rowIdx: '2', campaign,
  sourceShortName: 'LM-ดีลล็อคLFF[43]', shortName: 'LM-ดีลล็อคLFF[43]',
  originalEndDate: '2026-12-31', originalPromoCode: 'P2933',
  originalCodeItemSet: '', originalItemPromotion: '', originalItemCode: '1072873'
};
assert.equal(api.saveSettlementBatch('2025-11', [{ ...update, originalPromoCode: 'P3277' }]), 'CHANGE_CONFLICT');
assert.equal(api.saveSettlementBatch('2025-11', [update]), 'SUCCESS');

const saved = JSON.parse(data.get('pc_mock_store_v28'));
assert.equal(saved.months['2025-11'][0].itStatus, 'COMPLETE');
assert.equal(saved.months['2025-11'][0].codePromotion, 'P2933');
assert.equal(saved.months['2025-11'][0].codeItemSet, '');
assert.equal(saved.months['2025-11'][0].itemCode, '1072873');
assert.equal(saved.months['2025-11'][0].end, '2026-12-31');
assert.equal(saved.months['2026-04'][0].codePromotion, 'P3277');
assert.equal(saved.months['2026-04'][0].itemCode, '1073187');
assert.equal(saved.npdProducts[0].itemNameEN, 'LFF master');

console.log('Legacy Price Promotion extension reuses original product without recreating it: OK');
