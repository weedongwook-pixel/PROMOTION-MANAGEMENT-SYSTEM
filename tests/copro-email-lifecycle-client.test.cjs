const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Browser side: every lifecycle / edit mail is optional (reply / new / none) and IT replies follow a durable IT save.
function ui(answers,requests,decisions,enabled=true){
 const window={PC_CLOUD:{saveMailDecision:async(...args)=>decisions.push(args)},PC_CoProEmail:{
  capabilities:async()=>({coproEnabled:enabled,authMode:'staff'}),
  list:async()=>[{id:'campaign-1',key:'promo::c::Test%20promo',month:'2026-10'}],
  request:async(pathname,options={})=>{requests.push({path:pathname,body:options.body});if(pathname.endsWith('/preview'))return {previewHash:'hash-1',subject:'Loop subject',recipients:{to:['team@example.net'],cc:[]},text:'แจ้งขยายระยะเวลาโปรโมชั่น',newMessage:Boolean(options.body.policyId),rebind:Boolean(options.body.policyId)};return {saved:true,mailStatus:'queued'};}}};
 const Swal={fire:async options=>{if(options?.didOpen&&/กำลัง/.test(options.title||''))return {};for(const [match,answer] of answers)if(match(options))return answer;return {isConfirmed:false};},showLoading(){},showValidationMessage(){}};
 const context={window,Swal,document:{getElementById:()=>null}};vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),context);return window.PC_CoProEmailUI;
}
const chooser=answer=>[o=>o?.input==='textarea'&&/หรือไม่/.test(o.title||''),answer];
const review=answer=>[o=>/^ตรวจเมลแจ้ง/.test(o?.title||''),answer];
test('choosing not to send a lifecycle mail records the decision and never calls the mail service',async()=>{
 const requests=[],decisions=[],api=ui([chooser({isDismissed:true,dismiss:'cancel'})],requests,decisions);
 const result=await api.notifyChange({campaign:'Test promo',changeId:'chg-test-0001',changeStatus:'CANCELLED'});
 assert.equal(result.mailStatus,'not_sent');assert.equal(requests.length,0);assert.deepEqual(decisions,[['Test promo','promotion_changed','chg-test-0001','not_sent']]);
});
test('reply in the bound loop previews, then queues exactly the confirmed change with the optional message',async()=>{
 const requests=[],decisions=[],api=ui([chooser({isConfirmed:true,value:' ขยายตามยอดขาย '}),review({isConfirmed:true})],requests,decisions);
 const result=await api.notifyChange({campaign:'Test promo',changeId:'chg-test-0002',changeStatus:'EXTENDED'});
 assert.equal(result.mailStatus,'queued');assert.deepEqual(requests.map(r=>r.path),['copro/change/preview','copro/change']);
 const commit=requests[1].body;assert.equal(commit.changeId,'chg-test-0002');assert.equal(commit.campaignKey,'promo::c::Test%20promo');assert.equal(commit.additionalMessage,'ขยายตามยอดขาย');
 assert.equal(commit.confirmed,true);assert.equal(commit.previewHash,'hash-1');assert.equal(commit.policyId,undefined,'reply uses the bound loop');assert.equal(decisions.length,0);
});
test('new email creates a new loop with the chosen recipients and binds the edit mail to it',async()=>{
 const requests=[],decisions=[],policy={id:'policy-new',version:1,newMessage:true,recipients:{to:['new@example.net'],cc:[]}};
 const api=ui([chooser({isDenied:true,value:''}),[o=>/ส่งเมลใหม่ — ระบุผู้รับ/.test(o?.title||''),{isConfirmed:true,value:policy}],review({isConfirmed:true})],requests,decisions);
 assert.equal(await api.notifyEdit({campaign:'Test promo',month:'2026-10'},{editId:'edit-client-1'}),true);
 assert.deepEqual(requests.map(r=>r.path),['copro/revision/preview','copro/revision']);
 const commit=requests[1].body;assert.equal(commit.policyId,'policy-new');assert.equal(commit.policyVersion,1);assert.deepEqual(commit.recipients,policy.recipients);assert.equal(commit.editId,'edit-client-1');
});
test('declining at review records not sent; missing email service skips the question entirely',async()=>{
 const requests=[],decisions=[],api=ui([chooser({isConfirmed:true,value:''}),review({isDismissed:true,dismiss:'cancel'})],requests,decisions);
 assert.equal((await api.notifyChange({campaign:'Test promo',changeId:'chg-test-0003',changeStatus:'REDUCED'})).mailStatus,'not_sent');
 assert.deepEqual(requests.map(r=>r.path),['copro/change/preview']);assert.equal(decisions[0][1],'promotion_changed');
 const asked=[],offRequests=[],off=ui([[o=>{asked.push(o);return false;},null]],offRequests,[],false);
 assert.equal((await off.notifyChange({campaign:'Test promo',changeId:'chg-test-0004',changeStatus:'EXTENDED'})).mailStatus,'unavailable');assert.equal(asked.length,0);assert.equal(offRequests.length,0);
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
