const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const store=new Map();let user='MKT A',fail=false,rows=[{campaign:'Test',shortName:'A',submissionBatchId:'batch-1',submissionForm:'Bill Discount',emailButtonId:'button-1',codePromotion:'BD001'}];
 const context={console,Date,localStorage:{getItem:()=>user},PC_CLOUD:{
  async readCloudKey(key){return store.get(key)||null;},async readCampaignRows(){return rows;},
  async saveCoPromoDrafts(owner,value,version){if(fail)throw Error('Cloud unavailable');const key='pc_copro_drafts::'+encodeURIComponent(owner),old=store.get(key);assert.equal(old?.updatedAt??null,version);const next={value,updatedAt:(version||0)+1};store.set(key,next);return next;}
 }};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('js/copro-drafts.js','utf8'),context);
 return {api:context.PC_CoPromoDrafts,context,store,setUser:x=>user=x,setRows:x=>rows=x,fail:()=>fail=true};
}
test('partial draft is saved on Cloud without changing submitted campaign or sending email; scoped to current app user',async()=>{
 const f=fixture();const d=await f.api.save('Test',{brand:'',remark:'later'},null);assert.equal(d.sourcePage,'BillDiscountProposal');assert.equal((await f.api.list()).length,1);assert.equal(d.record.emailButtonId,'button-1');assert.equal(d.record.codePromotion,undefined);
 f.setUser('MKT B');assert.equal((await f.api.list()).length,0);f.setUser('MKT A');assert.equal((await f.api.list())[0].record.remark,'later');
});
test('Cloud failure and concurrent draft edits cannot report success or overwrite another tab',async()=>{
 const f=fixture(),one=await f.api.save('Test',{brand:'UOB'},null),two=await f.api.save('Test',{brand:'UOB edited'},one);
 await assert.rejects(f.api.save('Test',{brand:'stale'},one),/ฉบับร่างใหม่กว่า/);await assert.rejects(f.api.remove(one),/อีกหน้าต่าง/);
 f.fail();await assert.rejects(f.api.save('Test',{brand:'lost'},two),/Cloud unavailable/);assert.equal((await f.api.list())[0].record.brand,'UOB edited');
});
test('resume uses latest Cloud codes and exact submission, never submits the promotion again',async()=>{
 const f=fixture(),draft=await f.api.save('Test',{brand:'UOB'},null);let seen;
 f.setRows([{campaign:'Test',shortName:'renamed',emailButtonId:'button-1',codePromotion:'BD099',submissionBatchId:'batch-1'}]);
 f.context.PC_CoPromo={openForm:async(c,r,o)=>{seen=o;return {draftSaved:true};}};
 await f.api.resume(draft);assert.equal(seen.cloudRows[0].codePromotion,'BD099');assert.equal(seen.draft.id,draft.id);
 f.setRows([{campaign:'Test',shortName:'A',submissionBatchId:'replacement'}]);await assert.rejects(f.api.resume(draft),/ต้นฉบับเปลี่ยน/);
});
test('completion removes only the saved draft and makes no email call',async()=>{
 const f=fixture(),d=await f.api.save('Test',{brand:'UOB'},null);await f.api.remove(d);assert.equal((await f.api.list()).length,0);
});
