(function(root){
  'use strict';const api=root.PC_Email;
  const owner=(c,a)=>c.owner_tenant===a.tenantId&&c.owner_oid===a.objectId;
  const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
  const guard=env=>[env.DB.prepare('INSERT INTO promo_commit_guard(id) VALUES (CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1')];
  const audit=(env,c,a,event)=>statement(env,'INSERT INTO email_audit VALUES (?,?,?,?,?,?)',crypto.randomUUID(),c,api.emailActorKey(a),event,'{}',Date.now());
  function authorizationGuard(env,actor,permission,c,thread,sourceVersion){return [statement(env,"INSERT INTO promo_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM email_actor_permissions WHERE tenant_id=? AND object_id=? AND permission=? AND enabled=1) AND EXISTS(SELECT 1 FROM email_threads WHERE id=? AND version=? AND audience_json=? AND to_json=? AND cc_json=? AND enabled=1) AND EXISTS(SELECT 1 FROM promo_store WHERE k=? AND updated_at=?) THEN 1 ELSE 0 END",actor.tenantId,actor.objectId,permission,thread.id,thread.version,thread.audience_json,thread.to_json,thread.cc_json,c.campaign_key,sourceVersion),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1')];}
  async function campaign(id,env){const c=await statement(env,'SELECT * FROM email_campaigns WHERE id=?',id).first();if(!c||c.status!=='active')throw Error('email_campaign_unavailable');return c;}
  async function source(c,env){
    const row=await statement(env,'SELECT v,updated_at FROM promo_store WHERE k=?',c.campaign_key).first();
    if(!row)throw Error('email_source_changed');
    const block=JSON.parse(row.v),rows=api.coProSource(block,c.month);
    if(await api.hash(JSON.stringify(rows))!==c.source_hash)throw Error('email_source_changed');
    return {row,block,rows};
  }
  api.preparePilotSubmission=async function(actor,body,env){
    await api.requireEmailPermission(actor,'submit',env);
    const statements=[],campaigns=[];
    for(const w of body.writes||[]){
      if(!w.key.startsWith('promo::c::'))continue;
      if(w.expectedUpdatedAt!==null)throw Error('email_new_campaign_required');
      const block=JSON.parse(w.value);
      for(const month of Object.keys(block.m||{})){
        const rows=api.coProSource(block,month);
        if(rows.some(r=>r.submissionBatchId!==body.submissionId||!String(r.shortName||'').trim()))throw Error('email_invalid_campaign');
        const id=crypto.randomUUID();
        const existing=await statement(env,'SELECT id FROM email_campaigns WHERE campaign_key=? AND month=?',w.key,month).first();
        if(existing)throw Error('email_campaign_already_registered');
        const unique=new Map();rows.forEach(r=>unique.set(api.coProButtonIdentity(r),r));
        for(const [identity] of unique){const buttonId=crypto.randomUUID();
          for(const row of block.m[month])if(api.coProButtonIdentity(row)===identity){row.emailCampaignId=id;row.emailButtonId=buttonId;row.emailRowId=crypto.randomUUID();}
          statements.push(statement(env,'INSERT INTO email_campaign_buttons(campaign_id,button_id,source_identity_json) VALUES (?,?,?)',id,buttonId,identity));
        }
        const canonical=api.coProSource(block,month),hash=await api.hash(JSON.stringify(canonical));
        statements.unshift(statement(env,'INSERT INTO email_campaigns VALUES (?,?,?,?,?,?,?,?,1,\'active\')',id,w.key,month,body.submissionId,actor.tenantId,actor.objectId,hash,JSON.stringify(canonical)));
        campaigns.push({id,key:w.key,month});
      }
      w.value=JSON.stringify(block);
    }
    if(!campaigns.length)throw Error('email_invalid_campaign');return {statements,campaigns};
  };
  api.registerPilotSubmission=async function(actor,body,env){
    await api.requireEmailPermission(actor,'submit',env);
    if(!api.commitPilotPrimary)throw Error('email_primary_unavailable');
    return api.commitPilotPrimary(actor,body,env);
  };
  api.checkCoProSource=source;
  async function draft(actor,input,env){
    await api.requireEmailPermission(actor,'submit',env);
    const c=await campaign(input.campaignId,env);if(!owner(c,actor))throw Error('email_campaign_denied');
    const current=await source(c,env);
    const thread=await statement(env,'SELECT * FROM email_threads WHERE id=? AND enabled=1',input.policyId).first();
    if(!thread||thread.version!==input.policyVersion||!api.threadAudience(thread,actor)||!['test','production'].includes(api.emailThreadMode(thread)))throw Error('email_policy_changed');
    const recipients=api.emailRecipients(input.recipients),approved={to:JSON.parse(thread.to_json),cc:JSON.parse(thread.cc_json)};
    if(JSON.stringify(recipients)!==JSON.stringify(approved))throw Error('email_unapproved_recipients');
    const buttons=(await statement(env,'SELECT * FROM email_campaign_buttons WHERE campaign_id=? AND cancelled=0',c.id).all()).results;
    if(!Array.isArray(input.records)||input.records.length!==buttons.length||!buttons.length)throw Error('email_incomplete_records');
    const seen=new Set(),records=input.records.map(r=>{
      if(seen.has(r.buttonId)||!buttons.some(b=>b.button_id===r.buttonId)||typeof r.brand!=='string'||!r.brand.trim()||String(r.detail||'').length>8000)throw Error('email_invalid_record');
      const saved={buttonId:r.buttonId,brand:r.brand.trim(),detail:String(r.detail||'')};
      // Keep business/accounting data, without exposing it through the public mail template.
      for(const key of ['billingEntity','paymentType','soNo','quota','priceIncVat','paymentCondition','remark','periodText','cmposName','buttonName','promoType']){
        if(r[key]!==undefined){if(typeof r[key]!=='string'||r[key].length>8000)throw Error('email_invalid_record');saved[key]=r[key];}
      }
      seen.add(r.buttonId);return saved;
    }).sort((a,b)=>a.buttonId.localeCompare(b.buttonId));
    const contentHash=await api.hash(JSON.stringify({source:c.source_hash,thread:thread.id,version:thread.version,recipients,records}));
    return {c,thread,recipients,records,contentHash,sourceVersion:current.row.updated_at};
  }
  api.previewCoPromo=async function(actor,input,env){const d=await draft(actor,input,env),details=api.coProDetails(JSON.parse(d.c.source_json),d.records);return {previewHash:d.contentHash,details,text:api.renderCoProEmail({milestone:'submitted',details}).text,recipients:d.recipients,subject:d.thread.subject};};
  function snapshot(c,t,recipients,milestone,rows,records){return {deliveryMode:api.emailThreadMode(t),threadId:t.thread_id,rfcMessageId:t.rfc_message_id,references:JSON.parse(t.references_json),subject:t.subject,recipients,milestone,details:api.coProDetails(rows,records)};}
  function queued(env,c,bindingVersion,milestone,snap,conditional='1',args=[]){
    const now=Date.now();return statement(env,"INSERT OR IGNORE INTO email_outbox(id,event_key,campaign_id,binding_version,snapshot_json,status,created_at,updated_at) SELECT ?,?,?,?,?,'queued',?,? WHERE "+conditional,crypto.randomUUID(),c.id+':'+c.month+':'+milestone,c.id,bindingVersion,JSON.stringify(snap),now,now,...args);
  }
  api.commitCoPromo=async function(actor,input,env){
    const d=await draft(actor,input,env),{c,thread,records,recipients,contentHash}=d;
    if(input.confirmed!==true||input.previewHash!==contentHash)throw Error('email_confirmation_required');
    const existing=await statement(env,'SELECT * FROM email_bindings WHERE campaign_id=?',c.id).first();
    if(existing){if(existing.content_hash!==contentHash)throw Error('email_revision_not_enabled');return {saved:true,mailStatus:'queued',campaignId:c.id,version:c.version};}
    if(input.expectedVersion!==c.version)throw Error('email_version_conflict');
    const statements=[...authorizationGuard(env,actor,'submit',c,thread,d.sourceVersion),statement(env,'UPDATE email_campaigns SET version=version+1 WHERE id=? AND version=?',c.id,c.version),...guard(env)];
    statements.push(statement(env,'INSERT INTO email_bindings VALUES (?,?,?,?,?,?,?,1)',c.id,thread.id,thread.version,JSON.stringify(recipients),contentHash,api.emailActorKey(actor),Date.now()));
    for(const r of records)statements.push(statement(env,'INSERT INTO email_copro_records(id,campaign_id,button_id,record_json) VALUES (?,?,?,?)',crypto.randomUUID(),c.id,r.buttonId,JSON.stringify(r)));
    statements.push(queued(env,c,1,'submitted',snapshot(c,thread,recipients,'submitted',JSON.parse(c.source_json),records)),audit(env,c.id,actor,'submitted'));
    await env.DB.batch(statements);return {saved:true,mailStatus:'queued',campaignId:c.id,version:c.version+1};
  };
  async function complete(actor,input,env,kind){
    await api.requireEmailPermission(actor,'it',env);
    const c=await campaign(input.campaignId,env),s=await source(c,env);
    const button=await statement(env,'SELECT * FROM email_campaign_buttons WHERE campaign_id=? AND button_id=?',c.id,input.buttonId).first();
    const binding=await statement(env,'SELECT * FROM email_bindings WHERE campaign_id=?',c.id).first();
    if(!button||button.cancelled||!binding)throw Error('email_button_unavailable');
    const record=await statement(env,'SELECT * FROM email_copro_records WHERE campaign_id=? AND button_id=?',c.id,button.button_id).first();
    if(!record)throw Error('email_button_unavailable');
    if(kind==='it'&&button.it_done||kind==='interface'&&record.interface_done)return {saved:true,mailStatus:await mailState(c,env),campaignId:c.id};
    const target=kind==='it'?button:record;
    if(target.version!==input.expectedVersion)throw Error('email_version_conflict');
    const statements=[statement(env,'UPDATE email_campaigns SET version=version+1 WHERE id=? AND version=?',c.id,c.version),...guard(env)];
    const now=Date.now();
    if(kind==='it'){
      const staged=await api.prepareEmailSettlement(c,s,button,input,env,now),normalized=staged.rows;
      for(const w of staged.writes)statements.push(statement(env,'INSERT INTO promo_store(k,v,updated_at) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at WHERE ? IS NOT NULL AND promo_store.updated_at=?',w.key,w.value,Math.max(now,(w.expectedUpdatedAt||0)+1),w.expectedUpdatedAt,w.expectedUpdatedAt),...guard(env));
      statements.push(statement(env,'UPDATE promo_store SET v=?,updated_at=? WHERE k=? AND updated_at=?',JSON.stringify(s.block),Math.max(now,s.row.updated_at+1),c.campaign_key,s.row.updated_at),...guard(env));
      statements.push(statement(env,'UPDATE email_campaigns SET source_json=?,source_hash=? WHERE id=?',JSON.stringify(normalized),await api.hash(JSON.stringify(normalized)),c.id));
      statements.push(statement(env,'UPDATE email_campaign_buttons SET it_done=1,it_by=?,it_at=?,source_identity_json=?,version=version+1 WHERE campaign_id=? AND button_id=? AND version=?',api.emailActorKey(actor),now,staged.identity,c.id,button.button_id,button.version),...guard(env));
      c.source_json=JSON.stringify(normalized);
    }else statements.push(statement(env,'UPDATE email_copro_records SET interface_done=1,interface_by=?,interface_at=?,version=version+1 WHERE id=? AND version=?',api.emailActorKey(actor),now,record.id,record.version),...guard(env));
    const thread=await statement(env,'SELECT * FROM email_threads WHERE id=? AND enabled=1',binding.thread_id).first();
    if(!thread||thread.version!==binding.policy_version)throw Error('email_policy_changed');
    statements.unshift(...authorizationGuard(env,actor,'it',c,thread,s.row.updated_at));
    const records=(await statement(env,'SELECT record_json FROM email_copro_records WHERE campaign_id=?',c.id).all()).results.map(r=>JSON.parse(r.record_json));
    const predicate='EXISTS(SELECT 1 FROM email_campaign_buttons WHERE campaign_id=? AND cancelled=0) AND NOT EXISTS(SELECT 1 FROM email_campaign_buttons b LEFT JOIN email_copro_records r ON r.campaign_id=b.campaign_id AND r.button_id=b.button_id WHERE b.campaign_id=? AND b.cancelled=0 AND (b.it_done=0 OR COALESCE(r.interface_done,0)=0))';
    statements.push(queued(env,c,binding.version,'it_interface_complete',snapshot(c,thread,JSON.parse(binding.recipients_json),'it_interface_complete',JSON.parse(c.source_json),records),predicate,[c.id,c.id]),audit(env,c.id,actor,kind));
    await env.DB.batch(statements);return {saved:true,mailStatus:await mailState(c,env),campaignId:c.id};
  }
  async function mailState(c,env){const event=await statement(env,'SELECT status FROM email_outbox WHERE event_key=?',c.id+':'+c.month+':it_interface_complete').first();return event?.status||'waiting_for_both';}
  api.commitIT=(actor,input,env)=>complete(actor,input,env,'it');
  api.commitInterface=(actor,input,env)=>complete(actor,input,env,'interface');
  api.coProStatus=async function(actor,id,env){
    const c=await campaign(id,env);if(!owner(c,actor))await api.requireEmailPermission(actor,'it',env);
    const buttons=(await statement(env,'SELECT b.button_id,b.source_identity_json,b.it_done,b.version,r.id record_id,r.interface_done,r.version interface_version FROM email_campaign_buttons b LEFT JOIN email_copro_records r ON r.campaign_id=b.campaign_id AND r.button_id=b.button_id WHERE b.campaign_id=?',id).all()).results;
    const history=(await statement(env,'SELECT event_key,status,provider_id,sanitized_error,created_at,updated_at FROM email_outbox WHERE campaign_id=? ORDER BY created_at',id).all()).results;
    return {id:c.id,key:c.campaign_key,month:c.month,version:c.version,buttons,history};
  };
  api.listCoProCampaigns=async function(actor,env){
    let isIT=false;try{await api.requireEmailPermission(actor,'it',env);isIT=true;}catch(_){await api.requireEmailPermission(actor,'submit',env);}
    const rows=(await statement(env,'SELECT * FROM email_campaigns WHERE status=\'active\' AND (?=1 OR (owner_tenant=? AND owner_oid=?)) LIMIT 100',isIT?1:0,actor.tenantId,actor.objectId).all()).results,items=[];
    for(const c of rows){
      const status=await api.coProStatus(actor,c.id,env),records=(await statement(env,'SELECT * FROM email_copro_records WHERE campaign_id=?',c.id).all()).results;
      items.push({...status,records:records.map(r=>{const identity=JSON.parse(status.buttons.find(b=>b.button_id===r.button_id).source_identity_json),first=JSON.parse(c.source_json)[0];return {...JSON.parse(r.record_json),id:r.id,emailCampaignId:c.id,emailButtonId:r.button_id,emailVersion:r.version,campaign:first.campaign,start:first.start,end:first.end,month:c.month,type:'Co-Promotion',cmposName:identity.shortName,buttonName:identity.shortName,codePromotion:identity.codePromotion,codeItemSet:identity.codeItemSet,interfaceSetup:r.interface_done,interfaceBy:r.interface_by,interfaceAt:r.interface_at?new Date(r.interface_at).toISOString():''};})});
    }
    return {items};
  };
})(globalThis);
