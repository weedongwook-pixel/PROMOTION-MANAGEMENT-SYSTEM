const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Item Set without E-Voucher asks CoPromo, then ordinary send/no-send without accounting intake',async()=>{
 for(const send of [false,true]){
  let dialogs=0,mail=0,decisions=0;const c={Swal:{DismissReason:{cancel:'cancel'},fire:async()=>++dialogs===1?{isConfirmed:false,dismiss:'cancel'}:{isConfirmed:send}},PC_CLOUD:{saveMailDecision:async()=>decisions++},PC_CoProEmailUI:{save:async(record,options)=>{assert.equal(record.campaign,'Item Coupon campaign');assert.equal(options.notificationOnly,true);mail++;return {status:'success'};}}};c.window=c;vm.runInNewContext(fs.readFileSync('js/co-promo.js','utf8'),c);
  const result=await c.PC_CoPromo.promptAfterSubmit(['Item Coupon campaign'],{source:'itemset',hasEVoucher:false});assert.equal(dialogs,2);assert.equal(mail,send?1:0);assert.equal(decisions,send?0:1);assert.equal(result.coPromo,false);
 }
});
test('CoPromo Yes saves intake then opens mail directly without a partner form',async()=>{
 const calls=[];const c={Swal:{fire:async()=>({isConfirmed:true})},PC_CoPromoDrafts:{recordCoPromo:async(name,record,status)=>calls.push(['intake',name,status])},PC_CoProEmailUI:{save:async(record,options)=>{calls.push(['mail',record.campaign,options.notificationOnly]);return {mailStatus:'queued'};}}};c.window=c;vm.runInNewContext(fs.readFileSync('js/co-promo.js','utf8'),c);
 const result=await c.PC_CoPromo.promptAfterSubmit(['New partner']);assert.equal(result.completed,true);assert.deepEqual(calls,[['intake','New partner',undefined],['mail','New partner',undefined],['intake','New partner','queued']]);
});
