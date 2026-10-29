const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
function entry(popup, hash) {
  const nodes = Object.fromEntries(['app','sp','slow','retry'].map(id=>[id,{hidden:false,remove(){this.removed=true;},addEventListener(){}}]));
  const context = {window:{opener:popup?{}:null,location:{hash}},document:{getElementById:id=>nodes[id]},navigator:{},setTimeout:()=>1,clearTimeout(){},addEventListener(){}};
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(match[1],context);
  return nodes;
}
function loginHelpers(shell){return shell.slice(shell.indexOf('const PC_LOGIN_NET_MSG'),shell.indexOf('/* ---- Microsoft Entra'));}
function microsoft({loginPopup,staffRequest,staffEnabled=true,onLine=true}){
  const shell=fs.readFileSync('Potato Corner Promotion System.html','utf8');
  const source=loginHelpers(shell)+shell.slice(shell.indexOf('let _msPrep = null;'),shell.indexOf('/* 2. App init */'));
  const button={disabled:false,innerHTML:'Microsoft'},error={innerText:''},calls={legacy:[],after:0,swal:0};
  const runner={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(){return this;},checkLoginByEmail(email){calls.legacy.push(email);}};
  const context={navigator:{onLine},window:{PC_CoProEmail:{capabilities:async()=>({staffEnabled})},PC_EmailAuth:{staffRequest,rememberStaff(){}}},Swal:{fire:async()=>{calls.swal++;}},afterLogin(){calls.after++;},
    document:{getElementById:id=>id==='errMsg'?error:button},msal:{PublicClientApplication(){}},getMsalApp:()=>({loginPopup}),_msalReady:null,google:{script:{run:runner}}};
  vm.createContext(context);vm.runInContext(source,context);
  return {run:()=>context.loginWithMicrosoft(),prepare:()=>context.pcPrepareMicrosoftLogin(),context,button,error,calls};
}
const staff=code=>async path=>{if(path==='microsoft/challenge')return {nonce:'n'};if(path==='microsoft'){const e=Error('server');e.code=code;throw e;}return {};};
test('Outlook login falls back to the website user list when the account is not mail staff',async()=>{
  const m=microsoft({loginPopup:async()=>({idToken:'t',account:{username:'User@Rocksgroup.com'}}),staffRequest:staff('email_staff_signin_required')});
  await m.run();
  assert.deepEqual(m.calls.legacy,['user@rocksgroup.com']);assert.equal(m.calls.swal,0);assert.equal(m.error.innerText,'');
});
test('Outlook login still stops on other staff errors',async()=>{
  const m=microsoft({loginPopup:async()=>({idToken:'t',account:{username:'u@rocksgroup.com'}}),staffRequest:staff('email_staff_try_later')});
  await m.run();
  assert.deepEqual(m.calls.legacy,[]);assert.match(m.error.innerText,/ไม่สำเร็จ/);assert.equal(m.button.disabled,false);
});
test('blocked popup and lost internet show plain Thai guidance',async()=>{
  const blocked=microsoft({staffEnabled:false,loginPopup:async()=>{throw Object.assign(Error('popup'),{errorCode:'popup_window_error'});}});
  await blocked.prepare();await blocked.run();assert.match(blocked.error.innerText,/Pop-up/);assert.equal(blocked.button.disabled,false);
  const offline=microsoft({staffEnabled:false,loginPopup:async()=>{throw new TypeError('Failed to fetch');}});
  await offline.run();assert.match(offline.error.innerText,/เชื่อมต่ออินเทอร์เน็ตไม่ได้/);
  const cancelled=microsoft({staffEnabled:false,loginPopup:async()=>{throw Object.assign(Error('x'),{errorCode:'user_cancelled'});}});
  await cancelled.run();assert.equal(cancelled.error.innerText,'');
});
test('password login reports a network failure in Thai',async()=>{
  const shell=fs.readFileSync('Potato Corner Promotion System.html','utf8');
  const nodes={user:{value:'u'},pass:{value:'p'},loginBtn:{},errMsg:{}};
  const context={navigator:{onLine:true},document:{getElementById:id=>nodes[id]},window:{PC_CoProEmail:{capabilities:async()=>{throw new TypeError('Failed to fetch');}}}};
  vm.createContext(context);vm.runInContext(shell.slice(shell.indexOf('async function doLogin()'),shell.indexOf('/* ---- Microsoft Entra')),context);
  await context.doLogin();assert.match(nodes.errMsg.textContent,/เชื่อมต่ออินเทอร์เน็ตไม่ได้/);
});
test('a prepared Outlook login opens the popup without waiting on the network, then signs out the old mail session',async()=>{
  const order=[];
  const m=microsoft({loginPopup:async()=>{order.push('popup');return {idToken:'t',account:{username:'u@rocksgroup.com'}};},
    staffRequest:async path=>{order.push(path);if(path==='microsoft/challenge')return {nonce:'n'};if(path==='microsoft')return {staff:true};return {};}});
  m.context.afterLogin=()=>order.push('after');
  await m.prepare();order.length=0;
  m.context.window.PC_CoProEmail.capabilities=async()=>{throw Error('must not be called on click');};
  await m.run();
  assert.deepEqual(order.slice(0,4),['popup','logout','microsoft','after']);
});
test('a popup refused after preparing asks for one more click',async()=>{
  const m=microsoft({staffEnabled:false,loginPopup:async()=>{throw Object.assign(Error('popup'),{errorCode:'popup_window_error'});}});
  await m.run();assert.match(m.error.innerText,/กด Login Outlook อีกครั้ง/);assert.doesNotMatch(m.error.innerText,/บล็อก/);
  await m.prepare();await m.run();assert.match(m.error.innerText,/Pop-up/);
});
test('OAuth popup preserves response without booting another application',()=>{
  const nodes=entry(true,'#code=test&state=test');
  assert.equal(nodes.app.src,undefined);
  assert.equal(nodes.sp.removed,true);
  assert.doesNotMatch(html,/<iframe[^>]+\ssrc=/);
});
test('normal entry still opens the application',()=>{
  assert.match(entry(false,'').app.src,/Potato Corner Promotion System.html/);
});
test('OAuth error also avoids app boot while ordinary popup can open app',()=>{
  assert.equal(entry(true,'#error=access_denied&state=test').app.src,undefined);
  assert.match(entry(true,'').app.src,/Potato Corner Promotion System.html/);
});
test('permission lookup failure restores the Microsoft login button',async()=>{
  const shell=fs.readFileSync('Potato Corner Promotion System.html','utf8');
  const source=loginHelpers(shell)+shell.slice(shell.indexOf('let _msPrep = null;'),shell.indexOf('/* 2. App init */'));
  const button={disabled:false,innerHTML:'Microsoft'};
  const error={innerText:''};
  const runner={withSuccessHandler(){return this;},withFailureHandler(fn){this.fail=fn;return this;},checkLoginByEmail(){if(this.fail)this.fail(new Error('offline'));}};
  const context={window:{PC_CoProEmail:{capabilities:async()=>({staffEnabled:false})}},document:{getElementById:id=>id==='errMsg'?error:button},msal:{PublicClientApplication(){}},getMsalApp:()=>({loginPopup:async()=>({account:{username:'test@example.com'}})}),_msalReady:null,google:{script:{run:runner}}};
  vm.createContext(context);vm.runInContext(source,context);
  await context.loginWithMicrosoft();
  assert.equal(button.disabled,false);
  assert.equal(button.innerHTML,'Microsoft');
  assert.match(error.innerText,/ตรวจสิทธิ์/);
});
test('password login never falls back with a previous mail session when server logout fails',async()=>{
 const shell=fs.readFileSync('Potato Corner Promotion System.html','utf8');
 const source=shell.slice(shell.indexOf('async function doLogin()'),shell.indexOf('/* ---- Microsoft Entra'));
 for(const failAt of ['capabilities','logout']){
  let legacy=0;const nodes={user:{value:'legacy'},pass:{value:'legacy-pass'},loginBtn:{},errMsg:{}};
  const context={document:{getElementById:id=>nodes[id]},window:{PC_CoProEmail:{capabilities:async()=>{if(failAt==='capabilities')throw Error('offline');return {staffEnabled:true};}},PC_EmailAuth:{staffRequest:async()=>{throw Error('logout failed');}}},google:{script:{run:{withSuccessHandler(){legacy++;return this;},checkLogin(){}}}}};
  vm.createContext(context);vm.runInContext(source,context);await context.doLogin();assert.equal(legacy,0);assert.equal(nodes.loginBtn.disabled,false);
 }
});
