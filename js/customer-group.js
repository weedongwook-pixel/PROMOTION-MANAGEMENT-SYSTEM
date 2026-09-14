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
      + '</div>';
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
    value: function(){ return { customerGroup:cur.customerGroup, crmTarget:cur.crmTarget, crmTargetName:cur.crmTargetName }; },
    validate: function(){
      if((cur.customerGroup==='crm' || cur.customerGroup==='koi') && !cur.crmTarget){
        var t=TARGETS[cur.customerGroup]; if(t){ cur.crmTarget=t.code; cur.crmTargetName=t.name; }
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
