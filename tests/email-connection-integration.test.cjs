const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('frontend proxies only email to its configured backend binding without adding credentials',async()=>{
  let forwarded;const c={URL,Request,Response,fetch:async()=>{throw Error('public fetch must not choose an upstream');}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('src/worker.js','utf8').replace('export default','globalThis.worker='),c);
  const env={ASSETS:{fetch:async()=>new Response('asset')},EMAIL_BACKEND:{fetch:async r=>{forwarded=r;return new Response('email',{headers:{'Set-Cookie':'session=test'}});}}};
  assert.equal(await (await c.worker.fetch(new Request('https://frontend.test/ordinary'),env)).text(),'asset');
  const r=await c.worker.fetch(new Request('https://frontend.test/email/capabilities?upstream=https://evil.test',{headers:{Authorization:'Bearer explicit',Cookie:'session=test',Origin:'https://frontend.test'}}),env);
  assert.equal(new URL(forwarded.url).origin,'https://frontend.test');assert.equal(forwarded.headers.get('Authorization'),'Bearer explicit');assert.equal(r.headers.get('Set-Cookie'),'session=test');
  await c.worker.fetch(new Request('https://frontend.test/email/status'),env);assert.equal(forwarded.headers.get('Authorization'),null);
});
test('sync email capability bypasses legacy shared auth but not email admin auth',async()=>{const {webcrypto}=require('node:crypto');const c={URL,Request,Response,Headers,crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,AbortSignal};vm.createContext(c);vm.runInContext(require('./helpers/sync-worker-source.cjs')().replace('export default','globalThis.worker='),c);const response=await c.worker.fetch(new Request('https://sync.test/email/capabilities'),{});assert.equal(response.status,200);assert.equal((await response.json()).sendingEnabled,false);});
