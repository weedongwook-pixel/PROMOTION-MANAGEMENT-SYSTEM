/* ============================================================
   customer-group.js — control "กลุ่มลูกค้า (ทั่วไป / CRM สมาชิก / KOI)"
   ใช้ร่วมฟอร์มกรอกฝั่ง MKT/RD: Coupon · Voucher · Bill Discount · Item Set (Proposal)
   - mount อัตโนมัติเมื่อเจอ <div id="pcCustomerGroup"></div> (หน้าโหลดผ่าน innerHTML)
   - window.PC_CustomerGroup.value()  → { customerGroup:'normal'|'crm'|'koi', crmTarget, crmTargetName }
   - window.PC_CustomerGroup.validate() → { ok, msg }  (CRM/KOI ต้องมีปลายทาง — เติมให้อัตโนมัติ)
   หมายเหตุ: CRM / KOI = ผูกกับสมาชิก ไม่อัปโค้ดเข้าระบบ · IT สร้าง/ผูกคูปองในขั้นถัดไป (memberCouponBox)
   ============================================================ */
(function(){
  'use strict';
  var cur = { customerGroup:'normal', crmTarget:'', crmTargetName:'' };
  function mappingValue(){var yes=cur.customerGroup==='crm'&&cur.crmMappingRequired==='yes';return {crmMappingRequired:cur.customerGroup==='crm'?(cur.crmMappingRequired||''):'',crmMappingCode:yes?String(cur.crmMappingCode||'').trim():'',crmMappingDetail:yes?String(cur.crmMappingDetail||'').trim():''};}
  function mappingForm(){
    if(cur.customerGroup!=='crm')return '';
    return '<div class="border-top mt-3 pt-3"><label class="form-label fw-bold" for="crmMappingRequired" data-th="ต้องตั้งค่า Mapping Code หรือไม่?" data-en="Is code mapping required?">ต้องตั้งค่า Mapping Code หรือไม่?</label>'
      +'<select id="crmMappingRequired" class="form-select" style="max-width:320px" onchange="PC_CustomerGroup._mappingRequired(this.value)"><option value="" data-th="กรุณาเลือก" data-en="Select an option">กรุณาเลือก</option><option value="no" '+(cur.crmMappingRequired==='no'?'selected':'')+' data-th="ไม่มี Mapping Code" data-en="No code mapping">ไม่มี Mapping Code</option><option value="yes" '+(cur.crmMappingRequired==='yes'?'selected':'')+' data-th="มี Mapping Code" data-en="Code mapping required">มี Mapping Code</option></select>'
      +(cur.crmMappingRequired==='yes'?(perCoupon()?'<p class="small text-muted mt-2 mb-0" data-th="กรอกรหัส Mapping Code แยกที่ท้ายแต่ละปุ่ม" data-en="Enter a separate Mapping Code at the end of each coupon.">กรอกรหัส Mapping Code แยกที่ท้ายแต่ละปุ่ม</p>':'<div class="row g-3 mt-1"><div class="col-md-5"><label class="form-label fw-bold" for="crmMappingCode" data-th="รหัส Mapping Code / Value Design *" data-en="Mapping Code / Value Design code *">รหัส Mapping Code / Value Design *</label><input id="crmMappingCode" class="form-control" maxlength="200" required value="'+esc(cur.crmMappingCode||'')+'" oninput="PC_CustomerGroup._mappingCode(this.value)"></div><div class="col-md-7"><label class="form-label fw-bold" for="crmMappingDetail" data-th="รายละเอียดสำหรับ IT (ถ้ามี)" data-en="IT setup instructions (optional)">รายละเอียดสำหรับ IT (ถ้ามี)</label><textarea id="crmMappingDetail" class="form-control" rows="2" maxlength="2000" oninput="PC_CustomerGroup._mappingDetail(this.value)">'+esc(cur.crmMappingDetail||'')+'</textarea></div></div>'):'')+'</div>';
  }
  function mappingHTML(data){
    if(!data||data.customerGroup!=='crm'||data.crmMappingRequired!=='yes')return '';
    return '<section class="crm-mapping-it px-4 py-3 border-bottom bg-light"><strong data-th="CRM — ข้อมูลตั้งค่า Mapping Code" data-en="CRM — code mapping setup">CRM — ข้อมูลตั้งค่า Mapping Code</strong>'+(data.shortName?'<div class="fw-bold mt-1" translate="no">'+esc(data.shortName)+'</div>':'')+'<div class="mt-2"><span data-th="รหัส Mapping Code / Value Design:" data-en="Mapping Code / Value Design:">รหัส Mapping Code / Value Design:</span> <b translate="no" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(data.crmMappingCode||'')+'</b></div>'+(data.crmMappingDetail?'<div class="mt-1" translate="no" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(data.crmMappingDetail)+'</div>':'')+'</section>';
  }
  function perCoupon(){return ['coupon','proposal','bill','voucher'].includes(host()?.getAttribute('data-mapping-scope'));}
  function eligible(block){return host()?.getAttribute('data-mapping-scope')!=='proposal'||block.querySelector('.btn-promo-type')?.value==='Item Coupon';}
  function syncCoupons(){
    if(!perCoupon()||!document.querySelectorAll)return;
    var required=cur.customerGroup==='crm'&&cur.crmMappingRequired==='yes';
    document.querySelectorAll('.crm-coupon-mapping').forEach(function(panel){var active=required&&eligible(panel.closest('.pos-button-block'));panel.hidden=!active;var code=panel.querySelector('.btn-crm-code');if(code)code.required=active;});
  }
  function couponHTML(id){return '<section class="crm-coupon-mapping border-top mt-3 pt-3" hidden><h6 class="fw-bold" data-th="CRM — Mapping Code ของปุ่มนี้" data-en="CRM — Mapping Code for this coupon">CRM — Mapping Code ของปุ่มนี้</h6><div class="row g-3"><div class="col-md-5"><label class="form-label fw-bold" for="crm-code-'+esc(id)+'" data-th="รหัส Mapping Code / Value Design *" data-en="Mapping Code / Value Design code *">รหัส Mapping Code / Value Design *</label><input id="crm-code-'+esc(id)+'" class="form-control btn-crm-code" maxlength="200" oninput="this.classList.remove(\'is-invalid\')"></div><div class="col-md-7"><label class="form-label fw-bold" for="crm-detail-'+esc(id)+'" data-th="รายละเอียดสำหรับ IT (ถ้ามี)" data-en="IT setup instructions (optional)">รายละเอียดสำหรับ IT (ถ้ามี)</label><textarea id="crm-detail-'+esc(id)+'" class="form-control btn-crm-detail" rows="2" maxlength="2000"></textarea></div></div></section>';}
  function couponValue(block){var required=eligible(block)&&cur.customerGroup==='crm'&&cur.crmMappingRequired==='yes';return {crmMappingCode:required?String(block.querySelector('.btn-crm-code')?.value||'').trim():'',crmMappingDetail:required?String(block.querySelector('.btn-crm-detail')?.value||'').trim():''};}

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];}); }

  // ปลายทางสมาชิกของแต่ละกลุ่ม (CRM = Friends of Potato Corner · KOI = สมาชิก KOI Thé)
  // หมายเหตุ: ไม่ใช่บัตร VIP/บัตรสมาชิก (Member Card) — เป็นกลุ่มลูกค้าสมาชิกของแบรนด์
  var TARGETS = {
    crm: { code:'CRM_ALL', name:'สมาชิก CRM' },
    koi: { code:'KOI_ALL', name:'ลูกค้าที่มารีวิวจริง' }
  };
  // โทนสี/ไอคอนต่อกลุ่ม
  var THEME = {
    normal: { accent:'#1a1d20', bg:'#1a1d20', col:'#fff',     soft:'#eef1f4', softCol:'#5a616b', icon:'fa-users',      label:'ลูกค้าทั่วไป' },
    crm:    { accent:'#2e934a', bg:'#eafaf1', col:'#15623c',   soft:'#eafaf1', softCol:'#15623c', icon:'fa-user-check', label:'ลูกค้า CRM (สมาชิก)' },
    koi:    { accent:'#8a5a2b', bg:'#f6efe6', col:'#6e4218',   soft:'#f6efe6', softCol:'#6e4218', icon:'fa-mug-hot',    label:'ลูกค้า KOC' }
  };

  function host(){ return document.getElementById('pcCustomerGroup'); }

  function btn(g, active){
    var t = THEME[g];
    var bg = active ? t.bg : '#fff';
    var col = active ? t.col : '#5a616b';
    var bd = active ? t.accent : '#cfd5db';
    return '<button type="button" onclick="PC_CustomerGroup._set(\''+g+'\')" '
      + 'style="border:1.8px solid '+bd+';background:'+bg+';color:'+col+';border-radius:10px;padding:9px 16px;'
      + 'font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit;white-space:nowrap">'
      + '<i class="fas '+t.icon+' me-1"></i>'+t.label+'</button>';
  }

  function paint(h){
    if(!h) return;
    var g = cur.customerGroup;
    var member = (g==='crm' || g==='koi');
    var t = THEME[g] || THEME.normal;
    var tgtName = member ? (cur.crmTargetName || (TARGETS[g]&&TARGETS[g].name) || '') : '';
    h.innerHTML =
      '<div style="background:#fff;border:2px solid #000;border-left:10px solid '+t.accent+';border-radius:12px;box-shadow:4px 4px 0 rgba(0,0,0,.1);padding:15px 18px">'
      + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      +   '<label style="font-weight:700;text-transform:uppercase;font-size:13px;letter-spacing:1px;color:#000;margin:0">'
      +     '<i class="fas fa-user-group me-1" style="color:#2e934a"></i>กลุ่มลูกค้า <span style="color:#dc3545">*</span></label>'
      +   '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btn('normal',g==='normal') + btn('crm',g==='crm') + btn('koi',g==='koi') + '</div>'
      +   (member
            ? '<div style="flex:1;min-width:240px;display:flex;align-items:center;gap:8px;color:'+t.softCol+';font-size:.9rem;font-weight:700"><i class="fas '+t.icon+'"></i>'+esc(tgtName)+'</div>'
            : '<div style="flex:1;min-width:200px;color:#6b7280;font-size:.86rem"><i class="fas fa-circle-info me-1"></i>โปรสำหรับลูกค้าทั่วไป — โค้ดเข้าระบบตามปกติ</div>')
      + '</div>'
      + (((String(localStorage.getItem('pc_role')||'Admin')==='Admin')||(String(localStorage.getItem('pc_role')||'')==='IT'))
          ? (g==='crm'
              ? '<div style="margin-top:10px;color:#15623c;font-size:.84rem;background:#eafaf1;border:1px solid #bfe6cf;border-radius:8px;padding:8px 12px">'
                + '<i class="fas fa-circle-info me-1"></i>โหมด CRM — สำหรับสมาชิก CRM (ไม่ใช่บัตร VIP/สมาชิก) · เดินทางเหมือนโค้ดโปรทั่วไป · IT สร้าง/ผูกคูปองให้ในขั้นถัดไป</div>'
              : (g==='koi'
                ? '<div style="margin-top:10px;color:#6e4218;font-size:.84rem;background:#f6efe6;border:1px solid #e3cdab;border-radius:8px;padding:8px 12px">'
                  + '<i class="fas fa-circle-info me-1"></i>โหมด KOC — สำหรับสมาชิก KOC (KOI Thé) · เดินทางเหมือนโค้ดโปรทั่วไป · IT สร้าง/ผูกคูปองให้ในขั้นถัดไป</div>'
                : ''))
          : '')
      + mappingForm() + '</div>';
    syncCoupons();
  }

  function findAndRender(){
    var h = host();
    if(h && !h.getAttribute('data-cg-ready')){
      h.setAttribute('data-cg-ready','1');
      cur = { customerGroup:'normal', crmTarget:'', crmTargetName:'' };
      paint(h);
    }
  }

  window.PC_CustomerGroup = {
    render: findAndRender,
    reset: function(){ cur={ customerGroup:'normal', crmTarget:'', crmTargetName:'' }; paint(host()); },
    value: function(){ return Object.assign({ customerGroup:cur.customerGroup, crmTarget:cur.crmTarget, crmTargetName:cur.crmTargetName },mappingValue()); },
    restore: function(data){
      var g=data.customerGroup==='crm'?'crm':data.customerGroup==='koi'?'koi':'normal';
      cur={customerGroup:g,crmTarget:(TARGETS[g]||{}).code||'',crmTargetName:(TARGETS[g]||{}).name||'',crmMappingRequired:data.crmMappingRequired==='yes'?'yes':'no',crmMappingCode:data.crmMappingCode||'',crmMappingDetail:data.crmMappingDetail||''};paint(host());
    },
    mappingHTML:mappingHTML,
    mappingListHTML:function(rows){var seen=new Set();return (rows||[]).filter(function(row){var key=String(row.shortName||'');if(seen.has(key))return false;seen.add(key);return true;}).map(mappingHTML).join('');},
    couponHTML:couponHTML,couponValue:couponValue,syncCoupons:syncCoupons,
    _mappingRequired:function(v){cur.crmMappingRequired=v==='yes'?'yes':v==='no'?'no':'';if(v!=='yes'){cur.crmMappingCode='';cur.crmMappingDetail='';}paint(host());},
    _mappingCode:function(v){cur.crmMappingCode=v;if(String(v).trim())document.getElementById('crmMappingCode')?.classList.remove('is-invalid');},
    _mappingDetail:function(v){cur.crmMappingDetail=v;},
    validate: function(){
      if((cur.customerGroup==='crm' || cur.customerGroup==='koi') && !cur.crmTarget){
        var t=TARGETS[cur.customerGroup]; if(t){ cur.crmTarget=t.code; cur.crmTargetName=t.name; }
      }
      if(cur.customerGroup==='crm'){
        var field='',msg='';
        if(!['yes','no'].includes(cur.crmMappingRequired)){field='crmMappingRequired';msg='กรุณาเลือกว่าต้องตั้งค่า Mapping Code หรือไม่';}
        else if(!perCoupon()&&cur.crmMappingRequired==='yes'&&!String(cur.crmMappingCode||'').trim()){field='crmMappingCode';msg='กรุณาระบุรหัส Mapping Code / Value Design สำหรับ IT';}
        else if(!perCoupon()&&(String(cur.crmMappingCode||'').length>200||String(cur.crmMappingDetail||'').length>2000)){field='crmMappingCode';msg='ข้อมูล Mapping Code ยาวเกินกำหนด';}
        if(msg){var el=document.getElementById(field);if(el){el.classList?.add('is-invalid');el.scrollIntoView?.({block:'center'});el.focus?.();}return {ok:false,msg:msg};}
        if(perCoupon()&&cur.crmMappingRequired==='yes'){
          var blocks=Array.from(document.querySelectorAll('.pos-button-block'));
          for(var block of blocks){if(!eligible(block))continue;var value=couponValue(block);if(!value.crmMappingCode||value.crmMappingCode.length>200||value.crmMappingDetail.length>2000){var input=block.querySelector('.btn-crm-code');input?.classList.add('is-invalid');input?.scrollIntoView({block:'center'});input?.focus();return {ok:false,msg:'กรุณาระบุรหัส Mapping Code / Value Design ให้ครบทุกปุ่ม'};}}
        }
      }
      return { ok:true, msg:'' };
    },
    _set: function(g){
      g = (g==='crm'||g==='koi') ? g : 'normal';
      cur.customerGroup = g;
      if(g==='crm' || g==='koi'){ var t=TARGETS[g]; cur.crmTarget=t.code; cur.crmTargetName=t.name; }
      else { cur.crmTarget=''; cur.crmTargetName=''; }
      paint(host());
    },
    _target: function(v){ /* deprecated: CRM/KOI ไม่มี dropdown ปลายทางบัตร */ }
  };

  // auto-mount: หน้าโหลดเข้ามาทาง innerHTML → รอ container โผล่แล้ว render
  try{
    var obs = new MutationObserver(function(){ findAndRender(); });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  }catch(e){}
  if(document.readyState!=='loading') findAndRender();
  else document.addEventListener('DOMContentLoaded', findAndRender);
})();
