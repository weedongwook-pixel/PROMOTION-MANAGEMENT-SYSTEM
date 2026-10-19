const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('orphan cleanup reloads and preserves codes retained by a committed removal',()=>{
 const state={v:1,types:{coupon:{cursor:10,seeded:true}},reservations:{'coupon::IC0010':{code:'IC0010',type:'coupon',num:10,status:'RESERVED',at:'2026-01-01'}},log:[]};
 const data=new Map([['pc_code_counter_v1',JSON.stringify(state)]]);
 const ctx={console:{log(){}},document:{addEventListener(){},querySelectorAll(){return[];}},setTimeout(){},setInterval(){},Date,Math,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))},PC_API:{getCodeBaselines:()=>({coupon:'IC0010'})}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/code-counter.js','utf8'),ctx);
 state.reservations['coupon::IC0010'].retainForHistory=true;data.set('pc_code_counter_v1',JSON.stringify(state));
 assert.equal(ctx.PC_COUNTER.returnOrphans([],{minAgeMs:1}).freedCount,0);assert.equal(ctx.PC_COUNTER.peek('coupon'),'IC0011');assert.equal(ctx.PC_COUNTER.returnCode('IC0010','coupon','automatic'),null);
});
