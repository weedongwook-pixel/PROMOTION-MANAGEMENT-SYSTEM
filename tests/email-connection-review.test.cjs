const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {load,database}=require('./helpers/email-context.cjs');
test('same username with different object ID cannot acquire email token',async()=>{
  const account={username:'admin@example.com',idTokenClaims:{tid:'tenant',oid:'wrong'}};
  const w={PC_EmailMsalContext:async()=>({email:account.username,identity:{tenantId:'tenant',objectId:'expected'},app:{getAllAccounts:()=>[account],acquireTokenPopup:async()=>({account,accessToken:'wrong'})}})};
  vm.runInNewContext(fs.readFileSync('js/email-auth.js','utf8'),{window:w});
  await assert.rejects(w.PC_EmailAuth.acquireToken({scope:'api://22222222-2222-4222-8222-222222222222/access_as_user',interactive:true}),/email_wrong_staff_account/);
});
test('definitive refresh rejection becomes reconnect required but cannot undo disconnect',async()=>{
  const a=load(),DB=database();
  const e={DB,EMAIL_CONNECTION_ENABLED:'true',EMAIL_TENANT_ID:'11111111-1111-4111-8111-111111111111',EMAIL_API_AUDIENCE:'22222222-2222-4222-8222-222222222222',EMAIL_API_SCOPE:'api://22222222-2222-4222-8222-222222222222/access_as_user',EMAIL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),GMAIL_CLIENT_SECRET:'test'};
  a.verifyEmailAdmin=async()=>({});
  const cipher=await a.encryptSecret('secret',e.EMAIL_ENCRYPTION_KEY,'gmail:it@rocks-foods.com');
  const request=()=>new Request('https://example.test/email/status');
  DB.db.prepare("INSERT INTO email_connections VALUES(1,?,'connected',?,?,?, ?,0)").run('it@rocks-foods.com',cipher,'scopes','now','now');
  a.refreshAccessToken=async()=>{throw new Error('email_reconnect_required');};
  let r=await a.routeEmail(request(),e);assert.equal((await r.json()).state,'reconnect_required');
  DB.db.prepare("UPDATE email_connections SET status='connected',refresh_cipher=?").run(cipher);
  a.refreshAccessToken=async()=>{DB.db.exec("UPDATE email_connections SET status='disconnected',refresh_cipher=NULL,generation=generation+1");throw new Error('email_reconnect_required');};
  r=await a.routeEmail(request(),e);assert.equal((await r.json()).state,'disconnected');DB.db.close();
});
