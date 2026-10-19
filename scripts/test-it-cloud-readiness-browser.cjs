// Local browser/transport simulation only. No production reads or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage();const errors=[];let gets=0,writes=0;
    page.on('pageerror',e=>errors.push(String(e)));
    const row={campaign:'IT slow Cloud verification',shortName:'Test button',promoType:'Item Set',month:'2026-11',start:'2026-11-01',end:'2026-11-30',itStatus:'PENDING',opStatus:'WAITING',itemCode:'101003',itemNameEN:'MEGA FRIES',qty:1,gross:95,net:59,netPrice:59,discount:36,saleMode:'Take Away',codePromotion:'P9999',codeItemSet:'1079999'};
    const meta={_npdSeeded:true,_flvSeeded:true,_itemSetDemoVer:1,_showcaseVer:1,_recipeCustomVer:1,_billDiscVer:4,_proJulyVer:2,_vcCouponVer:2};
    const keys={'promo::meta':JSON.stringify(meta),['promo::c::'+encodeURIComponent(row.campaign)]:JSON.stringify({m:{'2026-11':[row]},w:[],_ts:1})};
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'vendor/sweetalert2/sweetalert2.all.min.js')});
      if(url.origin==='https://cdnjs.cloudflare.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.origin==='https://potato-promo-sync.quiet-surf-dda2.workers.dev'){
        if(route.request().method()!=='GET'){writes++;return route.fulfill({status:503,body:'No writes permitted in test'});}
        gets++;await new Promise(r=>setTimeout(r,1800));
        return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,keys,meta:Object.fromEntries(Object.keys(keys).map(k=>[k,1]))})});
      }
      assert.equal(url.origin,'http://it.test','Unexpected external request blocked');
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"></head><body>'+fs.readFileSync(path.join(root,'pages/IT_Settlement.html'),'utf8')+'<script>sessionStorage.setItem("pc_cloud_pulled",Date.now());localStorage.setItem("pc_role","IT");</script><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script><script src="/js/mock-backend.js"></script><script src="/js/code-counter.js"></script><script src="/js/cloud-store.js"></script><script>initIT_Settlement();</script></body></html>'});
      const file=path.resolve(root,'.'+url.pathname);assert.ok(file.startsWith(root+path.sep));return route.fulfill({path:file});
    });
    await page.goto('http://it.test/');
    await page.locator('#itLoading').waitFor({state:'visible'});
    assert.equal(await page.locator('.swal2-popup').count(),0,'No immediate error while Cloud is loading');
    await page.locator('#campaignGroupContainer').getByText(row.campaign,{exact:true}).waitFor({timeout:15000});
    assert.equal(await page.locator('.swal2-popup').count(),0);
    assert.equal(await page.locator('#itLoading').isVisible(),false);
    assert.equal(gets,1,'Startup and IT read share one Cloud pull');assert.equal(writes,0);assert.deepEqual(errors,[]);
    console.log('Chrome verified: delayed Cloud displays loading then real IT work; no error popup, duplicate pull, page errors or writes.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
