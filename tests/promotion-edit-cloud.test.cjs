const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('edit client verifies durable receipt and keeps the same edit identity after a lost response',async()=>{
 const data=new Map();let writes=0,committed=null;
 const block={m:{'2026-11':[{campaign:'TOTO',shortName:'Fries',submittedBy:'Bow',itStatus:'PENDING',itemCode:'101003',qty:1,gross:95,netPrice:85}]},_ts:1};
 const response=(body,status=200)=>({ok:status===200,status,json:async()=>body,headers:{get:()=>null}});
 const c=vm.createContext({URL,console,navigator:{onLine:true},setTimeout(){return 1;},clearTimeout(){},setInterval(){},document:{readyState:'loading',addEventListener(){}},addEventListener(){},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}},fetch:async(url,opts={})=>{
  const p=new URL(url).pathname;if(p==='/promo/campaign-edits'){writes++;const b=JSON.parse(opts.body);committed={ok:true,kind:'CAMPAIGN_EDIT',submissionId:b.editId,editId:b.editId,savedAt:10,versions:{'promo::c::TOTO':2}};throw Error('response lost');}
  if(p.startsWith('/promo/submissions/'))return committed?response(committed):response({ok:false},404);
  if(p.endsWith('promo%3A%3Ac%3A%3ATOTO'))return response({ok:true,value:JSON.stringify(block),updated_at:1});
  if(p.endsWith('promo%3A%3Adeleted'))return response({ok:false},404);
  throw Error('Unexpected request '+p);
 }});c.window=c;
 vm.runInContext(fs.readFileSync('js/promotion-edit-model.js','utf8'),c);vm.runInContext(fs.readFileSync('js/cloud-store.js','utf8'),c);
 assert.equal(typeof c.PC_CLOUD.loadCampaignEdit,'function');
 const context=await c.PC_CLOUD.loadCampaignEdit('TOTO','2026-11','Bow');
 const result=await c.PC_CLOUD.saveCampaignEdit(context,context.form);assert.equal(result.kind,'CAMPAIGN_EDIT');assert.equal(writes,1);assert.equal(data.has('pc_mock_store_v28'),false);
});
