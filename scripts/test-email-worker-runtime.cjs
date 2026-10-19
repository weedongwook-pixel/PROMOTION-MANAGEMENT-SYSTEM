// Exercise real workerd Request/fetch semantics. All provider traffic stays in the stub.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE||'miniflare');
const source=['config','storage','oauth','templates','gmail'].map(n=>fs.readFileSync(`sync-worker/email/${n}.js`,'utf8')).join('\n');
let redirect=false,requests=0;
const script=source+`
export default {async fetch(){
 const a=globalThis.PC_Email,c=a.readEmailConfig({GMAIL_CLIENT_SECRET:'fake'}),result={};
 const run=async(name,fn)=>{try{result[name]=await fn();}catch(e){result[name]={error:e.message};}};
 await run('exchange',()=>a.exchangeCode('fake-code','fake-verifier',c));
 await run('refresh',()=>a.refreshAccessToken({refresh_token:'fake-refresh'},c));
 await run('profile',()=>a.verifySender('fake-access',c));
 await run('list',()=>a.gmailGet('messages?q=test','fake-access'));
 await run('send',()=>a.sendReply('fake-access',{threadId:'t',rfcMessageId:'<o@example.com>',subject:'Test',recipients:{to:['test@example.net'],cc:[]},milestone:'submitted',details:{campaign:'Test',buttons:[]}}));
 return Response.json(result);
}}`;
(async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-07-02',script,outboundService:async request=>{
  requests++;
  const u=new URL(request.url);assert.ok(['oauth2.googleapis.com','gmail.googleapis.com'].includes(u.hostname),'must never follow redirects');
  if(redirect)return new Response(null,{status:302,headers:{Location:'https://redirect-must-not-be-followed.invalid/'}});
  if(u.pathname==='/token')return Response.json({access_token:'fake-access',refresh_token:'fake-refresh',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'});
  if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'it@rocks-foods.com'});
  if(u.pathname.endsWith('/send'))return Response.json({id:'fake-sent'});
  return Response.json({messages:[]});
 }}));
 try{
  const r=await (await mf.dispatchFetch('http://localhost/')).json();
  assert.equal(r.exchange.access_token,'fake-access',JSON.stringify(r));
  assert.equal(r.refresh.access_token,'fake-access');assert.equal(r.profile,'it@rocks-foods.com');assert.deepEqual(r.list,{messages:[]});assert.equal(r.send.outcome,'accepted');assert.equal(requests,5);
  redirect=true;requests=0;
  const rejected=await (await mf.dispatchFetch('http://localhost/')).json();
  for(const key of ['exchange','refresh','profile','list'])assert.equal(rejected[key].error,'email_provider_error');
  assert.equal(rejected.send.outcome,'rejected');assert.equal(requests,5);
  console.log('PASS: real workerd exchange, refresh, profile, list and send; redirects rejected, no external mail sent');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
