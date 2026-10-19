const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('email API auth rejects wrong cached account without changing website session',async()=>{
  const identity={tenantId:'tenant',objectId:'object'};
  const right={username:'right@example.com',idTokenClaims:{tid:'tenant',oid:'object'}};
  const wrong={username:'wrong@example.com',idTokenClaims:{tid:'tenant',oid:'other'}};
  const app={getAllAccounts:()=>[wrong],acquireTokenSilent:async()=>{throw Error('wrong cached account');},acquireTokenPopup:async()=>({account:wrong,accessToken:'wrong'})};
  const w={PC_EmailMsalContext:async()=>({app,email:right.username,identity})};
  vm.runInNewContext(fs.readFileSync('js/email-auth.js','utf8'),{window:w});
  const scope='api://22222222-2222-4222-8222-222222222222/access_as_user';
  await assert.rejects(w.PC_EmailAuth.acquireToken({scope,interactive:false}),/email_signin_required/);
  await assert.rejects(w.PC_EmailAuth.acquireToken({scope,interactive:true}),/email_wrong_staff_account/);
  app.getAllAccounts=()=>[right];app.acquireTokenSilent=async()=>({account:right,accessToken:'valid'});
  assert.equal(await w.PC_EmailAuth.acquireToken({scope,interactive:false}),'valid');
  await assert.rejects(w.PC_EmailAuth.acquireToken({scope:'User.Read',interactive:true}));
});
