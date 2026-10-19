const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {load,database}=require('./helpers/copro-context.cjs');
function setup(){
 const a=load(['owner-session','router']),DB=database();DB.db.exec(fs.readFileSync('sync-worker/migrations/006_gmail_owner_sessions.sql','utf8'));
 const env={DB,EMAIL_AUTH_MODE:'gmail_owner',EMAIL_CONNECTION_ENABLED:'true',GMAIL_CLIENT_SECRET:'mock',EMAIL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
 const origin=a.readEmailConfig(env).origin;
 const req=(path,opts={})=>new Request(origin+'/email/'+path,{method:opts.method||'GET',headers:{...(opts.method?{Origin:origin}:{}),...(opts.cookie?{Cookie:opts.cookie}:{}),...(opts.csrf?{'X-PC-Email-CSRF':opts.csrf}:{}),...opts.headers}});
 let exchanges=0;a.exchangeCode=async()=>{exchanges++;return {access_token:'mock-access',refresh_token:'mock-refresh',scope:a.readEmailConfig(env).scopes.join(' ')};};a.verifySender=async()=> 'it@rocks-foods.com';
 return {a,DB,env,req,origin,exchanges:()=>exchanges};
}
async function connect(f){
 const start=await f.a.routeEmail(f.req('gmail/connect',{method:'POST'}),f.env);assert.equal(start.status,200);
 const url=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const callback=f.req('gmail/callback?state='+url.searchParams.get('state')+'&code=mock-code',{cookie});
 const result=await f.a.routeEmail(callback,f.env);assert.equal(result.status,200);
 const sessionCookie=result.headers.get('set-cookie').split(';')[0];
 const session=await f.a.routeEmail(f.req('auth/session',{cookie:sessionCookie}),f.env);assert.equal(session.status,200);
 return {callback,cookie:sessionCookie,session:await session.json()};
}
test('owner mode needs no Microsoft config; successful Gmail consent alone creates a protected session',async()=>{
 const f=setup();assert.equal(f.a.emailReadiness(f.a.readEmailConfig(f.env)).ready,true);
 const {cookie,session}=await connect(f);assert.equal(session.sender,'it@rocks-foods.com');assert.ok(session.csrf);
 const actor=await f.a.verifyEmailActor(f.req('threads',{cookie}),f.env);assert.equal(actor.objectId,session.identity.objectId);
 await f.a.requireEmailPermission(actor,'manage',f.env);await f.a.requireEmailPermission(actor,'submit',f.env);
 await assert.rejects(f.a.verifyEmailActor(f.req('threads',{headers:{Authorization:'Bearer shared-sync'}}),f.env));
 await assert.rejects(f.a.verifyEmailActor(f.req('copro',{method:'POST',cookie}),f.env));
 await f.a.verifyEmailActor(f.req('copro',{method:'POST',cookie,csrf:session.csrf}),f.env);
 const replay=await f.a.routeEmail((await connect(f)).callback,f.env);assert.equal(replay.status,400);
 f.DB.db.close();
});
test('cross-site, wrong browser and wrong Gmail account cannot establish a session or grants',async()=>{
 const f=setup();let r=await f.a.routeEmail(f.req('gmail/connect',{method:'POST',headers:{Origin:'https://evil.test'}}),f.env);assert.equal(r.status,403);
 const start=await f.a.routeEmail(f.req('gmail/connect',{method:'POST'}),f.env),u=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 r=await f.a.routeEmail(f.req('gmail/callback?state='+u.searchParams.get('state')+'&code=x'),f.env);assert.equal(r.status,400);assert.equal(f.exchanges(),0);
 f.a.verifySender=async()=>{throw Error('email_wrong_mailbox');};
 r=await f.a.routeEmail(f.req('gmail/callback?state='+u.searchParams.get('state')+'&code=x',{cookie}),f.env);assert.equal(r.status,400);
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_owner_sessions').get().n,0);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_admin_grants').get().n,0);f.DB.db.close();
});
test('starting consent cannot invalidate an existing owner session; disconnect and expiry do',async()=>{
 const f=setup(),{cookie,session}=await connect(f);
 await f.a.routeEmail(f.req('gmail/connect',{method:'POST'}),f.env);
 await f.a.verifyEmailActor(f.req('copro',{cookie}),f.env);
 const r=await f.a.routeEmail(f.req('gmail/disconnect',{method:'POST',cookie,csrf:session.csrf}),f.env);assert.equal(r.status,200);
 await assert.rejects(f.a.verifyEmailActor(f.req('copro',{cookie}),f.env));
 const next=await connect(f);f.DB.db.exec('UPDATE email_owner_sessions SET expires_at=0');await assert.rejects(f.a.verifyEmailActor(f.req('copro',{cookie:next.cookie}),f.env));f.DB.db.close();
});
test('generation change during consent exchange rolls back credentials, grants and sessions',async()=>{
 const f=setup();f.a.exchangeCode=async()=>{f.DB.db.exec('UPDATE email_connections SET generation=generation+1');return {access_token:'mock',refresh_token:'mock',scope:'mock'};};
 const start=await f.a.routeEmail(f.req('gmail/connect',{method:'POST'}),f.env),u=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
 const r=await f.a.routeEmail(f.req('gmail/callback?state='+u.searchParams.get('state')+'&code=x',{cookie}),f.env);assert.equal(r.status,400);
 for(const table of ['email_admin_grants','email_actor_permissions','email_owner_sessions'])assert.equal(f.DB.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 assert.equal(f.DB.db.prepare('SELECT status FROM email_connections').get().status,'not_connected');f.DB.db.close();
});
test('owner mode rejects legacy granted actors and logout revokes only the browser session',async()=>{
 const f=setup(),{cookie}=await connect(f),legacy={tenantId:'11111111-1111-4111-8111-111111111111',objectId:'33333333-3333-4333-8333-333333333333'};
 f.DB.db.prepare("INSERT INTO email_actor_permissions VALUES(?,?,'submit',1)").run(legacy.tenantId,legacy.objectId);
 await assert.rejects(f.a.requireEmailPermission(legacy,'submit',f.env));
 f.env.EMAIL_CONNECTION_ENABLED='false';const r=await f.a.routeEmail(f.req('auth/logout',{method:'POST',cookie}),f.env);assert.equal(r.status,200);
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_owner_sessions').get().n,0);assert.equal(f.DB.db.prepare('SELECT status FROM email_connections').get().status,'connected');f.DB.db.close();
});
test('logout blocks both pending and already-exchanging consent callbacks in that browser',async()=>{
 for(const inFlight of [false,true]){
  const f=setup();const start=await f.a.routeEmail(f.req('gmail/connect',{method:'POST'}),f.env),u=new URL((await start.json()).authorizationUrl),cookie=start.headers.get('set-cookie').split(';')[0];
  const logout=()=>f.a.routeEmail(f.req('auth/logout',{method:'POST',cookie}),f.env);
  if(inFlight)f.a.exchangeCode=async()=>{assert.equal((await logout()).status,200);return {access_token:'mock',refresh_token:'mock',scope:'mock'};};
  else assert.equal((await logout()).status,200);
  const result=await f.a.routeEmail(f.req('gmail/callback?state='+u.searchParams.get('state')+'&code=x',{cookie}),f.env);assert.equal(result.status,400);
  assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_owner_sessions').get().n,0);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_admin_grants').get().n,0);f.DB.db.close();
 }
});
