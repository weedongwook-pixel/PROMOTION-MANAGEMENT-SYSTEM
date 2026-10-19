const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function form(initial){
  const saved=new Map(initial || []), nodes=new Map(), messages=[];
  function el(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',style:{},tagName:'SELECT',classList:{add(){},remove(){}},querySelectorAll(){return [];}});return nodes.get(id);}
  const c={Date,Math,URL,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},console:{log(){},warn(){},error(){}},
    location:{hostname:'localhost'},PC_REAL_PROMOS:[],
    document:{getElementById:el,addEventListener(){},querySelectorAll(){return [];}},
    localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k),key:i=>[...saved.keys()][i],get length(){return saved.size;}},
    Swal:{fire(...a){messages.push(a);return Promise.resolve({isConfirmed:a[0]?.title==='พบฉบับร่าง'});}}};
  c.window=c;vm.createContext(c);
  for(const file of ['js/mock-backend.js','js/code-counter.js','js/npd-excel-import.js','js/npd-redesign.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return {c,saved,el,messages};
}
function plan(){return {sheet:'Test NPD',start:'2026-11-16',end:'2027-01-16',errors:[],warnings:[],storeRules:[{type:'Ownership',values:[{label:'COCO',selected:true}]}],
  subsets:[{name:'New test subset',ssCode:'',powders:[{eng:'Test powder',th:'ผง',code:'3278',desc:'Mala',qty:'6.48',unit:'g',spoon:'2 spoons',seq:1,cmpos:''}]}],
  products:[{sourceName:'Full source name',name:'Enoki',th:'เห็ด',code:'',category:'Street Food',saleModes:['Take-Away'],prices:{'Take-Away':0},recipes:[{code:'3277',desc:'Enoki',qty:'70',unit:'g',channels:['Take-Away']}],formulas:[{ssCode:'',ssName:'New test subset',chooseMin:2,chooseMax:2}]}]};}

test('Excel fills the real NPD form and draft, without creating a submitted NPD record',()=>{
  const {c,saved,el}=form();
  assert.equal(typeof c.RD.importExcelPlan,'function');
  const before=c.PC_API.getNPDList().length;
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'Enoki test'});
  assert.equal(el('npProject').value,'Enoki test');assert.equal(el('npStart').value,'2026-11-16');
  c.RD.saveDraft();
  const d=JSON.parse(saved.get('pc_npd_draft'));
  assert.equal(c.RD.getExcelImportOptions().hasData,true,'a saved draft still counts as data when replacing the form');
  assert.equal(d.products[0].prices['Take-Away'],'0');
  assert.equal(d.products[0].formulas[0].subId,d.subsets[0].id);
  assert.equal(d.importSource.storesReviewed,false);
  assert.equal(c.PC_API.getNPDList().length,before);
});

test('imported form cannot submit with unreviewed stores and a failed second import preserves the first draft',()=>{
  const {c,saved,el,messages}=form();
  assert.equal(typeof c.RD.importExcelPlan,'function');
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'First draft'});
  c.RD.submit('new');
  assert.ok(messages.some(a=>String(a[0]?.text||a[1]||'').includes('สาขา')));
  c.RD.saveDraft();const first=JSON.parse(saved.get('pc_npd_draft'));
  assert.throws(()=>c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{},project:'Wrong'}));
  assert.equal(el('npProject').value,'First draft');
  c.RD.saveDraft();const last=JSON.parse(saved.get('pc_npd_draft'));
  assert.equal(first.subsets[0].ssCode,last.subsets[0].ssCode);
});

test('subset-only import appends groups without replacing products, project, original subsets or their formula links',()=>{
  const {c,saved,el}=form();
  assert.equal(typeof c.RD.importExcelSubsetPlan,'function');
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'Keep project'});
  c.RD.saveDraft();const before=JSON.parse(saved.get('pc_npd_draft'));
  const additional=plan();additional.subsets[0].name='Extra subset';additional.products=[];
  c.RD.importExcelSubsetPlan(additional,{fileName:'ss.xlsx'});
  const after=JSON.parse(saved.get('pc_npd_draft'));
  assert.equal(after.subsets.length,2);
  assert.deepEqual(after.products,before.products);
  assert.deepEqual(after.subsets[0],before.subsets[0]);
  assert.equal(el('npProject').value,'Keep project');
  assert.equal(after.importSource.sheet,before.importSource.sheet);
  assert.throws(()=>c.RD.importExcelSubsetPlan(additional),/มี.*แล้ว/);
  c.RD.saveDraft();assert.equal(JSON.parse(saved.get('pc_npd_draft')).subsets.length,2);
});

test('confirming an abbreviation already present in an imported powder name does not append it twice',()=>{
  const {c,saved}=form(),p=plan();p.subsets[0].powders[0].eng='Cheese ENF 1';p.products=[];
  c.RD.importExcelSubsetPlan(p);c.RD.saveDraft();
  const id=JSON.parse(saved.get('pc_npd_draft')).subsets[0].id;
  c.RD.setS(id,'name2','ENF 1');c.RD.applyN2(id);c.RD.saveDraft();
  assert.equal(JSON.parse(saved.get('pc_npd_draft')).subsets[0].powders[0].eng,'Cheese ENF 1');
  c.RD.setS(id,'name2','EF1');c.RD.applyN2(id);c.RD.saveDraft();
  assert.equal(JSON.parse(saved.get('pc_npd_draft')).subsets[0].powders[0].eng,'Cheese EF1');
});

test('adding subsets to a reopened saved draft updates that draft and retains its reserved codes',async()=>{
  const first=form();first.c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'Reopen draft'});
  first.c.RD.saveDraft();
  const reopened=form([...first.saved]);await Promise.resolve();
  assert.equal(reopened.el('npProject').value,'Reopen draft');
  const extra=plan();extra.subsets[0].name='Added after reopening';extra.products=[];
  reopened.c.RD.importExcelSubsetPlan(extra);
  const snapshot=JSON.parse(reopened.saved.get('pc_npd_draft'));
  assert.equal(snapshot.subsets.length,2);
  reopened.c.disposeNPD();
  assert.equal(reopened.c.PC_COUNTER.entryOf(snapshot.subsets[1].ssCode).status,'RESERVED');
});
