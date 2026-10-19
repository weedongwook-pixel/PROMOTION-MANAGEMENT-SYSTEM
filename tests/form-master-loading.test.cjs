const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/mock-backend.js','utf8');
test('master data and name lookups do not flush or wait for unrelated Cloud writes',async()=>{
  const begin=source.indexOf('  function makeRunner() {'),end=source.indexOf('  /* ==========================================================================',begin);
  let writes=0;const results=[];
  const c={API:{getMasterDataExtended:()=>({items:[{itemCode:'101001'}],branches:[]}),getExistingCampaignNames:()=>['Existing']},console,window:{__pageGen:1,PC_CLOUD:{enabled:()=>true,hasPending:()=>true,syncNow:()=>{writes++;return new Promise(()=>{});}}},setTimeout:fn=>queueMicrotask(fn)};
  vm.createContext(c);vm.runInContext(source.slice(begin,end),c);
  for(const name of ['getMasterDataExtended','getExistingCampaignNames'])c.makeRunner().withSuccessHandler(v=>results.push(v))[name]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes,0,'Read-only form initialization must never flush pending writes');
  assert.equal(results.length,2,'Both lookups must complete while an unrelated write is stalled');
});
function harness(){
  const nodes=[];const make=tag=>({tag,style:{},children:[],textContent:'',setAttribute(){},append(...list){this.children.push(...list);},replaceChildren(...list){this.children=list;},addEventListener(type,fn){this[type]=fn;}});
  const root=make('loading'),timers=new Map();let sequence=0;const calls=[];
  const c={window:{__pageGen:1,PC_LANG:'TH'},document:{getElementById:id=>id==='loadingStatus'?root:null,createElement:make},setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),console};
  c.window.google={script:{get run(){const runner={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},getMasterDataExtended(){calls.push(this);}};return runner;}}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('js/form-master-loader.js','utf8'),c);
  return {c,root,calls,timers};
}
test('timeout shows retry and stale response cannot initialize or duplicate a form',()=>{
  const {c,root,calls,timers}=harness();let initialized=0;
  c.window.PC_FormMaster.run().withSuccessHandler(()=>initialized++).getMasterDataExtended();
  assert.equal(calls.length,1);[...timers.values()][0]();
  assert.match(root.children.map(n=>n.textContent).join(' '),/โหลดข้อมูลสินค้า\/สาขาไม่สำเร็จ/);
  const retry=root.children.find(n=>n.tag==='button');assert.ok(retry);
  retry.click();assert.equal(calls.length,2);
  calls[0].ok({items:[{itemCode:'old'}],branches:[]});assert.equal(initialized,0);
  calls[1].ok({items:[{itemCode:'new'}],branches:[]});assert.equal(initialized,1);
  calls[1].ok({items:[{itemCode:'new'}],branches:[]});assert.equal(initialized,1);
});
test('invalid catalog and initialization errors show recovery; navigated-away callbacks are ignored',()=>{
  const {c,root,calls}=harness();let errors=0;
  c.window.PC_FormMaster.run().withFailureHandler(()=>errors++).withSuccessHandler(()=>{throw Error('bad setup');}).getMasterDataExtended();
  calls[0].ok({items:[],branches:[]});assert.equal(errors,1);assert.ok(root.children.some(n=>n.tag==='button'));
  root.children.find(n=>n.tag==='button').click();calls[1].ok({items:[{}],branches:[]});assert.equal(errors,2);
  root.children.find(n=>n.tag==='button').click();c.window.__pageGen++;
  calls[2].ok({items:[{}],branches:[]});assert.equal(errors,2);
});
