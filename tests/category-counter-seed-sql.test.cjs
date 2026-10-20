const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { sql } = require('../scripts/category-counter-seed-sql.cjs');

test('category seed excludes coupon numbers and phones but retains real code highwaters and counter content', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');
  const put = (k,v) => db.prepare('INSERT INTO promo_store VALUES(?,?,42)').run(k,JSON.stringify(v));
  const counter = { types:{promo:{cursor:4000,seeded:true}}, reservations:{
    'item::109067':{type:'item',code:'109067',status:'RELEASED'},
  }, cats:{'105':{cursor:90,baseline:55,freed:[1]},'999':{cursor:15}}, log:[{act:'TEST'}] };
  put('pc_code_counter_v1',counter);
  put('promo::c::test',{rows:[{itemCode:'106200',codeItemSet:'109070',phone:'10945621451',code:'106463770050'}]});
  put('pc_code_requests',[{itemCode:'106463770050',code:'10945621451'}]);
  put('pc_member_coupons',{'10945621451':{code:'106463770050'}});
  put('promo::meta',{npd:[{items:[{code:'1061002'}]}],npdProducts:[{itemCode:'105092'}],users:[{phone:'10945621451',code:'106463770050'}]});
  put('pc_itemset_comp',{'109075':[{code:'105095'}]});
  put('pc_product_promo',{'105096':[{prCode:'P4000'}]});
  const before = db.prepare('SELECT * FROM promo_store WHERE k!=? ORDER BY k').all('pc_code_counter_v1');
  const audit = db.prepare(sql()).all();
  assert.deepEqual(audit.map(r=>[r.cat,r.cursor,r.next_code]),[['105',96,'105097'],['106',1002,'1061003'],['109',75,'109076']]);
  db.exec(sql(true));
  const saved = db.prepare('SELECT * FROM promo_store WHERE k=?').get('pc_code_counter_v1');
  const updated = JSON.parse(saved.v);
  assert.deepEqual(updated.types,counter.types);
  assert.deepEqual(updated.reservations,counter.reservations);
  assert.deepEqual(updated.log,counter.log);
  assert.deepEqual(updated.cats['999'],counter.cats['999']);
  for(const cat of ['105','106','109']) {
    assert.equal(updated.cats[cat].seeded,true);
    assert.deepEqual(updated.cats[cat].freed,[]);
  }
  assert(saved.updated_at>42);
  assert.deepEqual(db.prepare('SELECT * FROM promo_store WHERE k!=? ORDER BY k').all('pc_code_counter_v1'),before);
  db.exec(sql(true));
  assert.equal(db.prepare('SELECT v FROM promo_store WHERE k=?').get('pc_code_counter_v1').v,saved.v);
  db.close();
});
