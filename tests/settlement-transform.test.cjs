const {test}=require('node:test'),assert=require('node:assert/strict');
test('shared IT settlement saves names, type, product, channel prices and Subset composition together',()=>{
  const engine=require('../js/settlement-transform.js');
  const row={campaign:'Pilot',shortName:'Old',month:'2026-10',promoType:'Item Set',typePromotion:'Item Set',codePromotion:'P4000',codeItemSet:'1074000',itemCode:'SS001',qty:2,gross:50,isSubset:'Y',chooseMin:1,chooseMax:2,saleMode:'GRAB',cate:'Promotion set',start:'2026-10-19',end:'2026-10-31',opStatus:'REJECTED'};
  const store={months:{'2026-10':[row]},working:[{...row}],npdProducts:[]};
  const result=engine.applySettlement({store,master:[{category:'Promotion set',cateCode:'107'}],values:{},now:'2026-10-19T10:00:00.000Z',day:'2026-10-19'},'2026-10',[{rowIdx:2,month:'2026-10',campaign:'Pilot',sourceShortName:'Old',shortName:'New',kitchenName:'Kitchen',promoType:'Item Set',promoCode:'P4000',itemPromo:'1074000',itemCode:'SS001',qty:2,price:50,netPrice:79,cateRemark:'Promotion set'}]);
  assert.equal(result.status,'SUCCESS');
  const saved=result.store.months['2026-10'][0];assert.equal(saved.shortName,'New');assert.equal(saved.kitchen,'Kitchen');assert.equal(saved.typePromotion,'Price Promotion');assert.equal(saved.opStatus,'WAITING');
  const product=result.store.npdProducts[0];assert.equal(product.itemCode,'1074000');assert.equal(product.itemNameEN,'Kitchen');assert.equal(product.gross,'100');assert.equal(product.priceGrab,'100');assert.equal(product.priceTA,'');assert.equal(product.cateCode,'107');
  assert.deepEqual(JSON.parse(result.values.pc_itemset_comp)['1074000'].map(x=>[x.code,x.min,x.max]),[['SS001',2,4]]);
  assert.equal(JSON.parse(result.values.pc_product_promo)['1074000'][0].net,'79');assert.equal(store.months['2026-10'][0].shortName,'Old','staging never mutates the caller');
  assert.deepEqual(result.confirmations.map(x=>x.code),['1074000']);
});
