const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function load(){const c={crypto:webcrypto,fetch,AbortSignal,TextEncoder,TextDecoder,atob,btoa,URL,URLSearchParams,Date};vm.createContext(c);for(const f of ['config','storage','oauth'])vm.runInContext(fs.readFileSync(`sync-worker/email/${f}.js`,'utf8'),c);return c.PC_Email;}
const key=Buffer.alloc(32,7).toString('base64');
test('AES-GCM randomizes and binds ciphertext to key and purpose',async()=>{const a=load();const x=await a.encryptSecret('private',key,'sender'),y=await a.encryptSecret('private',key,'sender');assert.notEqual(x,y);assert.match(x,/^v1\./);assert.equal(await a.decryptSecret(x,key,'sender'),'private');await assert.rejects(a.decryptSecret(x,key,'other'));await assert.rejects(a.decryptSecret(x,Buffer.alloc(32,8).toString('base64'),'sender'));await assert.rejects(a.decryptSecret(x.slice(0,-3)+'xxx',key,'sender'));});
test('Google exchange requires scopes and refresh credential; profile requires exact sender',async()=>{const a=load(),c=a.readEmailConfig({GMAIL_CLIENT_SECRET:'test'});await assert.rejects(a.exchangeCode('code','verifier',c,{fetch:async()=>Response.json({error:'provider secret'},{status:400})}),/email_provider_error/);await assert.rejects(a.exchangeCode('code','verifier',c,{fetch:async()=>Response.json({access_token:'a',refresh_token:'r',scope:c.scopes[0]})}),/email_missing_scopes/);const t=await a.exchangeCode('code','verifier',c,{fetch:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(new URLSearchParams(options.body).get('code_verifier'),'verifier');return Response.json({access_token:'a',refresh_token:'r',scope:c.scopes.join(' ')});}});assert.equal(t.refresh_token,'r');await assert.rejects(a.verifySender('a',c,{fetch:async()=>Response.json({emailAddress:'wrong@example.com'})}),/email_wrong_mailbox/);assert.equal(await a.verifySender('a',c,{fetch:async()=>Response.json({emailAddress:'IT@rocks-foods.com'})}),c.sender);const refreshed=await a.refreshAccessToken({refresh_token:'old'},c,{fetch:async()=>Response.json({access_token:'new'})});assert.equal(refreshed.refresh_token,'old');});

test('token endpoint reports allowlisted Google failures on both 400 and 401 without exposing response details',async()=>{
 const a=load(),c=a.readEmailConfig({GMAIL_CLIENT_SECRET:'test'});
 for(const [status,provider,want] of [[401,'invalid_client','email_client_invalid'],[400,'invalid_client','email_client_invalid'],[400,'invalid_grant','email_reconnect_required'],[400,'unauthorized_client','email_client_unauthorized'],[400,'redirect_uri_mismatch','email_redirect_mismatch'],[400,'invalid_request','email_token_request_invalid'],[503,'temporarily_unavailable','email_provider_unavailable'],[400,'secret-token','email_provider_error']]){
  await assert.rejects(a.exchangeCode('code','verifier',c,{fetch:async()=>Response.json({error:provider,error_description:'private client secret'},{status})}),e=>e.message===want);
 }
 await assert.rejects(a.exchangeCode('code','verifier',c,{fetch:async()=>{throw new DOMException('private network data','TimeoutError');}}),e=>e.message==='email_provider_timeout');
 await assert.rejects(a.exchangeCode('code','verifier',c,{fetch:async()=>new Response('private upstream failure',{status:502})}),e=>e.message==='email_provider_unavailable');
});
