const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const counter = () => ({ v: 1, migItemset: 2, types: { promo: {cursor: 100, seeded: true}, itemset: {cursor: 200, seeded: true}, coupon: {cursor: 500, seeded: true} }, cats: {'105': {cursor: 30, seeded: true}, '106': {cursor: 40, seeded: true}, '109': {cursor: 50, seeded: true}}, reservations: {}, log: [] });

test('Item Set Cloud-first save commits before browser cache and leaves no local submission on failure', async () => {
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/form-code-allocation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const original = data.get('pc_mock_store_v28');
  context.PC_CLOUD_FIRST_FORMS = true;
  let sent = null;
  context.PC_CLOUD = {
    async readCloudKey() { return {value: JSON.stringify(counter()), updatedAt: 7}; },
    async savePreparedCampaignRows(rows, batchId, actor) { sent = { rows, batchId, actor }; return { ok: true }; },
    async pull() {},
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cloud item set test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-receipt-001', submissionBatchId: 'itemset-batch-001', submittedBy: 'Bow' }];
  assert.equal(await context.PC_API.saveBulkProposal(item), 'SUCCESS');
  assert.equal(sent.batchId, 'itemset-batch-001');
  assert.equal(sent.rows[0].codePromotion, 'P101');
  assert.equal(sent.rows[0].codeItemSet, '107201');
  assert.equal(sent.rows[0].itemPromotion, '107201');
  assert.equal(sent.rows[0].submissionId, 'itemset-receipt-001');
  assert.equal(data.get('pc_mock_store_v28'), original, 'the campaign must not be saved locally before Cloud commits');

  context.PC_CLOUD.savePreparedCampaignRows = async () => { throw new Error('Cloud unavailable'); };
  await assert.rejects(() => context.PC_API.saveBulkProposal(item), /Cloud unavailable/);
  assert.equal(data.get('pc_mock_store_v28'), original, 'a failed Cloud save must not leave an apparent local success');
});

test('E-Voucher Item Set reserves its coupon code in the same Cloud commit', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = { URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/form-code-allocation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const original = [...data.entries()];
  let sent;
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async readCloudKey(key) {
      assert.equal(key, 'pc_code_counter_v1');
      return { value: JSON.stringify(counter()), updatedAt: 7 };
    },
    async savePreparedCampaignRows(rows, batchId, actor, extraWrites) {
      sent = { rows, batchId, actor, extraWrites };
      return { ok: true };
    },
    async pull() {},
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cloud EV test', shortName: 'EV A', postCate: 'E-Voucher',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-ev-receipt-001', submissionBatchId: 'itemset-ev-batch-001', submittedBy: 'Bow' }];
  assert.equal(await context.PC_API.saveBulkProposal(item), 'SUCCESS');
  assert.equal(sent.rows[0].codePromotion, 'IC0501');
  assert.equal(sent.rows[0].codeItemSet, '109051');
  assert.equal(sent.extraWrites[0].key, 'pc_code_counter_v1');
  assert.equal(sent.extraWrites[0].expectedUpdatedAt, 7);
  assert.deepEqual([...data.entries()], original);
});

test('Cloud receipt stays successful when post-commit browser cache is full', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = { URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout: fn => setImmediate(fn), clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/form-code-allocation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async readCloudKey() { return {value: JSON.stringify(counter()), updatedAt: 7}; },
    async savePreparedCampaignRows() { return { ok: true }; },
    async pull() { context.__PC_PERSIST_FAIL = 'quota'; throw new Error('QuotaExceededError'); },
    enabled() { return true; },
    hasPending() { return true; },
    async syncNow() { throw new Error('legacy pending write'); },
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cache full test', shortName: 'Set A',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-cache-receipt-001', submissionBatchId: 'itemset-cache-batch-001', submittedBy: 'Bow' }];
  const result = await new Promise((resolve, reject) => {
    context.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).saveBulkProposal(item);
  });
  assert.equal(result, 'SUCCESS');
});

for (const [category, itemCode] of [['Promotion set', '107201'], ['Combo', '105031'], ['Value set', '106041'], ['E-Voucher', '109051']]) {
 test(category + ' reserves one pair for every component and retries preserve codes', async () => {
  let shared = counter(), sent, reject = false;
  const cache = new Map();
  const ctx = {URL, Date, Math, console:{log(){},warn(){},error(){}}, setTimeout() {}, clearTimeout() {}, location:{hostname:'localhost'}, PC_REAL_PROMOS:[],
   localStorage:{getItem:k=>cache.get(k)||null, setItem:(k,v)=>cache.set(k,v), removeItem:k=>cache.delete(k)}};
  ctx.window=ctx; vm.createContext(ctx);
  for (const file of ['form-code-allocation.js','mock-backend.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),ctx);
  ctx.PC_CLOUD_FIRST_FORMS=true;
  ctx.PC_CLOUD={async readCloudKey(){return {value:JSON.stringify(shared), updatedAt:7};},
   async savePreparedCampaignRows(rows,batch,actor,extra){
    if(reject) throw Error('Conflict');
    sent=rows; if(extra.length) shared=JSON.parse(extra[0].value); return {ok:true};
   }, async pull(){}};
  const rows=[1,2].map(n=>({monthYear:'2026-10',campaign:'Pair test',shortName:'Button',postCate:category,cateRemark:'Fries',
   itemCode:'10100'+n,qty:1,originalPrice:100,netPrice:80, submissionId:'line-'+n, submissionBatchId:'pair-batch'}));
  if(category!=='Promotion set'){
   const ready=shared.cats[itemCode.slice(0,3)];delete shared.cats[itemCode.slice(0,3)];
   await assert.rejects(()=>ctx.PC_API.saveBulkProposal(rows),/ยังไม่พร้อม/);
   assert.equal(sent,undefined,'missing category must not submit an incomplete pair');
   shared.cats[itemCode.slice(0,3)]=ready;
  }
  const before=JSON.stringify(shared), localBefore=[...cache]; reject=true;
  await assert.rejects(()=>ctx.PC_API.saveBulkProposal(rows),/Conflict/);
  assert.equal(JSON.stringify(shared),before);assert.deepEqual([...cache],localBefore);
  reject=false;await ctx.PC_API.saveBulkProposal(rows);
  assert.equal(sent.length,2);
  for(const row of sent){assert.equal(row.codeItemSet,itemCode);assert.equal(row.itemPromotion,itemCode);assert.equal(row.codePromotion,category==='E-Voucher'?'IC0501':'P101');}
  assert.equal(Object.keys(shared.reservations).length,2);
  const itemReservation=Object.values(shared.reservations).find(r=>r.code===itemCode);
  assert.equal(itemReservation.field,'itccf-'+(category==='Promotion set'?'itemset':'item-'+itemCode.slice(0,3))+'-'+encodeURIComponent(JSON.stringify(['Pair test','Button','2026-10'])));
  const committed=JSON.stringify(shared);
  await ctx.PC_API.saveBulkProposal(rows);assert.equal(JSON.stringify(shared),committed);
  cache.set('pc_mock_store_v28',JSON.stringify({months:{'2026-10':sent}}));
  ctx.PC_API.reloadFromStorage();
  const tasks=ctx.PC_API.getITTasks('2026-10');
  assert.equal(tasks.length,2);
  for(const task of tasks){assert.equal(task.builderCode,itemCode);assert.equal(task.itemPromo,itemCode);assert.equal(task.postCate,category);}
  assert.equal(ctx.PC_API.getItemSetButtons().find(b=>b.campaign==='Pair test').cateRemark,category);
  const tracked=ctx.PC_API.getAllCampaignData().filter(r=>r.campaign==='Pair test');
  assert.equal(tracked[0].codeItemSet,itemCode);
  assert.equal(tracked[0].codePromotion,category==='E-Voucher'?'IC0501':'P101');
  cache.set('pc_code_counter_v1',JSON.stringify(shared));
  ctx.document={addEventListener(){},querySelectorAll(){return [];}};ctx.setInterval=()=>{};ctx.clearInterval=()=>{};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/code-counter.js'),'utf8'),ctx);
  const claimed=ctx.PC_COUNTER.claimExact(itemReservation.type,itemCode,{where:'Pair test',field:itemReservation.field,cat:itemReservation.cat});
  assert.equal(claimed.ok,true,'IT confirms the original form reservation');
  assert.equal(ctx.PC_API.getPosConfirmedCode('Pair test','Button'),itemCode);
  const confirmed=JSON.parse(cache.get('pc_code_counter_v1'));
  assert.equal(Object.values(confirmed.reservations).filter(r=>r.where==='Pair test').length,2);
 });
}

test('Item Coupon in Item Set reserves IC only and retains per-button CRM mapping', async () => {
  const data = new Map([['pc_userName', 'Bow'], ['pc_mock_store_v28', JSON.stringify({
    months: { '2026-10': [] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1,
    _billDiscVer: 4, _vcCouponVer: 2, _proJulyVer: 2,
  })]]);
  const context = { URL, Date, Math, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, location: { hostname: 'localhost' }, PC_REAL_PROMOS: [] };
  context.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/form-code-allocation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/mock-backend.js'), 'utf8'), context);
  const original = [...data.entries()];
  let sent;
  context.PC_CLOUD_FIRST_FORMS = true;
  context.PC_CLOUD = {
    async readCloudKey(key) {
      assert.equal(key, 'pc_code_counter_v1');
      return { value: JSON.stringify(counter()), updatedAt: 7 };
    },
    async savePreparedCampaignRows(rows, batchId, actor, extraWrites) {
      sent = { rows, batchId, actor, extraWrites };
      return { ok: true };
    },
    async pull() {},
  };
  const item = [{ monthYear: '2026-10', campaign: 'Cloud EV test', shortName: 'EV A', postCate: 'Promotion set', typePromotion:'Item Coupon', customerGroup:'crm', crmMappingRequired:'yes', crmMappingCode:'VD-ONE',
    itemCode: '101003', itemNameEN: 'Fries', originalPrice: 100, netPrice: 80, qty: 1,
    submissionId: 'itemset-ev-receipt-001', submissionBatchId: 'itemset-ev-batch-001', submittedBy: 'Bow' }];
  assert.equal(await context.PC_API.saveBulkProposal(item), 'SUCCESS');
  assert.equal(sent.rows[0].codePromotion, 'IC0501');
  assert.equal(sent.rows[0].codeItemSet, '');
  assert.equal(sent.rows[0].typePromotion,'Item Coupon');
  assert.equal(sent.rows[0].crmMappingCode,'VD-ONE');
  assert.equal(Object.keys(JSON.parse(sent.extraWrites[0].value).reservations).length,1);
  assert.equal(sent.extraWrites[0].key, 'pc_code_counter_v1');
  assert.equal(sent.extraWrites[0].expectedUpdatedAt, 7);
  assert.deepEqual([...data.entries()], original);
});
