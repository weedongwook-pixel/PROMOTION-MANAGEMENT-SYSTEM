const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const data=process.env.COPRO_SNAPSHOT?JSON.parse(fs.readFileSync(process.env.COPRO_SNAPSHOT))[0].results:[{k:'promo::c::Test',v:JSON.stringify({_ts:10,m:{'2026-11':[{campaign:'Test',shortName:'Button',submissionBatchId:'batch-1',codePromotion:'BD001'}]}}),updated_at:10},{k:'pc_co_promotions',v:JSON.stringify([{campaign:'Test',cmposName:'Button',buttonName:'Button',submissionId:'batch-1',createdBy:'Wanvisa Chanthowong',emailIntake:true,emailPending:true}]),updated_at:10}];
 const page=await browser.newPage(),errors=[];let failSource=false;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname.startsWith('/promo/store')){assert.equal(route.request().method(),'GET');const key=decodeURIComponent(u.pathname.slice('/promo/store/'.length));if(failSource&&key.startsWith('promo::c::'))return route.fulfill({status:503,json:{ok:false}});const row=data.find(r=>r.k===key);return route.fulfill(row?{json:{ok:true,value:row.v,updated_at:row.updated_at}}:{status:404,json:{ok:false}});}
  if(u.origin!=='https://pending.test')return route.fulfill({status:404,body:''});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="pending"></div>'});
  return route.fulfill({path:path.join(process.cwd(),u.pathname)});
 });
 await page.goto('https://pending.test/');await page.evaluate(()=>localStorage.setItem('pc_userName','Wanvisa Chanthowong'));
 for(const f of ['vendor/sweetalert2/sweetalert2.all.min.js','js/cloud-store.js','js/co-promo.js','js/copro-drafts.js'])await page.addScriptTag({path:path.join(process.cwd(),f)});
 await page.evaluate(()=>{window.PC_CoProEmail={active:()=>true,capabilities:async()=>({coproEnabled:true,sendingEnabled:true})};window.PC_CoProEmailUI={save:async()=>{await Swal.fire({title:'หน้าส่งเมลทดสอบ',confirmButtonText:'กลับ'});return null;}};window.PC_CoPromoDrafts.recordCoPromo=async()=>[];});
 await page.evaluate(()=>PC_CoPromoDrafts.mount(document.getElementById('pending')));
 const buttons=page.getByRole('button',{name:'ทำต่อ',exact:true});await buttons.first().waitFor();const count=await buttons.count();
 for(let i=0;i<count;i++){
  await buttons.nth(i).click();await page.locator('.swal2-confirm').click();await page.locator('#cpfSave').waitFor({timeout:20000});assert.equal(await page.locator('#cpfSave').isVisible(),true);if(await page.getByText('หน้าส่งเมลทดสอบ',{exact:true}).count())await page.getByRole('button',{name:'กลับ',exact:true}).click();await page.locator('#cpfCancel').click();await page.getByRole('button',{name:'ปิดโดยไม่บันทึกเพิ่ม',exact:true}).click();
 }
 failSource=true;await buttons.first().click();await page.locator('.swal2-confirm').click();await page.locator('.swal2-validation-message').filter({hasText:'503'}).waitFor();assert.equal(await page.locator('#pcCoproPage').count(),0);await page.getByRole('button',{name:'ไม่ส่ง',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('Pending Send opens CoPromo form for '+count+' campaigns using real Cloud adapter; read-only mocked network.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
