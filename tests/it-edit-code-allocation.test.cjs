const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
class DB {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at INTEGER NOT NULL)');this.db.exec(fs.readFileSync('sync-worker/migrations/002_submission_receipts.sql','utf8'));}
 prepare(sql){const s=this.db.prepare(sql);let v=[];return{bind(...x){v=x;return this;},async first(){return s.get(...v)||null;},async all(){return{results:s.all(...v)};},async run(){return{meta:{changes:Number(s.run(...v).changes)}};}};}
 async batch(ss){this.db.exec('BEGIN');try{for(const s of ss)await s.run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function fixture(){
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(require('./helpers/sync-worker-source.cjs')()).toString('base64'))).default;
 const db=new DB(),row={campaign:'Test',shortName:'New',submissionForm:'Proposal',promoType:'Item Set',editButtonId:'edit:rev-001:1',revisionId:'rev-001',revisionPending:true,itStatus:'PENDING',codePromotion:'P1001',codeItemSet:'1071001',itemPromotion:'1071001',itemCode:'101003',buttonOrder:1};
 const block={_ts:1,m:{'2026-10':[{...row,shortName:'Old',editButtonId:'old:1',codePromotion:'P1000',codeItemSet:'1071000'},row,{...row,itemCode:'101004'}]},w:[{...row,month:'2026-10'}]};
 const counter={types:{promo:{seeded:true,cursor:1001},itemset:{seeded:true,cursor:1001}},reservations:{'promo::P1001':{code:'P1001',type:'promo',status:'RESERVED',where:'Test',field:'CampaignEdit|rev-001|new:button001|codePromotion'}},log:[]};
 function put(key,val,version=1){db.db.prepare('INSERT OR REPLACE INTO promo_store VALUES(?,?,?)').run(key,JSON.stringify(val),version);}
 put('promo::c::Test',block);put('pc_code_counter_v1',counter);
 const body={requestId:'it-code-test-001',actor:'IT',campaign:'Test',month:'2026-10',buttonId:row.editButtonId,revisionId:row.revisionId,expectedUpdatedAt:1,slot:'promotion',mode:'manual',code:'P2000'};
 const call=async input=>{const r=await worker.fetch(new Request('https://test/promo/it-button-code',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(input)}),{DB:db,SYNC_TOKEN:'test',CLOUD_FIRST_ENABLED:'true'});return{status:r.status,body:await r.json()};};
 return{db,block,body,put,call,read:key=>JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v)};
}
test('IT manually assigns a new revision button code atomically and retries without allocating twice',async()=>{
 const f=await fixture(),r=await f.call(f.body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.code,'P2000');
 const saved=f.read('promo::c::Test');assert.equal(saved.m['2026-10'][0].codePromotion,'P1000');assert.deepEqual(saved.m['2026-10'].slice(1).map(r=>r.codePromotion),['P2000','P2000']);assert.equal(saved.w[0].codePromotion,'P2000');
 assert.equal(f.read('pc_code_counter_v1').reservations['promo::P2000'].status,'RESERVED');assert.equal((await f.call(f.body)).body.replayed,true);
});
test('IT automatic Item Set allocation updates both Item Set fields and keeps old reservations',async()=>{
 const f=await fixture(),r=await f.call({...f.body,slot:'itemset',mode:'auto'});assert.equal(r.status,200,JSON.stringify(r));assert.match(r.body.code,/^107\d+$/);assert.ok(Number(r.body.code.slice(3))>1001);assert.equal(globalThis.PC_Email.settlementCatalog.codes.includes(r.body.code),false);
 const row=f.read('promo::c::Test').m['2026-10'][1];assert.equal(row.codeItemSet,r.body.code);assert.equal(row.itemPromotion,r.body.code);assert.equal(row.posReady,false);
});
test('IT cannot change stale, settled or cancelled revision buttons',async()=>{
 for(const patch of [{revisionId:'other'},{revisionPending:false},{itStatus:'COMPLETE'},{itSettlementSavedAt:'2026-10-18'},{changeStatus:'CANCELLED'}]){
  const f=await fixture();f.block.m['2026-10'].slice(1).forEach(r=>Object.assign(r,patch));if(patch.editButtonId)f.body.buttonId=patch.editButtonId;f.put('promo::c::Test',f.block);
  assert.notEqual((await f.call(f.body)).status,200,JSON.stringify(patch));assert.equal(f.read('pc_code_counter_v1').types.promo.cursor,1001);
 }
});
test('duplicate, invalid and concurrently allocated codes never partially change the job',async()=>{
 for(const mode of ['duplicate','string-codes','invalid','counter-race','campaign-race','reference-race','string-reference-race','deleted']){
  const f=await fixture();if(mode==='duplicate')f.put('pc_member_coupons',{card:[{code:'P2000'}]});
  if(mode==='string-codes')f.put('pc_code_requests',[{codes:['P2000']}]);
  if(mode==='invalid')f.body.code='VC2000';
  if(mode==='deleted')f.put('promo::deleted',{Test:Date.now()});
  if(mode.endsWith('race')){const original=f.db.batch.bind(f.db);f.db.batch=async ss=>{if(mode==='string-reference-race')f.put('pc_code_requests',[{codes:['P2000']}]);else if(mode==='reference-race')f.put('pc_member_coupons',{card:[{code:'P2000'}]});else f.db.db.prepare('UPDATE promo_store SET updated_at=2 WHERE k=?').run(mode==='counter-race'?'pc_code_counter_v1':'promo::c::Test');return original(ss);};}
  assert.notEqual((await f.call(f.body)).status,200,mode);assert.equal(f.read('promo::c::Test').m['2026-10'][1].codePromotion,'P1001');assert.equal(f.read('pc_code_counter_v1').types.promo.cursor,1001);
 }
});

test('IT can change a previously live button in a pending revision while retaining its old code',async()=>{
 const f=await fixture();f.body.buttonId='old:1';f.block.m['2026-10'][0].wentLive=true;f.put('promo::c::Test',f.block);
 const counter=f.read('pc_code_counter_v1');counter.reservations['promo::P1000']={code:'P1000',type:'promo',status:'CONFIRMED',where:'Test',field:'old-field'};f.put('pc_code_counter_v1',counter);
 const r=await f.call(f.body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(f.read('promo::c::Test').m['2026-10'][0].codePromotion,'P2000');
 assert.equal(f.read('promo::c::Test').m['2026-10'][1].codePromotion,'P1001');
 const old=f.read('pc_code_counter_v1').reservations['promo::P1000'];assert.equal(old.status,'CONFIRMED');assert.equal(old.retainForHistory,true);
 const activity=JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k LIKE 'promo::activity::%'").get().v);assert.equal(activity.oldCode,'P1000');assert.equal(activity.code,'P2000');
});
