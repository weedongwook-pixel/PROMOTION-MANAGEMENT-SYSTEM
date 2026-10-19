// Presentation regression checks against actual page templates and local data.
// All external requests are intercepted; no production reads or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  for(const name of (process.argv.includes('--summaries')?['Campaign_Tracking','Op_Tracking']:process.argv.includes('--dashboard')?['Dashboard']:['Dashboard','Proposal','Coupon','BillDiscountProposal','VoucherProposal','Campaign_Tracking','Op_Tracking','NPD','Flavor'])){
   const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!=='http://workspace.test'){
     const f=u.href.includes('bootstrap.bundle')?'vendor/bootstrap/bootstrap.bundle.min.js':u.href.includes('sweetalert2')?'vendor/sweetalert2/sweetalert2.all.min.js':null;
     return f?route.fulfill({path:path.join(root,f)}):route.fulfill({body:'',contentType:'text/css'});
    }
    if(u.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><link rel="stylesheet" href="/css/workspace.css"><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script><script>localStorage.setItem("pc_role","Admin");localStorage.setItem("pc_userName","UI test");</script><script src="/data/seed.js"></script><script src="/data/subset-master.js"></script><script src="/js/themes.js"></script><script src="/js/mock-backend.js"></script><script src="/js/code-counter.js"></script></head><body><main id="content-area">'+fs.readFileSync(path.join(root,'pages',name+'.html'),'utf8')+'</main><script>PC_applyTheme();if(typeof window["init'+name+'"]==="function")window["init'+name+'"]();</script></body></html>'});
    const dest=path.resolve(root,'.'+u.pathname);
    assert.ok(dest.startsWith(root+path.sep));
    return fs.existsSync(dest)?route.fulfill({path:dest}):route.fulfill({status:404,body:''});
   });
   await page.goto('http://workspace.test/');
   assert.equal(await page.locator('.pc-workspace').count(),1,name+' must use the shared workspace surface');
   if(name==='Dashboard')await page.locator('#d2Stats .stat').first().waitFor();
   if(['Proposal','Coupon','BillDiscountProposal','VoucherProposal'].includes(name))await page.locator('#mainContent').waitFor({state:'visible'});
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>document.fonts.check('16px Sarabun')),true,'self-hosted Thai font is available');
   const style=await page.locator('.pc-workspace').evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontFamily,size:parseFloat(s.fontSize),bg:s.backgroundColor};});
   assert.ok(style.font.includes('Sarabun'),name+' uses the shared Thai typeface');
   assert.equal(style.size,16,name+' body text stays readable');
   assert.equal(style.bg,'rgb(247, 250, 247)');
   if(process.argv.includes('--summaries')){
    const op=name==='Op_Tracking';
    await page.waitForFunction(op=>typeof window[op?'renderOptSummary':'renderSummary']==='function',op);
    await page.evaluate(op=>{if(op)renderOptSummary({waiting:8,approved:283,total:291});else renderSummary({all:291,pending:8,complete:283});},op);
    const cards=page.locator((op?'#optSummary':'#summaryRow')+' .card');
    assert.equal(await cards.count(),3);
    for(const card of await cards.all()){
     assert.deepEqual(await card.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(232, 245, 233)','rgb(27, 94, 32)'],'every summary card uses the shared soft green theme');
    }
    assert.deepEqual(await cards.locator('h3').allTextContents(),op?['8','283','291']:['291','8','283'],'palette changes retain the summary values');
    if(op){
     await page.evaluate(()=>{renderNpdOpSummary({pending:2,confirmed:3,total:5});renderFlvOpSummary({pending:1,confirmed:4,total:5});});
     for(const id of ['npdOpSummary','flvOpSummary']){
      const extra=page.locator('#'+id+' .card');assert.equal(await extra.count(),3);
      for(const card of await extra.all())assert.deepEqual(await card.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(232, 245, 233)','rgb(27, 94, 32)'],id+' follows the same summary palette');
     }
    }
   }
   const field=page.locator('.pc-workspace input.form-control:not([type=hidden])').first();
   if(await field.count()){
    await field.focus();
    assert.ok(await field.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),name+' entry text must be at least 16px');
    await field.blur();
    const boundaryContrast=await field.evaluate(el=>{
     const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
     const s=getComputedStyle(el),a=lum(s.borderTopColor),b=lum(s.backgroundColor);
     return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(boundaryContrast>=3,name+' field boundary must remain visible outside focus');
   }
   const submit=page.locator('#mainSubmitBtn,[onclick="RD.submit(\'new\')"],[onclick="window.FLV.submit()"]');
   if(await submit.count()){
    assert.deepEqual(await submit.first().evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];}),['rgb(27, 94, 32)','rgb(255, 255, 255)'],name+' primary action has accessible dark green / white contrast');
   }
   if(name==='Dashboard'){
    assert.equal(await page.locator('.d-head').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 245, 233)','dashboard banner uses the approved soft green');
    const totals=await page.locator('#d2Stats [data-cu]').evaluateAll(els=>els.map(el=>el.dataset.cu));
    assert.equal(totals.length,5,'all five existing KPI cards remain');
    await page.locator('#d2DarkBtn').click();
    assert.equal(await page.locator('.dash2').evaluate(el=>el.classList.contains('dark')),true);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dash2')).backgroundColor!=='rgb(247, 250, 247)');
    assert.notEqual(await page.locator('.dash2').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 250, 247)','local dark mode remains usable');
    await page.locator('#d2DarkBtn').click();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dash2')).backgroundColor==='rgb(247, 250, 247)');
    assert.deepEqual(await page.locator('#d2Stats [data-cu]').evaluateAll(els=>els.map(el=>el.dataset.cu)),totals,'appearance changes must not alter KPI values');
   }
   await page.screenshot({path:'/private/tmp/workspace-'+name+'-desktop.png'});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:'/private/tmp/workspace-'+name+'-mobile.png'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   if(overflow)console.error('Overflow:',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2&&!el.closest('table')).slice(0,8).map(el=>({tag:el.tagName,id:el.id,cls:el.className,width:el.getBoundingClientRect().width}))));
   assert.equal(overflow,false,name+' must scroll tables, not the entire mobile page');
   assert.deepEqual(errors,[],name+' has no runtime errors');
   console.log(name+': Thai font, 16px form text, green surface, mobile overflow OK');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
