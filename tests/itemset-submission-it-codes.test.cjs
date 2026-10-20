const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('pages/IT_Settlement.html','utf8');
for(const [category,itemCode,promoCode,wantType] of [['Promotion set','107201','P101','Price Promotion'],['Combo','105031','P101','Price Promotion'],['Value set','106041','P101','Price Promotion'],['E-Voucher','109051','IC0501','E-Voucher']]){
 test(category+' IT displays submitted pair with category counter and confirmation identity',()=>{
  const it={promoType:'Item Set',cate:category,cateRemark:'Fries',promoCode,itemPromo:itemCode,builderCode:itemCode,shortName:'Set'};
  const ctx={it,first:it,campTasks:[it],campName:'Campaign',month:'2026-10',isHeader:true,isItemSet:true,legacyCounts:{},window:{},itEsc:String,itFieldEntry:()=>null,itUniqueButtonCode:()=>'',itCodeFieldId:(t,c,s,m)=>'itccf-'+t+'-'+encodeURIComponent(JSON.stringify([c,s,m])),itOldCodeFieldId:()=>''};
  vm.createContext(ctx);
  const start=page.indexOf('                    const isCoupon =');
  const end=page.indexOf('                    const naAttr =',start);
  const result=vm.runInContext(page.slice(start,end)+'; ({counterType:_ccType,type:_curType,cat:_isCate,promo:_fcodeVal,item:_isVal,field:_isField});',ctx);
  assert.equal(result.counterType,category==='E-Voucher'?'coupon':'promo');assert.equal(result.type,wantType);assert.equal(result.cat,itemCode.slice(0,3));assert.equal(result.promo,promoCode);assert.equal(result.item,itemCode);
  assert.equal(result.field,'itccf-'+(category==='Promotion set'?'itemset':'item-'+itemCode.slice(0,3))+'-'+encodeURIComponent(JSON.stringify(['Campaign','Set','2026-10'])));
 });
}
