const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('service worker never caches email callbacks or authenticated email responses',()=>{
  const handlers={};const c={self:{addEventListener:(type,fn)=>handlers[type]=fn},URL,location:{origin:'https://site.test'},fetch:async()=>new Response('test'),caches:{open:async()=>({put:async()=>{}}),match:async()=>undefined}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),c);
  for(const path of ['/email/status','/email/capabilities','/email/gmail/callback?code=private']) {
    let intercepted=false;
    handlers.fetch({request:new Request('https://site.test'+path),respondWith(){intercepted=true;}});
    assert.equal(intercepted,false,'Email must bypass offline cache: '+path);
  }
});
