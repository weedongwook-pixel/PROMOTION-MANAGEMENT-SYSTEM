const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database}=require('./helpers/email-context.cjs');
const fs=require('node:fs');
test('verified submitter has only explicit permissions; browser role and matching display name grant nothing',async()=>{
  const a=load(['config','identity']),DB=database(),f=await require('./helpers/email-jwt.cjs').fixture();
  DB.db.exec(fs.readFileSync('sync-worker/migrations/004_copro_email.sql','utf8'));
  const e={...f.env,DB};
  DB.db.prepare('INSERT INTO email_actor_permissions VALUES (?,?,?,1)').run(f.actor.tenantId,f.actor.objectId,'submit');
  const actor=await a.verifyEmailActor(await f.request(),e,f.deps);
  assert.equal(actor.objectId,f.actor.objectId);await a.requireEmailPermission(actor,'submit',e);
  await assert.rejects(a.requireEmailPermission(actor,'manage',e));await assert.rejects(a.requireEmailPermission(actor,'it',e));
  const other=await a.verifyEmailActor(await f.request({oid:'44444444-4444-4444-8444-444444444444',name:'Same name'}),e,f.deps);
  await assert.rejects(a.requireEmailPermission(other,'submit',e));
  DB.db.exec('UPDATE email_actor_permissions SET enabled=0');await assert.rejects(a.requireEmailPermission(actor,'submit',e));
  await assert.rejects(a.verifyEmailActor(new Request('https://example.test',{headers:{Authorization:'Bearer shared','X-Role':'Admin'}}),e,f.deps));
  await assert.rejects(a.verifyEmailAdmin(await f.request(),e,f.deps));DB.db.close();
});
