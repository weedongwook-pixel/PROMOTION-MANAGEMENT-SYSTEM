const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const data=new Map([['pc_userName','Bow']]);const c=vm.createContext({console,setTimeout,clearTimeout,document:{getElementById(){return null;}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},Swal:{fire:async()=>({})}});c.window=c;vm.runInContext(fs.readFileSync('js/promotion-edit-model.js','utf8'),c);vm.runInContext(fs.readFileSync('js/promotion-edit.js','utf8'),c);return c;}
test('edit opens the original form only after Cloud ownership check, never the IT page',async()=>{
 const c=setup();let page='';c.loadPage=p=>page=p;
 c.PC_CLOUD={loadCampaignEdit:async(campaign,month,actor)=>{assert.equal(actor,'Bow');return {campaign,month,actor,form:{form:'Coupon'}};}};
 await c.PC_PromotionEdit.open('TOTO','2026-11');assert.equal(page,'CreatePromotion');assert.equal(c.localStorage.getItem('pc_createpromo_sub'),'Coupon');assert.equal(c.PC_PromotionEdit.current().campaign,'TOTO');
});
test('a blocked or stale Cloud load never installs an editable context',async()=>{
 const c=setup();c.PC_CLOUD={loadCampaignEdit:async()=>{throw Error('IT closed');}};await c.PC_PromotionEdit.open('TOTO','2026-11');assert.equal(c.PC_PromotionEdit.current(),null);
 let release;c.PC_CLOUD.loadCampaignEdit=()=>new Promise(r=>release=r);const call=c.PC_PromotionEdit.open('TOTO','2026-11');c.__pageGen=2;release({form:{form:'Coupon'}});await call;assert.equal(c.PC_PromotionEdit.current(),null);
});
