const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function render(events,failed=false,options={}){
 const context={localStorage:{getItem:()=> 'Owner'},PC_CoProEmail:{request:async()=>{throw Error('Gmail session must not be used');}},PC_CLOUD:{readMailHistory:async()=>{if(failed)throw Error('offline');return {items:[{campaign:'B',kind:'submitted',status:'not_recorded'},...events]};},readCloudKey:async()=>null}};context.window=context;
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),context);
 const root={isConnected:true};await context.PC_CoProEmailUI.mountHistory(root,[{campaign:'A'},{campaign:'B'}],options);return root.innerHTML;
}
test('mail history has one row per campaign and latest status for each milestone',async()=>{
 const html=await render([{campaign:'A',kind:'submitted',status:'accepted',at:1000},{campaign:'A',kind:'promotion_edited',status:'accepted',at:2000},{campaign:'A',kind:'promotion_edited',status:'failed',at:3000,error:'provider_rejected'},{campaign:'A',kind:'it_interface_complete',status:'queued',at:4000}]);
 const body=html.split('<tbody>')[1];assert.equal((body.match(/<tr>/g)||[]).length,2);
 assert.match(body,/<td>A<\/td><td>ส่งสำเร็จ<\/td><td>ส่งไม่สำเร็จ<\/td><td>✕ Interface \(ยังไม่เสร็จ\)<\/td>/);
 assert.match(body,/แจ้งแก้ไข: Gmail ปฏิเสธการส่ง/);
});
test('failed mail lookup remains unknown without inventing an unsent status',async()=>{
 const html=await render([],true);assert.equal((html.match(/<td>ยังตรวจสถานะไม่ได้<\/td>/g)||[]).length,0);assert.doesNotMatch(html,/ไม่ได้ส่งเมล/);
});

test('no edit notification is shown as a dash after a successful lookup',async()=>{
 const html=await render([]);assert.equal((html.match(/<td>-<\/td>/g)||[]).length,1);assert.doesNotMatch(html,/<td>A<\/td>/);
});

test('Interface uses actual completion, independent of email delivery',async()=>{
 const html=await render([{campaign:'A',kind:'it_interface_complete',status:'failed',interfaceStatus:'interface_done'},{campaign:'B',kind:'it_interface_complete',status:'accepted',interfaceStatus:'waiting'}]);
 assert.equal((html.match(/<td>✓ Interfaced<\/td>/g)||[]).length,1);
 assert.doesNotMatch(html,/Gmail รับแล้ว|ยังไม่ได้ทำรายการ Interface/);
});

test('mail date uses Bangkok day and all view keeps latest campaigns first',async()=>{
 const events=[{campaign:'Old',kind:'submitted',status:'accepted',at:Date.parse('2026-10-19T12:00:00Z')},{campaign:'New',kind:'submitted',status:'accepted',at:Date.parse('2026-10-19T18:00:00Z')}];
 const today=await render(events,false,{date:'2026-10-20'});assert.match(today,/<td>New<\/td>/);assert.doesNotMatch(today,/<td>Old<\/td>/);
 const all=await render(events);assert.ok(all.indexOf('<td>New</td>')<all.indexOf('<td>Old</td>'));
});
