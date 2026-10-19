(function(root){
  'use strict';const api=root.PC_Email;
  const TEST_SUBJECT='Test send to email copro UOB';
  api.emailThreadMode=r=>r.delivery_mode||r.mode;
  api.emailActorKey=actor=>actor.tenantId+':'+actor.objectId;
  api.threadAudience=function(record,actor){return JSON.parse(record.audience_json).some(x=>x.tenantId===actor.tenantId&&x.objectId===actor.objectId);};
  function summary(r){return {id:r.id,version:r.version,subject:r.subject,recipients:{to:JSON.parse(r.to_json),cc:JSON.parse(r.cc_json)},mode:api.emailThreadMode(r)};}
  api.searchThreads=async function(actor,query,env,deps={},pageToken='',mode='test'){
    await api.requireEmailPermission(actor,'manage',env);
    if(!['test','production'].includes(mode)||typeof query!=='string'||query.length>200||(mode==='production'&&!query.trim()))throw Error('email_invalid_query');
    const token=await api.gmailAccess(env,deps),params=new URLSearchParams({q:mode==='test'?'subject:"'+TEST_SUBJECT+'" '+query:query,maxResults:'20'});
    if(pageToken){if(typeof pageToken!=='string'||pageToken.length>2048)throw Error('email_invalid_query');params.set('pageToken',pageToken);}
    const result=await api.gmailGet('messages?'+params,token,deps),items=[];
    for(const hit of(result.messages||[]).slice(0,20)){
      const m=await api.gmailMessage(hit.id,token,deps);if(!m.headers.subject||(mode==='test'&&m.headers.subject!==TEST_SUBJECT))continue;
      items.push({messageId:m.messageId,subject:m.headers.subject,from:m.headers.from||'',date:m.headers.date||'',to:m.headers.to||'',cc:m.headers.cc||''});
    }
    return {items,nextPageToken:result.nextPageToken||null};
  };
  api.publishThread=async function(actor,input,env,deps={}){
    await api.requireEmailPermission(actor,'manage',env);
    const mode=input.mode||'test';if(!['test','production'].includes(mode))throw Error('email_invalid_mode');
    const token=await api.gmailAccess(env,deps),message=await api.gmailMessage(input.messageId,token,deps),h=message.headers;
    if(!h.subject||/[\r\n]/.test(h.subject)||(mode==='test'&&h.subject!==TEST_SUBJECT)||!/^<[^\s<>]+@[^\s<>]+>$/.test(h['message-id']||''))throw Error('email_invalid_test_thread');
    const recipients=api.emailRecipients(input.recipients);
    const members=new Set(([h.to,h.cc,h.from].filter(Boolean).join(',').match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/ig)||[]).map(x=>x.toLowerCase()));
    if(!members.has('it@rocks-foods.com')||[...recipients.to,...recipients.cc].some(x=>!members.has(x)))throw Error('email_unapproved_recipients');
    if(!Array.isArray(input.audience)||!input.audience.length||input.audience.length>50||input.audience.some(x=>!/^[-a-f0-9]{36}$/i.test(x.tenantId||'')||!/^[-a-f0-9]{36}$/i.test(x.objectId||'')))throw Error('email_invalid_audience');
    const refs=(h.references||'').match(/<[^\s<>]+@[^\s<>]+>/g)||[];
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO email_threads(id,thread_id,message_id,rfc_message_id,references_json,subject,to_json,cc_json,audience_json,version,mode,enabled,published_by,updated_at,delivery_mode) VALUES (?,?,?,?,?,?,?,?,?,1,\'test\',1,?,?,?)').bind(id,message.threadId,message.messageId,h['message-id'],JSON.stringify(refs),h.subject,JSON.stringify(recipients.to),JSON.stringify(recipients.cc),JSON.stringify(input.audience),api.emailActorKey(actor),Date.now(),mode).run();
    const row=await env.DB.prepare('SELECT * FROM email_threads WHERE id=?').bind(id).first();return summary(row);
  };
  api.listApprovedThreads=async function(actor,env){
    const rows=await env.DB.prepare('SELECT * FROM email_threads WHERE enabled=1').all();
    return rows.results.filter(r=>api.threadAudience(r,actor)).map(summary);
  };
  api.revokeThread=async function(actor,id,env){
    await api.requireEmailPermission(actor,'manage',env);
    await env.DB.prepare('UPDATE email_threads SET enabled=0,version=version+1,updated_at=? WHERE id=?').bind(Date.now(),id).run();
    return {revoked:true};
  };
})(globalThis);
