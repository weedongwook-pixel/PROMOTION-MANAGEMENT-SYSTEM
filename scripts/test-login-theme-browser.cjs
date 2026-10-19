// Presentation-only login check. No credentials, production calls, or real login.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());assert.equal(u.origin,'http://login.test','No external requests are permitted');
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'Potato Corner Promotion System.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https?:\/\/[^>]*>/gi,'')});
   const file=path.resolve(root,'.'+u.pathname);assert.ok(file.startsWith(root+path.sep));return route.fulfill({path:file});
  });
  await page.goto('http://login.test/');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#boot-splash').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  assert.equal(await page.locator('#boot-status').isVisible(),false,'Normal boot does not show preparation text');
  await page.locator('#boot-splash').evaluate(el=>el.remove());
  assert.equal(await page.locator('#login-section').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 245, 233)');
  assert.equal(await page.locator('#login-section').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  assert.equal(await page.locator('#loginBtn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(27, 94, 32)');
  assert.equal(await page.locator('#loginBtn').getAttribute('onclick'),'doLogin()');
  assert.equal(await page.locator('#msLoginBtn').getAttribute('onclick'),'loginWithMicrosoft()');
  await page.locator('#user').fill('test-user');await page.locator('#pass').fill('test-only');
  await page.locator('#user').focus();assert.notEqual(await page.locator('#user').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  for(const width of [1366,390,320]){
   await page.setViewportSize({width,height:width===320?480:900});
   assert.ok(await page.locator('#login-section').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Login must not overflow sideways at '+width);
   await page.locator('#msLoginBtn').scrollIntoViewIfNeeded();assert.ok(await page.locator('#msLoginBtn').isVisible());
   await page.screenshot({path:'/private/tmp/login-green-'+width+'.png'});
  }
  await page.locator('#errMsg').evaluate(el=>el.textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');assert.equal(await page.locator('#errMsg').isVisible(),true);
  console.log('Login theme verified: green palette, focus, mobile scrolling, original login handlers and errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
