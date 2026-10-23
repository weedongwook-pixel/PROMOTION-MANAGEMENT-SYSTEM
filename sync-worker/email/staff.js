(function(root){
  'use strict';
  const api=root.PC_Email,COOKIE='__Host-pc_mail_staff',CHALLENGE='__Host-pc_mail_challenge',LIFETIME=8*60*60;
  const TENANT='512d498e-05ac-402b-a2aa-d61d10c3bee8',AUDIENCE='8c0e2312-d9ae-4dff-accb-65fa3cb9815e';
  const OWNER={tenantId:'00000000-0000-4000-8000-000000000001',objectId:'00000000-0000-4000-8000-000000000002'};
  const stmt=(e,s,...v)=>e.DB.prepare(s).bind(...v),cookie=(r,k)=>(r.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(k+'='))?.slice(k.length+1)||'';
  const cookieValue=(name,value,age)=>name+'='+value+'; Path=/; Max-Age='+age+'; HttpOnly; Secure; SameSite=Strict';
  const deny=()=>{throw Error('email_staff_signin_required');};
  const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
  const exposed=u=>({id:u.id,username:u.username,name:u.name,role:u.site_role,enabled:!!u.enabled,canSend:!!u.can_send,canIT:!!u.can_it,microsoft:!!u.ms_oid,password:!!u.password_hash,updatedAt:u.updated_at});
  api.hasStaffCookie=r=>!!cookie(r,COOKIE);
  async function passwordHash(password,salt,env){
    // Per-account salt plus a domain-separated server-only pepper. No public legacy password is imported.
    const raw=Uint8Array.from(atob(env.EMAIL_ENCRYPTION_KEY),c=>c.charCodeAt(0));
    const pepper=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const material=await crypto.subtle.sign('HMAC',pepper,new TextEncoder().encode('pc-mail-staff-password-v1\0'+password));
    const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }
  function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
  api.saveStaffAccount=async function(input,env){
    const old=input.id?await stmt(env,'SELECT * FROM email_staff WHERE id=?',input.id).first():null;
    if(input.id&&!old)throw Error('email_staff_not_found');
    const username=String(input.username||old?.username||'').trim().toLowerCase(),name=String(input.name||old?.name||'').trim();
    if(!/^[a-z0-9@._+-]{3,160}$/.test(username)||!name||name.length>160)throw Error('email_staff_invalid_account');
    for(const key of ['canSend','canIT','enabled'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw Error('email_staff_invalid_account');
    const role=input.role||old?.site_role||'MKT';if(!['Admin','Admin HQ','MKT','IT','ACC','OP','BD','RD','HQ'].includes(role))throw Error('email_staff_invalid_account');
    let salt=old?.password_salt||null,hash=old?.password_hash||null,msOID=old?.ms_oid||null,msTenant=old?.ms_tenant||null;
    if(input.password){if(typeof input.password!=='string'||input.password.length<12||input.password.length>256)throw Error('email_staff_password_length');salt=api.random();hash=await passwordHash(input.password,salt,env);}
    if(input.microsoftRequest){const pending=await stmt(env,'SELECT * FROM email_staff_requests WHERE ms_oid=? AND ms_tenant=?',input.microsoftRequest,TENANT).first();if(!pending||msOID&&msOID!==pending.ms_oid)throw Error('email_staff_invalid_account');msOID=pending.ms_oid;msTenant=pending.ms_tenant;}
    if(!hash&&!msOID)throw Error('email_staff_credentials_required');
    const id=old?.id||crypto.randomUUID(),version=(old?.version||0)+1,now=Date.now();
    const statements=[stmt(env,`INSERT INTO email_staff(id,username,name,site_role,password_salt,password_hash,ms_oid,ms_tenant,enabled,can_send,can_it,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name,site_role=excluded.site_role,password_salt=excluded.password_salt,password_hash=excluded.password_hash,ms_oid=excluded.ms_oid,ms_tenant=excluded.ms_tenant,enabled=excluded.enabled,can_send=excluded.can_send,can_it=excluded.can_it,version=excluded.version,updated_at=excluded.updated_at WHERE email_staff.version=?`,id,username,name,role,salt,hash,msOID,msTenant,input.enabled===false?0:1,input.canSend===true?1:0,input.canIT===true?1:0,version,old?.created_at||now,now,old?.version||0),env.DB.prepare('INSERT INTO email_owner_commit_guard(id) SELECT CASE WHEN changes()=1 THEN 1 ELSE 0 END'),env.DB.prepare('DELETE FROM email_owner_commit_guard'),stmt(env,'DELETE FROM email_staff_sessions WHERE staff_id=?',id)];
    if(input.microsoftRequest)statements.push(stmt(env,'DELETE FROM email_staff_requests WHERE ms_oid=?',input.microsoftRequest));
    await env.DB.batch(statements);return exposed(await stmt(env,'SELECT * FROM email_staff WHERE id=?',id).first());
  };
  api.requireStaffPermission=async function(actor,permission,env){
    if(!actor.staffId)return;
    if(env.EMAIL_STAFF_ENABLED!=='true')deny();
    const row=await stmt(env,'SELECT * FROM email_staff WHERE id=? AND enabled=1',actor.staffId).first();
    if(!row||row.version!==actor.staffVersion||!(permission==='it'?row.can_it:row.can_send))deny();
  };
  api.staffTransactionGuard=function(env,actor,permission){
    if(!actor.staffId)return [];
    return [stmt(env,'INSERT INTO email_owner_commit_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM email_staff WHERE id=? AND version=? AND enabled=1 AND '+(permission==='it'?'can_it':'can_send')+'=1) THEN 1 ELSE 0 END',actor.staffId,actor.staffVersion),env.DB.prepare('DELETE FROM email_owner_commit_guard')];
  };
  api.verifyStaffSession=async function(request,env){
    const value=cookie(request,COOKIE);if(env.EMAIL_STAFF_ENABLED!=='true'||!/^[\w-]{43}$/.test(value))deny();
    const row=await stmt(env,'SELECT u.*,s.csrf,s.expires_at FROM email_staff_sessions s JOIN email_staff u ON u.id=s.staff_id AND u.version=s.version AND u.enabled=1 WHERE s.session_hash=? AND s.expires_at>?',await api.hash(value),Date.now()).first();
    if(!row)deny();
    if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==api.readEmailConfig(env).origin||request.headers.get('X-PC-Email-CSRF')!==row.csrf))deny();
    return {...OWNER,staffId:row.id,staffVersion:row.version,staffName:row.name,csrf:row.csrf,expiresAt:row.expires_at,staff:exposed(row)};
  };
  async function session(user,env){
    const value=api.random(),csrf=api.random(),expires=Date.now()+LIFETIME*1000;
    await stmt(env,'DELETE FROM email_staff_sessions WHERE expires_at<=?',Date.now()).run();
    const saved=await stmt(env,'INSERT INTO email_staff_sessions(session_hash,staff_id,version,csrf,expires_at) SELECT ?,id,version,?,? FROM email_staff WHERE id=? AND enabled=1 AND version=?',await api.hash(value),csrf,expires,user.id,user.version).run();
    if(saved.meta.changes!==1)deny();
    return json({identity:OWNER,staff:exposed(user),csrf,expiresAt:expires},200,{'Set-Cookie':cookieValue(COOKIE,value,LIFETIME)});
  }
  async function limit(request,env,account){
    const now=Date.now(),key=await api.hash(account===undefined?'staff-login-ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'):'staff-login-account:'+account);
    const row=await stmt(env,'INSERT INTO email_staff_rate(rate_key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(rate_key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts',key,now+600000,now,now,now+600000).first();
    await stmt(env,'DELETE FROM email_staff_rate WHERE expires_at<?',now-600000).run();
    if(row.attempts>(account===undefined?300:20))throw Error('email_staff_try_later');return key;
  }
  let keyCache=null;
  api.verifyStaffMicrosoft=async function(token,nonce,deps={}){
    try{
      if(typeof token!=='string'||token.length>16384)deny();
      const parts=token.split('.');if(parts.length!==3)deny();
      const decode=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const h=JSON.parse(new TextDecoder().decode(decode(parts[0]))),c=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
      if(h.alg!=='RS256'||h.crit||typeof h.kid!=='string'||h.kid.length>256||c.ver!=='2.0'||c.tid!==TENANT||c.iss!=='https://login.microsoftonline.com/'+TENANT+'/v2.0'||c.aud!==AUDIENCE||c.nonce!==nonce||!Number.isFinite(c.exp)||c.exp<=now||!Number.isFinite(c.nbf)||c.nbf>now+60||!Number.isFinite(c.iat)||c.iat>now+60||!/^[a-f0-9-]{36}$/i.test(c.oid||''))deny();
      let keys=deps.fetch?null:keyCache?.expires>Date.now()?keyCache.keys:null;
      for(let attempt=0;attempt<2;attempt++){
        if(!keys||attempt){const r=await (deps.fetch||fetch)('https://login.microsoftonline.com/'+TENANT+'/discovery/v2.0/keys',{redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok)deny();keys=(await r.json()).keys;if(!Array.isArray(keys)||keys.length>100)deny();if(!deps.fetch)keyCache={keys,expires:Date.now()+300000};}
        const jwk=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
        if(!jwk)continue;
        const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
        if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))deny();
        return {oid:c.oid.toLowerCase(),tenant:TENANT,name:String(c.name||'Microsoft user').slice(0,160),email:String(c.preferred_username||'').slice(0,160)};
      }
      deny();
    }catch(_){deny();}
  };
  api.routeStaff=async function(request,env){
    const path=new URL(request.url).pathname;if(!path.startsWith('/email/staff/'))return null;
    if(env.EMAIL_STAFF_ENABLED!=='true')return json({error:'email_staff_disabled'},404);
    if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==api.readEmailConfig(env).origin)return json({error:'email_origin_denied'},403);
    try{
      if(path==='/email/staff/session'&&request.method==='GET'){const a=await api.verifyStaffSession(request,env);return json({identity:OWNER,staff:a.staff,csrf:a.csrf,expiresAt:a.expiresAt});}
      if(path==='/email/staff/logout'&&request.method==='POST'){
        const value=cookie(request,COOKIE);if(value)await stmt(env,'DELETE FROM email_staff_sessions WHERE session_hash=?',await api.hash(value)).run();
        return json({loggedOut:true},200,{'Set-Cookie':cookieValue(COOKIE,'',0)});
      }
      if(path==='/email/staff/owner-session'&&request.method==='GET'){const a=await api.verifyOwnerSession(request,env);return json({csrf:a.csrf});}
      if(path==='/email/staff/accounts'&&request.method==='GET'){
        await api.verifyOwnerSession(request,env);
        const users=(await env.DB.prepare('SELECT * FROM email_staff ORDER BY name').all()).results.map(exposed),pending=(await env.DB.prepare('SELECT * FROM email_staff_requests ORDER BY requested_at DESC LIMIT 100').all()).results;
        return json({users,pending});
      }
      if(request.method!=='POST')return json({error:'email_not_found'},404);
      if(Number(request.headers.get('Content-Length'))>20000)return json({error:'email_request_too_large'},413);
      const reader=request.body?.getReader(),chunks=[];let size=0;
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20000){await reader.cancel();return json({error:'email_request_too_large'},413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const body=JSON.parse(new TextDecoder().decode(bytes));
      if(path==='/email/staff/accounts'){
        await api.verifyOwnerSession(request,env);const user=await api.saveStaffAccount(body,env);
        await stmt(env,'INSERT INTO email_audit(id,actor,event,details_json,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),'mailbox-owner','staff_access_updated',JSON.stringify({staffId:user.id,enabled:user.enabled,canSend:user.canSend,canIT:user.canIT}),Date.now()).run();return json({user});
      }
      if(!['/email/staff/login','/email/staff/microsoft/challenge','/email/staff/microsoft'].includes(path))return json({error:'email_not_found'},404);
      await limit(request,env);
      if(path==='/email/staff/login'){
        if(typeof body.username!=='string'||typeof body.password!=='string'||body.username.length>160||body.password.length>256)deny();
        const rateKey=await limit(request,env,body.username.trim().toLowerCase());
        const user=await stmt(env,'SELECT * FROM email_staff WHERE username=? COLLATE NOCASE AND enabled=1',body.username.trim()).first();
        const hash=await passwordHash(body.password,user?.password_salt||'invalid-user-constant-salt',env);
        if(!user?.password_hash||!equal(hash,user.password_hash))deny();await stmt(env,'DELETE FROM email_staff_rate WHERE rate_key=?',rateKey).run();return session(user,env);
      }
      if(path==='/email/staff/microsoft/challenge'){
        const nonce=api.random(),browser=api.random();await stmt(env,'DELETE FROM email_staff_challenges WHERE expires_at<=?',Date.now()).run();
        await stmt(env,'INSERT INTO email_staff_challenges VALUES(?,?,?)',await api.hash(nonce),await api.hash(browser),Date.now()+600000).run();return json({nonce},200,{'Set-Cookie':cookieValue(CHALLENGE,browser,600)});
      }
      const browser=cookie(request,CHALLENGE);if(!/^[\w-]{43}$/.test(browser)||!/^[\w-]{43}$/.test(body.nonce||''))deny();
      const challenge=await stmt(env,'DELETE FROM email_staff_challenges WHERE nonce_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce_hash',await api.hash(body.nonce),await api.hash(browser),Date.now()).first();if(!challenge)deny();
      const identity=await api.verifyStaffMicrosoft(body.idToken,body.nonce);
      const user=await stmt(env,'SELECT * FROM email_staff WHERE ms_oid=? AND ms_tenant=?',identity.oid,identity.tenant).first();
      if(user){if(!user.enabled)deny();return session(user,env);}
      await stmt(env,'INSERT INTO email_staff_requests VALUES(?,?,?,?,?) ON CONFLICT(ms_oid) DO UPDATE SET display_name=excluded.display_name,email_label=excluded.email_label,requested_at=excluded.requested_at',identity.oid,identity.tenant,identity.name,identity.email,Date.now()).run();
      return json({error:'email_staff_pending'},403);
    }catch(e){const safe=['email_staff_signin_required','email_staff_try_later','email_staff_not_found','email_staff_invalid_account','email_staff_password_length','email_staff_credentials_required'];return json({error:safe.includes(e.message)?e.message:'email_staff_request_failed'},e.message==='email_staff_try_later'?429:e.message==='email_staff_signin_required'?401:403);}
  };
})(globalThis);
