const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const ownerMode=process.argv.includes('--gmail-owner');
  const server=http.createServer((req,res)=>{
    const p=req.url.split('?')[0];
    if(p==='/fixture'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/css/workspace.css"></head><body>'+fs.readFileSync('pages/Email_Settings.html','utf8')+'</body></html>');return;
    }
    const full=path.join(process.cwd(),p);
    if(!full.startsWith(process.cwd())||!fs.existsSync(full)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream');
    res.end(fs.readFileSync(full));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    for(const width of [1366,390]){
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      let enabled=false,status='not_connected';
      await page.route('**/email/**',async route=>{
        const p=new URL(route.request().url()).pathname;let body;
        if(p==='/email/capabilities')body={enabled,authMode:ownerMode?'gmail_owner':'microsoft',scope:enabled?'api://22222222-2222-4222-8222-222222222222/access_as_user':null,sendingEnabled:false};
        else if(p==='/email/auth/session')body={identity:{tenantId:'owner',objectId:'owner'},csrf:'mock-csrf'};
        else if(p==='/email/status')body=enabled?{state:status,sender:status==='connected'?'it@rocks-foods.com':null,missing:[],sendingEnabled:false}:{state:'configuration_incomplete',missing:['GMAIL_CLIENT_SECRET'],sendingEnabled:false};
        else if(p==='/email/gmail/connect')body={authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth'};
        else body={state:'disconnected',ownerRevocationRequired:true};
        await route.fulfill({status:!enabled&&p!=='/email/capabilities'?503:200,json:body});
      });
      await page.addInitScript(ownerMode=>{
        window.PC_LANG='TH';
        const account={username:'admin@example.com',idTokenClaims:{tid:'tenant',oid:'object'}};
        window.PC_EmailMsalContext=async()=>{if(ownerMode)throw Error('Microsoft must not be used');return ({email:account.username,identity:{tenantId:'tenant',objectId:'object'},app:{getAllAccounts:()=>[account],acquireTokenSilent:async()=>({account,accessToken:'mock'}),acquireTokenPopup:async()=>({account,accessToken:'mock'})}});};
      },ownerMode);
      await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
      await page.evaluate(()=>window.initEmail_Settings());
      await page.waitForFunction(()=>document.querySelector('[data-email-status]').textContent.includes('ตั้งค่า'));
      assert.equal(await page.locator('[data-email-connect]').isDisabled(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      enabled=true;
      await page.locator('[data-email-refresh]').click();
      await page.waitForFunction(()=>!document.querySelector('[data-email-connect]').disabled);
      if(ownerMode)assert.equal(await page.locator('[data-email-verify]').isVisible(),false);
      await page.evaluate(()=>{
        const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);
        window.__emailPopup=frame.contentWindow;
        window.open=()=>window.__emailPopup;
      });
      // Prevent the test WindowProxy from navigating to the real provider.
      await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'text/html',body:'mock consent'}));
      await page.locator('[data-email-connect]').click();
      await page.waitForFunction(()=>document.querySelector('[data-email-status]').textContent.includes('ยืนยัน'));
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'pc-email-result',status:'connected'}})));
      assert.match(await page.locator('[data-email-status]').textContent(),/ยืนยัน/);
      status='connected';
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.__emailPopup,data:{type:'pc-email-result',status:'connected'}})));
      await page.waitForFunction(()=>document.querySelector('[data-email-status]').textContent.includes('เชื่อมต่อแล้ว'));
      await page.screenshot({path:`/tmp/gmail-settings-${width}.png`,fullPage:true});
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Email settings mocked desktop/mobile: PASS');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
