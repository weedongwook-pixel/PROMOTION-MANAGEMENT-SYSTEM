const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
test('email migration is additive and isolated from campaign enumeration',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at INTEGER NOT NULL);');
  db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('campaign','{"unchanged":true}',123);
  for(const file of ['001_history.sql','002_submission_receipts.sql'])db.exec(fs.readFileSync('sync-worker/migrations/'+file,'utf8'));
  const before=db.prepare('SELECT k,v,updated_at FROM promo_store').all();
  db.exec(fs.readFileSync('sync-worker/migrations/003_email_connection.sql','utf8'));
  db.exec("INSERT INTO email_admin_grants VALUES ('test','test',1,'test')");
  assert.deepEqual(db.prepare('SELECT k,v,updated_at FROM promo_store').all(),before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM email_admin_grants').get().n,1);
  db.prepare('UPDATE promo_store SET v=? WHERE k=?').run('{"normal_save":true}','campaign');
  assert.equal(db.prepare('SELECT v FROM promo_store_history').get().v,before[0].v);
  db.close();
});
