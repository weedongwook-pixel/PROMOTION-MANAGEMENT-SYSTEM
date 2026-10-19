const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('all four promotion forms carry a durable receipt into Tracking and survive reload', () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
  const context = { localStorage, URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/submission-log.js'), 'utf8'), context);
  const log = context.PC_SubmissionLog, api = context.PC_API;

  const item = [{ monthYear: '2026-10', campaign: 'Item set test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1 }];
  const itemPlan = log.prepare('Item Set', item);
  assert.equal(api.saveBulkProposal(item), 'SUCCESS');

  const coupon = [{ monthYear: '2026-10', campaignName: 'Coupon test', shortNamePOS: 'Coupon A',
    itemCode: '101003', itemName: 'Fries', qty: 1, grossValue: 100, netPrice: 80,
    couponType: 'Normal', discountValue: 20 }];
  const couponPlan = log.prepare('Coupon', coupon);
  assert.equal(api.submitCouponProposal(coupon).status, 'success');

  const bill = { globalMonth: '2026-10', campaigns: [{ name: 'Bill test', buttons: [{ shortName: 'Bill A',
    discountValue: 10, discountUnit: 'CUR', items: [] }] }] };
  const billPlan = log.prepare('Bill Discount', bill);
  assert.equal(api.submitBillDiscountProposal(bill).status, 'success');

  const voucher = [{ month: '2026-10', name: 'Voucher test', buttons: [{ shortName: 'Voucher A',
    voucherType: 'Normal', discountValue: 50, discountUnit: 'CUR', items: [] }] }];
  const voucherPlan = log.prepare('Voucher', voucher);
  assert.equal(api.processVoucher(voucher), 'Success');

  const expected = [itemPlan, couponPlan, billPlan, voucherPlan].map(plan => plan.entries[0]);
  let rows = api.getAllCampaignData();
  expected.forEach(entry => {
    const found = rows.find(row => row.submissionId === entry.id);
    assert.ok(found, `Tracking should include ${entry.form}`);
    assert.equal(found.submittedBy, 'Bow');
    assert.equal(found.txnDate, entry.at);
    assert.equal(found.submissionExpectedButtons, 1);
  });
  api.reloadFromStorage();
  rows = api.getAllCampaignData();
  expected.forEach(entry => assert.ok(rows.some(row => row.submissionId === entry.id), `receipt should survive reload: ${entry.form}`));
});
