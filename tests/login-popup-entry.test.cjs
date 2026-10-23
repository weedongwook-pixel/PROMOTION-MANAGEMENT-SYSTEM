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
  const source=shell.slice(shell.indexOf('async function loginWithMicrosoft()'),shell.indexOf('/* 2. App init */'));
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
