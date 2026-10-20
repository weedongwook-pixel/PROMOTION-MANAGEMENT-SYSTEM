const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function render(events,failed=false){
 const context={localStorage:{getItem:()=> 'Owner'},PC_CoProEmail:{request:async()=>{if(failed)throw Error('offline');return {items:events};}},PC_CLOUD:{readCloudKey:async()=>null}};context.window=context;
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),context);
 const root={isConnected:true};await context.PC_CoProEmailUI.mountHistory(root,[{campaign:'A'},{campaign:'B'}]);return root.innerHTML;
}
test('mail history has one row per campaign and latest status for each milestone',async()=>{
 const html=await render([{campaign:'A',kind:'submitted',status:'accepted',at:1000},{campaign:'A',kind:'promotion_edited',status:'accepted',at:2000},{campaign:'A',kind:'promotion_edited',status:'failed',at:3000,error:'provider_rejected'},{campaign:'A',kind:'it_interface_complete',status:'queued',at:4000}]);
 const body=html.split('<tbody>')[1];assert.equal((body.match(/<tr>/g)||[]).length,2);
 assert.match(body,/<td>A<\/td><td>ส่งเรียบร้อย \(Gmail รับแล้ว\)<\/td><td>ส่งไม่สำเร็จ<\/td><td>รอส่ง<\/td>/);
 assert.match(body,/แจ้งแก้ไข: Gmail ปฏิเสธการส่ง/);
});
test('failed mail lookup remains unknown without inventing an unsent status',async()=>{
 const html=await render([],true);assert.equal((html.match(/<td>ยังตรวจสถานะไม่ได้<\/td>/g)||[]).length,6);assert.doesNotMatch(html,/ไม่ได้ส่งเมล/);
});

test('no edit notification is shown as a dash after a successful lookup',async()=>{
 const html=await render([]);assert.equal((html.match(/<td>-<\/td>/g)||[]).length,2);
});
