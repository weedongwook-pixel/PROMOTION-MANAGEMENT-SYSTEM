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
    return Response.json(url==='/email/copro'?{items:[{id:'c',key:'promo::c::Pilot',month:'2026-10',buttons}]}:{saved:true});
  }};
  vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);
  await w.PC_CoProEmail.saveIT('2026-10',buttons.map((b,i)=>({campaign:'Pilot',emailCampaignId:'c',emailButtonId:b.button_id,emailRowId:'r'+i,shortName:'Same',promoCode:'IC00'+i,itemPromo:'',kitchenName:'Kitchen '+i,promoType:'Item Coupon'})));
  const saves=calls.filter(c=>c.url.endsWith('/it'));assert.equal(saves.length,2);assert.deepEqual(saves.map(s=>s.body.buttonId),['b1','b2']);assert.equal(saves[1].body.updates[0].kitchenName,'Kitchen 1');
});
