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
      const r=await(deps.fetch||fetch)(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'manual'});
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
    const recipients=api.emailRecipients(snapshot.recipients),subject=api.emailHeader(snapshot.subject),original=snapshot.newMessage?'':api.emailHeader(snapshot.rfcMessageId);
    const reference=x=>{api.emailHeader(x);if(!/^<[^\s<>]+@[^\s<>]+>$/.test(x))throw Error('email_invalid_reference');return x;};
    if(!snapshot.newMessage)reference(original);
    const refs=[...new Set([...(snapshot.references||[]).map(reference),original])];
    if(refs.join(' ').length>900)throw Error('email_invalid_reference');
    const utf8=value=>{const bytes=new TextEncoder().encode(value);let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);};
    const content=api.renderCoProEmail(snapshot),boundary='pc_'+crypto.randomUUID().replace(/-/g,'');
    const headers=['From: Potato Promotion Mail <it@rocks-foods.com>','To: '+recipients.to.join(', '),...(recipients.cc.length?['Cc: '+recipients.cc.join(', ')]:[]),
      'Subject: =?UTF-8?B?'+utf8(subject)+'?=',...(snapshot.newMessage?[]:['In-Reply-To: '+original,'References: '+refs.join(' ')]),'MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"'];
    const part=(type,body)=>'--'+boundary+'\r\nContent-Type: '+type+'; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+body+'\r\n';
    let mime=headers.join('\r\n')+'\r\n\r\n'+part('text/plain',content.text)+part('text/html',content.html)+'--'+boundary+'--\r\n';
    if(snapshot.attachments?.length){
      const mixed='pc_files_'+crypto.randomUUID().replace(/-/g,'');
      const body=mime.slice(mime.indexOf('\r\n\r\n')+4);
      const mainHeaders=headers.slice(0,-1).concat('Content-Type: multipart/mixed; boundary="'+mixed+'"');
      mime=mainHeaders.join('\r\n')+'\r\n\r\n--'+mixed+'\r\nContent-Type: multipart/alternative; boundary="'+boundary+'"\r\n\r\n'+body;
      for(const f of snapshot.attachments){
        if(!f.name||/[\r\n\0]/.test(f.name)||! /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(f.mime)||!f.base64||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64))throw Error('email_attachment_invalid');
        const encoded=encodeURIComponent(f.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
        const segments=[''];for(const token of encoded.match(/%[A-F0-9]{2}|./g)||[]){if(segments[segments.length-1].length+token.length>60)segments.push('');segments[segments.length-1]+=token;}
        const filename=segments.length===1?"filename*=UTF-8''"+encoded:segments.map((part,i)=>'filename*'+i+'*='+(i===0?"UTF-8''":'')+part).join(';\r\n ');
        mime+='--'+mixed+'\r\nContent-Type: '+f.mime+'\r\nContent-Disposition: attachment;\r\n '+filename+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+f.base64.match(/.{1,76}/g).join('\r\n')+'\r\n';
      }
      mime+='--'+mixed+'--\r\n';
    }
    return {raw:utf8(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),...(snapshot.newMessage?{}:{threadId:api.emailHeader(snapshot.threadId)})};
  };
  api.sendReply=async function(token,snapshot,deps={}){
    const payload=api.buildReply(snapshot);
    try{
      const r=await(deps.fetch||fetch)(base+'messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),redirect:'manual'});
      if(r.ok){const data=await r.json();return typeof data.id==='string'?{outcome:'accepted',providerId:data.id}:{outcome:'ambiguous'};}
      if(r.status>=500)return {outcome:'ambiguous'};
      return {outcome:'rejected',retryable:r.status===429};
    }catch(_){return {outcome:'ambiguous'};}
  };
})(globalThis);
