const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud-store.js'), 'utf8');
const data = new Map();
let localWrites = 0;
const localStorage = {
  getItem(key) { return data.has(key) ? data.get(key) : null; },
  setItem(key, value) { localWrites++; data.set(key, String(value)); },
  removeItem(key) { data.delete(key); },
  key(index) { return [...data.keys()][index] || null; },
  get length() { return data.size; },
};
let mode = 'success';
let campaignBlock = null;
const submitted = { submissionId: 'submit-test-001', actor: 'MKT', expectedButtons: 1, writes: [] };
const receipt = { ok: true, submissionId: submitted.submissionId, savedButtons: 1, savedAt: 123, versions: {} };
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, headers: { get() { return null; } },
  async json() { return body; },
});
let cloudValue='[]', cloudVersion=2, duringPut=null;
async function fetchMock(url, options={}) {
 const route=new URL(url).pathname;
 if(route==='/promo/store')return response({ok:true,keys:{'promo::meta':'{}',pc_co_promotions:cloudValue},meta:{'promo::meta':1,pc_co_promotions:cloudVersion}});
 if(route==='/promo/store/pc_co_promotions'){
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);
   if(body.expectedUpdatedAt!==cloudVersion)return response({ok:false},409);
   cloudValue=body.value;cloudVersion++;if(duringPut)duringPut();
   return response({ok:true,updated_at:cloudVersion});
  }
  return response({ok:true,value:cloudValue,updated_at:cloudVersion});
 }
 throw Error('Unexpected '+route);
}
const sandbox = {
  localStorage, fetch: fetchMock, URL, Date, Math,
  console: { log() {}, warn() {}, error() {} },
  navigator: { onLine: true },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; },
  document: { readyState: 'loading', hidden: false, addEventListener() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

(async()=>{
 await sandbox.PC_CLOUD.pull();
 const value=JSON.stringify([{id:'COI-new',emailPending:true}]);
 await sandbox.PC_CLOUD.saveCoPromoRecords(value,cloudVersion);
 assert.equal(localStorage.getItem('pc_co_promotions'),value,'verified intake must hydrate ordinary edit source');
 assert.equal(sandbox.PC_CLOUD.hasPending(),false,'hydration must not enqueue duplicate write');
 const next=JSON.stringify([{id:'COI-new',emailPending:true},{id:'COI-second'}]);
 duringPut=()=>localStorage.setItem('pc_co_promotions','[{"id":"concurrent"}]');
 await assert.rejects(()=>sandbox.PC_CLOUD.saveCoPromoRecords(next,cloudVersion),/แก้ไขพร้อมกัน/);
 assert.equal(cloudValue,next,'concurrent local edit cannot replace committed cloud intake');
 assert.equal(localStorage.getItem('pc_co_promotions'),'[{"id":"concurrent"}]','do not discard concurrent local edits');
 await assert.rejects(()=>sandbox.PC_CLOUD.saveCoPromoRecords(next,cloudVersion),/ค้างซิงก์/);
 console.log('CoPromo verified save hydrates local mirror and guards concurrent edits: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
