const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('expired staff session requests employee login instead of reconnecting Google',async()=>{
 const calls=[];const w={};const c={window:w,AbortSignal,fetch:async path=>{calls.push(path);return path==='/email/capabilities'?Response.json({staffEnabled:true}):Response.json({error:'email_staff_signin_required'},{status:401});}};vm.runInNewContext(fs.readFileSync('js/email-auth.js','utf8'),c);
 w.PC_EmailAuth.signInStaff=async()=>({staff:{id:'employee'}});w.PC_EmailAuth.connectHere=async()=>{throw Error('must not connect Google');};
 assert.equal((await w.PC_EmailAuth.ownerSession({interactive:true})).staff.id,'employee');assert.deepEqual(calls,['/email/auth/session','/email/capabilities']);
});
test('website logout clears both employee session and owner session',async()=>{
 const calls=[],w={};const c={window:w,AbortSignal,fetch:async path=>{calls.push(path);return Response.json({});}};vm.runInNewContext(fs.readFileSync('js/email-auth.js','utf8'),c);await w.PC_EmailAuth.logout();assert.deepEqual(calls,['/email/staff/logout','/email/auth/logout']);
});
