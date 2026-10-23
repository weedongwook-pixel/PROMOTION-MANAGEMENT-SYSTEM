const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Item Set without E-Voucher asks CoPromo, then ordinary send/no-send without accounting intake',async()=>{
 for(const send of [false,true]){
  let dialogs=0,mail=0,decisions=0;const c={Swal:{DismissReason:{cancel:'cancel'},fire:async()=>++dialogs===1?{isConfirmed:false,dismiss:'cancel'}:{isConfirmed:send}},PC_CLOUD:{saveMailDecision:async()=>decisions++},PC_CoProEmailUI:{save:async(record,options)=>{assert.equal(record.campaign,'Item Coupon campaign');assert.equal(options.notificationOnly,true);mail++;return {status:'success'};}}};c.window=c;vm.runInNewContext(fs.readFileSync('js/co-promo.js','utf8'),c);
  const result=await c.PC_CoPromo.promptAfterSubmit(['Item Coupon campaign'],{source:'itemset',hasEVoucher:false});assert.equal(dialogs,2);assert.equal(mail,send?1:0);assert.equal(decisions,send?0:1);assert.equal(result.coPromo,false);
 }
});
