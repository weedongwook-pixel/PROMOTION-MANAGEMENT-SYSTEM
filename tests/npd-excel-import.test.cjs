const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../vendor/sheetjs/xlsx.full.min.js');
const fs = require('node:fs');
const vm = require('node:vm');
const importer = fs.existsSync(require('node:path').join(__dirname, '../js/npd-excel-import.js'))
  ? require('../js/npd-excel-import.js') : {};

// Breaks caught: duplicate TA/Delivery products, SS leaking into RM, using the
// common placeholder as a group key, and losing delivery-only packaging.
function sample() {
  const wb = XLSX.utils.book_new();
  const product = [];
  function block(channel, name, pos, price, formula, qty, extra) {
    product.push(['Period', '16 Nov 26 - 16 Jan 27'], ['Channels', 'Take-Away', 'Grab'],
      ['', channel === 'TA' ? 'Yes' : 'No', channel === 'TA' ? 'No' : 'Yes'],
      ['Store Type', 'Permanent', 'Food Truck'], ['', 'Yes', 'No'],
      ['', 'COCO', 'DODO-A'], ['', 'Yes', 'No'],
      ['Item Name', 'Item Name', 'POS Name', 'TH', 'Code', '', 'Product Category', 'Selling Price'],
      ['', name, pos, 'ชื่อไทย', '', '', 'Street Food', price], ['Recipe Details'],
      ['', 'NO', 'Item Code', 'Description', 'Quantity', 'Unit'],
      ['', 1, 3277, 'Enoki', 70, 'g'], ['', 2, 'SSxxxx', formula, qty, 'สูตร']);
    if (extra) product.push(['', 3, 4067, 'Delivery bag', 1, 'pcs']);
  }
  block('TA', 'Large Crispy Enoki', 'Large Enoki', 59, 'Flavored Enoki Fries 1', 1);
  block('TA', 'Jumbo Crispy Enoki', 'Jumbo Enoki', 75, 'Flavored Enoki Fries 2', 1);
  block('DLV', 'Large Crispy Enoki', 'Large Enoki', 69, 'Flavored Enoki Fries 1', 1, true);
  block('DLV', 'Jumbo Crispy Enoki', 'Jumbo Enoki', 85, 'Flavored Enoki Fries 2', 1, true);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(product), 'Tem1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Item Name (CMPOS)', '', 'Recipe Details'], ['Code', 'Product Category', 'NO', 'CMPOS CODE', 'ENG', 'Item Code', 'Description', 'Quantity', 'Unit', 'Spoon Size'],
    ['', 'Flavored Enoki Fries 1', 1, '', 'Mala ENF 1', '\t3278', 'Mala', 6.48, 'g', '2 spoons'],
    ['', 'Flavored Enoki Fries 2', 1, '', 'Mala ENF 2', 3278, 'Mala', 9.72, 'g', '3 spoons']
  ]), 'ss');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Code', 'Product Category', 'NO', 'CMPOS CODE', 'ENG', 'Item Code', 'Description', 'Quantity', 'Unit', 'Spoon Size'],
    ['', 'Flavored Enoki Fries 1', 1, '', 'Mala ENF 1', 3278, 'Mala', 6.48, 'Gram', '2 spoons']
  ]), 'mala flavor');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['COGS'], [1, 2, 3]]), 'Cost');
  return wb;
}

test('only product sheets can be selected for NPD', () => {
  assert.equal(typeof importer.listSheets, 'function', 'NPD Excel importer is not implemented');
  assert.deepEqual(importer.listSheets(sample(), XLSX), ['Tem1']);
});

test('TA and Delivery merge while RM channels and separate new Subset identities survive', () => {
  assert.equal(typeof importer.parse, 'function');
  const plan = importer.parse(sample(), 'Tem1', XLSX);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.products.length, 2);
  assert.equal(plan.start, '2026-11-16'); assert.equal(plan.end, '2027-01-16');
  assert.deepEqual(plan.products[0].prices, { 'Take-Away': 59, Grab: 69 });
  assert.equal(plan.products[0].recipes.length, 2);
  assert.deepEqual(plan.products[0].recipes[1].channels, ['Grab']);
  assert.equal(plan.products.some(p => p.recipes.some(r => /^SS/i.test(r.code))), false);
  assert.equal(plan.subsets.length, 2);
  assert.equal(plan.subsets[0].powders.filter(p => p.eng === 'Mala ENF 1').length, 1, 'Mala repeated in another sheet must not be imported twice');
  assert.equal(plan.subsets[0].powders[0].code, '3278');
  assert.notEqual(plan.products[0].formulas[0].ssName, plan.products[1].formulas[0].ssName);
  assert.ok(plan.storeRules.some(r => r.values.some(v => v.label === 'Food Truck' && v.selected === false)));
});

test('unresolved SS and incompatible formulas across channels block import rather than guessing', () => {
  assert.equal(typeof importer.parse, 'function');
  let wb = sample(); delete wb.Sheets.ss; delete wb.Sheets['mala flavor'];
  assert.ok(importer.parse(wb, 'Tem1', XLSX).errors.some(e => e.code === 'SUBSET_MISSING'));
  wb = sample();
  const sh = wb.Sheets.Tem1;
  const refs = Object.keys(sh).filter(k => !k.startsWith('!') && sh[k].v === 'Flavored Enoki Fries 1');
  sh[refs[1].replace(/^D/, 'E')] = { t: 'n', v: 2 };
  assert.ok(importer.parse(wb, 'Tem1', XLSX).errors.some(e => e.code === 'FORMULA_CHANNEL_MISMATCH'));
});

test('missing prices, cached Excel errors and inconsistent dates block import; zero price is valid', () => {
  assert.equal(typeof importer.parse, 'function');
  const wb = sample();
  delete wb.Sheets.Tem1.H9;
  assert.ok(importer.parse(wb, 'Tem1', XLSX).errors.some(e => e.code === 'PRICE_MISSING'));
  wb.Sheets.Tem1.H9 = {t:'n', v:0};
  assert.equal(importer.parse(wb, 'Tem1', XLSX).products[0].prices['Take-Away'], 0);
  wb.Sheets.Tem1.H9 = {t:'e',v:15,w:'#VALUE!'};
  assert.ok(importer.parse(wb, 'Tem1', XLSX).errors.length > 0);
});

test('name-limit warnings retain original text and parsing never reserves codes', () => {
  assert.equal(typeof importer.parse, 'function');
  const wb = sample();
  wb.Sheets.Tem1.D9.v = 'ชื่อสินค้าภาษาไทยที่ยาวเกินยี่สิบตัวอักษร';
  const plan = importer.parse(wb, 'Tem1', XLSX);
  assert.equal(plan.products[0].th, 'ชื่อสินค้าภาษาไทยที่ยาวเกินยี่สิบตัวอักษร');
  assert.ok(plan.warnings.some(w => w.code === 'NAME_LENGTH'));
  assert.equal(plan.subsets[0].ssCode, '');
});

test('an existing SS row cannot donate its code to the next new group with a blank code', () => {
  const wb = sample();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Code', 'Product Category', 'NO', 'CMPOS CODE', 'ENG', 'Item Code', 'Description', 'Quantity', 'Unit', 'Spoon Size'],
    ['SS0171', 'Old Tamago', 1, '', 'Mala LTM', 3278, 'Mala', 6.48, 'g', '2 spoons'],
    ['', 'Flavored Enoki Fries 1', 2, '', 'Mala ENF 1', 3278, 'Mala', 6.48, 'g', '2 spoons']
  ]), 'Extra flavors');
  assert.equal(importer.parse(wb, 'Tem1', XLSX).subsets.length, 2);
});

test('duplicate powders with conflicting descriptions or spoon portions are blocked, not silently discarded', () => {
  for(const field of ['G2','J2']){
    const wb=sample(); wb.Sheets['mala flavor'][field].v=field==='G2'?'Different raw material description':'3 spoons';
    const p=importer.parse(wb,'Tem1',XLSX);
    assert.ok(p.errors.some(e=>e.code==='POWDER_CONFLICT'),field+' must cause a conflict');
  }
});

test('equivalent spoon wording in the two supplied Excel layouts can be deduplicated', () => {
  const wb=sample();wb.Sheets.ss.J3.v='ช้อน 5 ml * 2 ช้อน';
  wb.Sheets['mala flavor'].J2.v='ช้อน 5 ml * 2';
  assert.equal(importer.parse(wb,'Tem1',XLSX).errors.length,0);
});

test('category spelling differences require explicit mapping without duplicating products', () => {
  const wb = sample(); wb.Sheets.Tem1.G9.v = 'Street Foood';
  const plan = importer.parse(wb, 'Tem1', XLSX);
  assert.equal(plan.products.length, 2);
  assert.equal(plan.errors.length, 0);
  assert.ok(plan.warnings.some(w => w.code === 'CATEGORY_MAPPING'));
});

test('explicit Truffle surcharge is retained', () => {
  const wb=sample();
  wb.Sheets.ss.E3.v='Truffle +THB10 ENF 1';
  let plan=importer.parse(wb,'Tem1',XLSX);
  assert.equal(plan.subsets[0].powders.find(p=>p.eng.startsWith('Truffle')).addon,10);
});
test('invalid SS quantities cannot be rounded down in the NPD form', () => {
  const wb=sample();
  wb.Sheets.Tem1.E13={t:'n',v:1.5};
  assert.ok(importer.parse(wb,'Tem1',XLSX).errors.some(e=>e.code==='SUBSET_QUANTITY'));
});
test('missing or errored RM code cells cannot silently drop numbered recipe rows', () => {
  const wb=sample();
  wb.Sheets.Tem1.C12={t:'e',v:15,w:'#VALUE!'};
  assert.ok(importer.parse(wb,'Tem1',XLSX).errors.some(e=>e.code==='RECIPE'));
});

test('periods in the same NPD sheet must agree', () => {
  const wb=sample();wb.Sheets.Tem1.B14.v='17 Nov 26 - 16 Jan 27';
  assert.ok(importer.parse(wb,'Tem1',XLSX).errors.some(e=>e.code==='PERIOD_CONFLICT'));
});

function draftOptions() {
  const data = new Map();
  const ctx = { console:{log(){},warn(){},error(){}}, Date, Math, URL, setTimeout() {}, clearTimeout() {}, location: {hostname:'localhost'}, PC_REAL_PROMOS: [],
    document:{addEventListener(){},querySelectorAll(){return [];}},setInterval(){},clearInterval(){},
    localStorage: { getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,String(v)), removeItem:k=>data.delete(k), key:i=>[...data.keys()][i], get length(){return data.size;} } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['js/mock-backend.js','js/code-counter.js']) vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
  return { category:{name:'Street Food',code:'110'}, channelMap:{'Take-Away':'Take-Away',Grab:'Grab'}, subsetMaster:[],
    reserve:(type,cat)=> type==='ss'?ctx.PC_COUNTER.reserve('ss',{where:'Excel test'}).code:ctx.PC_COUNTER.reserveCat(cat,{where:'Excel test'}).code,
    release:(type,code)=>ctx.PC_COUNTER.returnCode(code,type,{from:'Excel rollback'}), counter:ctx.PC_COUNTER };
}

test('draft allocates real central SS/CMPOS/item codes once and all products reference those SS groups', () => {
  assert.equal(typeof importer.createDraft,'function');
  const opt=draftOptions(), plan=importer.parse(sample(),'Tem1',XLSX);
  const draft=importer.createDraft(plan,opt);
  assert.equal(draft.products.length,2); assert.equal(draft.subsets.length,2);
  assert.match(draft.subsets[0].ssCode,/^SS\d+$/);
  assert.notEqual(draft.subsets[0].ssCode,draft.subsets[1].ssCode);
  assert.equal(draft.products[0].formulas[0].subId,draft.subsets[0].id);
  assert.equal(draft.products[1].formulas[0].subId,draft.subsets[1].id);
  assert.equal(draft.products[0].recipes.some(r=>/^SS/.test(r.code)),false);
  assert.equal(opt.counter.entryOf(draft.subsets[0].ssCode).status,'RESERVED');
  assert.equal(draft.importSource.storesReviewed,false);
  assert.equal(draft.storeMode,'SELECT'); assert.deepEqual(draft.storeConds,[]);
});

test('failed allocation returns every newly reserved code and cannot produce a partial draft', () => {
  assert.equal(typeof importer.createDraft,'function');
  const opt=draftOptions(), allocated=[], original=opt.reserve;
  opt.reserve=(type,cat)=>{ if(allocated.length===2) return ''; const c=original(type,cat);allocated.push(c); return c; };
  assert.throws(()=>importer.createDraft(importer.parse(sample(),'Tem1',XLSX),opt),/จองรหัส/);
  for(const c of allocated) assert.equal(opt.counter.entryOf(c)?.status === 'RESERVED',false);
});

test('unmapped channels, missing existing SS and reused product codes are rejected before allocation', () => {
  assert.equal(typeof importer.createDraft,'function');
  const plan=importer.parse(sample(),'Tem1',XLSX);
  assert.throws(()=>importer.createDraft(plan,{...draftOptions(),channelMap:{}}),/ช่องทาง/);
  plan.products[0].formulas=[{ssCode:'SS0166',ssName:'Wavy Fries',chooseMin:1,chooseMax:1}];
  assert.throws(()=>importer.createDraft(plan,draftOptions()),/SS0166/);
  plan.products[0].formulas=[]; plan.products[0].code='110999';
  assert.throws(()=>importer.createDraft(plan,draftOptions()),/รหัสสินค้า/);
});

test('SS sheet imports independently of product sheets and reads only the selected groups',()=>{
  assert.equal(typeof importer.parseSubsets,'function');
  const wb=sample();
  assert.ok(importer.listSubsetSheets(wb,XLSX).includes('ss'));
  assert.equal(importer.listSubsetSheets(wb,XLSX).includes('Tem1'),false);
  const p=importer.parseSubsets(wb,'ss',XLSX);
  assert.equal(p.errors.length,0);assert.equal(p.subsets.length,2);
  assert.equal(p.subsets[0].powders[0].qty,'6.48');
  assert.equal(p.subsets[1].powders[0].eng,'Mala ENF 2');
  assert.equal(p.products.length,0);
});

test('subset-only draft reserves only SS and powder codes; duplicate names are blocked before reservation',()=>{
  assert.equal(typeof importer.createSubsetDraft,'function');
  const p=importer.parseSubsets(sample(),'ss',XLSX),opt=draftOptions();
  const result=importer.createSubsetDraft(p,opt);
  assert.equal(result.subsets.length,2);
  assert.match(result.subsets[0].ssCode,/^SS/);
  assert.match(result.subsets[0].powders[0].cmpos,/^103/);
  assert.equal(result.products,undefined);
  assert.throws(()=>importer.createSubsetDraft(p,{...opt,subsetMaster:[{name:'Flavored Enoki Fries 1',ssCode:'SS0999'}]}),/มี.*แล้ว/);
});

test('SS import blocks missing powder fields, conflicting duplicates and existing SS codes',()=>{
  assert.equal(typeof importer.parseSubsets,'function');
  const wb=sample();wb.Sheets.ss.E3.v='';
  assert.ok(importer.parseSubsets(wb,'ss',XLSX).errors.length);
  wb.Sheets.ss.E3.v='Mala ENF 1';wb.Sheets.ss.A3={t:'s',v:'SS0001'};
  assert.ok(importer.parseSubsets(wb,'ss',XLSX).errors.some(e=>e.code==='EXISTING_SS'));
});

test('standalone SS import rejects populated rows with missing or invalid NO instead of dropping powders',()=>{
  for(const no of ['', 'two', 0, 1.5]){
    const wb=sample();wb.Sheets.ss.C4={t:typeof no==='number'?'n':'s',v:no};
    assert.ok(importer.parseSubsets(wb,'ss',XLSX).errors.some(e=>e.code==='POWDER_SEQUENCE'),JSON.stringify(no));
  }
});

test('both import paths add only missing mandatory flavors, leaving quantities for review',()=>{
  for(const parse of [importer.parse,importer.parseSubsets]){
    const p=parse(sample(),parse===importer.parse?'Tem1':'ss',XLSX);
    assert.deepEqual(p.errors,[]);
    for(const s of p.subsets){
      assert.equal(s.powders.length,3);
      const truffle=s.powders.find(w=>w.eng==='Truffle 2');
      assert.equal(truffle.code,'3024');assert.equal(truffle.qty,'');
      const nf=s.powders.at(-1);assert.equal(nf.eng,'No flavor');assert.equal(nf.seq,99);assert.equal(nf.noFlavor,true);
    }
    assert.ok(p.warnings.some(w=>w.code==='STANDARD_FLAVORS'));
  }
});

test('existing suffixed standard rows retain their recipes and No flavor needs no RM',()=>{
  const wb=sample();
  const rows=XLSX.utils.sheet_to_json(wb.Sheets.ss,{header:1});
  rows.splice(3,0,['','',6,'','Truffle 2 FF1','3024','Truffle',2.1,'g','custom spoon'],['','',99,'','No flavor FF1','','','','','']);
  wb.Sheets.ss=XLSX.utils.aoa_to_sheet(rows);
  for(const parse of [importer.parse,importer.parseSubsets]){
    const p=parse(wb,parse===importer.parse?'Tem1':'ss',XLSX);
    assert.deepEqual(p.errors,[]);
    const s=p.subsets[0];assert.equal(s.powders.length,3);
    const truffle=s.powders.find(w=>w.eng==='Truffle 2 FF1');
    assert.equal(truffle.qty,'2.1');assert.equal(truffle.spoon,'custom spoon');
    assert.equal(s.powders.at(-1).noFlavor,true);
  }
});

test('Truffle surcharge is distinct from mandatory Truffle 2',()=>{
  const wb=sample();wb.Sheets.ss.E3.v='Truffle +THB10 FF1';
  const p=importer.parseSubsets(wb,'ss',XLSX);
  assert.equal(p.subsets[0].powders.filter(w=>w.eng.startsWith('Truffle')).length,2);
});
