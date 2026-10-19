const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {database,actor,grant}=require('./helpers/copro-context.cjs');
test('a primary receipt race never returns another verified owner receipt',async()=>{
  const DB=database();DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');DB.db.exec(fs.readFileSync('sync-worker/migrations/002_submission_receipts.sql','utf8'));
  const other={...actor,objectId:'44444444-4444-4444-8444-444444444444'};grant(DB,actor,'submit');grant(DB,other,'submit');
  const c={crypto:webcrypto,fetch,Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,Date,atob,btoa};vm.createContext(c);vm.runInContext(require('./helpers/sync-worker-source.cjs')().replace('export default','globalThis.worker='),c);
  const row={campaign:'Race',shortName:'A',month:'2026-10',submissionBatchId:'batch-race-1234',itemCode:'101001'};
  const body={submissionId:'batch-race-1234',actor:'Same display name',expectedButtons:1,writes:[{key:'promo::c::Race',expectedUpdatedAt:null,value:JSON.stringify({m:{'2026-10':[row]},w:[]})}]},competitor=structuredClone(body),env={DB,CLOUD_FIRST_ENABLED:'true'},batch=DB.batch.bind(DB);
  DB.batch=async()=>{DB.batch=batch;await c.PC_Email.commitPilotPrimary(other,competitor,env);throw Error('simulated first writer race');};
  await assert.rejects(c.PC_Email.commitPilotPrimary(actor,body,env),/email_campaign_denied/);
  assert.equal(DB.db.prepare('SELECT owner_oid FROM email_campaigns').get().owner_oid,other.objectId);DB.db.close();
});
