const test=require('node:test'),assert=require('node:assert/strict');
require('../js/form-code-allocation.js');const M=require('../js/promotion-edit-model.js');
const source={campaign:'TOTO',shortName:'Old',submittedBy:'Bow',reporter:'Bow',txnDate:'2026-10-01',promoType:'Item Coupon',submissionForm:'Coupon',itemCode:'101003',qty:1,gross:100,netPrice:90,discount:10,detail:'old',mechanic:'ok',start:'2026-11-01',end:'2026-11-30',stores:'ALL',saleMode:'LINEMAN',codePromotion:'IC0001'};
function fixture(){const original={m:{'2026-11':[{...source}]},w:[]},form=M.toForm(original,'2026-11');form.buttons.push({...form.buttons[0],id:'new:button001',isNew:true,shortName:'New',items:[{...form.buttons[0].items[0],id:''}]});const next=M.applyRevision(original,form,{actor:'Bow',month:'2026-11',campaign:'TOTO',editId:'edit-resource'});return {original,form,next,month:'2026-11',editId:'edit-resource',actor:'Bow',now:Date.now()};}
test('new coupon code and file are staged without touching existing code or storage',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();
 const counter={types:{coupon:{seeded:true,cursor:1}},reservations:{},log:[]},db={prepare(){return {bind(key){return {first:async()=>key==='pc_code_counter_v1'?{v:JSON.stringify(counter),updated_at:12}:null};}};}};
 input.form.buttons[1].fileData={base64:'dGVzdA==',fileName:'test.pdf',mimeType:'application/pdf'};
 const r=await R.prepareEditResources(db,input);
 assert.equal(r.next.m['2026-11'][0].codePromotion,'IC0001');assert.equal(r.next.m['2026-11'][1].codePromotion,'IC0002');assert.match(r.next.m['2026-11'][1].attachment,/^file:/);assert.equal(r.writes.length,2);assert.equal(counter.types.coupon.cursor,1);assert.equal(r.writes.find(w=>w.key==='pc_code_counter_v1').expectedUpdatedAt,12);
});
test('explicit manual promotion and item-set codes are staged for new Item Set buttons only',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();
 input.original.m['2026-11'][0].submissionForm='Proposal';input.original.m['2026-11'][0].promoType='Item Set';
 input.form=M.toForm(input.original,'2026-11');input.form.buttons.push({...input.form.buttons[0],id:'new:button001',isNew:true,shortName:'New',kitchen:'Fries',codeAllocation:{promotion:{mode:'manual',code:'P9500'},itemset:{mode:'manual',code:'1079500'}},items:[{...input.form.buttons[0].items[0],id:''}]});
 input.next=M.applyRevision(input.original,input.form,{actor:'Bow',month:input.month,campaign:'TOTO',editId:input.editId});
 const counter={types:{promo:{seeded:true,cursor:9000},itemset:{seeded:true,cursor:9000}},reservations:{},log:[]};
 const db={prepare(){return {all:async()=>({results:[]}),bind(key){return {first:async()=>key==='pc_code_counter_v1'?{v:JSON.stringify(counter),updated_at:1}:null};}};}};
 const result=await R.prepareEditResources(db,input);const row=result.next.m[input.month].at(-1);
 assert.equal(row.codePromotion,'P9500');assert.equal(row.codeItemSet,'1079500');assert.equal(row.itemPromotion,'1079500');
 assert.equal(result.next.m[input.month][0].codePromotion,'IC0001');assert.equal(JSON.parse(result.writes[0].value).reservations['promo::P9500'].status,'RESERVED');
});
test('invalid uploads and Online additions without mapping files fail before commit',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js');
 const db={prepare(){return {bind(){return {first:async()=>({v:JSON.stringify({types:{coupon:{cursor:1,seeded:true}},reservations:{},log:[]}),updated_at:1})};}};}};
 const input=fixture();input.form.buttons[1].fileData={base64:'not base64!',fileName:'test.pdf'};
 await assert.rejects(()=>R.prepareEditResources(db,input),/ไฟล์แนบ/);
 const online=fixture();online.form.buttons[1].couponType='Online';await assert.rejects(()=>R.prepareEditResources(db,online),/Online/);
});
test('resource enrichment never changes another month working buttons',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();
 input.next.w.push({month:'2026-12',shortName:'Other one'},{month:'2026-12',shortName:'Other two'});
 input.next.m['2026-12']=[{shortName:'Other one'},{shortName:'Other two'}];
 const db={prepare(){return {bind(){return {first:async()=>({v:JSON.stringify({types:{coupon:{cursor:1,seeded:true}},reservations:{},log:[]}),updated_at:1})};}};}};
 const r=await R.prepareEditResources(db,input);assert.deepEqual(r.next.w.filter(w=>w.month==='2026-12').map(w=>w.shortName),['Other one','Other two']);
});
test('removed codes are retained in the registry instead of becoming orphan returns',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();input.form.buttons.shift();input.next=M.applyRevision(input.original,input.form,{actor:'Bow',month:input.month,campaign:'TOTO',editId:input.editId});
 const state={types:{coupon:{cursor:1,seeded:true}},reservations:{'coupon::IC0001':{code:'IC0001',type:'coupon',num:1,status:'RESERVED',at:'2026-01-01'}},log:[]};
 const db={prepare(){return {bind(){return {first:async()=>({v:JSON.stringify(state),updated_at:1})};}};}};
 const r=await R.prepareEditResources(db,input),counter=JSON.parse(r.writes.find(w=>w.key==='pc_code_counter_v1').value);
 assert.equal(counter.reservations['coupon::IC0001'].retainForHistory,true);assert.equal(counter.reservations['coupon::IC0001'].status,'RESERVED');
});
test('adding Item Coupon through Item Set edit reserves only a coupon code',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();
 Object.assign(input.original.m['2026-11'][0],{submissionForm:'Item Set',typePromotion:'Item Set',promoType:'Item Set'});
 input.form=M.toForm(input.original,input.month);input.form.buttons.push({...input.form.buttons[0],id:'new:coupon001',isNew:true,shortName:'Coupon',promoType:'Item Coupon',kitchen:'Fries',codeAllocation:{promotion:{mode:'auto'},itemset:{mode:'auto'}},items:[{...input.form.buttons[0].items[0],id:''}]});
 input.next=M.applyRevision(input.original,input.form,{actor:'Bow',month:input.month,editId:input.editId});
 const counter={types:{coupon:{seeded:true,cursor:1}},reservations:{},log:[]};const db={prepare(){return {all:async()=>({results:[]}),bind(){return {first:async()=>({v:JSON.stringify(counter),updated_at:1})};}};}};
 const result=await R.prepareEditResources(db,input),r=result.next.m[input.month].at(-1);assert.equal(r.codePromotion,'IC0002');assert.equal(r.codeItemSet,'');assert.equal(r.typePromotion,'Item Coupon');
});
test('existing Item Set converts to Item Coupon with a new IC, retaining old code history and other months',async()=>{
 const R=require('../sync-worker/promotion-edit-resources.js'),input=fixture();
 Object.assign(input.original.m['2026-11'][0],{submissionForm:'Item Set',typePromotion:'Item Set',promoType:'Item Set',codePromotion:'P12',codeItemSet:'107123',itemPromotion:'107123',builderCode:'107123',typeSel:'Price Promotion',codeBurned:true,kitchen:'Fries'});
 input.original.m['2026-12']=[{...input.original.m['2026-11'][0]}];
 input.form=M.toForm(input.original,input.month);input.form.fields.cate='Item Coupon';input.form.buttons[0].promoType='Item Coupon';input.form.editReason='เปลี่ยนเป็นคูปอง CRM';
 input.next=M.applyRevision(input.original,input.form,{actor:'Bow',month:input.month,editId:input.editId});
 const state={types:{coupon:{seeded:true,cursor:1},promo:{seeded:true,cursor:12},itemset:{seeded:true,cursor:123}},reservations:{},log:[]};
 const db={prepare(){return {all:async()=>({results:[]}),bind(){return {first:async()=>({v:JSON.stringify(state),updated_at:1})};}};}};
 const result=await R.prepareEditResources(db,input),r=result.next.m[input.month][0],counter=JSON.parse(result.writes[0].value);
 assert.equal(r.codePromotion,'IC0002');assert.equal(r.typePromotion,'Item Coupon');assert.equal(r.codeItemSet,'');assert.equal(r.itemPromotion,'');assert.equal(r.builderCode,'');assert.equal(r._wasItemSet,false);assert.equal(r.typeSel,'Item Coupon');assert.equal(r.codeBurned,false);
 assert.equal(counter.reservations['promo::P12'].retainForHistory,true);assert.equal(counter.reservations['itemset::107123'].retainForHistory,true);assert.equal(counter.reservations['coupon::IC0002'].status,'RESERVED');
 assert.equal(result.next.m['2026-12'][0].codePromotion,'P12');assert.equal(result.codeClaims[0],'IC0002');assert.match(r.revisionChanges.join(','),/เปลี่ยน Type/);
});
