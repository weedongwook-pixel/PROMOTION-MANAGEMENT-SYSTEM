const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {database}=require('./helpers/email-context.cjs');
test('CoPro schema adds isolated tables without altering campaign bytes',()=>{
  const DB=database();DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');DB.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::c::same','{"m":{"2026-10":[]}}',17);const before=DB.db.prepare('SELECT * FROM promo_store').all();
  DB.db.exec(fs.readFileSync('sync-worker/migrations/004_copro_email.sql','utf8'));
  assert.deepEqual(DB.db.prepare('SELECT * FROM promo_store').all(),before);
  assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'email_%'").get().n,11);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);DB.db.close();
});
