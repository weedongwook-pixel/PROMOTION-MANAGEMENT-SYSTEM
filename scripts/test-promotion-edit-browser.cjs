// End-to-end local harness: actual forms, browser Cloud adapter and Worker;
// SQLite substitutes only D1 transport. Every request stays inside this test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
class D1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT NOT NULL,updated_at INTEGER NOT NULL)');this.db.exec(fs.readFileSync(path.join(root,'sync-worker/migrations/002_submission_receipts.sql'),'utf8'));}
 prepare(sql){const s=this.db.prepare(sql);let v=[];return{bind(...a){v=a;return this;},async first(){return s.get(...v)||null;},async all(){return{results:s.all(...v)};},async run(){return{meta:{changes:Number(s.run(...v).changes)}};}};}
 async batch(ss){this.db.exec('BEGIN');try{for(const s of ss)await s.run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(require('../tests/helpers/sync-worker-source.cjs')()).toString('base64'))).default;
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const fullShell=process.argv.includes('--shell');
 const liveFixtures=process.argv.includes('--live-fixtures');let live=[],liveSnapshot=null;
 if(liveFixtures){
  const source=fs.readFileSync(path.join(root,'js/cloud-store.js'),'utf8');const cfg=Function('return ('+source.match(/var DEFAULT_CFG = (\{[^;]+\});/)[1]+')')();
  const response=await fetch(cfg.url+'/promo/store',{headers:{Authorization:'Bearer '+cfg.token}});assert.ok(response.ok);const data=await response.json();liveSnapshot=data;
  const model=require('../js/promotion-edit-model.js');
  const target=process.argv.find(a=>a.startsWith('--campaign='))?.slice('--campaign='.length);
  for(const [key,value] of Object.entries(data.keys||{})){if(!key.startsWith('promo::c::'))continue;const block=JSON.parse(value);for(const [month,rows] of Object.entries(block.m||{})){const actor=rows[0]?.submittedBy||rows[0]?.reporter;if(!rows[0]?.campaign||target&&rows[0].campaign!==target||!model.policy(block,actor,month).allowed)continue;const form=model.toForm(block,month).form;live.push([form,rows[0].promoType,{block,month,actor}]);}}
  assert.ok(live.length,'No eligible campaign found');
 }
 try{for(const [form,type,liveFixture] of (liveFixtures?live:process.argv.includes('--tracking-workflow')||process.argv.includes('--op-theme')?[['Proposal','Item Set']]:[['Proposal','Item Set'],['Coupon','Item Coupon'],['BillDiscountProposal','Bill Discount'],['VoucherProposal','Voucher']])){
  const onlyForm=process.argv.find(a=>a.startsWith('--form='))?.slice(7);if(onlyForm&&form!==onlyForm)continue;
  const campaign=liveFixture?Object.values(liveFixture.block.m).flat()[0].campaign:'TOTO';
  const actor=process.argv.includes('--test-mkt')?'MKT Team':liveFixture?liveFixture.actor:'Bow';
  const db=new D1(),key='promo::c::'+encodeURIComponent(campaign),month=liveFixture?liveFixture.month:'2026-11',errors=[],posts=[];
  const base={campaign:'TOTO',shortName:'FRIES TEST',submittedBy:'Bow',reporter:'Bow',txnDate:'2026-10-15T08:00:00Z',submittedDate:'2026-10-15T08:00:00Z',promoType:type,submissionForm:form,itStatus:'PENDING',opStatus:'WAITING',start:'2026-11-01',end:'2026-11-30',stores:'ALL STORES',saleMode:'LINEMAN',itemCode:'101003',itemNameEN:'MEGA FRIES',qty:2,gross:95,netPrice:180,discount:'10',codePromotion:'IC0688',codeItemSet:'1073601',detail:'รายละเอียดเดิม',mechanic:'เงื่อนไขเดิม',kitchen:'MFF',minAmount:129,attachment:'file:old',codeChannel:'Normal'};
  const row2={...base,itemCode:'SS0035',itemNameEN:'Drink All',qty:1,gross:25,isSubset:'1',chooseMin:1,chooseMax:2};
  const fixtureItemSetCode=form==='Proposal'?'1073601':'';base.codeItemSet=fixtureItemSetCode;row2.codeItemSet=fixtureItemSetCode;
  let fixtureRows=form==='Coupon'?Array.from({length:6},(_,n)=>[base,row2,{...base,itemCode:'104003',itemNameEN:'MEGA Chicken Pop',qty:1,gross:95}].map(r=>({...r,shortName:n?'FRIES TEST '+(n+1):'FRIES TEST',codePromotion:'IC'+String(688+n).padStart(4,'0')})) ).flat():[base,row2];
  if(form==='BillDiscountProposal'){fixtureRows=fixtureRows.map(r=>({...r,qty:'All',gross:'All',netPrice:'',discount:'50 ฿'}));Object.assign(fixtureRows[0],{catCode:'110',itemCode:'110',itemNameEN:'Small Bites'});}
  if(form==='VoucherProposal')fixtureRows=[{...base,itemCode:'ALL ITEMS',itemNameEN:'All products',qty:'All',gross:'50 ฿',discount:'',netPrice:''}];
  const revision=process.argv.includes('--revision');if(revision)fixtureRows.forEach(r=>Object.assign(r,{itStatus:'COMPLETE',opStatus:'CONFIRMED',itDoneDate:'2026-10-15',opDoneDate:'2026-10-15',itSettlementSavedAt:'2026-10-15T01:00:00Z',wentLive:true}));
  if(process.argv.includes('--crm'))fixtureRows.forEach(r=>Object.assign(r,{customerGroup:'crm',crmMappingRequired:'yes',crmMappingCode:'VD-123',crmMappingDetail:'Set value 50'}));
  if(form==='Coupon'&&process.argv.includes('--group-items'))fixtureRows.forEach(r=>Object.assign(r,{couponGroupMode:true,selectionMode:'ITEM',gross:'',netPrice:'',couponDiscountValue:10,couponDiscountUnit:'CUR'}));
  const block=liveFixture?liveFixture.block:{m:{[month]:fixtureRows},w:[],_ts:1},meta={_npdSeeded:true,_flvSeeded:true,_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1,_billDiscVer:4,_proJulyVer:2,_vcCouponVer:2};
  db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run(key,JSON.stringify(block),1);db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::meta',JSON.stringify(meta),1);
  if(process.argv.includes('--structural'))db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('pc_code_counter_v1',JSON.stringify({types:{coupon:{cursor:1000,seeded:true},bill:{cursor:1000,seeded:true},voucher:{cursor:1000,seeded:true},promo:{cursor:9500,seeded:true},itemset:{cursor:9500,seeded:true}},reservations:{},log:[]}),1);
  if(liveFixtures&&process.argv.includes('--full-snapshot'))for(const [k,v] of Object.entries(liveSnapshot.keys||{}))db.db.prepare('INSERT OR REPLACE INTO promo_store VALUES(?,?,?)').run(k,v,liveSnapshot.meta[k]||1);
  if(fullShell)for(const [name,extra] of [['LOCKED',{changeStatus:'CANCELLED',cancelHandled:true,itSettlementSavedAt:'2026-10-15T08:00:00Z'}],['OTHER',{submittedBy:'Someone',reporter:'Someone'}]])db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::c::'+name,JSON.stringify({m:{[month]:[{...base,submittedBy:actor,reporter:actor,campaign:name,...extra}]},w:[],_ts:1}),1);
  if(process.argv.includes('--tracking-workflow')){
   const insert=(name,months)=>db.db.prepare('INSERT INTO promo_store VALUES(?,?,?)').run('promo::c::'+name,JSON.stringify({m:months,w:[],_ts:1}),1);
   const r=(campaign,sn,it='PENDING',op='WAITING',extra={})=>({...base,campaign,shortName:sn,itStatus:it,opStatus:op,...extra});
   insert('MIX',{[month]:[r('MIX','Set A','COMPLETE','CONFIRMED'),r('MIX','Set A','COMPLETE','CONFIRMED',{itemCode:'SS0035'}),r('MIX','Set B'),r('MIX','','PENDING','WAITING',{itemCode:'SS0035'})]});
   insert('WAIT OP',{[month]:[r('WAIT OP','Set A','COMPLETE','CONFIRMED'),r('WAIT OP','Set B','COMPLETE')]});
   insert('DONE',{[month]:[r('DONE','Set A','COMPLETE','CONFIRMED',{promoType:'Voucher',saleMode:'GRAB'})]});
   insert('REVISION',{[month]:[r('REVISION','Set A','PENDING','WAITING',{revisionPending:true,revisionReason:'แก้ราคา <img src=x onerror="window.__bad=true">',revisionRequestedBy:'Bow',revisionRequestedAt:'2026-10-18T08:30:00Z'})]});
   insert('MULTI',{'2026-10':[r('MULTI','Set A','COMPLETE','CONFIRMED',{start:'2026-10-01',end:'2026-10-31'})],[month]:[r('MULTI','Set A')]});
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);page.on('dialog',async d=>{console.error('Unexpected native dialog',d.type(),d.message());await d.dismiss();});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.error(form,m.text());});
  if(process.argv.includes('--tracking-workflow'))await page.addInitScript(()=>{
   // Keep the read-only Tracking test independent of the unrelated 45s reservation janitor.
   // Slower bilingual/screenshot runs otherwise cross its startup timer and write counters.
   const schedule=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>typeof fn==='function'&&fn.name==='backgroundSweep'&&delay===45000?0:schedule(fn,delay,...args);
  });
  if(fullShell)await page.addInitScript(actor=>{sessionStorage.setItem('pc_cloud_pulled',String(Date.now()));localStorage.setItem('pc_session','active');localStorage.setItem('pc_userName',actor);localStorage.setItem('pc_role','MKT');localStorage.setItem('pc_last_page','Campaign_Tracking');},actor);
  if(process.argv.includes('--structural'))await page.addInitScript(()=>localStorage.setItem('pc_code_counter_v1',JSON.stringify({types:{coupon:{cursor:1000,seeded:true},bill:{cursor:1000,seeded:true},voucher:{cursor:1000,seeded:true}},reservations:{},log:[]})));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin==='https://cdn.jsdelivr.net'){
    if(url.pathname.includes('sweetalert2'))return route.fulfill({path:path.join(root,'vendor/sweetalert2/sweetalert2.all.min.js')});
    if(url.pathname.includes('bootstrap'))return route.fulfill({path:path.join(root,'vendor/bootstrap/bootstrap.bundle.min.js')});
    return route.fulfill({contentType:'application/javascript',body:'/* optional external library omitted in local test */'});
   }
   if(['https://cdnjs.cloudflare.com','https://fonts.googleapis.com'].includes(url.origin))return route.fulfill({contentType:'text/css',body:''});
   if(url.origin==='https://potato-promo-sync.quiet-surf-dda2.workers.dev'){
    if(req.method()!=='GET')posts.push(url.pathname);
    const r=await worker.fetch(new Request('https://test'+url.pathname,{method:req.method(),headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:req.method()==='GET'?undefined:req.postData()}),{DB:db,SYNC_TOKEN:'test',CLOUD_FIRST_ENABLED:'true'});
    return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
   }
   assert.equal(url.origin,'http://edit.test');
   if(fullShell&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'Potato Corner Promotion System.html'),'utf8')});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"></head><body><div id="content-area"></div><script>sessionStorage.setItem("pc_cloud_pulled",Date.now());localStorage.setItem("pc_userName","Bow");localStorage.setItem("pc_role","MKT");window.loadPage=(p)=>window._requestedPage=p;</script><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script><script src="/js/mock-backend.js"></script><script src="/js/promotion-edit-model.js"></script><script src="/js/promotion-edit.js"></script><script src="/js/cloud-store.js"></script></body></html>'});
   const file=path.resolve(root,'.'+url.pathname);assert.ok(file.startsWith(root+path.sep));return route.fulfill({path:file});
  });
  await page.goto('http://edit.test/');
  if(!fullShell)await page.evaluate(items=>{window.PC_ITEM_MASTER=items;},[base,row2].map(row=>({itemCode:row.itemCode,itemNameEN:row.itemNameEN,category:'Test items',cateCode:'101',priceTA:Number(row.gross)||0,priceDLV:Number(row.gross)||0})));
  if(fullShell){
    await page.waitForFunction(()=>window.PC_CLOUD&&window.__pcBoot&&typeof window.ctOpenDetail==='function',{timeout:30000});
    await page.evaluate(async()=>{await PC_CLOUD.whenReady();window.loadPage('Campaign_Tracking');});
    await page.waitForFunction(campaign=>document.getElementById('trackingTableBody')?.textContent.includes(campaign),campaign);
    const tableRow=name=>page.locator('#trackingTableBody tr').filter({has:page.locator('td:nth-child(2)').filter({hasText:name})}).first();
    if(process.argv.includes('--tracking-workflow')){
     const beforeLanguage=await page.locator('#ctStatusFilter [data-count]').allTextContents();
     const namesBeforeLanguage=await page.locator('#trackingTableBody .ct-campaign-name').allTextContents();
     await page.evaluate(()=>setLang('EN'));
     assert.equal(await page.locator('#mainTrackingTable thead th').nth(1).locator('[data-en]').textContent(),'Campaign / Reported by');
     assert.equal(await page.locator('#f_name').getAttribute('placeholder'),'Search campaign name');
     assert.deepEqual(await page.locator('#ctStatusFilter [data-count]').allTextContents(),beforeLanguage,'Language switching retains counts');
     assert.deepEqual(await page.locator('#trackingTableBody .ct-campaign-name').allTextContents(),namesBeforeLanguage,'Campaign names are data, not UI translations');
     assert.equal(await page.locator('#f_reporter').getAttribute('placeholder'),'Search reporter name');
     await page.screenshot({path:'/private/tmp/tracking-english-controls.png'});
     await page.evaluate(()=>setLang('TH'));
     assert.equal(await page.locator('#f_name').getAttribute('placeholder'),'ค้นหาชื่อแคมเปญ');
     const visibleRows=()=>page.locator('#trackingTableBody > tr[data-rowidx]');
     assert.equal(await page.locator('#mainTrackingTable > thead > tr > th').nth(7).isVisible(),false,'Progress is removed from the summary table');
     assert.match(await tableRow('MIX').locator('.pc-reported-at').textContent(),/15\/10\/2569/,'Original submission date appears beneath the reporter');
     assert.doesNotMatch(await tableRow('MIX').locator('.ct-campaign-meta').textContent(),/Item Set|LINEMAN/,'Type and sale mode are not repeated in campaign metadata');
     assert.equal(await page.locator('#f_type').isVisible(),true,'Promotion type filter is available above the table');
     assert.equal(await page.locator('#f_mode').isVisible(),true,'Sale mode filter is available above the table');
     await page.locator('#f_type').selectOption('Voucher');assert.equal(await visibleRows().count(),1);assert.match(await visibleRows().textContent(),/DONE/);
     await page.locator('#f_mode').selectOption('GRAB');assert.equal(await visibleRows().count(),1);
     await page.locator('#f_type').selectOption('Item Set');assert.equal(await visibleRows().count(),0,'Both filters are applied together');
     await page.evaluate(()=>clearFilters());assert.equal(await page.locator('#f_type').inputValue(),'');assert.equal(await page.locator('#f_mode').inputValue(),'');
     assert.equal(await tableRow('MIX').locator('.ct-progress').textContent(),'IT 1/2OP 1/2');
     assert.equal(await tableRow('WAIT OP').locator('.ct-workflow-status').textContent(),'รอ OP ตรวจสอบ');
     assert.equal(await page.locator('#trackingTableBody .ct-campaign-name').filter({hasText:'MULTI'}).count(),2,'same campaign in two months is not merged');
     const filter=state=>page.locator('#ctStatusFilter [data-f="'+state+'"]');
     await filter('WAIT_OP').click();assert.equal(await visibleRows().count(),1);assert.match(await visibleRows().textContent(),/WAIT OP/);
     await filter('COMPLETE').click();assert.equal(await visibleRows().count(),2);assert.equal(await tableRow('DONE').locator('.ct-workflow-status').textContent(),'OP ตรวจสอบแล้ว');
     await filter('NEEDS_EDIT').click();assert.equal(await visibleRows().count(),1);assert.match(await visibleRows().textContent(),/REVISION/);
     await tableRow('REVISION').getByRole('button',{name:'ดูรายละเอียด',exact:true}).click();
     await page.locator('.ct-revision-notice').waitFor();assert.match(await page.locator('.ct-revision-notice').textContent(),/แก้ราคา/);assert.equal(await page.locator('.ct-revision-notice img').count(),0);assert.equal(await page.evaluate(()=>!!window.__bad),false);
     assert.equal(await page.locator('.ct-workflow-steps li').count(),4);
     await page.locator('.ct-detail-back').click();await page.evaluate(()=>clearFilters());
     await tableRow('MIX').getByRole('button',{name:'ดูรายละเอียด',exact:true}).click();
     await page.locator('.ct-button-progress summary').click();assert.equal(await page.locator('.ct-button-progress tbody tr').count(),2);
     await page.waitForFunction(()=>document.querySelector('#ctDetailPage .ct-detail-body table'));
     await page.screenshot({path:'/private/tmp/tracking-workflow-detail.png'});
     await page.locator('.ct-detail-back').click();
     await page.locator('#monthOnlyPicker').fill('2026-10');await page.locator('#monthOnlyPicker').dispatchEvent('change');
     assert.equal(await visibleRows().count(),1);assert.match(await visibleRows().textContent(),/MULTI/);assert.match(await visibleRows().textContent(),/OP ตรวจสอบแล้ว/);
     await page.evaluate(()=>clearFilters());
     assert.ok(await page.locator('#f_name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14),'Tracking header search remains legible');
     assert.ok(await page.locator('#f_name').evaluate(el=>el.getBoundingClientRect().height>=44),'Tracking header search has a consistent 44px height');
     assert.equal(await page.locator('#f_name').evaluate(el=>getComputedStyle(el).color),'rgb(37, 56, 44)','Tracking search must not use white text on a white field');
     await page.locator('#f_name').focus();assert.notEqual(await page.locator('#f_name').evaluate(el=>getComputedStyle(el).outlineStyle),'none','Tracking header search has a visible focus indicator');
     await page.locator('#f_reporter').fill('Someone');assert.equal(await visibleRows().count(),1);assert.match(await visibleRows().textContent(),/OTHER/);assert.equal(await tableRow('OTHER').getByRole('button',{name:'แก้ไข',exact:true}).count(),0);
     await page.evaluate(()=>clearFilters());
     for(const width of [1920,1366,1024,390]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(400);
      assert.equal(await page.locator('#mainTrackingTable tbody tr').first().evaluate(el=>getComputedStyle(el).display),'table-row','Tracking keeps each record in one table row at '+width);
      assert.equal(await page.locator('#mainTrackingTable').evaluate(el=>getComputedStyle(el.parentElement).overflowX),'auto','The table can scroll horizontally at '+width);
      for(const name of await page.locator('#mainTrackingTable .ct-campaign-name').all()){
       assert.equal(await name.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','Campaign names remain on one line');
       assert.equal(await name.evaluate(el=>getComputedStyle(el).overflowX),'auto','Long campaign names can scroll without widening the table');
       const check=await name.evaluate(el=>{const original=el.innerHTML;el.textContent='Instore - โปรตั๋วหนัง major x pepsi (เชตเต็มแมกซ์)';const fits=el.scrollWidth<=el.clientWidth+1;const width=el.clientWidth;el.textContent='Long campaign '.repeat(20);const scrolls=el.scrollWidth>el.clientWidth&&el.clientWidth===width;el.innerHTML=original;return {fits,scrolls};});
       assert.ok(check.fits,'Reference campaign fits the name column');assert.ok(check.scrolls,'Longer names scroll inside a stable column');
      }
     }
     await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(400);await page.screenshot({path:'/private/tmp/tracking-workflow-list.png'});
     await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/tracking-workflow-mobile.png'});
     assert.deepEqual(errors,[]);assert.equal(posts.length,0,'Tracking must never write data: '+JSON.stringify(posts));
     await page.close();console.log('Tracking workflow verified: status filters, logical button progress, month isolation, reason escaping, details, sender filter, permissions and zero writes.');continue;
    }
    await tableRow(campaign).getByRole('button',{name:'ดูรายละเอียด',exact:true}).waitFor();
    assert.equal(await tableRow(campaign).getByRole('button',{name:'ดูรายละเอียด',exact:true}).count(),1);
    if(!process.argv.includes('--full-snapshot')){assert.equal(await tableRow('LOCKED').getByRole('button',{name:'ติดต่อ IT เพื่อแก้ไข',exact:true}).isDisabled(),true);
    assert.equal(await tableRow('OTHER').getByRole('button',{name:'แก้ไข',exact:true}).count(),process.argv.includes('--test-mkt')?1:0);}
    await tableRow(campaign).getByRole('button',{name:'แก้ไข',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/tracking-edit-actions-desktop.png'});
    await page.setViewportSize({width:390,height:844});await tableRow(campaign).getByRole('button',{name:'แก้ไข',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/tracking-edit-actions-mobile.png'});await page.setViewportSize({width:1440,height:1000});
    await tableRow(campaign).getByRole('button',{name:'แก้ไข',exact:true}).click();
  }else{
    await page.evaluate(async()=>{await PC_CLOUD.whenReady();await PC_PromotionEdit.open('TOTO','2026-11');});
    assert.equal(await page.evaluate(()=>window._requestedPage),'CreatePromotion');
    await page.evaluate(async form=>{const html=await(await fetch('/pages/'+form+'.html')).text();const host=document.getElementById('content-area');host.innerHTML=html;for(const s of host.querySelectorAll('script')){if(!s.src)window.eval(s.textContent);else if(new URL(s.src).origin===location.origin)window.eval(await(await fetch(s.src)).text());}if(typeof window['init'+form]==='function')window['init'+form]();},form);
  }
  try{await page.locator('#promotionEditBanner').waitFor();}catch(e){console.error('Mount diagnostic',form,errors,await page.locator('#loadingStatus').textContent(),await page.locator('.swal2-html-container').allTextContents());throw e;}
  if(liveFixture){assert.equal(await page.locator('.row-ic').count(),block.m[month].length);assert.equal(await page.locator('.camp-detail').inputValue(),String(block.m[month][0].detail||''));assert.equal(errors.length,0);console.log('Live-shape MKT form opened:',form,block.m[month].length,'rows');await page.close();continue;}
  if(revision)assert.equal(await page.getByLabel('เหตุผลและรายละเอียดที่แก้ไข').count(),1);
  else assert.equal(await page.locator('#promotionEditReason').count(),0,'First-time pending work must not require a reason');
  if(fullShell){
    assert.equal(await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'ยกเลิกการแก้ไข',exact:true}).count(),2,'Cancel is available at the top and beside Save');
    assert.equal(await page.evaluate(()=>window.__leaveGuard.check()),false,'Unchanged form is not dirty');
    await page.getByRole('button',{name:'ยกเลิกการแก้ไข',exact:true}).last().click();
    await page.locator('#trackingTableBody').waitFor();assert.equal(await page.locator('.swal2-popup:visible').count(),0);assert.equal(posts.filter(p=>p==='/promo/campaign-edits').length,0);assert.equal(JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v).m[month][0].detail,'รายละเอียดเดิม');
    await page.evaluate(async({campaign,month})=>PC_PromotionEdit.open(campaign,month),{campaign,month});await page.locator('#promotionEditBanner').waitFor();
    await page.locator('.camp-detail').fill('unsaved change');
    await page.getByRole('button',{name:'ยกเลิกการแก้ไข',exact:true}).last().click();
    await page.getByText('ออกโดยไม่บันทึกการแก้ไข?',{exact:true}).waitFor();await page.getByRole('button',{name:'แก้ไขต่อ',exact:true}).click();
    assert.equal(await page.locator('.camp-detail').inputValue(),'unsaved change');assert.equal(posts.filter(p=>p==='/promo/campaign-edits').length,0);assert.equal(JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v).m[month][0].detail,'รายละเอียดเดิม');
    await page.locator('.camp-detail').fill('รายละเอียดเดิม');
    assert.equal(await page.evaluate(()=>window.__leaveGuard.check()),false,'Restoring original data removes the exit warning');
  }
  assert.equal(await page.locator('.camp-detail').inputValue(),'รายละเอียดเดิม');assert.equal(await page.locator('.btn-sn').first().inputValue(),'FRIES TEST');assert.equal(await page.locator('.row-ic').count(),fixtureRows.length);assert.equal(await page.locator('.btn-sn').count(),form==='Coupon'?6:1);
  if(form==='VoucherProposal'){assert.equal(await page.locator('.btn-disc-val').inputValue(),'50');assert.equal(await page.locator('.row-ic').first().inputValue(),'ALL ITEMS');}else assert.equal(await page.locator('.row-ic').nth(1).inputValue(),'SS0035');
  if(form==='BillDiscountProposal')assert.equal(await page.locator('.row-mode').first().inputValue(),'CATE');
  assert.equal(await page.locator('#globalMonth').inputValue(),month);
  if(process.argv.includes('--crm')){assert.equal(await page.locator('#crmMappingRequired').inputValue(),'yes');assert.equal(await page.locator(form==='Coupon'?'.btn-crm-code':'#crmMappingCode').first().inputValue(),'VD-123');if(form==='Coupon'){assert.equal(await page.locator('#crmMappingCode').count(),0);assert.equal(await page.locator('.btn-crm-code').count(),6);await page.locator('.btn-crm-code').nth(1).fill('');await page.evaluate(()=>PC_CustomerGroup.validate());assert.equal(await page.locator('.btn-crm-code').nth(1).evaluate(el=>document.activeElement===el&&el.classList.contains('is-invalid')),true);await page.locator('.btn-crm-code').nth(1).fill('VD-SECOND');}}
  assert.equal(await page.locator('.promotion-edit-move-up').count(),form==='Coupon'?6:1);
  const initialIds=await page.locator('.pos-button-block').evaluateAll(nodes=>nodes.map(n=>n.dataset.editId));
  if(form==='Proposal'&&!liveFixture){
   const first=page.locator('.pos-button-block').first();assert.equal((await first.locator('.btn-gross').textContent()).trim(),'215.00');
   await first.locator('.row-qty').first().fill('3');assert.equal((await first.locator('.btn-gross').textContent()).trim(),'310.00');assert.equal(await first.locator('.row-op').first().inputValue(),'95');
   await first.locator('.row-qty').first().evaluate(el=>{el.value='4';el.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal((await first.locator('.btn-gross').textContent()).trim(),'405.00');
   await first.locator('.row-qty').first().fill('2');
  }
  if(form==='Coupon'&&process.argv.includes('--group-items')){
   assert.equal(await page.locator('.btn-group-mode').first().isChecked(),true);
   assert.equal(await page.locator('.btn-group-target').first().inputValue(),'ITEM');
   assert.equal(await page.locator('.row-net').first().isVisible(),false);
  }
  await page.evaluate(()=>window.addButton(document.querySelector('.campaign-card').id));
  const added=page.locator('.pos-button-block').last();
  if(form==='Coupon'&&process.argv.includes('--crm')){assert.equal(await added.locator('.crm-coupon-mapping').isVisible(),true);assert.equal(await added.locator('.btn-crm-code').inputValue(),'');assert.equal(await added.locator('.btn-crm-code').getAttribute('required'),'');}
  assert.match(await added.getAttribute('data-edit-id'),/^new:/);
  await added.locator('.promotion-edit-move-up').click();
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.pos-button-block')?.dataset.editNew),true,'Moving keeps keyboard focus within the moved button');
  assert.match((await page.locator('.pos-button-block').evaluateAll(nodes=>nodes.map(n=>n.dataset.editId))).at(-2),/^new:/);
  await page.locator('.pos-button-block').nth(initialIds.length-1).locator('.promotion-edit-remove').click();
  await page.locator('.swal2-confirm').click();
  await page.locator('.swal2-container').waitFor({state:'hidden'});
  assert.deepEqual(await page.locator('.pos-button-block').evaluateAll(nodes=>nodes.map(n=>n.dataset.editId)),initialIds);
  if(form==='Proposal'){
    await page.evaluate(()=>{window.__removedTestRow=document.querySelector('.item-body tr');window.__removedTestRow.querySelector('[onclick*="remove()"]').click();});
    assert.equal(await page.evaluate(()=>window.__leaveGuard.check()),true,'Click-only item removal must warn before leaving');
    await page.evaluate(()=>{document.querySelector('.item-body').prepend(window.__removedTestRow);delete window.__removedTestRow;PC_PromotionEdit.current().dirty=false;});
    await page.evaluate(()=>{const c=PC_PromotionEdit.current();c.form.fields.stores='ALL STORES <svg onload="window.__storeExecuted=true"></svg>';c.mounted=null;PC_PromotionEdit.mount('Proposal');});
    assert.equal(await page.evaluate(()=>!!window.__storeExecuted),false,'Stored branch label must be treated as text, not executable HTML');
    assert.equal(await page.locator('.branch-tag svg').count(),0,'Branch text must not create HTML elements');
    await page.evaluate(()=>{const c=PC_PromotionEdit.current();c.form.fields.stores='ALL STORES';c.mounted=null;PC_PromotionEdit.mount('Proposal');});
  }
  await page.screenshot({path:'/private/tmp/promotion-edit-'+form+'-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/promotion-edit-'+form+'-mobile.png'});await page.setViewportSize({width:1440,height:1000});
  if(revision)assert.equal(await page.locator('#promotionEditReason').count(),1,'Reinitialization must not leave duplicate reason fields');
  if(revision){
    await page.locator('#mainSubmitBtn').click();await page.waitForFunction(()=>document.activeElement?.id==='promotionEditReason');
    assert.equal(await page.locator('.swal2-popup:visible').count(),0,'Missing reason must point directly to the field, without a blocking popup');
    assert.equal(await page.locator('#promotionEditReason').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#promotionEditReason').evaluate(el=>el.classList.contains('is-invalid')),true);
    assert.equal(await page.locator('#promotionEditReasonError').isVisible(),true);
    assert.equal(await page.evaluate(()=>{const field=document.getElementById('promotionEditReason'),save=document.getElementById('mainSubmitBtn');return field.parentElement.parentElement===save.parentElement;}),true);
    assert.equal(posts.filter(p=>p==='/promo/campaign-edits').length,0);
    await page.getByLabel('เหตุผลและรายละเอียดที่แก้ไข').fill('แก้รายการตามที่แจ้ง');
    assert.equal(await page.locator('#promotionEditReason').getAttribute('aria-invalid'),null);
    assert.equal(await page.locator('#promotionEditReasonError').isVisible(),false);
  }
  if(process.argv.includes('--structural'))await page.evaluate(()=>{
   window.addButton(document.querySelector('.campaign-card').id);const block=document.querySelector('.pos-button-block:last-child');
   const put=(s,v)=>{const el=block.querySelector(s);if(el)el.value=v;};
   put('.btn-sn','NEW STRUCTURE');put('.btn-kitchen','MFF');put('.btn-net','90');put('.btn-disc-input,.btn-disc-val','10');
   const tr=block.querySelector('.item-body tr');
   if(tr){const putRow=(s,v)=>{const el=tr.querySelector(s);if(el)el.value=v;};putRow('.row-ic','101003');putRow('.row-search-input,.row-search,.row-in','MEGA FRIES');putRow('.row-qty','1');putRow('.row-op','100');putRow('.row-net','90');}
  });
  if(process.argv.includes('--structural')){
   const added=page.locator('.pos-button-block').last();
   await added.locator('.promotion-edit-code-promotion-mode').waitFor();
   assert.equal(await added.locator('.promotion-edit-code-promotion').isVisible(),false);
   if(process.argv.includes('--manual-codes')){
    await added.locator('.promotion-edit-code-promotion-mode').selectOption('manual');
    await added.locator('.promotion-edit-code-promotion').fill({Coupon:'IC9501',BillDiscountProposal:'BD9501',VoucherProposal:'VC9501',Proposal:'P9600'}[form]);
    if(form==='Proposal'){await added.locator('.promotion-edit-code-itemset-mode').selectOption('manual');await added.locator('.promotion-edit-code-itemset').fill('1079600');}
   }
   for(const width of [1366,390]){await page.setViewportSize({width,height:900});await added.locator('.promotion-edit-code-controls').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/edit-code-'+form+'-'+width+'.png'});assert.equal(await added.locator('.promotion-edit-code-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
   await page.setViewportSize({width:1440,height:1000});
  }
  if(process.argv.includes('--crm')){await page.locator(form==='Coupon'?'.btn-crm-code':'#crmMappingCode').first().fill('VD-UPDATED');await page.locator(form==='Coupon'?'.btn-crm-detail':'#crmMappingDetail').first().fill('IT value 99');}
  await page.locator('.camp-detail').fill('แก้ไขจากฟอร์ม '+form);await page.locator('#mainSubmitBtn').click();await page.locator('.swal2-confirm').click();
  try{await page.getByText('บันทึกการแก้ไขสำเร็จ',{exact:true}).waitFor();}catch(e){console.error('Edit save diagnostic',form,await page.locator('.swal2-html-container').allTextContents());throw e;}
  const saved=JSON.parse(db.db.prepare('SELECT v FROM promo_store WHERE k=?').get(key).v);assert.equal(saved.m[month].length,fixtureRows.length+(process.argv.includes('--structural')?1:0));assert.equal(saved.m[month][0].detail,'แก้ไขจากฟอร์ม '+form);assert.equal(saved.m[month][0].codePromotion,'IC0688');assert.equal(saved.m[month][0].codeItemSet,fixtureItemSetCode);assert.equal(saved.m[month][0].attachment,'file:old');assert.equal(saved.m[month][0].submittedBy,'Bow');assert.equal(db.db.prepare('SELECT count(*) n FROM promo_submission_receipts').get().n,1);assert.equal(posts.filter(p=>p==='/promo/campaign-edits').length,1);assert.deepEqual(saved.m[month].slice(0,fixtureRows.length).map(r=>r.codePromotion),fixtureRows.map(r=>r.codePromotion));assert.deepEqual(errors,[]);
  if(process.argv.includes('--structural')){
   const added=saved.m[month].at(-1),manual=process.argv.includes('--manual-codes');assert.equal(added.shortName,'NEW STRUCTURE');assert.equal(added.itStatus,'PENDING');assert.equal(added.codeItemSet,form==='Proposal'?(manual?'1079600':'1079501'):'');assert.equal(added.codePromotion,(manual?{Coupon:'IC9501',BillDiscountProposal:'BD9501',VoucherProposal:'VC9501',Proposal:'P9600'}:{Coupon:'IC1001',BillDiscountProposal:'BD1001',VoucherProposal:'VC1001',Proposal:'P9501'})[form]);
   await page.locator('.swal2-confirm').click();await page.locator('#trackingTableBody').waitFor();
   await page.evaluate(async({campaign,month})=>PC_PromotionEdit.open(campaign,month),{campaign,month});await page.locator('#promotionEditBanner').waitFor();
   assert.equal(await page.locator('.pos-button-block .btn-sn').last().inputValue(),'NEW STRUCTURE');
   assert.equal(await page.locator('.pos-button-block').last().getAttribute('data-edit-id'),added.editButtonId);
   assert.equal(await page.evaluate(()=>PC_PromotionEdit.collect().buttons.at(-1).isNew===true),false);
   await page.close();console.log('Browser verified structural '+form+': add/remove/move, atomic code allocation, retained originals and saved order after reopen.');continue;
  }
  if(revision&&fullShell){
    assert.equal(saved.m[month][0].revisionPending,true);assert.equal(saved.m[month][0].opStatus,'WAITING');
    await page.locator('.swal2-confirm').click();await page.locator('#trackingTableBody').waitFor();
    await page.evaluate(()=>{Swal.close();PC_PromotionEdit.clear();localStorage.setItem('pc_role','IT');window.loadPage('IT_Settlement');});
    await page.waitForFunction(()=>document.getElementById('itPromoToolbar')&&typeof window.renderGroupedTasks==='function');
    await page.waitForFunction(()=>window.__itAllTasks?.some(r=>r.revisionPending));
    if(process.argv.includes('--crm')){await page.locator('.crm-mapping-it').first().waitFor();assert.match(await page.locator('.crm-mapping-it').first().textContent(),/VD-UPDATED/);assert.match(await page.locator('.crm-mapping-it').first().textContent(),/IT value 99/);if(form==='Coupon'){assert.match(await page.locator('.crm-mapping-it').nth(1).textContent(),/FRIES TEST 2/);assert.match(await page.locator('.crm-mapping-it').nth(1).textContent(),/VD-SECOND/);}}
    await page.evaluate(()=>{Swal.close();window.itSetTab('EDITED');window.renderGroupedTasks(PC_API.getITTasks('ALL'));});
    await page.getByText('รอ IT ดำเนินการแก้ไข',{exact:true}).waitFor();assert.equal(await page.locator('#content-area').getByText('แก้รายการตามที่แจ้ง',{exact:true}).count(),1);
    assert.equal(await page.locator('.it-row-item[data-change-status="EDITED"] [data-cc-reserve]').count(),0);
    assert.equal(await page.locator('.it-row-item[data-change-status="EDITED"] .f-code').first().inputValue(),'IC0688');
    await page.screenshot({path:'/private/tmp/revision-it-'+form+'.png'});
    const category=page.locator('.f-cate-remark').first();if(await category.count())await category.fill('Promotion set');
    await page.evaluate(({campaign,month})=>{window.saveCampaign(campaign,month);},{campaign,month});
    try{await page.getByText('ปิดงานสำเร็จ!',{exact:true}).waitFor();}catch(e){console.error('IT close diagnostic',form,await page.locator('.swal2-popup').textContent());throw e;}
    const closed=await page.evaluate(({campaign,month})=>PC_API.getAllCampaignData().filter(r=>r.campaign===campaign&&r.month===month),{campaign,month});assert.ok(closed.every(r=>r.itStatus==='COMPLETE'&&!r.revisionPending&&r.opStatus==='WAITING'));
    await page.waitForFunction(()=>!Swal.isVisible());
    await page.evaluate(()=>{localStorage.setItem('pc_role','OP');window.loadPage('Op_Tracking');});
    await page.waitForFunction(()=>typeof window.optToggle==='function'&&document.querySelector('#optBody tr'));
    const rowIdx=closed[0].rowIdx;await page.evaluate(rowIdx=>window.optToggle(rowIdx),rowIdx);
    await page.locator('.btn-review .rv-ok').first().waitFor();assert.equal(await page.locator('.btn-review .rv-ok.active').count(),0,'Previous OP results must not preselect revised buttons');
    if(process.argv.includes('--op-theme')){
     assert.deepEqual(await page.locator('#optTable > thead > tr > th:visible > span[data-th]').allTextContents(),['แคมเปญ / ผู้แจ้ง','ช่วงใช้งาน','สถานะปัจจุบัน','อัปเดตล่าสุด','ดำเนินการ'],'OP uses the same simplified visible columns as Tracking');
     assert.match(await page.locator('#optBody > tr.opt-open .pc-reported-at').textContent(),/15\/10\/2569/,'OP shows original submission date, not the later IT update date, beneath the reporter');
     assert.doesNotMatch(await page.locator('#optBody > tr.opt-open .op-campaign-meta').textContent(),/Price Promotion|Lineman/);
     assert.equal(await page.locator('#optBody > tr.opt-open .ct-progress').textContent(),'IT 1/1OP 0/1','OP progress uses saved logical-button results');
     assert.match(await page.locator('#optBody > tr.opt-open .op-campaign-meta').textContent(),/Bow/,'Submitter is shown beneath the campaign like Tracking');
     assert.equal(await page.locator('#optTable > thead > tr > th').nth(2).isVisible(),false,'Promotion type is grouped beneath the campaign instead of duplicated');
     assert.equal(await page.locator('#optTable > thead > tr > th').nth(10).isVisible(),false,'Submitter is grouped beneath the campaign');
     assert.equal(await page.locator('#optTable > thead select').count(),0,'OP header contains labels, not filter controls');
     assert.equal(await page.locator('#optColumnFilters #opf_type').isVisible(),true,'Promotion type sits above the table like Tracking');
     assert.equal(await page.locator('#optColumnFilters #opf_mode').isVisible(),true,'Sale mode sits above the table like Tracking');
     await page.locator('#optMoreFilters > summary').click();
     assert.equal(await page.locator('#opf_it option[value="PENDING"]').textContent(),'รอ IT ขึ้นปุ่ม');
     const period=page.locator('#optBody > tr.opt-open .op-period');
     assert.equal(await period.count(),1,'OP shows one promotion-period cell per campaign');
     assert.match(await period.textContent(),/01\/11\/2026/);assert.match(await period.textContent(),/30\/11\/2026/);
     assert.equal(await page.locator('#optTable > thead > tr > th').nth(4).isVisible(),false,'Separate end-date column is no longer shown');
     assert.equal(await page.locator('#opf_end').isVisible(),true,'End-date filtering remains available inside the combined period column');
     await page.evaluate(()=>setLang('EN'));
     assert.equal(await page.locator('#opf_it option[value="PENDING"]').textContent(),'Awaiting IT button setup');
     assert.equal(await page.locator('#optSearch').getAttribute('placeholder'),'Search campaign name...');
     assert.equal(await page.locator('#opf_name option[value=""]').textContent(),'All');
     await page.screenshot({path:'/private/tmp/op-english-controls.png'});
     await page.evaluate(()=>setLang('TH'));
     assert.equal(await page.locator('#optTable > thead > tr > th').nth(1).locator('span[data-en]').textContent(),'แคมเปญ / ผู้แจ้ง');
     assert.ok(await page.locator('#opf_name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14),'OP header filters remain legible');
     assert.ok(await page.locator('#opf_type').evaluate(el=>el.getBoundingClientRect().height>=44),'OP filters use consistent accessible height');
     for(const width of [1366,1024,390]){
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(400); // Allow the shell's sidebar/width transition to settle.
      assert.equal(await page.locator('#optBody > tr.opt-open').first().evaluate(el=>getComputedStyle(el).display),'table-row','OP keeps one row per record at '+width);
      assert.equal(await page.locator('.btn-review tbody tr').first().evaluate(el=>getComputedStyle(el).display),'table-row','Review members stay in one row at '+width);
     }
     await page.setViewportSize({width:1440,height:1000});
     assert.equal(await page.locator('.btn-review td input').count(),0,'Review data must be readable wrapping text, not clipped single-line inputs');
     const field=page.locator('.btn-review .ro-input:not(.text-danger)').first();
     for(const cell of await page.locator('.btn-review .op-name').all()){
      assert.equal(await cell.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','Names remain on a single line');
      assert.ok(await cell.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Complete names remain visible vertically');
      assert.ok(await cell.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Names do not require scrolling inside a cell');
     }
     assert.equal(await field.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(246, 251, 246)','OP read-only cells use the green workspace tint');
     assert.equal(await page.locator('.btn-review > div').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 245, 233)','OP button-group heading follows the theme');
     assert.equal(await page.locator('.btn-review th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 245, 233)','nested table headers follow the theme');
     assert.equal(await page.locator('#opf_name').evaluate(el=>getComputedStyle(el).color),'rgb(37, 56, 44)','header filters remain readable on the light green background');
     assert.equal(await page.locator('.opt-focus-bar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 245, 233)','the focused table banner follows the same palette');
     await page.screenshot({path:'/private/tmp/op-themed-table-desktop.png'});
     await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/op-themed-table-mobile.png'});await page.setViewportSize({width:1440,height:1000});
    }
    for(const b of await page.locator('.btn-review .rv-ok').all())await b.click();
    if(process.argv.includes('--op-theme')){
     await page.waitForFunction(()=>getComputedStyle(document.querySelector('.btn-review .rv-ok.active')).backgroundColor==='rgb(27, 94, 32)');
     assert.deepEqual(await page.locator('.btn-review .rv-ok.active').first().evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(27, 94, 32)','rgb(255, 255, 255)'],'selected review result stays visually distinct');
    }
    await page.evaluate(({campaign,rowIdx})=>{window.optSaveReview(campaign,rowIdx);},{campaign,rowIdx});
    await page.getByText('ตรวจสอบปุ่มรับข้อมูลเครื่อง POS แล้วหรือยัง?',{exact:true}).waitFor();await page.locator('.swal2-confirm').click();
    await page.getByText('ยืนยันผลตรวจสอบ?',{exact:true}).waitFor();await page.locator('.swal2-confirm').click();
    await page.getByText('ตรวจสอบถูกต้องแล้ว!',{exact:true}).waitFor();
    assert.equal(await page.evaluate(({campaign,month})=>PC_API.getAllCampaignData().find(r=>r.campaign===campaign&&r.month===month).opStatus,{campaign,month}),'CONFIRMED');
  }
  await page.close();console.log('Browser verified '+form+': original form populated, SS/attachments/codes retained, one Cloud replacement.');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
