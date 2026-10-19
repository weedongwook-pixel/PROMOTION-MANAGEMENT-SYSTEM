const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database,actor,grant}=require('./helpers/copro-context.cjs');
test('only managers publish concrete test messages; audience sees summaries without mailbox IDs',async()=>{
  const a=load(['templates','gmail','registry']),DB=database(),env={DB};grant(DB,actor,'manage');a.gmailAccess=async()=> 'mock';
  const message={id:'m1',threadId:'t1',payload:{headers:[{name:'Subject',value:'Test send to email copro UOB'},{name:'Message-ID',value:'<m1@example.com>'},{name:'To',value:'Test <external@example.net>'},{name:'Cc',value:'it@rocks-foods.com'}]}};
  const deps={fetch:async url=>{assert.ok(url.includes('format=metadata'));return Response.json(message);}};
  const published=await a.publishThread(actor,{messageId:'m1',recipients:{to:['external@example.net'],cc:[]},audience:[actor]},env,deps);
  const list=await a.listApprovedThreads(actor,env);assert.equal(list.length,1);assert.equal(list[0].id,published.id);assert.equal(list[0].threadId,undefined);assert.equal(list[0].messageId,undefined);
  const other={...actor,objectId:'44444444-4444-4444-8444-444444444444'};assert.equal((await a.listApprovedThreads(other,env)).length,0);await assert.rejects(a.publishThread(other,{},env,deps));
  await assert.rejects(a.publishThread(actor,{messageId:'m1',recipients:{to:['not-in-loop@example.net'],cc:[]},audience:[actor]},env,deps));
  DB.db.exec('UPDATE email_threads SET enabled=0');assert.equal((await a.listApprovedThreads(actor,env)).length,0);DB.db.close();
});
