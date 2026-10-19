const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../js/tracking-status.js');
const row=(name,it='PENDING',op='WAITING',extra={})=>({campaign:'Demo',month:'2026-10',shortName:name,itStatus:it,opStatus:op,...extra});
test('progress counts logical buttons, not product members or blank Subset rows',()=>{
 const s=summarize([row('A','COMPLETE'),row('A','COMPLETE'),row(''),row('-'),row('B')]);
 assert.equal(s.total,2);assert.equal(s.itDone,1);assert.equal(s.opDone,0);assert.equal(s.state,'WAIT_IT');
});
test('confirming an Item Set code or Builder-ready is not IT completion',()=>{
 const s=summarize([row('A','PENDING','WAITING',{codeItemSet:'1073605',posReady:true})]);
 assert.equal(s.itDone,0);assert.equal(s.state,'WAIT_IT');
});
test('partial OP, all complete, rejection and revision have distinct states',()=>{
 assert.equal(summarize([row('A','COMPLETE','CONFIRMED'),row('B','COMPLETE')]).state,'WAIT_OP');
 assert.equal(summarize([row('A','COMPLETE','CONFIRMED'),row('B','COMPLETE','APPROVED')]).state,'COMPLETE');
 const rejected=summarize([row('A','PENDING','REJECTED',{rejectReason:'ราคาไม่ถูกต้อง'})]);
 assert.equal(rejected.state,'NEEDS_EDIT');assert.equal(rejected.reason,'ราคาไม่ถูกต้อง');
 const revision=summarize([row('A','PENDING','WAITING',{revisionPending:true,revisionReason:'เปลี่ยนราคา',opDoneDate:'2026-10-01'})]);
 assert.equal(revision.state,'NEEDS_EDIT');assert.equal(revision.opDone,0);assert.equal(revision.reason,'เปลี่ยนราคา');
});
test('cancellation does not hide remaining active buttons or mean completed',()=>{
 assert.equal(summarize([row('A','COMPLETE','CONFIRMED',{changeStatus:'CANCELLED'})]).state,'CANCELLED');
 const mixed=summarize([row('A','COMPLETE','CONFIRMED',{changeStatus:'CANCELLED'}),row('B')]);
 assert.equal(mixed.state,'WAIT_IT');assert.equal(mixed.cancelled,1);assert.equal(mixed.total,1);
});
test('unrecorded timestamps stay empty and the latest stored event wins',()=>{
 assert.equal(summarize([row('A')]).updatedAt,'');
 const s=summarize([row('A','COMPLETE','WAITING',{txnDate:'2026-10-01T01:00:00Z',itSettlementSavedAt:'2026-10-17T11:00:00Z'}),row('B','PENDING','WAITING',{editedAt:'2026-10-18T02:00:00Z'})]);
 assert.equal(s.updatedAt,'2026-10-18T02:00:00Z');
});
test('empty names fall back to codes without counting every member as a button',()=>{
 assert.equal(summarize([row('', 'PENDING','WAITING',{codePromotion:'P1'}),row('', 'PENDING','WAITING',{codePromotion:'P1'})]).total,1);
});
test('workflow labels describe the next action instead of a generic completion',()=>{
 assert.equal(summarize([{shortName:'A',itStatus:'PENDING'}]).label,'รอ IT ขึ้นปุ่ม');
 assert.equal(summarize([{shortName:'A',itStatus:'COMPLETE',opStatus:'WAITING'}]).label,'รอ OP ตรวจสอบ');
 assert.equal(summarize([{shortName:'A',itStatus:'COMPLETE',opStatus:'CONFIRMED'}]).label,'OP ตรวจสอบแล้ว');
 assert.equal(summarize([{shortName:'A',itStatus:'COMPLETE',opStatus:'REJECTED'}]).label,'รอ IT แก้ไขปุ่ม');
});
