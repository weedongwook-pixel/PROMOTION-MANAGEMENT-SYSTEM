const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {load,database}=require('./helpers/copro-context.cjs');
const origin='https://white-pine-853e.quiet-surf-dda2.workers.dev';
function fixture(){const DB=database();DB.db.exec(fs.readFileSync('sync-worker/migrations/006_gmail_owner_sessions.sql','utf8'));DB.db.exec(fs.readFileSync('sync-worker/migrations/007_email_staff.sql','utf8'));const a=load(['owner-session','staff']);const env={DB,EMAIL_STAFF_ENABLED:'true',EMAIL_AUTH_MODE:'gmail_owner',EMAIL_CONNECTION_ENABLED:'true',EMAIL_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64')};return {DB,a,env};}
function req(path,body,cookie='',csrf=''){return new Request(origin+'/email/staff/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-PC-Email-CSRF':csrf},...(body?{body:JSON.stringify(body)}:{})});}
async function add(f){return f.a.saveStaffAccount({username:'alice',name:'Alice',password:'A long private password 42!',canSend:true,canIT:false},f.env);}
test('server password session authorizes only configured staff; cookie, CSRF and revocation enforced',async()=>{
 const f=fixture(),u=await add(f);let r=await f.a.routeStaff(req('login',{username:'alice',password:'bad'}),f.env);assert.equal(r.status,401);
 r=await f.a.routeStaff(req('login',{username:'alice',password:'A long private password 42!'}),f.env);assert.equal(r.status,200);const data=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.equal(data.staff.name,'Alice');
 const actor=await f.a.verifyStaffSession(req('session',null,cookie),f.env);assert.equal(actor.staffId,u.id);await f.a.requireStaffPermission(actor,'submit',f.env);await assert.rejects(f.a.requireStaffPermission(actor,'it',f.env));await assert.rejects(f.a.verifyStaffSession(req('x',{},cookie,'wrong'),f.env));await f.a.verifyStaffSession(req('x',{},cookie,data.csrf),f.env);
 await f.a.saveStaffAccount({id:u.id,username:'alice',name:'Alice',canSend:false,canIT:false,enabled:false},f.env);await assert.rejects(f.a.verifyStaffSession(req('session',null,cookie),f.env));await assert.rejects(f.a.requireStaffPermission(actor,'submit',f.env));f.DB.db.close();
});
test('localStorage names, legacy defaults and foreign origin cannot create mail sessions',async()=>{
 const f=fixture();let r=await f.a.routeStaff(req('login',{username:'mkt',password:'mkt',role:'Admin',name:'Alice'}),f.env);assert.equal(r.status,401);
 r=await f.a.routeStaff(new Request(origin+'/email/staff/login',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),f.env);assert.equal(r.status,403);
 await assert.rejects(f.a.saveStaffAccount({username:'mkt',name:'MKT',password:'mkt',canSend:true},f.env));assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_staff_sessions').get().n,0);f.DB.db.close();
});
test('account login rate limit stops repeated guesses independently of office IP volume',async()=>{
 const f=fixture();for(let i=0;i<20;i++)await f.a.routeStaff(req('login',{username:'alice',password:'wrong'}),f.env);
 const r=await f.a.routeStaff(req('login',{username:'alice',password:'wrong'}),f.env);assert.equal(r.status,429);f.DB.db.close();
});
test('Microsoft verifies signature, tenant, app audience and nonce; names never confer access',async()=>{
 const f=fixture(),crypto=require('node:crypto').webcrypto;
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';const deps={fetch:async()=>Response.json({keys:[jwk]})};
 const claims={ver:'2.0',tid:'512d498e-05ac-402b-a2aa-d61d10c3bee8',iss:'https://login.microsoftonline.com/512d498e-05ac-402b-a2aa-d61d10c3bee8/v2.0',aud:'8c0e2312-d9ae-4dff-accb-65fa3cb9815e',oid:'33333333-3333-4333-8333-333333333333',nonce:'challenge',exp:Date.now()/1000+300,nbf:Date.now()/1000-1,iat:Date.now()/1000-1,name:'Admin',preferred_username:'admin@example.com'};
 const token=async c=>{const prefix=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');return prefix+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(prefix))).toString('base64url');};
 assert.equal((await f.a.verifyStaffMicrosoft(await token(claims),'challenge',deps)).oid,claims.oid);
 for(const patch of [{nonce:'wrong'},{aud:'wrong'},{tid:'wrong'},{iss:'wrong'},{exp:1}])await assert.rejects(f.a.verifyStaffMicrosoft(await token({...claims,...patch}),'challenge',deps));
 const good=await token(claims);await assert.rejects(f.a.verifyStaffMicrosoft(good.slice(0,-10)+'AAAAAAAAAA','challenge',deps));
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_staff').get().n,0);f.DB.db.close();
});
test('verified company Microsoft sign-in enrolls the person as a sender at once, binds identity and cannot replay challenge',async()=>{
 const f=fixture();f.a.verifyStaffMicrosoft=async()=>({oid:'33333333-3333-4333-8333-333333333333',tenant:'512d498e-05ac-402b-a2aa-d61d10c3bee8',name:'Verified person',email:'Label@example.com'});
 async function attempt(){const r=await f.a.routeStaff(req('microsoft/challenge',{}),f.env);return {nonce:(await r.json()).nonce,cookie:r.headers.get('set-cookie').split(';')[0]};}
 f.DB.db.prepare('INSERT INTO email_staff_requests VALUES(?,?,?,?,?)').run('33333333-3333-4333-8333-333333333333','512d498e-05ac-402b-a2aa-d61d10c3bee8','Verified person','label@example.com',1);
 let ch=await attempt(),r=await f.a.routeStaff(req('microsoft',{nonce:ch.nonce,idToken:'verified'},ch.cookie),f.env);assert.equal(r.status,200);
 const first=await r.json();assert.equal(first.staff.canSend,true);assert.equal(first.staff.canIT,true);assert.equal(first.staff.username,'label@example.com');
 const cookie=r.headers.get('set-cookie').split(';')[0],actor=await f.a.verifyStaffSession(req('session',null,cookie),f.env);await f.a.requireStaffPermission(actor,'submit',f.env);await f.a.requireStaffPermission(actor,'it',f.env);
 r=await f.a.routeStaff(req('microsoft',{nonce:ch.nonce,idToken:'verified'},ch.cookie),f.env);assert.equal(r.status,401);
 ch=await attempt();r=await f.a.routeStaff(req('microsoft',{nonce:ch.nonce,idToken:'verified'},ch.cookie),f.env);assert.equal(r.status,200);assert.equal((await r.json()).staff.id,first.staff.id);
 assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_staff').get().n,1);assert.equal(f.DB.db.prepare('SELECT count(*) n FROM email_staff_requests').get().n,0);
 await f.a.saveStaffAccount({id:first.staff.id,username:'label@example.com',name:'Verified person',canSend:false,canIT:false,enabled:false},f.env);
 ch=await attempt();r=await f.a.routeStaff(req('microsoft',{nonce:ch.nonce,idToken:'verified'},ch.cookie),f.env);assert.equal(r.status,401,'owner can still switch a person off');f.DB.db.close();
});
test('mailbox owner browser alone no longer authorizes employee send when central access is enabled',async()=>{
 const f=fixture();f.a.verifyOwnerSession=async()=>({tenantId:'owner',objectId:'owner'});
 await assert.rejects(f.a.verifyEmailActor(req('session'),f.env));
 const r=await f.a.routeStaff(req('accounts',{}),f.env);assert.notEqual(r.status,200,'invalid account payload never becomes permission');f.DB.db.close();
});
test('office users can obtain more than ten Microsoft challenges without lockout and body sizes are bounded',async()=>{
 const f=fixture();for(let i=0;i<30;i++)assert.equal((await f.a.routeStaff(req('microsoft/challenge',{}),f.env)).status,200);
 const r=await f.a.routeStaff(req('login',{username:'alice',password:'x'.repeat(21000)}),f.env);assert.equal(r.status,413);f.DB.db.close();
});
