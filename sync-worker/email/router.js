(function (root) {
  'use strict';
  const api = root.PC_Email;
  const COOKIE = '__Secure-pc_email_session';
  function cookie(request) {
    return (request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || '';
  }
  function resultPage(c, success) {
    const nonce = api.random();
    const status = success ? 'connected' : 'error';
    return new Response('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gmail connection</title><body><h1>'+(success?'เชื่อม Gmail แล้ว / Gmail connected':'เชื่อมต่อไม่สำเร็จ / Connection unsuccessful')+'</h1><p>ปิดหน้านี้แล้วกลับไปที่ตั้งค่าอีเมล / Close this window and return to Email Settings.</p><script nonce="'+nonce+'">if(window.opener)window.opener.postMessage({type:"pc-email-result",status:"'+status+'"},'+JSON.stringify(c.origin)+');</script></body></html>',{status:success?200:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
  }
  api.routeEmail = async function (request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/email/')) return null;
    const c = api.readEmailConfig(env), readiness = api.emailReadiness(c);
    const origin = request.headers.get('Origin');
    const headers = {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    const json = (data, status=200, extra={}) => new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
    if (origin && origin !== c.origin) return json({error:'email_origin_denied'},403);
    if (origin === c.origin) headers['Access-Control-Allow-Origin'] = c.origin;
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Credentials':'true'}});
    if (path === '/email/capabilities' && request.method === 'GET') return json({enabled:readiness.ready,sendingEnabled:false,coproEnabled:readiness.ready&&env.EMAIL_COPRO_ENABLED==='true',testSendingEnabled:readiness.ready&&env.EMAIL_TEST_SEND_ENABLED==='true',scope:c.scope || null});
    if (!readiness.ready) return json({state:'configuration_incomplete',sender:null,missing:readiness.missing,sendingEnabled:false},503);
    if(api.routeCoProEmail){const result=await api.routeCoProEmail(request,env);if(result)return result;}
    try {
      if (path === '/email/gmail/callback' && request.method === 'GET') {
        try {
          const state = url.searchParams.get('state') || '', session = cookie(request), code = url.searchParams.get('code');
          if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(session) || !code || code.length>4096 || url.searchParams.has('error')) throw new Error();
          const stateHash = await api.hash(state), sessionHash = await api.hash(session);
          const attempt = await env.DB.prepare('UPDATE email_oauth_attempts SET consumed_at=? WHERE state_hash=? AND session_hash=? AND consumed_at IS NULL AND expires_at>? AND generation=(SELECT generation FROM email_connections WHERE id=1) AND EXISTS (SELECT 1 FROM email_admin_grants WHERE tenant_id=email_oauth_attempts.tenant_id AND object_id=email_oauth_attempts.object_id AND enabled=1) RETURNING *').bind(Date.now(),stateHash,sessionHash,Date.now()).first();
          if (!attempt) throw new Error();
          const verifier = await api.decryptSecret(attempt.verifier_cipher,c.encryptionKey,'pkce:'+stateHash);
          const tokens = await api.exchangeCode(code,verifier,c);
          const sender = await api.verifySender(tokens.access_token,c);
          const cipher = await api.encryptSecret(tokens.refresh_token,c.encryptionKey,'gmail:'+sender);
          const saved = await env.DB.prepare("UPDATE email_connections SET sender=?,status='connected',refresh_cipher=?,granted_scopes=?,connected_at=?,updated_at=?,generation=generation+1 WHERE id=1 AND generation=? AND EXISTS (SELECT 1 FROM email_admin_grants WHERE tenant_id=? AND object_id=? AND enabled=1)").bind(sender,cipher,tokens.scope,new Date().toISOString(),new Date().toISOString(),attempt.generation,attempt.tenant_id,attempt.object_id).run();
          if (saved.meta.changes !== 1) throw new Error();
          return resultPage(c,true);
        } catch (_) { return resultPage(c,false); }
      }
      const identity = await api.verifyEmailAdmin(request,env);
      if (path === '/email/status' && request.method === 'GET') {
        let connection = await env.DB.prepare('SELECT * FROM email_connections WHERE id=1').first();
        if (connection?.status === 'connected') {
          try {
            const refreshToken=await api.decryptSecret(connection.refresh_cipher,c.encryptionKey,'gmail:'+connection.sender);
            const refreshed=await api.refreshAccessToken({refresh_token:refreshToken},c);
            await api.verifySender(refreshed.access_token,c);
            if (refreshed.scope && !c.scopes.every(scope=>refreshed.scope.split(' ').includes(scope))) throw new Error('email_reconnect_required');
            if (refreshed.refresh_token !== refreshToken) {
              const cipher=await api.encryptSecret(refreshed.refresh_token,c.encryptionKey,'gmail:'+connection.sender);
              await env.DB.prepare("UPDATE email_connections SET refresh_cipher=?,updated_at=? WHERE id=1 AND generation=? AND status='connected'").bind(cipher,new Date().toISOString(),connection.generation).run();
            }
          } catch(error) {
            if (!['email_reconnect_required','email_wrong_mailbox'].includes(error.message)) throw new Error('email_unavailable');
            await env.DB.prepare("UPDATE email_connections SET status='reconnect_required',refresh_cipher=NULL,updated_at=? WHERE id=1 AND generation=? AND status='connected'").bind(new Date().toISOString(),connection.generation).run();
          }
          connection=await env.DB.prepare('SELECT sender,status FROM email_connections WHERE id=1').first();
        }
        return json({state:connection?.status || 'not_connected',sender:connection?.sender || null,missing:[],sendingEnabled:false});
      }
      if (request.method !== 'POST' || origin !== c.origin) return json({error:'email_request_denied'},403);
      if (path === '/email/gmail/connect') {
        const state = api.random(), verifier = api.random();
        const session = /^[\w-]{43}$/.test(cookie(request)) ? cookie(request) : api.random();
        const stateHash = await api.hash(state), sessionHash = await api.hash(session);
        const cipher = await api.encryptSecret(verifier,c.encryptionKey,'pkce:'+stateHash);
        // The new attempt invalidates earlier attempts globally and captures the
        // generation in the same transaction as the generation increment.
        await env.DB.batch([
          env.DB.prepare("INSERT OR IGNORE INTO email_connections(id,status,updated_at,generation) VALUES (1,'not_connected',?,0)").bind(new Date().toISOString()),
          env.DB.prepare('UPDATE email_connections SET generation=generation+1 WHERE id=1'),
          env.DB.prepare('DELETE FROM email_oauth_attempts'),
          env.DB.prepare('INSERT INTO email_oauth_attempts(state_hash,tenant_id,object_id,session_hash,verifier_cipher,expires_at,generation) SELECT ?,?,?,?,?,?,generation FROM email_connections WHERE id=1').bind(stateHash,identity.tenantId,identity.objectId,sessionHash,cipher,Date.now()+600000)
        ]);
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:c.scopes.join(' '),state,access_type:'offline',prompt:'consent select_account',code_challenge:await api.hash(verifier),code_challenge_method:'S256',login_hint:c.sender}).toString();
        return json({authorizationUrl:auth.href},200,{'Set-Cookie':COOKIE+'='+session+'; Path=/email/; Max-Age=600; HttpOnly; Secure; SameSite=Lax'});
      }
      if (path === '/email/gmail/disconnect') {
        await env.DB.batch([
          env.DB.prepare("INSERT OR IGNORE INTO email_connections(id,status,updated_at,generation) VALUES (1,'disconnected',?,0)").bind(new Date().toISOString()),
          env.DB.prepare("UPDATE email_connections SET sender=NULL,status='disconnected',refresh_cipher=NULL,granted_scopes=NULL,connected_at=NULL,updated_at=?,generation=generation+1 WHERE id=1").bind(new Date().toISOString()),
          env.DB.prepare('DELETE FROM email_oauth_attempts')
        ]);
        return json({state:'disconnected',ownerRevocationRequired:true});
      }
      return json({error:'email_not_found'},404);
    } catch (error) { return json({error:error.message === 'email_admin_required'?'email_admin_required':'email_unavailable'},error.message === 'email_admin_required'?403:503); }
  };
})(globalThis);
