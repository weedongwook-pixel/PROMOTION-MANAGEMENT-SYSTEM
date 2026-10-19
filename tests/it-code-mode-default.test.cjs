const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(){const html=fs.readFileSync('pages/IT_Settlement.html','utf8'),c={window:{},itEsc:String};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('  function itCanAssignRevisionCode('),html.indexOf('  function itUniqueButtonCode(')),c);return c;}
test('an existing revision button explicitly defaults to retaining its saved code',()=>{
 const c=context(),html=c.itRevisionCodeControls({revisionPending:true,revisionId:'rev',editButtonId:'b0',promoCode:'P1234'},'promotion');
 assert.match(html,/<option value="keep">ใช้รหัสเดิม/);assert.match(html,/ให้ระบบจองโค้ดใหม่/);
});
test('a new button retains an already assigned code rather than reserving again on load',()=>{
 const c=context(),html=c.itRevisionCodeControls({revisionPending:true,revisionId:'rev',editButtonId:'edit:rev:1',promoCode:'P1235'},'promotion');
 assert.match(html,/<option value="keep">ใช้รหัสที่จองไว้/);
});
test('keep mode does not call Cloud even if the handler is invoked directly',async()=>{
 const c=context(),select={value:'keep'},manual={value:''},status={};let calls=0;
 c.window.PC_CLOUD={assignITButtonCode(){calls++;throw Error('unexpected allocation');}};
 const box={dataset:{slot:'promotion'},querySelector:s=>s==='.it-code-mode'?select:s==='.it-manual-code'?manual:status};
 const tr={closest:()=>({})};await c.window.itAssignRevisionCode({closest:s=>s==='.it-revision-code'?box:tr});assert.equal(calls,0);assert.equal(status.textContent,undefined);
});
test('switching back to keep hides manual input and disables allocation',()=>{
 const c=context(),input={},button={},box={querySelector:s=>s==='.it-manual-code'?input:button};
 c.window.itRevisionCodeMode({value:'keep',closest:()=>box});assert.equal(input.hidden,true);assert.equal(input.disabled,true);assert.equal(button.disabled,true);
});
