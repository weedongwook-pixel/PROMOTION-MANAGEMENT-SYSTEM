const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const same=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);   // values cross the vm realm
// After a promotion is saved: ask send / no mail per campaign, then open the send-mail page once for every "send".
function run(answers,extra={}){
 const calls=[],asked=[];let i=0;
 const c={Swal:{fire:async()=>({})},
  PC_CLOUD:{saveMailDecision:async(name,kind)=>calls.push(['not_sent',name,kind])},
  PC_CoPromoDrafts:{recordCoPromo:async(name,record,status)=>calls.push(['intake',name,status])},
  PC_SendMail:{ask:async(title,campaign)=>{asked.push([title,campaign]);return answers[i++]==='send';},
   open:async jobs=>{calls.push(['page',jobs.map(j=>j.kind+':'+j.campaign)]);return {mailPage:true};}},...extra};
 c.window=c;vm.runInNewContext(fs.readFileSync('js/co-promo.js','utf8'),c);return {c,calls,asked};
}
test('every campaign is asked once: send opens the send-mail page, no mail records the decision',async()=>{
 let t=run(['send']);let r=await t.c.PC_CoPromo.promptAfterSubmit(['Plain'],{coPromo:[]});
 same(t.asked,[['ส่งเมลแจ้งโปรโมชั่นหรือไม่?','Plain']]);same(t.calls,[['page',['submitted:Plain']]]);
 assert.equal(r.mailPage,true);assert.equal(r.completed,false,'the form must not navigate away from the send-mail page');
 t=run(['none']);r=await t.c.PC_CoPromo.promptAfterSubmit(['Plain'],{coPromo:[]});
 same(t.calls,[['not_sent','Plain','submitted']]);assert.equal(r.completed,true);assert.equal(r.coPromo,false);
});
test('a ticked Co-Promotion always reaches the Co-Promotion page; mail is optional',async()=>{
 let t=run(['send']);let r=await t.c.PC_CoPromo.promptAfterSubmit(['Partner'],{coPromo:['Partner']});
 same(t.calls,[['intake','Partner',undefined],['page',['copro:Partner']]]);assert.equal(r.coPromo,true);
 t=run(['none']);r=await t.c.PC_CoPromo.promptAfterSubmit(['Partner'],{coPromo:['Partner']});
 same(t.calls,[['intake','Partner','not_sent']],'no mail: saved as an ordinary CoPromo record');assert.equal(r.completed,true);
});
test('mixed submission asks per campaign and opens one send-mail page for all chosen mails',async()=>{
 const t=run(['send','none','send']);await t.c.PC_CoPromo.promptAfterSubmit(['Partner','Plain','Other'],{coPromo:['Partner']});
 assert.equal(t.asked.length,3);
 same(t.calls,[['intake','Partner',undefined],['not_sent','Plain','submitted'],['page',['copro:Partner','submitted:Other']]]);
});
test('a pending CoPromo opens the send-mail page with its draft',async()=>{
 const t=run([]);const draft={id:'d1',revision:2,record:{brand:'B'}};
 const r=await t.c.PC_CoPromo.openForm('Partner',null,{requireEmail:true,draft});
 assert.equal(r.mailPage,true);same(t.calls,[['page',['copro:Partner']]]);
});
