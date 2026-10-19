const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const camp = 'Grab test', sn = 'Grab-MGลดแรง5[159]';
  const field = 'itccf-itemset-' + encodeURIComponent(JSON.stringify([camp, sn, '2026-10']));
  const old = { code: '1073604', type: 'itemset', num: 3604, where: camp, field, status: 'CONFIRMED' };
  const released = { code: '1073605', type: 'itemset', num: 3605, where: camp, field: 'old-other-button', status: 'RELEASED' };
  const data = new Map([
    ['pc_code_counter_v1', JSON.stringify({ v: 1, migItemset: 2, types: { itemset: { cursor: 3609, seeded: true } }, reservations: { 'itemset::1073604': old, 'itemset::1073605': released }, log: [] })],
    ['pc_mock_store_v28', JSON.stringify({ months: { '2026-10': [{ campaign: camp, shortName: sn, month: '2026-10', typePromotion: 'Item Set', codeItemSet: '1073604', itemPromotion: '1073604', itemCode: '101003', itStatus: 'PENDING', posReady: true }] }, _itemSetDemoVer: 1, _showcaseVer: 1, _recipeCustomVer: 1 })]
  ]);
  const ctx = { URL, Date, Math, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    console: { log() {}, warn() {}, error() {} }, location: { hostname: 'localhost' },
    PC_REAL_PROMOS: [], document: { addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k), key: i => [...data.keys()][i], get length() { return data.size; } }
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const file of ['js/mock-backend.js', 'js/code-counter.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return { ctx, data, camp, sn, field };
}

test('real IT counter confirms an explicitly reclaimed unused code and Builder receives it', () => {
  const { ctx, camp, sn, field } = setup();
  assert.equal(ctx.PC_API.clearPosButtonCode(camp,sn).status,'success');
  assert.equal(ctx.PC_COUNTER.claimExact('itemset','1073605',{where:camp,field}).ok,false);
  assert.equal(ctx.PC_COUNTER.claimExact('itemset','1073605',{where:camp,field,allowReleased:true}).ok,true);
  assert.equal(ctx.PC_API.getPosConfirmedCode(camp,sn),'1073605');
  assert.equal(ctx.PC_API.savePosButton(camp,sn,'1073605').status,'success');
  assert.equal(ctx.PC_API.getITTasks('2026-10').find(t=>t.campaign===camp).builderCode,'1073605');
});

test('counter lookup uses latest stored confirmation instead of its stale in-memory code', () => {
  const { ctx, data, camp, sn, field } = setup();
  const saved = JSON.parse(data.get('pc_code_counter_v1'));
  for (const e of Object.values(saved.reservations)) if(e.code==='1073604')e.status='RELEASED';
  saved.reservations['itemset::1073605'] = { code:'1073605', type:'itemset', num:3605, where:camp,field,status:'CONFIRMED' };
  data.set('pc_code_counter_v1',JSON.stringify(saved));
  assert.equal(ctx.PC_API.getPosConfirmedCode(camp,sn),'1073605');
});

test('explicit reclaim still rejects a released code present in Product Master', () => {
  const { ctx, data, camp, field } = setup();
  const saved = JSON.parse(data.get('pc_mock_store_v28'));
  saved.npdProducts = [{itemCode:'1073605',itemNameEN:'Existing set',cateCode:'107'}];
  data.set('pc_mock_store_v28',JSON.stringify(saved));
  ctx.PC_API.reloadFromStorage();
  assert.equal(ctx.PC_COUNTER.claimExact('itemset','1073605',{where:camp,field,allowReleased:true}).ok,false);
});

test('IT confirmation updates the existing Builder code immediately and reports success only after Cloud acknowledgment', async () => {
  for (const offline of [false,true]) {
    const {ctx,data,camp,sn,field} = setup();
    const attrs = {'data-it-cate':'107','data-it-confirmed':'0'};
    const messages = [];
    const input = {value:'1073605',id:field,getAttribute:k=>attrs[k]||'',setAttribute:(k,v)=>{attrs[k]=v;},classList:{add(){},remove(){}},closest:()=>({querySelector:()=>({})})};
    const card = {getAttribute:k=>k==='data-campaign'?camp:'2026-10'};
    const trAttrs = {'data-short-name':sn,'data-builder-code':'1073604','data-pos-ready':'1'};
    const tr = {closest:()=>card,querySelector:()=>input,getAttribute:k=>trAttrs[k]||'',setAttribute:(k,v)=>{trAttrs[k]=v;}};
    const button = {disabled:false,closest:()=>tr};
    ctx.itEsc = String;
    ctx.Swal = {async fire(...args){messages.push(args);return {isConfirmed:true};}};
    ctx.PC_CLOUD = {async syncNow(){if(offline)throw Error('offline');},async readCloudKey(){return {value:data.get('pc_code_counter_v1')};}};
    const page = fs.readFileSync('pages/IT_Settlement.html','utf8');
    vm.runInContext(page.slice(page.indexOf('  window.itConfirmItemSetCode ='),page.indexOf('  window.renderGroupedTasks =')),ctx);
    await ctx.itConfirmItemSetCode(button);
    assert.equal(attrs['data-it-confirmed'],offline?'0':'1');
    assert.equal(messages.some(args=>args[0]?.icon==='success'),!offline);
    assert.equal(button.disabled,false);
    if(!offline){
      assert.equal(ctx.PC_API.getPosConfirmedCode(camp,sn),'1073605');
      assert.equal(ctx.PC_API.getItemSetButtons().find(b=>b.campaign===camp).codeItemSet,'1073605');
      assert.equal(ctx.PC_API.getItemSetButtons().find(b=>b.campaign===camp).posReady,false,'changing a code must not claim POS review is complete');
      assert.equal(ctx.PC_API.getITTasks('2026-10').find(b=>b.campaign===camp).builderCode,'1073605');
      assert.equal(trAttrs['data-builder-code'],'1073605');
    }
  }
});

test('applying IT confirmation cannot overwrite an unrelated month or an unconfirmed code', () => {
  const {ctx,data,camp,sn,field}=setup();
  ctx.PC_COUNTER.claimExact('itemset','1073610',{where:camp,field});
  const before=data.get('pc_mock_store_v28');
  assert.equal(ctx.PC_API.applyConfirmedItemSetCode(camp,sn,'2026-09','1073610').status,'error');
  assert.equal(ctx.PC_API.applyConfirmedItemSetCode(camp,sn,'2026-10','1073605').status,'error');
  assert.equal(data.get('pc_mock_store_v28'),before);
});

test('receiving code reads Cloud confirmation and never falls back to a stale cached code', async () => {
  const { ctx, data, camp, sn, field } = setup();
  const cloud = JSON.parse(data.get('pc_code_counter_v1'));
  cloud.reservations['itemset::1073604'].status = 'RELEASED';
  cloud.reservations['itemset::1073605'] = {code:'1073605',type:'itemset',num:3605,where:camp,field,status:'CONFIRMED'};
  ctx.PC_CLOUD = { async syncNow() {}, async readCloudKey() { return {value:JSON.stringify(cloud)}; } };
  ctx.posSel = {camp,sn}; ctx.store = {reuse:{}};
  ctx.itemSetButtons = () => ctx.PC_API.getItemSetButtons();
  ctx.itemsetCounter = () => ctx.PC_COUNTER;
  ctx.itemsetCateFor = () => '107';
  ctx.posBuildTree = ctx.posRender = ctx.recRender = () => {};
  ctx.esc = String; ctx.Swal = {close() {},fire() { return Promise.resolve({isConfirmed:true}); }};
  const page = fs.readFileSync('pages/ItemSet.html','utf8');
  const start = page.indexOf('  function itemsetConfirmedFor(');
  const end = page.indexOf('  function posAutoCode()',start);
  vm.runInContext(page.slice(start,end),ctx);
  await ctx.posPullCode();
  assert.equal(ctx.PC_API.getItemSetButtons().find(b=>b.campaign===camp).codeItemSet,'1073605');
  ctx.PC_CLOUD.readCloudKey = async () => {throw Error('offline');};
  await ctx.posPullCode();
  assert.equal(ctx.PC_API.getItemSetButtons().find(b=>b.campaign===camp).codeItemSet,'1073605');
});
