// Local-only browser verification. All requests are served from this checkout;
// no Cloud endpoints, production login or production data are used.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-npd-excel-browser.cjs /path/to/sample.xlsx
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const file=process.argv[2];
if(!file)throw Error('Pass the sample .xlsx path');
const root=path.resolve(__dirname,'..');
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
    await page.locator('#npExcelFile').setInputFiles(file);
    await page.locator('#npExcelSheet').selectOption('Tem1');
    await page.locator('#npExcelPreview td').filter({hasText:'Large Enoki Fries'}).first().waitFor();
    if (process.argv.includes('--new-category')) {
      // Reproduce adding a missing category after the Excel preview is open.
      // The import selection must refresh without resetting project/channels.
      await page.locator('#npExcelProject').fill('Import new category regression');
      await page.locator('[data-excel-channel="FoodPanda"]').selectOption('__skip__');
      await page.locator('#npDept').selectOption('100');
      await page.locator('button[onclick="RD.addCategory()"]').click();
      await page.locator('.swal2-input').fill('Enoki Import Category');
      await page.locator('.swal2-confirm').click();
      await page.getByText('เพิ่มหมวดแล้ว',{exact:true}).waitFor();
      await page.locator('.swal2-container').waitFor({state:'hidden'});
      const newCode=await page.locator('#npCateCode').inputValue();
      assert.equal(await page.locator('#npExcelCategory').inputValue(),newCode,'new category must be selected in the existing import preview');
      assert.equal(await page.locator('#npExcelProject').inputValue(),'Import new category regression');
      assert.equal(await page.locator('[data-excel-channel="FoodPanda"]').inputValue(),'__skip__');
      // Reopening the sheet also recognises a category created in this form,
      // even when its name does not exactly match the category in the file.
      await page.locator('#npExcelSheet').selectOption('Tem1');
      assert.equal(await page.locator('#npExcelCategory').inputValue(),newCode);
    } else await page.locator('#npExcelCategory').selectOption('110');
    const panda=page.locator('[data-excel-channel="FoodPanda"]');
    if(await panda.count())await panda.selectOption('__skip__');
    await page.screenshot({path:'/private/tmp/npd-excel-desktop.png'});
    await page.locator('#npExcelApply').click();
    await page.locator('.swal2-confirm').click();
    try { await page.getByText('เติมข้อมูลในฟอร์มแล้ว',{exact:true}).waitFor(); }
    catch(e){console.error('Import diagnostic:',await page.locator('#npExcelStatus').textContent(),errors);throw e;}
    await page.locator('.swal2-confirm').click();
    await page.evaluate(()=>RD.saveDraft());
    const d=await page.evaluate(()=>JSON.parse(localStorage.getItem('pc_npd_draft')));
    assert.equal(d.products.length,5);assert.equal(d.subsets.length,2);
    if (process.argv.includes('--new-category')) {
      assert.equal(d.category,'Enoki Import Category');
      assert.ok(d.products.every(p=>p.code.startsWith(d.cateCode)),'imported product codes must use the new category');
    }
    assert.equal(d.subsets[0].powders.length,9);assert.equal(d.subsets[1].powders.length,9);
    assert.equal(d.products[0].prices['Take-Away'],'59');assert.equal(d.products[0].prices.Grab,'69');
    assert.equal(d.products.some(p=>p.recipes.some(r=>/^SS/.test(r.code))),false);
    assert.equal(d.products[0].formulas[0].subId,d.subsets[0].id);
    assert.equal(d.products[1].formulas[0].subId,d.subsets[1].id);
    assert.equal(d.products[2].formulas[0].chooseMax,2);
    assert.equal(d.products[0].recipes.find(r=>r.code==='4067').channels.includes('Take-Away'),false);
    assert.equal(await page.evaluate(()=>PC_API.getNPDList().length),initial);
    assert.equal(d.importSource.storesReviewed,false);
    // Gate must warn before any submit or duplicate-NPD write.
    await page.evaluate(()=>RD.submit('new'));
    assert.match(await page.locator('.swal2-html-container').textContent(),/สาขา/);
    await page.locator('.swal2-confirm').click();
    await page.setViewportSize({width:390,height:844});
    await page.locator('.swal2-container').waitFor({state:'hidden'});
    await page.locator('.np-excel').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/private/tmp/npd-excel-mobile.png'});
    // A second sheet must replace the form only after explicit confirmation,
    // keep zero new subsets for Sauce, and return the abandoned reservations.
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#npExcelSheet').selectOption('mala sauce');
    await page.locator('#npExcelCategory').selectOption('115');
    await page.locator('[data-excel-channel="FoodPanda"]').selectOption('__skip__');
    await page.locator('#npExcelApply').click();
    assert.match(await page.locator('.swal2-html-container').textContent(),/แทนที่/);
    await page.locator('.swal2-confirm').click();
    await page.getByText('เติมข้อมูลในฟอร์มแล้ว',{exact:true}).waitFor();
    await page.locator('.swal2-confirm').click();
    await page.evaluate(()=>RD.saveDraft());
    const sauce=await page.evaluate(()=>JSON.parse(localStorage.getItem('pc_npd_draft')));
    assert.equal(sauce.products.length,2);assert.equal(sauce.subsets.length,0);
    assert.equal(sauce.products[0].prices['Take-Away'],'25');assert.equal(sauce.products[1].prices.Grab,'55');
    assert.equal(sauce.products[0].recipes.length,3);
    assert.equal(await page.evaluate(()=>PC_API.getNPDList().length),initial);
    const oldStates=await page.evaluate(codes=>codes.map(code=>PC_COUNTER.entryOf(code)?.status),d.subsets.map(s=>s.ssCode));
    assert.ok(oldStates.every(s=>s!=='RESERVED'));
    // Exercise the ordinary submit path after user corrections. This persists
    // only to the isolated browser context's in-memory local test backend.
    await page.locator('.swal2-container').waitFor({state:'hidden'});
    await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('#productList .item-card')];
      for(let i=0;i<cards.length;i++){
        const fields=cards[i].querySelectorAll('input[maxlength="20"]');
        fields[0].value=i?'Mala Dip':'Mala Sauce';fields[0].dispatchEvent(new Event('input',{bubbles:true}));
        fields[1].value=i?'ดิปหม่าล่า':'ซอสหม่าล่า';fields[1].dispatchEvent(new Event('input',{bubbles:true}));
      }
      RD.storeClearAll();RD.reviewImportStores(true);RD.submit('new');
    });
    await page.locator('.swal2-confirm').click();
    await page.waitForFunction(n=>PC_API.getNPDList().length===n+1,initial);
    const submitted=await page.evaluate(()=>PC_API.getNPDList()[0]);
    assert.equal(submitted.items.length,2);assert.equal(submitted.items[0].recipes.length,3);
    assert.equal(submitted.items[1].prices.Grab,'55');
    assert.equal(submitted.importSource.sheet,'mala sauce');
    assert.equal(submitted.importSource.storesReviewed,true);
    await page.getByText('ส่งเรียบร้อย!',{exact:true}).waitFor();
    await page.locator('.swal2-confirm').click();
    await page.locator('.swal2-container').waitFor({state:'hidden'});
    await page.locator('#npProject').fill('Preserve product for subset import');
    const en=page.locator('#productList input[maxlength="20"]').first();await en.fill('Keep existing item');
    await page.evaluate(()=>RD.saveDraft());
    const keep=await page.evaluate(()=>JSON.parse(localStorage.getItem('pc_npd_draft')));
    await page.locator('#npSubsetExcelFile').setInputFiles(file);
    await page.locator('#npSubsetExcelSheet').selectOption('ss');
    await page.locator('#npSubsetExcelTitle').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/private/tmp/npd-ss-import-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#npSubsetExcelTitle').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/private/tmp/npd-ss-import-mobile.png'});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#npSubsetExcelApply').click();
    await page.locator('.swal2-confirm').click();
    await page.getByText('เพิ่ม Subset ในฟอร์มแล้ว',{exact:true}).waitFor();
    await page.locator('.swal2-confirm').click();
    const ss=await page.evaluate(()=>JSON.parse(localStorage.getItem('pc_npd_draft')));
    assert.equal(ss.subsets.length,2);assert.equal(ss.subsets[0].powders.length,9);
    assert.equal(ss.subsets[1].powders.length,9);
    assert.deepEqual(ss.products,keep.products);
    assert.equal(ss.project,keep.project);assert.equal(ss.start,keep.start);
    assert.equal(await page.evaluate(()=>PC_API.getNPDList().length),initial+1);
    await page.locator('#npSubsetExcelSheet').selectOption('ss');
    await page.locator('#npSubsetExcelApply').click();await page.locator('.swal2-confirm').click();
    await page.waitForFunction(()=>document.getElementById('npSubsetExcelStatus').textContent.includes('แล้ว'));
    assert.match(await page.locator('#npSubsetExcelStatus').textContent(),/มี.*แล้ว/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pc_npd_draft')).subsets.length),2);
    assert.deepEqual(errors,[]);
    console.log('Browser: NPD product import + separate SS import (2 groups / 18 powders), existing products preserved, duplicate import rejected, local-only NPD save verified. No production writes.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
