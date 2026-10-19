const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(role = 'MKT', name = 'Bow') {
  const data = new Map([['pc_userName', name], ['pc_role', role]]);
  const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  let tracking = [], remote = {}, activity = [];
  const run = {
    withSuccessHandler(fn) { this.success = fn; return this; },
    withFailureHandler(fn) { this.failure = fn; return this; },
    getAllCampaignData() { this.success(tracking); },
  };
  const context = { localStorage, google: { script: { run } }, Date, Math, Intl, Map, Set, Promise, console,
    setTimeout: callback => queueMicrotask(callback),
    PC_CLOUD: { enabled: () => true, readCampaignRows: async name => {
      if (remote[name] instanceof Error) throw remote[name];
      return remote[name] || [];
    }, readActivity: async () => activity } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/submission-log.js'), 'utf8'), context);
  return { context, log: context.PC_SubmissionLog, setTracking: x => { tracking = x; }, setRemote: x => { remote = x; }, setActivity: x => { activity = x; }, data };
}

test('Cloud activity log filters by actor without inflating new-submission counts', async () => {
  const owner = setup('MKT', 'Bow');
  const first = owner.log.createActivity({ kind: 'ADDED', campaign: 'Goodie', buttons: ['Deal A'] });
  assert.match(first.id, /^ACT-/);
  assert.equal(first.user, 'Bow');
  assert.equal(first.date, owner.log.today());
  owner.setActivity([first, { ...first, id: 'ACT-OTHER', user: 'IT', kind: 'CANCELLED' }]);
  const mine = await owner.log.listActivity(owner.log.today());
  assert.deepEqual(Array.from(mine, x => x.id), [first.id]);
  assert.equal(owner.log.summarize([]).submissions, 0);
  const admin = setup('Admin', 'Super Admin');
  admin.setActivity([first, { ...first, id: 'ACT-OTHER', user: 'IT', kind: 'CANCELLED' }]);
  assert.equal((await admin.log.listActivity(admin.log.today())).length, 2);
  assert.equal((await admin.log.listActivity(admin.log.today(), { scope: 'mine' })).length, 0);
});
test('a renamed button keeps the original Cloud submission verified rather than creating a false failed history',async()=>{
 const{log,setTracking,setRemote}=setup();const payload=[{campaign:'TOTO',shortName:'Original'}];const plan=log.prepare('Item Set',payload);
 setTracking(payload);setRemote({TOTO:payload});await log.afterSave(plan,{});
 const revised=payload.map(r=>({...r,shortName:'Edited name',editOriginalShortName:'Original',editId:'edit-rename-test'}));setTracking(revised);setRemote({TOTO:revised});
 const result=await log.list(log.today());assert.equal(result.find(r=>r.campaign==='TOTO').status,'verified');
});

test('one batch produces distinct campaign receipts and verifies every button on both surfaces', async () => {
  const { log, setTracking, setRemote } = setup();
  const payload = [
    { campaign: 'A', shortName: 'A1' }, { campaign: 'A', shortName: 'A2' },
    { campaign: 'B', shortName: 'B1' },
  ];
  const plan = log.prepare('Item Set', payload);
  assert.equal(plan.entries.length, 2);
  assert.notEqual(plan.entries[0].id, plan.entries[1].id);
  assert.equal(payload[0].submissionId, payload[1].submissionId);
  assert.equal(payload[0].submissionExpectedButtons, 2);
  assert.equal(payload[2].submissionExpectedButtons, 1);
  assert.equal(payload[2].submittedBy, 'Bow');
  const rows = payload.map(row => ({ ...row, campaign: row.campaign, txnDate: row.txnDate }));
  setTracking(rows.slice(0, 2));
  setRemote({ A: rows.slice(0, 2), B: rows.slice(2) });
  let result = await log.verifyPlan(plan);
  assert.equal(result[0].ok, true);
  assert.equal(result[1].ok, false, 'a missing second campaign must block whole-batch success');
  let complete;
  await log.afterSave(plan, { onDone: value => { complete = value; } });
  assert.equal(complete, false, 'the form must remain open when any campaign is absent');
  assert.equal(log.readAttempts().find(x => x.campaign === 'B').status, 'verified', 'Cloud save stays successful even while Tracking is incomplete');
  setTracking(rows);
  result = await log.verifyPlan(plan);
  assert.equal(result.every(x => x.ok), true);
  await log.afterSave(plan, { onDone: value => { complete = value; } });
  assert.equal(complete, true);
  setRemote({ A: rows.slice(0, 1), B: rows.slice(2) });
  result = await log.verifyPlan(plan);
  assert.equal(result[0].ok, false, 'Cloud must contain every expected POS button');
});

test('daily log counts distinct campaigns and separates old records and local failures', async () => {
  const { log, setTracking, setRemote } = setup();
  const date = log.today();
  const payload = [{ campaign: 'A', shortName: 'A1' }, { campaign: 'A', shortName: 'A2' }];
  const plan = log.prepare('Item Set', payload);
  const rows = payload.map(x => ({ ...x, reporter: 'Bow' }));
  const old = { campaign: 'Old', shortName: 'O1', submittedBy: 'Bow', txnDate: new Date().toISOString() };
  setTracking(rows.concat([old,
    { campaign: 'Other user', shortName: 'X', submittedBy: 'Other', txnDate: new Date().toISOString() }]));
  setRemote({ A: rows, Old: [old] });
  let items = await log.list(date);
  assert.equal(items.length, 2);
  assert.equal(items.find(x => x.campaign === 'A').status, 'verified');
  assert.equal(items.find(x => x.campaign === 'A').shortNames.length, 2);
  assert.equal(items.find(x => x.campaign === 'Old').status, 'verified', 'older rows present in Cloud should show as saved');
  log.fail(plan, 'Network error');
  setTracking(rows.concat([old]));
  setRemote({ A: [], Old: [old] });
  items = await log.list(date);
  assert.deepEqual(Array.from(items.map(x => x.campaign)), ['Old'], 'a rejected local row is hidden even if it remains in Tracking');
  setTracking([]);
  items = await log.list(date);
  assert.equal(items.length, 0, 'a rejected send is not shown as a failed Cloud receipt');
  setRemote({ A: [] });
  items = await log.list(date);
  assert.equal(items.length, 0, 'a rejected send does not create a failed log row after Cloud is checked');
  assert.equal(log.readAttempts()[0].status, 'rejected', 'technical failure remains available for device diagnostics');
});

test('older work is verified against the same Cloud campaign, sender, time, and every button', async () => {
  const { log, setTracking, setRemote } = setup();
  const at = new Date().toISOString();
  const rows = [
    { campaign: 'Old promotion', shortName: 'Deal A', submittedBy: 'Bow', txnDate: at },
    { campaign: 'Old promotion', shortName: 'Deal B', submittedBy: 'Bow', txnDate: at },
  ];
  setTracking(rows);
  setRemote({ 'Old promotion': [rows[0]] });
  let item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'needs_check', 'a partial Cloud save must not be called a complete failure');
  assert.equal(item.cloudPartial, true);
  assert.equal(log.summarize([item]).campaigns, 0);

  setRemote({ 'Old promotion': rows.map(row => ({ ...row, submittedBy: 'Other' })) });
  item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'needs_check', 'another sender is not proof, but an old row is not a confirmed failed receipt');

  setRemote({ 'Old promotion': rows.map(row => ({ ...row, txnDate: '2026-01-01T00:00:00.000Z' })) });
  item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'needs_check', 'another submission time is not proof of a confirmed failed receipt');

  setRemote({ 'Old promotion': rows });
  item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'verified');
  assert.equal(log.summarize([item]).campaigns, 1);

  setRemote({ 'Old promotion': new Error('อ่านแคมเปญจาก Cloud ไม่สำเร็จ (404)') });
  item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'needs_check');
  assert.match(item.error, /ไม่พบรายการใน Cloud/);
  assert.equal(log.summarize([item]).campaigns, 0);

  setRemote({ 'Old promotion': new Error('Network timeout') });
  item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'needs_check', 'network errors must not be called failed saves');
});

test('older Cloud rows reveal buttons missing from Tracking without marking the Cloud save as failed', async () => {
  const { log, setTracking, setRemote } = setup();
  const at = new Date().toISOString();
  const rows = [
    { campaign: 'Older deal', shortName: 'Deal A', submittedBy: 'Bow', txnDate: at },
    { campaign: 'Older deal', shortName: 'Deal B', submittedBy: 'Bow', txnDate: at },
  ];
  setTracking([rows[0]]);
  setRemote({ 'Older deal': rows });
  const item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'verified');
  assert.equal(item.foundButtons, 1);
  assert.equal(item.expectedButtons, 2);
  assert.equal(item.trackingMismatch, true);
});

test('Cloud-confirmed submission is successful even when Tracking has no matching buttons yet', async () => {
  const { log, setTracking, setRemote } = setup();
  const payload = [{ campaign: 'Goodie', shortName: 'Deal 1' }];
  const plan = log.prepare('Item Set', payload);
  setTracking([]);
  setRemote({ Goodie: payload });
  const result = await log.verifyPlan(plan);
  assert.equal(result[0].ok, false, 'complete workflow still waits for Tracking');
  assert.equal(result[0].cloudSaved, true);
  await log.afterSave(plan);
  assert.equal(log.readAttempts()[0].status, 'verified', 'save result follows Cloud, not Tracking');
  const item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'verified');
  assert.equal(item.foundButtons, 0);
  assert.equal(item.expectedButtons, 1);
  assert.equal(item.trackingMismatch, true);

  setRemote({ Goodie: [] });
  const absent = (await log.list(log.today()))[0];
  assert.equal(absent.status, 'needs_check', 'without a success message, a missing row is not labelled as an unexpected loss');
});

test('failed status is reserved for a submission that was shown as successful before disappearing from Cloud', async () => {
  const { log, setTracking, setRemote } = setup();
  const payload = [{ campaign: 'Confirmed deal', shortName: 'Deal 1' }];
  const plan = log.prepare('Item Set', payload);
  setTracking(payload);
  setRemote({ 'Confirmed deal': payload });
  let complete;
  await log.afterSave(plan, { onDone: value => { complete = value; } });
  assert.equal(complete, true);
  assert.ok(log.readAttempts()[0].successShownAt);
  setRemote({ 'Confirmed deal': [] });
  const item = (await log.list(log.today()))[0];
  assert.equal(item.status, 'failed');
  assert.match(item.error, /เคยยืนยันว่าบันทึกสำเร็จ/);
});

test('a send reported as failed is shown as saved if its write actually reached Cloud', async () => {
  const { log, setTracking, setRemote } = setup();
  const payload = [{ campaign: 'Late acknowledgment', shortName: 'Deal 1' }];
  const plan = log.prepare('Item Set', payload);
  log.fail(plan, 'Connection lost after write');
  setTracking([]);
  setRemote({ 'Late acknowledgment': payload });
  const entries = await log.list(log.today());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'verified');
  assert.equal(entries[0].trackingMismatch, true);
});

test('a successful retry replaces an earlier failed attempt for the same campaign and buttons', async () => {
  const { log, setTracking, setRemote } = setup();
  const first = [{ campaign: 'Goodie', shortName: 'Deal A' }];
  const failedPlan = log.prepare('Item Set', first);
  log.fail(failedPlan, 'Cloud write failed');
  const retry = [{ campaign: 'Goodie', shortName: 'Deal A' }];
  log.prepare('Item Set', retry);
  setTracking(retry);
  setRemote({ Goodie: retry });
  const entries = await log.list(log.today());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'verified');
  assert.equal(log.summarize(entries).failed, 0);
  assert.equal(log.readAttempts().length, 2, 'the attempt history is retained internally');
});

test('Admin and IT see every submitter while MKT and RD see only their own', async () => {
  const date = new Date().toISOString();
  const rows = [
    { campaign: 'MKT promo', shortName: 'M1', submissionId: 'SUB-M', submissionExpectedButtons: 1, submittedBy: 'Bow', txnDate: date },
    { campaign: 'RD promo', shortName: 'R1', submissionId: 'SUB-R', submissionExpectedButtons: 1, submittedBy: 'RD user', txnDate: date },
    { campaign: 'IT promo', shortName: 'I1', submissionId: 'SUB-I', submissionExpectedButtons: 1, submittedBy: 'IT user', txnDate: date },
  ];
  const remote = Object.fromEntries(rows.map(row => [row.campaign, [row]]));
  const it = setup('IT', 'IT user');
  it.setTracking(rows); it.setRemote(remote);
  assert.equal(it.log.canViewAll(), true);
  const all = await it.log.list(it.log.today());
  assert.deepEqual(Array.from(all.map(entry => entry.user)).sort(), ['Bow', 'IT user', 'RD user']);
  assert.ok(all.every(entry => entry.status === 'verified'));
  assert.deepEqual(Array.from((await it.log.list(it.log.today(), { scope: 'mine' })).map(entry => entry.campaign)), ['IT promo']);

  const admin = setup('Admin', 'Super Admin');
  admin.setTracking(rows); admin.setRemote(remote);
  assert.equal(admin.log.canViewAll(), true);
  assert.deepEqual(Array.from((await admin.log.list(admin.log.today())).map(entry => entry.user)).sort(), ['Bow', 'IT user', 'RD user']);
  assert.equal((await admin.log.list(admin.log.today(), { scope: 'mine' })).length, 0);

  const mkt = setup('MKT', 'Bow');
  mkt.setTracking(rows); mkt.setRemote(remote);
  assert.equal(mkt.log.canViewAll(), false);
  assert.deepEqual(Array.from((await mkt.log.list(mkt.log.today(), { scope: 'all' })).map(entry => entry.campaign)), ['MKT promo']);

  const rd = setup('RD', 'RD user');
  rd.setTracking(rows); rd.setRemote(remote);
  assert.deepEqual(Array.from((await rd.log.list(rd.log.today(), { scope: 'all' })).map(entry => entry.campaign)), ['RD promo']);

  const adminHq = setup('Admin HQ', 'Admin HQ');
  adminHq.setTracking(rows); adminHq.setRemote(remote);
  assert.equal(adminHq.log.canViewAll(), false, 'Admin HQ is a separate restricted role');
});

test('daily summary counts ten distinct campaigns and keeps verification states separate', () => {
  const { log } = setup();
  const entries = Array.from({ length: 10 }, (_, i) => ({ campaign: 'Campaign ' + (i + 1), status: i < 7 ? 'verified' : i === 7 ? 'needs_check' : i === 8 ? 'failed' : 'legacy' }));
  entries.push({ campaign: 'Campaign 1', status: 'verified' });
  const summary = log.summarize(entries);
  assert.equal(summary.campaigns, 7, 'only distinct Cloud-verified campaigns count as saved');
  assert.equal(summary.submissions, 11, 'each send attempt still appears in the log');
  assert.equal(summary.verified, 8);
  assert.equal(summary.pending, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.legacy, 1, 'legacy Tracking rows are not counted as Cloud-verified saves');
  const failedOnly = log.summarize([{ campaign: 'Failed A', status: 'failed' }, { campaign: 'Failed A', status: 'failed' }]);
  assert.equal(failedOnly.campaigns, 0, 'failed attempts must never appear as saved campaigns');
  assert.equal(failedOnly.submissions, 2, 'failed attempts remain visible in total history');
  assert.equal(failedOnly.failed, 2);
});

test('ten campaigns submitted today appear as ten Cloud-verified successes', async () => {
  const { log, setTracking, setRemote } = setup('MKT', 'Bow');
  const now = new Date().toISOString();
  const rows = Array.from({ length: 10 }, (_, i) => ({
    campaign: 'Promo ' + (i + 1), shortName: 'Button ' + (i + 1),
    submissionId: 'SUB-' + (i + 1), submissionExpectedButtons: 1,
    submittedBy: 'Bow', txnDate: now,
  }));
  setTracking(rows);
  setRemote(Object.fromEntries(rows.map(row => [row.campaign, [row]])));
  const entries = await log.list(log.today());
  const summary = log.summarize(entries);
  assert.equal(summary.campaigns, 10);
  assert.equal(summary.submissions, 10);
  assert.equal(summary.verified, 10);
  assert.equal(summary.pending, 0);
  assert.equal(summary.failed, 0);
  assert.ok(entries.every(entry => entry.user === 'Bow'));
});


test('both success-dialog choices complete the Co-Promo follow-up before navigating', async () => {
  for (const isConfirmed of [true, false]) {
    const f=setup(),events=[],rows=[{campaign:'TOTO',shortName:'Discount'}];
    const plan=f.log.prepare('Bill Discount',rows);f.setTracking(rows);f.setRemote({TOTO:rows});
    f.context.document={getElementById(){return null;}};
    f.context.loadPage=page=>events.push('navigate:'+page);
    f.context.Swal={fire:async options=>{if(options.icon==='success')events.push('success');return {isConfirmed};},showLoading(){}};
    let release;const followUp=new Promise(resolve=>{release=resolve;});
    const finished=f.log.afterSave(plan,{onAfter:()=>{events.push('copro');return followUp.then(()=>events.push('copro-complete'));}});
    for(let i=0;i<20;i++)await Promise.resolve();
    assert.deepEqual(events,['success','copro'],'Co-Promo cannot be skipped by choosing history');
    release();assert.equal(await finished,true);
    assert.deepEqual(events,['success','copro','copro-complete',...(isConfirmed?['navigate:SubmissionLog']:[])]);
  }
});
test('unverified submissions do not start the Co-Promo follow-up',async()=>{
 const f=setup(),plan=f.log.prepare('Bill Discount',[{campaign:'TOTO',shortName:'Missing'}]);let calls=0;
 assert.equal(await f.log.afterSave(plan,{onAfter:()=>calls++}),false);assert.equal(calls,0);
});
test('all promotion forms show save success only after complete Cloud readback',async()=>{
 for(const form of ['Item Set','Coupon','Bill Discount','Voucher'])for(const state of ['missing','offline','partial','saved']){
  const f=setup(),rows=[{campaign:'Cloud proof',shortName:'A'},{campaign:'Cloud proof',shortName:'B'}],plan=f.log.prepare(form,rows),dialogs=[];
  f.setTracking(rows);f.setRemote({'Cloud proof':state==='saved'?rows:state==='partial'?rows.slice(0,1):state==='offline'?new Error('unavailable'):[]});
  f.context.Swal={fire:async options=>{dialogs.push(options);return {isConfirmed:false};},showLoading(){}};
  f.context.document={getElementById(){return null;}};f.context.loadPage=()=>{};
  let reset=false,copro=false;const ok=await f.log.afterSave(plan,{onDone:value=>reset=value,onAfter:()=>copro=true});
  assert.equal(ok,state==='saved',form+':'+state);assert.equal(reset,ok);assert.equal(copro,ok);
  assert.equal(dialogs.some(d=>d.icon==='success'),ok);
  if(ok)assert.equal(dialogs.find(d=>d.icon==='success').title,'ส่งและบันทึกข้อมูลสำเร็จ');
 }
});
