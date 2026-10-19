const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(fetch){
  const row={campaign:'Cloud IT job',shortName:'Cloud button',month:'2026-11',itStatus:'PENDING',opStatus:'WAITING',itemCode:'101003',qty:1,gross:95};
  const initial={months:{},_npdSeeded:true,_flvSeeded:true,_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1,_billDiscVer:4,_proJulyVer:2,_vcCouponVer:2};
  const data=new Map([['pc_mock_store_v28',JSON.stringify(initial)]]);
  const c=vm.createContext({URL,console:{log(){},warn(){},error(){}},fetch,location:{hostname:'test.local',href:'http://test.local/'},navigator:{onLine:true},
    localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]||null,get length(){return data.size;}},
    document:{readyState:'loading',addEventListener(){}},addEventListener(){},setTimeout:(fn,ms)=>{if(ms<1000)queueMicrotask(fn);return 1;},clearTimeout(){},setInterval(){return 1;}});
  c.window=c;vm.runInContext(fs.readFileSync('js/mock-backend.js','utf8'),c);vm.runInContext(fs.readFileSync('js/cloud-store.js','utf8'),c);
  // Fresh-device disk: no previous snapshot needs an IndexedDB archive.
  data.delete('pc_mock_store_v28');
  const keys={'promo::meta':JSON.stringify(initial),'promo::c::Cloud%20IT%20job':JSON.stringify({m:{'2026-11':[row]},w:[],_ts:1})};
  const response=()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true,keys,meta:Object.fromEntries(Object.keys(keys).map(k=>[k,1]))})});
  const read=(name,arg='ALL')=>new Promise((resolve,reject)=>c.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[name](arg));
  return {c,response,read};
}
test('IT reads wait for in-flight Cloud hydration and never flush unrelated pending writes',async()=>{
  let release,gets=0;const pending=new Promise(r=>release=r);
  const {c,response,read}=setup(async(url,opts={})=>{assert.equal(opts.method||'GET','GET');gets++;await pending;return response();});
  c.localStorage.setItem('pc_itemset_comp','{}');
  const pull=c.PC_CLOUD.pull();let delivered=false;
  const tasks=read('getITTasks').then(v=>{delivered=true;return v;});
  // Attach rejection now so the old race is reported as a test assertion.
  const settled=tasks.then(value=>({value}),error=>({error}));
  await new Promise(r=>setImmediate(r));assert.equal(delivered,false);
  release();await pull;const result=await settled;assert.equal(result.error,undefined);
  assert.equal(result.value.length,1);assert.equal(result.value[0].campaign,'Cloud IT job');assert.equal(gets,1);
});
test('concurrent first IT reads retry a transient failed Cloud load without returning stale empty rows',async()=>{
  let attempts=0;const {c,response,read}=setup(async url=>{
    const p=new URL(url).pathname;if(p==='/promo/store'){attempts++;if(attempts===1)throw Error('temporary offline');return response();}
    throw Error('temporary offline');
  });
  const [tasks,summary]=await Promise.all([read('getITTasks'),read('getITWorkSummary')]);
  assert.equal(tasks.length,1);assert.equal(summary.totalPending,1);assert.equal(attempts,2);assert.equal(c.PC_CLOUD.ready(),true);
});
test('persistent Cloud outage rejects IT reads instead of presenting cached work as current',async()=>{
  const {read}=setup(async()=>{throw Error('offline');});
  await assert.rejects(read('getITTasks'),/offline|Cloud/);
});
for(const name of ['getAllCampaignData','getPromoDetails']){
  test(name+' waits for Cloud and does not flush unrelated pending writes',async()=>{
    let release;const pending=new Promise(r=>release=r);
    const {c,response,read}=setup(async(url,opts={})=>{assert.equal(opts.method||'GET','GET');await pending;return response();});
    c.localStorage.setItem('pc_itemset_comp','{}');
    const pull=c.PC_CLOUD.pull();let delivered=false;
    const result=read(name,name==='getPromoDetails'?'Cloud IT job':'ALL').then(value=>{delivered=true;return {value};},error=>({error}));
    await new Promise(r=>setImmediate(r));assert.equal(delivered,false,'must not deliver stale data before Cloud hydration');
    release();await pull;const outcome=await result;assert.equal(outcome.error,undefined);
    if(name==='getAllCampaignData'){assert.equal(outcome.value.length,1);assert.equal(outcome.value[0].campaign,'Cloud IT job');}
    else {assert.equal(outcome.value.status,'success');assert.equal(outcome.value.items[0].itemCode,'101003');}
  });
}
test('Tracking outage is reported as a read failure, not an empty successful table',async()=>{
  const {read}=setup(async()=>{throw Error('offline');});
  await assert.rejects(read('getAllCampaignData'),/offline|Cloud/);
});
