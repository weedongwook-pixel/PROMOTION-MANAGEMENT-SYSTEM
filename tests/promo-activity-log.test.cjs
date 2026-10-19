const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend() {
  const campaign = 'Goodie Oct 26';
  const data = new Map([['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [
      { campaign, shortName: 'Deal A', codePromotion: 'P1000', itemCode: '101003', end: '2026-10-10', opStatus: 'CONFIRMED' },
      { campaign, shortName: 'Deal B', codePromotion: 'P1001', itemCode: '101004', end: '2026-10-10', opStatus: 'CONFIRMED' },
    ] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
  })]]);
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
  const sandbox = { localStorage, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { href: 'http://test/' }, URL, Date, Math };
  sandbox.window = sandbox;
  sandbox.PC_REAL_PROMOS = [];
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), sandbox);
  return { api: sandbox.PC_API, campaign, data };
}

test('add/reduce/extend/cancel expose precise audit events only for successful changes', () => {
  const { api, campaign } = backend();
  const added = api.updateCampaignPrices(campaign, [{ item: '__new_1', shortName: 'Deal C', codePromotion: 'P1002', itemCode: '101005' }]);
  assert.equal(added.status, 'success');
  assert.equal(added._activity.kind, 'ADDED');
  assert.deepEqual(Array.from(added._activity.buttons), ['Deal C']);
  const noAdd = api.updateCampaignPrices(campaign, [{ code: 'P1000', item: '101003', _short: 'Deal A', gross: '99' }]);
  assert.equal(noAdd.status, 'success');
  assert.equal(noAdd._activity, null);
  const duplicate = api.updateCampaignPrices(campaign, [{ item: '__new_2', shortName: 'Deal C', itemCode: '101005' }]);
  assert.equal(duplicate.status, 'error');
  assert.equal(duplicate._activity, undefined);
  const reduced = api.extendButtons(campaign, ['Deal A'], '2026-10-05', 'shorter');
  assert.equal(reduced._activity.kind, 'REDUCED');
  assert.equal(reduced._activity.before, '2026-10-10');
  assert.equal(reduced._activity.after, '2026-10-05');
  const extended = api.extendCampaign(campaign, '2026-10-31', 'more time');
  assert.equal(extended._activity.kind, 'EXTENDED');
  const cancelled = api.cancelButtons(campaign, ['Deal B'], 'ended');
  assert.equal(cancelled._activity.kind, 'CANCELLED');
  assert.deepEqual(Array.from(cancelled._activity.buttons), ['Deal B']);
  assert.equal(api.cancelButtons(campaign, ['unknown'], 'nope').status, 'error');
});
