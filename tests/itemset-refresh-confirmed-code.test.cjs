const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(status = 'PENDING', confirmed = true) {
  const row = { campaign: 'Refresh', shortName: 'Set', month: '2026-10',
    typePromotion: 'Item Set', codeItemSet: '1073604', itemPromotion: '1073604',
    itemCode: '101003', qty: '1', posReady: true, itStatus: status };
  const data = new Map([['pc_mock_store_v28', JSON.stringify({ months: { '2026-10': [row] },
    _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]]);
  const entry = { code: '1073604', status: confirmed ? 'CONFIRMED' : 'RESERVED' };
  const context = { URL, Date, Math, setTimeout() {}, clearTimeout() {},
    console: { log() {}, warn() {}, error() {} }, location: { hostname: 'localhost' },
    PC_REAL_PROMOS: [], localStorage: {
      getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)),
      removeItem: k => data.delete(k), key: i => [...data.keys()][i], get length() { return data.size; }
    }, PC_COUNTER: { findForField(type, cat, camp, field) {
      assert.equal(type, 'itemset'); assert.equal(camp, 'Refresh');
      assert.equal(field, 'itccf-itemset-' + encodeURIComponent(JSON.stringify(['Refresh', 'Set', '2026-10'])));
      return entry;
    } } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('js/mock-backend.js', 'utf8'), context);
  return { api: context.PC_API, data, entry };
}

test('clear 1073604 before IT confirms 1073605, then receive the new code', () => {
  const { api, data, entry } = setup();
  assert.equal(api.clearPosButtonCode('Refresh', 'Set').status, 'success');
  const row = JSON.parse(data.get('pc_mock_store_v28')).months['2026-10'][0];
  assert.equal(row.codeItemSet, '');
  assert.equal(row.itemPromotion, '');
  assert.equal(row.posReady, false);
  assert.equal(api.getItemSetButtons().find(b => b.campaign === 'Refresh').codeItemSet, '');
  assert.equal(api.getITTasks('2026-10').find(b => b.campaign === 'Refresh').builderCode, '');
  assert.equal(entry.code, '1073604', 'clearing must not release the IT reservation');
  entry.code = '1073605'; // IT confirms its replacement after Builder is clear.
  assert.equal(api.getPosConfirmedCode('Refresh', 'Set'), '1073605');
  assert.equal(api.savePosButton('Refresh', 'Set', api.getPosConfirmedCode('Refresh', 'Set')).status, 'success');
  assert.equal(api.getItemSetButtons().find(b => b.campaign === 'Refresh').codeItemSet, '1073605');
});

test('cannot clear when IT work is closed, absent, or its replacement code is unconfirmed', () => {
  for (const [status, confirmed] of [['COMPLETE', true], ['PENDING', false], ['CANCELLED', true]]) {
    const { api, data } = setup(status, confirmed);
    const before = data.get('pc_mock_store_v28');
    assert.equal(api.clearPosButtonCode('Refresh', 'Set').status, 'error');
    assert.equal(data.get('pc_mock_store_v28'), before);
    assert.equal(api.clearPosButtonCode('Missing', 'Set').status, 'error');
  }
});
