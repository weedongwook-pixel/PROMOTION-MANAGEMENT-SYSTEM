const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function input(className, value) {
  const counter = { textContent: '', style: {} };
  const parent = {
    className: '',
    querySelector(selector) { return selector === '.pc-nlm-c' ? counter : null; },
    appendChild() {}
  };
  return {
    className, value, type: 'text', title: '', style: {}, parentElement: parent,
    attrs: {},
    getAttribute(key) { return this.attrs[key] || null; },
    setAttribute(key, value) { this.attrs[key] = value; },
    matches(selector) { return selector.split(',').some(part => part.trim() === '.' + className); },
    addEventListener() {}
  };
}

const en = input('f-itemname', 'MEGA Super Chicken Pop');
const npdEn = input('n-name', 'MEGA Super Chicken Pop');
const powder = input('f-eng', 'Powder name');
const th = input('f-th', 'ชื่อภาษาไทย');
const document = {
  readyState: 'complete', documentElement: {},
  querySelectorAll() { return [en, npdEn, powder, th]; },
  createElement() { return { style: {} }; }
};
const ui = { document, MutationObserver: class { observe() {} } };
ui.window = ui;
vm.runInNewContext(read('js/name-limit.js'), ui);
assert.equal(en.attrs.maxlength, '40');
assert.equal(en.parentElement.querySelector('.pc-nlm-c').textContent, '22/40');
assert.equal(en.style.borderColor, '');
assert.equal(npdEn.attrs.maxlength, '20');
assert.equal(npdEn.parentElement.querySelector('.pc-nlm-c').textContent, '22/20');
assert.equal(npdEn.style.borderColor, '#c62828');
assert.equal(th.attrs.maxlength, '20');
assert.equal(powder.attrs.maxlength, '20');
assert.equal(ui.PC_NameLimit.check(['A'.repeat(20)], 'EN').length, 0);
assert.equal(ui.PC_NameLimit.check(['A'.repeat(21)], 'EN').length, 1);
assert.equal(ui.PC_NameLimit.check(['A'.repeat(40)], 'SETTLEMENT_EN').length, 0);
assert.equal(ui.PC_NameLimit.check(['A'.repeat(41)], 'SETTLEMENT_EN').length, 1);

const data = new Map([['pc_mock_store_v28', JSON.stringify({ months: {}, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]]);
const localStorage = {
  getItem: key => data.get(key) || null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
  key: index => [...data.keys()][index] || null,
  get length() { return data.size; }
};
const backend = {
  localStorage, console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
  fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math
};
backend.window = backend;
vm.createContext(backend);
vm.runInContext(read('js/mock-backend.js'), backend);
const api = backend.PC_API;
const valid = { project: 'Name limit test', items: [{ name: 'A'.repeat(20), th: 'ก'.repeat(20) }], subsets: [] };
assert.equal(api.submitNPD(valid).status, 'success');
const longEn = { ...valid, items: [{ name: 'A'.repeat(21), th: 'ก'.repeat(20) }] };
assert.match(api.submitNPD(longEn).message, /21\/20/);
const longTh = { ...valid, items: [{ name: 'A'.repeat(20), th: 'ก'.repeat(21) }] };
assert.match(api.submitNPD(longTh).message, /21\/20/);
const longPowder = { ...valid, subsets: [{ name: 'Test subset', powders: [{ eng: 'P'.repeat(21) }] }] };
assert.match(api.submitNPD(longPowder).message, /21\/20/);
