const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/copro-context.cjs');
test('reply uses original references, exact recipients and escaped UTF-8 content',()=>{
  const a=load(['templates','gmail']);
  const snapshot={threadId:'thread1',rfcMessageId:'<original@example.com>',references:['<older@example.com>'],subject:'Test send to email copro UOB',recipients:{to:['test@example.net'],cc:[]},milestone:'submitted',details:{campaign:'โปรฯ <img src=x>',start:'2026-10-19',end:'2026-11-01',buttons:[{name:'Fries',code:'IC001'}]}};
  const r=a.buildReply(snapshot),mime=Buffer.from(r.raw,'base64url').toString('utf8');
  assert.equal(r.threadId,'thread1');assert.match(mime,/In-Reply-To: <original@example.com>/);assert.match(mime,/References: <older@example.com> <original@example.com>/);assert.match(mime,/To: test@example.net/);assert.ok(!mime.includes('Bcc:'));assert.ok(!mime.slice(mime.indexOf('Content-Type: text/html')).includes('<img src=x>'));assert.ok(mime.includes('&lt;img src=x&gt;'));
  assert.throws(()=>a.buildReply({...snapshot,subject:'test\r\nBcc: bad@example.com'}));assert.throws(()=>a.buildReply({...snapshot,recipients:{to:['bad\n@example.com'],cc:[]}}));
});
test('send outcomes distinguish acceptance, explicit rejection and ambiguous transport',async()=>{
  const a=load(['templates','gmail']),snapshot={threadId:'t',rfcMessageId:'<o@example.com>',references:[],subject:'Test',recipients:{to:['test@example.net'],cc:[]},milestone:'submitted',details:{campaign:'X',buttons:[]}};
  assert.equal((await a.sendReply('token',snapshot,{fetch:async()=>Response.json({id:'sent'})})).outcome,'accepted');
  assert.equal((await a.sendReply('token',snapshot,{fetch:async()=>Response.json({},{status:429})})).retryable,true);
  assert.equal((await a.sendReply('token',snapshot,{fetch:async()=>{throw Error('timeout with private data');}})).outcome,'ambiguous');
});
