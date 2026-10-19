(function(root){
  'use strict';
  const api=root.PC_Email;
  const SESSION='__Host-pc_gmail_owner',BROWSER='__Host-pc_gmail_consent';
  // Separate identity namespace: never accept browser names/roles or Microsoft tokens here.
  const OWNER=Object.freeze({tenantId:'00000000-0000-4000-8000-000000000001',objectId:'00000000-0000-4000-8000-000000000002'});
  api.isGmailOwner=actor=>actor?.tenantId===OWNER.tenantId&&actor?.objectId===OWNER.objectId;
  const getCookie=(r,key)=>(r.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='))?.slice(key.length+1)||'';
  const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
  function denied(){throw Error('email_admin_required');}
  api.verifyOwnerSession=async function(request,env){
    const c=api.readEmailConfig(env),value=getCookie(request,SESSION);
    if(!c.enabled||!env.DB||!/^[\w-]{43}$/.test(value))denied();
    const row=await stmt(env,"SELECT s.csrf,s.expires_at FROM email_owner_sessions s JOIN email_connections c ON c.id=1 AND c.generation=s.generation AND c.status='connected' WHERE s.session_hash=? AND s.expires_at>?",await api.hash(value),Date.now()).first();
    if(!row)denied();
    if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==c.origin||request.headers.get('X-PC-Email-CSRF')!==row.csrf))denied();
    return {...OWNER,csrf:row.csrf,expiresAt:row.expires_at};
  };
  function callbackPage(c,ok,cookie){
    const nonce=api.random(),status=ok?'connected':'error';
    return new Response('<!doctype html><html lang="th"><meta charset="utf-8"><title>Gmail connection</title><h1>'+(ok?'เชื่อม Gmail แล้ว':'เชื่อมต่อไม่สำเร็จ กรุณาเลือกบัญชีผู้ส่งที่กำหนด')+'</h1><p>ปิดหน้านี้แล้วกลับไปที่ตั้งค่าอีเมล</p><script nonce="'+nonce+'">history.replaceState(null,"","/email/gmail/callback");if(window.opener)window.opener.postMessage({type:"pc-email-result",status:"'+status+'"},'+JSON.stringify(c.origin)+');</script>',{status:ok?200:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
  }
  api.routeGmailOwner=async function(request,env){
    const c=api.readEmailConfig(env),url=new URL(request.url),path=url.pathname,now=Date.now();
    const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
    if(path==='/email/auth/logout'&&request.method==='POST'){
      if(request.headers.get('Origin')!==c.origin)return json({error:'email_origin_denied'},403);
      const value=getCookie(request,SESSION);
      if(/^[\w-]{43}$/.test(value))await stmt(env,'DELETE FROM email_owner_sessions WHERE session_hash=?',await api.hash(value)).run();
      const browser=getCookie(request,BROWSER);
      if(/^[\w-]{43}$/.test(browser))await stmt(env,'DELETE FROM email_owner_attempts WHERE browser_hash=?',await api.hash(browser)).run();
      const response=json({loggedOut:true},200,{'Set-Cookie':SESSION+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'});
      response.headers.append('Set-Cookie',BROWSER+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');return response;
    }
    if(path==='/email/gmail/connect'&&request.method==='POST'){
      if(request.headers.get('Origin')!==c.origin)return json({error:'email_origin_denied'},403);
      const requester=await api.hash(request.headers.get('CF-Connecting-IP')||'unknown');
      await stmt(env,'DELETE FROM email_owner_attempts WHERE expires_at<?',now).run();
      const recent=await stmt(env,'SELECT count(*) n FROM email_owner_attempts WHERE requester_hash=? AND created_at>?',requester,now-300000).first();
      const total=await env.DB.prepare('SELECT count(*) n FROM email_owner_attempts').first();
      if(recent.n>=5||total.n>=1000)return json({error:'email_try_later'},429);
      const state=api.random(),browser=api.random(),verifier=api.random(),stateHash=await api.hash(state);
      await stmt(env,"INSERT OR IGNORE INTO email_connections(id,status,updated_at,generation) VALUES(1,'not_connected',?,0)",new Date().toISOString()).run();
      await stmt(env,'INSERT INTO email_owner_attempts(state_hash,browser_hash,verifier_cipher,expires_at,generation,requester_hash,created_at) SELECT ?,?,?,?,generation,?,? FROM email_connections WHERE id=1',stateHash,await api.hash(browser),await api.encryptSecret(verifier,c.encryptionKey,'owner-pkce:'+stateHash),now+600000,requester,now).run();
      const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:c.scopes.join(' '),state,access_type:'offline',prompt:'consent select_account',code_challenge:await api.hash(verifier),code_challenge_method:'S256',login_hint:c.sender}).toString();
      return json({authorizationUrl:auth.href},200,{'Set-Cookie':BROWSER+'='+browser+'; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax'});
    }
    if(path==='/email/gmail/callback'&&request.method==='GET'){
      try{
        const state=url.searchParams.get('state')||'',browser=getCookie(request,BROWSER),code=url.searchParams.get('code');
        if(!/^[\w-]{43}$/.test(state)||!/^[\w-]{43}$/.test(browser)||!code||code.length>4096||url.searchParams.has('error'))throw Error();
        const hash=await api.hash(state),attempt=await stmt(env,'UPDATE email_owner_attempts SET consumed_at=? WHERE state_hash=? AND browser_hash=? AND consumed_at IS NULL AND expires_at>? AND generation=(SELECT generation FROM email_connections WHERE id=1) RETURNING *',now,hash,await api.hash(browser),now).first();
        if(!attempt)throw Error();
        const verifier=await api.decryptSecret(attempt.verifier_cipher,c.encryptionKey,'owner-pkce:'+hash);
        const tokens=await api.exchangeCode(code,verifier,c),sender=await api.verifySender(tokens.access_token,c);
        if(sender!==c.sender)throw Error();
        const cipher=await api.encryptSecret(tokens.refresh_token,c.encryptionKey,'gmail:'+sender),session=api.random(),csrf=api.random(),at=new Date().toISOString();
        await env.DB.batch([
          stmt(env,"UPDATE email_connections SET sender=?,status='connected',refresh_cipher=?,granted_scopes=?,connected_at=?,updated_at=?,generation=generation+1 WHERE id=1 AND generation=? AND EXISTS(SELECT 1 FROM email_owner_attempts WHERE state_hash=? AND browser_hash=? AND consumed_at IS NOT NULL AND expires_at>?)",sender,cipher,tokens.scope,at,at,attempt.generation,hash,attempt.browser_hash,Date.now()),
          env.DB.prepare('INSERT INTO email_owner_commit_guard(id) SELECT CASE WHEN changes()=1 THEN 1 ELSE 0 END'),env.DB.prepare('DELETE FROM email_owner_commit_guard'),
          stmt(env,'INSERT INTO email_admin_grants(tenant_id,object_id,enabled,created_at) VALUES(?,?,1,?) ON CONFLICT(tenant_id,object_id) DO UPDATE SET enabled=1',OWNER.tenantId,OWNER.objectId,at),
          ...['manage','submit','it'].map(p=>stmt(env,'INSERT INTO email_actor_permissions(tenant_id,object_id,permission,enabled) VALUES(?,?,?,1) ON CONFLICT(tenant_id,object_id,permission) DO UPDATE SET enabled=1',OWNER.tenantId,OWNER.objectId,p)),
          env.DB.prepare('DELETE FROM email_owner_sessions'),
          stmt(env,'INSERT INTO email_owner_sessions(session_hash,csrf,generation,expires_at) VALUES(?,?,?,?)',await api.hash(session),csrf,attempt.generation+1,Date.now()+3600000)
        ]);
        return callbackPage(c,true,SESSION+'='+session+'; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict');
      }catch(_){return callbackPage(c,false);}
    }
    if(path==='/email/auth/session'&&request.method==='GET'){
      try{const actor=await api.verifyOwnerSession(request,env);return json({identity:{tenantId:actor.tenantId,objectId:actor.objectId},sender:c.sender,csrf:actor.csrf,expiresAt:actor.expiresAt});}
      catch(_){return json({error:'email_signin_required'},401);}
    }
    if(path==='/email/status'&&request.method==='GET'){
      try{await api.verifyOwnerSession(request,env);return null;}
      catch(_){return json({state:'not_connected',sender:null,missing:[],sendingEnabled:false});}
    }
    if(path==='/email/gmail/disconnect'&&request.method==='POST'){
      try{await api.verifyEmailAdmin(request,env);}catch(_){return json({error:'email_admin_required'},403);}
      await env.DB.batch([
        stmt(env,"UPDATE email_connections SET sender=NULL,status='disconnected',refresh_cipher=NULL,granted_scopes=NULL,connected_at=NULL,updated_at=?,generation=generation+1 WHERE id=1",new Date().toISOString()),
        env.DB.prepare('DELETE FROM email_owner_sessions'),env.DB.prepare('DELETE FROM email_owner_attempts')
      ]);
      return json({state:'disconnected',ownerRevocationRequired:true},200,{'Set-Cookie':SESSION+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'});
    }
    return null;
  };
})(globalThis);
