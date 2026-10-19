const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const M=require('../js/promotion-edit-model.js');
class DB{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at INTEGER NOT NULL)');this.db.exec(fs.readFileSync('sync-worker/migrations/002_submission_receipts.sql','utf8'));}
 prepare(sql){const s=this.db.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async first(){return s.get(...values)||null;},async all(){return {results:s.all(...values)};},async run(){return {meta:{changes:Number(s.run(...values).changes)}};}};}
 async batch(ss){this.db.exec('BEGIN');try{for(const s of ss)await s.run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function setup(){
 const source=require('./helpers/sync-worker-source.cjs')(),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const db=new DB(),block={m:{'2026-11':[{campaign:'TOTO',shortName:'Fries',submittedBy:'Bow',itStatus:'PENDING',opStatus:'WAITING',promoType:'Item Set',qty:1,gross:95,netPrice:85,itemCode:'101003',detail:'old',mechanic:'เงื่อนไข',start:'2026-11-01',end:'2026-11-30',stores:'ALL STORES',saleMode:'LINEMAN',codePromotion:'P100',codeItemSet:'1071001'}]},w:[]};
 db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::c::TOTO',JSON.stringify(block),1);
 const env={DB:db,SYNC_TOKEN:'test',CLOUD_FIRST_ENABLED:'true'};
 const call=async body=>{const r=await worker.fetch(new Request('https://test/promo/campaign-edits',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}),env);return {status:r.status,body:await r.json()};};
 const body={editId:'edit-test-0001',actor:'Bow',campaign:'TOTO',month:'2026-11',expectedUpdatedAt:1,form:M.toForm(block,'2026-11')};body.form.fields.detail='new';return {db,block,body,call};
}
test('Cloud edit replaces one existing job and returns replayable verified receipt without new codes',async()=>{
 const{db,body,call}=await setup();const r=await call(body);assert.equal(r.status,200);assert.equal(r.body.kind,'CAMPAIGN_EDIT');
 const saved=JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get('promo::c::TOTO').v);assert.equal(saved.m['2026-11'][0].detail,'new');assert.equal(saved.m['2026-11'][0].codeItemSet,'1071001');
 assert.equal((await call(body)).body.replayed,true);assert.equal(db.db.prepare("SELECT count(*) n FROM promo_store WHERE k LIKE 'promo::c::%'").get().n,1);
});
test('manual codes cannot collide with another campaign or appear during the commit race',async()=>{
 for(const race of [false,true]){
  const f=await setup();f.body.form.buttons.push({...f.body.form.buttons[0],id:'new:button001',isNew:true,shortName:'New',kitchen:'Fries',codeAllocation:{promotion:{mode:'manual',code:'P9500'},itemset:{mode:'manual',code:'1079500'}},items:[{...f.body.form.buttons[0].items[0],id:''}]});
  f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify({types:{promo:{seeded:true,cursor:9000},itemset:{seeded:true,cursor:9000}},reservations:{},log:[]}),1);
  const conflict=()=>f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::c::Other',JSON.stringify({m:{'2026-12':[{codePromotion:'P9500'}]}}),2);
  if(race){const batch=f.db.batch.bind(f.db);f.db.batch=async ss=>{conflict();return batch(ss);};}else conflict();
  const result=await f.call(f.body);assert.ok([400,409].includes(result.status),JSON.stringify(result));
  assert.equal(JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='promo::c::TOTO'").get().v).m['2026-11'].length,1);
  assert.equal(f.db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);
 }
});
test('member-coupon references reject manually entered codes including concurrent insertion',async()=>{
 for(const race of [false,true]){
  const f=await setup();f.body.form.buttons.push({...f.body.form.buttons[0],id:'new:button001',isNew:true,shortName:'New',kitchen:'Fries',codeAllocation:{promotion:{mode:'manual',code:'P9500'},itemset:{mode:'manual',code:'1079500'}},items:[{...f.body.form.buttons[0].items[0],id:''}]});
  f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify({types:{promo:{seeded:true,cursor:9000},itemset:{seeded:true,cursor:9000}},reservations:{},log:[]}),1);
  const conflict=()=>f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_member_coupons',JSON.stringify({card:[{code:'P9500'}]}),2);
  if(race){const batch=f.db.batch.bind(f.db);f.db.batch=async ss=>{conflict();return batch(ss);};}else conflict();
  assert.ok([400,409].includes((await f.call(f.body)).status));assert.equal(f.db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);
 }
});
test('campaign deletion and tombstone are atomic and reject a saved job that races confirmation',async()=>{
 for(const race of [false,true]){
  const f=await setup();if(race)f.db.db.prepare("UPDATE promo_store SET updated_at=2 WHERE k='promo::c::TOTO'").run();
  const response=await (await import('data:text/javascript;base64,'+Buffer.from(require('./helpers/sync-worker-source.cjs')()).toString('base64'))).default.fetch(new Request('https://test/promo/store/'+encodeURIComponent('promo::deleted'),{method:'PUT',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({value:JSON.stringify({TOTO:Date.now()}),expectedUpdatedAt:null,deletedCampaignVersions:{'promo::c::TOTO':1}})}),{DB:f.db,SYNC_TOKEN:'test'});
  assert.equal(response.status,race?409:200);
  assert.equal(f.db.db.prepare("SELECT count(*) n FROM promo_store WHERE k='promo::c::TOTO'").get().n,race?1:0);
  assert.equal(f.db.db.prepare("SELECT count(*) n FROM promo_store WHERE k='promo::deleted'").get().n,race?0:1);
 }
});
test('structural Coupon edit commits counter once and rolls back on concurrent allocation',async()=>{
 for(const race of [false,true]){
  const f=await setup();f.block.m['2026-11'][0].promoType='Item Coupon';f.block.m['2026-11'][0].submissionForm='Coupon';f.db.db.prepare("UPDATE promo_store SET v=? WHERE k='promo::c::TOTO'").run(JSON.stringify(f.block));f.body.form=M.toForm(f.block,'2026-11');
  f.body.form.buttons.push({...f.body.form.buttons[0],id:'new:button001',isNew:true,shortName:'New',items:[{...f.body.form.buttons[0].items[0],id:''}]});
  const counter={types:{coupon:{seeded:true,cursor:700}},reservations:{},log:[]};f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify(counter),1);
  if(race){const batch=f.db.batch.bind(f.db);f.db.batch=async ss=>{f.db.db.prepare("UPDATE promo_store SET updated_at=2 WHERE k='pc_code_counter_v1'").run();return batch(ss);};}
  const result=await f.call(f.body);assert.equal(result.status,race?409:200);
  const saved=JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='promo::c::TOTO'").get().v);
  assert.equal(saved.m['2026-11'].length,race?1:2);
  if(!race){assert.equal(saved.m['2026-11'][1].codePromotion,'IC0701');assert.equal((await f.call(f.body)).body.replayed,true);}
  assert.equal(JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_counter_v1'").get().v).types.coupon.cursor,race?700:701);
 }
});
test('deleting a resource registry before batch cannot resurrect it or commit the edit',async()=>{
 const f=await setup();f.block.m['2026-11'][0].submissionForm='Coupon';f.db.db.prepare("UPDATE promo_store SET v=? WHERE k='promo::c::TOTO'").run(JSON.stringify(f.block));f.body.form=M.toForm(f.block,'2026-11');
 f.body.form.buttons.push({...f.body.form.buttons[0],id:'new:button001',isNew:true,shortName:'New',items:[{...f.body.form.buttons[0].items[0],id:''}]});
 f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify({types:{coupon:{seeded:true,cursor:700}},reservations:{},log:[]}),1);
 const batch=f.db.batch.bind(f.db);f.db.batch=async ss=>{f.db.db.prepare("DELETE FROM promo_store WHERE k='pc_code_counter_v1'").run();return batch(ss);};
 assert.equal((await f.call(f.body)).status,409);assert.equal(f.db.db.prepare("SELECT count(*) n FROM promo_store WHERE k='pc_code_counter_v1'").get().n,0);assert.equal(f.db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);
 assert.equal(JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='promo::c::TOTO'").get().v).m['2026-11'].length,1);
});
test('persisted removal and changed existing order retain old codes and audit full previous rows',async()=>{
 const f=await setup(),a=f.block.m['2026-11'][0];Object.assign(a,{submissionForm:'Coupon',promoType:'Item Coupon',codePromotion:'IC0688',codeItemSet:''});
 f.block.m['2026-11'].push({...a,shortName:'Second',codePromotion:'IC0689'},{...a,shortName:'Third',codePromotion:'IC0690'});f.db.db.prepare("UPDATE promo_store SET v=? WHERE k='promo::c::TOTO'").run(JSON.stringify(f.block));
 const counter={types:{coupon:{cursor:700,seeded:true}},reservations:{'coupon::IC0688':{code:'IC0688',type:'coupon',num:688,status:'RESERVED',at:'2026-01-01'}},log:[]};f.db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify(counter),1);
 f.body.form=M.toForm(f.block,'2026-11');f.body.form.buttons=f.body.form.buttons.slice(1).reverse();
 assert.equal((await f.call(f.body)).status,200);
 const saved=JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='promo::c::TOTO'").get().v);
 assert.deepEqual(saved.m['2026-11'].map(r=>r.shortName),['Third','Second']);assert.deepEqual(saved.m['2026-11'].map(r=>r.codePromotion),['IC0690','IC0689']);
 assert.equal(JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_counter_v1'").get().v).reservations['coupon::IC0688'].retainForHistory,true);
 assert.equal(JSON.parse(f.db.db.prepare("SELECT v FROM promo_store WHERE k LIKE 'promo::activity::%'").get().v).previousRows.length,3);
});
test('test MKT exception is applied on Cloud, preserves sender and audits the actual editor',async()=>{
 const {db,body,call}=await setup();body.actor='MKT Team';
 assert.equal((await call(body)).status,200);
 const row=JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get('promo::c::TOTO').v).m['2026-11'][0];
 assert.equal(row.submittedBy,'Bow');assert.equal(row.editedBy,'MKT Team');assert.equal(row.detail,'new');assert.equal(row.codeItemSet,'1071001');
 const event=JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k LIKE 'promo::activity::%'").get().v);assert.equal(event.user,'MKT Team');
 const locked=await setup();locked.body.actor='MKT Team';locked.block.m['2026-11'][0].itSettlementSavedAt='today';locked.db.db.prepare('UPDATE promo_store SET v=?').run(JSON.stringify(locked.block));
 assert.equal((await locked.call(locked.body)).status,400);
});
test('edit and one audit event commit together; replay creates no duplicate history',async()=>{
 const {db,body,call}=await setup();await call(body);await call(body);
 const events=db.db.prepare("SELECT v FROM promo_store WHERE k LIKE 'promo::activity::%'").all();assert.equal(events.length,1);const event=JSON.parse(events[0].v);assert.equal(event.kind,'EDITED');assert.equal(event.user,'Bow');assert.equal(event.editId,body.editId);
});
test('IT completion between read and commit rejects the entire edit transaction',async()=>{
 const {db,body,block,call}=await setup(),batch=db.batch.bind(db);db.batch=async statements=>{block.m['2026-11'][0].itStatus='COMPLETE';db.db.prepare('UPDATE promo_store SET v=?,updated_at=2 WHERE k=?').run(JSON.stringify(block),'promo::c::TOTO');return batch(statements);};
 const r=await call(body);assert.equal(r.status,409);assert.equal(JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get('promo::c::TOTO').v).m['2026-11'][0].detail,'old');assert.equal(db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);assert.equal(db.db.prepare("SELECT count(*) n FROM promo_store WHERE k LIKE 'promo::activity::%'").get().n,0);
});
test('Cloud rejects another sender, stale versions and an IT close that happened while editing',async()=>{
 for(const mode of ['owner','version','closed']){const{db,body,block,call}=await setup();if(mode==='owner')body.actor='Other';if(mode==='version')body.expectedUpdatedAt=0;if(mode==='closed'){block.m['2026-11'][0].itSettlementSavedAt='today';db.db.prepare('UPDATE promo_store SET v=?').run(JSON.stringify(block));}
 const r=await call(body);assert.ok([400,403,409].includes(r.status),mode+': '+r.status);assert.equal(db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);}
});
test('Cloud requeues completed work and commits prior OP/IT evidence with one immutable activity',async()=>{
 const {db,body,block,call}=await setup();Object.assign(block.m['2026-11'][0],{itStatus:'COMPLETE',opStatus:'CONFIRMED',itDoneDate:'2026-10-15',opDoneDate:'2026-10-15'});db.db.prepare('UPDATE promo_store SET v=?').run(JSON.stringify(block));body.form.editReason='แก้รายละเอียด';
 assert.equal((await call(body)).status,200);assert.equal((await call(body)).body.replayed,true);
 const r=JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get('promo::c::TOTO').v).m['2026-11'][0];assert.equal(r.revisionPending,true);assert.equal(r.itStatus,'PENDING');assert.equal(r.opStatus,'WAITING');
 const events=db.db.prepare("SELECT v FROM promo_store WHERE k LIKE 'promo::activity::%'").all();assert.equal(events.length,1);const e=JSON.parse(events[0].v);assert.equal(e.previousRows[0].opStatus,'CONFIRMED');assert.equal(e.previousRows[0].itDoneDate,'2026-10-15');assert.equal(e.note,'แก้รายละเอียด');assert.equal(e.returnedToIT,true);
});
test('a deletion tombstone must not be bypassed by an open edit form',async()=>{
 const {db,body,call}=await setup();db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::deleted',JSON.stringify({TOTO:100}),100);
 const r=await call(body);assert.equal(r.status,409);assert.equal(db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);
});
test('deletion during commit rolls back edit and history even without a campaign version change',async()=>{
 const{db,body,call}=await setup(),batch=db.batch.bind(db);db.batch=async statements=>{db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::deleted',JSON.stringify({TOTO:100}),100);return batch(statements);};
 assert.equal((await call(body)).status,409);assert.equal(db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,0);assert.equal(JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get('promo::c::TOTO').v).m['2026-11'][0].detail,'old');
});
test('a restored campaign newer than its old deletion remains editable',async()=>{
 const{db,body,block,call}=await setup();block._ts=101;db.db.prepare('UPDATE promo_store SET v=? WHERE k=?').run(JSON.stringify(block),'promo::c::TOTO');db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::deleted',JSON.stringify({TOTO:100}),100);
 assert.equal((await call(body)).status,200);
});
