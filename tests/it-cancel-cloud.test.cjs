const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
class DB{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at INTEGER NOT NULL)');this.db.exec(fs.readFileSync('sync-worker/migrations/002_submission_receipts.sql','utf8'));}
 prepare(sql){const s=this.db.prepare(sql);let args=[];return{bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async all(){return{results:s.all(...args)};},async run(){return{meta:{changes:Number(s.run(...args).changes)}};}};}
 async batch(ss){this.db.exec('BEGIN');try{for(const s of ss)await s.run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
test('actual Cloud adapter deletes all months atomically and never tombstones a concurrently completed job',async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(require('./helpers/sync-worker-source.cjs')()).toString('base64'))).default;
 for(const race of [false,true]){
  const db=new DB(),campaign='Test UOB',key='promo::c::'+encodeURIComponent(campaign);
  const meta={_npdSeeded:true,_flvSeeded:true,_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1,_billDiscVer:4,_vcCouponVer:2,_proJulyVer:2};
  const row={campaign,shortName:'UOB 30',promoType:'Bill Discount',codePromotion:'BD9001',itStatus:'PENDING',opStatus:'WAITING'};
  const block={m:{'2026-11':[row],'2026-12':[{...row}],'2027-01':[{...row}]},w:[],_ts:10};
  const counter={v:1,migItemset:2,types:{bill:{cursor:9001,seeded:true}},reservations:{'bill::BD9001':{type:'bill',code:'BD9001',num:9001,status:'RESERVED',where:campaign,field:'test'}},log:[]};
  const requests=[{id:'CR-1',campaign,createdAt:1,codes:[],codeSeq:[['UOB',1,6001,5]]},{id:'CR-2',campaign:'Other',createdAt:1,codes:['OTHER']}];
  for(const[k,v]of Object.entries({[key]:block,'promo::meta':meta,'promo::deleted':{[campaign]:1},pc_code_counter_v1:counter,pc_code_requests:requests,pc_co_promotions:[{id:'linked',campaign,createdAt:10,codePromotion:'BD9001'},{id:'other',campaign:'Other',createdAt:10}], 'pc_copro_drafts::MKT':{items:{linked:{campaign},other:{campaign:'Other'}}}}))db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run(k,JSON.stringify(v),1);
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const c={URL,Date,Math,localStorage:storage,console:{log(){},warn(){},error(){}},setTimeout(){return 1;},clearTimeout(){},setInterval(){},location:{hostname:'localhost'},navigator:{onLine:true},document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[];}},addEventListener(){},PC_REAL_PROMOS:[],fetch:async(url,o={})=>worker.fetch(new Request('https://test'+new URL(url).pathname,{...o,headers:{Authorization:'Bearer test','Content-Type':'application/json'}}),{DB:db,SYNC_TOKEN:'test',CLOUD_FIRST_ENABLED:'true'})};c.window=c;vm.createContext(c);
  c.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={objectStore(){return{add(){queueMicrotask(()=>tx.oncomplete?.());},getAllKeys(){const q={};queueMicrotask(()=>{q.result=[];q.onsuccess?.();tx.oncomplete?.();});return q;},delete(){}};}};return tx;}};request.onsuccess();});return request;}};
  for(const file of ['js/mock-backend.js','js/code-counter.js','js/cloud-store.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  await c.PC_CLOUD.pull();c.PC_API.reloadFromStorage();c.PC_COUNTER.reloadFromStorage();
  const cancelled=c.PC_API.cancelUnsettledITCampaign(campaign,'2026-11');assert.equal(cancelled.status,'success');
  if(race){block.m['2027-01'][0].itStatus='COMPLETE';db.db.prepare('UPDATE promo_store SET v=?,updated_at=2 WHERE k=?').run(JSON.stringify(block),key);}
  if(race)await assert.rejects(()=>c.PC_CLOUD.syncNow());else await c.PC_CLOUD.syncNow();
  assert.equal(db.db.prepare('SELECT count(*) n FROM promo_store WHERE k=?').get(key).n,race?1:0);
  const shared=JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k='pc_co_promotions'").get().v);assert.equal(shared.some(r=>r.campaign===campaign),race);assert.ok(shared.some(r=>r.campaign==='Other'));
  const drafts=JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k='pc_copro_drafts::MKT'").get().v);assert.equal(Boolean(drafts.items.linked),race);assert.ok(drafts.items.other);
  const tomb=db.db.prepare("SELECT v FROM promo_store WHERE k='promo::deleted'").get();assert.equal(Number(JSON.parse(tomb.v)[campaign])>10,!race);
  assert.deepEqual(JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_requests'").get().v),race?requests:[requests[1]]);
  if(race)assert.equal(JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_counter_v1'").get().v).reservations['bill::BD9001'].status,'RESERVED');
  else {
   // A stale browser must not revive old attached codes, including compressed ranges.
   data.set('pc_code_requests',JSON.stringify(requests));
   await c.PC_CLOUD.pull({force:true});
   assert.deepEqual(JSON.parse(data.get('pc_code_requests')),[requests[1]]);
   const fresh={id:'CR-new',campaign,createdAt:Date.now()+1000,codes:['NEW']};
   db.db.prepare("UPDATE promo_store SET v=?,updated_at=updated_at+1 WHERE k='pc_code_requests'").run(JSON.stringify([...requests,fresh]));
   data.delete('pc_code_requests');
   await c.PC_CLOUD.pull({force:true});
   assert.deepEqual(JSON.parse(data.get('pc_code_requests')),[requests[1],fresh]);
   await c.PC_CLOUD.syncNow();
   assert.deepEqual(JSON.parse(db.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_requests'").get().v),[requests[1],fresh]);

   c.PC_API.reloadFromStorage();assert.equal(c.PC_API.checkCampaignName(campaign),false);assert.equal(c.PC_API.getITTasks('ALL').some(r=>r.campaign===campaign),false);}
 }
});
