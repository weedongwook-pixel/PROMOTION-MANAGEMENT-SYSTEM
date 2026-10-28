// Local-only browser verification of the five-step NPD workflow. All requests are
// served from this checkout; no Cloud endpoints, production login or production data are used.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-npd-workflow-browser.cjs /path/to/sample.xlsx
// The sample is the Enoki fries / Mala sauce workbook (sheets "Tem1" and "mala sauce").
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const file=process.argv[2];
if(!file)throw Error('Pass the sample .xlsx path');
const root=path.resolve(__dirname,'..'), shots=process.env.SCREENSHOT_DIR || '/private/tmp';
const snap=page=>page.evaluate(()=>RD.workflowSnapshot());
async function importSheet(page,sheet,category){
  await page.locator('.np-step').nth(0).click();
  await page.locator('#npExcelSheet').selectOption(sheet);
  await page.locator('#npExcelCategory').selectOption(category);
  const panda=page.locator('[data-excel-channel="FoodPanda"]');if(await panda.count())await panda.selectOption('__skip__');
  await page.locator('#npExcelApply').click();
  assert.match(await page.locator('.swal2-html-container').textContent(),/ไม่แทนที่รายการเดิม/);
  await page.locator('.swal2-confirm').click();
  try{await page.getByText('เติมข้อมูลในฟอร์มแล้ว',{exact:true}).waitFor();}
  catch(e){console.error('Import diagnostic:',await page.locator('#npExcelStatus').textContent());throw e;}
  await page.locator('.swal2-confirm').click();await page.locator('.swal2-container').waitFor({state:'hidden'});
}
async function attach(page,libId,target,qty){
  await page.locator('#npLibraryPick').selectOption(libId);await page.locator('#npTargetPick').selectOption(target);
  await page.locator('#npLinkQty').fill(qty);await page.getByRole('button',{name:'เพิ่มผงเข้า SUBSET ที่เลือก'}).click();
  return page.locator('#npWorkflowMessage').textContent();
}
async function addPowder(page,name,rm,desc){
  await page.locator('.np-step').nth(1).click();
  await page.locator('#npWorkName').fill(name);await page.locator('#npWorkRM').fill(rm);await page.locator('#npWorkDesc').fill(desc);
  await page.getByRole('button',{name:'เพิ่มผงไว้ใช้ในงานนี้'}).click();
  await page.locator('#npStepNext').click();
  return (await snap(page)).workPowders.find(w=>w.eng===name).id;
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(String(e)));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://npd.test')throw Error('Unexpected external request: '+url.origin);
      if(url.pathname==='/'){
        const body=fs.readFileSync(path.join(root,'pages/NPD.html'),'utf8');
        const html='<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><link rel="stylesheet" href="/css/workspace.css"></head><body>'+body+
          '<script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script><script src="/data/subset-master.js"></script><script src="/js/mock-backend.js"></script><script src="/js/code-counter.js"></script><script>initNPD();</script></body></html>';
        return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
      }
      const dest=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(!dest.startsWith(root+path.sep)||!fs.existsSync(dest))return route.fulfill({status:404,body:''});
      return route.fulfill({path:dest});
    });
    await page.goto('http://npd.test/');
    const initial=await page.evaluate(()=>PC_API.getNPDList().length);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width>500?1000:844});
      for(let i=0;i<5;i++){await page.evaluate(i=>PC_NpdWorkflow.go(i),i);await page.screenshot({path:`${shots}/npd-step${i+1}-${width}.png`,fullPage:true});}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'no horizontal scroll at '+width+'px');
    }
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>PC_NpdWorkflow.go(0));

    // Manual entry first, keeping the suggested dates, then two appended sheets with different categories.
    await page.locator('#npProject').fill('Guided manual + import');
    for(let i=0;i<3;i++)await page.locator('#npStepNext').click();
    await page.locator('#productList input[oninput*="\'name\'"]').first().fill('Manual Item');
    const manual=(await snap(page)).products[0];
    await page.locator('.np-step').nth(0).click();
    await page.locator('#npExcelFile').setInputFiles(file);
    await page.waitForFunction(()=>!document.getElementById('npExcelSheet').disabled);
    await importSheet(page,'Tem1','110');
    const enoki=await snap(page);
    assert.deepEqual(enoki.products[0],manual);assert.equal(enoki.project,'Guided manual + import');
    assert.equal(enoki.products.length,6);assert.deepEqual(enoki.subsets.map(s=>s.powders.length),[10,10]);
    await importSheet(page,'mala sauce','115');
    let d=await snap(page);
    assert.deepEqual(d.products.slice(0,6),enoki.products);assert.deepEqual(d.subsets,enoki.subsets);
    assert.deepEqual([...new Set(d.products.slice(1).map(p=>p.cateCode))],['110','115']);
    assert.notEqual(d.products[1].importGroup,d.products[6].importGroup);

    // Prepared powders: a recipe clash with an imported flavor is refused; a new flavor is added before No flavor.
    const target=d.subsets[0];
    const cheese=await addPowder(page,'Cheese','3010','Other cheese');
    assert.match(await attach(page,cheese,target.id,'5'),/สูตรต่างกัน/);
    const seaweed=await addPowder(page,'Seaweed','3011','ผงสาหร่าย');
    assert.equal(await attach(page,seaweed,target.id,'5'),'');
    d=await snap(page);const sub=d.subsets[0];
    assert.equal(sub.powders.length,11);assert.equal(sub.powders.filter(w=>/^cheese/i.test(w.eng)).length,1);assert.ok(sub.powders.at(-1).noFlavor);
    await page.locator('#npStepBack').click();await page.locator('#npStepBack').click();
    assert.equal(await page.locator('#npProject').inputValue(),'Guided manual + import');

    // Draft resume restores the step, products and every reserved code.
    for(let i=0;i<3;i++)await page.locator('#npStepNext').click();
    await page.getByRole('button',{name:'บันทึกร่าง'}).click();
    const saved=await snap(page);
    await page.reload();await page.locator('.swal2-confirm').click();await page.locator('.swal2-container').waitFor({state:'hidden'});
    d=await snap(page);
    assert.equal(d.workflow.step,3);assert.equal(await page.locator('#npStepLabel').textContent(),'ขั้น 4 จาก 5');
    assert.deepEqual(d.products.map(p=>p.code),saved.products.map(p=>p.code));
    assert.deepEqual(d.subsets.map(s=>s.powders.map(w=>w.cmpos)),saved.subsets.map(s=>s.powders.map(w=>w.cmpos)));

    // Review lists what submit would reject, including over-long POS names from the file.
    await page.locator('.np-step').nth(4).click();
    assert.equal(await page.locator('#npStepSubmit').isDisabled(),true);
    const review=await page.locator('#npWorkflowReview').textContent();
    assert.match(review,/ชื่อ TH บน POS ยาว 24\/20/);assert.match(review,/ชื่อผง EN "Truffle \+THB10\s+ENF 1" ยาว 21\/20/);
    await page.screenshot({path:shots+'/npd-review-blocked-1440.png',fullPage:true});

    // Resolve the issues as a user would, then submit to the in-page mock backend only.
    await page.evaluate(()=>{const d=RD.workflowSnapshot();
      d.subsets.forEach((s,i)=>{RD.setS(s.id,'name2',i?'ENF2':'ENF1');s.powders.forEach(w=>{if(/Truffle \+THB10/.test(w.eng))RD.setW(s.id,w.id,'eng',w.eng.replace(/\s+/g,' ').replace('+THB10','+10'));});});
      const m=d.products[0];RD.setProductCategory(m.id,'201');RD.toggleSaleMode(m.id,'Take-Away');RD.setPrice(m.id,'Take-Away','39');});
    await page.locator('.np-step').nth(3).click();
    const th=page.locator('#productList input[oninput*="\'th\'"]');
    for(let i=1,n=await th.count();i<n;i++)await th.nth(i).fill('ไทย '+i);
    await page.locator('#productList input[oninput*="\'name\'"]').nth(6).fill('Bow Mala Sauce');
    const confirmStores=page.getByRole('button',{name:'ยืนยันใช้สาขาที่เลือกกับกลุ่มนี้'});
    // A store condition matching no branch cannot be confirmed for an import group.
    await page.evaluate(()=>{RD._stTmp=[{type:'Zone',label:'Empty zone',ids:[]}];RD.storeApply();});
    await confirmStores.first().click();
    assert.match(await page.locator('#npWorkflowMessage').textContent(),/ไม่ตรงกับสาขาใดเลย/);
    await page.evaluate(()=>RD.storeClearAll());
    while(await confirmStores.count())await confirmStores.first().click();
    assert.deepEqual(await page.evaluate(()=>RD.workflowIssues()),[]);
    await page.setViewportSize({width:390,height:844});
    await page.locator('.np-step').nth(4).click();await page.screenshot({path:shots+'/npd-review-ready-390.png',fullPage:true});
    assert.equal(await page.locator('#npStepSubmit').isDisabled(),false);
    await page.locator('#npStepSubmit').click();await page.locator('.swal2-confirm').click();
    await page.getByText('ส่งเรียบร้อย!',{exact:true}).waitFor();
    const submitted=await page.evaluate(()=>PC_API.getNPDList()[0]);
    assert.equal(await page.evaluate(()=>PC_API.getNPDList().length),initial+1);
    assert.equal(submitted.items.length,8);assert.equal(submitted.subsets.length,2);
    assert.deepEqual([...new Set(submitted.items.map(i=>i.cateCode))],['201','110','115']);
    assert.equal(submitted.items[0].recipes.length,0,'a blank default-unit row is not sent to IT');
    assert.deepEqual(errors,[]);
    console.log('Browser: guided NPD workflow — manual entry + 2 appended sheets (mixed categories), powder reuse/conflict, draft resume, review gate and local-only submit verified at 1440px and 390px. No production writes.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
