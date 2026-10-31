const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,actor,grant}=require('./helpers/copro-context.cjs');
// Lifecycle (extend / shorten / cancel) mail, loop re-binding and IT replies for non-CoPromo work.
async function fixture(options={}){
 const a=load(['staff','templates','gmail','registry','copro-model','copro-service','outbox']),DB=database(),env={DB};
 DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER); CREATE TABLE promo_commit_guard(id INTEGER PRIMARY KEY CHECK(id=1)); CREATE TABLE promo_submission_receipts(submission_id TEXT PRIMARY KEY,response_json TEXT)');
 grant(DB,actor,'submit');grant(DB,actor,'it');
 const row={campaign:'Lifecycle test',shortName:'Button A',submissionBatchId:'batch-5678',promoType:'Item Coupon',start:'2026-10-19',end:'2026-11-01',itemCode:'101001',qty:1,gross:55,netPrice:45,codePromotion:'IC001'};
 const block={m:{'2026-10':[row,{...row,shortName:'Button B',codePromotion:'IC002'}]},w:[]};
 const input={submissionId:'batch-5678',writes:[{key:'promo::c::Lifecycle%20test',value:JSON.stringify(block),expectedUpdatedAt:null}]};
 const prep=await a.preparePilotSubmission(actor,input,env);await DB.batch(prep.statements);
 DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run(input.writes[0].key,input.writes[0].value);
 const c=prep.campaigns[0],buttons=(await DB.prepare('SELECT * FROM email_campaign_buttons WHERE campaign_id=?').bind(c.id).all()).results;
 const thread=(id,threadId,message,rfc)=>DB.db.prepare('INSERT INTO email_threads(id,thread_id,message_id,rfc_message_id,references_json,subject,to_json,cc_json,audience_json,version,mode,enabled,published_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,\'test\',1,?,?)').run(id,threadId,message,rfc,'[]','Test send to email copro UOB','["test@example.net"]','[]',JSON.stringify([actor]),'manager',Date.now());
 thread('policy','provider-thread','m1','<m1@example.com>');thread('other','other-thread','m2','<m2@example.com>');
 if(options.newMessage)thread('fresh','','new:fresh','');
 const draft={campaignId:c.id,expectedVersion:1,policyId:options.newMessage?'fresh':'policy',policyVersion:1,recipients:{to:['test@example.net'],cc:[]},confirmed:true,notificationOnly:!options.copro,records:options.copro?buttons.map(b=>({buttonId:b.button_id,brand:'Partner',detail:'Internal',remark:'Internal accounting remark',soNo:'SO-SECRET'})):[]};
 draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;
 if(options.send!==false)await a.commitCoPromo(actor,draft,env);
 return {a,DB,env,c,buttons};
}
function cloud(DB,c,mutate){const block=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v);mutate(block.m[c.month]);DB.db.prepare('UPDATE promo_store SET v=?,updated_at=updated_at+1 WHERE k=?').run(JSON.stringify(block),c.key);}
const events=(DB,pattern)=>DB.db.prepare('SELECT * FROM email_outbox WHERE event_key LIKE ? ORDER BY created_at').all(pattern);
const itDone=(a,env,c,month='2026-10')=>a.commitITDone(actor,{campaignKey:c.key,month},env);
const extend=(DB,c,changeId,end='2026-11-30',status='EXTENDED')=>cloud(DB,c,rows=>rows.forEach(r=>Object.assign(r,{changeId,changePreviousEnd:r.end,end,changeStatus:status,itStatus:'PENDING'})));
function dispatchEnv(a,DB,env,gmail={}){
 Object.assign(env,{EMAIL_CONNECTION_ENABLED:'true',EMAIL_COPRO_ENABLED:'true',EMAIL_TEST_SEND_ENABLED:'true'});
 DB.db.prepare("INSERT INTO email_connections VALUES(1,'it@rocks-foods.com','connected','cipher','scopes','now','now',1)").run();
 a.gmailAccess=async()=> 'mock';
 a.gmailMessage=async id=>gmail[id]||({m1:{messageId:'m1',threadId:'provider-thread',headers:{'message-id':'<m1@example.com>',subject:'Test send to email copro UOB',references:''}},m2:{messageId:'m2',threadId:'other-thread',headers:{'message-id':'<m2@example.com>',subject:'Test send to email copro UOB',references:''}}})[id];
}

test('IT reply for a non-CoPromo campaign waits for IT completion, queues once in the bound loop and reviews final codes',async()=>{
 const {a,DB,env,c}=await fixture();
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'waiting');assert.equal(events(DB,'%:it_done%').length,0);
 cloud(DB,c,rows=>rows.forEach(r=>{r.itStatus='COMPLETE';if(r.shortName==='Button A')r.codePromotion='IC777';}));
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'queued');
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'queued','a re-save never queues another mail');
 const queued=events(DB,'%:it_done%');assert.equal(queued.length,1);assert.equal(queued[0].event_key,c.id+':2026-10:it_done');
 const snap=JSON.parse(queued[0].snapshot_json),first=JSON.parse(events(DB,'%:submitted')[0].snapshot_json);
 assert.equal(snap.threadId,first.threadId);assert.equal(snap.rfcMessageId,first.rfcMessageId);assert.deepEqual(snap.recipients,first.recipients);
 const text=a.renderCoProEmail(snap).text;
 assert.match(text,/^แจ้งสถานะ IT ขึ้นปุ่มเรียบร้อย/);assert.match(text,/Type Promotion: Item Coupon/);assert.match(text,/Code Promotion: IC777/);assert.match(text,/ชื่อปุ่ม: Button B/);
 assert.match(text,/ผลตรวจสอบโค้ด: Code Promotion มีการเปลี่ยนแปลงแก้ไข จาก IC001 เป็น IC777/);assert.doesNotMatch(text,/ไฟล์แนบ/);
 DB.db.close();
});
test('no mail is queued for IT when the submitter chose not to send (no bound loop)',async()=>{
 const {a,DB,env,c}=await fixture({send:false});
 cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));
 assert.equal((await itDone(a,env,c)).items.length,0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();
});
test('CoPromo keeps its Interface completion mail; only lifecycle IT rounds use it_done',async()=>{
 const {a,DB,env,c}=await fixture({copro:true});
 cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'copro');assert.equal(events(DB,'%:it_done%').length,0);
 extend(DB,c,'chg-copro-0001');
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'waiting');
 cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));
 assert.equal((await itDone(a,env,c)).items[0].mailStatus,'queued');
 const queued=events(DB,'%:it_done:%');assert.equal(queued.length,1);
 const text=a.renderCoProEmail(JSON.parse(queued[0].snapshot_json)).text;assert.match(text,/^แจ้งสถานะ IT ปรับวันที่โปรโมชั่นในระบบเรียบร้อย/);assert.match(text,/2026-11-01 → 2026-11-30/);
 assert.doesNotMatch(queued[0].snapshot_json,/Internal accounting remark|SO-SECRET/);
 DB.db.close();
});
test('extend / shorten / cancel mail is queued only on confirmation, once per change, with old and new dates per button',async()=>{
 const {a,DB,env,c}=await fixture();
 extend(DB,c,'chg-extend-0001');
 const input={campaignKey:c.key,changeId:'chg-extend-0001',additionalMessage:'ขยายตามยอดขาย'};
 const preview=await a.previewPromotionChange(actor,input,env);
 assert.match(preview.text,/^แจ้งขยายระยะเวลาโปรโมชั่น/);assert.match(preview.text,/วันที่สิ้นสุดเดิม → ใหม่: 2026-11-01 → 2026-11-30/);assert.match(preview.text,/Code Promotion: IC001/);assert.match(preview.text,/ชื่อปุ่ม: Button A/);assert.match(preview.text,/Type Promotion: Item Coupon/);assert.match(preview.text,/ขยายตามยอดขาย/);
 assert.equal(events(DB,'%:change:%').length,0,'preview never queues mail');
 await assert.rejects(a.commitPromotionChange(actor,{...input,previewHash:preview.previewHash},env),/confirmation/);
 const request={...input,previewHash:preview.previewHash,confirmed:true};
 assert.equal((await a.commitPromotionChange(actor,request,env)).mailStatus,'queued');await a.commitPromotionChange(actor,request,env);
 const queued=events(DB,'%:change:%');assert.equal(queued.length,1);assert.equal(queued[0].event_key,c.id+':2026-10:change:extended:chg-extend-0001');
 assert.equal(JSON.parse(queued[0].snapshot_json).threadId,'provider-thread');
 cloud(DB,c,rows=>rows.forEach(r=>Object.assign(r,{changeId:'chg-cancel-0001',changeStatus:'CANCELLED',cancelReason:'Stock out'})));
 const cancel={campaignKey:c.key,changeId:'chg-cancel-0001'},cancelPreview=await a.previewPromotionChange(actor,cancel,env);
 assert.match(cancelPreview.text,/^แจ้งยกเลิกโปรโมชั่น/);assert.match(cancelPreview.text,/เหตุผลการยกเลิก: Stock out/);
 await a.commitPromotionChange(actor,{...cancel,previewHash:cancelPreview.previewHash,confirmed:true},env);
 assert.equal(events(DB,'%:change:cancelled:chg-cancel-0001').length,1);
 await assert.rejects(a.previewPromotionChange(actor,{campaignKey:c.key,changeId:'chg-unknown-01'},env),/email_source_changed/);
 DB.db.close();
});
test('choosing another loop re-binds the campaign so the following IT reply threads there; no loop asks for one',async()=>{
 const {a,DB,env,c}=await fixture({send:false});
 extend(DB,c,'chg-rebind-0001');
 await assert.rejects(a.previewPromotionChange(actor,{campaignKey:c.key,changeId:'chg-rebind-0001'},env),/email_revision_loop_missing/);
 const chosen={campaignKey:c.key,changeId:'chg-rebind-0001',policyId:'other',policyVersion:1,recipients:{to:['test@example.net'],cc:[]}};
 await assert.rejects(a.previewPromotionChange(actor,{...chosen,recipients:{to:['intruder@example.net'],cc:[]}},env),/email_unapproved_recipients/);
 let preview=await a.previewPromotionChange(actor,chosen,env);assert.equal(preview.rebind,true);
 await a.commitPromotionChange(actor,{...chosen,previewHash:preview.previewHash,confirmed:true},env);
 let binding=DB.db.prepare('SELECT * FROM email_bindings WHERE campaign_id=?').get(c.id);assert.equal(binding.thread_id,'other');assert.equal(binding.version,1);
 // A later change chooses the original loop: binding moves and its version increases.
 extend(DB,c,'chg-rebind-0002','2026-12-15');
 const back={campaignKey:c.key,changeId:'chg-rebind-0002',policyId:'policy',policyVersion:1,recipients:{to:['test@example.net'],cc:[]}};
 preview=await a.previewPromotionChange(actor,back,env);await a.commitPromotionChange(actor,{...back,previewHash:preview.previewHash,confirmed:true},env);
 binding=DB.db.prepare('SELECT * FROM email_bindings WHERE campaign_id=?').get(c.id);assert.equal(binding.thread_id,'policy');assert.equal(binding.version,2);
 assert.equal(events(DB,'%:chg-rebind-0002')[0].binding_version,2);
 cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));await itDone(a,env,c);
 const reply=JSON.parse(events(DB,'%:it_done%')[0].snapshot_json);assert.equal(reply.threadId,'provider-thread');assert.equal(reply.rfcMessageId,'<m1@example.com>');
 DB.db.close();
});
test('edit mail can move to a chosen loop; reply without a chosen loop stays in the bound loop',async()=>{
 const {a,DB,env,c}=await fixture();
 const editId='edit-lifecycle-1';cloud(DB,c,rows=>rows.forEach(r=>r.editId=editId));
 DB.db.prepare('INSERT INTO promo_submission_receipts VALUES(?,?)').run(editId,JSON.stringify({kind:'CAMPAIGN_EDIT',versions:{[c.key]:2}}));
 const bound=await a.previewPromotionRevision(actor,{campaignKey:c.key,month:'2026-10',editId},env);assert.equal(bound.rebind,false);
 const input={campaignKey:c.key,month:'2026-10',editId,policyId:'other',policyVersion:1,recipients:{to:['test@example.net'],cc:[]}};
 const preview=await a.previewPromotionRevision(actor,input,env);assert.equal(preview.rebind,true);
 await a.commitPromotionRevision(actor,{...input,previewHash:preview.previewHash,confirmed:true},env);
 assert.equal(DB.db.prepare('SELECT thread_id FROM email_bindings WHERE campaign_id=?').get(c.id).thread_id,'other');
 assert.equal(JSON.parse(events(DB,'%:revision:%')[0].snapshot_json).threadId,'other-thread');
 DB.db.close();
});
test('IT reply waits for an accepted first mail, then replies in its thread; Cloud changes hold it',async()=>{
 for(const changed of [false,true]){
  const {a,DB,env,c}=await fixture();dispatchEnv(a,DB,env);
  cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));await itDone(a,env,c);
  DB.db.exec("UPDATE email_outbox SET status='held' WHERE event_key LIKE '%:submitted'");
  const sent=[];a.sendReply=async(token,snapshot)=>{sent.push(snapshot);return {outcome:'accepted',providerId:'sent-'+sent.length};};
  await a.dispatchEmail(env);assert.equal(sent.length,0,'IT reply never starts a loop on its own');
  DB.db.exec("UPDATE email_outbox SET status='accepted',provider_id='first' WHERE event_key LIKE '%:submitted'");
  if(changed)cloud(DB,c,rows=>rows[0].codePromotion='IC555');
  await a.dispatchEmail(env);
  if(changed){assert.equal(sent.length,0);assert.equal(events(DB,'%:it_done')[0].status,'held');
   // The next IT completion re-queues the held reply with current codes, still once.
   await itDone(a,env,c);assert.equal(events(DB,'%:it_done').length,1);await a.dispatchEmail(env);assert.match(a.renderCoProEmail(sent[0]).text,/IC555/);}
  assert.equal(sent.length,1);assert.equal(sent[0].milestone,'it_done');
  const mime=Buffer.from(a.buildReply(sent[0]).raw,'base64url').toString();assert.match(mime,/In-Reply-To: <m1@example.com>/);
  await a.dispatchEmail(env);assert.equal(sent.length,1);DB.db.close();
 }
});
test('a new-email loop records its first message so later mail replies in that conversation',async()=>{
 const {a,DB,env,c}=await fixture({newMessage:true});
 dispatchEnv(a,DB,env,{'sent-1':{messageId:'sent-1',threadId:'gmail-thread-1',headers:{'message-id':'<sent-1@mail.gmail.com>',subject:'Test send to email copro UOB'}}});
 const sent=[];a.sendReply=async(token,snapshot)=>{sent.push(snapshot);return {outcome:'accepted',providerId:'sent-'+sent.length};};
 await a.dispatchEmail(env);assert.equal(sent.length,1);assert.equal(sent[0].newMessage,true);
 assert.deepEqual({...DB.db.prepare('SELECT gmail_thread_id,message_id,rfc_message_id FROM email_thread_starts WHERE thread_id=?').get('fresh')},{gmail_thread_id:'gmail-thread-1',message_id:'sent-1',rfc_message_id:'<sent-1@mail.gmail.com>'});
 cloud(DB,c,rows=>rows.forEach(r=>r.itStatus='COMPLETE'));await itDone(a,env,c);
 await a.dispatchEmail(env);assert.equal(sent.length,2);
 assert.equal(sent[1].newMessage,false);assert.equal(sent[1].threadId,'gmail-thread-1');
 const payload=a.buildReply(sent[1]),mime=Buffer.from(payload.raw,'base64url').toString();assert.equal(payload.threadId,'gmail-thread-1');assert.match(mime,/In-Reply-To: <sent-1@mail.gmail.com>/);
 DB.db.close();
});
test('history labels lifecycle and IT reply events',async()=>{
 const a=load(['copro-model']);
 assert.equal(a.emailEventKind('c:2026-10:change:cancelled:chg-1234-abcd'),'promotion_cancelled');
 assert.equal(a.emailEventKind('c:2026-10:change:reduced:chg-1234-abcd'),'promotion_reduced');
 assert.equal(a.emailEventKind('c:2026-10:it_done'),'it_done');assert.equal(a.emailEventKind('c:2026-10:it_done:AbC-12_xyz'),'it_done');
 assert.equal(a.emailEventKind('c:2026-10:revision:edit-1'),'promotion_edited');assert.equal(a.emailEventKind('c:2026-10:it_interface_complete'),'it_interface_complete');assert.equal(a.emailEventKind('c:2026-10:submitted'),'submitted');
});
test('a confirmed lifecycle mail can start a loop, sends once, and is held if the change is reverted before sending',async()=>{
 for(const reverted of [false,true]){
  const {a,DB,env,c}=await fixture();dispatchEnv(a,DB,env);
  DB.db.exec("UPDATE email_outbox SET status='held' WHERE event_key LIKE '%:submitted'");
  extend(DB,c,'chg-dispatch-01','2026-10-25','REDUCED');
  const input={campaignKey:c.key,changeId:'chg-dispatch-01'},preview=await a.previewPromotionChange(actor,input,env);
  await a.commitPromotionChange(actor,{...input,previewHash:preview.previewHash,confirmed:true},env);
  if(reverted)cloud(DB,c,rows=>rows.forEach(r=>{r.changeStatus='';r.end='2026-11-01';}));
  const sent=[];a.sendReply=async(token,snapshot)=>{sent.push(snapshot);return {outcome:'accepted',providerId:'sent-'+sent.length};};
  await a.dispatchEmail(env);await a.dispatchEmail(env);
  assert.equal(sent.length,reverted?0:1);assert.equal(events(DB,'%:change:%')[0].status,reverted?'held':'accepted');
  if(!reverted){assert.equal(sent[0].milestone,'promotion_reduced');assert.match(a.renderCoProEmail(sent[0]).text,/^แจ้งลดระยะเวลาโปรโมชั่น[\s\S]*2026-11-01 → 2026-10-25/);}
  DB.db.close();
 }
});
