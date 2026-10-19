// Read-only live diagnostics: never enters credentials, blocks all non-GET requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],failed=[],pending=new Map();
  page.on('request',r=>{const u=new URL(r.url());pending.set(r,u.hostname+u.pathname);});page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>pending.delete(r));
  await page.context().route('**/*',route=>route.request().method()==='GET'?route.continue():route.abort());
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{const u=new URL(r.url());failed.push({host:u.hostname,path:u.pathname,error:r.failure()?.errorText});});
  await page.goto('https://white-pine-853e.quiet-surf-dda2.workers.dev/',{waitUntil:'domcontentloaded',timeout:30000});
  const app=page.frames().find(f=>f.parentFrame());
  await app.locator('#msLoginBtn').waitFor({state:'visible',timeout:30000});
  console.log(JSON.stringify({stage:'beforeClick',state:await app.evaluate(()=>({inFrame:window!==top,bootReady:window.__pcBoot?.isReady(),msal:typeof msal,api:typeof window.PC_API?.checkLoginByEmail,statusText:document.querySelector('#boot-status')?.textContent,statusVisible:!!document.querySelector('#boot-status')&&!document.querySelector('#boot-status').hidden,loginError:document.querySelector('#errMsg')?.textContent})),errors,failed}));
  try{await app.waitForFunction(()=>window.__pcBoot?.isReady(),{timeout:25000});}catch{}
  console.log(JSON.stringify({stage:'readyCheck',ready:await app.evaluate(()=>({ready:window.__pcBoot?.isReady(),msal:typeof msal,status:document.querySelector('#boot-status')?.textContent})),pending:[...pending.values()],errors,failed}));
  if(!await app.evaluate(()=>window.__pcBoot?.isReady()))return;
  const popupPromise=page.waitForEvent('popup',{timeout:12000}).catch(()=>null);
  await app.locator('#msLoginBtn').click();
  const popup=await popupPromise;
  if(popup){try{await popup.waitForURL(/https:\/\/login\.microsoftonline\.com\//,{timeout:15000});await popup.waitForLoadState('domcontentloaded',{timeout:10000});}catch{}const u=new URL(popup.url());console.log(JSON.stringify({stage:'popup',host:u.hostname,path:u.pathname,title:u.hostname==='login.microsoftonline.com'?await popup.title().catch(()=>''):'Not navigated to Microsoft yet',visibleText:u.hostname==='login.microsoftonline.com'?(await popup.locator('body').innerText().catch(()=>'' )).slice(0,1200):''}));await popup.close();}
  console.log(JSON.stringify({stage:'afterClick',popupOpened:!!popup,error:await app.locator('#errMsg').textContent(),errors,failed}));
  await page.screenshot({path:'/private/tmp/login-live-diagnostic.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1);});
