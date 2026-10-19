const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/promotion-edit-model.js');
const row={campaign:'TOTO',shortName:'Fries',submittedBy:'Bow',reporter:'Bow',txnDate:'2026-10-15',itStatus:'PENDING',opStatus:'WAITING',itemCode:'101003',qty:2,gross:95,netPrice:'179',codePromotion:'IC0688',codeItemSet:'1073601',detail:'เดิม',mechanic:'เงื่อนไข',start:'2026-11-01',end:'2026-11-30',stores:'ALL STORES',attachment:'file:old',customField:'retain',promoType:'Coupon',saleMode:'LINEMAN'};
test('whole category Coupon keeps discount without inventing a group Net price',()=>{
 const b=block(),f=M.toForm(b,'2026-11'),it=f.buttons[0].items[0];
 Object.assign(it,{itemCode:'101',catCode:'101',selectionMode:'CATE',gross:'',netPrice:'',itemNameEN:'Fries'});f.buttons[0].discount=10;
 f.buttons[0].items=[it];
 const saved=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'category-edit'}).m['2026-11'][0];
 assert.equal(saved.netPrice,'');assert.equal(saved.couponDiscountValue,10);assert.equal(saved.itemCode,'101');
});
test('Coupon cannot mix category discounts with individual products in one button',()=>{
 const b=block(),f=M.toForm(b,'2026-11');
 Object.assign(f.buttons[0].items[0],{itemCode:'101',catCode:'101',selectionMode:'CATE',gross:'',netPrice:''});
 assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'mixed-coupon'}),/ปุ่มเดียวกัน/);
});
const block=()=>({m:{'2026-11':[{...row},{...row,itemCode:'SS0035',isSubset:'1',chooseMin:1,chooseMax:2}]},w:[],_ts:10});
test('CRM Coupon retains independent mapping per button and rejects an empty coupon code',()=>{
 const b=block();b.m['2026-11'].push({...row,shortName:'Second coupon',codePromotion:'IC0689'});
 const f=M.toForm(b,'2026-11');Object.assign(f.fields,{customerGroup:'crm',crmMappingRequired:'yes',crmMappingCode:'',crmMappingDetail:''});
 f.buttons.forEach((button,i)=>Object.assign(button,{crmMappingCode:'VD-'+(i+1),crmMappingDetail:'Setup '+(i+1)}));
 const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'per-coupon-map'});
 assert.deepEqual(next.m['2026-11'].map(r=>r.crmMappingCode),['VD-1','VD-1','VD-2']);
 assert.deepEqual(M.toForm(next,'2026-11').buttons.map(b=>b.crmMappingCode),['VD-1','VD-2']);
 f.buttons[1].crmMappingCode='';assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'missing-map'}),/Mapping/);
 f.buttons[1].crmMappingCode='VD-2';const added={...f.buttons[0],id:'new:crm-mapping-123',isNew:true,shortName:'New CRM coupon',items:f.buttons[0].items.map(i=>({...i,id:''}))};delete added.crmMappingCode;delete added.crmMappingDetail;f.buttons.push(added);
 assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'new-missing-map'}),/Mapping/);
});
test('Coupon grouped individual items round trip without Gross or Net calculations',()=>{
 const b=block(),f=M.toForm(b,'2026-11');f.buttons[0].discount=10;
 f.buttons[0].items.forEach(i=>Object.assign(i,{couponGroupMode:true,gross:'',netPrice:''}));
 const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'group-items'});
 for(const r of next.m['2026-11']){assert.equal(r.couponGroupMode,true);assert.equal(r.gross,'');assert.equal(r.netPrice,'');assert.match(r.discount,/10/);}
 assert.equal(M.toForm(next,'2026-11').buttons[0].items[0].couponGroupMode,true);
});
test('designated MKT test account can edit another sender without changing ownership, but never bypasses IT locks',()=>{
 const b=block();assert.equal(M.policy(b,'MKT Team','2026-11').allowed,true);
 for(const actor of ['Other','MKT','mkt','IT Support'])assert.equal(M.policy(b,actor,'2026-11').allowed,false);
 const f=M.toForm(b,'2026-11');f.fields.detail='test revision';
 const next=M.applyRevision(b,f,{actor:'MKT Team',month:'2026-11',campaign:'TOTO',editId:'edit-test-account'});
 assert.equal(next.m['2026-11'][0].submittedBy,'Bow');assert.equal(next.m['2026-11'][0].editedBy,'MKT Team');
 for(const field of ['itSettlementSavedAt','itDoneDate','wentLive','codeBurned','rejectCount','opDoneDate']){const locked=block();locked.m['2026-11'][0][field]=1;assert.equal(M.policy(locked,'MKT Team','2026-11').requiresReason,true,field);}
});
test('only original sender can edit; confirmed reservation is not a settlement save',()=>{
 assert.equal(M.policy(block(),'Bow','2026-11').allowed,true);
 assert.equal(M.policy(block(),'Other','2026-11').allowed,false);
 for(const field of ['itSettlementSavedAt','itDoneDate','wentLive','codeBurned','rejectCount','opDoneDate']){const b=block();b.m['2026-11'][0][field]=1;assert.equal(M.policy(b,'Bow','2026-11').requiresReason,true,field);}
 const b=block();b.m['2026-11'][0].itStatus='COMPLETE';assert.equal(M.policy(b,'Bow','2026-11').requiresReason,true);
});
test('all form types round trip SS, zero, attachments, originals and unknown fields without code allocation',()=>{
 for(const [promoType,form] of [['Item Set','Proposal'],['Coupon','Coupon'],['Bill Discount','BillDiscountProposal'],['Voucher','VoucherProposal']]){
  const b=block();b.m['2026-11'].forEach(r=>r.promoType=promoType);
  const f=M.toForm(b,'2026-11');assert.equal(f.form,form);assert.equal(f.buttons.length,1);assert.equal(f.buttons[0].items.length,2);
  f.buttons[0].shortName='New name';f.buttons[0].netPrice=0;f.buttons[0].items.forEach(i=>i.netPrice=0);f.buttons[0].discount=10;f.fields.detail='แก้แล้ว';
  const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-test-0001',now:'2026-10-15T10:00:00Z'});
  assert.equal(next.m['2026-11'].length,2);const a=next.m['2026-11'][0];
  assert.equal(a.shortName,'New name');assert.equal(a.codePromotion,'IC0688');assert.equal(a.codeItemSet,'1073601');assert.equal(a.attachment,'file:old');assert.equal(a.customField,'retain');assert.equal(a.txnDate,'2026-10-15');assert.equal(a.detail,'แก้แล้ว');if(['Proposal','Coupon'].includes(form))assert.equal(a.netPrice,'0');
  assert.equal(next.m['2026-11'][1].itemCode,'SS0035');assert.equal(next.m['2026-11'][1].chooseMax,2);
 }
});
test('invalid net, duplicate names, empty edits and forged button identities fail closed',()=>{
 for(const mutate of [f=>f.buttons=[],f=>f.buttons[0].netPrice='',f=>f.buttons[0].id='forged',f=>f.buttons.push({...f.buttons[0],id:'new'})]){
 const b=block(),f=M.toForm(b,'2026-11');mutate(f);assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-test-0002'}));}
});
test('add remove reorder preserve original codes and sanitize new button workflow',()=>{
 const b=block();b.m['2026-11'].push({...row,shortName:'Second',codePromotion:'IC0700'});
 const f=M.toForm(b,'2026-11'),first=f.buttons[0],second=f.buttons[1];
 const added={...first,id:'new:button001',isNew:true,shortName:'Added',items:[{...first.items[0],id:'',codePromotion:'FORGED',itStatus:'COMPLETE',codeItemSet:'FORGED'}]};
 f.buttons=[second,added];
 const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-structural'}),rows=next.m['2026-11'];
 assert.deepEqual(rows.map(r=>r.shortName),['Second','Added']);
 assert.equal(rows[0].codePromotion,'IC0700');assert.equal(rows[1].codePromotion,'');assert.equal(rows[1].codeItemSet,'');assert.equal(rows[1].itStatus,'PENDING');assert.equal(rows[1].opStatus,'WAITING');assert.equal(rows[1].buttonOrder,1);assert.equal(rows[1].txnDate,row.txnDate);
 assert.equal(b.m['2026-11'][0].codePromotion,'IC0688');
});
test('new buttons cannot copy old row ids or duplicate temporary ids',()=>{
 const b=block(),f=M.toForm(b,'2026-11'),add={...f.buttons[0],id:'new:button001',isNew:true,shortName:'Added'};f.buttons.push(add);
 assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-structural'}));
});
test('existing identities cannot be relabeled as new to replace their codes',()=>{
 const b=block(),f=M.toForm(b,'2026-11');f.buttons[0].isNew=true;
 assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-identity-bypass'}),/อ้างอิง|ปุ่มใหม่/);
});
test('missing Coupon Net or quantity is rejected but explicit Net zero survives',()=>{
 for(const field of ['netPrice','qty']){const b=block(),f=M.toForm(b,'2026-11');delete f.buttons[0].items[0][field];assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-validation'}));}
 const b=block(),f=M.toForm(b,'2026-11');f.buttons[0].items[0].netPrice=0;assert.equal(M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-zero'}).m['2026-11'][0].netPrice,'0');
});
test('new Item Set buttons require Kitchen Name like a new proposal',()=>{
 const b=block();b.m['2026-11'].forEach(r=>r.submissionForm='Proposal');const f=M.toForm(b,'2026-11');f.buttons.push({...f.buttons[0],id:'new:button001',isNew:true,shortName:'Added',kitchen:'',items:[{...f.buttons[0].items[0],id:''}]});
 assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-kitchen'}),/Kitchen/);
});
test('older open forms cannot erase CRM mapping fields they do not understand',()=>{
 const b=block();b.m['2026-11'].forEach(r=>Object.assign(r,{customerGroup:'crm',crmMappingRequired:'yes',crmMappingCode:'VD-KEEP',crmMappingDetail:'keep'}));const f=M.toForm(b,'2026-11');
 ['crmMappingRequired','crmMappingCode','crmMappingDetail'].forEach(k=>delete f.fields[k]);f.fields.detail='legacy change';
 const saved=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-legacy-crm'});
 assert.equal(saved.m['2026-11'][0].crmMappingCode,'VD-KEEP');assert.equal(saved.m['2026-11'][0].crmMappingDetail,'keep');
});
test('invalid dates, missing required details and invalid SS ranges cannot bypass form validation',()=>{
 for(const mutate of [f=>f.fields.detail='',f=>f.fields.end='2026-10-01',f=>f.fields.start='2026-99-99',f=>f.buttons[0].items[1].chooseMax=0]){
 const b=block();b.m['2026-11'].forEach(r=>r.promoType='Item Set');const f=M.toForm(b,'2026-11');mutate(f);assert.throws(()=>M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO'}));}
});
test('legacy online coupon channel and unchanged other-month button views survive editing',()=>{
 const b=block();b.m['2026-11'].forEach(r=>{r.codeChannel='Online';r.promoType='Item Coupon Online';});b.m['2026-12']=[{...row,shortName:'December'}];
 const f=M.toForm(b,'2026-11');assert.equal(f.buttons[0].couponType,'Online');f.fields.detail='new';
 const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-legacy-test'});assert.deepEqual(next.m['2026-12'],b.m['2026-12']);assert.equal(next.w.length,2);assert.equal(next.w[1].shortName,'December');
});
test('real stored Bill and Voucher all-products rows retain their nonnumeric display fields',()=>{
 for(const form of ['BillDiscountProposal','VoucherProposal']){
  const b={m:{'2026-11':[{...row,promoType:form==='BillDiscountProposal'?'Bill Discount':'Voucher',itemCode:'ALL ITEMS',itemNameEN:'All products',qty:'All',gross:form==='VoucherProposal'?'50 ฿':'All',discount:form==='BillDiscountProposal'?'50 ฿':'',netPrice:''}]},w:[]};
  const f=M.toForm(b,'2026-11');assert.equal(Number(f.buttons[0].discount),50);f.fields.detail='แก้รายละเอียด';
  const next=M.applyRevision(b,f,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-all-products'});
  const r=next.m['2026-11'][0];assert.equal(r.qty,'All');assert.equal(r.gross,form==='VoucherProposal'?'50 ฿':'All');assert.equal(r.netPrice,'');assert.equal(r.detail,'แก้รายละเอียด');
 }
});
