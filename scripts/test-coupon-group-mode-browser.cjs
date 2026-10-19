const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="btn-container-camp"></div>');
  await page.addStyleTag({content:fs.readFileSync('vendor/bootstrap/bootstrap.min.css','utf8')});
  await page.evaluate(source=>{
   window.categories=['Fries','Drink'];window.catCodeMap={Fries:'101',Drink:'201'};window.pcCatShownInCoupon=()=>true;
   window.masterData=[{itemCode:'101001',itemNameEN:'Fries',category:'Fries',cateCode:'101',priceTA:75},{itemCode:'201001',itemNameEN:'Drink',category:'Drink',cateCode:'201',priceTA:25}];
   window.Swal={fire:async()=>({isConfirmed:window.confirmSwitch!==false})};
   eval(source.slice(source.indexOf('window.addButton ='),source.indexOf('window.toggleCouponView =')));
   eval(source.slice(source.indexOf('window.handleFill ='),source.indexOf('window.handleSelectionGlobal =')));
   window.addButton('camp');
  },fs.readFileSync('pages/Coupon.html','utf8'));
  const block=page.locator('.pos-button-block'),group=block.locator('.btn-group-mode'),rows=block.locator('.item-body tr');
  assert.equal(await group.count(),1);assert.equal(await group.isChecked(),false);
  const category=block.locator('.btn-category-mode');assert.equal(await category.count(),1);assert.equal(await category.isChecked(),false);
  assert.equal(await block.locator('label[for^="group-"]').textContent(),'คิดเป็นกลุ่ม');
  assert.equal(await rows.first().locator('.row-scope').isVisible(),false);
  await rows.first().locator('.row-cat-select').selectOption('Fries');await rows.first().locator('.row-search-input').fill('101001');
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'101001');
  await rows.first().locator('.row-cat-select').selectOption('Drink');
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'');
  await rows.first().locator('.row-search-input').fill('101001');assert.equal(await rows.first().locator('.row-ic').inputValue(),'');
  await rows.first().locator('.row-search-input').fill('201001');assert.equal(await rows.first().locator('.row-ic').inputValue(),'201001');
  await page.evaluate(()=>window.confirmSwitch=false);await group.click();await page.waitForFunction(()=>!document.querySelector('.btn-group-mode').checked);
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'201001');
  await page.evaluate(()=>window.confirmSwitch=true);await group.check();await page.waitForFunction(()=>document.querySelector('.btn-group-mode').checked&&!document.querySelector('.row-ic').value);
  assert.equal(await block.locator('.btn-group-target').inputValue(),'ITEM');
  await rows.first().locator('.row-cat-select').selectOption('Fries');await rows.first().locator('.row-search-input').fill('101001');
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'101001');
  await block.locator('.btn-disc-input').fill('10');
  for(const selector of ['.row-op','.row-net']){assert.equal(await rows.first().locator(selector).inputValue(),'');assert.equal(await rows.first().locator(selector).isVisible(),false);}
  await block.locator('.coupon-add-row').click();await rows.nth(1).locator('.row-cat-select').selectOption('Drink');await rows.nth(1).locator('.row-search-input').fill('201001');
  assert.equal(await rows.nth(1).locator('.row-ic').inputValue(),'201001');assert.equal(await rows.nth(1).locator('.row-net').inputValue(),'');
  await page.evaluate(()=>window.confirmSwitch=false);await category.click();await page.waitForFunction(()=>!document.querySelector('.btn-category-mode').checked);
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'101001');
  await page.evaluate(()=>window.confirmSwitch=true);await category.check();await page.waitForFunction(()=>document.querySelector('.row-scope').value==='CATE');
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'');
  await rows.first().locator('.row-cat-select').selectOption('Fries');
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'101');
  for(const selector of ['.row-qty','.row-op','.row-net'])assert.equal(await rows.first().locator(selector).isVisible(),false);
  await block.locator('.btn-disc-input').fill('10');assert.equal(await rows.first().locator('.row-net').inputValue(),'');
  await block.locator('.coupon-add-row').click();
  assert.equal(await rows.nth(1).locator('.row-scope').inputValue(),'CATE');
  for(const width of [1366,390]){await page.setViewportSize({width,height:844});await page.screenshot({path:'/private/tmp/coupon-group-'+width+'.png'});}
  await category.uncheck();await page.waitForFunction(()=>document.querySelector('.row-scope').value==='ITEM');
  assert.equal(await group.isChecked(),true);
  await group.uncheck();await page.waitForFunction(()=>!document.querySelector('.btn-group-mode').checked);
  assert.equal(await rows.first().locator('.row-op').isVisible(),true);
  assert.equal(await rows.first().locator('.row-ic').inputValue(),'');
  await rows.first().locator('.row-cat-select').selectOption('__SUBSET__');
  assert.equal(await rows.first().locator('.row-cat-select').isVisible(),true);
  assert.equal(await rows.first().locator('.row-scope').inputValue(),'SUBSET');
  console.log('Chrome: button-level group checkbox, cancellation preserves items, all rows share one mode, no group prices, individual mode restored.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
