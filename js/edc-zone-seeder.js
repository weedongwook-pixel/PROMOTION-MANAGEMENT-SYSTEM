/* =====================================================================
 * EDC + Zone + Mobile seeder — นำเข้าข้อมูลจริงจาก EDC_zone_mobile shop.xlsx
 *   (1) pc_branch_edc     : เครื่อง EDC ต่อสาขา (TID / SIM / merchant) + เบอร์มือถือสาขา
 *   (2) pc_area_zones     : โซน → Area ผู้รับผิดชอบ (+ เบอร์ Area, เบอร์มือถือสาขา, grade)
 * merge แบบ add-if-missing (ไม่ทับข้อมูลที่สาขากรอกเอง) · ปลอดภัยรันซ้ำ
 * ต้องโหลด data/edc-zone-seed.js (window.PC_EDC_ZONE_SEED) มาก่อน
 * ===================================================================== */
(function(){
  function J(k){ try{ return JSON.parse(localStorage.getItem(k))||{}; }catch(e){ return {}; } }
  function run(){
    var seed = window.PC_EDC_ZONE_SEED; if(!seed || !seed.edc) return;

    // ---- (1) โซน → Area (+ เบอร์มือถือสาขา) ----
    var az=J('pc_area_zones'), azCh=false;
    Object.keys(seed.zone||{}).forEach(function(s){
      var z=seed.zone[s], cur=az[s]||{};
      var rec={ zone:cur.zone||z.zone||'', area:cur.area||z.area||'', tel:cur.tel||z.tel||'',
        alpha:cur.alpha||z.alpha||'', grade:cur.grade||z.grade||'', store:cur.store||z.store||'',
        mobile:cur.mobile||(seed.mobile&&seed.mobile[s])||'' };
      if(JSON.stringify(cur)!==JSON.stringify(rec)){ az[s]=rec; azCh=true; }
    });
    Object.keys(seed.mobile||{}).forEach(function(s){
      if(!az[s]){ az[s]={zone:'',area:'',tel:'',alpha:'',grade:'',store:'',mobile:seed.mobile[s]}; azCh=true; }
      else if(!az[s].mobile){ az[s].mobile=seed.mobile[s]; azCh=true; }
    });
    if(azCh){ try{ localStorage.setItem('pc_area_zones', JSON.stringify(az)); }catch(e){} }

    // ---- (2) เครื่อง EDC ต่อสาขา (TID/SIM/merchant/มือถือ) ----
    var be=J('pc_branch_edc'), beCh=false;
    Object.keys(seed.edc||{}).forEach(function(s){
      var d=seed.edc[s], cur=be[s]||{};
      var rec={ edc:cur.edc||'M-EDC', provider:cur.provider||((cur.edc==='MALL')?'ใช้ EDC ห้าง':'KBank'), model:cur.model||'A80', tid:cur.tid||d.tid||'',
        installDate:cur.installDate||'', installer:cur.installer||'', note:cur.note||'',
        sim:cur.sim||d.sim||'', merchant:cur.merchant||d.mer||'',
        mobile:cur.mobile||(seed.mobile&&seed.mobile[s])||'',
        updatedAt:cur.updatedAt||0, updatedBy:cur.updatedBy||'' };
      if(JSON.stringify(cur)!==JSON.stringify(rec)){ be[s]=rec; beCh=true; }
    });
    if(beCh){ try{ localStorage.setItem('pc_branch_edc', JSON.stringify(be)); }catch(e){} }

    // ---- (3) เพิ่มช่องชำระเงินใหม่ (LINE Pay / ShopeeFood) ให้เครื่องที่มี master เดิม ----
    try{
      var tm=null; try{ tm=JSON.parse(localStorage.getItem('pc_tender_master')); }catch(e){}
      if(Array.isArray(tm) && tm.length){
        var tch=false;
        var n0=tm.length; tm=tm.filter(function(t){ return !(String(t.name||'').toLowerCase()==='line pay' && t.saleMode!=='Delivery'); }); if(tm.length!==n0) tch=true;
        var has=function(nm,sm){ return tm.some(function(t){ return String(t.name||'').toLowerCase()===nm.toLowerCase() && t.saleMode===sm; }); };
        if(!has('LINE Pay','Delivery')){ tm.push({code:'EPLM',name:'LINE Pay',saleMode:'Delivery',kind:'standard',iface:false,icon:'fa-wallet',note:'e-payment'}); tch=true; }
        if(!has('ShopeeFood','Delivery')){ tm.push({code:'SHF',name:'ShopeeFood',saleMode:'Delivery',kind:'standard',iface:false,icon:'fa-motorcycle',note:''}); tch=true; }
        if(!has('Credit Card (DFT)','Take Away')){ tm.push({code:'CCDFT',name:'Credit Card (DFT)',saleMode:'Take Away',kind:'standard',iface:true,icon:'fa-credit-card',note:'EDC KBank · Link POS'}); tch=true; }
        if(tch){ try{ localStorage.setItem('pc_tender_master', JSON.stringify(tm)); }catch(e){} }
      }
    }catch(e){}

    // ---- (4) e-Payment (TrueWallet / Alipay&WeChat) — seed จากไฟล์ ให้แก้/คีย์เองได้ + ซิงค์ ----
    try{
      var ep=null; try{ ep=JSON.parse(localStorage.getItem('pc_epay')); }catch(e){}
      if(!ep || typeof ep!=='object') ep={};
      var src=(window.PC_EPAY_SEED&&window.PC_EPAY_SEED.records)||{}; var epCh=false;
      Object.keys(src).forEach(function(s){ if(!ep[s]){ ep[s]=src[s]; epCh=true; } });
      if(epCh){ try{ localStorage.setItem('pc_epay', JSON.stringify(ep)); }catch(e){} }
    }catch(e){}
  }
  if(document.readyState!=='loading') run(); else document.addEventListener('DOMContentLoaded', run);
})();
