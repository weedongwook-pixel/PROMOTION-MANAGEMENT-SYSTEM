// Local-only regression: real form code + real bridge, no production requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=process.cwd();
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    for(const form of ['Proposal','Coupon','BillDiscountProposal','VoucherProposal']) {
      const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!=='http://forms.test')return route.fulfill({contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:'/* optional external asset omitted; no network */'});
        if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/css/workspace.css"><div id="content-area"></div><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script><script src="/js/mock-backend.js"></script><script src="/js/form-master-loader.js"></script>'});
        const file=path.resolve(root,'.'+url.pathname);assert.ok(file.startsWith(root+path.sep));
        return route.fulfill({path:file});
      });
      await page.goto('http://forms.test/');
      await page.evaluate(({form,html})=>{
        window.__pageGen=1;window.PC_LANG='TH';window.__flushes=0;window.__reads=0;
        window.PC_CLOUD={enabled:()=>true,hasPending:()=>true,syncNow:()=>{window.__flushes++;return new Promise(()=>{});}};
        window.PC_API.getMasterDataExtended=()=>{
          if(++window.__reads===1)throw Error('simulated catalog outage');
          return {items:[{itemCode:'101001',itemNameEN:'Fries',category:'Fries',cateCode:'101',priceTA:55,priceDLV:65}],branches:[{id:'TEST',name:'Test branch'}]};
        };
        document.getElementById('content-area').innerHTML=html;
        for(const s of document.querySelectorAll('#content-area script'))if(!s.src)window.eval(s.textContent);
        if(typeof window['init'+form]==='function')window['init'+form]();
      },{form,html:fs.readFileSync('pages/'+form+'.html','utf8')});
      await page.locator('#loadingStatus button').waitFor();
      assert.match(await page.locator('#loadingStatus').textContent(),/โหลดข้อมูลสินค้า\/สาขาไม่สำเร็จ/);
      assert.equal(await page.evaluate(()=>window.__flushes),0,form+' must not flush unrelated writes on failure');
      if(form==='Proposal') {
        for(const width of [1366,390]) {
          await page.setViewportSize({width,height:900});
          await page.screenshot({path:`/tmp/form-master-error-${width}.png`,fullPage:true});
          assert.equal(await page.locator('#loadingStatus button').isVisible(),true);
        }
      }
      await page.locator('#loadingStatus button').click();
      await page.locator('#mainContent').waitFor({state:'visible'});
      assert.equal(await page.locator('#campaignList > div').count()>0,true,form+' opens actual campaign form');
      assert.equal(await page.evaluate(()=>window.__flushes),0,form+' does not wait for never-resolving sync');
      assert.equal(await page.evaluate(()=>window.__reads),2);
      assert.deepEqual(errors,[]);
      console.log(form+': catalog error visible, retry opens form, unrelated sync never called');
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
