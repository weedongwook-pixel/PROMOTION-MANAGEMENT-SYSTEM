const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function run(answers,extra={}){
 const calls=[],titles=[];let i=0;
 const c={Swal:{fire:async o=>{titles.push(o.title);const a=answers[i++];return a==='reply'?{isConfirmed:true}:a==='new'?{isConfirmed:false,isDenied:true}:{isConfirmed:false,dismiss:'cancel'};}},
  PC_CLOUD:{saveMailDecision:async(name,kind)=>calls.push(['not_sent',name,kind])},
  PC_CoPromoDrafts:{recordCoPromo:async(name,record,status)=>calls.push(['intake',name,status])},
  PC_CoProEmailUI:{save:async(record,options)=>{calls.push(['mail',record.campaign,!!options.notificationOnly,options.delivery]);return options.notificationOnly?{status:'success'}:{mailStatus:'queued'};}},...extra};
 c.window=c;vm.runInNewContext(fs.readFileSync('js/co-promo.js','utf8'),c);return {c,calls,titles};
}
test('every campaign is asked once: reply in old loop, new email, or no mail',async()=>{
 for(const [answer,expect] of [['reply',['mail','Plain',true,'reply']],['new',['mail','Plain',true,'new']],['none',['not_sent','Plain','submitted']]]){
  const {c,calls,titles}=run([answer]);const r=await c.PC_CoPromo.promptAfterSubmit(['Plain'],{coPromo:[]});
  assert.deepEqual(titles,['ส่งเมลแจ้งโปรโมชั่นหรือไม่?']);assert.deepEqual(calls,[expect]);assert.equal(r.completed,true);assert.equal(r.coPromo,false);
 }
});
test('a ticked Co-Promotion always reaches the Co-Promotion page; mail is optional and uses the chosen delivery',async()=>{
 let t=run(['new']);let r=await t.c.PC_CoPromo.promptAfterSubmit(['Partner'],{coPromo:['Partner']});
 assert.deepEqual(t.calls,[['intake','Partner',undefined],['mail','Partner',false,'new'],['intake','Partner','queued']]);assert.equal(r.coPromo,true);assert.equal(r.completed,true);
 t=run(['none']);r=await t.c.PC_CoPromo.promptAfterSubmit(['Partner'],{coPromo:['Partner']});
 assert.deepEqual(t.calls,[['intake','Partner','not_sent']],'no mail: saved as an ordinary CoPromo record');assert.equal(r.completed,true);
});
test('mixed submission asks per campaign',async()=>{
 const t=run(['reply','none']);await t.c.PC_CoPromo.promptAfterSubmit(['Partner','Plain'],{coPromo:['Partner']});
 assert.equal(t.titles.length,2);assert.deepEqual(t.calls.map(x=>x[0]+':'+x[1]),['intake:Partner','mail:Partner','intake:Partner','not_sent:Plain']);
});
test('closing the mail composer stops and keeps the CoPromo as pending work',async()=>{
 const t=run(['reply'],{});t.c.PC_CoProEmailUI.save=async()=>null;
 const r=await t.c.PC_CoPromo.promptAfterSubmit(['Partner','Plain'],{coPromo:['Partner']});
 assert.equal(t.titles.length,1);assert.equal(r.draftSaved,true);
});
