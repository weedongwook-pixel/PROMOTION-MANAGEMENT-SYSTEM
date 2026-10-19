(function(root){
  'use strict';
  const api=root.PC_Email;
  const base='https://gmail.googleapis.com/gmail/v1/users/me/';
  api.gmailAccess=async function(env,deps={}){
    const c=api.readEmailConfig(env),connection=await env.DB.prepare("SELECT * FROM email_connections WHERE id=1 AND status='connected'").first();
    if(!connection||connection.sender!==c.sender)throw Error('email_reconnect_required');
    const secret=await api.decryptSecret(connection.refresh_cipher,c.encryptionKey,'gmail:'+c.sender);
    const tokens=await api.refreshAccessToken({refresh_token:secret},c,deps);
    await api.verifySender(tokens.access_token,c,deps);
    if(tokens.scope&&!c.scopes.every(scope=>tokens.scope.split(' ').includes(scope)))throw Error('email_missing_scopes');
    if(tokens.refresh_token!==secret){
      const cipher=await api.encryptSecret(tokens.refresh_token,c.encryptionKey,'gmail:'+c.sender);
      await env.DB.prepare("UPDATE email_connections SET refresh_cipher=? WHERE id=1 AND generation=? AND status='connected'").bind(cipher,connection.generation).run();
    }
    const current=await env.DB.prepare("SELECT generation FROM email_connections WHERE id=1 AND status='connected'").first();
    if(!current||current.generation!==connection.generation)throw Error('email_reconnect_required');
    return tokens.access_token;
  };
  api.gmailGet=async function(path,token,deps={}){
    if(!/^(messages(?:\?|\/)|threads(?:\?|\/))/.test(path))throw Error('email_invalid_provider_path');
    try{
      const r=await(deps.fetch||fetch)(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!r.ok)throw Error();return await r.json();
    }catch(_){throw Error('email_provider_error');}
  };
  api.gmailMessage=async function(messageId,token,deps={}){
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(messageId||''))throw Error('email_invalid_message');
    const params=new URLSearchParams({format:'metadata'});
    for(const name of ['Subject','Message-ID','References','To','Cc','From','Date'])params.append('metadataHeaders',name);
    const m=await api.gmailGet('messages/'+encodeURIComponent(messageId)+'?'+params,token,deps);
    const headers={};for(const h of m.payload?.headers||[])headers[String(h.name).toLowerCase()]=h.value;
    return {messageId:m.id,threadId:m.threadId,headers};
  };
  api.buildReply=function(snapshot){
    const recipients=api.emailRecipients(snapshot.recipients),subject=api.emailHeader(snapshot.subject),original=api.emailHeader(snapshot.rfcMessageId);
    const reference=x=>{api.emailHeader(x);if(!/^<[^\s<>]+@[^\s<>]+>$/.test(x))throw Error('email_invalid_reference');return x;};
    reference(original);
    const refs=[...new Set([...(snapshot.references||[]).map(reference),original])];
    if(refs.join(' ').length>900)throw Error('email_invalid_reference');
    const utf8=value=>{const bytes=new TextEncoder().encode(value);let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);};
    const content=api.renderCoProEmail(snapshot),boundary='pc_'+crypto.randomUUID().replace(/-/g,'');
    const headers=['From: it@rocks-foods.com','To: '+recipients.to.join(', '),...(recipients.cc.length?['Cc: '+recipients.cc.join(', ')]:[]),
      'Subject: =?UTF-8?B?'+utf8(subject)+'?=','In-Reply-To: '+original,'References: '+refs.join(' '),'MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"'];
    const part=(type,body)=>'--'+boundary+'\r\nContent-Type: '+type+'; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+body+'\r\n';
    const mime=headers.join('\r\n')+'\r\n\r\n'+part('text/plain',content.text)+part('text/html',content.html)+'--'+boundary+'--\r\n';
    return {raw:utf8(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),threadId:api.emailHeader(snapshot.threadId)};
  };
  api.sendReply=async function(token,snapshot,deps={}){
    const payload=api.buildReply(snapshot);
    try{
      const r=await(deps.fetch||fetch)(base+'messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'error'});
      if(r.ok){const data=await r.json();return typeof data.id==='string'?{outcome:'accepted',providerId:data.id}:{outcome:'ambiguous'};}
      if(r.status>=500)return {outcome:'ambiguous'};
      return {outcome:'rejected',retryable:r.status===429};
    }catch(_){return {outcome:'ambiguous'};}
  };
})(globalThis);
