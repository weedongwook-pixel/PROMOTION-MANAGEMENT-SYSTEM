const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('pilot is opt-in and disabled capability never sends; explicit verification enables protected requests',async()=>{
  const store=new Map(),calls=[];let enabled=false;
  const w={PC_EmailAuth:{acquireToken:async()=> 'verified'},PC_CLOUD:{pull:async()=>{}}};
  const c={window:w,sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:async(url,opts)=>{calls.push({url,opts});if(url==='/email/capabilities')return Response.json({coproEnabled:enabled,scope:'api://test/access_as_user'});return Response.json({items:[]});},AbortSignal,URL,console};
  vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
  assert.equal(w.PC_CoProEmail.active(),false);assert.equal(calls.length,0);
  await assert.rejects(w.PC_CoProEmail.enable());enabled=true;await w.PC_CoProEmail.enable();assert.equal(w.PC_CoProEmail.active(),true);
  assert.equal(calls.at(-1).opts.headers.Authorization,'Bearer verified');w.PC_CoProEmail.disable();assert.equal(w.PC_CoProEmail.active(),false);
});
test('IT uses protected button IDs even when names match and forwards full settlement fields',async()=>{
  const calls=[],buttons=['b1','b2'].map(id=>({button_id:id,version:1,source_identity_json:JSON.stringify({shortName:'Same'})}));
  const w={PC_EmailAuth:{acquireToken:async()=> 'verified'},PC_CLOUD:{pull:async()=>{}}};
  const c={window:w,sessionStorage:{getItem:()=> 'on'},AbortSignal,console,fetch:async(url,opts)=>{
    calls.push({url,body:opts.body&&JSON.parse(opts.body)});
    if(url==='/email/capabilities')return Response.json({coproEnabled:true,scope:'test'});
    return Response.json(url==='/email/copro'?{items:[{id:'c',key:'promo::c::Pilot',month:'2026-10',buttons,records:[{}]}]}:{saved:true});
  }};
  vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
  await w.PC_CoProEmail.saveIT('2026-10',buttons.map((b,i)=>({campaign:'Pilot',emailCampaignId:'c',emailButtonId:b.button_id,emailRowId:'r'+i,shortName:'Same',promoCode:'IC00'+i,itemPromo:'',kitchenName:'Kitchen '+i,promoType:'Item Coupon'})));
  const saves=calls.filter(c=>c.url.endsWith('/it'));assert.equal(saves.length,2);assert.deepEqual(saves.map(s=>s.body.buttonId),['b1','b2']);assert.equal(saves[1].body.updates[0].kitchenName,'Kitchen 1');
});

test('production-ready submission establishes verified email context without a separate pilot switch',async()=>{
 const store=new Map(),calls=[];let production=false;
 const w={PC_EmailAuth:{acquireToken:async()=>{calls.push('verify');return 'verified';}}};
 const c={window:w,sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},AbortSignal,fetch:async url=>Response.json(url==='/email/capabilities'?{coproEnabled:true,sendingEnabled:production,scope:'test'}:{items:[]})};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
 assert.equal(await w.PC_CoProEmail.prepareSubmission(),false);assert.equal(calls.length,0);
 production=true;assert.equal(await w.PC_CoProEmail.prepareSubmission(),true);assert.equal(w.PC_CoProEmail.active(),true);assert.equal(calls.length,1);
});

test('email setup or permission failure does not prevent ordinary promotion submission',async()=>{
 const w={PC_EmailAuth:{acquireToken:async()=>{throw Error('denied');}}};
 const c={window:w,sessionStorage:{getItem:()=>null},AbortSignal,fetch:async()=>Response.json({coproEnabled:true,sendingEnabled:true,scope:'test'})};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
 assert.equal(await w.PC_CoProEmail.prepareSubmission(),false);assert.equal(w.PC_CoProEmail.active(),false);
});

test('successful CoPromo IT close opens Interface; ordinary and failed work retain existing flow',async()=>{
 const navigations=[];let rows=[],result='SUCCESS';
 const w={loadPage:page=>navigations.push(page),PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify(rows)})},PC_API:{getCoPromotions:async()=>[],confirmErpInterface:async()=>{},saveSettlementBatch:async()=>result}};
 const c={window:w,document:{getElementById:()=>null},sessionStorage:{getItem:()=>null},AbortSignal,fetch:async()=>{throw Error('ordinary work must not call email');}};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
 await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'Ordinary'}]);assert.equal(w.PC_CoProEmail.afterITClosed('Ordinary'),false);
 rows=[{campaign:'CoPromo'}];await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'CoPromo'}]);assert.equal(w.PC_CoProEmail.afterITClosed('CoPromo'),true);assert.deepEqual(navigations,['InterfaceERP']);assert.equal(w.PC_CoProEmail.afterITClosed('CoPromo'),false);
 result='STORAGE_ERROR';await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'CoPromo'}]);assert.equal(w.PC_CoProEmail.afterITClosed('CoPromo'),false);
});

test('new tab must verify email context before closing a mailed CoPromo task',async()=>{
 const session=new Map(),calls=[];
 const w={PC_EmailAuth:{acquireToken:async()=>{throw Error('sender session expired');}},PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify([{campaign:'CoPromo',emailIntake:true,emailPending:false}])})},PC_API:{getCoPromotions:async()=>[],saveSettlementBatch:async()=>{calls.push('ordinary save');return 'SUCCESS';}}};
 const c={window:w,sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},AbortSignal,fetch:async()=>Response.json({coproEnabled:true,sendingEnabled:true})};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
 await assert.rejects(w.PC_API.saveSettlementBatch('2026-10',[{campaign:'CoPromo'}]),/expired/);assert.deepEqual(calls,[]);
});
test('mailed CoPromo retains current shared accounting edits without replacing protected Interface identity',async()=>{
 const shared={id:'intake',campaign:'Test',emailIntake:true,emailPending:false,emailButtonId:'button',brand:'New partner',updatedBy:'Editor',updatedAt:'2026-10-23T00:00:00Z',interfaceSetup:0};
 const w={PC_EmailAuth:{acquireToken:async()=> 'verified'},PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify([shared])})},PC_API:{getCoPromotions:async()=>[]}};
 const c={window:w,sessionStorage:{getItem:()=> 'on'},AbortSignal,fetch:async url=>Response.json(url==='/email/capabilities'?{coproEnabled:true}:{items:[{records:[{id:'protected',campaign:'Test',emailButtonId:'button',emailCampaignId:'campaign',emailVersion:2,interfaceSetup:1,brand:'Old partner'}]}]})};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
 const rows=await w.PC_API.getCoPromotions();assert.equal(rows.length,1);assert.equal(rows[0].brand,'New partner');assert.equal(rows[0].id,'protected');assert.equal(rows[0].accountingId,'intake');assert.equal(rows[0].interfaceSetup,1);assert.equal(rows[0].updatedBy,'Editor');
});
