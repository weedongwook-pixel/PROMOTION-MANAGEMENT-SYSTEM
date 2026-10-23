import './email/config.js';
import './email/identity.js';
import './email/storage.js';
import './email/oauth.js';
import './email/templates.js';
import './email/gmail.js';
import './email/attachments.js';
import './email/registry.js';
import './email/copro-model.js';
import '../js/settlement-transform.js';
import './email/catalog.js';
import './email/settlement.js';
import './email/copro-service.js';
import './email/outbox.js';
import './email/copro-router.js';
import './email/owner-session.js';
import './email/staff.js';
import './email/router.js';
import '../js/promotion-edit-model.js';
import '../js/form-code-allocation.js';
import './promotion-edit-resources.js';
import './edit-code-catalog.js';
// Source-controlled replacement for the dashboard-authored potato-promo-sync Worker.
// Every mutation must supply the version observed when the client loaded its key.
function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(env) },
  });
}

function authorized(request, env) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return !!env.SYNC_TOKEN && !!match && match[1].trim() === env.SYNC_TOKEN;
}

function expectedVersion(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'expectedUpdatedAt')) return undefined;
  if (body.expectedUpdatedAt === null) return null;
  return Number.isSafeInteger(body.expectedUpdatedAt) && body.expectedUpdatedAt >= 0
    ? body.expectedUpdatedAt : undefined;
}

async function currentVersion(db, key) {
  const row = await db.prepare('SELECT updated_at FROM promo_store WHERE k=?1').bind(key).first();
  return row ? row.updated_at : null;
}

async function guardedPut(db, key, body, env) {
  const expected = expectedVersion(body);
  if (expected === undefined || typeof body.value !== 'string') {
    return json({ ok: false, error: 'version_required' }, env, 428);
  }
  if(key==='promo::deleted' && body.deletedCampaignVersions){
    const versions=body.deletedCampaignVersions;
    if(!versions||typeof versions!=='object'||Array.isArray(versions)||!Object.keys(versions).length||Object.keys(versions).length>100||Object.entries(versions).some(([k,v])=>!k.startsWith('promo::c::')||!Number.isSafeInteger(v)||v<0))return json({ok:false,error:'bad_deletion_versions'},env,400);
    const now=Date.now(),statements=[];
    for(const [campaignKey,version] of Object.entries(versions)){
      statements.push(db.prepare('DELETE FROM promo_store WHERE k=?1 AND updated_at=?2').bind(campaignKey,version));
      statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));
      statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    }
    // Keep the deletion and its audit evidence in the same guarded transaction.
    for(const [campaignKey,version] of Object.entries(versions)){
      const original=await db.prepare('SELECT v FROM promo_store WHERE k=? AND updated_at=?').bind(campaignKey,version).first();
      if(!original)continue; // The version guard above rejects the transaction.
      const block=JSON.parse(original.v),name=decodeURIComponent(campaignKey.slice(10));
      const fields=['campaign','submissionId','submissionForm','submissionExpectedButtons','shortName','submittedBy','reporter','txnDate','promoType'];
      const receipts=Object.values(block.m||{}).flat().map(row=>Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
      const at=new Date(now).toISOString(),date=new Date(now+7*60*60*1000).toISOString().slice(0,10),id='ACT-DELETE-'+crypto.randomUUID();
      const event={id,date,at,user:String(body.actor||'').trim().slice(0,160),kind:'DELETED',campaign:name,scope:'campaign',note:'ลบงานออกจากรายการใช้งาน',submissionRows:receipts};
      statements.push(db.prepare('INSERT INTO promo_store(k,v,updated_at) VALUES(?,?,?)').bind('promo::activity::'+date+'::'+id,JSON.stringify(event),now));
    }
    const removedNames=new Set(Object.keys(versions).map(k=>decodeURIComponent(k.slice(10))));
    const linked=(await db.prepare("SELECT k,v,updated_at FROM promo_store WHERE k='pc_co_promotions' OR k LIKE 'pc_copro_drafts::%'").all()).results||[];
    for(const row of linked){
      const value=JSON.parse(row.v);let next;
      if(row.k==='pc_co_promotions')next=value.filter(r=>!removedNames.has(r.campaign));
      else next={...value,items:Object.fromEntries(Object.entries(value.items||{}).filter(([,r])=>!removedNames.has(r.campaign)))};
      if(JSON.stringify(next)===row.v)continue;
      statements.push(db.prepare('UPDATE promo_store SET v=?,updated_at=MAX(updated_at+1,?) WHERE k=? AND updated_at=?').bind(JSON.stringify(next),now,row.k,row.updated_at));
      statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    }
    if(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_campaigns'").first())for(const campaignKey of Object.keys(versions)){
      statements.push(db.prepare("UPDATE email_outbox SET status='cancelled',updated_at=? WHERE campaign_id IN (SELECT id FROM email_campaigns WHERE campaign_key=?) AND status IN ('queued','retry','held')").bind(now,campaignKey));
      statements.push(db.prepare("DELETE FROM email_copro_records WHERE campaign_id IN (SELECT id FROM email_campaigns WHERE campaign_key=?)").bind(campaignKey));
      statements.push(db.prepare("UPDATE email_campaigns SET status='cancelled' WHERE campaign_key=?").bind(campaignKey));
    }
    statements.push(expected===null?db.prepare('INSERT INTO promo_store(k,v,updated_at) VALUES(?1,?2,?3)').bind(key,body.value,now):db.prepare('UPDATE promo_store SET v=?2,updated_at=MAX(updated_at+1,?3) WHERE k=?1 AND updated_at=?4').bind(key,body.value,now,expected));
    statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));
    statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    try{await db.batch(statements);}catch(e){if(/constraint|CHECK|UNIQUE/i.test(String(e.message||e)))return json({ok:false,error:'version_conflict',key},env,409);throw e;}
    const saved=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind(key).first();
    const linkedUpdates=[];for(const row of linked){const current=await db.prepare('SELECT k,v,updated_at FROM promo_store WHERE k=?').bind(row.k).first();if(current)linkedUpdates.push(current);}
    return json({ok:true,key,updated_at:saved.updated_at,deletedKeys:Object.keys(versions),linkedUpdates},env);
  }
  const now = Date.now();
  const result = expected === null
    ? await db.prepare('INSERT INTO promo_store (k,v,updated_at) VALUES (?1,?2,?3) ON CONFLICT(k) DO NOTHING')
      .bind(key, body.value, now).run()
    : await db.prepare('UPDATE promo_store SET v=?2, updated_at=CASE WHEN updated_at>=?3 THEN updated_at+1 ELSE ?3 END WHERE k=?1 AND updated_at=?4')
      .bind(key, body.value, now, expected).run();
  // D1 counts the automatic history-trigger insert as an additional change.
  // A stale CAS changes zero rows; a successful mutation can change 2+ rows.
  if (!(Number(result.meta?.changes) > 0)) {
    return json({ ok: false, error: 'version_conflict', key, currentUpdatedAt: await currentVersion(db, key) }, env, 409);
  }
  const saved = await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind(key).first();
  if (!saved || saved.v !== body.value) {
    return json({ ok: false, error: 'version_conflict', key, currentUpdatedAt: saved?.updated_at ?? null }, env, 409);
  }
  return json({ ok: true, key, updated_at: saved.updated_at }, env);
}

async function guardedDelete(db, key, body, env) {
  const expected = expectedVersion(body);
  if (expected === undefined || expected === null) {
    return json({ ok: false, error: 'version_required' }, env, 428);
  }
  const result = await db.prepare('DELETE FROM promo_store WHERE k=?1 AND updated_at=?2').bind(key, expected).run();
  if (!(Number(result.meta?.changes) > 0)) {
    return json({ ok: false, error: 'version_conflict', key, currentUpdatedAt: await currentVersion(db, key) }, env, 409);
  }
  return json({ ok: true, key, deleted: true }, env);
}

const SUBMISSION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const CAMPAIGN_PREFIX = 'promo::c::';
const COMMIT_EXTRA_KEYS = new Set(['pc_code_counter_v1', 'pc_promo_files']);

function validateSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'bad_submission';
  if (!SUBMISSION_KEY.test(String(body.submissionId || ''))) return 'bad_submission_id';
  if (typeof body.actor !== 'string' || !body.actor.trim() || body.actor.length > 200) return 'bad_actor';
  if (!Number.isSafeInteger(body.expectedButtons) || body.expectedButtons < 1 || body.expectedButtons > 500) return 'bad_button_count';
  if (!Array.isArray(body.writes) || body.writes.length < 1 || body.writes.length > 20) return 'bad_writes';
  const seen = new Set(), buttons = new Set();
  let campaignWrites = 0, totalBytes = 0;
  for (const write of body.writes) {
    if (!write || typeof write !== 'object' || Array.isArray(write)) return 'bad_write';
    const key = write.key;
    if (typeof key !== 'string' || key.length > 400 || seen.has(key)) return 'bad_key';
    seen.add(key);
    if (expectedVersion(write) === undefined) return 'version_required';
    if (typeof write.value !== 'string') return 'bad_value';
    totalBytes += write.value.length;
    if (totalBytes > 5_000_000) return 'submission_too_large';
    let value;
    try { value = JSON.parse(write.value); } catch { return 'bad_json'; }
    if (key.startsWith(CAMPAIGN_PREFIX)) {
      campaignWrites++;
      let campaign;
      try { campaign = decodeURIComponent(key.slice(CAMPAIGN_PREFIX.length)); } catch { return 'bad_campaign'; }
      if (!campaign || campaign === '__nocamp' || !value || typeof value !== 'object' || !value.m || typeof value.m !== 'object') return 'bad_campaign';
      for (const [month, rows] of Object.entries(value.m)) {
        if (!Array.isArray(rows)) return 'bad_campaign_rows';
        for (const row of rows) {
          if (!row || row.campaign !== campaign) return 'bad_campaign_rows';
          if (String(row.submissionBatchId || row.submissionId || '') === body.submissionId) {
            if (!String(row.shortName || '').trim()) return 'bad_campaign_rows';
            buttons.add(campaign + '\u0000' + month + '\u0000' + row.shortName);
          }
        }
      }
      if (value.w != null && (!Array.isArray(value.w) || value.w.some(row => !row || row.campaign !== campaign))) return 'bad_campaign_rows';
    } else if (!COMMIT_EXTRA_KEYS.has(key)) return 'bad_key';
  }
  if (!campaignWrites || buttons.size !== body.expectedButtons) return 'button_count_mismatch';
  return null;
}

async function hashSubmission(body) {
  const canonical = JSON.stringify({
    submissionId: body.submissionId,
    actor: body.actor.trim(),
    expectedButtons: body.expectedButtons,
    writes: body.writes.slice().sort((a, b) => a.key.localeCompare(b.key))
      .map(w => ({ key: w.key, value: w.value, expectedUpdatedAt: w.expectedUpdatedAt })),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function receiptFor(db, submissionId) {
  return db.prepare('SELECT request_hash,response_json FROM promo_submission_receipts WHERE submission_id=?1')
    .bind(submissionId).first();
}

// IT may replace codes on a pending revision, including previously live buttons.
// Retain the old code and audit; allocation and the job use one D1 transaction.
async function commitITButtonCode(db, body, env) {
  if(!body || !SUBMISSION_KEY.test(String(body.requestId||'')) || !['promotion','itemset'].includes(body.slot) || !['auto','manual'].includes(body.mode) || typeof body.actor!=='string' || !body.actor.trim() || body.actor.length>200 || typeof body.campaign!=='string' || body.campaign.length>120 || !/^\d{4}-\d{2}$/.test(body.month||'') || !Number.isSafeInteger(body.expectedUpdatedAt) || typeof body.buttonId!=='string' || typeof body.revisionId!=='string')return json({ok:false,error:'bad_request'},env,400);
  const key=CAMPAIGN_PREFIX+encodeURIComponent(body.campaign),hash=await hashSubmission({submissionId:body.requestId,actor:body.actor,expectedButtons:1,writes:[{key,value:JSON.stringify(body),expectedUpdatedAt:body.expectedUpdatedAt}]});
  const previous=await receiptFor(db,body.requestId);
  if(previous)return previous.request_hash===hash?json({...JSON.parse(previous.response_json),replayed:true},env):json({ok:false,error:'submission_id_reused'},env,409);
  const record=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind(key).first();
  if(!record||record.updated_at!==body.expectedUpdatedAt)return json({ok:false,error:'version_conflict'},env,409);
  const block=JSON.parse(record.v),rows=(block.m?.[body.month]||[]).filter(r=>r.editButtonId===body.buttonId);
  if(!rows.length || !body.revisionId || rows.some(r=>r.revisionId!==body.revisionId || !r.revisionPending || r.itDoneDate || r.itSettlementSavedAt || ['COMPLETE','DONE'].includes(String(r.itStatus).toUpperCase()) || ['CANCELLED','EXTENDED','REDUCED'].includes(String(r.changeStatus).toUpperCase())))return json({ok:false,error:'code_locked',message:'เปลี่ยนรหัสได้เฉพาะงานแก้ไขที่ยังรอ IT ดำเนินการ'},env,409);
  const first=rows[0],kind=globalThis.PC_PromotionEditModel.toForm(block,body.month).form;
  if(body.slot==='itemset'&&kind!=='Proposal')return json({ok:false,error:'invalid_slot'},env,400);
  const type=body.slot==='itemset'?'itemset':({Coupon:'coupon',BillDiscountProposal:'bill',VoucherProposal:'voucher'}[kind]||(/e[-\s]?voucher/i.test(first.cate||first.cateRemark||'')?'coupon':'promo'));
  const counterRecord=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind('pc_code_counter_v1').first();
  if(!counterRecord)return json({ok:false,error:'counter_missing'},env,409);
  const counter=JSON.parse(counterRecord.v),used=new Set([...(globalThis.PC_EditCodeCatalog||[]),...(globalThis.PC_Email?.settlementCatalog?.codes||[])].map(String));
  const records=await db.prepare("SELECT k,v,updated_at FROM promo_store WHERE k LIKE 'promo::c::%' OR k IN ('promo::meta','pc_product_promo','pc_itemset_comp','pc_co_promotions','pc_code_requests','pc_member_cards','pc_member_coupons','pc_bill_discount_confirmed','promo::deleted')").all();
  const codeKeys=new Set(['code','button','itemCode','codePromotion','codeItemSet','itemPromotion','builderCode','prCode','promoCode']);
  function scan(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(k==='codes'&&Array.isArray(x))x.filter(c=>typeof c==='string').forEach(c=>used.add(c.trim().toUpperCase()));if(codeKeys.has(k)&&x!=null&&typeof x!=='object')used.add(String(x).trim().toUpperCase());if(/^(?:107\d+|P\d+|IC\d+|BD\d+|VC\d+)$/.test(k))used.add(k);if(x&&typeof x==='object')scan(x);}}
  for(const rec of records.results||[]){const v=JSON.parse(rec.v);if(rec.k==='promo::deleted'){if(Number(v[body.campaign])>0&&Number(v[body.campaign])>=(Number(block._ts)||0))return json({ok:false,error:'campaign_deleted'},env,409);}else if(rec.k.startsWith(CAMPAIGN_PREFIX))scan(v.m);else if(rec.k==='promo::meta')scan({npd:v.npd,npdProducts:v.npdProducts,recipeCustom:v.recipeCustom});else scan(v);}
  const now=Date.now(),at=new Date(now).toISOString(),column=body.slot==='itemset'?'codeItemSet':'codePromotion';let code;
  try{code=globalThis.PC_FormCodeAllocation.reserveFormCode(counter,{type,tag:'ITRevision',campaign:body.campaign,shortName:first.shortName,fieldId:'ITRevision|'+body.requestId,actor:body.actor,at,usedCodes:used,...(body.mode==='manual'?{manualCode:body.code??''}:{})}).code;}catch(e){return json({ok:false,error:'invalid_code',message:e.message},env,400);}
  // Use the same field identity as IT confirmation, so a reserved code can be confirmed later.
  counter.reservations[type+'::'+code].field='itccf-'+type+'-'+encodeURIComponent(JSON.stringify([body.campaign,first.shortName,body.month]));
  const oldCode=first[column]||'';
  if(/^[A-Z]{0,3}\d+$/i.test(oldCode)){
    let retained=Object.values(counter.reservations).find(e=>e&&String(e.code).toUpperCase()===String(oldCode).toUpperCase());
    if(!retained){retained={code:oldCode,type,status:'CONFIRMED',where:body.campaign,field:'RetainedIT|'+body.buttonId,by:body.actor,at};counter.reservations[type+'::'+String(oldCode).toUpperCase()]=retained;}
    retained.retainForHistory=true;retained.retainedByEditId=body.requestId;if(retained.status==='RELEASED')retained.status='CONFIRMED';
  }
  function apply(row){row[column]=code;row.posReady=false;if(body.slot==='itemset'){row.itemPromotion=code;}row.itCodeAllocationAt=at;row.itCodeAllocationBy=body.actor;}
  rows.forEach(apply);(block.w||[]).filter(r=>r.month===body.month&&r.editButtonId===body.buttonId).forEach(apply);block._ts=now;
  const version=Math.max(now,record.updated_at+1),counterVersion=Math.max(now,counterRecord.updated_at+1),receipt={ok:true,kind:'IT_BUTTON_CODE',submissionId:body.requestId,code,slot:body.slot,savedAt:now,versions:{[key]:version,pc_code_counter_v1:counterVersion}};
  const activity={id:'ACT-'+body.requestId,date:new Date(now+7*60*60*1000).toISOString().slice(0,10),at,user:body.actor,kind:'IT_CODE_ASSIGNED',campaign:body.campaign,month:body.month,buttons:[first.shortName],slot:body.slot,oldCode,code,mode:body.mode};
  const statements=[
    db.prepare("INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM promo_store p,json_each(p.v) t WHERE p.k='promo::deleted' AND t.key=?1 AND CAST(t.value AS INTEGER)>0 AND CAST(t.value AS INTEGER)>=?2) THEN 1 ELSE 0 END)").bind(body.campaign,Number(JSON.parse(record.v)._ts)||0),db.prepare('DELETE FROM promo_commit_guard WHERE id=1'),
  ];
  statements.push(db.prepare("INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM promo_store p,json_tree(CASE WHEN p.k LIKE 'promo::c::%' THEN json_extract(p.v,'$.m') WHEN p.k='promo::meta' THEN json_object('npd',json_extract(p.v,'$.npd'),'npdProducts',json_extract(p.v,'$.npdProducts'),'recipeCustom',json_extract(p.v,'$.recipeCustom')) ELSE p.v END) t WHERE (p.k LIKE 'promo::c::%' OR p.k IN ('promo::meta','pc_product_promo','pc_itemset_comp','pc_co_promotions','pc_code_requests','pc_member_cards','pc_member_coupons','pc_bill_discount_confirmed')) AND (((t.key IN ('code','button','itemCode','codePromotion','codeItemSet','itemPromotion','builderCode','prCode','promoCode') OR t.path LIKE '%.codes') AND UPPER(TRIM(CAST(t.atom AS TEXT)))=?1) OR UPPER(CAST(t.key AS TEXT))=?1)) THEN 1 ELSE 0 END)").bind(code));
  statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
  for(const [k,v,ver,expected] of [[key,block,version,record.updated_at],['pc_code_counter_v1',counter,counterVersion,counterRecord.updated_at]]){
    statements.push(db.prepare('UPDATE promo_store SET v=?2,updated_at=?3 WHERE k=?1 AND updated_at=?4').bind(k,JSON.stringify(v),ver,expected),db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
  }
  statements.push(db.prepare('INSERT INTO promo_store(k,v,updated_at) VALUES(?1,?2,?3)').bind('promo::activity::'+activity.date+'::'+activity.id,JSON.stringify(activity),now),db.prepare('INSERT INTO promo_submission_receipts(submission_id,request_hash,response_json,actor,expected_buttons,created_at) VALUES(?1,?2,?3,?4,1,?5)').bind(body.requestId,hash,JSON.stringify(receipt),body.actor,now));
  try{await db.batch(statements);return json(receipt,env);}catch(e){const raced=await receiptFor(db,body.requestId);if(raced&&raced.request_hash===hash)return json({...JSON.parse(raced.response_json),replayed:true},env);if(/constraint|CHECK|UNIQUE/i.test(String(e?.message||e)))return json({ok:false,error:'version_conflict'},env,409);throw e;}
}

async function commitCampaignEdit(db, body, env) {
  if (!body || !SUBMISSION_KEY.test(String(body.editId || '')) || typeof body.actor !== 'string' || !body.actor.trim() || body.actor.length > 200 || typeof body.campaign !== 'string' || body.campaign.length > 120 || !/^\d{4}-\d{2}$/.test(body.month || '') || !Number.isSafeInteger(body.expectedUpdatedAt) || !body.form || JSON.stringify(body.form).length > 2_000_000)
    return json({ok:false,error:'bad_edit'},env,400);
  const key=CAMPAIGN_PREFIX+encodeURIComponent(body.campaign);
  const hash=await hashSubmission({submissionId:body.editId,actor:body.actor,expectedButtons:0,writes:[{key,value:JSON.stringify({month:body.month,form:body.form}),expectedUpdatedAt:body.expectedUpdatedAt}]});
  const previous=await receiptFor(db,body.editId);
  if(previous)return previous.request_hash===hash ? json({...JSON.parse(previous.response_json),replayed:true},env) : json({ok:false,error:'submission_id_reused'},env,409);
  const record=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind(key).first();
  if(!record)return json({ok:false,error:'not_found'},env,404);
  if(record.updated_at!==body.expectedUpdatedAt)return json({ok:false,error:'version_conflict'},env,409);
  const original=JSON.parse(record.v),model=globalThis.PC_PromotionEditModel;
  const deletion=await db.prepare("SELECT t.value AS deletedAt FROM promo_store p,json_each(p.v) t WHERE p.k='promo::deleted' AND t.key=?1").bind(body.campaign).first();
  if(Number(deletion?.deletedAt)>0&&Number(deletion.deletedAt)>=(Number(original._ts)||0))return json({ok:false,error:'campaign_deleted',message:'แคมเปญนี้ถูกลบแล้ว กรุณาเปิดศูนย์ติดตามใหม่'},env,409);
  const policy=model.policy(original,body.actor,body.month);
  if(!policy.allowed)return json({ok:false,error:'edit_locked',message:policy.reason},env,403);
  if(body.form.fields?.campaign!==body.campaign)return json({ok:false,error:'rename_requires_it',message:'หากต้องการเปลี่ยนชื่อแคมเปญ กรุณาติดต่อ IT เพื่อคงการอ้างอิงรหัสเดิม'},env,409);
  const now=Date.now();let next,resources;
  try { next=model.applyRevision(original,body.form,{actor:body.actor,month:body.month,campaign:body.campaign,editId:body.editId,now:new Date(now).toISOString()}); }
  catch(e){return json({ok:false,error:'invalid_edit',message:e.message},env,400);}
  try{resources=await globalThis.PC_EditResources.prepareEditResources(db,{original,next,form:body.form,editId:body.editId,actor:body.actor,now,month:body.month});next=resources.next;}
  catch(e){return json({ok:false,error:'invalid_edit_resources',message:e.message},env,400);}
  const version=Math.max(now,record.updated_at+1);
  const receipt={ok:true,kind:'CAMPAIGN_EDIT',editId:body.editId,submissionId:body.editId,savedAt:now,savedButtons:body.form.buttons.length,versions:{[key]:version}};
  resources.writes.forEach(w=>receipt.versions[w.key]=Math.max(now,(w.expectedUpdatedAt||0)+1));
  const date=new Date(now+7*60*60*1000).toISOString().slice(0,10),activityId='ACT-'+body.editId;
  const activity={id:activityId,date,at:new Date(now).toISOString(),user:body.actor.trim(),kind:'EDITED',campaign:body.campaign,scope:'campaign',buttons:body.form.buttons.map(b=>b.shortName),items:[],note:String(body.form.editReason||'แก้ไขข้อมูลผ่านฟอร์มแจ้งโปรโมชั่น').trim(),editId:body.editId,month:body.month,previousRows:original.m[body.month],changes:next.m[body.month][0].revisionChanges||[],returnedToIT:!!policy.requiresReason};
  const statements=[
    db.prepare("INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM promo_store p,json_each(p.v) t WHERE p.k='promo::deleted' AND t.key=?1 AND CAST(t.value AS INTEGER)>0 AND CAST(t.value AS INTEGER)>=?2) THEN 1 ELSE 0 END)").bind(body.campaign,Number(original._ts)||0),
    db.prepare('DELETE FROM promo_commit_guard WHERE id=1'),
    db.prepare('UPDATE promo_store SET v=?2,updated_at=?3 WHERE k=?1 AND updated_at=?4').bind(key,JSON.stringify(next),version,record.updated_at),
    db.prepare('INSERT INTO promo_commit_guard(id) VALUES (CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
    db.prepare('DELETE FROM promo_commit_guard WHERE id=1'),
    db.prepare('INSERT INTO promo_store(k,v,updated_at) VALUES(?1,?2,?3)').bind('promo::activity::'+date+'::'+activityId,JSON.stringify(activity),now),
    db.prepare('INSERT INTO promo_submission_receipts(submission_id,request_hash,response_json,actor,expected_buttons,created_at) VALUES(?1,?2,?3,?4,?5,?6)').bind(body.editId,hash,JSON.stringify(receipt),body.actor.trim(),body.form.buttons.length,now)
  ];
  // Recheck actual code references inside the same transaction, before our
  // campaign UPDATE. The counter CAS alone cannot catch a concurrent write
  // from a legacy product/campaign client that never touches the counter.
  for(const code of resources.codeClaims||[]){
    statements.unshift(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    statements.unshift(db.prepare("INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM promo_store p,json_tree(CASE WHEN p.k LIKE 'promo::c::%' THEN json_extract(p.v,'$.m') WHEN p.k='promo::meta' THEN json_object('npd',json_extract(p.v,'$.npd'),'npdProducts',json_extract(p.v,'$.npdProducts'),'recipeCustom',json_extract(p.v,'$.recipeCustom')) ELSE p.v END) t WHERE (p.k LIKE 'promo::c::%' OR p.k IN ('promo::meta','pc_product_promo','pc_itemset_comp','pc_co_promotions','pc_code_requests','pc_member_cards','pc_member_coupons','pc_bill_discount_confirmed')) AND ((t.key IN ('code','button','itemCode','codePromotion','codeItemSet','itemPromotion','builderCode','prCode','promoCode') AND UPPER(TRIM(CAST(t.atom AS TEXT)))=?1) OR UPPER(CAST(t.key AS TEXT))=?1)) THEN 1 ELSE 0 END)").bind(code));
  }
  resources.writes.forEach(w=>{
    statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN (?2 IS NULL AND NOT EXISTS(SELECT 1 FROM promo_store WHERE k=?1)) OR EXISTS(SELECT 1 FROM promo_store WHERE k=?1 AND updated_at=?2) THEN 1 ELSE 0 END)').bind(w.key,w.expectedUpdatedAt));
    statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    statements.push(db.prepare('INSERT INTO promo_store(k,v,updated_at) VALUES(?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at WHERE ?4 IS NOT NULL AND promo_store.updated_at=?4').bind(w.key,w.value,receipt.versions[w.key],w.expectedUpdatedAt));
    statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));
    statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
  });
  try{await db.batch(statements);return json(receipt,env);}
  catch(e){
    const raced=await receiptFor(db,body.editId);
    if(raced)return raced.request_hash===hash?json({...JSON.parse(raced.response_json),replayed:true},env):json({ok:false,error:'submission_id_reused'},env,409);
    if(/constraint|CHECK|UNIQUE/i.test(String(e&&e.message||e)))return json({ok:false,error:'version_conflict'},env,409);throw e;
  }
}

async function commitSubmission(db, body, env, pilotActor = null) {
  const error = validateSubmission(body);
  if (error) return json({ ok: false, error }, env, error === 'version_required' ? 428 : 400);
  const hash = await hashSubmission(body);
  const existing = await receiptFor(db, body.submissionId);
  if (existing) {
    if(pilotActor){
      const owners=await db.prepare('SELECT owner_tenant,owner_oid FROM email_campaigns WHERE submission_id=?').bind(body.submissionId).all();
      if(!owners.results.length||owners.results.some(r=>r.owner_tenant!==pilotActor.tenantId||r.owner_oid!==pilotActor.objectId))return json({error:'email_campaign_denied'},env,403);
    }
    return existing.request_hash === hash
      ? json({ ...JSON.parse(existing.response_json), replayed: true }, env)
      : json({ ok: false, error: 'submission_id_reused' }, env, 409);
  }

  const now = Date.now();
  const versions = Object.fromEntries(body.writes.map(write => [
    write.key, Math.max(now, (write.expectedUpdatedAt ?? -1) + 1),
  ]));
  const receipt = {
    ok: true, submissionId: body.submissionId, savedAt: now,
    savedButtons: body.expectedButtons, versions,
  };
  const statements = [];
  if(pilotActor){
    const registration=await globalThis.PC_Email.preparePilotSubmission(pilotActor,body,env);
    statements.push(...registration.statements);receipt.emailCampaigns=registration.campaigns;
  }
  for (const write of body.writes) {
    statements.push(db.prepare(
      'INSERT INTO promo_store (k,v,updated_at) VALUES (?1,?2,?3) ' +
      'ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at ' +
      'WHERE ?4 IS NOT NULL AND promo_store.updated_at=?4'
    ).bind(write.key, write.value, versions[write.key], write.expectedUpdatedAt));
    // changes() reports only the direct INSERT/UPDATE, not history-trigger rows.
    // A stale version makes it zero, causing CHECK to fail and D1.batch to roll back.
    statements.push(db.prepare('INSERT INTO promo_commit_guard(id) VALUES (CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));
    statements.push(db.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
  }
  statements.push(db.prepare(
    'INSERT INTO promo_submission_receipts (submission_id,request_hash,response_json,actor,expected_buttons,created_at) ' +
    'VALUES (?1,?2,?3,?4,?5,?6)'
  ).bind(body.submissionId, hash, JSON.stringify(receipt), body.actor.trim(), body.expectedButtons, now));
  try {
    await db.batch(statements);
    return json(receipt, env);
  } catch (cause) {
    // A timeout/retry can race with the first request. Never tell the browser
    // to create a new submission until the immutable receipt is checked.
    const raced = await receiptFor(db, body.submissionId);
    if (raced) {
      if(pilotActor){
        const owners=await db.prepare('SELECT owner_tenant,owner_oid FROM email_campaigns WHERE submission_id=?').bind(body.submissionId).all();
        if(!owners.results.length||owners.results.some(r=>r.owner_tenant!==pilotActor.tenantId||r.owner_oid!==pilotActor.objectId))return json({error:'email_campaign_denied'},env,403);
      }
      return raced.request_hash === hash
        ? json({ ...JSON.parse(raced.response_json), replayed: true }, env)
        : json({ ok: false, error: 'submission_id_reused' }, env, 409);
    }
    if (/constraint|promo_commit_guard/i.test(String(cause?.message || cause))) {
      const currentVersions = {};
      for (const write of body.writes) currentVersions[write.key] = await currentVersion(db, write.key);
      return json({ ok: false, error: 'version_conflict', currentVersions }, env, 409);
    }
    throw cause;
  }
}

globalThis.PC_Email.commitPilotPrimary=async function(actor,body,env){
  if(env.CLOUD_FIRST_ENABLED!=='true')throw Error('email_primary_unavailable');
  const result=await commitSubmission(env.DB,body,env,actor);
  const data=await result.json();if(!result.ok)throw Error(data.error||'email_primary_failed');return data;
};

export default {
  scheduled(event,env,ctx) {
    ctx.waitUntil(globalThis.PC_Email.dispatchEmail(env));
  },
  async fetch(request, env) {
    const emailResponse = await globalThis.PC_Email.routeEmail(request, env);
    if (emailResponse) return emailResponse;
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'potato-promo-sync', protocol: 2, ts: Date.now() }, env);
    }
    if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, env, 401);

    try {
      if(path==='/promo/mail-history'&&request.method==='GET')return json(await globalThis.PC_Email.sharedMailHistory(env),env);
      if(path==='/promo/edit-capabilities'&&request.method==='GET')return json({ok:true,structuralEdits:env.CLOUD_FIRST_ENABLED==='true',version:1},env);
      if (path === '/promo/store' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT k,v,updated_at FROM promo_store').all();
        const keys = {}, meta = {};
        for (const row of rows.results || []) { keys[row.k] = row.v; meta[row.k] = row.updated_at; }
        return json({ ok: true, keys, meta }, env);
      }
      if (path === '/promo/meta' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT k,updated_at FROM promo_store').all();
        const meta = {};
        for (const row of rows.results || []) meta[row.k] = row.updated_at;
        return json({ ok: true, meta }, env);
      }
      if(path==='/promo/it-button-code'&&request.method==='POST'){
        if(env.CLOUD_FIRST_ENABLED!=='true')return json({ok:false,error:'not_enabled'},env,404);
        let body;try{body=await request.json();}catch{return json({ok:false,error:'bad_json'},env,400);}
        return commitITButtonCode(env.DB,body,env);
      }
      if (path === '/promo/campaign-edits' && request.method === 'POST') {
        if(env.CLOUD_FIRST_ENABLED!=='true')return json({ok:false,error:'not_enabled'},env,404);
        let body;try{body=await request.json();}catch{return json({ok:false,error:'bad_json'},env,400);}
        return commitCampaignEdit(env.DB,body,env);
      }
      if (path === '/promo/submissions' && request.method === 'POST') {
        if (env.CLOUD_FIRST_ENABLED !== 'true') return json({ ok: false, error: 'not_enabled' }, env, 404);
        let body;
        try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, env, 400); }
        return commitSubmission(env.DB, body, env);
      }
      const submissionMatch = path.match(/^\/promo\/submissions\/([^/]+)$/);
      if (submissionMatch && request.method === 'GET') {
        if (env.CLOUD_FIRST_ENABLED !== 'true') return json({ ok: false, error: 'not_enabled' }, env, 404);
        let submissionId;
        try { submissionId = decodeURIComponent(submissionMatch[1]); }
        catch { return json({ ok: false, error: 'bad_submission_id' }, env, 400); }
        if (!SUBMISSION_KEY.test(submissionId)) return json({ ok: false, error: 'bad_submission_id' }, env, 400);
        const receipt = await receiptFor(env.DB, submissionId);
        return receipt ? json(JSON.parse(receipt.response_json), env)
          : json({ ok: false, error: 'not_found' }, env, 404);
      }
      // Old tabs cannot write their stale, unversioned snapshots into D1.
      if (path === '/promo/store' && request.method === 'POST') {
        return json({ ok: false, error: 'upgrade_required' }, env, 428);
      }
      const match = path.match(/^\/promo\/store\/(.+)$/);
      if (match) {
        let key;
        try { key = decodeURIComponent(match[1]); } catch { return json({ ok: false, error: 'bad_key' }, env, 400); }
        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind(key).first();
          return row ? json({ ok: true, key, value: row.v, updated_at: row.updated_at }, env)
            : json({ ok: false, error: 'not_found' }, env, 404);
        }
        if (request.method === 'PUT' || request.method === 'DELETE') {
          let body;
          try { body = await request.json(); } catch { return json({ ok: false, error: 'version_required' }, env, 428); }
          return request.method === 'PUT'
            ? guardedPut(env.DB, key, body, env)
            : guardedDelete(env.DB, key, body, env);
        }
      }
      return json({ ok: false, error: 'not_found', path }, env, 404);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, env, 500);
    }
  },
};
