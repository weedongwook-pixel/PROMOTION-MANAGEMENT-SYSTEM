const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const proposal = fs.readFileSync(path.join(__dirname, '../pages/Proposal.html'), 'utf8');

test('Item Set discount stays empty until Net is entered, including an explicit zero', () => {
  const source = proposal.match(/window\.updateTotals = function\(btnId\) \{([\s\S]*?)\n  \};/);
  assert.ok(source, 'Item Set total calculator exists');

  const net = { value: '' };
  const discount = { value: '' };
  const gross = { innerText: '' };
  const rows = [49, 50].map(price => ({
    querySelector(selector) {
      return selector === '.row-qty' ? { value: '1' } : { value: String(price) };
    },
  }));
  const block = {
    querySelectorAll: () => rows,
    querySelector(selector) {
      return { '.btn-gross': gross, '.btn-net': net, '.btn-disc': discount }[selector];
    },
  };
  const context = { window: {}, document: { getElementById: () => block }, Number, parseFloat };
  vm.runInNewContext('window.updateTotals = function(btnId) {' + source[1] + '\n};', context);

  context.window.updateTotals('button');
  assert.equal(gross.innerText, '99.00');
  assert.equal(discount.value, '', 'empty Net must not be treated as zero');

  net.value = '0';
  context.window.updateTotals('button');
  assert.equal(discount.value, '99.00', 'explicit Net 0 is a valid calculation');

  net.value = '4';
  context.window.updateTotals('button');
  assert.equal(discount.value, '95.00');

  net.value = '';
  context.window.updateTotals('button');
  assert.equal(discount.value, '', 'clearing Net must clear the old discount');

  const netMarkup = proposal.match(/<input[^>]*class="[^"]*btn-net[^"]*"[^>]*>/);
  assert.ok(netMarkup);
  assert.doesNotMatch(netMarkup[0], /\bvalue=/, 'Net must have no default price');
});

test('Item Set save rejects missing Net but accepts an explicit zero', () => {
  const data = new Map([['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = {
    localStorage: {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: key => data.delete(key),
      key: index => [...data.keys()][index] || null,
      get length() { return data.size; },
    },
    URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [],
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);

  const item = { monthYear: '2026-10', campaign: 'Net zero test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 99, qty: 1 };
  for (const missing of [undefined, '', '  ', -1, 'invalid']) {
    const result = context.PC_API.saveBulkProposal([{ ...item, netPrice: missing }]);
    assert.match(result, /กรุณากรอก Net Price/);
  }
  assert.equal(context.PC_API.saveBulkProposal([{ ...item, netPrice: 0 }]), 'SUCCESS');
  const saved = JSON.parse(data.get('pc_mock_store_v28')).months['2026-10']
    .find(row => row.campaign === item.campaign);
  assert.ok(saved);
  assert.equal(Number(saved.discount), 99);
  assert.equal(Number(saved.netPrice), 0);
});
