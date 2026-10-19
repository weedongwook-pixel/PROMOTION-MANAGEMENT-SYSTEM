const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const status=require('../js/tracking-status.js');
test('Tracking reads expose saved revision evidence and keep progress separate by month without writing',()=>{
 const row={campaign:'Same name',shortName:'Set A',itStatus:'PENDING',opStatus:'WAITING',start:'2026-11-01',end:'2026-11-30',itemCode:'101003',qty:1,gross:95,
  revisionPending:true,revisionReason:'เปลี่ยนราคา',revisionRequestedBy:'Bow',revisionRequestedAt:'2026-10-18T08:30:00Z',editedBy:'Bow',editedAt:'2026-10-18T08:30:00Z'};
 const saved=new Map([['pc_mock_store_v28',JSON.stringify({months:{'2026-10':[{...row,itStatus:'COMPLETE',opStatus:'CONFIRMED',revisionPending:false,start:'2026-10-01',end:'2026-10-31',opDoneDate:'2026-10-15'}],'2026-11':[row,{...row,shortName:'Set B',revisionPending:false,itStatus:'COMPLETE',itSettlementSavedAt:'2026-10-17T09:00:00Z'}]},_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1})]]);
 let writes=0;
 const c={Date,Math,URL,console:{log(){},warn(){},error(){}},setTimeout(){},clearTimeout(){},location:{hostname:'localhost'},PC_REAL_PROMOS:[],localStorage:{getItem:k=>saved.get(k)||null,setItem(k,v){writes++;saved.set(k,String(v));},removeItem:k=>saved.delete(k),key:i=>[...saved.keys()][i],get length(){return saved.size;}}};c.window=c;
 vm.runInNewContext(fs.readFileSync('js/mock-backend.js','utf8'),c);
 const baseline=writes,rows=c.PC_API.getAllCampaignData().filter(r=>r.campaign==='Same name');
 assert.equal(writes,baseline,'reading Tracking never commits data');
 const october=status.summarize(rows.filter(r=>r.month==='2026-10')),november=status.summarize(rows.filter(r=>r.month==='2026-11'));
 assert.equal(october.state,'COMPLETE');assert.equal(november.state,'NEEDS_EDIT');
 assert.equal(november.total,2);assert.equal(november.itDone,1);assert.equal(november.opDone,0);
 assert.equal(november.reason,'เปลี่ยนราคา');assert.equal(november.updatedAt,'2026-10-18T08:30:00Z');
 assert.equal(rows.find(r=>r.month==='2026-11'&&r.shortName==='Set A').revisionRequestedBy,'Bow');
});
