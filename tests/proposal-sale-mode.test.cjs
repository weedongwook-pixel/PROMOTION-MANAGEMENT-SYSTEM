const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(mode,code='101001',name='101001 - Fries'){
 const html=fs.readFileSync('pages/Proposal.html','utf8'),fields={'.row-ic':{value:code},'.row-search-input':{value:name},'.row-op':{value:'49'},'.row-qty':{value:'2'},'.row-issubset':{value:''}},out={'.btn-gross':{innerText:''},'.btn-net':{value:'80'},'.btn-disc':{value:''}};
 const row={querySelector:s=>fields[s]},block={querySelectorAll:()=>[row],querySelector:s=>out[s]},checked={value:mode},camp={querySelectorAll:()=>[checked]};
 const c={window:{masterData:[{itemCode:'101001',itemNameEN:'Fries',priceTA:49,priceDLV:59},{itemCode:'101002',itemNameEN:'Fries',priceTA:69,priceDLV:79}]},document:{getElementById:id=>id==='button'?block:camp}};vm.createContext(c);
 for(const name of ['updateTotals','updateAllPricesInBlock'])vm.runInContext(html.match(new RegExp('window\\.'+name+' = function\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\};'))[0],c);
 return {c,fields,out,checked,refresh:()=>c.window.updateAllPricesInBlock('button','camp')};
}
test('Proposal reprices already selected product codes across all delivery channels and back to Take Away',()=>{
 const f=fixture('GRAB');
 for(const mode of ['GRAB','LINEMAN','ShopeeFood','Robinhood','Gokoo','All Delivery']){f.checked.value=mode;f.refresh();assert.equal(Number(f.fields['.row-op'].value),59,mode);assert.equal(f.out['.btn-gross'].innerText,'118.00',mode);assert.equal(f.out['.btn-disc'].value,'38.00');assert.equal(f.fields['.row-qty'].value,'2');}
 for(const mode of ['Take Away','All Channel']){f.checked.value=mode;f.refresh();assert.equal(Number(f.fields['.row-op'].value),49);assert.equal(f.out['.btn-gross'].innerText,'98.00');assert.equal(f.out['.btn-disc'].value,'18.00');}
});
test('Proposal price lookup uses item identity when names repeat and retains legacy name-only rows',()=>{
 const f=fixture('GRAB','101002','Fries');f.refresh();assert.equal(Number(f.fields['.row-op'].value),79);
 const legacy=fixture('GRAB','','Fries');legacy.refresh();assert.equal(Number(legacy.fields['.row-op'].value),59);
});
test('Sale mode changes do not replace a submitted Subset price with a same-name individual product price',()=>{
 const f=fixture('GRAB','SS0035','Fries');f.fields['.row-issubset'].value='1';f.fields['.row-op'].value='25';f.refresh();assert.equal(Number(f.fields['.row-op'].value),25);
});
