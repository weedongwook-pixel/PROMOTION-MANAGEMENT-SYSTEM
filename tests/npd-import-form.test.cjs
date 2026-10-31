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

test('Excel branch conditions never block submit and a failed second import preserves the first draft',()=>{
  const {c,saved,el,messages}=form();
  assert.equal(typeof c.RD.importExcelPlan,'function');
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'First draft'});
  c.RD.submit('new');
  assert.ok(!messages.some(a=>String(a[0]?.text||a[1]||'').includes('เงื่อนไขสาขาจาก Excel')));
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

test('imported mandatory flavors receive and replace the Subset abbreviation without duplication',()=>{
  const {c,saved}=form(),p=plan();p.products=[];
  c.RD.importExcelSubsetPlan(p);c.RD.saveDraft();
  const first=JSON.parse(saved.get('pc_npd_draft')).subsets[0];
  const ids=first.powders.map(w=>w.cmpos);
  assert.equal(new Set(ids).size,3);
  for(const abbr of ['FF1','FF1','FF2']){
    c.RD.setS(first.id,'name2',abbr);c.RD.applyN2(first.id);c.RD.saveDraft();
    const s=JSON.parse(saved.get('pc_npd_draft')).subsets[0];
    assert.equal(s.powders.length,3);
    assert.ok(s.powders.some(w=>w.eng==='Truffle 2 '+abbr && w.th==='Truffle 2 '+abbr));
    assert.ok(s.powders.some(w=>w.eng==='No flavor '+abbr && w.noFlavor));
    assert.deepEqual(s.powders.map(w=>w.cmpos),ids);
  }
});

test('guided append preserves manual work, shared subset codes and mixed categories',()=>{
  const {c,saved}=form();
  const opts={category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},project:'Shared project'};
  c.RD.importExcelPlan(plan(),opts);c.RD.saveDraft();
  const before=JSON.parse(saved.get('pc_npd_draft'));
  const next=plan();next.products[0].sourceName='Other product';next.products[0].name='Other product';
  c.RD.importExcelPlan(next,{...opts,append:true});c.RD.saveDraft();
  const after=JSON.parse(saved.get('pc_npd_draft'));
  assert.equal(after.products.length,2);assert.equal(after.subsets.length,1);
  assert.deepEqual(after.subsets[0].powders.map(w=>w.cmpos),before.subsets[0].powders.map(w=>w.cmpos));
  assert.equal(after.products[1].formulas[0].subId,after.subsets[0].id);
  const cat=c.RD.getExcelImportOptions().categories.find(x=>x.code!=='110');
  c.RD.setProductCategory(after.products[1].id,cat.code);
  const payload=c.RD.workflowPayload();
  assert.equal(payload.items[0].cateCode,'110');assert.equal(payload.items[1].cateCode,cat.code);
  assert.equal(payload.items[0].code,before.products[0].code);
});

test('workflow step and powder library persist in the same draft',()=>{
  const {c,saved}=form();
  c.RD.addWorkPowder({eng:'Mala',code:'3278',desc:'Mala powder',unit:'g'});
  c.RD.setWorkflowStep(2);c.RD.saveDraft();
  const d=JSON.parse(saved.get('pc_npd_draft'));
  assert.equal(d.workflow.step,2);assert.equal(d.workPowders[0].code,'3278');
});

test('flavor import reuses matching pending subset recipes and rolls back conflicts',()=>{
  const {c}=form();const g={sheet:'mala flavor',errors:[],subsets:[{name:'New Enoki',ssCode:'',powders:[{eng:'Mala ENF 1',code:'3278',desc:'Mala',qty:'6.48',unit:'g',spoon:'2 spoons'}]}]};
  assert.equal(c.RD.importWorkFlavors(g),1);const first=c.RD.workflowSnapshot();
  assert.equal(c.RD.importWorkFlavors(g),0);
  const mala=x=>x.subsets[0].powders.find(w=>w.eng==='Mala ENF 1');
  assert.equal(mala(c.RD.workflowSnapshot()).cmpos,mala(first).cmpos);
  assert.deepEqual([...first.subsets[0].powders.map(w=>w.seq+' '+w.eng)],['6 Truffle 2','9 Mala ENF 1','99999 No flavor'],'standard order: new powders from 9');
  const bad=JSON.parse(JSON.stringify(g));bad.subsets[0].powders[0].qty='9.72';
  assert.throws(()=>c.RD.importWorkFlavors(bad),/สูตรต่างกัน/);
  assert.equal(mala(c.RD.workflowSnapshot()).qty,'6.48');
});

test('per-import store confirmation remains separate for mixed-category product groups',()=>{
  const {c}=form(),o={category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},append:true};
  c.RD.importExcelPlan(plan(),o);const a=c.RD.workflowSnapshot().products[0];
  c.RD.reviewProductStores(a.importGroup);
  const b=plan();b.products[0].name='Next';b.products[0].sourceName='Next';c.RD.importExcelPlan(b,o);
  const d=c.RD.workflowSnapshot();assert.equal(d.products[0].storesReviewed,true);assert.equal(d.products[1].storesReviewed,false);
});

test('NPD may add new powder codes to a verified existing subset without creating a second subset',()=>{
  const {c}=form();c.PC_SUBSET_MASTER=[{ssCode:'SS0998',name:'Existing flavor group',short:'EF',status:'Active'}];
  const original={project:'old',items:[],subsets:[{ssCode:'SS0998',name:'Existing flavor group',powders:[{eng:'Cheese EF',cmpos:'1038001'}]}]};
  assert.equal(c.PC_API.submitNPD(original,'old-group-test').status,'success');
  const addition={project:'new',items:[],subsets:[{existing:true,ssCode:'SS0998',name:'Existing flavor group',powders:[{eng:'Mala EF',cmpos:'1038002'}]}]};
  assert.equal(c.PC_API.submitNPD(addition,'new-group-test').status,'success');
  addition.subsets[0].ssCode='SS9999';
  assert.notEqual(c.PC_API.submitNPD(addition,'bad-group-test').status,'success');
});

test('append retains partially entered products with only channel or price data',()=>{
  const {c}=form();const first=c.RD.workflowSnapshot().products[0];c.RD.setP(first.id,'priceTakeaway','25');
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},append:true});
  assert.ok(c.RD.workflowSnapshot().products.some(p=>p.id===first.id && p.priceTakeaway==='25'));
});

test('flavor-only import completes mandatory choices and keeps supplied POS sequence',()=>{
  const {c}=form();c.PC_SUBSET_MASTER=[{ssCode:'SS0998',name:'Old',short:'OLD'}];
  c.RD.importWorkFlavors({errors:[],subsets:[{ssCode:'SS0998',name:'Old',powders:[{eng:'Mala OLD',seq:12,code:'3278',desc:'Mala',qty:'2',unit:'g'}]},{ssCode:'',name:'New',powders:[{eng:'Mala ENF 1',seq:9,code:'3278',desc:'Mala',qty:'2',unit:'g'},{eng:'No flavor',noFlavor:true,seq:99}]}]});
  const d=c.RD.workflowSnapshot();assert.equal(d.subsets[0].powders[0].seq,12);
  assert.ok(d.subsets[1].powders.some(w=>w.eng==='Truffle 2'));
  assert.equal(d.subsets[1].powders.filter(w=>w.noFlavor).length,1);
  assert.equal(d.workPowders.some(w=>w.eng==='No flavor'),false);
});

test('subset recipe import fills generated standard placeholders while preserving their codes',()=>{
  const {c}=form();c.RD.importWorkFlavors({errors:[],subsets:[{name:'New subset',powders:[{eng:'Mala',code:'3278',desc:'Mala',qty:'2',unit:'g'}]}]});
  const before=c.RD.workflowSnapshot().subsets[0], truffle=before.powders.find(w=>w.eng==='Truffle 2');
  c.RD.importExcelSubsetPlan({errors:[],subsets:[{name:'New subset',powders:[{eng:'Truffle 2 FF1',code:'3024',desc:'Truffle',qty:'2.16',unit:'g',spoon:'1 spoon'}]}]},{mergeExisting:true});
  const after=c.RD.workflowSnapshot().subsets[0].powders.find(w=>w.cmpos===truffle.cmpos);
  // Units and spoon sizes follow the page language (Thai by default), whatever the file used.
  assert.equal(after.qty,'2.16');assert.equal(after.spoon,'1 ช้อน');assert.equal(after.unit,'กรัม');
});
test('units switch with the TH / EN language toggle',()=>{
  const {c}=form();c.RD.importWorkFlavors({errors:[],subsets:[{name:'New subset',powders:[{eng:'Mala',code:'3278',desc:'Mala',qty:'2',unit:'Grams'},{eng:'Bag',code:'1',desc:'Bag',qty:'1',unit:'Pcs.'}]}]});
  const units=()=>c.RD.workflowSnapshot().subsets[0].powders.filter(w=>/Mala|Bag/.test(w.eng)).map(w=>w.unit).join(',');
  assert.equal(units(),'กรัม,ชิ้น');
  c.PC_LANG='EN';c.RD.importWorkFlavors({errors:[],subsets:[]});
  assert.equal(units(),'g,pcs');
});

test('failed append render releases only newly allocated codes, never restored shared codes',()=>{
  const {c,el}=form(),o={category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'}};
  c.RD.importExcelPlan(plan(),o);const before=c.RD.workflowSnapshot();
  const next=plan();next.products[0].sourceName='Different';next.products[0].name='Different';
  Object.defineProperty(el('productList'),'innerHTML',{set(){throw Error('render failure');},get(){return '';},configurable:true});
  assert.throws(()=>c.RD.importExcelPlan(next,{...o,append:true}),/render failure/);
  for(const s of before.subsets){assert.equal(c.PC_COUNTER.entryOf(s.ssCode).status,'RESERVED');for(const w of s.powders)assert.equal(c.PC_COUNTER.entryOf(w.cmpos).status,'RESERVED');}
});

test('appending after manual entry adopts sheet dates while only the suggested dates are set',()=>{
  const {c,el}=form();const first=c.RD.workflowSnapshot().products[0];c.RD.setP(first.id,'name','Manual item');
  const o={category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},append:true};
  c.RD.importExcelPlan(plan(),o);
  assert.equal(el('npStart').value,'2026-11-16');assert.equal(c.RD.workflowSnapshot().products[0].name,'Manual item');
  const other=plan();other.start='2026-12-01';other.products[0].name=other.products[0].sourceName='Other dates';
  assert.throws(()=>c.RD.importExcelPlan(other,o),/ช่วงวันที่/);
});

test('attaching a library powder matches an imported flavor despite its size suffix',()=>{
  const {c}=form();
  c.RD.importWorkFlavors({sheet:'mala flavor',errors:[],subsets:[{name:'New Enoki',ssCode:'',powders:[{eng:'Cheese ENF 1',code:'3097',desc:'Cheese',qty:'1.91',unit:'g'}]}]});
  const sub=c.RD.workflowSnapshot().subsets[0],count=sub.powders.length,cheese=sub.powders.find(w=>w.eng==='Cheese ENF 1');
  const lib=c.RD.addWorkPowder({eng:'Cheese',code:'3010',desc:'Other cheese'});
  assert.throws(()=>c.RD.attachWorkPowder(lib,sub.id,{qty:'5'}),/สูตรต่างกัน/);
  const same=c.RD.addWorkPowder({eng:'Cheese',code:'3097',desc:'Cheese'});
  assert.equal(c.RD.attachWorkPowder(same,sub.id,{qty:'1.91'}),cheese.id);
  assert.equal(c.RD.workflowSnapshot().subsets[0].powders.length,count);
});

test('review issues match submit rules for recipe rows, powder name length and duplicate abbreviations',()=>{
  const {c}=form();const p=c.RD.workflowSnapshot().products[0];
  const msgs=()=>c.RD.workflowIssues().map(x=>x.message).join('\n');
  assert.doesNotMatch(msgs(),/Recipe RM/,'a new row holding only the default unit is not a recipe');
  assert.equal(c.RD.workflowPayload().items[0].recipes.length,0);
  c.RD.setR(p.id,0,'code','3277');assert.match(msgs(),/Recipe RM แถว 1/);
  c.RD.importWorkFlavors({sheet:'f',errors:[],subsets:[{name:'Group A',ssCode:'',powders:[{eng:'Spicy Mala Extra ENF1',code:'3024',desc:'Truffle',qty:'1',unit:'g'}]},{name:'Group B',ssCode:'',powders:[{eng:'Mala',code:'3278',desc:'Mala',qty:'1',unit:'g'}]}]});
  const subs=c.RD.workflowSnapshot().subsets;subs.forEach(s=>c.RD.setS(s.id,'name2','AB'));
  assert.match(msgs(),/ยาว 21\/20/);assert.match(msgs(),/ตัวย่อ SUBSET AB ซ้ำ/);
});

test('existing SUBSETs that already share an abbreviation in the system are not flagged; a new one that copies it is',()=>{
  const {c}=form();c.PC_SUBSET_MASTER=[{ssCode:'SS0096',name:'Flavored Crispy Fried Squid 1',short:'Flavored CFS'},{ssCode:'SS0097',name:'Flavored Crispy Fried Squid 2',short:'Flavored CFS'}];
  c.RD.importWorkFlavors({errors:[],subsets:[{ssCode:'SS0096',name:'Flavored Crispy Fried Squid 1',powders:[{eng:'Mala CSF 1',seq:16,code:'3278',desc:'Mala',qty:'2',unit:'g'}]},{ssCode:'SS0097',name:'Flavored Crispy Fried Squid 2',powders:[{eng:'Mala CSF 2',seq:17,code:'3278',desc:'Mala',qty:'3',unit:'g'}]},{ssCode:'',name:'New',powders:[{eng:'Mala N',code:'3278',desc:'Mala',qty:'2',unit:'g'}]}]});
  const msgs=()=>c.RD.workflowIssues().map(x=>x.message).join('\n');
  const d=c.RD.workflowSnapshot();assert.equal(d.subsets.filter(s=>s.existing&&s.name2==='Flavored CFS').length,2);
  assert.doesNotMatch(msgs(),/ซ้ำ/);
  c.RD.setS(d.subsets.find(s=>!s.existing).id,'name2','Flavored CFS');
  assert.match(msgs(),/ตัวย่อ SUBSET Flavored CFS ซ้ำ/);
});

test('review fixes: distinct sizes stay separate, untouched subsets keep edits, and chosen dates are guarded',()=>{
  let {c}=form();
  const g={sheet:'f',errors:[],subsets:[{name:'Sizes',ssCode:'',powders:[{eng:'Mala ENF 1',code:'3278',desc:'Mala',qty:'6.48',unit:'g'},{eng:'Mala ENF 2',code:'3278',desc:'Mala',qty:'9.72',unit:'g'},{eng:'Cheese',code:'3097',desc:'Cheese',qty:'1',unit:'g'},{eng:'Cheese CS',code:'3097',desc:'Cheese',qty:'1',unit:'g'}]}]};
  c.RD.importWorkFlavors(g);
  const names=c.RD.workflowSnapshot().subsets[0].powders.map(w=>w.eng);
  for(const n of ['Mala ENF 1','Mala ENF 2','Cheese','Cheese CS'])assert.ok(names.includes(n),n);
  // A hand-made subset whose standard rows were removed is not refilled by an unrelated import.
  c.RD.addS();const own=c.RD.workflowSnapshot().subsets.at(-1);
  own.powders.forEach(w=>c.RD.delW(own.id,w.id));
  c.RD.importWorkFlavors({sheet:'f',errors:[],subsets:[{name:'Other',ssCode:'',powders:[{eng:'BBQ',code:'3128',desc:'BBQ',qty:'1',unit:'g'}]}]});
  assert.equal(c.RD.workflowSnapshot().subsets.find(s=>s.id===own.id).powders.length,0);
  // The first product sheet sets the job period and reports the change; a later sheet with another period is refused.
  ({c}=form());c.RD.setWorkflowChoice('datesChosen',true);
  const opts={category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},append:true};
  const first=c.RD.importExcelPlan(plan(),opts);
  assert.ok(first.datesChanged);assert.equal(first.datesChanged.to.start,plan().start);
  const other=plan();other.products.forEach(p=>{p.sourceName+=' B';p.name+=' B';});other.start='2027-02-01';other.end='2027-03-01';
  assert.throws(()=>c.RD.importExcelPlan(other,opts),/ช่วงวันที่ของชีตนี้/);
});

test('a category added in a draft stays selectable after reopening and its code is not reissued',async()=>{
  const first=form();const p=first.c.RD.workflowSnapshot().products[0];
  first.c.RD.setP(p.id,'name','Wrap A');
  const draft=JSON.parse(JSON.stringify(first.c.RD.workflowSnapshot()));
  Object.assign(draft,{category:'Wrap Test',cateCode:'116',dept:'100'});Object.assign(draft.products[0],{category:'Wrap Test',cateCode:'116',code:'116001'});
  first.saved.set('pc_npd_draft',JSON.stringify(draft));
  const reopened=form([...first.saved]);await Promise.resolve();
  assert.ok(reopened.c.RD.workflowCategories().some(c=>c.code==='116'&&c.name==='Wrap Test'));
  assert.equal(reopened.c.RD.workflowSnapshot().products[0].cateCode,'116');
});

test('powder names use single spaces and Truffle +THB10 is "Truffle 1 <abbr>" in TH',()=>{
  const {c}=form();
  c.RD.importWorkFlavors({sheet:'f',errors:[],subsets:[{name:'Group',ssCode:'',powders:[{eng:'Truffle +THB10  ENF 1',th:'Truffle +THB10  ENF 1',code:'3024',desc:'T',qty:'1',unit:'g'},{eng:'Mala  ENF 1',code:'3278',desc:'M',qty:'1',unit:'g'}]}]});
  const s=c.RD.workflowSnapshot().subsets[0],t=s.powders.find(x=>/^Truffle \+/.test(x.eng));
  assert.equal(t.eng,'Truffle +THB10 ENF 1');assert.equal(t.th,'Truffle 1 ENF 1');
  assert.ok(s.powders.some(x=>x.eng==='Mala ENF 1'));
  assert.ok(!c.RD.workflowIssues().some(x=>/ยาว/.test(x.message)));
  // EN may run past 20 (kitchen bill); TH over 20 blocks submit.
  c.RD.setW(s.id,t.id,'eng','Truffle +THB10 Extra ENF 1');c.RD.setW(s.id,t.id,'th','Truffle 1 Extra Long ENF 1');
  const long=c.RD.workflowIssues().filter(x=>/ยาว/.test(x.message));
  assert.equal(long.length,1);assert.ok(long[0].message.includes(' TH '));assert.equal(long[0].warn,false);
  // Typing the abbreviation with extra spaces still gives one space.
  const mala=s.powders.find(x=>x.eng==='Mala ENF 1');c.RD.setW(s.id,mala.id,'eng','Mala');
  c.RD.setW(s.id,t.id,'eng','Truffle +THB10');c.RD.setW(s.id,t.id,'th','Truffle 1');
  c.RD.setS(s.id,'name2','FF  1');c.RD.applyN2(s.id);
  const after=c.RD.workflowSnapshot().subsets[0];assert.equal(after.name2,'FF 1');
  assert.ok(after.powders.some(x=>x.eng==='Mala FF 1'));assert.ok(after.powders.some(x=>x.th==='Truffle 1 FF 1'));
});
test('the powder POS name follows the English name until it is edited separately',()=>{
  const {c}=form();
  c.RD.importWorkFlavors({sheet:'f',errors:[],subsets:[{name:'Group',ssCode:'',powders:[{eng:'Mala ENF 1',th:'Mala ENF 1',code:'3278',desc:'M',qty:'1',unit:'g'}]}]});
  let s=c.RD.workflowSnapshot().subsets[0],w=s.powders.find(x=>/Mala/.test(x.eng));
  c.RD.setW(s.id,w.id,'eng','Mala Hot ENF 1');
  w=c.RD.workflowSnapshot().subsets[0].powders.find(x=>x.id===w.id);assert.equal(w.th,'Mala Hot ENF 1');
  c.RD.setW(s.id,w.id,'th','ทรัฟเฟิล');c.RD.setW(s.id,w.id,'eng','Truffle Plus');
  w=c.RD.workflowSnapshot().subsets[0].powders.find(x=>x.id===w.id);assert.equal(w.th,'ทรัฟเฟิล');
});

test('a blank starting row that only has a category and code is replaced by the import and its code released',()=>{
  const {c}=form();const blank=c.RD.workflowSnapshot().products[0];
  c.RD.setProductCategory(blank.id,'110');const code=c.RD.workflowSnapshot().products[0].code;assert.ok(code);
  c.RD.importExcelPlan(plan(),{category:{code:'110',name:'Small Bites'},channelMap:{'Take-Away':'Take-Away'},append:true});
  const d=c.RD.workflowSnapshot();
  assert.ok(d.products.every(p=>p.importGroup),'no empty row before the imported products');
  assert.ok(!d.products.some(p=>p.id===blank.id));
});
