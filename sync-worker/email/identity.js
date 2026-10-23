(function (root) {
  'use strict';
  const api = root.PC_Email;
  const cache = new Map();
  function reject() { throw new Error('email_admin_required'); }
  function decode(part) {
    const text = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(text, c => c.charCodeAt(0));
  }
  api.verifyEmailActor = async function (request, env, deps = {}) {
    const config = api.readEmailConfig(env);
    if(env.EMAIL_STAFF_ENABLED==='true')return api.verifyStaffSession(request,env);
    if(config.authMode==='gmail_owner'){const actor=await api.verifyOwnerSession(request,env);return {tenantId:actor.tenantId,objectId:actor.objectId};}
    if (!/^[a-f0-9-]{36}$/i.test(config.tenantId) || !/^[a-f0-9-]{36}$/i.test(config.audience) || config.scope !== 'api://' + config.audience + '/access_as_user' || !env.DB) reject();
    try {
      const authorization = request.headers.get('Authorization') || '';
      if (!authorization.startsWith('Bearer ') || authorization.length > 16384) reject();
      const parts = authorization.slice(7).split('.');
      if (parts.length !== 3) reject();
      const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
      const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256 || header.crit) reject();
      const now = Math.floor(Date.now() / 1000);
      if (claims.ver !== '2.0' || claims.iss !== `https://login.microsoftonline.com/${config.tenantId}/v2.0` || claims.tid !== config.tenantId || claims.aud !== config.audience || !/^[a-f0-9-]{36}$/i.test(claims.oid || '') || !Number.isFinite(claims.exp) || claims.exp <= now - 60 || !Number.isFinite(claims.nbf) || claims.nbf > now + 60 || typeof claims.scp !== 'string' || !claims.scp.split(' ').includes('access_as_user')) reject();
      const endpoint = `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`;
      // Mocked fetches never enter the process-wide production cache.
      let entry = deps.fetch ? null : cache.get(endpoint);
      let key;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!entry || entry.expires <= Date.now() || attempt === 1) {
          const response = await (deps.fetch || fetch)(endpoint, {signal: AbortSignal.timeout(8000), redirect: 'manual'});
          if (!response.ok) reject();
          const body = await response.json();
          if (!Array.isArray(body.keys) || body.keys.length > 100) reject();
          entry = {keys: body.keys, expires: Date.now() + 300000};
          if (!deps.fetch) { if (cache.size >= 4) cache.clear(); cache.set(endpoint, entry); }
        }
        key = entry.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
        if (key) break;
      }
      if (!key) reject();
      const publicKey = await crypto.subtle.importKey('jwk', key, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
      if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) reject();
      return {tenantId: claims.tid, objectId: claims.oid};
    } catch (_) { reject(); }
  };
  api.verifyEmailAdmin = async function(request, env, deps = {}) {
    const actor=env.EMAIL_STAFF_ENABLED==='true'&&env.EMAIL_AUTH_MODE==='gmail_owner'?await api.verifyOwnerSession(request,env):await api.verifyEmailActor(request,env,deps);
    if(actor.staffId)reject();
    const grant=await env.DB.prepare('SELECT enabled FROM email_admin_grants WHERE tenant_id=? AND object_id=? AND enabled=1').bind(actor.tenantId,actor.objectId).first();
    if(!grant || grant.enabled!==1)reject();
    return actor;
  };
  api.requireEmailPermission = async function(actor, permission, env) {
    if(!actor || !['manage','submit','it'].includes(permission))reject();
    if(actor.staffId)await api.requireStaffPermission(actor,permission,env);
    if(env.EMAIL_AUTH_MODE==='gmail_owner'&&!api.isGmailOwner(actor))reject();
    if(permission==='manage') {
      const admin=await env.DB.prepare('SELECT enabled FROM email_admin_grants WHERE tenant_id=? AND object_id=? AND enabled=1').bind(actor.tenantId,actor.objectId).first();
      if(admin?.enabled===1)return;
    }
    const grant=await env.DB.prepare('SELECT enabled FROM email_actor_permissions WHERE tenant_id=? AND object_id=? AND permission=? AND enabled=1').bind(actor.tenantId,actor.objectId,permission).first();
    if(!grant || grant.enabled!==1)reject();
  };
})(globalThis);
