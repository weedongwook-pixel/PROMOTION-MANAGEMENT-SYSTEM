const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const source=fs.readFileSync('pages/Proposal.html','utf8'),net=source.match(/<input[^>]*class="[^"]*btn-net[^"]*"[^>]*>/)[0].replaceAll('${btnId}','button');
 const modes=['Take Away','GRAB','LINEMAN','ShopeeFood','Robinhood','Gokoo','All Delivery','All Channel'];
 const page=await browser.newPage();await page.setContent('<div id="camp">'+modes.map(mode=>'<input type="checkbox" class="'+(mode.startsWith('All ')?'mode-check-all':'mode-check')+'" value="'+mode+'" onchange="window.handleCampaignSelection(this,\'camp\',\''+(mode.startsWith('All ')?'all':'single')+'\')">').join('')+'<div class="pos-button-block" id="button"><table><tbody class="item-body"></tbody></table><span class="btn-gross">0.00</span>'+net+'<input class="btn-disc"></div></div>');
 await page.evaluate(source=>{window.categories=[];window.updateDatalist=()=>{};eval(source.slice(source.indexOf('window.addItemRow ='),source.indexOf('window.handleFill =')));window.addItemRow('button','camp');window.addItemRow('button','camp');},source);
 const rows=page.locator('.item-body tr');await rows.nth(0).locator('.row-op').fill('49');await rows.nth(0).locator('.row-qty').fill('2');await rows.nth(1).locator('.row-op').fill('50');
 assert.equal(await page.locator('.btn-gross').textContent(),'148.00');assert.equal(await rows.nth(0).locator('.row-op').inputValue(),'49');assert.equal(await page.locator('.btn-disc').inputValue(),'');
 await page.evaluate(()=>{const q=document.querySelector('.row-qty');q.value='3';q.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('.btn-gross').textContent(),'197.00','Committed quantity changes must recalculate quantity × unit price');
 await page.locator('.btn-net').fill('100');await page.evaluate(()=>document.querySelector('.btn-net').dispatchEvent(new Event('input',{bubbles:true})));
 assert.equal(await page.locator('.btn-disc').inputValue(),'97.00');
 await rows.nth(0).locator('.row-qty').fill('4');assert.equal(await page.locator('.btn-gross').textContent(),'246.00');assert.equal(await page.locator('.btn-disc').inputValue(),'146.00');
 await page.evaluate(source=>{
  window.masterData=[{itemCode:'101001',itemNameEN:'Fries',priceTA:49,priceDLV:59},{itemCode:'101002',itemNameEN:'Chicken',priceTA:50,priceDLV:70}];
  for(const name of ['handleCampaignSelection','updateAllPricesInBlock'])eval(source.match(new RegExp('window\\.'+name+' = function\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\};'))[0]);
  document.querySelectorAll('.item-body tr').forEach((row,i)=>{row.querySelector('.row-ic').value=window.masterData[i].itemCode;row.querySelector('.row-search-input').value=window.masterData[i].itemCode+' - '+window.masterData[i].itemNameEN;});
 },source);
 for(const mode of modes){await page.locator('input[value="'+mode+'"]').check();const delivery=mode!=='Take Away'&&mode!=='All Channel';assert.equal(await rows.first().locator('.row-op').inputValue(),delivery?'59':'49');assert.equal(await rows.first().locator('.row-qty').inputValue(),'4');assert.equal(await page.locator('.btn-gross').textContent(),delivery?'306.00':'246.00');assert.equal(await page.locator('.btn-disc').inputValue(),delivery?'206.00':'146.00');}
 console.log('Proposal Chrome: unit prices unchanged; 49×2+50=148, committed Qty 3 gives 197, Qty 4 gives 246; Discount follows entered Net.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
