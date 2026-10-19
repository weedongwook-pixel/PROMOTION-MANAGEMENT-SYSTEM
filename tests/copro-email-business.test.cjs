const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,actor,grant}=require('./helpers/copro-context.cjs');
async function fixture(options={}){
  const a=load(['templates','gmail','registry','copro-model','copro-service']),DB=database(),env={DB};
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
  const preview=await a.previewCoPromo(actor,draft,env);assert.match(preview.text,/101001/);assert.match(preview.text,/55/);assert.match(preview.text,/Public detail/);assert.doesNotMatch(preview.text,/Private accounting note/);DB.db.close();
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
