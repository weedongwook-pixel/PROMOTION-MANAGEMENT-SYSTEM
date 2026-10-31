const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Browser side: every lifecycle / edit mail is optional (reply / new / none) and IT replies follow a durable IT save.
// The choice of loop, recipients and preview moved to the send-mail page (js/send-mail.js); here only the hand-off.
function ui(send,calls,enabled=true){
 const window={PC_CoProEmail:{capabilities:async()=>({coproEnabled:enabled,authMode:'staff'}),request:async()=>{calls.push('request');}},
  PC_SendMail:{ask:async()=>{calls.push('ask');return send;},decline:async job=>calls.push('decline:'+job.kind+':'+job.changeId),open:async jobs=>{calls.push('page:'+jobs[0].kind+':'+jobs[0].changeId);return {mailPage:true};}}};
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),{window,Swal:{fire:async()=>({})}});return window.PC_CoProEmailUI;
}
test('lifecycle mail: no records not sent, yes opens the send-mail page, no email service skips the question',async()=>{
 let calls=[];assert.equal((await ui(false,calls).notifyChange({campaign:'Test promo',changeId:'chg-test-0001',changeStatus:'CANCELLED'})).mailStatus,'not_sent');
 assert.deepEqual([...calls],['ask','decline:change:chg-test-0001']);
 calls=[];assert.equal((await ui(true,calls).notifyChange({campaign:'Test promo',changeId:'chg-test-0002',changeStatus:'EXTENDED'})).mailStatus,'page');
 assert.deepEqual([...calls],['ask','page:change:chg-test-0002']);
 calls=[];assert.equal((await ui(true,calls,false).notifyChange({campaign:'Test promo',changeId:'chg-test-0004',changeStatus:'EXTENDED'})).mailStatus,'unavailable');assert.equal(calls.length,0);
});
function client(rows,saves){
 const calls=[],w={PC_EmailAuth:{acquireToken:async()=> 'verified'},PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify(rows)}),enabled:()=>true,hasPending:()=>true,syncNow:async()=>calls.push('sync')},
  PC_API:{getCoPromotions:async()=>[],confirmErpInterface:async()=>{},saveSettlementBatch:async(month,updates)=>{saves.push(updates);return saves.result||'SUCCESS';},itRemoveCancelled:(campaign,month)=>({status:'success',rows:1}),itKeepCancelled:()=>({status:'error'})}};
 const c={window:w,document:{getElementById:()=>null},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},AbortSignal,fetch:async(url,options)=>{calls.push(url+(options?.body?' '+options.body:''));return Response.json(url==='/email/capabilities'?{coproEnabled:true,scope:'test'}:{items:[{mailStatus:'queued'}]});}};
 vm.runInNewContext(fs.readFileSync('js/copro-email-client.js','utf8'),c);return {w,calls};
}
test('ordinary IT save asks the server for an IT reply only after the save and Cloud acknowledgement',async()=>{
 const saves=[],{w,calls}=client([],saves);
 assert.equal(await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'Ordinary promo',month:'2026-10'},{campaign:'Ordinary promo',month:'2026-10'}]),'SUCCESS');
 const it=calls.filter(c=>c.includes('/email/copro/it-done'));assert.equal(it.length,1,'one request per campaign month');
 assert.ok(calls.indexOf('sync')<calls.indexOf(it[0]));assert.match(it[0],/"campaignKey":"promo::c::Ordinary%20promo","month":"2026-10"/);
 saves.result='STORAGE_ERROR';calls.length=0;await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'Ordinary promo'}]);assert.equal(calls.some(c=>c.includes('it-done')),false);
});
test('IT date-change close of a mailed CoPromo uses the ordinary save and replies via it_done; cancel close replies too',async()=>{
 const saves=[],{w,calls}=client([{campaign:'CoPromo promo',emailIntake:true,emailPending:false}],saves);
 assert.equal(await w.PC_API.saveSettlementBatch('2026-10',[{campaign:'CoPromo promo',month:'2026-10',changeOnly:true}]),'SUCCESS');
 assert.equal(saves.length,1);assert.equal(calls.some(c=>/\/email\/copro\/[^/]+\/it /.test(c)),false);assert.ok(calls.some(c=>c.includes('/email/copro/it-done')));
 calls.length=0;assert.equal((await w.PC_API.itRemoveCancelled('Cancelled promo','2026-11',[],[])).status,'success');
 assert.ok(calls.some(c=>c.includes('it-done')&&c.includes('"month":"2026-11"')));
 calls.length=0;await w.PC_API.itKeepCancelled('Cancelled promo','2026-11','',[]);assert.equal(calls.some(c=>c.includes('it-done')),false);
});
test('extend / shorten / cancel stamp one change id, keep the old end date and no longer claim a mail was sent',()=>{
 const campaign='Goodie Oct 26',data=new Map([['pc_mock_store_v28',JSON.stringify({months:{'2026-10':[{campaign,shortName:'Deal A',codePromotion:'P1000',itemCode:'101003',end:'2026-10-10',opStatus:'CONFIRMED'},{campaign,shortName:'Deal B',codePromotion:'P1001',itemCode:'101004',end:'2026-10-10',opStatus:'CONFIRMED'}]},_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1})]]);
 const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]||null,get length(){return data.size;}};
 const sandbox={localStorage,console:{log(){},warn(){},error(){}},setTimeout(){},clearTimeout(){},location:{href:'http://test/'},URL,Date,Math};sandbox.window=sandbox;sandbox.PC_REAL_PROMOS=[];
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/mock-backend.js'),'utf8'),sandbox);const api=sandbox.PC_API;
 const rows=()=>JSON.parse(data.get('pc_mock_store_v28')).months['2026-10'];
 const extended=api.extendCampaign(campaign,'2026-10-31','');assert.match(extended.changeId,/^chg-[A-Za-z0-9-]{8,80}$/);assert.equal(extended.changeStatus,'EXTENDED');assert.doesNotMatch(extended.message,/ส่งเมล/);
 assert.ok(rows().every(r=>r.changeId===extended.changeId&&r.changePreviousEnd==='2026-10-10'&&r.end==='2026-10-31'));
 const reduced=api.extendButtons(campaign,['Deal A'],'2026-10-20','');assert.equal(reduced.changeStatus,'REDUCED');assert.notEqual(reduced.changeId,extended.changeId);
 assert.equal(rows().find(r=>r.shortName==='Deal A').changePreviousEnd,'2026-10-31');assert.equal(rows().find(r=>r.shortName==='Deal B').changeId,extended.changeId);
 const cancelled=api.cancelCampaign(campaign,'Stock out');assert.equal(cancelled.changeStatus,'CANCELLED');assert.doesNotMatch(cancelled.message,/ส่งเมล/);
 assert.ok(rows().every(r=>r.changeId===cancelled.changeId&&r.changeStatus==='CANCELLED'&&r.changePreviousEnd===undefined));
 const page=fs.readFileSync('js/campaign-tracking.js','utf8');assert.doesNotMatch(page,/ยืนยันและส่งเมล|ยืนยันยกเลิกและส่งเมล|กำลังดำเนินการและส่ง Email|จะส่งเมลแจ้ง MKT อัตโนมัติ/);
 assert.equal((page.match(/ctAfterChangeSaved\(res/g)||[]).length,4,'campaign, resumed, per-button and cancel saves all offer the optional mail');
});
