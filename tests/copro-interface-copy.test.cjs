const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('pilot Interface confirmation explains the combined milestone instead of promising ACC delivery',async()=>{
  const nodes=new Map(),dialogs=[];let success;
  const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},getCoPromotions(){success([{id:'record',emailCampaignId:'protected',campaign:'Pilot',brand:'Test',codePromotion:'IC001'}]);}};
  const context={console,Date,localStorage:{getItem:()=>''},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:''});return nodes.get(id);}},google:{script:{run}},Swal:{fire:async o=>{dialogs.push(o);return {isConfirmed:false};}}};context.window=context;vm.createContext(context);
  const html=fs.readFileSync('pages/InterfaceERP.html','utf8');for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())vm.runInContext(match[1],context);
  await new Promise(r=>setImmediate(r));context.ieConfirm('record');
  assert.match(dialogs[0].html,/ครบทุกปุ่ม/);assert.doesNotMatch(dialogs[0].html,/แจ้งทีมบัญชี \(ACC\)/);assert.doesNotMatch(dialogs[0].confirmButtonText,/แจ้ง ACC/);
});
