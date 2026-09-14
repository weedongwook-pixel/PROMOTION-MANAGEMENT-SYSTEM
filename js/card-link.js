/* ============================================================================
 * js/card-link.js — สมองกลาง "ผูก Type" (บัตรสมาชิก · ส่วนลดพนักงาน · อื่นๆ)
 *   window.PC_CardLink  — data layer + actions (ผูกได้หลายโค้ดต่อ 1 รายการ)
 *   mountFull(root)  — ตารางจัดการเต็ม (หน้า CardLink)
 *   mountQueue(root) — พาเนล "รอ IT ผูกโค้ด" (แทรกหน้า Code Management)
 *
 * เก็บใน localStorage 'pc_card_links' (แยกจากตารางโปรฯ pc_mock_store_v28)
 * seed ครั้งแรกจาก PC_CARD_TYPES / PC_STAFF_TYPES / PC_OTHER_TYPES
 * จุดเชื่อม IT: จองเลข Item Coupon (IC) จากตัวนับกลาง PC_COUNTER (กลุ่มเดียวกับโปรฯ)
 * ========================================================================== */
(function () {
  if (window.PC_CardLink) { /* reload guard: อัปเดตฟังก์ชันได้ แต่คงข้อมูล */ }
  var KEY = 'pc_card_links', SEED_KEY = 'pc_card_links_seed_ver', SEED_VER = '2';

  var GROUP_META = {
    card:  { l: 'บัตรสมาชิก',    c: '#1f8a4e', bg: '#eafaf1' },
    staff: { l: 'ส่วนลดพนักงาน', c: '#2c4a82', bg: '#eef4ff' },
    other: { l: 'อื่นๆ',         c: '#5a616b', bg: '#eef1f4' },
  };
  var TIER_COLORS = { black:'#1a1d20', gold:'#c9a227', platinum:'#9aa5b1', green:'#1f8a4e', silver:'#b9c2cc' };
  function tierColor(t){ t=String(t||'').toLowerCase(); for(var k in TIER_COLORS){ if(t.indexOf(k)>-1) return TIER_COLORS[k]; } return '#1f8a4e'; }

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function loadA(){ try{ return JSON.parse(localStorage.getItem(KEY))||[]; }catch(e){ return []; } }
  function saveA(a){ try{ localStorage.setItem(KEY, JSON.stringify(a)); }catch(e){} }
  function uid(){ return 'cl'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function me(){ try{ return localStorage.getItem('pc_userName')||localStorage.getItem('pc_role')||''; }catch(e){ return ''; } }
  function fmtDate(iso){ var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?(m[3]+'/'+m[2]+'/'+m[1].slice(2)):'-'; }
  function notify(ev, text){ try{ var f=(window.top&&window.top.PC_notify)||window.PC_notify; if(f) f(ev,{text:text}); }catch(e){} }
  function counterPeek(){ try{ var C=(window.top&&window.top.PC_COUNTER)||window.PC_COUNTER; return (C&&C.peek)?C.peek('coupon'):''; }catch(e){ return ''; } }
  function counterReserve(where, field){ try{ var C=(window.top&&window.top.PC_COUNTER)||window.PC_COUNTER; if(!C||!C.reserve) return ''; var ent=C.reserve('coupon',{where:where,field:field}); var code=ent&&ent.code?ent.code:''; try{ if(code&&C.confirm) C.confirm(code,'coupon'); }catch(e){} return code; }catch(e){ return ''; } }
  function codesOf(r){ if(Array.isArray(r.codes)) return r.codes.filter(Boolean); if(r.code) return [String(r.code)]; return []; }
  function isReady(r){ return codesOf(r).length>0; }

  /* ---------- seed (3 กลุ่ม · multi-code · migrate v1→v2) ---------- */
  function seed(){
    var existing = loadA(), changed = false;
    // migrate: เติม group + แปลง code→codes[] ให้เรคคอร์ดเก่า (v1 = บัตรล้วน)
    existing.forEach(function(r){
      if(!r.group){ r.group='card'; changed=true; }
      if(!Array.isArray(r.codes)){ r.codes = r.code ? [String(r.code)] : []; changed=true; }
    });
    if(localStorage.getItem(SEED_KEY)===SEED_VER){ if(changed) saveA(existing); return; }
    var have={}; existing.forEach(function(r){ codesOf(r).forEach(function(c){ have[String(c).toUpperCase()]=1; }); });
    function add(src, group){ (src||[]).forEach(function(c){
      var code=String(c.code||'').toUpperCase();
      if(code && have[code]) return;               // มีโค้ดนี้แล้ว — ไม่ซ้ำ
      existing.push({ id:uid(), group:group, tier:c.usedFor||'', name:c.nameTH||c.nameEN||'',
        typePromotion:c.typePromotion||'Item Coupon Online', staffType:c.staffType||'',
        codes: code?[code]:[], from:c.from||'', to:c.to||'',
        active:(c.status!=='Inactive'), seeded:true, createdAt:new Date().toISOString(), createdBy:'seed' });
      if(code) have[code]=1;
    }); }
    add(window.PC_CARD_TYPES, 'card');
    add(window.PC_STAFF_TYPES, 'staff');
    add(window.PC_OTHER_TYPES, 'other');
    saveA(existing);
    localStorage.setItem(SEED_KEY, SEED_VER);
  }

  function tiers(){ var m={}; loadA().forEach(function(r){ if(r.tier) m[r.tier]=1; }); return Object.keys(m).sort(); }

  /* ---------- actions ---------- */
  function addCode(id, code){
    code=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!code) return false;
    var all=loadA(), r=all.find(function(x){return x.id===id;}); if(!r) return false;
    if(!Array.isArray(r.codes)) r.codes = r.code?[String(r.code)]:[];
    if(r.codes.map(function(c){return String(c).toUpperCase();}).indexOf(code)>-1) return false; // กันซ้ำในรายการเดียว
    r.codes.push(code); r.itDoneAt=new Date().toISOString(); r.itBy=me();
    saveA(all);
    notify('card_link_ready','ผูกบัตร/สิทธิ์ “'+r.name+'” เพิ่ม Type Code '+code+' — ใช้ได้ที่ POS แล้ว');
    return true;
  }
  function removeCode(id, code){
    var all=loadA(), r=all.find(function(x){return x.id===id;}); if(!r) return;
    function doRemove(){ var a2=loadA(), r2=a2.find(function(x){return x.id===id;}); if(!r2) return; r2.codes=(codesOf(r2)).filter(function(c){ return String(c).toUpperCase()!==String(code).toUpperCase(); }); saveA(a2); renderAll(); }
    if(window.Swal){ Swal.fire({icon:'warning',title:'ลบโค้ดนี้?',html:'<b style="font-family:JetBrains Mono,monospace">'+esc(code)+'</b><br><span style="color:#8a9099;font-size:.86rem">'+esc(r.name)+'</span>',showCancelButton:true,confirmButtonColor:'#c0392b',confirmButtonText:'ลบโค้ด',cancelButtonText:'ยกเลิก'}).then(function(res){ if(res.isConfirmed) doRemove(); }); }
    else if(confirm('ลบโค้ด '+code+' ?')) doRemove();
  }
  function clearFilters(){ _mounts.forEach(function(root){ if(root.classList&&root.classList.contains('cl-qscope')) return;
    ['clSearch','fGroup','fTier','fName','fType','fCode','fFrom','fTo','fStatus'].forEach(function(id){ var el=root.querySelector('#'+id); if(el) el.value=''; }); });
    renderAll();
  }
  /* ผูกโค้ด (จองจากตัวนับกลาง หรือใส่เอง) — ใช้ได้ทั้งโค้ดแรกและโค้ดถัดไป */
  function bind(id){
    var all=loadA(), r=all.find(function(x){return x.id===id;}); if(!r) return;
    var next=counterPeek(); var cur=codesOf(r);
    window.Swal && Swal.fire({
      title: cur.length?'ผูกโค้ดเพิ่ม':'IT — จองเลข & ผูกเข้าระบบ', width:500, confirmButtonColor:'#1f8a4e',
      confirmButtonText:'จองเลข IC นี้', showCancelButton:true, cancelButtonText:'ปิด', showDenyButton:true, denyButtonText:'ใส่โค้ดเอง',
      html:'<div style="text-align:left;font-size:14px">'+
        '<div style="background:#f4f6f9;border-radius:10px;padding:10px 13px;margin-bottom:12px">'+
          '<div style="font-weight:700">'+esc(r.name)+'</div>'+
          '<div style="color:#8a9099;font-size:13px;margin-top:3px">'+esc(r.tier||'')+' · '+esc(r.typePromotion)+'</div>'+
          (cur.length?('<div style="margin-top:7px;font-size:12px;color:#5a616b">โค้ดที่ผูกแล้ว: '+cur.map(function(c){return '<b style="font-family:JetBrains Mono,monospace">'+esc(c)+'</b>';}).join(', ')+'</div>'):'')+
        '</div>'+
        '<div style="font-size:13px;color:#5a616b">เลข Item Coupon (IC) ถัดไปจากตัวนับกลาง:</div>'+
        '<div style="font-family:JetBrains Mono,monospace;font-weight:800;font-size:1.9rem;color:#1f8a4e;text-align:center;padding:8px 0">'+esc(next||'—')+'</div>'+
        '<div style="font-size:12px;color:#9aa5b1;text-align:center">กลุ่มรันเลขเดียวกับโปรโมชัน — จองแล้วเลขจะไม่ถูกใช้ซ้ำ · 1 รายการผูกได้หลายโค้ด</div>'+
      '</div>',
      preDeny:function(){ return Swal.fire({title:'ใส่ Type Code เอง',input:'text',inputPlaceholder:'ICxxxx / BDxxxx',inputValue:next,showCancelButton:true,confirmButtonColor:'#1f8a4e'}).then(function(x){ return x.isConfirmed?{manual:(x.value||'').trim().toUpperCase()}:null; }); }
    }).then(function(res){
      var code='';
      if(res.isConfirmed){ code=counterReserve('Card Link · '+(r.tier||r.group), r.name)||next; }
      else if(res.isDenied && res.value && res.value.manual){ code=res.value.manual; }
      else return;
      if(!code) return;
      if(addCode(id, code)){ renderAll(); Swal.fire({icon:'success',title:'ผูกโค้ดแล้ว',html:'<b>'+esc(r.name)+'</b><br>Type Code: <span style="font-family:JetBrains Mono,monospace;font-weight:800;color:#1f8a4e">'+esc(code)+'</span>',timer:2000,showConfirmButton:false}); }
      else { Swal.fire('โค้ดซ้ำ','รายการนี้มีโค้ด '+esc(code)+' อยู่แล้ว','info'); }
    });
  }

  /* ---------- add / edit / delete (หน้าเต็ม) ---------- */
  function form(existing){
    var isEdit=!!existing, dlist=tiers().map(function(t){ return '<option value="'+esc(t)+'">'; }).join('');
    var g=isEdit?existing.group:'card';
    window.Swal && Swal.fire({
      title:isEdit?'แก้ไขรายการ':'เพิ่มรายการผูก Type', width:560, confirmButtonColor:'#1f8a4e',
      confirmButtonText:isEdit?'บันทึก':'บันทึก', showCancelButton:true, cancelButtonText:'ยกเลิก',
      html:'<div style="text-align:left;font-size:14px">'+
        '<div style="display:flex;gap:10px">'+
          '<div style="flex:1"><label style="font-weight:700;display:block;margin:2px 0 4px">กลุ่ม *</label>'+
          '<select id="clfGroup" class="swal2-select" style="width:100%;margin:0">'+
            '<option value="card"'+(g==='card'?' selected':'')+'>บัตรสมาชิก</option>'+
            '<option value="staff"'+(g==='staff'?' selected':'')+'>ส่วนลดพนักงาน</option>'+
            '<option value="other"'+(g==='other'?' selected':'')+'>อื่นๆ</option>'+
          '</select></div>'+
          '<div style="width:150px"><label style="font-weight:700;display:block;margin:2px 0 4px">ประเภทพนักงาน</label>'+
          '<input id="clfStaff" class="swal2-input" style="margin:0;width:100%" placeholder="FRC / COCO / —" value="'+(isEdit?esc(existing.staffType||''):'')+'"></div>'+
        '</div>'+
        '<label style="font-weight:700;display:block;margin:12px 0 4px">ประเภท / ระดับ (usedFor) *</label>'+
        '<input id="clfTier" class="swal2-input" list="clfTierList" style="width:100%;margin:0 0 12px" placeholder="เช่น VIP05 - Black Card / Staff Discount" value="'+(isEdit?esc(existing.tier):'')+'">'+
        '<datalist id="clfTierList">'+dlist+'</datalist>'+
        '<label style="font-weight:700;display:block;margin:2px 0 4px">ชื่อสิทธิ์ / รายการ *</label>'+
        '<input id="clfName" class="swal2-input" style="width:100%;margin:0 0 12px" placeholder="เช่น Black Card Redeem - GIGA FRIES" value="'+(isEdit?esc(existing.name):'')+'">'+
        '<div style="display:flex;gap:10px">'+
          '<div style="flex:1"><label style="font-weight:700;display:block;margin:2px 0 4px">Type Promotion *</label>'+
          '<select id="clfType" class="swal2-select" style="width:100%;margin:0">'+
            '<option value="Item Coupon Online"'+(isEdit&&/item/i.test(existing.typePromotion)?' selected':'')+'>Item Coupon Online</option>'+
            '<option value="Bill Discount Online"'+(isEdit&&/bill/i.test(existing.typePromotion)?' selected':'')+'>Bill Discount Online</option>'+
          '</select></div>'+
          '<div style="flex:1"><label style="font-weight:700;display:block;margin:2px 0 4px">Type Code (คั่นด้วย ,)</label>'+
          '<input id="clfCode" class="swal2-input" style="margin:0;width:100%" placeholder="เว้นว่าง = รอ IT" value="'+(isEdit?esc(codesOf(existing).join(', ')):'')+'"></div>'+
        '</div>'+
        '<div style="display:flex;gap:10px;margin-top:12px">'+
          '<div style="flex:1"><label style="font-weight:700;display:block;margin:2px 0 4px">วันที่เริ่ม</label><input id="clfFrom" type="date" class="swal2-input" style="margin:0;width:100%" value="'+(isEdit?esc(existing.from):'')+'"></div>'+
          '<div style="flex:1"><label style="font-weight:700;display:block;margin:2px 0 4px">วันที่สิ้นสุด</label><input id="clfTo" type="date" class="swal2-input" style="margin:0;width:100%" value="'+(isEdit?esc(existing.to):'')+'"></div>'+
        '</div>'+
        '<div style="font-size:12px;color:#8a9099;margin-top:10px">เว้น Type Code ว่าง = "รอ IT" · ใส่ได้หลายโค้ดคั่นด้วยจุลภาค · หรือให้ IT จองเลขทีหลังจากหน้านี้/หน้าจัดการโค้ด</div>'+
      '</div>',
      preConfirm:function(){
        var tier=(document.getElementById('clfTier').value||'').trim();
        var name=(document.getElementById('clfName').value||'').trim();
        if(!tier){ Swal.showValidationMessage('กรอกประเภท/ระดับ'); return false; }
        if(!name){ Swal.showValidationMessage('กรอกชื่อสิทธิ์'); return false; }
        var codes=(document.getElementById('clfCode').value||'').split(',').map(function(s){return s.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');}).filter(Boolean);
        return { group:document.getElementById('clfGroup').value, staffType:(document.getElementById('clfStaff').value||'').trim().toUpperCase(),
          tier:tier, name:name, typeP:document.getElementById('clfType').value, codes:codes,
          from:document.getElementById('clfFrom').value||'', to:document.getElementById('clfTo').value||'' };
      }
    }).then(function(res){
      if(!res.isConfirmed) return; var v=res.value, all=loadA();
      if(isEdit){ var r=all.find(function(x){return x.id===existing.id;}); if(r){ r.group=v.group; r.staffType=v.staffType; r.tier=v.tier; r.name=v.name; r.typePromotion=v.typeP; r.codes=v.codes; r.from=v.from; r.to=v.to; r.updatedAt=new Date().toISOString(); r.updatedBy=me(); } saveA(all); }
      else { all.unshift({ id:uid(), group:v.group, staffType:v.staffType, tier:v.tier, name:v.name, typePromotion:v.typeP, codes:v.codes, from:v.from, to:v.to, active:true, seeded:false, createdAt:new Date().toISOString(), createdBy:me() });
        saveA(all);
        if(!v.codes.length) notify('card_link_request','ขอผูก “'+v.name+'” ('+(GROUP_META[v.group]||{}).l+' · '+v.tier+') — รอ IT จองเลข Item Coupon (IC)');
      }
      renderAll();
    });
  }
  function del(id){ window.Swal && Swal.fire({icon:'warning',title:'ลบรายการนี้?',showCancelButton:true,confirmButtonColor:'#c0392b',confirmButtonText:'ลบ',cancelButtonText:'ยกเลิก'}).then(function(r){ if(!r.isConfirmed) return; saveA(loadA().filter(function(x){return x.id!==id;})); renderAll(); }); }

  function exportCSV(){
    var rows=loadA(); if(!rows.length){ window.Swal&&Swal.fire('ไม่มีข้อมูล','','info'); return; }
    var head=['กลุ่ม','ประเภท/ระดับ','ชื่อสิทธิ์','ประเภทพนักงาน','Type Promotion','Type Codes','วันที่เริ่ม','วันที่สิ้นสุด','สถานะ'];
    var lines=[head.join(',')];
    rows.forEach(function(r){ lines.push([(GROUP_META[r.group]||{}).l||r.group,r.tier,r.name,r.staffType||'',r.typePromotion,codesOf(r).join(' | '),fmtDate(r.from),fmtDate(r.to),(isReady(r)?'พร้อมใช้':'รอ IT')].map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(',')); });
    var blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='card-links.csv'; a.click();
  }

  /* ---------- shared render bits ---------- */
  function grpBadge(g){ var m=GROUP_META[g]||GROUP_META.other; return '<span class="cl-gb" style="background:'+m.bg+';color:'+m.c+'">'+esc(m.l)+'</span>'; }
  function codeChips(r){ var cs=codesOf(r); if(!cs.length) return '<span style="color:#a06d13;font-weight:700;font-size:.82rem">— รอ IT</span>';
    return '<span class="cl-chips">'+cs.map(function(c){ return '<span class="cl-chip"><span class="cl-mono">'+esc(c)+'</span><button class="cl-x" title="ลบโค้ด" onclick="PC_CardLink.removeCode(\''+r.id+'\',\''+esc(c)+'\')">&times;</button></span>'; }).join('')+'</span>'; }

  /* ---------- mount: FULL table (หน้า CardLink) ---------- */
  var _mounts = [];
  function mountFull(root){
    if(!root) return; injectCSS();
    var dlist=tiers().map(function(t){ return '<option value="'+esc(t)+'">'; }).join('');
    root.innerHTML =
      '<div class="cl-scope">'+
        '<div class="cl-head"><div class="ic"><i class="fas fa-id-card"></i></div>'+
          '<div><h1>ผูก Type — บัตร · ส่วนลดพนักงาน · อื่นๆ</h1>'+
          '<div class="sub">รวมสิทธิ์ที่ต้องผูก Type Code เข้าระบบ (เก็บแยกจากตารางโปรโมชัน) · IT จับผูกโค้ดให้แต่ละรายการ — 1 รายการผูกได้หลายโค้ด</div></div></div>'+
        '<div class="cl-note"><i class="fas fa-circle-info" style="margin-top:2px"></i><span>แต่ละรายการต้องมี <b>Type Code</b> ที่ IT จองจากตัวนับกลาง (กลุ่มรันเลขเดียวกับโปรโมชัน) ถึงจะใช้ที่ POS ได้ · ผูกได้ทั้งจากหน้านี้และหน้า <b>จัดการโค้ด/บัตร</b></span></div>'+
        '<div class="cl-kpis">'+
          '<div class="cl-kpi k-all"><div class="kico"><i class="fas fa-layer-group"></i></div><div><div class="n" id="clkAll">0</div><div class="l">ทั้งหมด</div></div></div>'+
          '<div class="cl-kpi k-ready"><div class="kico"><i class="fas fa-circle-check"></i></div><div><div class="n" id="clkReady">0</div><div class="l">พร้อมใช้ (มีโค้ด)</div></div></div>'+
          '<div class="cl-kpi k-wait"><div class="kico"><i class="fas fa-clock"></i></div><div><div class="n" id="clkWait">0</div><div class="l">รอ IT ผูกโค้ด</div></div></div>'+
        '</div>'+
        '<div class="cl-card">'+
          '<div class="cl-ch"><i class="fas fa-id-card lead"></i> ตารางผูก Type <span id="clCount" style="font-weight:500;font-size:.82rem;color:#8a9099"></span>'+
            '<span class="r"><button class="cl-btns" onclick="PC_CardLink.exportCSV()"><i class="fas fa-file-excel"></i> Export</button>'+
            '<button class="cl-btnp" onclick="PC_CardLink.add()"><i class="fas fa-plus"></i> เพิ่มรายการ</button></span></div>'+
          '<div class="cl-cb">'+
            '<div class="cl-toolbar">'+
              '<div class="cl-srch"><i class="fas fa-magnifying-glass"></i><input id="clSearch" placeholder="ค้นหาทุกช่อง…" oninput="PC_CardLink.render()"></div>'+
              '<button class="cl-btns" onclick="PC_CardLink.clearFilters()"><i class="fas fa-filter-circle-xmark"></i> ล้างตัวกรอง</button>'+
            '</div>'+
            '<div class="cl-tbwrap"><table class="cl-tb"><thead>'+
              '<tr>'+
              '<th>กลุ่ม</th><th>ประเภท / ระดับ</th><th>ชื่อสิทธิ์ / รายการ</th><th>Type Promotion</th><th>Type Code</th><th>เริ่ม</th><th>สิ้นสุด</th><th>สถานะ</th><th></th>'+
              '</tr>'+
              '<tr class="cl-filters">'+
                '<th><select id="fGroup" onchange="PC_CardLink.render()"><option value="">ทั้งหมด</option><option value="card">บัตรสมาชิก</option><option value="staff">ส่วนลดพนักงาน</option><option value="other">อื่นๆ</option></select></th>'+
                '<th><input id="fTier" list="clfTierListH" oninput="PC_CardLink.render()" placeholder="ทั้งหมด"><datalist id="clfTierListH">'+dlist+'</datalist></th>'+
                '<th><input id="fName" oninput="PC_CardLink.render()" placeholder="ค้นหาชื่อ…"></th>'+
                '<th><select id="fType" onchange="PC_CardLink.render()"><option value="">ทั้งหมด</option><option>Item Coupon Online</option><option>Bill Discount Online</option></select></th>'+
                '<th><input id="fCode" oninput="PC_CardLink.render()" placeholder="โค้ด…"></th>'+
                '<th><input id="fFrom" type="date" onchange="PC_CardLink.render()" title="เริ่มตั้งแต่วันที่"></th>'+
                '<th><input id="fTo" type="date" onchange="PC_CardLink.render()" title="สิ้นสุดถึงวันที่"></th>'+
                '<th><select id="fStatus" onchange="PC_CardLink.render()"><option value="">ทั้งหมด</option><option value="READY">พร้อมใช้</option><option value="WAIT_IT">รอ IT</option></select></th>'+
                '<th></th>'+
              '</tr>'+
            '</thead><tbody id="clBody"></tbody></table></div>'+
          '</div>'+
        '</div>'+
      '</div>';
    if(_mounts.indexOf(root)<0) _mounts.push(root);
    renderFull(root);
  }

  function renderFull(root){
    var rows=loadA();
    var all=rows.length, ready=rows.filter(isReady).length;
    var e=function(id){ return root.querySelector('#'+id); };
    if(e('clkAll')) e('clkAll').textContent=all;
    if(e('clkReady')) e('clkReady').textContent=ready;
    if(e('clkWait')) e('clkWait').textContent=all-ready;
    var q=((e('clSearch')||{}).value||'').trim().toLowerCase();
    var fg=(e('fGroup')||{}).value||'', fs=(e('fStatus')||{}).value||'';
    var fTier=((e('fTier')||{}).value||'').trim().toLowerCase();
    var fName=((e('fName')||{}).value||'').trim().toLowerCase();
    var fType=(e('fType')||{}).value||'';
    var fCode=((e('fCode')||{}).value||'').trim().toLowerCase();
    var fFrom=(e('fFrom')||{}).value||'', fTo=(e('fTo')||{}).value||'';
    var list=rows.filter(function(r){
      if(fg && r.group!==fg) return false;
      if(fs){ var st=isReady(r)?'READY':'WAIT_IT'; if(st!==fs) return false; }
      if(fTier && String(r.tier||'').toLowerCase().indexOf(fTier)<0) return false;
      if(fName && String(r.name||'').toLowerCase().indexOf(fName)<0) return false;
      if(fType && r.typePromotion!==fType) return false;
      if(fCode && codesOf(r).join(' ').toLowerCase().indexOf(fCode)<0) return false;
      if(fFrom && r.from && r.from < fFrom) return false;   // เริ่ม ≥ วันที่เลือก
      if(fTo && r.to && r.to > fTo) return false;           // สิ้นสุด ≤ วันที่เลือก
      if(q && ((r.tier||'')+' '+(r.name||'')+' '+codesOf(r).join(' ')+' '+(r.typePromotion||'')).toLowerCase().indexOf(q)<0) return false;
      return true;
    });
    if(e('clCount')) e('clCount').textContent='· แสดง '+list.length+' / '+all+' รายการ';
    var body=e('clBody'); if(!body) return;
    if(!list.length){ body.innerHTML='<tr><td colspan="9" class="cl-empty"><i class="fas fa-id-card fa-lg" style="opacity:.4;display:block;margin-bottom:8px"></i>ไม่มีรายการตามตัวกรอง</td></tr>'; return; }
    body.innerHTML=list.map(function(r){
      var tp=/item|coupon/i.test(r.typePromotion)?'':'bill';
      var ready=isReady(r), inact=r.active===false;
      var stCls=inact?'inact':(ready?'ready':'wait');
      var stTxt=inact?'<i class="fas fa-ban"></i> Inactive':(ready?'<i class="fas fa-circle-check"></i> พร้อมใช้':'<i class="fas fa-clock"></i> รอ IT');
      return '<tr>'+
        '<td>'+grpBadge(r.group)+'</td>'+
        '<td><span class="cl-tier"><span class="cl-dot" style="background:'+tierColor(r.tier)+'"></span>'+esc(r.tier||'-')+'</span>'+(r.staffType?(' <span class="cl-stype">'+esc(r.staffType)+'</span>'):'')+'</td>'+
        '<td><b>'+esc(r.name)+'</b></td>'+
        '<td><span class="cl-tb2 '+tp+'">'+esc(r.typePromotion)+'</span></td>'+
        '<td>'+codeChips(r)+'</td>'+
        '<td style="white-space:nowrap;font-size:.84rem;color:#5a616b">'+(r.from?fmtDate(r.from):'-')+'</td>'+
        '<td style="white-space:nowrap;font-size:.84rem;color:#5a616b">'+(r.to?fmtDate(r.to):'-')+'</td>'+
        '<td><span class="cl-st '+stCls+'">'+stTxt+'</span></td>'+
        '<td><div style="display:flex;gap:6px;justify-content:flex-end">'+
          '<button class="cl-act" onclick="PC_CardLink.bind(\''+r.id+'\')"><i class="fas fa-hashtag"></i> '+(ready?'ผูกเพิ่ม':'จองเลข IC')+'</button>'+
          '<button class="cl-ico" title="แก้ไข" onclick="PC_CardLink.edit(\''+r.id+'\')"><i class="fas fa-pen"></i></button>'+
          '<button class="cl-ico del" title="ลบ" onclick="PC_CardLink.del(\''+r.id+'\')"><i class="fas fa-trash-alt"></i></button>'+
        '</div></td>'+
      '</tr>';
    }).join('');
  }

  /* ---------- mount: QUEUE panel (หน้า Code Management) ---------- */
  function mountQueue(root){
    if(!root) return; injectCSS(); seed();
    root.className='cl-qscope';
    if(_mounts.indexOf(root)<0) _mounts.push(root);
    renderQueue(root);
  }
  function renderQueue(root){
    var waiting=loadA().filter(function(r){ return !isReady(r); });
    var recent=loadA().filter(isReady).slice(0,4);
    root.innerHTML=
      '<div class="cl-qcard">'+
        '<div class="cl-qh"><i class="fas fa-id-card"></i> ผูกบัตร/สิทธิ์ — รอ IT ผูกโค้ด <span class="cl-qn">'+waiting.length+'</span>'+
          '<span style="margin-left:auto;font-size:.76rem;color:#8a9099;font-weight:600">ตัวนับกลาง IC ถัดไป: <b style="font-family:JetBrains Mono,monospace;color:#1f8a4e">'+esc(counterPeek()||'—')+'</b></span></div>'+
        (waiting.length
          ? '<div class="cl-qwrap"><table class="cl-qtb"><thead><tr><th>กลุ่ม</th><th>ประเภท/ระดับ</th><th>ชื่อสิทธิ์</th><th>Type</th><th></th></tr></thead><tbody>'+
            waiting.map(function(r){ return '<tr><td>'+grpBadge(r.group)+'</td><td>'+esc(r.tier||'-')+(r.staffType?(' <span class="cl-stype">'+esc(r.staffType)+'</span>'):'')+'</td><td><b>'+esc(r.name)+'</b></td><td style="font-size:.8rem;color:#5a616b">'+esc(r.typePromotion)+'</td>'+
              '<td style="text-align:right"><button class="cl-act" onclick="PC_CardLink.bind(\''+r.id+'\')"><i class="fas fa-hashtag"></i> จองเลข IC</button></td></tr>'; }).join('')+
            '</tbody></table></div>'
          : '<div class="cl-qempty"><i class="fas fa-circle-check" style="color:#1f8a4e"></i> ผูกโค้ดครบทุกรายการแล้ว</div>')+
        (recent.length?('<div class="cl-qrecent">ล่าสุดที่ผูก: '+recent.map(function(r){ return esc(r.name)+' <b style="font-family:JetBrains Mono,monospace;color:#1f8a4e">'+esc(codesOf(r).slice(-1)[0]||'')+'</b>'; }).join(' · ')+'</div>'):'')+
      '</div>';
  }

  function renderAll(){ _mounts=_mounts.filter(function(el){ return document.body.contains(el); });
    _mounts.forEach(function(el){ if(el.classList&&el.classList.contains('cl-qscope')) renderQueue(el); else renderFull(el); }); }

  /* ---------- injected styles (ใช้ได้ทุกหน้า) ---------- */
  function injectCSS(){ if(document.getElementById('pc-cardlink-css')) return;
    var css=
    '.cl-scope{background:#f4f6f9;min-height:100vh;padding:24px 26px 60px;font-family:Kanit,sans-serif;color:#3b4753}'+
    '.cl-scope .cl-head{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}'+
    '.cl-scope .cl-head .ic{width:52px;height:52px;border-radius:14px;background:#eafaf1;color:#1f8a4e;display:grid;place-items:center;font-size:1.35rem;flex:none}'+
    '.cl-scope .cl-head h1{font-family:Montserrat,sans-serif;font-weight:800;font-size:1.8rem;color:#1a1d20;margin:0;line-height:1.1}'+
    '.cl-scope .cl-head .sub{font-size:.9rem;color:#5a616b;font-weight:600;margin-top:3px}'+
    '.cl-note{background:#eafaf1;border:1px solid #bfe6cd;border-radius:12px;padding:11px 16px;font-size:.84rem;color:#176b3a;font-weight:600;margin-bottom:18px;display:flex;gap:9px;align-items:flex-start}'+
    '.cl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}'+
    '.cl-kpi{background:#fff;border:1px solid #e6eaef;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px}'+
    '.cl-kpi .n{font-family:Montserrat,sans-serif;font-weight:800;font-size:1.5rem;color:#1a1d20;line-height:1}'+
    '.cl-kpi .l{font-size:.76rem;color:#8a9099;font-weight:700;margin-top:3px}'+
    '.cl-kpi .kico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:1rem;flex:none}'+
    '.cl-kpi.k-all .kico{background:#eafaf1;color:#1f8a4e}.cl-kpi.k-ready .kico{background:#eafaf1;color:#1f8a4e}.cl-kpi.k-wait .kico{background:#fff3e0;color:#a06d13}'+
    '.cl-card{background:#fff;border:1px solid #e6eaef;border-radius:16px;box-shadow:0 1px 2px rgba(20,32,43,.05),0 4px 16px rgba(20,32,43,.04);overflow:hidden}'+
    '.cl-ch{display:flex;align-items:center;gap:10px;padding:15px 22px;border-bottom:1px solid #eef1f4;font-weight:700;font-size:1.02rem;color:#14202b;font-family:Montserrat,sans-serif;flex-wrap:wrap}'+
    '.cl-ch i.lead{color:#1f8a4e}.cl-ch .r{margin-left:auto;display:flex;gap:8px}.cl-cb{padding:18px 22px}'+
    '.cl-btnp{background:#1f8a4e;color:#fff;border:0;border-radius:11px;padding:10px 18px;font-weight:800;font-size:.92rem;cursor:pointer;display:inline-flex;align-items:center;gap:8px}.cl-btnp:hover{background:#176b3a}'+
    '.cl-btns{background:#fff;color:#5a616b;border:2px solid #e3e7eb;border-radius:11px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:.88rem}.cl-btns:hover{border-color:#c9d0d8}'+
    '.cl-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}'+
    '.cl-srch{flex:1;min-width:200px;position:relative}.cl-srch i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#aab0b8}'+
    '.cl-srch input{width:100%;border:2px solid #e3e7eb;border-radius:11px;padding:10px 12px 10px 40px;font-family:inherit;font-weight:600}.cl-srch input:focus{outline:none;border-color:#1f8a4e}'+
    '.cl-fsel{border:2px solid #e3e7eb;border-radius:11px;padding:9px 12px;font-family:inherit;font-weight:700;color:#3b4753;background:#fff;cursor:pointer}.cl-fsel:focus{outline:none;border-color:#1f8a4e}'+
    '.cl-tbwrap{border:1px solid #eef1f4;border-radius:12px;overflow:auto;max-height:60vh}'+
    '.cl-tb{width:100%;border-collapse:collapse;font-size:.9rem}'+
    '.cl-tb thead th{background:#14202b;color:#fff;font-weight:600;font-size:.76rem;text-align:left;padding:12px 14px;white-space:nowrap;position:sticky;top:0;z-index:3}'+
    '.cl-filters th{background:#20303d;padding:6px 8px;position:sticky;top:41px;z-index:2}'+
    '.cl-filters input,.cl-filters select{width:100%;min-width:64px;border:1px solid #3a4b59;border-radius:7px;padding:5px 7px;font-family:Kanit,sans-serif;font-size:.75rem;font-weight:600;background:#fff;color:#14202b}'+
    '.cl-filters input:focus,.cl-filters select:focus{outline:none;border-color:#1f8a4e;box-shadow:0 0 0 2px rgba(31,138,78,.18)}'+
    '.cl-tb tbody td{padding:12px 14px;border-top:1px solid #eef1f4;vertical-align:middle}.cl-tb tbody tr:hover{background:#f7faf8}'+
    '.cl-mono{font-family:JetBrains Mono,monospace;font-weight:700;color:#176b3a}'+
    '.cl-tier{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:800;color:#14202b}.cl-dot{width:11px;height:11px;border-radius:3px;flex:none}'+
    '.cl-stype{display:inline-block;font-size:.6rem;font-weight:800;padding:1px 7px;border-radius:20px;background:#eef4ff;color:#2c4a82;letter-spacing:.3px}'+
    '.cl-gb{display:inline-flex;align-items:center;font-size:.64rem;font-weight:800;padding:3px 10px;border-radius:20px;letter-spacing:.2px}'+
    '.cl-tb2{display:inline-flex;align-items:center;font-size:.62rem;font-weight:800;padding:2px 9px;border-radius:20px;background:#f3eefe;color:#6d3bd1}.cl-tb2.bill{background:#fff3e0;color:#a06d13}'+
    '.cl-st{display:inline-flex;align-items:center;gap:5px;font-size:.68rem;font-weight:800;padding:3px 11px;border-radius:20px}.cl-st.ready{background:rgba(31,138,78,.14);color:#1f8a4e}.cl-st.wait{background:rgba(201,138,30,.16);color:#a06d13}.cl-st.inact{background:#eef1f4;color:#8a9099}'+
    '.cl-chips{display:flex;flex-wrap:wrap;gap:5px}.cl-chip{display:inline-flex;align-items:center;gap:5px;background:#eafaf1;border:1px solid #bfe6cd;border-radius:8px;padding:2px 4px 2px 8px}'+
    '.cl-chip .cl-x{border:0;background:none;color:#8a9099;cursor:pointer;font-size:1rem;line-height:1;padding:0 3px}.cl-chip .cl-x:hover{color:#c0392b}'+
    '.cl-act{background:#eafaf1;color:#176b3a;border:1px solid #bfe6cd;border-radius:9px;padding:6px 11px;font-weight:700;font-size:.8rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.cl-act:hover{background:#d7f2e0}'+
    '.cl-ico{background:#fff;color:#8a9099;border:1px solid #e3e7eb;border-radius:8px;width:32px;height:32px;cursor:pointer}.cl-ico:hover{color:#176b3a;border-color:#bfe6cd}.cl-ico.del:hover{color:#c0392b;border-color:#f0c3bd;background:#fdf3f2}'+
    '.cl-empty{padding:44px;text-align:center;color:#9aa5b1}'+
    /* queue panel */
    '.cl-qscope{font-family:Kanit,sans-serif}'+
    '.cl-qcard{background:#fff;border:1px solid #e6eaef;border-radius:14px;overflow:hidden;margin:0 0 16px}'+
    '.cl-qh{display:flex;align-items:center;gap:9px;padding:13px 18px;border-bottom:1px solid #eef1f4;font-weight:800;color:#14202b;font-family:Montserrat,sans-serif;font-size:.98rem}'+
    '.cl-qh i{color:#1f8a4e}.cl-qn{background:#fff3e0;color:#a06d13;font-size:.72rem;font-weight:800;padding:2px 9px;border-radius:20px}'+
    '.cl-qwrap{overflow:auto;max-height:44vh}.cl-qtb{width:100%;border-collapse:collapse;font-size:.88rem}'+
    '.cl-qtb thead th{background:#f4f6f9;color:#5a616b;font-weight:700;font-size:.72rem;text-align:left;padding:9px 14px;white-space:nowrap}'+
    '.cl-qtb tbody td{padding:10px 14px;border-top:1px solid #eef1f4;vertical-align:middle}'+
    '.cl-qempty{padding:26px;text-align:center;color:#5a616b;font-weight:600}'+
    '.cl-qrecent{padding:10px 18px;border-top:1px solid #eef1f4;font-size:.78rem;color:#8a9099;font-weight:600;background:#fafbfc}'+
    '@media(max-width:560px){.cl-scope{padding:16px 12px 50px}.cl-toolbar{gap:8px}.cl-srch{min-width:140px}}';
    var st=document.createElement('style'); st.id='pc-cardlink-css'; st.textContent=css; document.head.appendChild(st);
  }

  window.PC_CardLink = {
    KEY: KEY, seed: seed, all: loadA, save: saveA, tiers: tiers, groups: GROUP_META,
    add: function(){ form(null); }, edit: function(id){ var r=loadA().find(function(x){return x.id===id;}); if(r) form(r); }, del: del,
    bind: bind, addCode: addCode, removeCode: removeCode, exportCSV: exportCSV, clearFilters: clearFilters,
    render: renderAll, mountFull: mountFull, mountQueue: mountQueue, isReady: isReady, codesOf: codesOf,
  };
  // หน้า CardLink เรียกผ่าน initCardLink (shell รันหลัง inject)
  window.initCardLink = function(){ seed(); var root=document.getElementById('pc-cardlink-root'); if(root) mountFull(root); };
})();
