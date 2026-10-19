const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('coupon scope has a separate mode control instead of duplicated category options',()=>{
 const html=fs.readFileSync('pages/Coupon.html','utf8');
 assert.match(html,/class="[^"]*row-scope/);
 assert.doesNotMatch(html,/<option value="__CATE__:\$\{e\}/);
});
function fixture(){
 const html=fs.readFileSync('pages/Coupon.html','utf8');
 const fields={};for(const key of ['row-cat-select','row-search-input','row-ic','row-catecode','row-catname','row-issubset','row-op','row-qty','row-net','row-scope'])fields['.'+key]={value:'',classList:{add(){},remove(){}}};
 const row={querySelector:s=>fields[s],closest:()=>({id:'button'})},dl={innerHTML:''};
 fields['.row-cat-select'].options=[{value:''},{value:'Fries'}];
 const w={masterData:[{itemCode:'101001',itemNameEN:'Fries',category:'Fries',cateCode:'101'},{itemCode:'201001',itemNameEN:'Drink',category:'Drink',cateCode:'201'}],catCodeMap:{Fries:'101'},updateTotals(){}};
 const c={window:w,document:{getElementById:id=>id==='list-r'?dl:id==='r'?row:{closest(){return null;}}}};vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('window.handleFill ='),html.indexOf('window.handleSelectionGlobal =')),c);
 return {w,fields,dl};
}
test('whole category stores a category reference, never a snapshot of members',()=>{
 const {w,fields}=fixture();fields['.row-cat-select'].value='__CATE__:Fries';w.updateDatalist('r','__CATE__:Fries');
 assert.equal(fields['.row-ic'].value,'101');assert.equal(fields['.row-catecode'].value,'101');assert.match(fields['.row-search-input'].value,/Fries/);assert.equal(fields['.row-search-input'].readOnly,true);
});
test('typing an item outside the selected category is rejected',()=>{
 const {w,fields}=fixture();fields['.row-cat-select'].value='Fries';w.handleFill('r','201001','button');assert.equal(fields['.row-ic'].value,'');
});
test('changing category clears the previous item and filters suggestions',()=>{
 const {w,fields,dl}=fixture();fields['.row-ic'].value='201001';w.updateDatalist('r','Fries');assert.equal(fields['.row-ic'].value,'');assert.match(dl.innerHTML,/101001/);assert.doesNotMatch(dl.innerHTML,/201001/);
});
test('category mode requires an explicit category and hides group prices, not its name',()=>{
 const {w,fields}=fixture();fields['.row-scope'].value='CATE';w.couponScopeChanged('r');
 assert.equal(fields['.row-cat-select'].value,'');assert.equal(fields['.row-ic'].value,'');
 assert.equal(fields['.row-net'].hidden,true);assert.equal(fields['.row-op'].hidden,true);
 assert.equal(fields['.row-search-input'].hidden,false);
 fields['.row-cat-select'].value='Fries';w.couponScopeChanged('r');
 assert.equal(fields['.row-ic'].value,'101');assert.match(fields['.row-search-input'].value,/Fries/);
 fields['.row-scope'].value='ITEM';w.couponScopeChanged('r');
 assert.equal(fields['.row-net'].hidden,false);assert.equal(fields['.row-op'].hidden,false);assert.equal(fields['.row-ic'].value,'');
});
