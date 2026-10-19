const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../js/tracking-status.js');
test('pending new submissions precede completed work, and OP completion orders finished work',()=>{
 const item=(name,date,itStatus='PENDING',opStatus='WAITING',opDoneDate='')=>({campaign:name,shortName:name,txnDate:date,itStatus,opStatus,opDoneDate});
 const rows=[item('finished-old','2026-10-18','COMPLETE','CONFIRMED','2026-10-17'),item('pending-old','2026-10-15'),item('finished-new','2026-09-01','COMPLETE','CONFIRMED','2026-10-19'),item('pending-new','2026-10-19')];
 rows.forEach(r=>r._tracking=S.summarize([r]));rows.sort(S.compareCampaigns);
 assert.deepEqual(rows.map(r=>r.campaign),['pending-new','pending-old','finished-new','finished-old']);
});
test('revision time promotes pending work but generic background updates do not',()=>{
 const older={shortName:'A',txnDate:'2026-10-01',updatedDate:'2026-10-20',itStatus:'PENDING'},newer={shortName:'B',txnDate:'2026-10-19',itStatus:'PENDING'};
 older._tracking=S.summarize([older]);newer._tracking=S.summarize([newer]);assert.ok(S.compareCampaigns(older,newer)>0);
 older.revisionRequestedAt='2026-10-21';older._tracking=S.summarize([older]);assert.ok(S.compareCampaigns(older,newer)<0);
});
