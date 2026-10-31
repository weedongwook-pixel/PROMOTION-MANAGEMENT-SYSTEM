const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{load,database,actor,grant}=require('./helpers/copro-context.cjs');
// Send-mail page for any promotion: a promotion never registered with the email system (announced before it,
// or saved without mail) is registered on first send; extend / shorten / cancel mail repeats the announcement
// details; a "new email" subject names the job; the mail names the signed-in person who entered it.
const staff={...actor,staffId:'staff-1',staffVersion:1,staffName:'Wanvisa Chanthowong',staffEmail:'wanvisa.c@rocksgroup.com'};
async function fixture(rows){
 const a=load(['staff','templates','gmail','registry','copro-model','copro-service','outbox']),DB=database(),env={DB,EMAIL_AUTH_MODE:'gmail_owner'};
 DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER); CREATE TABLE promo_commit_guard(id INTEGER PRIMARY KEY CHECK(id=1)); CREATE TABLE promo_submission_receipts(submission_id TEXT PRIMARY KEY,response_json TEXT)');
 DB.db.exec(fs.readFileSync('sync-worker/migrations/006_gmail_owner_sessions.sql','utf8'));DB.db.exec(fs.readFileSync('sync-worker/migrations/007_email_staff.sql','utf8'));
 DB.db.prepare("INSERT INTO email_staff(id,username,name,can_send,can_it,version,created_at,updated_at) VALUES('staff-1','wanvisa.c@rocksgroup.com','Wanvisa Chanthowong',1,1,1,0,0)").run();
 grant(DB,actor,'submit');grant(DB,actor,'manage');a.isGmailOwner=()=>true;a.requireStaffPermission=async()=>{};
 const key='promo::c::'+encodeURIComponent(rows[0].campaign),value=JSON.stringify({m:{'2026-10':rows},w:[]});
 DB.db.prepare('INSERT INTO promo_store VALUES(?,?,5)').run(key,value);
 return {a,DB,env,key,value};
}
function dispatchEnv(a,DB,env){
 Object.assign(env,{EMAIL_CONNECTION_ENABLED:'true',EMAIL_COPRO_ENABLED:'true',EMAIL_SEND_ENABLED:'true'});
 DB.db.prepare("INSERT INTO email_connections VALUES(1,'it@rocks-foods.com','connected','cipher','scopes','now','now',1)").run();
 a.gmailAccess=async()=>'mock';a.gmailMessage=async id=>({messageId:id,threadId:'gmail-thread',headers:{'message-id':'<'+id+'@mail.gmail.com>'}});
 const sent=[];a.sendReply=async(token,snapshot)=>{sent.push(snapshot);return {outcome:'accepted',providerId:'sent-'+sent.length};};return sent;
}
const base={campaign:'Amaze อัปไซซ์ JFF to MFF',shortName:'Amaze JFF→MFF',promoType:'Upsize',start:'2026-10-01',end:'2026-12-31',itemCode:'101001',qty:1,codePromotion:'UP001',detail:'อัปไซซ์ JFF เป็น MFF เพิ่ม 10 บาท',condition:'เฉพาะหน้าร้าน'};

test('an extension of a promotion never registered with email: registers on send, full details, job subject, requester named',async()=>{
 const {a,DB,env,key,value}=await fixture([{...base,changeId:'chg-amaze-0001',changeStatus:'EXTENDED',changePreviousEnd:'2026-10-15',end:'2026-12-31'}]);
 assert.equal(JSON.stringify(await a.campaignLoop(staff,{campaignKey:key},env)),JSON.stringify({registered:false,bound:false}));
 await assert.rejects(a.previewPromotionChange(staff,{campaignKey:key,changeId:'chg-amaze-0001'},env),/email_campaign_unregistered/);
 assert.equal(JSON.stringify((await a.ensureCampaign(staff,{campaignKey:key,month:''},env)).created),'["2026-10"]');
 assert.equal((await a.ensureCampaign(staff,{campaignKey:key,month:''},env)).created.length,0,'registering twice is a no-op');
 assert.equal(DB.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v,value,'registration never rewrites the Cloud promotion');
 const loop=await a.campaignLoop(staff,{campaignKey:key},env);assert.equal(loop.registered,true);assert.equal(loop.bound,false);
 const policy=await a.publishThread(staff,{newMessage:true,subjectKind:'extended',mode:'production',campaignId:loop.campaignId,recipients:{to:['wanvisa.c@rocksgroup.com'],cc:[]},audience:[actor]},env);
 assert.equal(policy.subject,'แจ้งขยายโปร Amaze อัปไซซ์ JFF to MFF');
 const input={campaignKey:key,changeId:'chg-amaze-0001',policyId:policy.id,policyVersion:policy.version,recipients:policy.recipients,additionalMessage:'Test'};
 const preview=await a.previewPromotionChange(staff,input,env);
 assert.equal(preview.subject,'แจ้งขยายโปร Amaze อัปไซซ์ JFF to MFF');
 const text=preview.text;
 assert.match(text,/^แจ้งขยายระยะเวลาโปรโมชั่น\nชื่อแคมเปญ: Amaze อัปไซซ์ JFF to MFF\nวันที่สิ้นสุดเดิม → ใหม่: 2026-10-15 → 2026-12-31\nวันที่เริ่ม - วันที่สิ้นสุด: 2026-10-01 - 2026-12-31/);
 assert.match(text,/Type Promotion: Upsize\nCode Promotion: UP001\nชื่อปุ่ม: Amaze JFF→MFF\nรายละเอียดโปรฯ: อัปไซซ์ JFF เป็น MFF เพิ่ม 10 บาท\nเงื่อนไข: เฉพาะหน้าร้าน/);
 assert.match(text,/ข้อความเพิ่มเติม \/ Additional message: Test\nไฟล์แนบ: ไม่มี\n\n--\nแจ้งโดย\nWanvisa Chanthowong\nwanvisa\.c@rocksgroup\.com\nอีเมลนี้ส่งจากระบบ Promotion Management โดยใช้อีเมลกลาง it@rocks-foods\.com แทนผู้แจ้งด้านบน · หากมีคำถาม กรุณาติดต่อผู้แจ้งโดยตรง$/);
 await a.commitPromotionChange(staff,{...input,previewHash:preview.previewHash,confirmed:true},env);
 const sent=dispatchEnv(a,DB,env);await a.dispatchEmail(env);
 assert.equal(sent.length,1);assert.equal(sent[0].subject,'แจ้งขยายโปร Amaze อัปไซซ์ JFF to MFF');assert.equal(sent[0].newMessage,true);
 assert.equal(DB.db.prepare('SELECT status FROM email_outbox').get().status,'accepted');
 const after=await a.campaignLoop(staff,{campaignKey:key},env);assert.equal(after.bound,true);assert.equal(after.loop.id,policy.id,'later mail (IT included) replies in this new loop');
 DB.db.close();
});
test('an announcement of a promotion saved without mail can still be sent later from the send-mail page',async()=>{
 const {a,DB,env,key}=await fixture([base,{...base,shortName:'Amaze LFF',codePromotion:'UP002'}]);
 await a.ensureCampaign(staff,{campaignKey:key,month:'2026-10'},env);
 const c=(await a.listCoProCampaigns(staff,env)).items.find(x=>x.key===key);assert.equal(c.buttons.length,2);
 const policy=await a.publishThread(staff,{newMessage:true,subjectKind:'submitted',mode:'production',campaignId:c.id,recipients:{to:['team@rocksgroup.com'],cc:['boss@rocksgroup.com']},audience:[actor]},env);
 assert.equal(policy.subject,'แจ้งรายละเอียดโปร Amaze อัปไซซ์ JFF to MFF');
 const draft={campaignId:c.id,expectedVersion:c.version,policyId:policy.id,policyVersion:policy.version,recipients:policy.recipients,notificationOnly:true,records:[]};
 const preview=await a.previewCoPromo(staff,draft,env);
 assert.match(preview.text,/^แจ้งรายละเอียดโปรโมชั่น/);assert.match(preview.text,/ชื่อปุ่ม: Amaze LFF\nรายละเอียดโปรฯ: อัปไซซ์/);assert.match(preview.text,/\n--\nแจ้งโดย\nWanvisa Chanthowong\n/);
 await a.commitCoPromo(staff,{...draft,previewHash:preview.previewHash,confirmed:true},env);
 const sent=dispatchEnv(a,DB,env);await a.dispatchEmail(env);
 assert.equal(sent.length,1);assert.equal(DB.db.prepare('SELECT status FROM email_outbox').get().status,'accepted');DB.db.close();
});
test('unknown subject kinds fall back to the plain announcement subject; a mail without a staff session names no one',async()=>{
 const {a,DB,env,key}=await fixture([base]);await a.ensureCampaign(actor,{campaignKey:key},env);
 const id=(await a.campaignLoop(actor,{campaignKey:key},env)).campaignId;
 assert.equal((await a.publishThread(actor,{newMessage:true,subjectKind:'Injected',mode:'production',campaignId:id,recipients:{to:['x@rocksgroup.com'],cc:[]}},env)).subject,'แจ้งรายละเอียด Amaze อัปไซซ์ JFF to MFF');
 assert.doesNotMatch(a.renderCoProEmail({milestone:'submitted',notificationOnly:true,details:{campaign:'X',buttons:[]}}).text,/แจ้งโดย|แทนผู้แจ้ง/);
 await assert.rejects(a.ensureCampaign(actor,{campaignKey:'promo::c::Other'},env),/email_source_changed/);DB.db.close();
});
test('the send-mail page shows the mail body from Cloud data before recipients are chosen, without registering anything',async()=>{
 const {a,DB,env,key}=await fixture([{...base,changeId:'chg-amaze-0002',changeStatus:'CANCELLED',cancelReason:'ยอดขายต่ำ'}]);
 const r=await a.contentPreview(staff,{kind:'change',campaignKey:key,changeId:'chg-amaze-0002',additionalMessage:'ฝากแจ้งสาขา'},env);
 assert.match(r.text,/^แจ้งยกเลิกโปรโมชั่น\nชื่อแคมเปญ: Amaze อัปไซซ์ JFF to MFF\nสถานะ: ยกเลิกโปรโมชั่น\nเหตุผลการยกเลิก: ยอดขายต่ำ/);
 assert.match(r.text,/รายละเอียดโปรฯ: อัปไซซ์ JFF เป็น MFF เพิ่ม 10 บาท\nเงื่อนไข: เฉพาะหน้าร้าน\nข้อความเพิ่มเติม \/ Additional message: ฝากแจ้งสาขา\nไฟล์แนบ: ไม่มี\n\n--\nแจ้งโดย\nWanvisa/);
 assert.match((await a.contentPreview(staff,{kind:'submitted',campaignKey:key},env)).text,/^แจ้งรายละเอียดโปรโมชั่น[\s\S]*ชื่อปุ่ม: Amaze JFF→MFF/);
 assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_campaigns').get().n,0);
 await assert.rejects(a.contentPreview(staff,{kind:'change',campaignKey:key,changeId:'chg-none-0000'},env),/email_source_changed/);DB.db.close();
});
test('the note can go before the details, carries pasted images inline, and the signature closes the mail',async()=>{
 const {a,DB,env,key}=await fixture([{...base,changeId:'chg-amaze-0003',changeStatus:'EXTENDED',changePreviousEnd:'2026-10-15'}]);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
 await a.ensureCampaign(staff,{campaignKey:key},env);const loop=await a.campaignLoop(staff,{campaignKey:key},env);
 const policy=await a.publishThread(staff,{newMessage:true,subjectKind:'extended',mode:'production',campaignId:loop.campaignId,recipients:{to:['team@rocksgroup.com'],cc:[]}},env);
 const input={campaignKey:key,changeId:'chg-amaze-0003',policyId:policy.id,policyVersion:1,recipients:policy.recipients,additionalMessage:'เรียนทุกท่าน\nแจ้งขยายตามภาพ',messagePosition:'before',images:[{mime:'image/png',base64:png}]};
 const preview=await a.previewPromotionChange(staff,input,env);
 assert.match(preview.text,/^เรียนทุกท่าน\nแจ้งขยายตามภาพ\n\[รูปภาพ 1\]\n\nแจ้งขยายระยะเวลาโปรโมชั่น\n/);assert.doesNotMatch(preview.text,/Additional message/);
 const after=await a.previewPromotionChange(staff,{...input,messagePosition:'after'},env);
 assert.match(after.text,/เงื่อนไข: เฉพาะหน้าร้าน\nข้อความเพิ่มเติม \/ Additional message: เรียนทุกท่าน\nแจ้งขยายตามภาพ\n\[รูปภาพ 1\]\nไฟล์แนบ: ไม่มี\n\n--\nแจ้งโดย/);
 assert.notEqual(after.previewHash,preview.previewHash,'the position is part of what was confirmed');
 await assert.rejects(a.previewPromotionChange(staff,{...input,images:[{mime:'text/html',base64:png}]},env),/email_image_invalid/);
 await a.commitPromotionChange(staff,{...input,previewHash:preview.previewHash,confirmed:true},env);
 const sent=dispatchEnv(a,DB,env);a.sendReply=async(token,snapshot)=>{sent.push(a.buildReply(snapshot));return {outcome:'accepted',providerId:'x'};};
 await a.dispatchEmail(env);assert.equal(sent.length,1);
 const mime=Buffer.from(sent[0].raw,'base64url').toString();
 assert.match(mime,/Content-Type: multipart\/related; boundary="pc_img_/);assert.match(mime,/Content-ID: <pc-img-1@rocks-foods\.com>/);assert.match(mime,/Content-Disposition: inline; filename="image-1\.png"/);
 const html=a.renderCoProEmail(JSON.parse(DB.db.prepare('SELECT snapshot_json FROM email_outbox').get().snapshot_json)).html;
 assert.match(html,/<img src="cid:pc-img-1@rocks-foods\.com"/);assert.match(html,/border-top:1px solid #d1d5db[\s\S]*Wanvisa Chanthowong[\s\S]*mailto:wanvisa\.c@rocksgroup\.com/);
 DB.db.close();
});
test('subject search shows one result per mail loop: its latest message',async()=>{
 const {a,DB,env}=await fixture([base]);a.gmailAccess=async()=>'mock';
 a.gmailGet=async()=>({messages:[{id:'m3',threadId:'A'},{id:'m2',threadId:'A'},{id:'m9',threadId:'B'}]});
 const msg={m3:['A','Re: แจ้งขยาย Amaze','later@rocksgroup.com'],m2:['A','แจ้งขยาย Amaze','first@rocksgroup.com'],m9:['B','Amaze อื่น','x@rocksgroup.com']};
 a.gmailMessage=async id=>({messageId:id,threadId:msg[id][0],headers:{subject:msg[id][1],to:msg[id][2]+', it@rocks-foods.com',from:'a@rocksgroup.com'}});
 const r=await a.searchThreads(actor,'subject:"Amaze"',env,{},'','production');
 assert.equal(JSON.stringify(r.items.map(x=>[x.messageId,x.threadId,x.to])),JSON.stringify([['m3','A','later@rocksgroup.com, it@rocks-foods.com'],['m9','B','x@rocksgroup.com, it@rocks-foods.com']]));DB.db.close();
});
