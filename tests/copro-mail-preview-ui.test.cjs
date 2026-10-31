const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// Send-mail page plumbing: pending mail jobs live on Cloud per user, so leaving the page keeps them for "งานค้างของฉัน".
function page(){
 const store=new Map(),calls=[],ls=new Map([['pc_userName','Tester']]);
 const window={
  PC_CLOUD:{readCloudKey:async k=>store.has(k)?{value:store.get(k).value,updatedAt:store.get(k).at}:null,
   saveMailJobs:async(owner,value,expected)=>{const k='pc_mail_jobs::'+encodeURIComponent(owner),old=store.get(k);if((old?.at??null)!==expected)throw Error('conflict');store.set(k,{value,at:(old?.at||0)+1});},
   saveMailDecision:async(...a)=>calls.push(['decision',...a])},
  PC_CoPromoDrafts:{recordCoPromo:async(c,r,s)=>calls.push(['copro',c,s])},
  loadPage:p=>calls.push(['page',p])};
 const ctx={window,localStorage:{getItem:k=>ls.get(k)??null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)},document:{getElementById:()=>null}};
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),ctx);vm.runInNewContext(fs.readFileSync('js/send-mail.js','utf8'),ctx);
 return {mail:window.PC_SendMail,ui:window.PC_CoProEmailUI,calls,ls};
}
test('opening the send-mail page stores the jobs on Cloud, shows the first one, and keeps them until sent or declined',async()=>{
 const {mail,calls,ls}=page();
 const r=await mail.open([{kind:'submitted',campaign:'Plain'},{kind:'copro',campaign:'Partner'}]);
 assert.equal(r.mailPage,true);assert.deepEqual(calls.map(c=>c.join(':')),['page:SendMail']);
 assert.equal(ls.get('pc_mail_job_current'),'submitted:Plain:');
 assert.deepEqual([...(await mail.listJobs()).map(j=>j.campaign)],['Plain','Partner']);
 await mail.open([{kind:'submitted',campaign:'Plain'}]);assert.equal((await mail.listJobs()).length,2,'the same job is not queued twice');
 await mail.removeJob('submitted:Plain:');assert.deepEqual([...(await mail.listJobs()).map(j=>j.campaign)],['Partner']);
});
test('declining records the right "not sent" decision per job kind',async()=>{
 const {mail,calls}=page();
 await mail.decline({kind:'submitted',campaign:'A'});await mail.decline({kind:'edit',campaign:'B',editId:'edit-1'});
 await mail.decline({kind:'change',campaign:'C',changeId:'chg-12345678'});await mail.decline({kind:'copro',campaign:'D'});
 assert.deepEqual(calls.map(c=>c.join('|')),['decision|A|submitted||not_sent','decision|B|promotion_edited|edit-1|not_sent','decision|C|promotion_changed|chg-12345678|not_sent','copro|D|not_sent']);
});
test('loop search that finds nothing explains the it@rocks-foods.com CC rule',()=>{
 const {ui}=page(),html=ui.helpers.notFoundHtml('Promo X');
 assert.match(html,/ไม่พบเมลหัวข้อนี้ในกล่องเมล it@rocks-foods.com/);assert.match(html,/CC it@rocks-foods.com/);assert.match(html,/Promo X/);
});
