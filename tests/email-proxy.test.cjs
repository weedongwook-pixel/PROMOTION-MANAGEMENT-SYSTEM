const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker(){const c={URL,Request,Response,fetch:async()=>new Response('same-zone public fetch unavailable',{status:404})};vm.createContext(c);vm.runInContext(fs.readFileSync('src/worker.js','utf8').replace('export default','globalThis.worker='),c);return c.worker;}
test('same-origin email endpoints use a service binding and preserve the authenticated request',async()=>{
  const front=worker();let forwarded;
  const result=await front.fetch(new Request('https://site.test/email/copro/preview',{method:'POST',headers:{Authorization:'Bearer test-only',Origin:'https://site.test',Cookie:'session=test-only','Content-Type':'application/json'},body:'{"test":true}'}),{
    EMAIL_BACKEND:{async fetch(request){forwarded=request;return Response.json({received:JSON.parse(await request.text())});}},ASSETS:{fetch:()=>{throw Error('email must not use assets');}}
  });
  assert.equal(result.status,200);assert.equal(forwarded.headers.get('Authorization'),'Bearer test-only');assert.equal(forwarded.headers.get('Origin'),'https://site.test');assert.equal(forwarded.headers.get('Cookie'),'session=test-only');assert.equal(new URL(forwarded.url).pathname,'/email/copro/preview');assert.deepEqual(await result.json(),{received:{test:true}});
});
test('missing backend binding returns a controlled no-store error; ordinary assets stay unchanged',async()=>{
  const front=worker(),env={ASSETS:{fetch:async()=>new Response('ordinary asset')}};
  const missing=await front.fetch(new Request('https://site.test/email/capabilities'),env);assert.equal(missing.status,503);assert.match(missing.headers.get('cache-control'),/no-store/);assert.equal((await missing.json()).error,'email_backend_unavailable');
  assert.equal(await (await front.fetch(new Request('https://site.test/'),env)).text(),'ordinary asset');
});
