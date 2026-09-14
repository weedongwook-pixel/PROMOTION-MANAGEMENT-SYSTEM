/* Device-change cases — เคสเปลี่ยนเครื่อง POS (ไม่ใช่งาน Plan เปิดสาขา)
 * PC1037 CKK : OP แจ้ง — เครื่องเก่าช้า · PC6008 SPB (DODO-M) : IT — ไฟไหม้ POS+ปริ้น
 * seed เข้า pc_device_swap_requests (AssetLogistics pending) + RD broken trigger (สติ๊กเกอร์ ยกเลิก+ขอใหม่) */
window.PC_DEVICE_CHANGE_CASES = [
  { shop:'PC1037', name:'CKK-Central Khon Kaen', type:'COCO',   source:'OP', reason:'เครื่อง POS เก่าช้า — สาขาขอเปลี่ยน', devices:['POS'] },
  { shop:'PC6008', name:'SPB-Susco Phuttha Bucha', type:'DODO-M', source:'IT', reason:'ไฟไหม้ POS + เครื่องปริ้น — เปลี่ยนเครื่อง', devices:['POS','Printer-Cashier'] }
];
(function seedDeviceChange(){
  try{
    var SEED_VER='1';
    if(localStorage.getItem('pc_devchange_seed')===SEED_VER) return;
    var reqs=[]; try{ reqs=JSON.parse(localStorage.getItem('pc_device_swap_requests'))||[]; }catch(e){}
    window.PC_DEVICE_CHANGE_CASES.forEach(function(c){
      if(!reqs.some(function(r){ return (r.branchId===c.shop||r.shop===c.shop) && String(r.status||'').toUpperCase()!=='FULFILLED'; })){
        reqs.unshift({ id:'DSW-'+c.shop+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,4), branchId:c.shop, shop:c.shop, branchName:c.name, shopName:c.name, type:c.type, source:c.source, reason:c.reason, issue:c.reason, devices:c.devices, status:'PENDING', at:Date.now(), createdAt:Date.now() });
      }
      if(window.RD && window.RD.addTrigger){
        window.RD.addTrigger({ branchId:c.shop, oldType:c.type, newType:c.type, kind:'broken', source:c.source, caseHint:'เปลี่ยนเครื่อง POS ('+c.source+') — '+c.reason });
      }
    });
    try{ localStorage.setItem('pc_device_swap_requests', JSON.stringify(reqs)); }catch(e){}
    localStorage.setItem('pc_devchange_seed', SEED_VER);
  }catch(e){}
})();
