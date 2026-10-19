const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/promotion-edit-model.js');
function fixture(){const row={campaign:'Revision',shortName:'Fries',submittedBy:'Bow',reporter:'Bow',promoType:'Item Set',itStatus:'COMPLETE',opStatus:'CONFIRMED',itDoneDate:'2026-10-15',itSettlementSavedAt:'2026-10-15T01:00:00Z',opDoneDate:'2026-10-15',wentLive:true,codeBurned:true,posReady:true,itemCode:'101003',qty:1,gross:95,netPrice:85,codePromotion:'P1234',codeItemSet:'1071234',detail:'old',mechanic:'conditions',stores:'ALL',saleMode:'Take Away',start:'2026-11-01',end:'2026-11-30'};return{m:{'2026-11':[row],'2026-12':[{...row,start:'2026-12-01',end:'2026-12-31'}]},w:[]};}
test('completed work allows owner but requires a reason; cancellation and another sender remain blocked',()=>{
 const b=fixture();assert.equal(M.policy(b,'Bow','2026-11').allowed,true);assert.equal(M.policy(b,'Bow','2026-11').requiresReason,true);assert.equal(M.policy(b,'Other','2026-11').allowed,false);
 const f=M.toForm(b,'2026-11');f.fields.detail='new';assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'Revision'}),/เหตุผล/);
 b.m['2026-11'][0].changeStatus='CANCELLED';assert.equal(M.policy(b,'MKT Team','2026-11').allowed,false);
});
test('revision requeues only selected month and preserves codes, sender, historical usage and changed-field summary',()=>{
 const b=fixture(),f=M.toForm(b,'2026-11');f.fields.detail='new';f.editReason='แก้รายละเอียด';
 const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'Revision',editId:'edit-revision',now:'2026-10-16T01:00:00Z'}),r=next.m['2026-11'][0];
 assert.equal(r.itStatus,'PENDING');assert.equal(r.opStatus,'WAITING');assert.equal(r.changeStatus,'EDITED');assert.equal(r.revisionPending,true);assert.equal(r.revisionReason,'แก้รายละเอียด');assert.equal(r.revisionId,'edit-revision');assert.equal(r.revisionRequestedBy,'Bow');assert.ok(r.revisionChanges.includes('รายละเอียดโปรโมชั่น'));
 assert.equal(r.itDoneDate,'');assert.equal(r.opDoneDate,'');assert.equal(r.itSettlementSavedAt,'');assert.equal(r.posReady,false);assert.equal(r.wentLive,true);assert.equal(r.codeBurned,true);assert.equal(r.codePromotion,'P1234');assert.equal(r.codeItemSet,'1071234');assert.equal(r.submittedBy,'Bow');assert.deepEqual(next.m['2026-12'],b.m['2026-12']);assert.equal(b.m['2026-11'][0].itStatus,'COMPLETE');
});
test('another month completion does not force an untouched first-time month to requeue',()=>{
 const b=fixture();const r=b.m['2026-11'][0];for(const k of ['itDoneDate','itSettlementSavedAt','opDoneDate','wentLive','codeBurned','posReady'])delete r[k];r.itStatus='PENDING';r.opStatus='WAITING';
 const f=M.toForm(b,'2026-11');f.fields.detail='first edit';const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'Revision'});assert.equal(M.policy(b,'Bow','2026-11').requiresReason,false);assert.notEqual(next.m['2026-11'][0].revisionPending,true);
});
module.exports={fixture};
