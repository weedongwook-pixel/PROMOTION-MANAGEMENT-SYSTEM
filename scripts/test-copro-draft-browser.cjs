const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body><div id="pending"></div></body>'}));await page.goto('https://draft.test/');
  for(const file of ['vendor/sweetalert2/sweetalert2.all.min.js','js/co-promo.js','js/copro-drafts.js'])await page.addScriptTag({content:fs.readFileSync(path.join(process.cwd(),file),'utf8')});
  await page.evaluate(()=>{
   localStorage.setItem('pc_userName','MKT');window.saved=null;window.PC_CoProEmail={active:()=>true,capabilities:async()=>({coproEnabled:true,sendingEnabled:true})};window.PC_CoProEmailUI={save:async()=>null};
   window.rows=['A','B'].map((shortName,i)=>({campaign:'Legacy',shortName,codePromotion:'BD00'+i,submissionBatchId:'batch-legacy',submissionForm:'Bill Discount'}));
   window.PC_CLOUD={readCampaignRows:async()=>rows,readCloudKey:async key=>key==='pc_co_promotions'?window.coRecords:saved,saveCoPromoRecords:async(value,version)=>window.coRecords={value,updatedAt:(version||0)+1},saveCoPromoDrafts:async(user,value,version)=>saved={value,updatedAt:(version||0)+1}};
   window.done=PC_CoPromo.openForm('Legacy',null,{requireEmail:true});
  });
  await page.locator('#cpBtn').selectOption('1');await page.locator('#cpBrand').fill('Partner B');await page.locator('#cpfDraft').click();
  await page.waitForFunction(()=>!document.getElementById('pcCoproPage'));
  await page.evaluate(()=>PC_CoPromoDrafts.mount(document.getElementById('pending')));
  await page.getByRole('button',{name:'ทำต่อ',exact:true}).click();
  await page.getByRole('button',{name:'ไม่ส่ง',exact:true}).click();
  assert.equal(await page.locator('#pcCoproPage').count(),0);
  await page.getByRole('button',{name:'ทำต่อ',exact:true}).click();
  await page.getByRole('button',{name:'ส่ง',exact:true}).click();
  assert.equal(await page.locator('#cpBtn').inputValue(),'1');assert.equal(await page.locator('#cpName').inputValue(),'B');assert.equal(await page.locator('#cpBrand').inputValue(),'Partner B');
  await page.locator('#cpfCancel').click();await page.getByRole('button',{name:'กรอกต่อ',exact:true}).click();assert.equal(await page.locator('#cpBrand').inputValue(),'Partner B');
  await page.locator('#cpfCancel').click();await page.getByRole('button',{name:'ปิดโดยไม่บันทึกเพิ่ม',exact:true}).click();
  const failures=await page.evaluate(async()=>{
   const draft=(await PC_CoPromoDrafts.list())[0],errors=[];
   for(const record of [{...draft.record,emailButtonId:'missing'},{...draft.record,buttonName:'missing',cmposName:'missing'}]){
    try{await PC_CoPromo.openForm('Legacy',record,{requireEmail:true,draft});}catch(e){errors.push(e.message);}
   }return errors;
  });assert.equal(failures.length,2);assert.equal(await page.locator('#pcCoproPage').count(),0);
  console.log('Draft pending-list resume preserves legacy button B; missing identity rejects; cancel preserves fields. No external sends.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
