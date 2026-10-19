const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../js/op-tracking.js'), 'utf8');

function loadOpPage(rows = [], details = {}) {
  const expanded = { innerHTML: '' };
  let success;
  const run = {
    withSuccessHandler(callback) { success = callback; return this; },
    withFailureHandler() { return this; },
    getAllCampaignData() { success(rows); },
    getPromoDetails() { success(details); }
  };
  const window = {};
  const document = {
    getElementById(id) { return id === 'opt-exp-1' ? expanded : null; }
  };
  vm.runInNewContext(script, { window, document, google: { script: { run } }, console });
  window.optUpdateReviewStatus = () => {};
  return { window, expanded };
}

test('OP reviews one named POS button with an unnamed member as one card', () => {
  const campaign = 'Lineman - Exclusive promotion only at Lineman (Oct 26)';
  const rows = [{ rowIdx: 1, campaign, promoType: 'Item Set', opStatus: 'WAITING' }];
  const items = [
    { shortName: 'LM-EXGoodie[129]', itemCode: '110109', itemSetCode: '1073552', codePromotion: 'P3664', kitchen: 'MLTM&FF+CHRG', itemNameEn: 'Mega Loaded Tamago and Fries', qty: 1, price: 129, netPrice: 129 },
    { shortName: '-', itemCode: '110113', itemNameEn: 'Giant Churro', qty: 1, price: 69, netPrice: 129 }
  ];
  const { window, expanded } = loadOpPage(rows, { status: 'success', items, promoCode: 'P3664' });
  window.loadOpTasks();
  window.optFetch(1);

  assert.equal(window.optReviewButtonGroups(items).length, 1);
  assert.match(expanded.innerHTML, /ตรวจแต่ละปุ่ม \(1 ปุ่ม\)/);
  assert.equal((expanded.innerHTML.match(/class="btn-review /g) || []).length, 1);
  assert.match(expanded.innerHTML, /110109/);
  assert.match(expanded.innerHTML, /110113/);
  assert.equal(window.__optDetailCache[1].list.length, 1);
});

test('OP keeps unnamed members separate when multiple POS buttons make ownership ambiguous', () => {
  const { window } = loadOpPage();
  const groups = window.optReviewButtonGroups([
    { shortName: 'Button A', itemCode: '1' },
    { shortName: 'Button B', itemCode: '2' },
    { shortName: '-', itemCode: '3' }
  ]);
  assert.deepEqual(Array.from(groups, group => group.name), ['Button A', 'Button B', '-']);
  assert.deepEqual(Array.from(groups, group => group.items.length), [1, 1, 1]);
});

test('OP puts the named row first even when an unnamed member arrives first', () => {
  const { window } = loadOpPage();
  const groups = window.optReviewButtonGroups([
    { shortName: '-', itemCode: '110113' },
    { shortName: 'LM-EXGoodie[129]', itemCode: '110109', itemSetCode: '1073552' }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].itemCode, '110109');
  assert.equal(groups[0].items[1].itemCode, '110113');
});
