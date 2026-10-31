const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(send){
 const calls=[],window={PC_CoProEmail:{capabilities:async()=>({coproEnabled:true}),request:async()=>{calls.push('request');throw Error('must not send');}},
  PC_SendMail:{ask:async()=>send,decline:async job=>calls.push(['decline',job.kind,job.editId||job.changeId]),open:async jobs=>{calls.push(['page',jobs[0].kind,jobs[0].editId||jobs[0].changeId]);return {mailPage:true};}}};
 const c={window,Swal:{fire:async()=>({isConfirmed:false})}};vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),c);return {ui:window.PC_CoProEmailUI,calls};
}
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
test('No on saved edit records not sent and sends nothing',async()=>{
 const {ui,calls}=load(false);
 assert.equal(await ui.notifyEdit({campaign:'Test',month:'2026-10'},{editId:'edit-123'}),false);same(calls,[['decline','edit','edit-123']]);
});
test('Yes on saved edit or change opens the send-mail page instead of popups',async()=>{
 let t=load(true);assert.equal(await t.ui.notifyEdit({campaign:'Test',month:'2026-10'},{editId:'edit-123'}),'page');same(t.calls,[['page','edit','edit-123']]);
 t=load(true);assert.equal((await t.ui.notifyChange({campaign:'Test',changeId:'chg-12345678',changeStatus:'EXTENDED'})).mailStatus,'page');same(t.calls,[['page','change','chg-12345678']]);
});
test('edit mail prompts only after durable Cloud save and keeps the send-mail page open',()=>{
 const s=fs.readFileSync('js/promotion-edit.js','utf8');
 assert.ok(s.indexOf('await PC_CLOUD.saveCampaignEdit')<s.indexOf('await window.PC_CoProEmailUI.notifyEdit'));
 assert.match(s,/if\(mail!=='page'\)window\.loadPage\('Campaign_Tracking'/);
});
