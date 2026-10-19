const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const row={campaign:'Rework',month:'2026-11',shortName:'Set',promoType:'Item Set',itStatus:'PENDING',opStatus:'WAITING',revisionPending:true,revisionReason:'แก้จำนวน',revisionRequestedBy:'Bow',revisionRequestedAt:'2026-10-16T01:00:00Z',revisionId:'edit-cycle-1',revisionChanges:['สินค้า / จำนวน: Set'],changeStatus:'EDITED',codePromotion:'P1001',codeItemSet:'1071001',itemPromotion:'1071001',kitchen:'FF',itemCode:'101003',qty:2,gross:95,netPrice:150,start:'2026-11-01',end:'2026-11-30',wentLive:true};
 const initial={npdProducts:[{itemCode:'1071001',itemNameEN:'Old',gross:95}],months:{'2026-11':[row],'2026-12':[{...row,qty:1,detail:'old month',revisionPending:false,itStatus:'COMPLETE',opStatus:'CONFIRMED',itDoneDate:'2026-10-15',revisionId:''}]},_npdSeeded:true,_flvSeeded:true,_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1,_billDiscVer:4,_proJulyVer:2,_vcCouponVer:2};
 const data=new Map([['pc_mock_store_v28',JSON.stringify(initial)]]),c={console:{log(){},warn(){},error(){}},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}},setTimeout(){},clearTimeout(){},URL,Date,Math,location:{href:'http://test/'},PC_REAL_PROMOS:[]};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/mock-backend.js','utf8'),c);return{api:c.PC_API,data};
}
test('IT gets revision reason; cannot change old codes, OP waits until IT closes, and other month stays unchanged',()=>{
 const {api,data}=setup(),tasks=api.getITTasks('2026-11');assert.equal(tasks.length,1);assert.equal(tasks[0].revisionReason,'แก้จำนวน');assert.equal(tasks[0].revisionPending,true);
 assert.equal(api.getAllCampaignData().find(r=>r.month==='2026-11').revisionId,'edit-cycle-1');
 assert.equal(api.setOpStatus('Rework','CONFIRMED','',{month:'2026-11',revisionId:'edit-cycle-1'}).status,'error');
 const update={month:'2026-11',rowIdx:2,campaign:'Rework',shortName:'Set',sourceShortName:'Set',promoType:'Item Set',promoCode:'P1001',itemPromo:'1071001',kitchenName:'FF',cateRemark:'Promotion set',netPrice:150,revisionId:'edit-cycle-1',itemCode:'101003',qty:2,price:95};
 assert.equal(api.saveSettlementBatch('2026-11',[{...update,revisionId:'stale-revision'}]),'REVISION_CODE_CONFLICT');
 assert.equal(api.saveSettlementBatch('2026-11',[{...update,promoCode:'P9999'}]),'REVISION_CODE_CONFLICT');
 assert.equal(api.saveSettlementBatch('2026-11',[update]),'SUCCESS');
 let rows=JSON.parse(data.get('pc_mock_store_v28')).months;assert.equal(rows['2026-11'][0].revisionPending,false);assert.equal(rows['2026-11'][0].itStatus,'COMPLETE');assert.ok(rows['2026-11'][0].itDoneDate);assert.equal(rows['2026-11'][0].opStatus,'WAITING');assert.equal(rows['2026-12'][0].itDoneDate,'2026-10-15');
 assert.equal(api.setOpStatus('Rework','CONFIRMED','',{month:'2026-11',revisionId:'old-revision'}).status,'error');
 assert.equal(api.setOpStatus('Rework','CONFIRMED','',{month:'2026-11',revisionId:'edit-cycle-1'}).status,'success');
 rows=JSON.parse(data.get('pc_mock_store_v28')).months;assert.equal(rows['2026-11'][0].opStatus,'CONFIRMED');assert.ok(rows['2026-11'][0].opDoneDate);assert.equal(rows['2026-11'][0].revisionReason,'แก้จำนวน');assert.equal(rows['2026-12'][0].revisionId,'');
 const comp=JSON.parse(data.get('pc_itemset_comp'));assert.equal(comp['1071001'].find(r=>r.code==='101003').min,2);
});
test('OP details are scoped to selected month rather than first old row in another month',()=>{
 const {api}=setup();const old=api.getPromoDetails('Rework',{month:'2026-12'});const revised=api.getPromoDetails('Rework',{month:'2026-11'});assert.equal(old.items[0].qty,1);assert.equal(revised.items[0].qty,2);
});
test('memo totals and branch eligibility never merge an unapproved revision with another month',()=>{
 const {api}=setup();const memo=api.getMemoCampaigns('2026-11');assert.equal(memo[0].buttons[0].gross,190);
 const branches=api.getBranchPromotions('x','ALL');assert.equal(branches.some(r=>r.month==='2026-11'),false);assert.equal(branches.some(r=>r.month==='2026-12'),true);
});
test('IT branch-note post-save respects the selected month',()=>{
 const {api,data}=setup();api.savePosButtonNoteCampaign('Rework','new note','2026-11');const rows=JSON.parse(data.get('pc_mock_store_v28')).months;assert.equal(rows['2026-11'][0].branchNote,'new note');assert.notEqual(rows['2026-12'][0].branchNote,'new note');
});
test('own revised Item Set updates existing master/composition, not the borrowed-code preservation branch',()=>{
 const {api,data}=setup();data.set('pc_itemset_comp',JSON.stringify({'1071001':[{code:'101003',min:1,max:1,_itemset:'Rework|Set'}]}));
 const u={month:'2026-11',rowIdx:2,campaign:'Rework',shortName:'Set',sourceShortName:'Set',promoType:'Item Set',promoCode:'P1001',itemPromo:'1071001',kitchenName:'FF',cateRemark:'Promotion set',netPrice:150,revisionId:'edit-cycle-1',itemCode:'101003',qty:2,price:95};
 assert.equal(api.saveSettlementBatch('2026-11',[u]),'SUCCESS');assert.equal(JSON.parse(data.get('pc_mock_store_v28')).npdProducts.find(r=>r.itemCode==='1071001').gross,'190');assert.equal(JSON.parse(data.get('pc_itemset_comp'))['1071001'].find(r=>r.code==='101003').min,2);
});
