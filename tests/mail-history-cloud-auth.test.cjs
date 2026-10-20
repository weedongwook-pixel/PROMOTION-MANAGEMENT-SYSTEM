const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
test('shared mail history requires existing Cloud bearer authorization before any history read',async()=>{
 const c={URL,URLSearchParams,Request,Response,Headers,crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,AbortSignal};vm.createContext(c);
 vm.runInContext(require('./helpers/sync-worker-source.cjs')().replace('export default','globalThis.worker='),c);
 let reads=0;c.PC_Email.sharedMailHistory=async()=>{reads++;return {items:[{campaign:'UOB',status:'accepted'}]};};
 const env={SYNC_TOKEN:'test-private-sync-token'};
 for(const token of ['', 'wrong-token']){const response=await c.worker.fetch(new Request('https://sync.test/promo/mail-history',{headers:token?{Authorization:'Bearer '+token}:{}}),env);assert.equal(response.status,401);}
 assert.equal(reads,0);
 const response=await c.worker.fetch(new Request('https://sync.test/promo/mail-history',{headers:{Authorization:'Bearer test-private-sync-token'}}),env);
 assert.equal(response.status,200);assert.equal(reads,1);assert.equal((await response.json()).items[0].status,'accepted');
 const denied=await c.worker.fetch(new Request('https://sync.test/promo/mail-history',{headers:{Authorization:'Bearer test-private-sync-token'}}),{});assert.equal(denied.status,401);assert.equal(reads,1);
 const write=await c.worker.fetch(new Request('https://sync.test/promo/mail-history',{method:'POST',headers:{Authorization:'Bearer test-private-sync-token'}}),env);assert.notEqual(write.status,200);assert.equal(reads,1);
});
