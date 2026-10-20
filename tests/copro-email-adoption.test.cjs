const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,grant}=require('./helpers/copro-context.cjs');
async function fixture(){
 const a=load(['owner-session','templates','gmail','registry','copro-model','copro-service']),DB=database(),env={DB,EMAIL_AUTH_MODE:'gmail_owner'},actor={tenantId:'00000000-0000-4000-8000-000000000001',objectId:'00000000-0000-4000-8000-000000000002'};
 DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER); CREATE TABLE promo_commit_guard(id INTEGER PRIMARY KEY CHECK(id=1));');grant(DB,actor,'submit');grant(DB,actor,'manage');
 DB.db.prepare("INSERT INTO email_connections(id,status,updated_at,generation) VALUES(1,'connected','now',1)").run();
 const key='promo::c::Legacy',block={_ts:1,m:{'2026-10':[{campaign:'Legacy',shortName:'A',codePromotion:'IC001',itemCode:'101001',gross:55}]},w:[]};DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run(key,JSON.stringify(block));
 return {a,DB,env,actor,block,input:{campaignKey:key,month:'2026-10',expectedSourceVersion:1,confirmed:true}};
}
test('explicit owner adoption preserves business fields, assigns stable IDs and sends nothing',async()=>{
 const {a,DB,env,actor,block,input}=await fixture(),result=await a.adoptCoProCampaign(actor,input,env);
 const current=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(input.campaignKey).v).m[input.month][0];for(const [k,v] of Object.entries(block.m[input.month][0]))assert.equal(current[k],v);assert.equal(current.emailCampaignId,result.id);assert.ok(current.emailButtonId);assert.ok(current.emailRowId);assert.ok(current.submissionBatchId);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_bindings').get().n,0);
 await assert.rejects(a.adoptCoProCampaign(actor,input,env));assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_campaigns').get().n,1);DB.db.close();
});
test('adoption rejects stale source, no confirmation, foreign IDs, revoked authority, tombstones and races',async()=>{
 for(const kind of ['stale','confirmation','foreign','registration','permission','connection','tombstone','race','revocation']){
  const {a,DB,env,actor,block,input}=await fixture();
  if(kind==='stale')input.expectedSourceVersion=0;
  if(kind==='confirmation')input.confirmed=false;
  if(kind==='foreign'){block.m[input.month][0].emailCampaignId='foreign';DB.db.prepare('UPDATE promo_store SET v=? WHERE k=?').run(JSON.stringify(block),input.campaignKey);}
  if(kind==='registration')DB.db.prepare("INSERT INTO email_campaigns VALUES('foreign',?,?,'batch','other','other','hash','[]',1,'cancelled')").run(input.campaignKey,input.month);
  if(kind==='permission')DB.db.exec("UPDATE email_actor_permissions SET enabled=0 WHERE permission='manage'");
  if(kind==='connection')DB.db.exec("UPDATE email_connections SET status='disconnected'");
  if(kind==='tombstone')DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('promo::deleted',JSON.stringify({Legacy:2}));
  if(kind==='race'||kind==='revocation'){const batch=DB.batch.bind(DB);DB.batch=async statements=>{DB.db.exec(kind==='race'?"UPDATE promo_store SET updated_at=2":"UPDATE email_actor_permissions SET enabled=0 WHERE permission='submit'");return batch(statements);};}
  const before=DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(input.campaignKey).v;
  await assert.rejects(a.adoptCoProCampaign(actor,input,env),kind);assert.equal(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(input.campaignKey).v,before);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_campaigns').get().n,kind==='registration'?1:0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();
 }
});
