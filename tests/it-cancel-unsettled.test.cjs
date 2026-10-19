const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(extra=[],patch={}){
  const row={campaign:'New campaign',shortName:'Set A',month:'2026-10',typePromotion:'Item Set',itStatus:'PENDING',opStatus:'WAITING',posReady:true,codePromotion:'P9001',codeItemSet:'1079001',itemPromotion:'1079001',itemCode:'101003',...patch};
  const data=new Map([['pc_mock_store_v28',JSON.stringify({months:{'2026-10':[row,...extra]},_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1})]]);
  const reservations={};for(const [type,code] of [['promo','P9001'],['itemset','1079001']])reservations[type+'::'+code]={type,code,num:9001,status:'CONFIRMED',where:'New campaign',field:'itccf-'+encodeURIComponent(JSON.stringify(['New campaign','Set A','2026-10']))};
  data.set('pc_code_counter_v1',JSON.stringify({v:1,migItemset:2,types:{},reservations,log:[]}));
  let fail=false;
  const c={Date,Math,URL,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},console:{log(){},error(){},warn(){}},location:{hostname:'localhost'},PC_REAL_PROMOS:[],document:{addEventListener(){},querySelectorAll(){return[];}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>{if(typeof fail==='function'?fail(k):fail)throw Error('QuotaExceededError');data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}}};
  c.window=c;vm.createContext(c);for(const f of ['js/mock-backend.js','js/code-counter.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
  return {c,data,row,fail:v=>{fail=v;}};
}
test('confirmed codes and Builder-ready do not mean IT Settlement was saved; both unused codes return',()=>{
  const {c}=setup();assert.equal(typeof c.PC_API.getITCancellationPolicy,'function');
  const p=c.PC_API.getITCancellationPolicy('New campaign','2026-10');assert.equal(p.canCancel,true);assert.equal(p.returnable.length,2);
  const r=c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10');assert.equal(r.status,'success');assert.equal(r.returned.length,2);
  assert.equal(c.PC_API.getITTasks('ALL').some(x=>x.campaign==='New campaign'),false);
  assert.equal(c.PC_COUNTER.entryOf('P9001'),null);assert.equal(c.PC_COUNTER.entryOf('1079001'),null);
  assert.equal(c.PC_API.listTrash()[0].rowCount,1);
});
test('past settlement saves, prior rejection and completed jobs block refunds despite current pending status',()=>{
  for(const patch of [{itDoneDate:'2026-10-01'},{itSettlementSavedAt:'2026-10-01T10:00:00Z'},{rejectCount:1},{itStatus:'COMPLETE'},{wentLive:true}]){
    const {c}=setup([],patch);assert.equal(typeof c.PC_API.getITCancellationPolicy,'function');
    assert.equal(c.PC_API.getITCancellationPolicy('New campaign','2026-10').canCancel,false);
    assert.equal(c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10').status,'error');
    assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');
  }
});
test('cancelling an unsaved campaign removes every month and clears duplicate checks while retaining shared codes',()=>{
  const other={campaign:'Other campaign',shortName:'Other',itStatus:'COMPLETE',codePromotion:'P9001',itemCode:'108009'};
  const {c,data,row}=setup([other]);assert.equal(typeof c.PC_API.cancelUnsettledITCampaign,'function');
  const saved=JSON.parse(data.get('pc_mock_store_v28'));saved.months['2026-11']=[{...row,month:'2026-11',shortName:'November',codePromotion:'P9999',codeItemSet:'1079999',itemPromotion:'1079999'}];data.set('pc_mock_store_v28',JSON.stringify(saved));c.PC_API.reloadFromStorage();
  const r=c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10');assert.equal(r.status,'success');
  assert.ok(r.kept.includes('P9001'));assert.ok(r.returned.includes('1079001'));
  assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');
  assert.equal(c.PC_API.getAllCampaignData().some(x=>x.shortName==='November'),false);
  assert.equal(c.PC_API.checkCampaignName('New campaign'),false);
  assert.equal(c.PC_API.checkShortNameDuplicateInSheet('November'),false);
  assert.equal(c.PC_API.listTrash()[0].rowCount,2);
  assert.ok(c.PC_API.getAllCampaignData().some(x=>x.campaign==='Other campaign'));
});
test('a saved button in another month blocks whole-campaign cancellation and all refunds',()=>{
  const {c,data,row}=setup();const saved=JSON.parse(data.get('pc_mock_store_v28'));
  saved.months['2027-01']=[{...row,itSettlementSavedAt:'2026-10-19T00:00:00Z'}];data.set('pc_mock_store_v28',JSON.stringify(saved));c.PC_API.reloadFromStorage();
  assert.equal(c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10').status,'error');
  assert.equal(c.PC_API.checkCampaignName('New campaign'),true);assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');
});
test('failed persistence cannot return codes or remove the local pending job',()=>{
  const {c,fail}=setup();assert.equal(typeof c.PC_API.cancelUnsettledITCampaign,'function');fail(true);
  assert.equal(c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10').status,'error');
  assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');assert.ok(c.PC_API.getITTasks('ALL').some(x=>x.campaign==='New campaign'));
});
test('a counter write failure rolls back cancellation and never reports refunded codes',()=>{
  const {c,fail}=setup();let writes=0;fail(k=>k==='pc_code_counter_v1'&&++writes===2);
  const res=c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10');
  assert.equal(res.status,'error');assert.ok(c.PC_API.getITTasks('ALL').some(x=>x.campaign==='New campaign'));
  assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');assert.equal(c.PC_COUNTER.entryOf('1079001').status,'CONFIRMED');
});
test('Backoffice and recipe-master references retain codes even when this pending job never saved',()=>{
  const {c,data}=setup();c.PC_PROMO_CODES=[{code:'P9001'}];
  const saved=JSON.parse(data.get('pc_mock_store_v28'));saved.recipeCustom={'1079001':{modes:{}}};data.set('pc_mock_store_v28',JSON.stringify(saved));c.PC_API.reloadFromStorage();
  const policy=c.PC_API.getITCancellationPolicy('New campaign','2026-10');assert.equal(policy.canCancel,true);assert.equal(policy.returnable.length,0);
  assert.ok(policy.kept.includes('P9001'));assert.ok(policy.kept.includes('1079001'));
});
test('legacy composition and promotion code references prevent refunds',()=>{
  const {c,data}=setup();
  data.set('pc_itemset_comp',JSON.stringify({'1079999':[{code:'1079001',min:1,max:1}]}));
  data.set('pc_product_promo',JSON.stringify({'108123':[{code:'P9001'}]}));
  assert.equal(c.PC_API.getITCancellationPolicy('New campaign','2026-10').returnable.length,0);
});
test('member coupons and co-promotion references prevent cancellation from returning a shared code',()=>{
 const {c,data}=setup();
 data.set('pc_member_coupons',JSON.stringify({card:[{code:'P9001'}]}));
 data.set('pc_co_promotions',JSON.stringify([{codePromotion:'1079001'}]));
 const res=c.PC_API.cancelUnsettledITCampaign('New campaign','2026-10');
 assert.equal(res.status,'success');assert.equal(res.returned.length,0);assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');
});
test('pending IT cancellation offers only delete-and-return or go back',async()=>{
  const {c,data}=setup();let removed=false,dialogs=[];c.document.getElementById=()=>null;
  c.itEsc=String;c.itCardOf=()=>({remove(){removed=true;}});c.Swal={fire(opts){dialogs.push(opts);return Promise.resolve({isConfirmed:false});}};
  const page=fs.readFileSync('pages/IT_Settlement.html','utf8');
  vm.runInContext(page.slice(page.indexOf('  window.deleteCampaign ='),page.indexOf('  window.extendCampaignPopup =')),c);
  const before=data.get('pc_mock_store_v28');await c.deleteCampaign('New campaign','2026-10');
  assert.equal(dialogs[0].showDenyButton,false);assert.equal(removed,false);assert.equal(data.get('pc_mock_store_v28'),before);assert.equal(c.PC_COUNTER.entryOf('P9001').status,'CONFIRMED');
});
test('confirming pending IT cancellation deletes the job and returns both codes before success',async()=>{
  const {c}=setup();const dialogs=[];let reloads=0;
  c.itEsc=String;c.itCardOf=()=>({dataset:{}});c.loadITTasks=()=>reloads++;
  c.Swal={showLoading(){},fire(opts){dialogs.push(opts);return Promise.resolve({isConfirmed:true});}};
  c.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},cancelUnsettledITCampaign(name,month){this.ok(c.PC_API.cancelUnsettledITCampaign(name,month));}}}};
  const page=fs.readFileSync('pages/IT_Settlement.html','utf8');
  vm.runInContext(page.slice(page.indexOf('  window.deleteCampaign ='),page.indexOf('  window.extendCampaignPopup =')),c);
  await c.deleteCampaign('New campaign','2026-10');
  assert.equal(c.PC_API.checkCampaignName('New campaign'),false);
  assert.equal(c.PC_COUNTER.entryOf('P9001'),null);assert.equal(c.PC_COUNTER.entryOf('1079001'),null);
  assert.equal(dialogs.at(-1).icon,'success');assert.equal(reloads,1);
});
