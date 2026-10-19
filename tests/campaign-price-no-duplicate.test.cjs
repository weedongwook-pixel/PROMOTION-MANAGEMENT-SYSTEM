const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('saving stale campaign rows updates existing buttons and never appends duplicates', () => {
  const campaign = 'Lineman - ดีลล็อคราคา (2026)';
  const month = '2026-10';
  const rows = [
    { campaign, shortName: 'LM-ดีลล็อคLCS[55]', codePromotion: 'P3114', codeItemSet: '1073589', itemCode: '108009', gross: 75 },
    { campaign, shortName: 'LM-FDsupertera[179]', codePromotion: 'P3652', codeItemSet: '1073538', itemCode: '101003', gross: 95 },
    { campaign, shortName: '', codePromotion: '', codeItemSet: '', itemCode: '104003', gross: 129 },
  ];
  const data = new Map([['pc_mock_store_v28', JSON.stringify({
    months: { [month]: rows }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
  })]]);
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
  const sandbox = {
    localStorage, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' },
    fetch() { throw new Error('unexpected fetch'); }, URL, Date, Math,
  };
  sandbox.window = sandbox;
  sandbox.PC_REAL_PROMOS = [];
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), sandbox);
  const api = sandbox.PC_API;
  const savedRows = () => JSON.parse(data.get('pc_mock_store_v28')).months[month].filter(r => r.campaign === campaign);

  // The editor still has old/blank data-code values; Cloud has the current codes.
  const stale = [
    { code: '', item: '108009', _short: 'LM-ดีลล็อคLCS[55]', codePromotion: 'P3114', itemPromotion: '1073589', gross: '75' },
    { code: 'P3114', item: '101003', _short: 'LM-FDsupertera[179]', codePromotion: 'P3652', itemPromotion: '1073538', gross: '95' },
    { code: '', item: '104003', _short: '-', gross: '129' },
  ];
  for (let i = 0; i < 2; i++) {
    assert.equal(api.updateCampaignPrices(campaign, stale).status, 'success');
    assert.equal(savedRows().length, 3);
    assert.equal(savedRows().filter(r => r.shortName === 'LM-ดีลล็อคLCS[55]').length, 1);
    assert.equal(savedRows().filter(r => r.shortName === 'LM-FDsupertera[179]').length, 1);
  }

  const duplicate = [{ code: '', item: '__new_1', shortName: 'LM-FDsupertera[179]', itemCode: '101003' }];
  assert.equal(api.updateCampaignPrices(campaign, duplicate).status, 'error');
  assert.equal(savedRows().length, 3);

  const newButton = [{ code: '', item: '__new_2', shortName: 'LM-ใหม่[99]', codePromotion: 'P9999', itemCode: '101005', gross: '99' }];
  assert.equal(api.updateCampaignPrices(campaign, newButton).status, 'success');
  assert.equal(savedRows().length, 4);
});
