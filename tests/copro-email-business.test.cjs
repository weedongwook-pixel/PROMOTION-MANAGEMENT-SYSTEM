const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,actor,grant}=require('./helpers/copro-context.cjs');
async function fixture(options={}){
  const a=load(['staff','templates','gmail','registry','copro-model','copro-service','outbox']),DB=database(),env={DB};
  DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER); CREATE TABLE promo_commit_guard(id INTEGER PRIMARY KEY CHECK(id=1));');
  grant(DB,actor,'submit');grant(DB,actor,'it');
  const row={campaign:'UOB test',shortName:'Button A',submissionBatchId:'batch-1234',promoType:'Item Coupon',start:'2026-10-19',end:'2026-11-01',itemCode:'101001',qty:1,gross:55,netPrice:45,codePromotion:'IC001'};
  if(options.itemSet)Object.assign(row,{promoType:'Item Set',typePromotion:'Item Set',codePromotion:'P4000',codeItemSet:'1074000',itemCode:'SS001',isSubset:'Y',chooseMin:1,chooseMax:2,qty:2,cate:'Promotion set',saleMode:'GRAB'});
  const block={m:{'2026-10':[row,{...row,shortName:options.sameName?'Button A':'Button B',codePromotion:options.itemSet?'P4001':'IC002',...(options.itemSet?{codeItemSet:'1074001'}:{})}]},w:[]};
  if(options.itemSet)DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_code_counter_v1',JSON.stringify({reservations:{'itemset::1074000':{code:'1074000',type:'itemset',status:'RESERVED',where:row.campaign},'itemset::1074001':{code:'1074001',type:'itemset',status:'RESERVED',where:row.campaign}}}));
  const input={submissionId:'batch-1234',writes:[{key:'promo::c::UOB%20test',value:JSON.stringify(block),expectedUpdatedAt:null}]};
  const prep=await a.preparePilotSubmission(actor,input,env);await DB.batch(prep.statements);
  DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run(input.writes[0].key,input.writes[0].value);
  const c=prep.campaigns[0],buttons=(await DB.prepare('SELECT * FROM email_campaign_buttons WHERE campaign_id=?').bind(c.id).all()).results;
  buttons.sort((a,b)=>JSON.parse(a.source_identity_json).shortName.localeCompare(JSON.parse(b.source_identity_json).shortName));
  DB.db.prepare('INSERT INTO email_threads(id,thread_id,message_id,rfc_message_id,references_json,subject,to_json,cc_json,audience_json,version,mode,enabled,published_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,\'test\',1,?,?)').run('policy','provider-thread','m1','<m1@example.com>','[]','Test send to email copro UOB','["test@example.net"]','[]',JSON.stringify([actor]),'manager',Date.now());
  const draft={campaignId:c.id,expectedVersion:1,policyId:'policy',policyVersion:1,recipients:{to:['test@example.net'],cc:[]},confirmed:true,records:buttons.map(b=>({buttonId:b.button_id,brand:'Test partner',detail:'Public detail'}))};
  draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;
  return {a,DB,env,c,buttons,draft};
}
test('CoPro queues one announcement, only both tasks across all buttons queue one completion',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture();
  await a.commitCoPromo(actor,draft,env);await a.commitCoPromo(actor,draft,env);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);
  for(const b of buttons)await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);
  for(const b of buttons)await a.commitIT(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1,codePromotion:JSON.parse(b.source_identity_json).codePromotion},env);
  await a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'IC001'},env);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,2);
  assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE event_key LIKE '%it_interface_complete'").get().n,1);DB.db.close();
});
test('other owner, stale policy, injected generic flags and outbox failure cannot bypass guarded commits',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture();const other={...actor,objectId:'44444444-4444-4444-8444-444444444444'};grant(DB,other,'submit');await assert.rejects(a.commitCoPromo(other,draft,env));await assert.rejects(a.commitCoPromo(actor,{...draft,policyVersion:2},env));
  DB.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'test queue failure'); END;");
  await assert.rejects(a.commitCoPromo(actor,draft,env));assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_bindings').get().n,0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_copro_records').get().n,0);
  DB.db.exec('DROP TRIGGER fail_outbox');await a.commitCoPromo(actor,draft,env);
  const legacy=JSON.parse(DB.db.prepare('SELECT v FROM promo_store').get().v);legacy.m['2026-10'].forEach(r=>{r.itStatus='COMPLETE';r.interfaceSetup=1;});DB.db.prepare('UPDATE promo_store SET v=?,updated_at=updated_at+1').run(JSON.stringify(legacy));
  await a.commitInterface(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1},env);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);assert.equal(DB.db.prepare('SELECT SUM(it_done) n FROM email_campaign_buttons').get().n,0);DB.db.close();
});
test('protected CoPro save preserves accounting fields separately from public email content',async()=>{
  const {a,DB,env,draft}=await fixture();
  const fields={billingEntity:'Test billing company',paymentType:'Credit',soNo:'SO-123',quota:'100',priceIncVat:'45',paymentCondition:'30 days',remark:'Internal accounting remark',periodText:'October',cmposName:'Button A',buttonName:'Button A',promoType:'Item Coupon'};
  draft.records[0]={...draft.records[0],...fields};draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;
  await a.commitCoPromo(actor,draft,env);
  const saved=JSON.parse(DB.db.prepare('SELECT record_json FROM email_copro_records WHERE button_id=?').get(draft.records[0].buttonId).record_json);
  for(const [k,v] of Object.entries(fields))assert.equal(saved[k],v,k);
  const mail=DB.db.prepare('SELECT snapshot_json FROM email_outbox').get().snapshot_json;assert.equal(mail.includes(fields.remark),false);
  DB.db.close();
});
test('verified IT commit persists full settlement and product data, not just completion flags',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
  const emailRowId=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m['2026-10'][0].emailRowId;
  await a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'IC001',updates:[{emailRowId,shortName:'Renamed A',kitchenName:'Kitchen A',promoType:'Item Coupon',cateRemark:'Fries'}]},env);
  const row=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m['2026-10'][0];
  assert.equal(row.shortName,'Renamed A');assert.equal(row.kitchen,'Kitchen A');
  const meta=JSON.parse(DB.db.prepare("SELECT v FROM promo_store WHERE k='promo::meta'").get().v);
  assert.equal(meta.npdProducts[0].itemCode,'IC001');assert.equal(meta.npdProducts[0].itemNameEN,'Kitchen A');assert.equal(meta.npdProducts[0].gross,'45');
  assert.ok(Date.parse(meta.npdProducts[0].updatedAt),'Cloud clients can distinguish the new product version from stale cached rows');
  assert.equal(DB.db.prepare('SELECT it_done FROM email_campaign_buttons WHERE button_id=?').get(buttons[0].button_id).it_done,1);
  DB.db.close();
});
test('new verified pilot rows carry stable campaign/button/row identities through settlement',async()=>{
  const {DB,c,buttons}=await fixture();
  const rows=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m['2026-10'];
  assert.equal(rows[0].emailCampaignId,c.id);assert.equal(rows[0].emailButtonId,buttons[0].button_id);assert.ok(rows[0].emailRowId);assert.notEqual(rows[0].emailRowId,rows[1].emailRowId);DB.db.close();
});
test('revocation immediately before transaction cannot create CoPro records or mail',async()=>{
  const {a,DB,env,draft}=await fixture(),batch=DB.batch.bind(DB);
  DB.batch=async statements=>{DB.db.exec("UPDATE email_actor_permissions SET enabled=0 WHERE permission='submit'");return batch(statements);};
  await assert.rejects(a.commitCoPromo(actor,draft,env));assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_copro_records').get().n,0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();
});
test('queue failure rolls back final IT settlement, product and completion evidence',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
  for(const b of buttons)await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);
  await a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'IC001'},env);
  const before=DB.db.prepare('SELECT k,v FROM promo_store ORDER BY k').all();
  DB.db.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON email_outbox WHEN NEW.event_key LIKE '%it_interface_complete' BEGIN SELECT RAISE(ABORT,'test'); END;");
  await assert.rejects(a.commitIT(actor,{campaignId:c.id,buttonId:buttons[1].button_id,expectedVersion:1,codePromotion:'IC002'},env));
  assert.deepEqual(DB.db.prepare('SELECT k,v FROM promo_store ORDER BY k').all(),before);assert.equal(DB.db.prepare('SELECT it_done FROM email_campaign_buttons WHERE button_id=?').get(buttons[1].button_id).it_done,0);DB.db.close();
});
test('email preview shows saved items and quantities without leaking accounting remarks',async()=>{
  const {a,DB,env,draft}=await fixture();draft.records[0].remark='Private accounting note';
  const preview=await a.previewCoPromo(actor,draft,env);assert.match(preview.text,/Code Promotion: IC001/);assert.match(preview.text,/ชื่อปุ่ม: Button A/);assert.doesNotMatch(preview.text,/Public detail/);assert.doesNotMatch(preview.text,/Private accounting note/);DB.db.close();
});
test('same-name buttons with distinct codes cannot complete each other',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture({sameName:true});await a.commitCoPromo(actor,draft,env);
  const target=buttons.find(b=>JSON.parse(b.source_identity_json).codePromotion==='IC002');await a.commitIT(actor,{campaignId:c.id,buttonId:target.button_id,expectedVersion:1,codePromotion:'IC002'},env);
  const rows=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m['2026-10'];assert.notEqual(rows[0].itStatus,'COMPLETE');assert.equal(rows[1].itStatus,'COMPLETE');assert.equal(DB.db.prepare('SELECT SUM(it_done) n FROM email_campaign_buttons').get().n,1);DB.db.close();
});
test('verified Item Set completion atomically creates recipe, price binding and confirms its counter',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture({itemSet:true});await a.commitCoPromo(actor,draft,env);
  await a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'P4000',codeItemSet:'1074000'},env);
  const get=key=>JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v);
  assert.equal(get('promo::meta').npdProducts[0].priceGrab,'110');assert.equal(get('pc_product_promo')['1074000'][0].net,'45');assert.equal(get('pc_itemset_comp')['1074000'][0].min,2);assert.equal(get('pc_itemset_comp')['1074000'][0].max,4);assert.equal(get('pc_code_counter_v1').reservations['itemset::1074000'].status,'CONFIRMED');DB.db.close();
});
test('Item Set cannot be certified complete without its product code',async()=>{
  const {a,DB,env,c,buttons,draft}=await fixture({itemSet:true});await a.commitCoPromo(actor,draft,env);
  await assert.rejects(a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'P4000'},env));assert.equal(DB.db.prepare('SELECT SUM(it_done) n FROM email_campaign_buttons').get().n,0);DB.db.close();
});
test('preview lists original files; confirmation binds file bytes and both milestones carry approved manifests',async()=>{
 const {a,DB,env,c,buttons,draft}=await fixture();
 const block=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v);block.m['2026-10'].forEach(r=>r.attachment='file:f1');
 DB.db.prepare('UPDATE promo_store SET v=?,updated_at=2 WHERE k=?').run(JSON.stringify(block),c.key);
 const file={name:'original.xlsx',mime:'application/octet-stream',base64:Buffer.from('ORIGINAL').toString('base64')};
 DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_promo_files',JSON.stringify({f1:file}));
 const preview=await a.previewCoPromo(actor,draft,env);assert.equal(preview.attachments.length,1);assert.equal(preview.attachments[0].name,'original.xlsx');assert.equal(preview.attachments[0].base64,undefined);
 draft.previewHash=preview.previewHash;await a.commitCoPromo(actor,draft,env);
 for(const b of buttons){await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);await a.commitIT(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1,codePromotion:JSON.parse(b.source_identity_json).codePromotion},env);}
 for(const row of DB.db.prepare('SELECT snapshot_json FROM email_outbox').all()){const snap=JSON.parse(row.snapshot_json);assert.deepEqual(snap.attachments,JSON.parse(JSON.stringify(preview.attachments)));assert.ok(!row.snapshot_json.includes(file.base64));}DB.db.close();
});
test('changing attached bytes after preview or during commit cannot queue unapproved files',async()=>{
 for(const race of [false,true]){
  const {a,DB,env,c,draft}=await fixture();const block=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v);block.m['2026-10'][0].attachment='file:f1';DB.db.prepare('UPDATE promo_store SET v=? WHERE k=?').run(JSON.stringify(block),c.key);
  const file={name:'original.xlsx',mime:'application/octet-stream',base64:Buffer.from('ORIGINAL').toString('base64')};DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_promo_files',JSON.stringify({f1:file}));draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;
  const change=()=>DB.db.prepare("UPDATE promo_store SET v=?,updated_at=2 WHERE k='pc_promo_files'").run(JSON.stringify({f1:{...file,base64:Buffer.from('CHANGED').toString('base64')}}));
  if(race){const batch=DB.batch.bind(DB);DB.batch=async statements=>{change();return batch(statements);};}else change();
  await assert.rejects(a.commitCoPromo(actor,draft,env));assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();
 }
});
test('legacy completion without attachment approval preserves legacy delivery instead of claiming an empty manifest',async()=>{
 const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 const first=DB.db.prepare('SELECT id,snapshot_json FROM email_outbox').get(),snap=JSON.parse(first.snapshot_json);delete snap.attachments;DB.db.prepare('UPDATE email_outbox SET snapshot_json=? WHERE id=?').run(JSON.stringify(snap),first.id);
 const block=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v);block.m['2026-10'][0].attachment='file:legacy';DB.db.prepare('UPDATE promo_store SET v=? WHERE k=?').run(JSON.stringify(block),c.key);
 for(const b of buttons){await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);await a.commitIT(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1,codePromotion:JSON.parse(b.source_identity_json).codePromotion},env);}
 const completion=JSON.parse(DB.db.prepare("SELECT snapshot_json FROM email_outbox WHERE event_key LIKE '%it_interface_complete'").get().snapshot_json);assert.equal(Object.hasOwn(completion,'attachments'),false);DB.db.close();
});
function changeCloud(DB,c,mutate){
 const block=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v);mutate(block.m[c.month]);DB.db.prepare('UPDATE promo_store SET v=?,updated_at=updated_at+1 WHERE k=?').run(JSON.stringify(block),c.key);return block.m[c.month];
}
test('first CoPro preview and list follow latest Cloud labels and details with registered stable IDs',async()=>{
 const {a,DB,env,c,draft}=await fixture();
 const before=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m[c.month];
 const latest=changeCloud(DB,c,rows=>{rows[0].codePromotion='IC999';rows[0].shortName='Current name';rows[0].gross=99;rows[0].condition='Current condition';rows[0].detail='Current promotion detail';});
 const preview=await a.previewCoPromo(actor,draft,env);assert.match(preview.text,/Current promotion detail/);assert.match(preview.text,/IC999/);assert.match(preview.text,/Current name/);assert.match(preview.text,/Current condition/);assert.match(preview.text,/99/);
 const listed=(await a.listCoProCampaigns(actor,env)).items[0];assert.equal(JSON.parse(listed.buttons.find(b=>b.button_id===before[0].emailButtonId).source_identity_json).codePromotion,'IC999');assert.equal(listed.sourceRows[0].emailRowId,before[0].emailRowId);
 draft.previewHash=preview.previewHash;await a.commitCoPromo(actor,draft,env);
 const saved=JSON.parse(DB.db.prepare('SELECT source_json FROM email_campaigns').get().source_json);assert.deepEqual(saved,latest);assert.match(DB.db.prepare('SELECT snapshot_json FROM email_outbox').get().snapshot_json,/IC999/);DB.db.close();
});
test('source changing after preview and at transaction boundary cannot queue stale first mail',async()=>{
 for(const race of [false,true]){
  const {a,DB,env,c,draft}=await fixture();const change=()=>changeCloud(DB,c,rows=>rows[0].codePromotion='IC999');
  if(race){const batch=DB.batch.bind(DB);DB.batch=async statements=>{change();return batch(statements);};}else change();
  await assert.rejects(a.commitCoPromo(actor,draft,env));assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_bindings').get().n,0);DB.db.close();
 }
});
test('prebinding refresh rejects missing, additional, reassigned and replacement source members',async()=>{
 const mutations=[r=>r.pop(),r=>r.push({...r[0],emailRowId:'new'}),r=>r[0].emailRowId='replacement',r=>r[0].emailButtonId=r[1].emailButtonId,r=>r[0].emailCampaignId='another',r=>r[0].submissionBatchId='another',r=>r[0].campaign='another',r=>r[0].revisionPending=true];
 for(const mutate of mutations){const {a,DB,env,c,draft}=await fixture();changeCloud(DB,c,mutate);await assert.rejects(a.previewCoPromo(actor,draft,env),/email_source_changed/);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();}
});
test('post-binding edits still require protected settlement and original owner is enforced before refresh',async()=>{
 const {a,DB,env,c,draft}=await fixture();const other={...actor,objectId:'44444444-4444-4444-8444-444444444444'};grant(DB,other,'submit');changeCloud(DB,c,r=>r[0].codePromotion='IC999');await assert.rejects(a.previewCoPromo(other,draft,env),/email_campaign_denied/);
 draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;await a.commitCoPromo(actor,draft,env);changeCloud(DB,c,r=>r[0].codePromotion='IC888');await assert.rejects(a.previewCoPromo(actor,draft,env),/email_source_changed/);DB.db.close();
});
test('IT completed in trusted Cloud before binding is preserved and interface completion queues final mail',async()=>{
 const {a,DB,env,c,buttons,draft}=await fixture();changeCloud(DB,c,rows=>rows.forEach(r=>{r.itStatus='COMPLETE';r.codePromotion+='9';}));draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;await a.commitCoPromo(actor,draft,env);
 assert.equal(DB.db.prepare('SELECT SUM(it_done) n FROM email_campaign_buttons').get().n,2);
 for(const b of buttons)await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,2);DB.db.close();
});
test('stable button IDs keep separate records when mutable names and codes converge',async()=>{
 const {a,DB,env,c,draft}=await fixture();changeCloud(DB,c,rows=>{rows[1].shortName=rows[0].shortName;rows[1].codePromotion=rows[0].codePromotion;});draft.records[0].brand='First partner';draft.records[1].brand='Second partner';
 const preview=await a.previewCoPromo(actor,draft,env);assert.equal(preview.details.buttons.length,2);assert.equal(preview.details.buttons[0].items.length,1);assert.equal(preview.details.buttons[1].items.length,1);assert.ok(preview.details.buttons.every(b=>b.brand===undefined&&b.detail===undefined));DB.db.close();
});
test('protected IT settlement confirms live promotion reservations for every counter prefix',async()=>{
 for(const [type,code] of [['promo','P9999'],['coupon','IC9999'],['bill','BD9999'],['voucher','VC9999']]){
  const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
  DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_code_counter_v1',JSON.stringify({reservations:{[type+'::'+code]:{type,code,status:'RESERVED',where:'UOB test'}}}));
  await a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:code},env);
  const counter=JSON.parse(DB.db.prepare("SELECT v FROM promo_store WHERE k='pc_code_counter_v1'").get().v);assert.equal(counter.reservations[type+'::'+code].status,'CONFIRMED');assert.ok(counter.reservations[type+'::'+code].confirmedAt);DB.db.close();
 }
});
test('IT cannot confirm a foreign, released, mismatched or missing new promotion reservation',async()=>{
 for(const invalid of [{where:'Other'}, {status:'RELEASED'}, {type:'bill'}, {code:'IC8888'},null]){
  const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
  const reservations=invalid?{'coupon::IC9999':{type:'coupon',code:'IC9999',where:'UOB test',status:'RESERVED',...invalid}}:{};DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_code_counter_v1',JSON.stringify({reservations}));
  const before=DB.db.prepare('SELECT k,v FROM promo_store ORDER BY k').all();await assert.rejects(a.commitIT(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1,codePromotion:'IC9999'},env),/email_counter_conflict/);assert.deepEqual(DB.db.prepare('SELECT k,v FROM promo_store ORDER BY k').all(),before);assert.equal(DB.db.prepare('SELECT SUM(it_done) n FROM email_campaign_buttons').get().n,0);DB.db.close();
 }
});

test('revision notification uses latest promotion source, original loop and one event per durable edit',async()=>{
 const {a,DB,env,c,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 DB.db.exec('CREATE TABLE promo_submission_receipts(submission_id TEXT PRIMARY KEY,response_json TEXT)');
 const editId='edit-test-notification',key='promo::c::UOB%20test';
 changeCloud(DB,c,rows=>rows.forEach(r=>Object.assign(r,{editId,detail:'Revised promotion only',codePromotion:'IC0999'})));
 DB.db.prepare('INSERT INTO promo_submission_receipts VALUES(?,?)').run(editId,JSON.stringify({kind:'CAMPAIGN_EDIT',versions:{[key]:2}}));
 const input={campaignKey:key,month:'2026-10',editId};
 const preview=await a.previewPromotionRevision(actor,input,env);
 assert.match(preview.text,/Revised promotion only/);assert.match(preview.text,/IC0999/);assert.doesNotMatch(preview.text,/Public detail|Test partner/);assert.equal(preview.subject,'Test send to email copro UOB');
 assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE event_key LIKE '%:revision:%'").get().n,0);
 const request={...input,previewHash:preview.previewHash,confirmed:true};
 await a.commitPromotionRevision(actor,request,env);await a.commitPromotionRevision(actor,request,env);
 assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE event_key LIKE '%:revision:%'").get().n,1);
 await assert.rejects(a.commitPromotionRevision(actor,{...request,confirmed:false},env),/confirmation/);
 changeCloud(DB,c,rows=>rows.forEach(r=>r.detail='Changed after preview'));
 await assert.rejects(a.commitPromotionRevision(actor,request,env),/confirmation/);
 DB.db.close();
});

test('optional recipient message is previewed, bound to confirmation, escaped and stored only in the selected mail',async()=>{
 const {a,DB,env,draft}=await fixture();draft.additionalMessage='Please review <note>\nThank you';
 const preview=await a.previewCoPromo(actor,draft,env);assert.match(preview.text,/Please review <note>\nThank you/);
 await assert.rejects(a.commitCoPromo(actor,{...draft,previewHash:preview.previewHash,additionalMessage:'Changed'},env),/confirmation/);
 await a.commitCoPromo(actor,{...draft,previewHash:preview.previewHash},env);
 const snap=JSON.parse(DB.db.prepare('SELECT snapshot_json FROM email_outbox').get().snapshot_json);assert.equal(snap.additionalMessage,draft.additionalMessage);assert.match(a.renderCoProEmail(snap).html,/&lt;note&gt;/);
 await assert.rejects(a.previewCoPromo(actor,{...draft,additionalMessage:'x'.repeat(4001)},env),/invalid_record/);DB.db.close();
});

test('mail history is owner-scoped, separates milestones and exposes sanitized delivery state only',async()=>{
 const {a,DB,env,c,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 DB.db.exec("UPDATE email_outbox SET status='accepted',updated_at=12345");
 const history=await a.mailHistory(actor,env);assert.equal(history.items.length,1);assert.equal(history.items[0].kind,'submitted');assert.equal(history.items[0].status,'accepted');assert.equal(history.items[0].at,12345);assert.equal(history.items[0].campaign,'UOB test');assert.equal(history.items[0].snapshot_json,undefined);
 const other={tenantId:actor.tenantId,objectId:'44444444-4444-4444-8444-444444444444'};grant(DB,other,'submit');assert.equal((await a.mailHistory(other,env)).items.length,0);DB.db.close();
});

test('shared history returns durable accepted status and Interface progress without mailbox secrets or Gmail permissions',async()=>{
 const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 DB.db.prepare("UPDATE email_outbox SET status='accepted',provider_id='PRIVATE-PROVIDER'").run();
 DB.db.exec('DELETE FROM email_actor_permissions');
 let result=await a.sharedMailHistory(env);
 assert.equal(result.items.find(i=>i.kind==='submitted').status,'accepted');
 assert.equal(result.items.find(i=>i.kind==='it_interface_complete').status,'waiting');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|test@example|provider-thread|Test partner|record_json|snapshot_json/);
 assert.equal(result.items.some(i=>i.kind==='promotion_edited'),false);
 DB.db.prepare('UPDATE email_copro_records SET interface_done=1 WHERE button_id=?').run(buttons[0].button_id);
 result=await a.sharedMailHistory(env);assert.equal(result.items.find(i=>i.kind==='it_interface_complete').status,'waiting');
 DB.db.exec('UPDATE email_copro_records SET interface_done=1');
 result=await a.sharedMailHistory(env);assert.equal(result.items.find(i=>i.kind==='it_interface_complete').status,'interface_done');DB.db.close();
});

test('shared history requires provider confirmation and excludes ordinary promotions',async()=>{
 const {a,DB,env,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 DB.db.prepare("UPDATE email_outbox SET status='accepted',provider_id=NULL").run();
 DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('promo::c::Ordinary',JSON.stringify({m:{'2026-10':[{campaign:'Ordinary'}]}}));
 DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_co_promotions',JSON.stringify([{campaign:'Legacy CoPromo',emailIntake:true,status:'PENDING_EMAIL',interfaceSetup:0},{campaign:'Imported old promotion',status:'INTERFACED',interfaceSetup:1}]));
 let result=await a.sharedMailHistory(env);
 assert.equal(result.items.find(i=>i.campaign==='UOB test'&&i.kind==='submitted').status,'needs_verification');
 assert.equal(result.items.some(i=>i.campaign==='Ordinary'),false);
 assert.equal(result.items.some(i=>i.campaign==='Imported old promotion'),false);
 assert.equal(result.items.find(i=>i.campaign==='Legacy CoPromo'&&i.kind==='submitted').status,'not_recorded');
 DB.db.prepare("UPDATE email_outbox SET provider_id='gmail-message-id'").run();
 result=await a.sharedMailHistory(env);assert.equal(result.items.find(i=>i.campaign==='UOB test'&&i.kind==='submitted').status,'accepted');DB.db.close();
});

test('ordinary promotion email queues without creating accounting CoPromo records',async()=>{
 const {a,DB,env,draft}=await fixture();draft.notificationOnly=true;draft.records=[];
 const preview=await a.previewCoPromo(actor,draft,env);assert.match(preview.text,/แจ้งรายละเอียดโปรโมชั่น/);draft.previewHash=preview.previewHash;
 await a.commitCoPromo(actor,draft,env);assert.equal(DB.db.prepare('SELECT count(*) n FROM email_copro_records').get().n,0);
 assert.equal(DB.db.prepare('SELECT count(*) n FROM email_outbox').get().n,1);DB.db.close();
});
test('new mail subject comes from the owned campaign and MIME has no reply routing',async()=>{
 const {a,DB,env,c}=await fixture();grant(DB,actor,'manage');env.EMAIL_AUTH_MODE='gmail_owner';a.isGmailOwner=()=>true;
 const policy=await a.publishThread(actor,{newMessage:true,mode:'production',campaignId:c.id,subject:'Injected subject',recipients:{to:['person@example.com'],cc:[]}},env);
 assert.equal(policy.subject,'แจ้งรายละเอียด UOB test');assert.equal(policy.newMessage,true);
 const message=a.buildReply({newMessage:true,subject:policy.subject,recipients:policy.recipients,milestone:'submitted',details:{campaign:'UOB test'}});
 assert.equal(message.threadId,undefined);const mime=Buffer.from(message.raw,'base64url').toString();assert.doesNotMatch(mime,/In-Reply-To:|References:/);
 await assert.rejects(a.publishThread(actor,{newMessage:true,mode:'production',campaignId:'other',recipients:policy.recipients},env),/email_campaign_denied/);DB.db.close();
});
test('CoPromo mail can be sent before accounting partner fields are filled',async()=>{
 const {a,DB,env,draft}=await fixture();draft.records.forEach(r=>r.brand='');
 draft.previewHash=(await a.previewCoPromo(actor,draft,env)).previewHash;
 await a.commitCoPromo(actor,draft,env);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_copro_records').get().n,2);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);DB.db.close();
});

test('central sender records verified staff identity and blocks revocation during commit',async()=>{
  const fs=require('node:fs');
  for(const revoke of [false,true]){
    const {a,DB,env,c,draft}=await fixture();
    DB.db.exec(fs.readFileSync('sync-worker/migrations/006_gmail_owner_sessions.sql','utf8'));
    DB.db.exec(fs.readFileSync('sync-worker/migrations/007_email_staff.sql','utf8'));
    env.EMAIL_STAFF_ENABLED='true';env.EMAIL_ENCRYPTION_KEY=Buffer.alloc(32,1).toString('base64');
    const u=await a.saveStaffAccount({username:'reviewer',name:'Verified employee',password:'private password 12345',canSend:true},env);
    const employee={...actor,staffId:u.id,staffVersion:1,staffName:u.name};
    draft.previewHash=(await a.previewCoPromo(employee,draft,env)).previewHash;
    if(revoke){const batch=DB.batch.bind(DB);DB.batch=async statements=>{DB.db.prepare('UPDATE email_staff SET enabled=0 WHERE id=?').run(u.id);return batch(statements);};
      await assert.rejects(a.commitCoPromo(employee,draft,env));assert.equal(DB.db.prepare('SELECT count(*) n FROM email_outbox').get().n,0);
    }else{
      await a.commitCoPromo(employee,draft,env);
      const snapshot=JSON.parse(DB.db.prepare('SELECT snapshot_json FROM email_outbox').get().snapshot_json);
      assert.equal(snapshot.requestedBy.staffId,u.id);
      const audit=DB.db.prepare("SELECT * FROM email_audit WHERE campaign_id=? AND event='submitted'").get(c.id);
      assert.equal(audit.actor,'staff:'+u.id);assert.equal(JSON.parse(audit.details_json).staffName,'Verified employee');
    }
    DB.db.close();
  }
});
test('IT completion emails the same approved loop once with reserved-versus-final code review',async()=>{
 for(const changed of [false,true])for(const interfaceFirst of [false,true]){
  const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
  if(changed)DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_code_counter_v1',JSON.stringify({reservations:{'coupon::IC999':{type:'coupon',code:'IC999',status:'RESERVED',where:'UOB test'}}}));
  const interfaceAll=async()=>{for(const b of buttons)await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);};
  if(interfaceFirst)await interfaceAll();
  for(let i=0;i<buttons.length;i++){
   const b=buttons[i],code=changed&&i===0?'IC999':JSON.parse(b.source_identity_json).codePromotion;
   const sourceRow=JSON.parse(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(c.key).v).m['2026-10'].find(r=>r.emailButtonId===b.button_id);
   await a.commitIT(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1,codePromotion:code,...(changed&&i===0?{updates:[{emailRowId:sourceRow.emailRowId,shortName:'Renamed by IT'}]}:{})},env);
   if(i===0)assert.equal(DB.db.prepare("SELECT count(*) n FROM email_outbox WHERE event_key LIKE '%it_interface_complete'").get().n,0);
  }
  if(!interfaceFirst){assert.equal(DB.db.prepare('SELECT count(*) n FROM email_outbox').get().n,1);await interfaceAll();}
  await a.commitInterface(actor,{campaignId:c.id,buttonId:buttons[0].button_id,expectedVersion:1},env);
  const rows=DB.db.prepare('SELECT snapshot_json FROM email_outbox ORDER BY created_at').all();assert.equal(rows.length,2);
  const first=JSON.parse(rows[0].snapshot_json),last=JSON.parse(rows[1].snapshot_json);
  assert.equal(last.threadId,first.threadId);assert.equal(last.rfcMessageId,first.rfcMessageId);assert.deepEqual(last.recipients,first.recipients);
  const mail=a.renderCoProEmail(last);assert.match(mail.text,changed?/ผลตรวจสอบโค้ด: เปลี่ยนจาก IC001 เป็น IC999/:/ผลตรวจสอบโค้ด: ใช้รหัสเดิม IC001/);
  assert.match(mail.text,/ผลตรวจสอบโค้ด: ใช้รหัสเดิม IC002/);
  const mime=Buffer.from(a.buildReply(last).raw,'base64url').toString();assert.match(mime,/In-Reply-To: <m1@example.com>/);assert.match(mime,/To: test@example.net/);
  Object.assign(env,{EMAIL_CONNECTION_ENABLED:'true',EMAIL_COPRO_ENABLED:'true',EMAIL_TEST_SEND_ENABLED:'true'});
  DB.db.prepare("INSERT INTO email_connections VALUES(1,'it@rocks-foods.com','connected','cipher','scopes','now','now',1)").run();
  a.gmailAccess=async()=> 'mock';a.gmailMessage=async()=>({messageId:'m1',threadId:first.threadId,headers:{'message-id':first.rfcMessageId,subject:first.subject,references:''}});
  let sent=0;const provider={fetch:async(url,options)=>{assert.match(url,/messages\/send$/);sent++;const payload=JSON.parse(options.body);assert.equal(payload.threadId,first.threadId);const content=Buffer.from(payload.raw,'base64url').toString();assert.match(content,/To: test@example.net/);if(sent===2)assert.match(content,/ผลตรวจสอบโค้ด:/);return Response.json({id:'mock-message-'+sent});}};
  await a.dispatchEmail(env,provider);await a.dispatchEmail(env,provider);assert.equal(sent,2,'one announcement and one final update, without duplicates');
  assert.equal(DB.db.prepare("SELECT count(*) n FROM email_outbox WHERE status='accepted' AND provider_id IS NOT NULL").get().n,2);

  DB.db.close();
 }
});

test('legacy final code comparison is explicit when original button identity is ambiguous',async()=>{
 const {a,DB,env,c,buttons,draft}=await fixture();await a.commitCoPromo(actor,draft,env);
 const queued=DB.db.prepare('SELECT id,snapshot_json FROM email_outbox').get(),snap=JSON.parse(queued.snapshot_json);
 snap.details.buttons.forEach(b=>delete b.buttonId);snap.details.buttons.push({...snap.details.buttons[0]});
 DB.db.prepare('UPDATE email_outbox SET snapshot_json=? WHERE id=?').run(JSON.stringify(snap),queued.id);
 for(const b of buttons){await a.commitIT(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1,codePromotion:JSON.parse(b.source_identity_json).codePromotion},env);await a.commitInterface(actor,{campaignId:c.id,buttonId:b.button_id,expectedVersion:1},env);}
 const last=JSON.parse(DB.db.prepare("SELECT snapshot_json FROM email_outbox WHERE event_key LIKE '%it_interface_complete'").get().snapshot_json);
 assert.equal(last.details.buttons[0].codeReview.status,'unavailable');assert.equal(last.details.buttons[1].codeReview.status,'unchanged');
 assert.match(a.renderCoProEmail(last).text,/ไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับเมลครั้งแรก/);DB.db.close();
});
