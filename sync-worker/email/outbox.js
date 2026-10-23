(function(root){
  'use strict';const api=root.PC_Email;
  const statement=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
  api.dispatchEmail=async function(env,deps={}){
    const counts={accepted:0,failed:0,held:0};
    if(env.EMAIL_CONNECTION_ENABLED!=='true'||env.EMAIL_COPRO_ENABLED!=='true'||(env.EMAIL_TEST_SEND_ENABLED!=='true'&&env.EMAIL_SEND_ENABLED!=='true'))return counts;
    const now=Date.now();
    await statement(env,"UPDATE email_outbox SET status='needs_verification',sanitized_error='lease_expired',updated_at=? WHERE status='sending' AND lease_until<=?",now,now).run();
    for(let index=0;index<5;index++){
      const lease=crypto.randomUUID();
      const event=await statement(env,"UPDATE email_outbox SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=(SELECT o.id FROM email_outbox o WHERE o.status IN ('queued','retry') AND o.next_attempt_at<=? AND EXISTS(SELECT 1 FROM email_bindings b JOIN email_threads t ON t.id=b.thread_id WHERE b.campaign_id=o.campaign_id AND ((t.delivery_mode='test' AND ?=1) OR (t.delivery_mode='production' AND ?=1))) AND (o.event_key LIKE '%:submitted' OR o.event_key LIKE '%:revision:%' OR EXISTS(SELECT 1 FROM email_outbox prior WHERE prior.campaign_id=o.campaign_id AND prior.event_key LIKE '%:submitted' AND prior.status='accepted')) ORDER BY o.created_at,o.event_key DESC LIMIT 1) AND status IN ('queued','retry') RETURNING *",lease,now+120000,now,now,env.EMAIL_TEST_SEND_ENABLED==='true'?1:0,env.EMAIL_SEND_ENABLED==='true'?1:0).first();
      if(!event)break;
      const update=(status,error=null,provider=null,next=0)=>statement(env,"UPDATE email_outbox SET status=?,sanitized_error=?,provider_id=?,next_attempt_at=?,updated_at=? WHERE id=? AND lease_token=? AND status='sending'",status,error,provider,next,Date.now(),event.id,lease).run();
      let snapshot,connection;
      const validate=async()=>{
        const c=await statement(env,"SELECT * FROM email_campaigns WHERE id=? AND status='active'",event.campaign_id).first();
        if(!c)throw Error();
        await api.requireEmailPermission({tenantId:c.owner_tenant,objectId:c.owner_oid},'submit',env);
        snapshot=JSON.parse(event.snapshot_json);
        let source;
        if(snapshot.milestone==='promotion_edited'){
          if(!snapshot.revision||event.event_key!==c.id+':'+c.month+':revision:'+snapshot.revision.editId)throw Error();
          const row=await statement(env,'SELECT v FROM promo_store WHERE k=?',c.campaign_key).first();
          if(!row)throw Error();const block=JSON.parse(row.v),raw=block.m?.[c.month];
          if(!raw?.length||raw.some(r=>r.editId!==snapshot.revision.editId||r.changeStatus==='CANCELLED')||await api.hash(JSON.stringify(api.coProSource(block,c.month)))!==snapshot.revision.sourceHash)throw Error();
          source={block};
        }else source=await api.checkCoProSource(c,env);
        const b=await statement(env,'SELECT * FROM email_bindings WHERE campaign_id=?',c.id).first();
        const t=b&&await statement(env,'SELECT * FROM email_threads WHERE id=? AND enabled=1',b.thread_id).first();
        if(!b||b.version!==event.binding_version||!t||!['test','production'].includes(api.emailThreadMode(t))||t.version!==b.policy_version)throw Error();
        if(!api.threadAudience(t,{tenantId:c.owner_tenant,objectId:c.owner_oid}))throw Error();
        snapshot=JSON.parse(event.snapshot_json);
        if(snapshot.attachments!==undefined){const attachments=await api.readEmailAttachments(source.block.m[c.month],env,snapshot.attachments);snapshot.attachments=attachments.files;}
        const mode=api.emailThreadMode(t);
        if((snapshot.deliveryMode||'test')!==mode||(mode==='production'?env.EMAIL_SEND_ENABLED:env.EMAIL_TEST_SEND_ENABLED)!=='true')throw Error();
        if(Boolean(snapshot.newMessage)!==t.message_id.startsWith('new:'))throw Error();
        if(snapshot.threadId!==t.thread_id||snapshot.rfcMessageId!==t.rfc_message_id||snapshot.subject!==t.subject||JSON.stringify(snapshot.references)!==t.references_json||JSON.stringify(api.emailRecipients(snapshot.recipients))!==b.recipients_json||JSON.stringify({to:JSON.parse(t.to_json),cc:JSON.parse(t.cc_json)})!==b.recipients_json)throw Error();
        if(snapshot.milestone==='it_interface_complete'){
          const pending=await statement(env,'SELECT COUNT(*) n FROM email_campaign_buttons b LEFT JOIN email_copro_records r ON b.campaign_id=r.campaign_id AND b.button_id=r.button_id WHERE b.campaign_id=? AND b.cancelled=0 AND (b.it_done=0 OR COALESCE(r.interface_done,0)=0)',c.id).first();
          const active=await statement(env,'SELECT COUNT(*) n FROM email_campaign_buttons WHERE campaign_id=? AND cancelled=0',c.id).first();
          if(pending.n||!active.n)throw Error();
        }
        const current=await statement(env,"SELECT generation FROM email_connections WHERE id=1 AND status='connected'").first();
        if(!current||connection&&connection.generation!==current.generation)throw Error();connection=current;
        const held=await statement(env,"SELECT id FROM email_outbox WHERE id=? AND status='sending' AND lease_token=? AND lease_until>?",event.id,lease,Date.now()).first();if(!held)throw Error();
        return t;
      };
      let thread;
      try{thread=await validate();}catch(_){await update('held','approval_or_source_changed');counts.held++;continue;}
      let token;
      try{
        token=await api.gmailAccess(env,deps);
        const current=await statement(env,"SELECT generation FROM email_connections WHERE id=1 AND status='connected'").first();
        if(!current||current.generation!==connection.generation)throw Error();
      }catch(_){await update('held','connection_unavailable');counts.held++;continue;}
      try{
        if(!thread.message_id.startsWith('new:')){
        const original=await api.gmailMessage(thread.message_id,token,deps);
        if(original.messageId!==thread.message_id||original.threadId!==thread.thread_id||original.headers['message-id']!==thread.rfc_message_id||original.headers.subject!==thread.subject||String(original.headers.references||'').trim().split(/\s+/).filter(Boolean).join(' ')!==JSON.parse(thread.references_json).join(' '))throw Error();
        }else if(!snapshot.newMessage||thread.thread_id||thread.rfc_message_id)throw Error();
        // Refresh and Gmail reads may take seconds. Honour changes made during either wait.
        await validate();
      }catch(_){await update('held','approval_or_target_changed');counts.held++;continue;}
      let outcome;
      try{outcome=await api.sendReply(token,snapshot,deps);}catch(_){outcome={outcome:'ambiguous'};}
      try{
        if(outcome.outcome==='accepted'){
          await update('accepted',null,outcome.providerId);counts.accepted++;
        }else if(outcome.outcome==='rejected'){
          const delays=[60000,300000,900000];
          if(outcome.retryable&&event.attempts<=3)await update('retry','provider_rate_limited',null,Date.now()+delays[event.attempts-1]);
          else{await update('failed','provider_rejected');counts.failed++;}
        }else{await update('needs_verification','provider_outcome_unknown');counts.held++;}
      }catch(_){
        // The provider may have accepted. Never return this work to the queue.
        try{await update('needs_verification','acknowledgement_not_saved');}catch(_ignored){}
        counts.held++;
      }
    }
    return counts;
  };
})(globalThis);
