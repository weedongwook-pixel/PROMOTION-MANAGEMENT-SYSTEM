(function(root){
  'use strict';const api=root.PC_Email;
  function additionalMessage(input){const value=input.additionalMessage??'';if(typeof value!=='string'||value.length>4000)throw Error('email_invalid_record');return value.trim();}
  const owner=(c,a)=>c.owner_tenant===a.tenantId&&c.owner_oid===a.objectId;
  const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
  const guard=env=>[env.DB.prepare('INSERT INTO promo_commit_guard(id) VALUES (CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1')];
  const audit=(env,c,a,event)=>statement(env,'INSERT INTO email_audit VALUES (?,?,?,?,?,?)',crypto.randomUUID(),c,api.emailActorKey(a),event,JSON.stringify(a.staffId?{staffId:a.staffId,staffName:a.staffName}:{}),Date.now());
  function authorizationGuard(env,actor,permission,c,thread,sourceVersion){return [...(api.staffTransactionGuard?.(env,actor,permission)||[]),statement(env,"INSERT INTO promo_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM email_actor_permissions WHERE tenant_id=? AND object_id=? AND permission=? AND enabled=1) AND EXISTS(SELECT 1 FROM email_threads WHERE id=? AND version=? AND audience_json=? AND to_json=? AND cc_json=? AND enabled=1) AND EXISTS(SELECT 1 FROM promo_store WHERE k=? AND updated_at=?) THEN 1 ELSE 0 END",actor.tenantId,actor.objectId,permission,thread.id,thread.version,thread.audience_json,thread.to_json,thread.cc_json,c.campaign_key,sourceVersion),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1')];}
  async function campaign(id,env){const c=await statement(env,'SELECT * FROM email_campaigns WHERE id=?',id).first();if(!c||c.status!=='active')throw Error('email_campaign_unavailable');return c;}
  async function source(c,env,allowDraft=false){
    const row=await statement(env,'SELECT v,updated_at FROM promo_store WHERE k=?',c.campaign_key).first();
    if(!row)throw Error('email_source_changed');
    const block=JSON.parse(row.v),rows=api.coProSource(block,c.month);
    const hash=await api.hash(JSON.stringify(rows));
    const binding=allowDraft?await statement(env,'SELECT campaign_id FROM email_bindings WHERE campaign_id=?',c.id).first():true;
    if(allowDraft&&!binding){
      // Registration owns the membership forever. Names/codes are mutable labels.
      const original=JSON.parse(c.source_json),registered=new Map(original.map(r=>[r.emailRowId,r])),seen=new Set(),identities=new Map();
      if(rows.length!==original.length||registered.size!==original.length)throw Error('email_source_changed');
      for(const r of rows){
        const old=registered.get(r.emailRowId),identity=api.coProButtonIdentity(r);
        if(!r.emailRowId||seen.has(r.emailRowId)||!old||r.emailCampaignId!==c.id||r.emailCampaignId!==old.emailCampaignId||!r.emailButtonId||r.emailButtonId!==old.emailButtonId||r.submissionBatchId!==c.submission_id||r.submissionBatchId!==old.submissionBatchId||r.campaign!==old.campaign||!String(r.shortName||'').trim()||['changeStatus','cancelReason','revisionId','revisionPending'].some(k=>JSON.stringify(r[k])!==JSON.stringify(old[k])))throw Error('email_source_changed');
        if(identities.has(r.emailButtonId)&&identities.get(r.emailButtonId)!==identity)throw Error('email_source_changed');
        seen.add(r.emailRowId);identities.set(r.emailButtonId,identity);
      }
      const buttons=(await statement(env,'SELECT * FROM email_campaign_buttons WHERE campaign_id=?',c.id).all()).results;
      if(buttons.length!==identities.size||buttons.some(b=>b.cancelled||!identities.has(b.button_id)))throw Error('email_source_changed');
      c.source_json=JSON.stringify(rows);c.source_hash=hash;
      return {row,block,rows,draft:true,identities};
    }
    if(hash!==c.source_hash)throw Error('email_source_changed');
    return {row,block,rows,draft:false};
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
    if(!campaigns.length)throw Error('email_invalid_campaign');statements.unshift(...(api.staffTransactionGuard?.(env,actor,'submit')||[]));return {statements,campaigns};
  };
  // Explicit administrative recovery of a pre-pilot campaign; never sends mail.
  api.adoptCoProCampaign=async function(actor,input,env){
    if(env.EMAIL_AUTH_MODE!=='gmail_owner'||!api.isGmailOwner?.(actor))throw Error('email_admin_required');
    await api.requireEmailPermission(actor,'manage',env);await api.requireEmailPermission(actor,'submit',env);
    if(input.confirmed!==true)throw Error('email_confirmation_required');
    if(typeof input.campaignKey!=='string'||!input.campaignKey.startsWith('promo::c::')||!Number.isSafeInteger(input.expectedSourceVersion))throw Error('email_source_changed');
    const connection=await statement(env,"SELECT generation FROM email_connections WHERE id=1 AND status='connected'").first();
    if(!connection)throw Error('email_reconnect_required');
    const live=await statement(env,'SELECT v,updated_at FROM promo_store WHERE k=?',input.campaignKey).first();
    if(!live||live.updated_at!==input.expectedSourceVersion)throw Error('email_source_changed');
    const block=JSON.parse(live.v),rows=api.coProSource(block,input.month),name=rows[0].campaign;
    if(!name||input.campaignKey!=='promo::c::'+encodeURIComponent(name)||rows.some(r=>r.campaign!==name||!String(r.shortName||'').trim()||r.changeStatus||r.revisionPending||r.revisionId||r.cancelReason))throw Error('email_source_changed');
    if(block.m[input.month].some(r=>/^(CANCELLED|DELETED)$/.test(String(r.itStatus||r.opStatus||'').toUpperCase())))throw Error('email_source_changed');
    if(Object.values(block.m||{}).some(list=>!Array.isArray(list)||list.some(r=>r.emailCampaignId||r.emailButtonId||r.emailRowId))||(block.w||[]).some(r=>r.emailCampaignId||r.emailButtonId||r.emailRowId))throw Error('email_source_changed');
    if(await statement(env,'SELECT id FROM email_campaigns WHERE campaign_key=?',input.campaignKey).first())throw Error('email_campaign_denied');
    const batches=new Set(rows.map(r=>r.submissionBatchId||''));if(batches.size!==1)throw Error('email_source_changed');
    const submissionId=rows[0].submissionBatchId||crypto.randomUUID(),id=crypto.randomUUID(),identities=new Map();
    for(const r of block.m[input.month]){const identity=api.coProButtonIdentity(r);if(!identities.has(identity))identities.set(identity,crypto.randomUUID());Object.assign(r,{submissionBatchId:submissionId,emailCampaignId:id,emailButtonId:identities.get(identity),emailRowId:crypto.randomUUID()});}
    for(const r of block.w||[])if(r.month===input.month&&identities.has(api.coProButtonIdentity(r)))Object.assign(r,{submissionBatchId:submissionId,emailCampaignId:id,emailButtonId:identities.get(api.coProButtonIdentity(r))});
    const canonical=api.coProSource(block,input.month),now=Date.now();
    const statements=[...(api.staffTransactionGuard?.(env,actor,'submit')||[]),statement(env,"INSERT INTO promo_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM email_actor_permissions WHERE tenant_id=?1 AND object_id=?2 AND permission='submit' AND enabled=1) AND (EXISTS(SELECT 1 FROM email_actor_permissions WHERE tenant_id=?1 AND object_id=?2 AND permission='manage' AND enabled=1) OR EXISTS(SELECT 1 FROM email_admin_grants WHERE tenant_id=?1 AND object_id=?2 AND enabled=1)) AND EXISTS(SELECT 1 FROM email_connections WHERE id=1 AND status='connected' AND generation=?3) AND NOT EXISTS(SELECT 1 FROM email_campaigns WHERE campaign_key=?4) AND NOT EXISTS(SELECT 1 FROM promo_store p,json_each(p.v) t WHERE p.k='promo::deleted' AND t.key=?5 AND CAST(t.value AS INTEGER)>0 AND CAST(t.value AS INTEGER)>=?6) THEN 1 ELSE 0 END",actor.tenantId,actor.objectId,connection.generation,input.campaignKey,name,Number(block._ts)||0),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1'),
      statement(env,'UPDATE promo_store SET v=?,updated_at=? WHERE k=? AND updated_at=?',JSON.stringify(block),Math.max(now,live.updated_at+1),input.campaignKey,live.updated_at),...guard(env),
      statement(env,"INSERT INTO email_campaigns VALUES (?,?,?,?,?,?,?,?,1,'active')",id,input.campaignKey,input.month,submissionId,actor.tenantId,actor.objectId,await api.hash(JSON.stringify(canonical)),JSON.stringify(canonical))];
    for(const [identity,buttonId] of identities)statements.push(statement(env,'INSERT INTO email_campaign_buttons(campaign_id,button_id,source_identity_json) VALUES (?,?,?)',id,buttonId,identity));
    statements.push(audit(env,id,actor,'adopted'));await env.DB.batch(statements);return {id,key:input.campaignKey,month:input.month,version:1};
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
    const current=await source(c,env,true);
    const thread=await statement(env,'SELECT * FROM email_threads WHERE id=? AND enabled=1',input.policyId).first();
    if(!thread||thread.version!==input.policyVersion||!api.threadAudience(thread,actor)||!['test','production'].includes(api.emailThreadMode(thread)))throw Error('email_policy_changed');
    const recipients=api.emailRecipients(input.recipients),approved={to:JSON.parse(thread.to_json),cc:JSON.parse(thread.cc_json)};
    if(JSON.stringify(recipients)!==JSON.stringify(approved))throw Error('email_unapproved_recipients');
    const buttons=(await statement(env,'SELECT * FROM email_campaign_buttons WHERE campaign_id=? AND cancelled=0',c.id).all()).results;
    if(input.notificationOnly!==undefined&&typeof input.notificationOnly!=='boolean')throw Error('email_invalid_record');
    if(!Array.isArray(input.records)||(!input.notificationOnly&&input.records.length!==buttons.length)||!buttons.length)throw Error('email_incomplete_records');
    const seen=new Set(),records=(input.notificationOnly===true?[]:input.records).map(r=>{
      if(seen.has(r.buttonId)||!buttons.some(b=>b.button_id===r.buttonId)||typeof r.brand!=='string'||r.brand.length>8000||String(r.detail||'').length>8000)throw Error('email_invalid_record');
      const saved={buttonId:r.buttonId,brand:r.brand.trim(),detail:String(r.detail||'')};
      // Keep business/accounting data, without exposing it through the public mail template.
      for(const key of ['billingEntity','paymentType','soNo','quota','priceIncVat','paymentCondition','remark','periodText','cmposName','buttonName','promoType']){
        if(r[key]!==undefined){if(typeof r[key]!=='string'||r[key].length>8000)throw Error('email_invalid_record');saved[key]=r[key];}
      }
      seen.add(r.buttonId);return saved;
    }).sort((a,b)=>a.buttonId.localeCompare(b.buttonId));
    const attachmentData=await api.readEmailAttachments(current.block.m[c.month],env);
    const message=additionalMessage(input);
    const contentHash=await api.hash(JSON.stringify({...(input.notificationOnly===true?{notificationOnly:true}:{}),...(message?{additionalMessage:message}:{}),source:c.source_hash,thread:thread.id,version:thread.version,recipients,records,...(attachmentData.manifest.length?{attachments:attachmentData.manifest}:{})}));
    return {c,thread,recipients,records,contentHash,message,attachmentData,sourceVersion:current.row.updated_at,current};
  }
  api.previewCoPromo=async function(actor,input,env){const d=await draft(actor,input,env),details=api.coProDetails(JSON.parse(d.c.source_json),d.records);return {previewHash:d.contentHash,attachments:d.attachmentData.manifest,details,text:api.renderCoProEmail({milestone:'submitted',notificationOnly:input.notificationOnly===true,details,attachments:d.attachmentData.manifest,additionalMessage:d.message}).text,recipients:d.recipients,subject:d.thread.subject};};
  function snapshot(c,t,recipients,milestone,rows,records,attachments,message,actor){return {...(actor?.staffId?{requestedBy:{staffId:actor.staffId,staffVersion:actor.staffVersion,staffName:actor.staffName}}:{}),...(message?{additionalMessage:message}:{}),attachments,deliveryMode:api.emailThreadMode(t),newMessage:t.message_id.startsWith('new:'),threadId:t.thread_id,rfcMessageId:t.rfc_message_id,references:JSON.parse(t.references_json),subject:t.subject,recipients,milestone,details:api.coProDetails(rows,records)};}
  function queued(env,c,bindingVersion,milestone,snap,conditional='1',args=[]){
    const now=Date.now();return statement(env,"INSERT OR IGNORE INTO email_outbox(id,event_key,campaign_id,binding_version,snapshot_json,status,created_at,updated_at) SELECT ?,?,?,?,?,'queued',?,? WHERE "+conditional,crypto.randomUUID(),c.id+':'+c.month+':'+milestone,c.id,bindingVersion,JSON.stringify(snap),now,now,...args);
  }
  async function revisionDraft(actor,input,env){
    await api.requireEmailPermission(actor,'submit',env);
    if(typeof input.editId!=='string'||!input.editId.startsWith('edit-'))throw Error('email_source_changed');
    const c=await statement(env,"SELECT c.* FROM email_campaigns c JOIN email_bindings b ON b.campaign_id=c.id WHERE c.campaign_key=? AND c.month=? AND c.owner_tenant=? AND c.owner_oid=? AND c.status='active' ORDER BY b.confirmed_at DESC LIMIT 1",input.campaignKey,input.month,actor.tenantId,actor.objectId).first();
    if(!c)throw Error('email_revision_loop_missing');
    const row=await statement(env,'SELECT v,updated_at FROM promo_store WHERE k=?',c.campaign_key).first();
    if(!row)throw Error('email_source_changed');
    const block=JSON.parse(row.v),raw=block.m?.[c.month];
    if(!raw?.length||raw.some(r=>r.editId!==input.editId||r.changeStatus==='CANCELLED'))throw Error('email_source_changed');
    const receipt=await statement(env,'SELECT response_json FROM promo_submission_receipts WHERE submission_id=?',input.editId).first();
    const saved=receipt&&JSON.parse(receipt.response_json);
    if(saved?.kind!=='CAMPAIGN_EDIT'||!saved.versions?.[c.campaign_key])throw Error('email_source_changed');
    const binding=await statement(env,'SELECT * FROM email_bindings WHERE campaign_id=?',c.id).first();
    const thread=await statement(env,'SELECT * FROM email_threads WHERE id=? AND enabled=1',binding.thread_id).first();
    if(!thread||thread.version!==binding.policy_version||!api.threadAudience(thread,actor))throw Error('email_policy_changed');
    const rows=api.coProSource(block,c.month),files=await api.readEmailAttachments(raw,env),sourceHash=await api.hash(JSON.stringify(rows));
    const snap=snapshot(c,thread,JSON.parse(binding.recipients_json),'promotion_edited',rows,[],files.manifest,additionalMessage(input),actor);
    snap.revision={editId:input.editId,sourceHash};
    const hash=await api.hash(JSON.stringify({snapshot:snap,bindingVersion:binding.version}));
    return {c,row,thread,binding,files,snap,hash};
  }
  api.previewPromotionRevision=async function(actor,input,env){
    const d=await revisionDraft(actor,input,env);
    return {previewHash:d.hash,subject:d.snap.subject,recipients:d.snap.recipients,attachments:d.files.manifest,text:api.renderCoProEmail(d.snap).text};
  };
  api.commitPromotionRevision=async function(actor,input,env){
    const d=await revisionDraft(actor,input,env);
    if(input.confirmed!==true||input.previewHash!==d.hash)throw Error('email_confirmation_required');
    const eventKey=d.c.id+':'+d.c.month+':revision:'+input.editId;
    const old=await statement(env,'SELECT snapshot_json,status FROM email_outbox WHERE event_key=?',eventKey).first();
    if(old){if(old.snapshot_json!==JSON.stringify(d.snap))throw Error('email_version_conflict');return {saved:true,mailStatus:old.status};}
    const statements=authorizationGuard(env,actor,'submit',d.c,d.thread,d.row.updated_at);
    statements.push(statement(env,'INSERT INTO promo_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM email_bindings WHERE campaign_id=? AND version=? AND thread_id=?) THEN 1 ELSE 0 END',d.c.id,d.binding.version,d.thread.id),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1'));
    if(d.files.version!==null)statements.push(...fileGuard(env,d.files.version));
    statements.push(statement(env,"INSERT OR IGNORE INTO email_outbox(id,event_key,campaign_id,binding_version,snapshot_json,status,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?)",crypto.randomUUID(),eventKey,d.c.id,d.binding.version,JSON.stringify(d.snap),Date.now(),Date.now()));
    await env.DB.batch(statements);return {saved:true,mailStatus:'queued'};
  };
  // Read-only projection for the shared promotion history. No mailbox contents,
  // recipients, policies, credentials, or send capabilities are exposed.
  api.sharedMailHistory=async function(env){
    const rows=(await env.DB.prepare("SELECT c.campaign_key,c.month,o.event_key,o.status,CASE WHEN o.provider_id IS NOT NULL AND o.provider_id<>'' THEN 1 ELSE 0 END AS confirmed,o.sanitized_error,o.updated_at FROM email_campaigns c LEFT JOIN email_outbox o ON o.campaign_id=c.id WHERE o.id IS NOT NULL ORDER BY o.created_at DESC").all()).results;
    const items=rows.map(r=>({campaign:decodeURIComponent(r.campaign_key.slice(10)),month:r.month,eventKey:r.event_key||'',kind:r.event_key?.includes(':revision:')?'promotion_edited':r.event_key?.endsWith(':it_interface_complete')?'it_interface_complete':'submitted',status:r.status==='accepted'&&!r.confirmed?'needs_verification':r.status||'unselected',error:r.sanitized_error||'',at:r.updated_at||null}));
    const stages=(await env.DB.prepare("SELECT c.campaign_key,c.month,COUNT(b.button_id) AS total,SUM(CASE WHEN r.interface_done=1 THEN 1 ELSE 0 END) AS done FROM email_campaigns c LEFT JOIN email_campaign_buttons b ON b.campaign_id=c.id AND b.cancelled=0 LEFT JOIN email_copro_records r ON r.campaign_id=b.campaign_id AND r.button_id=b.button_id GROUP BY c.id").all()).results;
    for(const r of stages){
      const campaign=decodeURIComponent(r.campaign_key.slice(10)),interfaceStatus=r.total>0&&r.done===r.total?'interface_done':'waiting';
      if(!items.some(i=>i.campaign===campaign&&i.month===r.month))continue;
      const existing=items.filter(i=>i.campaign===campaign&&i.month===r.month&&i.kind==='it_interface_complete');
      if(existing.length)existing.forEach(i=>i.interfaceStatus=interfaceStatus);
      else items.push({campaign,month:r.month,kind:'it_interface_complete',status:interfaceStatus,interfaceStatus,at:null});
    }
    // Include explicit CoPromo intake drafts before mail is queued, not imported accounting records.
    const stored=await env.DB.prepare("SELECT v FROM promo_store WHERE k='pc_co_promotions'").first();
    const legacy=stored?JSON.parse(stored.v):[],groups=new Map();
    for(const r of legacy){if(!r.campaign||r.emailIntake!==true)continue;if(!groups.has(r.campaign))groups.set(r.campaign,[]);groups.get(r.campaign).push(r);}
    for(const [campaign,records] of groups){if(items.some(i=>i.campaign===campaign))continue;
      const at=records.map(r=>r.updatedAt||r.createdAt).filter(Boolean).sort().pop()||null;
      items.push({campaign,kind:'submitted',status:'not_recorded',at});
      const done=records.every(r=>r.status==='INTERFACED'&&Number(r.interfaceSetup)===1);
      items.push({campaign,kind:'it_interface_complete',status:done?'interface_done':'waiting',interfaceStatus:done?'interface_done':'waiting',at:null});
    }
    return {items};
  };
  api.mailHistory=async function(actor,env){
    await api.requireEmailPermission(actor,'submit',env);
    const rows=(await statement(env,"SELECT c.campaign_key,c.month,c.source_json,o.event_key,o.status,o.sanitized_error,o.created_at,o.updated_at FROM email_campaigns c LEFT JOIN email_outbox o ON o.campaign_id=c.id WHERE c.owner_tenant=? AND c.owner_oid=? ORDER BY o.created_at DESC",actor.tenantId,actor.objectId).all()).results;
    return {items:rows.map(r=>{const source=JSON.parse(r.source_json),first=source[0]||{};return {campaign:first.campaign||decodeURIComponent(r.campaign_key.slice(10)),month:r.month,submitter:first.submittedBy||first.reporter||'',eventKey:r.event_key||'',kind:r.event_key?.includes(':revision:')?'promotion_edited':r.event_key?.endsWith(':it_interface_complete')?'it_interface_complete':'submitted',status:r.status||'unselected',error:r.sanitized_error||'',at:r.updated_at||null};})};
  };
  api.commitCoPromo=async function(actor,input,env){
    const d=await draft(actor,input,env),{c,thread,records,recipients,contentHash}=d;
    if(input.confirmed!==true||input.previewHash!==contentHash)throw Error('email_confirmation_required');
    const existing=await statement(env,'SELECT * FROM email_bindings WHERE campaign_id=?',c.id).first();
    if(existing){if(existing.content_hash!==contentHash)throw Error('email_revision_not_enabled');return {saved:true,mailStatus:'queued',campaignId:c.id,version:c.version};}
    if(input.expectedVersion!==c.version)throw Error('email_version_conflict');
    const statements=[...authorizationGuard(env,actor,'submit',c,thread,d.sourceVersion),statement(env,'UPDATE email_campaigns SET source_json=?,source_hash=?,version=version+1 WHERE id=? AND version=?',c.source_json,c.source_hash,c.id,c.version),...guard(env)];
    if(d.attachmentData.version!==null) statements.push(...fileGuard(env,d.attachmentData.version));
    statements.push(statement(env,'INSERT INTO email_bindings VALUES (?,?,?,?,?,?,?,1)',c.id,thread.id,thread.version,JSON.stringify(recipients),contentHash,api.emailActorKey(actor),Date.now()));
    for(const [buttonId,identity] of d.current.identities||[]){
      const rows=d.current.block.m[c.month].filter(r=>r.emailButtonId===buttonId);
      const done=rows.length>0&&rows.every(r=>/^(COMPLETE|DONE)$/.test(String(r.itStatus||'').toUpperCase())&&!r.revisionPending&&!r.changeStatus);
      statements.push(statement(env,'UPDATE email_campaign_buttons SET source_identity_json=?,it_done=?,it_by=?,it_at=? WHERE campaign_id=? AND button_id=?',identity,done?1:0,done?'cloud-before-binding':null,done?Date.now():null,c.id,buttonId),...guard(env));
    }
    for(const r of records)statements.push(statement(env,'INSERT INTO email_copro_records(id,campaign_id,button_id,record_json) VALUES (?,?,?,?)',crypto.randomUUID(),c.id,r.buttonId,JSON.stringify(r)));
    statements.push(queued(env,c,1,'submitted',{...snapshot(c,thread,recipients,'submitted',JSON.parse(c.source_json),records,d.attachmentData.manifest,d.message,actor),notificationOnly:input.notificationOnly===true}),audit(env,c.id,actor,'submitted'));
    await env.DB.batch(statements);return {saved:true,mailStatus:'queued',campaignId:c.id,version:c.version+1};
  };
  function fileGuard(env,version){return [statement(env,"INSERT INTO promo_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM promo_store WHERE k='pc_promo_files' AND updated_at=?) THEN 1 ELSE 0 END",version),env.DB.prepare('DELETE FROM promo_commit_guard WHERE id=1')];}
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
    const announcement=await statement(env,"SELECT snapshot_json FROM email_outbox WHERE event_key=?",c.id+':'+c.month+':submitted').first();
    const approvedFiles=announcement?JSON.parse(announcement.snapshot_json).attachments:undefined;
    const attachmentData=approvedFiles===undefined?{manifest:undefined,version:null}:await api.readEmailAttachments(s.block.m[c.month],env,approvedFiles);
    if(attachmentData.version!==null)statements.push(...fileGuard(env,attachmentData.version));
    const predicate='EXISTS(SELECT 1 FROM email_campaign_buttons WHERE campaign_id=? AND cancelled=0) AND NOT EXISTS(SELECT 1 FROM email_campaign_buttons b LEFT JOIN email_copro_records r ON r.campaign_id=b.campaign_id AND r.button_id=b.button_id WHERE b.campaign_id=? AND b.cancelled=0 AND (b.it_done=0 OR COALESCE(r.interface_done,0)=0))';
    statements.push(queued(env,c,binding.version,'it_interface_complete',snapshot(c,thread,JSON.parse(binding.recipients_json),'it_interface_complete',JSON.parse(c.source_json),records,attachmentData.manifest,undefined,actor),predicate,[c.id,c.id]),audit(env,c.id,actor,kind));
    await env.DB.batch(statements);return {saved:true,mailStatus:await mailState(c,env),campaignId:c.id};
  }
  async function mailState(c,env){const event=await statement(env,'SELECT status FROM email_outbox WHERE event_key=?',c.id+':'+c.month+':it_interface_complete').first();return event?.status||'waiting_for_both';}
  api.commitIT=(actor,input,env)=>complete(actor,input,env,'it');
  api.commitInterface=(actor,input,env)=>complete(actor,input,env,'interface');
  api.coProStatus=async function(actor,id,env){
    if(actor.staffId){try{await api.requireEmailPermission(actor,'submit',env);}catch(_){await api.requireEmailPermission(actor,'it',env);}}
    const c=await campaign(id,env);if(!owner(c,actor))await api.requireEmailPermission(actor,'it',env);
    const buttons=(await statement(env,'SELECT b.button_id,b.source_identity_json,b.it_done,b.version,r.id record_id,r.interface_done,r.version interface_version FROM email_campaign_buttons b LEFT JOIN email_copro_records r ON r.campaign_id=b.campaign_id AND r.button_id=b.button_id WHERE b.campaign_id=?',id).all()).results;
    const current=await source(c,env,true);
    if(current.draft)for(const b of buttons)b.source_identity_json=current.identities.get(b.button_id);
    const history=(await statement(env,'SELECT event_key,status,provider_id,sanitized_error,created_at,updated_at FROM email_outbox WHERE campaign_id=? ORDER BY created_at',id).all()).results;
    return {id:c.id,key:c.campaign_key,month:c.month,version:c.version,buttons,history,sourceRows:current.rows};
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
