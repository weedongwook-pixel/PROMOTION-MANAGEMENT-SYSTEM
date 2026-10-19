const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
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
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/form-code-allocation.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const baseline = [...data.entries()];
  const counter = JSON.stringify({ v: 1, types: {
    coupon: { cursor: 400, seeded: true }, bill: { cursor: 70, seeded: true },
    voucher: { cursor: 900, seeded: true },
  }, reservations: {}, log: [] });
  let sent = null;
  let reject = false;
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async readCloudKey(key) {
      if (key === 'pc_code_counter_v1') return { value: counter, updatedAt: 101 };
      if (key === 'pc_promo_files') return { value: '{}', updatedAt: 102 };
      throw new Error('unexpected key ' + key);
    },
    async savePreparedCampaignRows(rows, batchId, actor, extraWrites) {
      sent = { rows, batchId, actor, extraWrites };
      if (reject) throw new Error('Cloud unavailable');
      return { ok: true };
    },
    async pull() {},
  };
  return { data, baseline, context, get sent() { return sent; }, fail() { reject = true; } };
}

function assertNoLocalWrite(f) {
  assert.deepEqual([...f.data.entries()], f.baseline, 'form must not write browser storage before Cloud confirms');
}

const meta = { submissionId: 'form-receipt-001', submissionBatchId: 'form-batch-001',
  submittedBy: 'Bow', submissionExpectedButtons: 1, submissionForm: 'test' };
test('two CRM coupons commit different Mapping codes and IT receives the matching code',async()=>{
 const f=fixture();const base={...meta,monthYear:'2026-10',campaignName:'CRM pair',couponType:'Normal',customerGroup:'crm',crmMappingRequired:'yes',itemCode:'101001',itemName:'Fries',qty:1,grossValue:75,netPrice:65,discountValue:10};
 await f.context.PC_API.submitCouponProposal([{...base,shortNamePOS:'Coupon A',crmMappingCode:'VD-A'},{...base,shortNamePOS:'Coupon B',crmMappingCode:'VD-B'}]);
 assert.deepEqual(Array.from(f.sent.rows,r=>[r.shortName,r.crmMappingCode]),[['Coupon A','VD-A'],['Coupon B','VD-B']]);
 assertNoLocalWrite(f);
});

test('Coupon category mode preserves its discount and rejects mixing products before Cloud commit',async()=>{
 const f=fixture();const category={...meta,monthYear:'2026-10',campaignName:'Category test',shortNamePOS:'Fries category',selectionMode:'CATE',itemCode:'101',cateCode:'101',itemName:'Fries',qty:1,grossValue:'',netPrice:'',discountValue:10,discountUnit:'CUR',couponType:'Normal'};
 assert.equal((await f.context.PC_API.submitCouponProposal([category])).status,'success');
 assert.equal(f.sent.rows[0].netPrice,'');assert.equal(f.sent.rows[0].discount,'10฿');assert.equal(f.sent.rows[0].selectionMode,'CATE');assertNoLocalWrite(f);
 const fresh=fixture();const result=await fresh.context.PC_API.submitCouponProposal([category,{...category,selectionMode:'ITEM',itemCode:'101001',grossValue:75,netPrice:65}]);
 assert.equal(result.status,'error');assert.equal(fresh.sent,null);assertNoLocalWrite(fresh);
});

test('Coupon commits campaign, reservation, and attachment together without local-first save', async () => {
  const f = fixture();
  const payload = [{ ...meta, monthYear: '2026-10', campaignName: 'Coupon cloud test', shortNamePOS: 'Coupon A',
    itemCode: '101003', itemName: 'Fries', qty: 1, grossValue: 100, netPrice: 80,
    couponType: 'Normal', discountValue: 20, fileInfo: { base64: 'ZmlsZQ==', fileName: 'mapping.csv' } }];
  assert.equal((await f.context.PC_API.submitCouponProposal(payload)).status, 'success');
  assert.equal(f.sent.rows[0].codePromotion, 'IC0401');
  assert.match(f.sent.rows[0].attachment, /^file:/);
  assert.deepEqual(Array.from(f.sent.extraWrites, w => w.key).sort(), ['pc_code_counter_v1', 'pc_promo_files']);
  assert.equal(JSON.parse(f.sent.extraWrites.find(w => w.key === 'pc_code_counter_v1').value).types.coupon.cursor, 401);
  assertNoLocalWrite(f);

  f.fail();
  await assert.rejects(() => f.context.PC_API.submitCouponProposal(payload), /Cloud unavailable/);
  assertNoLocalWrite(f);
});
test('Coupon group can target individual items without storing calculated prices',async()=>{
 const f=fixture();const item={...meta,monthYear:'2026-10',campaignName:'Group items',shortNamePOS:'Selected fries',couponGroupMode:true,selectionMode:'ITEM',itemCode:'101001',cateCode:'101',itemName:'Large Fries',qty:1,grossValue:'',netPrice:'',discountValue:10,discountUnit:'CUR',couponType:'Normal'};
 assert.equal((await f.context.PC_API.submitCouponProposal([item,{...item,itemCode:'101003',itemName:'Mega Fries'}])).status,'success');
 for(const row of f.sent.rows){assert.equal(row.couponGroupMode,true);assert.equal(row.gross,'');assert.equal(row.netPrice,'');assert.equal(row.discount,'10฿');}
 assertNoLocalWrite(f);
});

test('Coupon keeps a whole category as one dynamic category reference on Cloud',async()=>{
  const f=fixture();
  await f.context.PC_API.submitCouponProposal([{...meta,monthYear:'2026-10',campaignName:'Category coupon',shortNamePOS:'FRIES',couponType:'Normal',itemCode:'101',cateCode:'101',itemName:'101 - Fries (Entire category)',qty:1,grossValue:100,discountValue:10,netPrice:90}]);
  assert.equal(f.sent.rows.length,1);
  assert.equal(f.sent.rows[0].itemCode,'101');
  assert.equal(f.sent.rows[0].catCode,'101');
  assertNoLocalWrite(f);
});
test('CRM mapping survives Cloud submission, reload and the IT task projection',async()=>{
 const f=fixture(),mapping={customerGroup:'crm',crmMappingRequired:'yes',crmMappingCode:'VD-123',crmMappingDetail:'Set campaign value 50'};
 await f.context.PC_API.submitCouponProposal([{...meta,...mapping,monthYear:'2026-10',campaignName:'CRM Coupon',shortNamePOS:'CRM',couponType:'Normal',itemCode:'101003',itemName:'Fries',qty:1,grossValue:100,discountValue:10,netPrice:90}]);
 assert.equal(f.sent.rows[0].crmMappingCode,'VD-123');
 const store=JSON.parse(f.data.get('pc_mock_store_v28'));store.months['2026-10']=JSON.parse(JSON.stringify(f.sent.rows));f.data.set('pc_mock_store_v28',JSON.stringify(store));f.context.PC_API.reloadFromStorage();
 const task=f.context.PC_API.getITTasks('2026-10').find(r=>r.campaign==='CRM Coupon');assert.equal(task.crmMappingRequired,'yes');assert.equal(task.crmMappingCode,'VD-123');assert.equal(task.crmMappingDetail,mapping.crmMappingDetail);
});

test('Bill Discount commits its code reservation only with the campaign', async () => {
  const f = fixture();
  const payload = { globalMonth: '2026-10', campaigns: [{ ...meta, name: 'Bill cloud test',
    buttons: [{ shortName: 'Bill A', discountValue: 10, discountUnit: 'CUR', items: [] }] }] };
  assert.equal((await f.context.PC_API.submitBillDiscountProposal(payload)).status, 'success');
  assert.equal(f.sent.rows[0].codePromotion, 'BD071');
  assert.deepEqual(Array.from(f.sent.extraWrites, w => w.key), ['pc_code_counter_v1']);
  assertNoLocalWrite(f);
  f.fail();
  await assert.rejects(() => f.context.PC_API.submitBillDiscountProposal(payload), /Cloud unavailable/);
  assertNoLocalWrite(f);
});

test('Voucher requires mapping attachment for Online and stages code and file atomically', async () => {
  const f = fixture();
  const payload = { globalMonth: '2026-10', campaigns: [{ ...meta, name: 'Voucher cloud test',
    buttons: [{ shortName: 'Voucher A', voucherType: 'Online', discountValue: 50,
      discountUnit: 'CUR', fileData: { base64: 'ZmlsZQ==', fileName: 'mapping.csv' }, items: [] }] }] };
  assert.equal((await f.context.PC_API.submitVoucherProposal(payload)).status, 'success');
  assert.equal(f.sent.rows[0].codePromotion, 'VC0901');
  assert.match(f.sent.rows[0].attachment, /^file:/);
  assert.deepEqual(Array.from(f.sent.extraWrites, w => w.key).sort(), ['pc_code_counter_v1', 'pc_promo_files']);
  assertNoLocalWrite(f);
  payload.campaigns[0].buttons[0].fileData = null;
  assert.equal((await f.context.PC_API.submitVoucherProposal(payload)).status, 'error');
  assertNoLocalWrite(f);
});
