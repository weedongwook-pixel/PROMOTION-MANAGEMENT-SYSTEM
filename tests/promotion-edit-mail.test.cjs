const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('No on saved edit creates neither email request nor pending draft',async()=>{
 let calls=0;const window={PC_CoProEmail:{request:async()=>{calls++;throw Error('must not send');}}};
 const c={window,Swal:{fire:async()=>({isConfirmed:false})}};
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),c);
 assert.equal(await window.PC_CoProEmailUI.notifyEdit({campaign:'Test',month:'2026-10'},{editId:'edit-123'}),false);assert.equal(calls,0);
});
test('edit mail prompts only after durable Cloud save and keeps failure separate from edit save',()=>{
 const s=fs.readFileSync('js/promotion-edit.js','utf8');assert.ok(s.indexOf('await PC_CLOUD.saveCampaignEdit')<s.indexOf('await window.PC_CoProEmailUI.notifyEdit'));assert.ok(s.indexOf('await window.PC_CoProEmailUI.notifyEdit')<s.lastIndexOf("clear();window.loadPage('Campaign_Tracking'"));
});
