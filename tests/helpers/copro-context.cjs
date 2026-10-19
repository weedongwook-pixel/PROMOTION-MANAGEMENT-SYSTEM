const fs=require('node:fs');
const base=require('./email-context.cjs');
exports.load=(extra=[])=>base.load(['config','identity','storage','oauth','attachments',...extra]);
exports.database=()=>{const DB=base.database();DB.db.exec(fs.readFileSync('sync-worker/migrations/004_copro_email.sql','utf8'));DB.db.exec(fs.readFileSync('sync-worker/migrations/005_email_production_threads.sql','utf8'));return DB;};
exports.actor={tenantId:'11111111-1111-4111-8111-111111111111',objectId:'33333333-3333-4333-8333-333333333333'};
exports.grant=(DB,actor,permission)=>DB.db.prepare('INSERT INTO email_actor_permissions VALUES (?,?,?,1)').run(actor.tenantId,actor.objectId,permission);
