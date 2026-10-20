const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,database}=require('./helpers/copro-context.cjs');
function fixture(){const a=load(['attachments','templates','gmail']),DB=database();DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');const file={name:'เงื่อนไขโปรฯ.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:Buffer.from([0,1,2,255,10,13]).toString('base64')};DB.db.prepare('INSERT INTO promo_store VALUES(?,?,1)').run('pc_promo_files',JSON.stringify({f1:file}));return {a,DB,file};}
test('mail attachments preserve original bytes, deduplicate references and bind preview to immutable content',async()=>{
 const {a,DB,file}=fixture(),rows=[{attachment:'file:f1'},{attachment:'file:f1'}];
 const result=await a.readEmailAttachments(rows,{DB});assert.equal(result.manifest.length,1);assert.equal(result.manifest[0].name,file.name);assert.equal(result.files[0].base64,file.base64);assert.equal(result.manifest[0].base64,undefined);
 const snap={threadId:'t',rfcMessageId:'<o@example.com>',subject:'Original loop',recipients:{to:['test@example.net'],cc:[]},milestone:'submitted',details:{campaign:'Test'},attachments:result.files};
 const mime=Buffer.from(a.buildReply(snap).raw,'base64url').toString('utf8');assert.match(mime,/multipart\/mixed/);assert.match(mime,/Content-Disposition: attachment;/);const parsed=require('node:child_process').spawnSync('python3',['-c',"import sys,json,base64;from email import policy;from email.parser import BytesParser;m=BytesParser(policy=policy.default).parsebytes(sys.stdin.buffer.read());a=list(m.iter_attachments())[0];print(json.dumps({'name':a.get_filename(),'base64':base64.b64encode(a.get_payload(decode=True)).decode()}))"],{input:mime,encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);assert.deepEqual(JSON.parse(parsed.stdout),{name:file.name,base64:file.base64});assert.ok(mime.includes(file.base64));assert.match(mime,/In-Reply-To: <o@example.com>/);
 DB.db.prepare('UPDATE promo_store SET v=?,updated_at=2').run(JSON.stringify({f1:{...file,base64:Buffer.from('changed').toString('base64')}}));
 await assert.rejects(a.readEmailAttachments(rows,{DB},result.manifest),/email_attachments_changed/);DB.db.close();
});
test('missing, external, malformed or oversized attachment cannot silently disappear from email',async()=>{
 const {a,DB,file}=fixture();
 await assert.rejects(a.readEmailAttachments([{attachment:'file:gone'}],{DB}),/email_attachment_missing/);
 await assert.rejects(a.readEmailAttachments([{attachment:'nofile:original.xlsx'}],{DB}),/email_attachment_missing/);
 await assert.rejects(a.readEmailAttachments([{attachment:'https://example.net/file'}],{DB}),/email_attachment_unsupported/);
 for(const patch of [{base64:'bad!!'},{name:'a\r\nBcc: bad'},{mime:'x\r\ny'},{base64:'AAAA'.repeat(5000000)}]){
  DB.db.prepare('UPDATE promo_store SET v=?').run(JSON.stringify({f1:{...file,...patch}}));await assert.rejects(a.readEmailAttachments([{attachment:'file:f1'}],{DB}));
 }DB.db.close();
});
