const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../js/promotion-edit-model.js');
const block=(extra={})=>({m:{'2026-11':[{campaign:'TOTO',shortName:'Fries',submittedBy:'Bow',itStatus:'PENDING',opStatus:'WAITING',...extra}]}});

test('IT and Admin may edit any campaign through the submitter form; other roles may not',()=>{
 for(const role of ['IT','Admin'])assert.equal(M.policy(block(),'Somchai IT','2026-11',{role}).allowed,true,role);
 for(const role of ['MKT','OP','Admin HQ','it','',undefined])assert.equal(M.policy(block(),'Somchai IT','2026-11',{role}).allowed,false,String(role));
 // Without a role (the server path today) ownership is still enforced.
 assert.equal(M.policy(block(),'Somchai IT','2026-11').allowed,false);
 assert.equal(M.policy(block(),'','2026-11',{role:'IT'}).allowed,false);
});
test('IT and Admin keep the same locks and reason rule as the campaign submitter',()=>{
 assert.equal(M.policy(block({changeStatus:'CANCELLED'}),'Somchai IT','2026-11',{role:'IT'}).allowed,false);
 assert.equal(M.policy(block({itStatus:'COMPLETE'}),'Somchai IT','2026-11',{role:'Admin'}).requiresReason,M.policy(block({itStatus:'COMPLETE'}),'Bow','2026-11').requiresReason);
 assert.equal(M.policy(block(),'Somchai IT','2026-11',{role:'IT'}).requiresReason,false);
});

function trackingContext(role,user){
 const data=new Map([['pc_role',role],['pc_userName',user]]);const opened=[];
 const run=()=>{const r={withSuccessHandler(fn){r.ok=fn;return r;},withFailureHandler(){return r;},getAllCampaignData(){r.ok([{rowIdx:7,campaign:'TOTO',month:'2026-11',submittedBy:'Bow',promotionEditPolicy:{allowed:true}}]);},getCoPromoCampaigns(){},getCoPromoCodes(){}};return r;};
 const c=vm.createContext({console,setTimeout(){return 1;},clearTimeout(){},Promise,Set,Map,JSON,
  localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},sessionStorage:{getItem:()=>null,removeItem(){}},
  document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}}},
  Swal:{fire(){},close(){}},google:{script:{get run(){return run();}}}});
 c.window=c;c.clearViewState=()=>{};
 c.PC_PromotionEdit={open:(campaign,month)=>opened.push([campaign,month])};
 vm.runInContext(fs.readFileSync('js/promotion-edit-model.js','utf8'),c);
 vm.runInContext(fs.readFileSync('js/campaign-tracking.js','utf8'),c);
 return {c,opened};
}
const src=fs.readFileSync('js/campaign-tracking.js','utf8');
const action=(role,user,camp)=>{const {c}=trackingContext(role,user);const fn=src.match(/function ctProposalEditAction\(camp\) \{[\s\S]*?\n  \}/)[0];return vm.runInContext('('+fn+')',c)(camp);};

test('IT clicking Edit on Campaign Tracking opens the user proposal edit form',()=>{
 for(const role of ['IT','Admin']){
  const {c,opened}=trackingContext(role,'Somchai IT');c.loadTrackingData();c.ctEditProposal(7);
  assert.deepEqual(opened,[['TOTO','2026-11']],role);
 }
});
test('the Edit button is the user form button for IT/Admin, and no admin inline editor remains',()=>{
 const camp={rowIdx:7,campaign:'TOTO',submittedBy:'Bow',promotionEditPolicy:{allowed:true}};
 for(const role of ['IT','Admin'])assert.match(action(role,'Somchai IT',camp),/window\.ctEditProposal\(7\)/,role);
 assert.equal(action('MKT','Somchai',camp),'');
 assert.match(action('MKT','Bow',camp),/window\.ctEditProposal\(7\)/);
 assert.doesNotMatch(src,/ctEditRow|ctSaveRow|updateCampaignMeta|แก้ไขแถว \(แอดมิน\)/);
});
test('edit form passes the signed-in role so IT/Admin are checked as editors',async()=>{
 const data=new Map([['pc_userName','Somchai IT'],['pc_role','IT']]);let seen;
 const c=vm.createContext({console,setTimeout,clearTimeout,document:{getElementById(){return null;}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},Swal:{fire:async()=>({})}});
 c.window=c;let page='';c.loadPage=p=>page=p;
 c.PC_CLOUD={loadCampaignEdit:async(campaign,month,actor,role)=>{seen=[actor,role];return {campaign,month,actor,role,form:{form:'Proposal'}};}};
 vm.runInContext(fs.readFileSync('js/promotion-edit-model.js','utf8'),c);vm.runInContext(fs.readFileSync('js/promotion-edit.js','utf8'),c);
 await c.PC_PromotionEdit.open('TOTO','2026-11');
 assert.deepEqual(seen,['Somchai IT','IT']);assert.equal(page,'CreatePromotion');
});
