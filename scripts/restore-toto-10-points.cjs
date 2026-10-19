// Targeted recovery: never replace the whole Cloud store or alter other campaigns.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const campaign = 'TOTO - 10 คะแนน ลด 10 บาทเมนู Fries';
const key = 'promo::c::' + encodeURIComponent(campaign);
const q = x => "'" + String(x).replace(/'/g,"''") + "'";
function query(sql) {
  const out = execFileSync(process.execPath,['/Users/oneday/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js','d1','execute','potato-promo','--remote','--json','--command',sql],{cwd:path.join(root,'sync-worker'),encoding:'utf8',maxBuffer:32*1024*1024});
  const result=JSON.parse(out)[0];assert.equal(result.success,true);return result.results;
}
const records=query(`SELECT k,v,updated_at FROM promo_store WHERE k IN ('promo::meta','promo::deleted',${q(key)})`);
assert.ok(!records.some(r=>r.k===key),'Campaign already exists: stop rather than duplicate');
const meta=records.find(r=>r.k==='promo::meta');assert.ok(meta);
const snap=JSON.parse(meta.v).trash.find(t=>t.id==='TRASHMV9AEBK5');assert.ok(snap);
assert.deepEqual(snap.campaigns,[campaign]);
for(const field of ['pp','comp']) assert.equal(Object.keys(snap[field]||{}).length,0,'Related tables require separate recovery: '+field);
for(const field of ['npd','cr']) assert.equal((snap[field]||[]).length,0,'Related rows require separate recovery: '+field);
const rows=Object.values(snap.months).flat();assert.ok(rows.length);assert.ok(rows.every(r=>r.campaign===campaign));
const codes=[...new Set(rows.flatMap(r=>[r.codePromotion,r.codeItemSet,r.itemPromotion]).filter(c=>c && !['N/A','NORMAL','ONLINE','OFFLINE','-'].includes(c)))];
if(codes.length){
  const occupied=query(`SELECT p.k FROM promo_store p,json_each(p.v,'$.w') j WHERE p.k LIKE 'promo::c::%' AND (json_extract(j.value,'$.codePromotion') IN (${codes.map(q).join(',')}) OR json_extract(j.value,'$.codeItemSet') IN (${codes.map(q).join(',')}))`);
  assert.equal(occupied.length,0,'A recovery code is in use by another campaign; stop');
}
const source=fs.readFileSync(path.join(root,'js/cloud-store.js'),'utf8');
const start=source.indexOf('  function workingForStore(');const end=source.indexOf('  function campOf(',start);assert.ok(start>=0&&end>start);
const ctx=vm.createContext({});vm.runInContext(source.slice(start,end),ctx);
const tomb=records.find(r=>r.k==='promo::deleted');const tombTs=tomb ? Number(JSON.parse(tomb.v)[campaign])||0 : 0;
const now=Math.max(Date.now(),tombTs+1);
const block={m:snap.months,w:ctx.workingForStore({months:snap.months}),_ts:now};
console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',campaign,months:Object.keys(block.m),rows:rows.length,buttons:block.w.length,statuses:[...new Set(rows.map(r=>r.itStatus))],codes:[...new Set(rows.flatMap(r=>[r.codePromotion,r.codeItemSet]).filter(Boolean))],relatedTablesEmpty:true,backupExists:fs.existsSync(path.join(root,'private-backups/potato-before-toto-restore-20261015.sql'))},null,2));
if(!process.argv.includes('--apply'))process.exit(0);
assert.ok(fs.statSync(path.join(root,'private-backups/potato-before-toto-restore-20261015.sql')).size>100000);
const tombGuard=tomb ? `EXISTS(SELECT 1 FROM promo_store WHERE k='promo::deleted' AND updated_at=${Number(tomb.updated_at)})` : `NOT EXISTS(SELECT 1 FROM promo_store WHERE k='promo::deleted')`;
query(`INSERT INTO promo_store(k,v,updated_at) SELECT ${q(key)},${q(JSON.stringify(block))},${now} WHERE NOT EXISTS(SELECT 1 FROM promo_store WHERE k=${q(key)}) AND EXISTS(SELECT 1 FROM promo_store WHERE k='promo::meta' AND updated_at=${Number(meta.updated_at)}) AND ${tombGuard}`);
const verified=query(`SELECT v FROM promo_store WHERE k=${q(key)}`);assert.equal(verified.length,1);assert.deepEqual(JSON.parse(verified[0].v),JSON.parse(JSON.stringify(block)));
console.log('Verified: exact campaign restored; original trash recovery copy retained; unrelated records unchanged.');
