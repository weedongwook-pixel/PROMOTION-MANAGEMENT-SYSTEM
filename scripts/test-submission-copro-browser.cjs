const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{for(const scenario of [{copro:false,history:false},{copro:false,history:true},{copro:true,history:false},{copro:true,history:true}]){
  const {copro,history}=scenario;
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,'http://copro.test','test must never send external requests');return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});});
  await page.goto('http://copro.test/');
  for(const file of ['vendor/sweetalert2/sweetalert2.all.min.js','js/submission-log.js','js/co-promo.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
  await page.evaluate(()=>{
   window.PC_CoPromoDrafts={recordCoPromo:async()=>{window.intakeSaved=true;}};localStorage.setItem('pc_userName','MKT');window.navigation=[];window.ordinarySaves=0;window.loadPage=name=>navigation.push(name);
   const rows=[{campaign:'Co-Promo test',shortName:'Discount',month:'2026-10'}];
   window.PC_CLOUD={enabled:()=>true,readCampaignRows:async()=>rows};
   const run={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},saveCoPromotion(){window.ordinarySaves++;this.success({status:'success'});},getAllCampaignData(){this.success(rows);},getCoPromoContext(){this.success({campaign:'Co-Promo test',buttons:[{buttonName:'Discount',codePromotion:'BD001'}]});}};
   window.google={script:{run}};
   const plan=PC_SubmissionLog.prepare('Bill Discount',rows);
   window.result=PC_SubmissionLog.afterSave(plan,{successNote:'ข้ามรหัสซ้ำ 6001 รหัส',onAfter:()=>PC_CoPromo.promptAfterSubmit(['Co-Promo test'])});
  });
  await page.getByText('ส่งและบันทึกข้อมูลสำเร็จ',{exact:true}).waitFor();
  assert.ok((await page.locator('.swal2-html-container').innerText()).includes('6001'));
  assert.equal(await page.locator('.swal2-confirm').isVisible(),false);
  assert.equal(await page.locator('.swal2-cancel').isVisible(),false);
  await page.getByText('เป็น Co-Promotion หรือไม่?',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>navigation),[],'navigation cannot skip Co-Promo');
  await page.locator(copro?'.swal2-confirm':'.swal2-cancel').click();
  if(copro){
   assert.equal(await page.evaluate(()=>intakeSaved),true,'Yes persists CoPromo before email selection');
   await page.locator('#cpfCancel').waitFor();assert.deepEqual(await page.evaluate(()=>navigation),[]);
   await page.locator('#cpBrand').fill('Test partner');await page.locator('#cpfSave').click();
   await page.locator('#cpfErr').filter({hasText:'ยังยืนยันการส่งอีเมลไม่ได้'}).waitFor();
   assert.equal(await page.evaluate(()=>ordinarySaves),0,'Co-Promo yes must never silently save without email');
   assert.equal(await page.locator('#cpBrand').inputValue(),'Test partner','keep user input on email failure');
   await page.evaluate(()=>{
    window.emailCalls=[];
    window.PC_CoProEmail={active:()=>true,capabilities:async()=>({coproEnabled:true,sendingEnabled:true})};
    window.PC_CoProEmailUI={save:async record=>{emailCalls.push(record);return {status:'success',saved:true,mailStatus:'queued'};}};
   });
   await page.locator('#cpfSave').click();
   await page.waitForFunction(()=>!document.getElementById('pcCoproPage'));
   assert.equal(await page.evaluate(()=>emailCalls.length),1);assert.equal(await page.evaluate(()=>emailCalls[0].campaign),'Co-Promo test');
   assert.equal(await page.evaluate(()=>ordinarySaves),0);
  }
  await page.getByText('ส่งและบันทึกข้อมูลสำเร็จ',{exact:true}).waitFor();await page.locator(history?'.swal2-confirm':'.swal2-cancel').click();
  assert.equal(await page.evaluate(()=>result),true);assert.deepEqual(await page.evaluate(()=>navigation),history?['SubmissionLog']:[]);assert.deepEqual(errors,[]);
  console.log(`Verified Co-Promo=${copro}, history=${history}: final navigation choices after CoPromo decision/completion; no external sends`);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
