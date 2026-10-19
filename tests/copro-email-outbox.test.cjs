const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,actor,grant}=require('./helpers/copro-context.cjs');
async function fixture(mode='test'){
  const a=load(['templates','gmail','registry','copro-model','copro-service','outbox']),DB=database(),env={DB,EMAIL_COPRO_ENABLED:'true',EMAIL_TEST_SEND_ENABLED:'true',EMAIL_CONNECTION_ENABLED:'true'};
  DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');grant(DB,actor,'submit');
  const rows=[{campaign:'Pilot',shortName:'A',itemCode:'101001',qty:1}],block={m:{'2026-10':rows},w:[]},hash=await a.hash(JSON.stringify(a.coProSource(block,'2026-10')));
  DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('promo::c::Pilot',JSON.stringify(block));
  DB.db.prepare('INSERT INTO email_campaigns VALUES(?,?,?,?,?,?,?,?,1,\'active\')').run('c','promo::c::Pilot','2026-10','batch',actor.tenantId,actor.objectId,hash,JSON.stringify(rows));
  DB.db.exec("INSERT INTO email_campaign_buttons(campaign_id,button_id,source_identity_json,it_done) VALUES('c','button','{}',1);INSERT INTO email_copro_records(id,campaign_id,button_id,record_json,interface_done) VALUES('record','c','button','{}',1);");
  DB.db.prepare('INSERT INTO email_threads(id,thread_id,message_id,rfc_message_id,references_json,subject,to_json,cc_json,audience_json,version,mode,enabled,published_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,\'test\',1,?,1)').run('t','provider','m','<m@example.com>','[]','Test send to email copro UOB','["test@example.net"]','[]',JSON.stringify([actor]),'manager');
  DB.db.prepare('INSERT INTO email_bindings VALUES(?,?,?,?,?,?,?,1)').run('c','t',1,'{"to":["test@example.net"],"cc":[]}','hash','actor',1);
  DB.db.prepare('INSERT INTO email_connections VALUES(1,\'it@rocks-foods.com\',\'connected\',\'cipher\',\'scopes\',\'now\',\'now\',1)').run();
  DB.db.prepare('UPDATE email_threads SET delivery_mode=?').run(mode);
  const snap={deliveryMode:mode,threadId:'provider',rfcMessageId:'<m@example.com>',subject:'Test send to email copro UOB',references:[],recipients:{to:['test@example.net'],cc:[]},milestone:'submitted',details:{campaign:'Pilot',buttons:[]}};
  const insert=(id,milestone)=>DB.db.prepare("INSERT INTO email_outbox(id,event_key,campaign_id,binding_version,snapshot_json,status,created_at,updated_at) VALUES(?,?,?,1,?,'queued',1,1)").run(id,'c:2026-10:'+milestone,'c',JSON.stringify({...snap,milestone}));
  insert('first','submitted');insert('second','it_interface_complete');
  a.gmailAccess=async()=> 'mock';a.gmailMessage=async()=>({messageId:'m',threadId:'provider',headers:{'message-id':'<m@example.com>',subject:'Test send to email copro UOB',references:''}});return {a,DB,env};
}
test('only one dispatcher accepts each event and submission precedes completion',async()=>{
  const {a,DB,env}=await fixture();let sends=0;
  a.sendReply=async()=>{sends++;return {outcome:'accepted',providerId:'provider'+sends};};
  await Promise.all([a.dispatchEmail(env),a.dispatchEmail(env)]);
  assert.equal(sends,2);assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='accepted'").get().n,2);await a.dispatchEmail(env);assert.equal(sends,2);DB.db.close();
});
test('revocation during token refresh holds the event before provider delivery',async()=>{
  const {a,DB,env}=await fixture();let sends=0;
  a.gmailAccess=async()=>{DB.db.exec('UPDATE email_threads SET enabled=0');return 'mock';};
  a.sendReply=async()=>{sends++;return {outcome:'accepted',providerId:'unexpected'};};
  await a.dispatchEmail(env);assert.equal(sends,0);assert.equal(DB.db.prepare("SELECT status FROM email_outbox WHERE id='first'").get().status,'held');DB.db.close();
});
test('missing or changed original Gmail message holds the event',async()=>{
  for(const missing of [true,false]){
    const {a,DB,env}=await fixture();let sends=0;
    a.gmailMessage=async()=>{if(missing)throw Error('gone');return {messageId:'m',threadId:'different',headers:{}};};
    a.sendReply=async()=>{sends++;return {outcome:'accepted',providerId:'unexpected'};};
    await a.dispatchEmail(env);assert.equal(sends,0);assert.equal(DB.db.prepare("SELECT status FROM email_outbox WHERE id='first'").get().status,'held');DB.db.close();
  }
});
test('ambiguous send holds completion and never automatically retries; revoked policy sends nothing',async()=>{
  const {a,DB,env}=await fixture();let sends=0;a.sendReply=async()=>{sends++;return {outcome:'ambiguous'};};
  await a.dispatchEmail(env);await a.dispatchEmail(env);assert.equal(sends,1);assert.equal(DB.db.prepare("SELECT status FROM email_outbox WHERE id='first'").get().status,'needs_verification');
  DB.db.exec("UPDATE email_outbox SET status='queued' WHERE id='first';UPDATE email_threads SET enabled=0");await a.dispatchEmail(env);assert.equal(sends,1);assert.equal(DB.db.prepare("SELECT status FROM email_outbox WHERE id='first'").get().status,'held');DB.db.close();
});

test('production and test switches only dispatch their matching explicitly approved loops',async()=>{
 for(const mode of ['test','production'])for(const enabled of [false,true]){
  const {a,DB,env}=await fixture(mode);let sends=0;
  env.EMAIL_TEST_SEND_ENABLED=mode==='test'?String(enabled):'true';env.EMAIL_SEND_ENABLED=mode==='production'?String(enabled):'true';
  a.sendReply=async()=>{sends++;return {outcome:'accepted',providerId:'mock'};};
  await a.dispatchEmail(env);assert.equal(sends,enabled?2:0,mode+' enabled='+enabled);
  if(!enabled)assert.equal(DB.db.prepare("SELECT status FROM email_outbox WHERE id='first'").get().status,'queued');
  DB.db.close();
 }
});
