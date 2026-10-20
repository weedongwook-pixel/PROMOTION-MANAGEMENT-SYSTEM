const test=require('node:test'),assert=require('node:assert/strict');
test('shared form allocator preserves prefixes, skips reservations and does not release codes',()=>{
 const A=require('../js/form-code-allocation.js');
 for(const [type,prefix,pad] of [['coupon','IC',4],['bill','BD',3],['voucher','VC',4]]){
  const state={types:{[type]:{seeded:true,cursor:20}},reservations:{[type+'::'+prefix+String(21).padStart(pad,'0')]:{status:'USED'}},log:[]};
  const opts={type,tag:'Test',campaign:'TOTO',shortName:'New',actor:'Bow',at:'2026-10-19'};
  assert.equal(A.reserveFormCode(state,opts).code,prefix+String(22).padStart(pad,'0'));
  assert.equal(A.reserveFormCode(state,opts).changed,false);assert.equal(state.types[type].cursor,22);
 }
});
test('manual codes are normalized, reserved and rejected when already used or reserved',()=>{
 const A=require('../js/form-code-allocation.js');const state={types:{itemset:{seeded:true,cursor:3400}},reservations:{},log:[]};
 const opts={type:'itemset',tag:'Edit',campaign:'UOB',shortName:'New',actor:'IT',at:'2026-10-19',manualCode:' 1079001 ',usedCodes:new Set(['1079002'])};
 assert.equal(A.reserveFormCode(state,opts).code,'1079001');assert.equal(state.types.itemset.cursor,9001);
 assert.throws(()=>A.reserveFormCode(state,{...opts,shortName:'Other'}),/ซ้ำ/);
 assert.throws(()=>A.reserveFormCode(state,{...opts,shortName:'Other',manualCode:'1079002'}),/ซ้ำ/);
 assert.throws(()=>A.reserveFormCode(state,{...opts,shortName:'Invalid',manualCode:'IC0001'}),/รูปแบบ/);
});
test('automatic promotion and item-set allocation skips actual codes outside the counter',()=>{
 const A=require('../js/form-code-allocation.js');
 for(const [type,code] of [['promo','P3509'],['itemset','1073509']]){
  const s={types:{[type]:{seeded:true,cursor:3507}},reservations:{},log:[]};
  assert.equal(A.reserveFormCode(s,{type,tag:'Edit',campaign:'UOB',shortName:'New',usedCodes:new Set([type==='promo'?'P3508':'1073508'])}).code,code);
 }
});

test('category allocation uses independent cursors and preserves confirmed identity',()=>{
 const A=require('../js/form-code-allocation.js');
 const state={types:{},cats:{'105':{cursor:10,seeded:true},'109':{cursor:20,seeded:true}},reservations:{},log:[]};
 const opts={type:'item',tag:'ItemSet',campaign:'Test',shortName:'Button',cat:'109'};
 assert.equal(A.reserveFormCode(state,opts).code,'109021');
 state.reservations['item::109021'].status='CONFIRMED';
 assert.equal(A.reserveFormCode(state,opts).changed,false);
 assert.equal(A.reserveFormCode(state,{...opts,cat:'105'}).code,'105011');
 assert.throws(()=>A.reserveFormCode(state,{...opts,cat:'106'}),/ยังไม่พร้อม/);
});
