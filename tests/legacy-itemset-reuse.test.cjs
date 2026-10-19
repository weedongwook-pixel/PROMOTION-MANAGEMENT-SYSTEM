const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const month = '2026-10';
const source = {
  campaign: 'ดีลล็อคLCS', shortName: 'LM-ดีลล็อคLCS[59]', month: '2026-02',
  typePromotion: 'Price Promotion', promoType: 'Price Promotion',
  itemCode: '1073033', codePromotion: 'P3114', codeItemSet: '', itemPromotion: '',
  saleMode: 'LINE MAN', itStatus: 'COMPLETE', itDoneDate: '2026-02-26'
};
const target = {
  campaign: 'Lineman - ดีลล็อคราคา (2026)', shortName: 'LM-ดีลล็อคLCS[55]', month,
  typePromotion: 'Item Set', promoType: 'Item Set', itemCode: '108009',
  itemNameEN: 'LARGE Chicken Skin', qty: '1', gross: '75',
  codePromotion: 'P3114', codeItemSet: '1073589', itemPromotion: '1073589',
  kitchen: 'LCS', saleMode: 'LINEMAN', cateRemark: 'Promotion set',
  itStatus: 'PENDING', posReady: true
};
const second = {
  ...target, shortName: 'LM-FDsupertera[179]', itemCode: '101003',
  itemNameEN: 'MEGA FRIES', gross: '95', codePromotion: 'P3652',
  codeItemSet: '1073538', itemPromotion: '1073538', kitchen: 'MFF+MCK'
};
const child = {
  ...second, shortName: '', itemCode: '104003',
  itemNameEN: 'MEGA Super Chicken Pop', gross: '129',
  codePromotion: '', codeItemSet: '', itemPromotion: '', kitchen: ''
};
const data = new Map([['pc_mock_store_v28', JSON.stringify({
  months: { '2026-02': [source], [month]: [target, second, child] },
  _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1
})]]);
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
  fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math,
  PC_ITEM_MASTER: [{ itemCode: '1073033', itemNameEN: 'LCS', itemType: 'Item Set' }]
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'mock-backend.js'), 'utf8'), sandbox);
const api = sandbox.PC_API;
const old = JSON.parse(JSON.stringify(source));
const button = api.getItemSetButtons().find(x => x.campaign === source.campaign);
assert.equal(button.codeItemSet, '1073033');

const update = {
  rowIdx: '2', campaign: target.campaign, month,
  sourceShortName: target.shortName, shortName: target.shortName,
  promoType: 'Item Set', promoCode: 'P3114', itemPromo: '1073033',
  kitchenName: 'LCS', itemCode: '108009', itemNameEN: 'LARGE Chicken Skin',
  qty: '1', price: '75', discount: '20', netPrice: '55', cateRemark: 'Promotion set'
};
// Typing the code without an explicit reuse confirmation must still be refused.
assert.match(api.saveSettlementBatch(month, [update]), /^DUP_PROMO\|P3114\|ดีลล็อคLCS\|1073033$/);
assert.equal(api.savePosButton(target.campaign, target.shortName, '1073033', {
  fromCamp: source.campaign, fromShort: source.shortName
}).status, 'success');
assert.equal(api.confirmPosReuse(target.campaign, target.shortName, '1073033').status, 'success');
const secondUpdate = {
  ...update, rowIdx: '3', sourceShortName: second.shortName,
  shortName: second.shortName, promoCode: 'P3652', itemPromo: '1073538',
  kitchenName: 'MFF+MCK', itemCode: '101003', itemNameEN: 'MEGA FRIES',
  price: '95', discount: '45', netPrice: '179'
};
const childUpdate = {
  ...secondUpdate, rowIdx: '4', sourceShortName: '', shortName: second.shortName,
  itemCode: '104003', itemNameEN: 'MEGA Super Chicken Pop', price: '129',
  discount: '0'
};
assert.equal(api.saveSettlementBatch(month, [update, secondUpdate, childUpdate]), 'SUCCESS');
const saved = JSON.parse(data.get('pc_mock_store_v28'));
assert.equal(saved.months[month][0].itStatus, 'COMPLETE');
assert.equal(saved.months[month][0].codeItemSet, '1073033');
assert.equal(saved.months[month][0].codePromotion, 'P3114');
assert.equal(saved.months[month][2].itStatus, 'COMPLETE');
assert.equal(saved.months[month][2].shortName, second.shortName);
assert.deepEqual(saved.months['2026-02'][0], old);
assert.equal(saved.npdProducts.some(x => x.itemCode === '1073033'), false);
assert.equal(JSON.parse(data.get('pc_product_promo'))['1073033'][0].net, '55');
assert.deepEqual(JSON.parse(data.get('pc_itemset_comp'))['1073538'].map(x => x.code), ['101003', '104003']);
