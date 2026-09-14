/* ===== Code Management — MKT เพิ่ม/ลบโค้ด · IT โหลดไฟล์ · สาขาตรวจสอบโค้ด ===== */
'use strict';
const REQ_KEY='pc_code_requests', SET_KEY='pc_code_settings', SEED_VER=8;
const CODE_RE=/^[A-Za-z0-9]{4,20}$/;
/* กันกดปุ่มยืนยันซ้ำ → งานเข้าคิว IT หลายใบ */
let SENDING=false;
function lockConfirmBtn(txt){ SENDING=true; const b=document.getElementById('btnConfirm');
  if(b){ b.disabled=true; b.style.opacity='.6'; b.style.pointerEvents='none'; b.innerHTML='<i class="fas fa-spinner fa-spin"></i>'+(txt||'กำลังส่ง…'); } }
function unlockConfirmBtn(){ SENDING=false; const b=document.getElementById('btnConfirm'); if(b){ b.disabled=false; b.style.opacity=''; b.style.pointerEvents=''; } }
/* กันคำขอซ้ำ: แคมเปญ+ปุ่ม+จำนวนโค้ดเดียว ส่งซ้ำใน 2 นาที */
function recentDup(type, camp, btn, n){ const now=Date.now();
  return loadReqs().some(r=> r && r.type===type && String(r.campaign||'')===String(camp||'') && String(r.button||'')===String(btn||'')
    && (+r.count||0)===(+n||0) && (now-(+r.createdAt||0))<120000 ); }
const CODE_RULE='ตัวอักษร A–Z / ตัวเลข 0–9 · ยาว 4–20 ตัว · ไม่มีเว้นวรรคหรืออักขระพิเศษ';

/* ช่องทาง online + ProStatus mapping ตามเทมเพลต Backoffice */
const KINDS=[
  {label:'Bill discount online', status:'Normal', short:'bill',    typePromo:'Bill Discount', codePromo:'Online'},
  {label:'Item coupon online',   status:'Normal', short:'coupon',  typePromo:'Coupon',        codePromo:'Online'},
  {label:'Voucher online',       status:'HS',     short:'voucher', typePromo:'Voucher',       codePromo:'Online'},
  {label:'Member card',          status:'Normal', short:'member',  typePromo:'Member Card',   codePromo:'Online'},
];
const kindOf = l => KINDS.find(k=>k.label===l) || null;

/* แคมเปญตั้งต้น — ใช้ข้อมูลจริงจาก data/promo-codes.js (PC_PROMO_CODES) ถ้ามี */
const CAMPAIGNS = (window.PC_PROMO_CODES && window.PC_PROMO_CODES.length)
  ? window.PC_PROMO_CODES
  : [
      {name:'Payday Voucher',         button:'PAYDAY 50',    code:'1002658', start:'2026-06-25', end:'2026-12-31', kind:'Voucher online'},
      {name:'Cheese Lover Combo',     button:'CHEESE COMBO', code:'1002612', start:'2026-05-01', end:'2026-10-01', kind:'Item coupon online'},
      {name:'Mid-Year Bill Discount', button:'SAVER 199',    code:'1002677', start:'2026-07-01', end:'2026-07-31', kind:'Bill discount online'},
      {name:'Songkran Splash Online', button:'SONGKRAN',     code:'1002604', start:'2026-04-01', end:'2026-04-30', kind:'Bill discount online'},
    ];
const campOf = n => CAMPAIGNS.find(c=>c.name===n) || null;
/* แคมเปญที่ inject เข้ามาจากภายนอก (เช่น prefill จากหน้า "ขยายโปร" → เพิ่มโค้ด) — ให้ canConfirm/campLookup รู้จัก */
let EXTRA_CAMPAIGNS = [];
/* ประเภทโค้ดออนไลน์ (Code Promotion = Online) — ยกเว้น Member card */
function isOnlineKind(k){ const ko=kindOf(k); return !!(ko && ko.codePromo==='Online' && ko.short!=='member'); }
function genPromo(c){ return (c&&c.code) ? c.code : ('100'+String(2000+Math.floor(Math.random()*7999))); }

/* แคมเปญทั้งหมดที่ "มีอยู่ในระบบ" — รวม master + บัตรสมาชิก + ที่เคยแนบโค้ดไว้ (สำหรับช่องค้นหา · หน้านี้สร้างแคมเปญใหม่ไม่ได้) */
/* โปรจริงในตารางโปรโมชั่น (store.months/working ผ่าน getAllCampaignData)
   เดิมหน้านี้รู้จักเฉพาะ master list → โปรที่เพิ่งแจ้งเข้ามา (IT/OP ทำเสร็จแล้วก็ตาม) ค้นไม่เจอ */
/* FX-P60: เดิมอ่านชื่อฟิลด์ผิดหมด → กรองทิ้งทุกแถว (0 โปรจริง)
   ของจริงในตารางโปร: codePromotion = โค้ดจริง (IC0627/BD096/VC0301) ไม่ใช่คำว่า "Online"
   · ไม่มีฟิลด์ typePromotion (ของจริงคือ promoType) · วันที่คือ startDate/endDate รูปแบบ dd/mm/yyyy
   เกณฑ์ "โปรที่มีโค้ด" = codePromotion ขึ้นต้นด้วยคำนำหน้าโค้ด (IC/BD/VC/VM/M/BC/GC/GN) — P#### = Price Promotion ไม่มีโค้ด */
function liveDate(v){ v=String(v||'').trim(); if(!v) return '';
  var m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){ var y=+m[3]; if(y>2400) y-=543; return y+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0'); }
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0,10) : '';
}
/* FX-P62: เปิดหน้านี้เดี่ยว ๆ (ไม่ผ่านเชลล์) = ไม่มี PC_API และ window.parent เป็น cross-origin
   → เดิม rows=[] เงียบ ๆ ลิสต์เหลือแต่ master 130 โค้ด · ตกมาอ่าน store จาก localStorage เองแทน */
function liveRowsFromStore(){
  try{
    var key='', ver=-1;
    for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); var m=/^pc_mock_store_v(\d+)$/.exec(k||''); if(m&&+m[1]>ver){ver=+m[1];key=k;} }
    if(!key) return [];
    var s=JSON.parse(localStorage.getItem(key)||'{}'), out=[];
    if(Array.isArray(s.working)) out=out.concat(s.working);
    if(s.months&&typeof s.months==='object') Object.keys(s.months).forEach(function(mk){ if(Array.isArray(s.months[mk])) out=out.concat(s.months[mk]); });
    return out;
  }catch(e){ return []; }
}
function liveCampaigns(){
  var rows=[];
  try{
    var API=window.PC_API||null;
    try{ if(!API&&window.parent&&window.parent!==window) API=window.parent.PC_API||null; }catch(e2){}
    if(API&&API.getAllCampaignData) rows=API.getAllCampaignData()||[];
  }catch(e){}
  if(!rows.length) rows=liveRowsFromStore();
  var KMAP={ 'BILL DISCOUNT':'Bill discount online', 'COUPON':'Item coupon online', 'ITEM COUPON':'Item coupon online',
             'VOUCHER':'Voucher online', 'MEMBER CARD':'Member card' };
  var out=new Map();
  rows.forEach(function(r){
    var name=String(r.campaign||'').trim(); if(!name) return;
    var code=String(r.codePromotion||'').trim().toUpperCase();
    if(!/^(IC|BD|VC|VM|M|BC|GC|GN)\d/.test(code)) return;   /* หน้านี้ใช้กับโปรที่มีโค้ดเท่านั้น */
    var tp=String(r.promoType||r.typePromotion||'').toUpperCase().replace(/\s+ONLINE$/,'').trim();
    var kind=KMAP[tp]||'';
    /* FX-P61: บางแถวมีโค้ดจริงแต่ promoType ถูกกรอกเป็น "Price Promotion" (เช่น IC0621 Linegift-LFF 1 THB)
       → เดิม return ทิ้ง ค้นไม่เจอตลอด · ตกมาเดาประเภทจากคำนำหน้าโค้ดแทน */
    if(!kind) kind = /^BD/.test(code) ? 'Bill discount online' : (/^(VC|VM)/.test(code) ? 'Voucher online' : 'Item coupon online');
    if(out.has(code)) return;                               /* คีย์ = โค้ด (แคมเปญเดียวมีหลายโค้ดต้องเห็นครบ) */
    out.set(code,{ name:name, kind:kind, button:code, code:code,
      btnName:String(r.shortName||'').trim(),
      start:liveDate(r.startDate||r.start), end:liveDate(r.endDate||r.end), _live:true });
  });
  return [].concat(Array.from(out.values()));
}
function allCampaigns(){ const map=new Map();
  CAMPAIGNS.forEach(c=> map.set(c.name, {name:c.name, kind:c.kind, button:c.button, code:c.code||c.button||'', start:c.start, end:c.end}));
  const btnSeen=new Set(); CAMPAIGNS.forEach(c=> btnSeen.add(String(c.button||'').toUpperCase()));
  liveCampaigns().forEach(c=>{ const b=String(c.button||'').toUpperCase(); if(!b||btnSeen.has(b)) return; btnSeen.add(b); map.set('live::'+b, c); });
  EXTRA_CAMPAIGNS.forEach(c=>{ if(c&&c.name&&!map.has(c.name)) map.set(c.name, {name:c.name, kind:c.kind, button:c.button, start:c.start, end:c.end}); });
  try{ const cards=JSON.parse(localStorage.getItem('pc_member_cards'))||[]; cards.forEach(c=>{ if(c&&c.name&&c.active!==false&&!map.has(c.name)) map.set(c.name, {name:c.name, kind:'Member card', button:c.prefix||'', start:c.start||'', end:c.end||'', typeCode:c.typeCode||c.prefix||''}); }); }catch(e){}
  /* staff/owner member types (ST*, VIP09 …) — BD ขอเพิ่มโค้ดส่วนลดพนักงาน ผ่าน flow บัตรเดียวกัน */
  try{ (window.PC_MEMBER_TYPES||[]).forEach(function(t){ if(!t||!t.code) return; var nm=t.name1||t.code; if(!/^ST/i.test(t.code) && !/staff|owner/i.test(nm)) return; if(!map.has(nm)) map.set(nm, {name:nm, kind:'Member card', button:t.code, start:'', end:'2050-12-31', typeCode:t.code, staff:true}); }); }catch(e){}
  loadReqs().forEach(r=>{ if(r.type==='ADD'&&r.campaign&&!map.has(r.campaign)) map.set(r.campaign, {name:r.campaign, kind:r.kind||'', button:r.button||'', start:r.start||'', end:r.proExpire||r.end||'', typeCode:r.memberTypeCode||''}); });
  return [...map.values()]; }
function campLookup(name){ name=String(name||'').trim(); if(!name) return null; return allCampaigns().find(c=>c.name===name)||null; }
/* เทมเพลตโค้ดบัตร (บังคับใช้) — คนกรอกกรอก Member Name · Code · Member no. → ระบบแปลงเป็น Member_Code ให้ IT */
function downloadMemberTemplate(){ if(typeof XLSX==='undefined'){ Swal.fire({icon:'error',title:'โหลดตัวสร้างไฟล์ไม่สำเร็จ',confirmButtonColor:'#2e934a'}); return; }
  const wb=XLSX.utils.book_new();
  // prefix = โค้ดขึ้นต้นของ MemberCode รายใบ · typeCode = code ประเภทบัตร (MemberTypeCode เช่น VIP5) — คนละค่ากัน
  const prefix=(typeof M!=='undefined' && M.button)||'BLK';
  const typeCode=(typeof M!=='undefined' && (M.memberTypeCode||M.button))||'VIP5';
  const rows=[['MemberCode','MemberTypeCode','FirstName','LastName','ExpireDate(2050-12-31)','IDCard','Status(Active)'],
    [prefix+'263T4d',typeCode,'PARAMAPHAT','PHUKTHONG','2050-12-31','0000000000000','Active']];
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:14},{wch:16},{wch:18},{wch:22},{wch:20},{wch:18},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Member_Code');
  XLSX.writeFile(wb, 'member_card_code_template.xlsx');
}

/* สาขาตัวอย่าง (สำหรับหน้าตรวจสอบ + แจ้งปัญหา) */
const BRANCHES=['101 · Central World','088 · Mega Bangna','142 · Terminal 21','203 · CentralPlaza Rama 9','311 · Future Park'];

/* ---------- storage ---------- */
/* FX-P90 — อ่าน/เขียนผ่านตัวบีบอัด (js/code-pack.js) ถ้ามี · ไม่มีก็ทำงานเหมือนเดิม */
function loadReqs(){ if(window.PC_CodePack) return PC_CodePack.loadReqs();
  try{ return JSON.parse(localStorage.getItem(REQ_KEY))||[]; }catch(e){ return []; } }
function saveReqs(a){ if(window.PC_CodePack) return PC_CodePack.saveReqs(a);
  try{ localStorage.setItem(REQ_KEY, JSON.stringify(a)); return true; }catch(e){ return false; } }
/* โค้ดในคำขออาจเก็บเป็น string (กระชับ — สำหรับโค้ดจำนวนมาก) หรือ object {code,...} (member/comp) — อ่านรองรับทั้งสองแบบ */
function cCode(c){ return (c&&typeof c==='object') ? (c.code||'') : (c||''); }
function cRedeem(c){ return (c&&typeof c==='object') ? !!c.redeemed : false; }
function settings(){ let s; try{ s=JSON.parse(localStorage.getItem(SET_KEY)); }catch(e){}
  if(!s||typeof s!=='object') s={}; if(typeof s.leadDays!=='number') s.leadDays=3; if(typeof s.recDays!=='number') s.recDays=5; if(typeof s.countWeekend!=='boolean') s.countWeekend=false; return s; }
function saveSettings(s){ localStorage.setItem(SET_KEY, JSON.stringify(s)); }

/* clean slate: ไม่ seed เคสปลอม + ลบเคส demo เก่า (CR-1001..1006) ออก — เหลือเฉพาะคำขอจริงที่ส่งเข้ามา */
function seed(){
  if(localStorage.getItem('pc_code_seed_ver')===String(SEED_VER)) return;
  const keep=loadReqs().filter(r=>!/^CR-100[1-6]$/.test(r.id));
  saveReqs(keep);
  localStorage.setItem('pc_code_seed_ver', String(SEED_VER));
}

/* ---------- date / working days ---------- */
function toISO(d){ const z=new Date(d); z.setMinutes(z.getMinutes()-z.getTimezoneOffset()); return z.toISOString().slice(0,10); }
function isWeekend(d){ const w=d.getDay(); return w===0||w===6; }
function minStartDate(){ const s=settings(); const d=new Date(); d.setHours(0,0,0,0); let add=0;
  while(add<s.leadDays){ d.setDate(d.getDate()+1); if(s.countWeekend || !isWeekend(d)) add++; } return d; }
const TH_M=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso){ if(!iso) return '—'; const d=new Date(iso+'T00:00:00'); if(isNaN(d)) return iso; return d.getDate()+' '+TH_M[d.getMonth()]+' '+(d.getFullYear()+543); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- codes already in system (per campaign) ---------- */
function systemCodes(campaign){ const m=new Map();
  loadReqs().forEach(r=>{ if(r.type==='ADD' && r.status==='CONFIRMED' && (!campaign||r.campaign===campaign)){
    (r.codes||[]).forEach(c=>{ const cd=cCode(c); m.set(String(cd).toUpperCase(), {code:cd, redeemed:cRedeem(c), req:r}); }); } });
  return m;
}

/* ---------- notifications (อ่าน routing จาก pc_notify_settings + template จาก pc_notify_templates) ---------- */
const CODE_TPL={
  code_add_request:    { msg:'➕ เพิ่มโค้ด {count} — “{campaign}” ({type}) เริ่ม {startDate} · รอ IT อัป Backoffice' },
  code_add_done:       { msg:'✅ เพิ่มโค้ดเสร็จ: “{campaign}” {count} โค้ด — พร้อมใช้ {startDate}' },
  code_remove_request: { msg:'🗑️ ลบโค้ด {count} — “{campaign}” (ข้าม redeem {skipped})' },
  code_remove_done:    { msg:'✅ ลบโค้ดเสร็จ: “{campaign}” {count} โค้ด' },
  code_not_found:      { msg:'⚠️ โค้ด {code} ใช้ไม่ได้ที่ POS — “{campaign}” · {branch}' },
};
const DEPT_FALLBACK={ it:{label:'Information Technology',group:'PC • IT Support'}, marketing:{label:'Marketing',group:'PC • Delivery Price'} };
function ncfg(){ try{ const s=JSON.parse(localStorage.getItem('pc_notify_settings')); if(s&&s.events&&s.depts) return s; }catch(e){} return null; }
function tplMsg(key, tok){ let msg=(CODE_TPL[key]||{}).msg||'';
  try{ const ov=JSON.parse(localStorage.getItem('pc_notify_templates'))||{}; if(ov[key]&&ov[key].msg!=null) msg=ov[key].msg; }catch(e){}
  Object.keys(tok||{}).forEach(k=> msg=msg.split('{'+k+'}').join(tok[k])); return msg; }
function routeOf(key){ const cfg=ncfg(); const fbEv={ code_add_done:['marketing'], code_remove_done:['marketing'] }[key]||['it'];
  let depts=fbEv, chans={email:true,chat:true,line:false}, deptMeta=dk=>DEPT_FALLBACK[dk]||{label:dk,group:dk};
  if(cfg && cfg.events[key]){ const ev=cfg.events[key]; depts=ev.depts&&ev.depts.length?ev.depts:fbEv; chans=ev.channels||chans; deptMeta=dk=>cfg.depts[dk]||DEPT_FALLBACK[dk]||{label:dk,group:dk}; }
  return depts.map(dk=>{ const d=deptMeta(dk); return {team:d.label||dk, group:d.group||'', chans}; }); }
function routeBannerHTML(key, tok){ const rs=routeOf(key); if(!rs.length) return '';
  const r=rs[0]; const lc=(key.endsWith('_done'))?'#2f5fb3':(key==='code_not_found'?'#c9870a':'#2e934a');
  const chips=[]; if(r.chans.email) chips.push('<span class="ch mail"><i class="fas fa-envelope"></i> Email</span>'); if(r.chans.chat) chips.push('<span class="ch chat"><i class="fas fa-comments"></i> Team Chat</span>');
  const dest = rs.map(x=>x.team).join(', ');
  return `<div class="route" style="--lc:${lc}"><div class="rh">เรื่องนี้จะถูกแจ้งเตือนไปที่</div>
    <div class="rl">${chips.join('')} <span style="color:#9aa1aa">→</span> ${esc(dest)}${r.group?` · กลุ่ม “${esc(r.group)}”`:''}</div>
    <div style="font-size:.84rem;color:#5a616b;margin-top:7px;background:#f6f8fa;border-radius:8px;padding:8px 11px">${esc(tplMsg(key,tok))}</div></div>`; }

/* ===================== ROLES ===================== */
const ROLE_KEY='pc_code_role';
/* Admin HQ = ดูสถานะอย่างเดียว (ล็อกที่แท็บ “ติดตามสถานะ” ไม่ให้เพิ่ม/ลบ/IT) */
const PC_HQ_VIEW=(function(){ try{ return localStorage.getItem('pc_role')==='Admin HQ'; }catch(e){ return false; } })();
let ROLE=(function(){ try{ if(PC_HQ_VIEW) return 'TRACK'; const r=localStorage.getItem(ROLE_KEY); return /^(ADD|REMOVE|TRACK|IT)$/.test(r)?r:'ADD'; }catch(e){ return 'ADD'; } })();
const ROLE_DEFS=[ {k:'ADD',ic:'fa-plus-circle',label:'แจ้งเพิ่มโค้ด',sub:'เพิ่มโค๊ดเข้าระบบ'}, {k:'REMOVE',ic:'fa-trash-can',label:'แจ้งลบโค้ด',sub:'ลบโค้ดออกจากระบบ'}, {k:'TRACK',ic:'fa-clock-rotate-left',label:'ติดตามสถานะ',sub:'ดูสถานะคำขอทั้งหมด'}, {k:'IT',ic:'fa-laptop-code',label:'IT',sub:'โหลดไฟล์ + อัปเดตสถานะ'} ];
function renderRoles(){ const el=document.getElementById('roles'); if(!el) return; if(window.PC_MEMBER_ONLY || PC_HQ_VIEW){ el.innerHTML=''; return; } el.innerHTML=ROLE_DEFS.map(r=>`<button class="cat role-card ${ROLE===r.k?'act':''}" onclick="setRole('${r.k}')"><i class="fas ${r.ic}"></i><span class="ct"><b>${r.label}</b><span>${r.sub||''}</span></span></button>`).join(''); }
function setRole(k){ if(PC_HQ_VIEW) k='TRACK'; ROLE=k; try{ localStorage.setItem(ROLE_KEY,k); }catch(e){} if(k==='ADD'||k==='REMOVE'){ M.mode=k; M.parsed=null; M.fileName=''; M.verified=false; M.demoKind=null; M.tblCollapsed=false; } renderRoles(); render(); }
function render(){ if(ROLE==='ADD'||ROLE==='REMOVE') renderMKT(); else if(ROLE==='TRACK') renderTrack(); else renderIT(); }

/* ===== ผูกรหัส Voucher ให้คำขอ Comp รอบปีที่ยังไม่มีโค้ด (ย้อนหลังให้ของเดิมด้วย) ===== */
const VC_COMP_FALLBACK={ LFF:'VC0041', JFF:'VC0042', MFF:'VC0043', GFF:'VC0044', LCK:'VC0045' };
const VC_COMP_SIZE={ L:'large', J:'jumbo', M:'mega', G:'giga' };
function compVcOf(sh){
  const want=String(sh||'').toUpperCase(); if(!want) return '';
  let map={}; try{ map=JSON.parse(localStorage.getItem('pc_voucher_comp_map'))||{}; }catch(e){}
  if(map[want] && /^VC\d{3,5}$/i.test(map[want])) return String(map[want]).toUpperCase();
  const size=VC_COMP_SIZE[want.charAt(0)]||'', kind=/CK$/.test(want)?'chicken':(/FF$/.test(want)?'fri':'');
  const pick=(list,gc,gn,gp)=>{
    for(const o of list){ if(!o) continue; const pf=String(gp(o)||'').toUpperCase(); const c=String(gc(o)||'');
      if(pf===want && /^VC\d{3,5}$/i.test(c)) return c.toUpperCase(); }
    if(!size || !kind) return '';
    for(const o of list){ if(!o) continue; const nm=String(gn(o)||'').toLowerCase(), c=String(gc(o)||'');
      if(!/^VC\d{3,5}$/i.test(c)) continue; if(nm.indexOf('comp')<0) continue;
      if(size && nm.indexOf(size)<0) continue; if(kind && nm.indexOf(kind)<0) continue; return c.toUpperCase(); }
    return ''; };
  let vs=[]; try{ vs=JSON.parse(localStorage.getItem('pc_vouchers'))||[]; }catch(e){}
  let vc=pick(vs,o=>o.code||o.vcCode||o.typeCode,o=>o.name,o=>o.prefix||o.shortName)
      || pick(window.PC_PROMO_CODES||[],o=>o.code,o=>o.name,o=>o.button)
      || VC_COMP_FALLBACK[want] || '';
  if(vc){ map[want]=vc; try{ localStorage.setItem('pc_voucher_comp_map', JSON.stringify(map)); }catch(e){} }
  return vc;
}
function compVcBackfill(){
  const all=loadReqs(); let n=0;
  all.forEach(r=>{
    if(!r || (r.source!=='comp' && r.kindShort!=='comp')) return;
    if(String(r.promoCode||'').trim()) { if(!r.voucherCat){ r.voucherCat='comp'; n++; } return; }
    const vc=compVcOf(r.button);
    if(vc){ r.promoCode=vc; r.vcCode=vc; r.voucherCat='comp'; n++; }
  });
  if(n) saveReqs(all);
  return n;
}
try{ compVcBackfill(); }catch(e){}
/* ===================== WORK-TYPE CATEGORY (โค้ดโปรโมชั่น / โค้ดบัตรสมาชิก) ===================== */
const CAT_KEY='pc_code_cat';
let CATEGORY=(function(){ try{ const c=localStorage.getItem(CAT_KEY); if(c==='staff'){ localStorage.setItem(CAT_KEY,'promo'); return 'promo'; } return /^(promo|member|voucher)$/.test(c)?c:'promo'; }catch(e){ return 'promo'; } })();
const CAT_DEFS=[
  {k:'promo',   ic:'fa-ticket', label:'โค้ดโปรโมชั่น', sub:'Item coupon · Bill discount'},
  {k:'voucher', ic:'fa-gift',   label:'โค้ด Voucher', sub:'B2B · B2C · Comp'},
  {k:'member',  ic:'fa-id-card',label:'โค้ดบัตรสมาชิก', sub:'Friends of Potato Corner · สแกน QR แลกฟรี'},
];
function isMemberReq(r){ return !!(r && (r.source==='card' || r.source==='staff_discount' || r.kindShort==='member' || /member/i.test(r.kind||''))); }
/* แยกส่วนลดพนักงาน (Staff/Owner) ออกจากบัตรสมาชิกทั่วไป — เช็คจาก source/typeCode (ST*)/ชื่อ */
function isStaffCamp(c){ if(!c) return false; if(c.staff===true) return true; var b=String(c.button||c.typeCode||''); if(/^ST/i.test(b)) return true; return /staff|owner|พนักงาน|เจ้าของ/i.test(String(c.name||'')+' '+String(c.kind||'')); }
function isStaffReq(r){ if(!r) return false; if(r.source==='staff_discount') return true; var b=String(r.memberTypeCode||r.button||''); if(/^ST/i.test(b)) return true; return /staff|owner|ส่วนลดพนักงาน|เจ้าของ/i.test(String(r.kind||'')); }
/* voucher subtype: ป้ายตรง (voucherCat) → comp (จาก Comp Code) → เทียบกับ Voucher master (pc_vouchers) ตาม code/ชื่อ */
function vCatOf(r){ if(!r) return '';
  if(r.voucherCat) return String(r.voucherCat).toLowerCase();
  if(r.kindShort==='comp' || r.source==='comp') return 'comp';
  try{ const vs=JSON.parse(localStorage.getItem('pc_vouchers'))||[]; const v=vs.find(x=>x&&(x.prefix===r.button||x.typeCode===r.button||x.name===r.campaign)); if(v&&v.cat) return String(v.cat).toLowerCase(); }catch(e){}
  return ''; }
/* การ์ด "โค้ด Voucher" = เฉพาะ B2B / B2C / Complain / Comp · KOI และ Voucher อื่นๆ → โค้ดโปรโมชั่น */
const VCARD_CATS=['b2b','b2c','complain','comp'];
const VCAT_LABEL={ b2b:'B2B', b2c:'B2C', complain:'Complain', comp:'Comp' };
const VCAT_COLOR={ b2b:'#7b3fb5', b2c:'#0a7d3c', complain:'#b03048', comp:'#6a4fb3' };
/* ป้ายบอกว่าคำขอนี้เป็น Voucher ประเภทไหน (track จาก Voucher master ผ่าน vCatOf) */
function vTagHTML(r){ var c=vCatOf(r); if(!c||!VCAT_LABEL[c]) return ''; return '<span class="mtag" style="background:'+VCAT_COLOR[c]+';color:#fff"><i class="fas fa-gift"></i>Voucher '+VCAT_LABEL[c]+'</span>'; }
function isVoucherReq(r){ return !!(r && !isMemberReq(r) && VCARD_CATS.includes(vCatOf(r))); }
function catOfReq(r){ return isMemberReq(r)?(isStaffReq(r)?'staff':'member'):(isVoucherReq(r)?'voucher':'promo'); }
function inCat(r){ return catOfReq(r)===CATEGORY; }
/* รายการในการ์ด "โค้ด Voucher" = ดึงจาก Voucher master (pc_vouchers) เฉพาะ B2B/B2C/Complain · ล็อกไม่ให้มีโค้ดอื่น (เพิ่มใน Voucher master → มาหน้านี้อัตโนมัติ) */
function voucherMasterCamps(){ try{ const vs=JSON.parse(localStorage.getItem('pc_vouchers'))||[]; return vs.filter(v=>v&&v.active!==false&&!v.draft&&['b2b','b2c','complain'].includes(String(v.cat||'').toLowerCase())).map(v=>({name:v.name, kind:'Voucher online', button:v.prefix||v.typeCode||'', start:v.start||'', end:v.end||'', typeCode:v.typeCode||v.prefix||'', cat:String(v.cat||'').toLowerCase()})); }catch(e){ return []; } }
function renderCats(){ const el=document.getElementById('cats'); if(!el) return;
  if(window.PC_MEMBER_ONLY){ el.innerHTML=''; return; }
  const all=loadReqs().filter(r=>r.type==='ADD'||r.type==='REMOVE');
  const cnt={promo:0,voucher:0,member:0,staff:0}; all.forEach(r=>{ cnt[catOfReq(r)]++; });
  el.innerHTML=CAT_DEFS.map(c=>`<button class="cat ${c.k} ${CATEGORY===c.k?'on':''}" onclick="setCategory('${c.k}')"><i class="fas ${c.ic}"></i><span class="ct"><b>${c.label}</b><span>${c.sub}</span></span>${cnt[c.k]?`<span class="cn">${cnt[c.k]}</span>`:''}</button>`).join(''); }
function setCategory(k){ CATEGORY=k; try{ localStorage.setItem(CAT_KEY,k); }catch(e){}
  if(ROLE==='BR'){ ROLE='ADD'; try{ localStorage.setItem(ROLE_KEY,'ADD'); }catch(e){} }
  if(k==='member'||k==='staff'){ M.kind='Member card'; M.button=''; }
  else if(k==='voucher'){ M.kind='Voucher online'; M.button=''; }
  else { if(M.kind==='Member card'){ M.kind=KINDS[1].label; M.button=''; } }
  M.campaign=''; M.parsed=null; M.fileName=''; M.verified=false;
  renderCats(); renderRoles(); render(); }
let TR={ q:'', status:'all', type:'all', view:'list' };
function renderTrack(){
  const baseAll=loadReqs().filter(r=>(r.type==='ADD'||r.type==='REMOVE')).filter(inCat);
  const cP=baseAll.filter(r=>r.itStatus==='PENDING').length, cD=baseAll.filter(r=>r.itStatus==='DOWNLOADED').length, cF=baseAll.filter(r=>r.itStatus==='DONE').length;
  const addN=baseAll.filter(r=>r.type==='ADD').length, rmN=baseAll.filter(r=>r.type==='REMOVE').length;
  document.getElementById('view').innerHTML=`
    <div class="card">
      <h2><i class="fas fa-clock-rotate-left"></i>คำขอที่ส่งแล้ว · ติดตามสถานะ</h2>
      <p class="sub">รายการคำขอเพิ่ม/ลบโค้ดที่ส่งให้ IT แล้ว — ค้นหาด้วยเลขคำขอ/แคมเปญ · กรองตามสถานะ · ถ้า IT ดำเนินการแล้วจะยกเลิกไม่ได้ — ต้อง“แจ้งลบโค้ด”แทน</p>
      <div class="actbar" style="margin-bottom:13px">
        <input class="inp" id="trSearch" style="flex:1;min-width:240px" placeholder="ค้นหา: เลขคำขอ (CR-1234) · แคมเปญ · ปุ่มกด · ผู้แจ้ง" value="${esc(TR.q)}" oninput="TR.q=this.value; renderMyReqs(); trToggleClear()">
        <button class="btn btn-o btn-sm" id="trClear" style="${TR.q?'':'display:none'}" onclick="TR.q='';renderTrack()"><i class="fas fa-xmark"></i>ล้าง</button>
      </div>
      <div class="seg" style="margin-bottom:12px">
        <button class="${TR.status==='all'?'on':''}" onclick="TR.status='all';renderTrack()"><i class="fas fa-layer-group"></i>ทั้งหมด <span class="seg-n">${baseAll.length}</span></button>
        <button class="${TR.status==='pending'?'on':''}" onclick="TR.status='pending';renderTrack()"><i class="fas fa-hourglass-half"></i>รอ IT <span class="seg-n">${cP}</span></button>
        <button class="${TR.status==='progress'?'on':''}" onclick="TR.status='progress';renderTrack()"><i class="fas fa-download"></i>IT โหลดแล้ว <span class="seg-n">${cD}</span></button>
        <button class="${TR.status==='done'?'on':''}" onclick="TR.status='done';renderTrack()"><i class="fas fa-circle-check"></i>เสร็จ <span class="seg-n">${cF}</span></button>
      </div>
      <div class="typefilter">
        <button class="tchip ${TR.type==='all'?'on':''}" onclick="TR.type='all';renderTrack()">ทั้งหมด</button>
        <button class="tchip add ${TR.type==='add'?'on':''}" onclick="TR.type='add';renderTrack()"><i class="fas fa-plus"></i> เฉพาะเพิ่ม</button>
        <button class="tchip rm ${TR.type==='remove'?'on':''}" onclick="TR.type='remove';renderTrack()"><i class="fas fa-trash-can"></i> เฉพาะลบ</button>
        <div class="seg trk-viewseg" style="margin-left:auto">
          <button class="${TR.view==='list'?'on':''}" onclick="TR.view='list';renderTrack()"><i class="fas fa-list"></i> ลิสต์</button>
          <button class="${TR.view==='card'?'on':''}" onclick="TR.view='card';renderTrack()"><i class="fas fa-table-cells-large"></i> การ์ด</button>
        </div>
      </div>
      <div id="myReqs"></div>
    </div>`;
  renderMyReqs();
}
function trToggleClear(){ const b=document.getElementById('trClear'); if(b) b.style.display=(TR.q&&TR.q.length)?'':'none'; }
function startRemoveFromReq(id){ const r=loadReqs().find(x=>x.id===id); if(!r) return;
  ROLE='REMOVE'; M.mode='REMOVE'; M.campaign=r.campaign; M.button=r.button||''; const c=campOf(r.campaign); if(c){ M.kind=c.kind; M.proExpire=c.end; }
  M.parsed={fileCodes:(r.codes||[]).map(cCode)}; M.verified=true; M.fileName='(จากคำขอ '+r.id+')';
  renderRoles(); render(); }

/* ===================== MKT ===================== */
let M={ mode:'ADD', campaign:CAMPAIGNS[0].name, kind:CAMPAIGNS[0].kind, button:CAMPAIGNS[0].button,
  proExpire:CAMPAIGNS[0].end, startDate:'', fileName:'', rawText:'', parsed:null, verified:false, memberTypeCode:'', memberMap:null, voucherCat:'', customerGroup:'normal' };
function mkInitCampaign(){ const c=campOf(M.campaign); if(c){ M.kind=c.kind; M.button=c.button; M.proExpire=c.end; if(!M.startDate) M.startDate=toISO(minStartDate()); } }

function renderMKT(){
  if(!M.startDate) M.startDate=toISO(minStartDate());
  const minISO=toISO(minStartDate()); const s=settings();
  const isAdd=M.mode==='ADD';
  const staffMode = (CATEGORY==='staff');
  const memberMode = (M.kind==='Member card' || staffMode);
  const camps = CATEGORY==='voucher' ? voucherMasterCamps()
    : staffMode ? allCampaigns().filter(c=> isStaffCamp(c))
    : CATEGORY==='member' ? allCampaigns().filter(c=> /member/i.test(c.kind||'') && !isStaffCamp(c))
    : (function(){ const vb=new Set(voucherMasterCamps().map(v=>v.button)); return allCampaigns().filter(c=> isOnlineKind(c.kind) && !vb.has(c.button)); })();
  const kindList=KINDS.filter(k=> (CATEGORY==='member'||staffMode) ? k.short==='member' : CATEGORY==='voucher' ? k.short==='voucher' : k.short!=='member' );
  const kindOpts=kindList.map(k=>`<option value="${esc(k.label)}" ${M.kind===k.label?'selected':''}>${esc(k.label.replace(/ online$/i,'').replace(/ Online$/i,''))}</option>`).join('');
  // กรองปุ่มตามประเภทที่เลือก
  const campsByKind = memberMode ? camps : camps.filter(c=>c.kind===M.kind);
  const btnDlist = campsByKind.map(c=>`<option value="${esc(c.button)}">${esc(c.button)} — ${esc(c.name)}</option>`).join('');
  const selCamp = campsByKind.find(c=>c.button===M.button) || allCampaigns().find(c=>c.button===M.button);
  const ko=kindOf(M.kind)||{};
  const kindColor=ko.short==='bill'?'#c0392b':ko.short==='voucher'?'#8e44ad':'#2980b9';
  // feed custom picker
  window.__ppOpts = campsByKind.map(function(c){ return {code:c.button, name:c.name+(c.btnName?' · '+c.btnName:''), codePro:c.code||c.button||''}; });

  const memTypeLabel = staffMode ? 'ประเภทส่วนลดพนักงาน' : 'Member Type';
  const memTagText = staffMode ? 'เลือกจากประเภทพนักงาน/เจ้าของ' : 'เลือกจากบัตรสมาชิก';
  const memPlaceholder = staffMode ? 'เลือกประเภทส่วนลดพนักงาน (Staff/Owner)…' : 'เลือกประเภทบัตรสมาชิก…';
  const memLockHTML = staffMode
    ? ' ประเภท: <b>ส่วนลดพนักงาน (Staff/Owner)</b> · กรอกเฉพาะรหัสส่วนลดพนักงาน — ระบบส่งให้ IT เป็นไฟล์ Member_Code (มีคอลัมน์ Branch + CRMCode)'
    : ' ประเภท: <b>บัตรสมาชิก (Member card)</b> · คูปอง Item coupon ที่ผูกกับบัตร <b>มีได้หลายตัว</b> — IT เป็นผู้สร้าง + ผูกในระบบ Backoffice (ไม่ต้องกรอกที่นี่)';
  const headerForm = memberMode ? `
    <div class="fld"><label>${memTypeLabel} <span class="req">*</span> <span class="it-tag" style="background:#eef4ff;color:#2c4a82;border-color:#cfe0fb"><i class="fas fa-id-card"></i> ${memTagText}</span></label>
      <input class="inp" id="mCampSearch" list="pcCampList" autocomplete="off" value="${esc(realCampaign())}" placeholder="${memPlaceholder}" oninput="mkCampInput(this.value)" onchange="mkCampCommit(this.value)">
      <datalist id="pcCampList">${camps.map(c=>`<option value="${esc(c.name)}">${esc(c.kind||'')}${c.end?' · ถึง '+fmtDate(c.end):''}</option>`).join('')}</datalist>
      ${campHintHTML()}
    </div>
    <div class="lead-lock" style="color:#2c4a82;background:#eef4ff;border-color:#cfe0fb;margin:0 0 4px"><i class="fas fa-id-card" style="color:#2c4a82"></i>${memLockHTML}</div>
  ` : `
    <div class="grid2">
      <div class="fld"><label>ค้นหา Code Promotion <span class="req">*</span> <span class="it-tag" style="background:#eef4ff;color:#2c4a82;border-color:#cfe0fb"><i class="fas fa-magnifying-glass"></i> กรองตามประเภท</span></label>
        <div class="pp-wrap">
          <input class="inp" id="mBtnSearch" autocomplete="off" value="${esc(M.button)}" placeholder="พิมพ์ Code Pro หรือชื่อแคมเปญ เช่น BC0000 / GIGA…" oninput="mkBtnInput(this.value);ppShow(this)" onfocus="ppShow(this)" onblur="ppHide(this)" onkeydown="ppKey(this,event)">
          <i class="fas fa-chevron-down pp-chevron"></i>
          <div class="pp-drop"></div>
        </div>
        <div class="hint"><i class="fas fa-circle-info"></i> ${campsByKind.length} ปุ่มในประเภทนี้${M.button&&!selCamp?` · <span style="color:#c0392b">ไม่พบ &ldquo;${esc(M.button)}&rdquo;</span>`:''}</div></div>
      <div class="fld"><label>ประเภท (Type) <span class="req">*</span></label>
        <select class="inp" onchange="mkPickType(this.value)">${kindOpts}</select>
        <div class="hint">เลือกเพื่อกรองรายการโค้ด</div></div>
    </div>
    ${selCamp ? `<div style="display:grid;grid-template-columns:170px 1fr 1fr;gap:14px;align-items:end">
      <div class="fld"><label>โค้ด (Code Promotion)</label>
        <div style="background:#f3f5f7;border:1px solid #dde2e7;border-radius:8px;padding:9px 12px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:.9rem;letter-spacing:1px;min-height:40px;display:flex;align-items:center">${esc(M.button||'')}</div></div>
      <div class="fld"><label>ชื่อปุ่มโปร</label>
        <div style="background:#f3f5f7;border:1px solid #dde2e7;border-radius:8px;padding:9px 12px;font-size:.9rem;min-height:40px;display:flex;align-items:center">${esc(selCamp.shortName||selCamp.name||M.campaign||'')}</div></div>
      <div class="fld"><label>ชื่อแคมเปญ</label>
        <div style="background:#f3f5f7;border:1px solid #dde2e7;border-radius:8px;padding:9px 12px;font-size:.9rem;min-height:40px;display:flex;align-items:center">${esc(selCamp.campaign||selCamp.name||M.campaign||'')}</div></div>
    </div>` : ''}
  `;

  const custField = memberMode ? '' : `
    <div class="fld"><label>กลุ่มลูกค้า <span class="req">*</span></label>
      <div style="display:flex;gap:8px;margin-top:2px">
        <button type="button" onclick="mkSetCust('normal')" style="flex:1;border:1.6px solid ${M.customerGroup!=='crm'?'#1a1d20':'#dde2e7'};background:${M.customerGroup!=='crm'?'#fff':'#fafbfc'};border-radius:10px;padding:11px 12px;font-family:inherit;font-weight:600;font-size:.9rem;cursor:pointer;color:${M.customerGroup!=='crm'?'#1a1d20':'#5a616b'}"><i class="fas fa-users"></i> ลูกค้าปกติ</button>
        <button type="button" onclick="mkSetCust('crm')" style="flex:1;border:1.6px solid ${M.customerGroup==='crm'?'#2e934a':'#dde2e7'};background:${M.customerGroup==='crm'?'#eafaf1':'#fafbfc'};border-radius:10px;padding:11px 12px;font-family:inherit;font-weight:600;font-size:.9rem;cursor:pointer;color:${M.customerGroup==='crm'?'#15623c':'#5a616b'}"><i class="fas fa-user-check"></i> ลูกค้า CRM</button>
      </div>
      <div class="hint" style="margin-top:6px"><i class="fas fa-circle-info"></i> โปรนี้สำหรับลูกค้าทั่วไป หรือเฉพาะสมาชิก CRM (Friends of Potato Corner)</div></div>`;
  const addForm = headerForm + `
    <div class="grid2">
      <div class="fld"><label>วันเริ่มใช้โค้ด <span class="req">*</span> <span class="it-tag">ล็อกล่วงหน้า</span></label>
        <input class="inp" type="date" min="${minISO}" value="${esc(M.startDate)}" oninput="M.startDate=this.value; mkReview()"></div>
      <div class="fld"><label>วันที่หมดอายุของโค้ด (ProExpire) <span class="req">*</span></label>
        <input class="inp" type="date" value="${esc(M.proExpire)}" oninput="M.proExpire=this.value"></div>
    </div>
    <div class="lead-lock"><i class="fas fa-lock"></i>ต้องแจ้งเพิ่มล่วงหน้าอย่างน้อย <b>${s.leadDays} วัน${s.countWeekend?'':'ทำการ'}</b> (แนะนำ ${s.recDays} วัน) — เลือกวันเริ่มได้ตั้งแต่ ${fmtDate(minISO)} · ค่านี้ IT ตั้งที่ System Settings ▸ ล็อกแจ้งเพิ่มโค้ด</div>`;

  const rmForm = headerForm + `
    <div class="lead-lock"><i class="fas fa-circle-info"></i>เลือกแคมเปญ/ปุ่มให้ตรงกับโค้ดที่จะลบ — ระบบจะตรวจว่าโค้ดที่แนบ <b>มีอยู่ในระบบของแคมเปญนี้ไหม</b> และเช็ค Redeem · ลบได้เฉพาะโค้ดที่ยังไม่ถูก Redeem</div>`;

  const crmMode = false; /* กลุ่มลูกค้า/CRM ย้ายไปไว้ในฟอร์มกรอก (Coupon/Voucher/Bill/Item Set) แล้ว */
  const crmPanel = `<div class="route" style="border-left-color:#2e934a;margin:6px 0 4px"><div class="rh" style="color:#15623c"><i class="fas fa-user-check"></i> โหมด CRM — ตั้งค่าให้ฝั่ง POS (ไม่ต้องอัปไฟล์โค้ด)</div>
        <div style="font-size:.86rem;color:#3a4150;margin-top:5px;line-height:1.55">สิทธิ์นี้ผูกกับ<b>สมาชิก CRM (Friends of Potato Corner)</b> โดยตรง — ไม่มีการเพิ่มโค้ดรายใบ · IT จะ <b>interface กับระบบสมาชิก</b> แล้วตั้งค่าให้ปุ่ม/สิทธิ์นี้ <b>กดใช้งานได้ที่ POS</b> เมื่อระบุ/สแกนสมาชิก</div></div>
      <div class="lead-lock" style="color:#15623c;background:#eafaf1;border-color:#bfe6cf"><i class="fas fa-circle-info" style="color:#2e934a"></i> ส่งให้ IT เพื่อตั้งค่า — IT ยืนยันเมื่อ POS พร้อมใช้งาน (ไม่มีไฟล์โค้ดให้โหลด)</div>
      <div class="actbar" style="margin-top:14px"><button class="btn btn-g" onclick="confirmCrmSetup()"><i class="fas fa-paper-plane"></i>ส่งให้ IT ตั้งค่า POS</button></div>`;
  const fileFld = `<div class="fld"><label>ไฟล์โค้ด ${isAdd?'<span class="req">*</span>':''}</label>
        ${memberMode?`<div class="route" style="border-left-color:#2c4a82;margin:0 0 12px"><div class="rh" style="color:#2c4a82"><i class="fas fa-file-arrow-down"></i> ไฟล์ที่ต้องใช้ (บังคับ)</div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:3px"><button type="button" class="btn btn-d btn-sm" onclick="downloadMemberTemplate()"><i class="fas fa-download"></i> ดาวน์โหลดเทมเพลตโค้ดบัตร</button><span class="hint" style="margin:0">กรอกตามคอลัมน์: <b>MemberCode · MemberTypeCode · FirstName · LastName · ExpireDate · IDCard · Status</b> — ระบบแปลงเป็น Member_Code ให้ IT</span></div></div>`:''}
        <div class="drop" id="drop" onclick="document.getElementById('fileInp').click()">
          <i class="fas fa-file-arrow-up"></i><div class="big">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</div>
          <div class="sm">.xlsx / .xls / .csv — ระบบอ่านคอลัมน์โค้ดให้อัตโนมัติ</div></div>
        <input type="file" id="fileInp" accept=".xlsx,.xls,.csv" style="display:none" onchange="mkFile(this.files[0])">
        ${M.fileName?`<div class="filechip"><i class="fas fa-file-excel"></i><b>${esc(M.fileName)}</b><span class="x" onclick="mkClear()"><i class="fas fa-xmark"></i></span></div>`:''}
        <div class="hint" style="margin-top:9px"><i class="fas fa-circle-info"></i> รูปแบบโค้ดที่ถูกต้อง: ${CODE_RULE}</div>
        ${(M.parsed&&!M.verified)?`<div class="actbar" style="margin-top:12px"><button class="btn btn-d" onclick="mkVerify()"><i class="fas fa-list-check"></i>ยืนยันไฟล์ / ตรวจสอบโค้ด</button></div>`:''}
        ${`<div class="actbar" style="margin-top:10px"><span class="hint" style="margin:0 4px 0 0;align-self:center"><i class="fas fa-flask"></i> ลองดูตัวอย่าง:</span><button class="btn btn-o btn-sm" onclick="mkDemo('pass')">${isAdd?'โค้ดผ่าน (ไม่ซ้ำ)':'โค้ดลบได้ทั้งหมด'}</button><button class="btn btn-o btn-sm" onclick="mkDemo('dup')">${isAdd?'โค้ดซ้ำ/ผิด format':'มีโค้ดลบไม่ได้'}</button></div>`}
      </div>`;

  document.getElementById('view').innerHTML=`
    <div class="card">
      ${(CATEGORY==='member' && isAdd) ? '<div id="cl-it-queue-inline"></div>' : ''}
      <h2><i class="fas ${isAdd?(memberMode?(staffMode?'fa-user-tag':'fa-id-card'):'fa-plus-circle'):'fa-trash-can'}"></i>${isAdd?(memberMode?(staffMode?'แจ้งเพิ่มรหัสส่วนลดพนักงาน':'แจ้งเพิ่มโค้ดบัตรสมาชิก'):'แจ้งเพิ่มโค้ดเข้าระบบ'):'แจ้งลบโค้ดออกจากระบบ'}</h2>
      <p class="sub">${isAdd?(memberMode?(staffMode?'เลือกประเภทส่วนลดพนักงาน (Staff/Owner) + แนบไฟล์รหัสตามเทมเพลต — ระบบส่งให้ IT เป็นไฟล์ Member_Code (Branch + CRMCode) อัป Backoffice ได้ทันที':'ค้นหาบัตรในระบบ + แนบไฟล์โค้ดบัตรตามเทมเพลต (MemberCode · FirstName · LastName …) — ระบบแปลงเป็นไฟล์ Member_Code ให้ IT นำไปอัป Backoffice ได้ทันที'):'แนบไฟล์โค้ดของคุณ ระบบจะแปลงเป็นไฟล์ format ของ Backoffice ให้ IT โหลดไปใช้ต่อได้เลย'):'เลือกแคมเปญ + แนบไฟล์โค้ดที่จะลบ — ระบบเช็ค Redeem จาก POS ให้ ลบได้เฉพาะโค้ดที่ยังไม่ถูก Redeem'}</p>
      ${isAdd?addForm:rmForm}
      ${crmMode ? crmPanel : fileFld}
      <div id="reviewArea"></div>
    </div>`;
  mkReview(); bindDrop();
  /* พาเนล "ผูกบัตร/สิทธิ์ — รอ IT ผูกโค้ด" — โชว์เฉพาะแท็บโค้ดบัตรสมาชิก > แจ้งเพิ่มโค้ด · IT/Admin เท่านั้น */
  try{ if(CATEGORY==='member' && isAdd && window.PC_CardLink){ var _clq=document.getElementById('cl-it-queue-inline'); if(_clq){ var _r=''; try{ _r=localStorage.getItem('pc_role')||''; }catch(e){} if(/^(IT|Admin)$/i.test(_r)){ _clq.style.marginBottom='16px'; window.PC_CardLink.mountQueue(_clq); } else { _clq.style.display='none'; } } } }catch(e){}
}
function mkMode(m){ M.mode=m; M.parsed=null; M.fileName=''; M.rawText=''; M.verified=false; renderMKT(); }
function campHintHTML(){ const valid=!!campLookup(realCampaign());
  if(realCampaign() && !valid) return `<div id="campHint" class="lead-lock" style="color:#c0392b;background:#fdf2f0;border-color:#f1c6bf"><i class="fas fa-circle-xmark" style="color:#c0392b"></i>ไม่พบแคมเปญ “${esc(realCampaign())}” ในระบบ — เลือกจากรายการที่มีอยู่เท่านั้น · สร้างแคมเปญใหม่ทำที่หน้าสร้างโปรโมชัน</div>`;
  return `<div id="campHint" class="hint"><i class="fas fa-circle-info"></i> หน้านี้ใช้<b>แนบ/ลบโค้ด</b>ให้แคมเปญที่มีอยู่แล้วเท่านั้น — ค้นหาเลือกจากระบบ ไม่สร้างแคมเปญใหม่</div>`; }
function mkCampInput(v){ M.campaign=(v||'').trim(); const el=document.getElementById('campHint'); if(el) el.outerHTML=campHintHTML(); mkSendState(); }
function mkCampCommit(v){ M.campaign=(v||'').trim(); const c=campLookup(M.campaign);
  if(c){ M.kind=c.kind||M.kind; M.button=c.button||M.button; if(M.mode==='ADD'){ M.proExpire=c.end||M.proExpire; if(!M.startDate) M.startDate=toISO(minStartDate()); } if(c.typeCode) M.memberTypeCode=c.typeCode; }
  renderMKT(); }
function mkPickType(v){ M.kind=v; const ms=allCampaigns().filter(c=>c.kind===v).map(c=>c.button); if(M.button && !ms.includes(M.button)){ M.button=''; M.campaign=''; } renderMKT(); }
function mkBtnInput(v){ M.button=(v||'').trim();
  /* auto-resolve exact button match while typing — ให้ campaign/type/code ถูกผูกแม้ผู้ใช้พิมพ์เอง (ไม่ได้กดเลือกจากดรอปดาวน์) */
  let c=allCampaigns().find(x=>x.button===M.button);
  if(CATEGORY==='voucher'){ const vc=voucherMasterCamps().find(x=>x.button===M.button); if(vc){ c=vc; M.voucherCat=vc.cat||''; } }
  if(c){ M.campaign=c.name||M.campaign; if(c.kind) M.kind=c.kind; if(M.mode==='ADD'){ M.proExpire=c.end||M.proExpire; if(!M.startDate) M.startDate=toISO(minStartDate()); } if(c.typeCode) M.memberTypeCode=c.typeCode; }
  else { M.campaign=''; }
  mkSendState(); }
function mkBtnCommit(v){ M.button=(v||'').trim(); let c=allCampaigns().find(x=>x.button===M.button); if(CATEGORY==='voucher'){ const vc=voucherMasterCamps().find(x=>x.button===M.button); if(vc){ c=vc; M.voucherCat=vc.cat||''; } } if(c){ M.campaign=c.name||M.campaign; if(c.kind) M.kind=c.kind; if(M.mode==='ADD'){ M.proExpire=c.end||M.proExpire; if(!M.startDate) M.startDate=toISO(minStartDate()); } if(c.typeCode) M.memberTypeCode=c.typeCode; } renderMKT(); }
function mkVerify(){ M.verified=true; renderMKT(); }
function mkSetCust(g){ M.customerGroup=(g==='crm')?'crm':'normal'; renderMKT(); }
function confirmCrmSetup(){ const camp=realCampaign()||M.button;
  if(!M.button && !realCampaign()){ Swal.fire({icon:'warning',title:'เลือกปุ่ม/แคมเปญก่อน',confirmButtonColor:'#2e934a'}); return; }
  const k=kindOf(M.kind)||{}; const c=campOf(realCampaign())||campLookup(realCampaign())||{};
  Swal.fire({icon:'question', title:'ส่งให้ IT ตั้งค่า POS (CRM)?', html:`สิทธิ์ CRM — “${esc(camp)}”<br><span style="color:#15623c;font-size:13px">ไม่มีไฟล์โค้ด · IT จะ interface ระบบสมาชิก + ตั้งค่าให้ POS ใช้งานได้</span>`, showCancelButton:true, confirmButtonColor:'#2e934a', confirmButtonText:'ส่งให้ IT', cancelButtonText:'ยกเลิก'}).then(res=>{
    if(!res.isConfirmed) return;
    const req={ id:nextId(), type:'ADD', kind:M.kind, proStatus:k.status||'Normal', kindShort:k.short||'', campaign:camp, button:M.button||'', promoCode:genPromo(c), start:c.start||M.startDate||'', end:c.end||M.proExpire, proExpire:M.proExpire, startDate:M.startDate, codes:[], count:0, reporter:reporter(), status:'CONFIRMED', itStatus:'PENDING', createdAt:Date.now(), customerGroup:'crm', crmSetup:true, voucherCat:(M.voucherCat||'') };
    const all=loadReqs(); all.unshift(req); saveReqs(all);
    Swal.fire({icon:'success', title:'ส่งให้ IT แล้ว', html:`เลขที่คำขอ <b>${esc(req.id)}</b><div style="color:#15623c;font-size:13px;margin-top:6px">IT จะ interface ระบบสมาชิก + ตั้งค่าให้ POS ใช้งานสำหรับสมาชิก CRM</div>`, confirmButtonColor:'#2e934a' });
    renderMKT(); }); }
function mkClear(){ M.parsed=null; M.fileName=''; M.rawText=''; M.verified=false; M.demoKind=null; M.tblCollapsed=false; renderMKT(); }
function mkDemo(kind){
  if(M.demoKind===kind && M.parsed){ M.tblCollapsed=!M.tblCollapsed; mkReview(); return; }
  M.demoKind=kind; M.tblCollapsed=false;
  if(M.mode==='ADD'){
    if(kind==='pass') M.parsed={fileCodes:['PROMOA001','PROMOA002','PROMOA003','PROMOA004','PROMOA005','PROMOA006']};
    else M.parsed={fileCodes:['CLC100001','CLC100002','CLC100003','PROMOA001','PROMOA001','BAD CODE!','XY']};
  } else {
    const sys=[...systemCodes(realCampaign()).values()];
    const removable=sys.filter(x=>!x.redeemed).map(x=>x.code);
    const redeemed=sys.filter(x=>x.redeemed).map(x=>x.code);
    if(kind==='pass') M.parsed={fileCodes:(removable.length?removable.slice(0,6):['NOCODE0001'])};
    else M.parsed={fileCodes:[...removable.slice(0,2), ...redeemed.slice(0,1), 'GHOST9001','GHOST9002']};
  }
  M.fileName='(ตัวอย่าง) '+(kind==='pass'?'codes_pass.xlsx':'codes_dup.xlsx'); M.verified=true; renderMKT(); }
function bindDrop(){ const d=document.getElementById('drop'); if(!d) return;
  ['dragenter','dragover'].forEach(e=>d.addEventListener(e,ev=>{ev.preventDefault();d.classList.add('over');}));
  ['dragleave','drop'].forEach(e=>d.addEventListener(e,ev=>{ev.preventDefault();d.classList.remove('over');}));
  d.addEventListener('drop',ev=>{ const f=ev.dataTransfer.files[0]; if(f) mkFile(f); }); }

/* ---- parse file/paste ---- */
function gatherRawCodes(){ return (M.parsed&&M.parsed.fileCodes)?M.parsed.fileCodes.slice():[]; }
function mkFile(file){ if(!file) return; M.fileName=file.name; const rd=new FileReader();
  rd.onload=e=>{ try{ const wb=XLSX.read(e.target.result,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false,defval:''});
      const codes=extractCodes(rows); M.memberMap=extractMemberMap(rows); M.parsed={fileCodes:codes, rawRows:rows.slice(0,6)}; M.verified=false; renderMKT(); }
    catch(err){ Swal.fire({icon:'error',title:'อ่านไฟล์ไม่ได้',text:String(err.message||err),confirmButtonColor:'#2e934a'}); } };
  rd.readAsArrayBuffer(file); }
function extractCodes(rows){ if(!rows.length) return [];
  let col=0, start=0; const head=rows[0].map(x=>String(x).toLowerCase());
  const hi=head.findIndex(h=>/code|โค้?ด|proid|coupon|voucher/.test(h));
  if(hi>=0){ col=hi; start=1; } else if(head.some(h=>/code|โค้?ด|proid/.test(h))===false && rows[0].length>1){ col=0; start=0; }
  const out=[]; for(let i=start;i<rows.length;i++){ const v=String(rows[i][col]==null?'':rows[i][col]).trim(); if(v) out.push(v); } return out; }
function realCampaign(){ return String(M.campaign||'').trim(); }
/* member files: จับ ชื่อ/Code/Member no. จากไฟล์บัตรสมาชิก (ไว้ให้ IT export เป็น Backoffice Member_Code) */
function extractMemberMap(rows){ const map=new Map(); if(!rows||!rows.length) return map;
  const head=(rows[0]||[]).map(x=>String(x).toLowerCase());
  const find=(re,def)=>{ const i=head.findIndex(h=>re.test(h)); return i<0?def:i; };
  let codeCol=find(/membercode|^code$|\bcode\b|โค้?ด/, 0);
  const fnCol=find(/firstname|first\s*name|ชื่อ(?!.*สกุล)/, -1);
  const lnCol=find(/lastname|last\s*name|สกุล/, -1);
  const nameCol=find(/member\s*name|^name$|ชื่อ.*สกุล/, -1);
  const typeCol=find(/membertypecode|type\s*code|ประเภท/, -1);
  const idCol=find(/idcard|id\s*card|บัตรประชาชน|เลขบัตร/, -1);
  const expCol=find(/expire|หมดอายุ/, -1);
  const mnoCol=find(/member\s*\.?\s*no|รหัสสมาชิก/, -1);
  const cell=(r,c)=>c<0?'':String(r[c]==null?'':r[c]).trim();
  for(let i=1;i<rows.length;i++){ const r=rows[i]||[]; const code=cell(r,codeCol); if(!code) continue;
    let name=cell(r,nameCol);
    if(!name && (fnCol>=0||lnCol>=0)) name=[cell(r,fnCol),cell(r,lnCol)].filter(Boolean).join(' ');
    map.set(code.toUpperCase(), {name, memberNo:cell(r,mnoCol), idCard:cell(r,idCol), typeCode:cell(r,typeCol), expire:cell(r,expCol)}); }
  return map; }
function me(){ return { email: localStorage.getItem('pc_userEmail')||'mkt.rd@rocks-foods.com', name: localStorage.getItem('pc_userName')||'การตลาด/RD' }; }
function reporter(){ return me().email; }
function fmtDT(ts){ if(!ts) return '—'; const d=new Date(ts); if(isNaN(d)) return '—'; return d.getDate()+' '+TH_M[d.getMonth()]+' '+(d.getFullYear()+543)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function nextId(){ let m=1000; loadReqs().forEach(r=>{ const n=parseInt(String(r.id||'').replace(/\D/g,'')); if(n>m) m=n; }); return 'CR-'+(m+1); }
function addTokens(count){ const k=kindOf(M.kind)||{status:''}; return {campaign:realCampaign(), item:M.button||'—', type:M.kind, proStatus:k.status, count:count, startDate:fmtDate(M.startDate), proExpire:fmtDate(M.proExpire), reporter:reporter(), date:fmtDate(toISO(new Date()))}; }
function rmTokens(count, skipped){ return {campaign:realCampaign(), item:M.button||'—', count:count, skipped:skipped, reporter:reporter(), date:fmtDate(toISO(new Date()))}; }

/* ---- review ---- */
function mkReview(){ const area=document.getElementById('reviewArea'); if(!area) return;
  if(!M.parsed){ area.innerHTML=''; M.review=null; mkSendState(); return; }
  if(!M.verified){ area.innerHTML='<div class="lead-lock"><i class="fas fa-circle-info"></i>แนบไฟล์แล้ว — กด “ยืนยันไฟล์ / ตรวจสอบโค้ด” เพื่อตรวจ format และโค้ดซ้ำ</div>'; M.review=null; mkSendState(); return; }
  const raw=gatherRawCodes();
  if(M.mode==='ADD') reviewAdd(area, raw); else reviewRemove(area, raw); }
function mkSendState(){ const b=document.getElementById('btnConfirm'); if(b) b.disabled=!canConfirm(); }
function tblBlock(count, inner){
  const head=`<div class="tblhead" onclick="toggleTbl()"><span><i class="fas fa-table-list"></i>ตารางโค้ด ${count} รายการ${M.tblCollapsed?' · ซ่อนอยู่ (กดเพื่อกาง)':''}</span><i class="fas fa-chevron-${M.tblCollapsed?'right':'down'} chev"></i></div>`;
  return `<div class="tblbox">${head}${M.tblCollapsed?'':`<div class="tblwrap" style="margin-top:0;border:0;border-radius:0">${inner}</div>`}</div>`;
}
function toggleTbl(){ M.tblCollapsed=!M.tblCollapsed; mkReview(); }
/* ค้นปุ่ม/แคมเปญจากทั้ง master + Voucher master (pc_vouchers) — voucher ไม่ได้อยู่ใน allCampaigns() */
function btnCamp(btn){ btn=String(btn||'').trim(); if(!btn) return null; return allCampaigns().find(c=>c.button===btn) || voucherMasterCamps().find(c=>c.button===btn) || null; }
function canConfirm(){ const memberMode=(M.kind==='Member card');
  if(memberMode){ if(!realCampaign().trim()||!campLookup(realCampaign())) return false; }
  else { if(!M.button.trim()||!btnCamp(M.button)) return false; }
  if(M.mode==='ADD'){ if(!M.kind||!M.proExpire||!M.startDate) return false; if(M.startDate<toISO(minStartDate())) return false; return !!(M.review&&M.review.ok>0); }
  return !!(M.review&&M.review.removable>0); }

/* ⭐ FX-P89 — ทะเบียนโค้ดที่ "ถูกแจกไปแล้ว" ทั้งระบบ (ข้ามแคมเปญ)
   เดิมนับแค่ใบ type=ADD ที่ status=CONFIRMED → ใบที่ยังรอ IT (PENDING) มองไม่เห็น
   = โค้ดชุดเดียวกันถูกแจกซ้ำได้ (เคสจริง: CR-1026 ใช้โค้ดซ้ำใบ PENDING CR-1025 1,000 รหัส)
   ตอนนี้นับทุกใบทุกสถานะ (เว้นใบที่ยกเลิก/ลบ) + บัตรสมาชิก + ส่วนลดพนักงาน */
function issuedCodeMap(){
  const m=new Map();
  const put=(c,where)=>{ const u=String(cCode(c)).trim().toUpperCase(); if(u&&!m.has(u)) m.set(u,where); };
  loadReqs().forEach(r=>{
    if(!r || r.type==='REMOVE' || r.cancelled || r.deleted) return;
    const tag=(r.campaign||r.button||r.id||'—')+(r.status!=='CONFIRMED'?' · '+(r.status||'รอยืนยัน'):'');
    (r.codes||[]).forEach(c=>put(c,tag));
  });
  try{ const mc=JSON.parse(localStorage.getItem('pc_member_coupons')||'{}')||{};
    Object.keys(mc).forEach(k=>(mc[k]||[]).forEach(x=>put(x&&x.code,'บัตรสมาชิก '+k))); }catch(e){}
  try{ (JSON.parse(localStorage.getItem('pc_staff_discounts')||'[]')||[]).forEach(x=>put(x&&(x.code||x.typeCode),'ส่วนลดพนักงาน')); }catch(e){}
  return m;
}
function reviewAdd(area, raw){
  if(!raw.length){ area.innerHTML=''; M.review=null; mkSendState(); return; }
  const sysMap=issuedCodeMap();
  const seen={};
  const rows=raw.map(r=>{ const code=r.trim(); const up=code.toUpperCase(); const valid=CODE_RE.test(code);
    const dupBatch=!!seen[up]; seen[up]=true; const dupWhere=sysMap.get(up)||null; const dupSystem=!!dupWhere;
    return {code,valid,dupBatch,dupSystem,dupWhere,clean:valid&&!dupBatch&&!dupSystem}; });
  const nClean=rows.filter(r=>r.clean).length, nInvalid=rows.filter(r=>!r.valid).length, nDup=rows.filter(r=>r.valid&&(r.dupBatch||r.dupSystem)).length;
  M.review={rows, ok:nClean, problems:nInvalid+nDup};
  const cap=800; const body=rows.slice(0,cap).map(r=>{ let b;
    if(!r.valid) b='<span class="badge b-bad"><i class="fas fa-xmark"></i>format ผิด</span>';
    else if(r.dupSystem) b=`<span class="badge b-warn"><i class="fas fa-clone"></i>ซ้ำใน “${esc(r.dupWhere)}”</span>`;
    else if(r.dupBatch) b='<span class="badge b-warn"><i class="fas fa-clone"></i>ซ้ำในไฟล์นี้</span>';
    else b='<span class="badge b-ok"><i class="fas fa-check"></i>พร้อม</span>';
    return `<tr class="${r.clean?'':'bad'}"><td class="code">${esc(r.code)}</td><td>${b}</td></tr>`; }).join('');
  const more=rows.length>cap?`<div class="hint" style="padding:8px 10px">… แสดง ${cap} จาก ${rows.length} โค้ด</div>`:'';
  const dupRows=rows.filter(r=>r.valid&&(r.dupSystem||r.dupBatch));
  let dupDetail='';
  if(dupRows.length){ const items=dupRows.slice(0,12).map(r=>`<li><span class="mono">${esc(r.code)}</span> — ${r.dupSystem?`ซ้ำกับโปรฯ “<b>${esc(r.dupWhere)}</b>” ที่แนบไว้แล้ว`:'ซ้ำซ้อนในไฟล์ที่แนบ'}</li>`).join('');
    dupDetail=`<div class="lead-lock" style="display:block;color:#9a6700"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="fas fa-clone"></i><b>พบโค้ดซ้ำ ${dupRows.length} รายการ — แก้ไฟล์แล้วอัปใหม่</b></div><ul style="margin:0;padding-left:20px;line-height:1.6">${items}${dupRows.length>12?`<li>… และอีก ${dupRows.length-12} โค้ด</li>`:''}</ul></div>`; }
  const skipped=nInvalid+nDup;
  let banner;
  if(nClean>0 && skipped===0){
    banner=`<div class="found yes" style="margin-bottom:14px;padding:14px 16px"><div class="ftitle"><i class="fas fa-circle-check"></i>ผ่าน — ตรวจแล้วไม่มีโค้ดซ้ำ</div><div style="margin-top:6px;font-weight:700;color:#1d7a4d">ทั้งหมด ${nClean} โค้ด · พร้อมส่งให้ IT</div></div>`;
  } else if(nClean>0){
    banner=`<div class="found yes" style="margin-bottom:14px;padding:14px 16px"><div class="ftitle"><i class="fas fa-circle-check"></i>บันทึกได้ — จะเพิ่ม ${nClean} โค้ดที่ใช้ได้</div><div style="margin-top:6px;font-weight:700;color:#9a6700">ตัดออก ${skipped} โค้ด (ซ้ำ ${nDup} · format ผิด ${nInvalid}) — ระบบเพิ่มเฉพาะโค้ดที่ผ่านให้อัตโนมัติ</div></div>`;
  } else {
    banner=`<div class="found no" style="margin-bottom:14px;padding:14px 16px"><div class="ftitle"><i class="fas fa-circle-xmark"></i>ไม่มีโค้ดที่ใช้ได้</div><div style="margin-top:6px;font-weight:700;color:#c0392b">ทุกโค้ดซ้ำหรือ format ผิด — แก้ไฟล์แล้วอัปใหม่</div></div>`;
  }
  area.innerHTML=banner+`<div class="stats">
    <div class="stat blue"><div class="n">${rows.length}</div><div class="l">โค้ดทั้งหมด</div></div>
    <div class="stat ok"><div class="n">${nClean}</div><div class="l">เข้าระบบ</div></div>
    <div class="stat bad"><div class="n">${nInvalid}</div><div class="l">format ผิด · ตัดออก</div></div>
    <div class="stat warn"><div class="n">${nDup}</div><div class="l">ซ้ำ · ตัดออก</div></div></div>
    <div class="tblbox-wrap">${tblBlock(rows.length, `<table class="ctbl"><thead><tr><th>โค้ด</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table>${more}`)}</div>${dupDetail}
    ${routeBannerHTML('code_add_request', addTokens(nClean))}
    <div class="actbar" style="margin-top:14px"><button class="btn btn-g" id="btnConfirm" onclick="confirmAdd()"><i class="fas fa-paper-plane"></i>ยืนยัน + แจ้ง IT</button></div>`;
  mkSendState();
}
function reviewRemove(area, raw){
  if(!raw.length){ area.innerHTML=''; M.review=null; mkSendState(); return; }
  const sys=systemCodes(realCampaign()); const seen={};
  const rows=raw.map(r=>{ const code=r.trim(); const up=code.toUpperCase(); if(seen[up]) return null; seen[up]=true;
    const rec=sys.get(up); const found=!!rec; const redeemed=found&&rec.redeemed; return {code,found,redeemed,removable:found&&!redeemed}; }).filter(Boolean);
  const removable=rows.filter(r=>r.removable).length, notfound=rows.filter(r=>!r.found).length, redeemed=rows.filter(r=>r.redeemed).length;
  M.review={rows, removable, skipped:notfound+redeemed};
  const body=rows.slice(0,800).map(r=>{ let b; if(r.removable) b='<span class="badge b-ok"><i class="fas fa-check"></i>ลบได้</span>';
    else if(r.redeemed) b='<span class="badge b-bad"><i class="fas fa-ban"></i>Redeem แล้ว — ลบไม่ได้</span>';
    else b='<span class="badge b-warn"><i class="fas fa-question"></i>ไม่พบในระบบ</span>';
    return `<tr class="${r.removable?'':'bad'}"><td class="code">${esc(r.code)}</td><td>${b}</td></tr>`; }).join('');
  const warn=(notfound+redeemed)>0?`<div class="lead-lock"><i class="fas fa-circle-info"></i>จะลบเฉพาะ ${removable} โค้ดที่ยังไม่ Redeem · ข้าม ${redeemed} ที่ Redeem แล้ว และ ${notfound} ที่ไม่พบในระบบ</div>`:'';
  const passR=(removable>0)?`<div class="found yes" style="margin-bottom:14px;padding:14px 16px"><div class="ftitle"><i class="fas fa-circle-check"></i>ตรวจแล้ว — ลบได้ ${removable} โค้ด</div></div>`:'';
  area.innerHTML=passR+`<div class="stats">
    <div class="stat blue"><div class="n">${rows.length}</div><div class="l">โค้ดที่จะลบ</div></div>
    <div class="stat ok"><div class="n">${removable}</div><div class="l">ลบได้</div></div>
    <div class="stat bad"><div class="n">${redeemed}</div><div class="l">Redeem แล้ว</div></div>
    <div class="stat warn"><div class="n">${notfound}</div><div class="l">ไม่พบในระบบ</div></div></div>
    <div class="tblbox-wrap">${tblBlock(rows.length, `<table class="ctbl"><thead><tr><th>โค้ด</th><th>สถานะ</th></tr></thead><tbody>${body}</tbody></table>`)}</div>${warn}
    ${routeBannerHTML('code_remove_request', rmTokens(removable, notfound+redeemed))}
    <div class="actbar" style="margin-top:14px"><button class="btn btn-r" id="btnConfirm" onclick="confirmRemove()"><i class="fas fa-trash-can"></i>ยืนยันลบ + แจ้ง IT</button></div>`;
  mkSendState();
}

/* ---- confirm ---- */
function fireNotif(key, tok, title, req){ Swal.fire({icon:'success', title:title||'ส่งแล้ว', width:560,
  html:`เลขที่คำขอ <b>${esc(req.id)}</b><div style="text-align:left;margin-top:10px">${routeBannerHTML(key,tok)}</div>`, confirmButtonColor:'#2e934a', confirmButtonText:'เรียบร้อย'}); }
function confirmAdd(){ if(SENDING) return; if(!canConfirm()) return; const skip=(M.review&&M.review.problems)||0;
  Swal.fire({icon:'question', title:'ยืนยันส่งให้ IT?', html:`เพิ่มโค้ด <b>${M.review.ok}</b> โค้ด — “${esc(realCampaign())}”${skip>0?`<br><span style="color:#9a6700;font-size:13px">ตัดโค้ดซ้ำ/format ผิดออก ${skip} โค้ด</span>`:''}<br><span style="color:#c0392b;font-size:13px">หลังยืนยันแก้ไขไม่ได้ ต้องลบแล้วอัปใหม่</span>`, showCancelButton:true, confirmButtonColor:'#2e934a', confirmButtonText:'ยืนยัน + แจ้ง IT', cancelButtonText:'ยกเลิก'}).then(res=>{
    if(!res.isConfirmed) return; if(SENDING) return; const k=kindOf(M.kind); const c=campOf(realCampaign())||campLookup(realCampaign())||btnCamp(M.button)||{};
    const campName=realCampaign()||c.name||'';
    const codes=M.review.rows.filter(r=>r.clean).map(r=>r.code);
    const isMember=!!(k&&k.short==='member');
    if(recentDup('ADD', campName, M.button||'', codes.length)){ Swal.fire({icon:'info', iconColor:'#946200', title:'คำขอนี้ส่งไปแล้ว', html:`“${esc(campName)}” ${codes.length} โค้ด อยู่ในคิวงาน IT แล้ว<br><span style="color:#6b7280;font-size:13px">ไม่ต้องกดยืนยันซ้ำ — ดูที่แท็บติดตามสถานะ</span>`, confirmButtonColor:'#2e934a' }); M.parsed=null; M.fileName=''; M.rawText=''; renderMKT(); return; }
    lockConfirmBtn();
    let memberRows=null;
    if(isMember && M.memberMap){ memberRows=M.review.rows.filter(r=>r.clean).map(r=>{ const m=M.memberMap.get(String(r.code).toUpperCase())||{}; return {code:r.code, name:m.name||'', memberNo:m.memberNo||'', idCard:m.idCard||'', typeCode:m.typeCode||'', expire:m.expire||''}; }); }
    const req={ id:nextId(), type:'ADD', kind:M.kind, proStatus:k.status, kindShort:k.short, campaign:campName, button:M.button||'', promoCode:(isMember?'':genPromo(c)), start:c.start||'', end:c.end||M.proExpire, proExpire:M.proExpire, startDate:M.startDate, codes, count:codes.length, reporter:reporter(), status:'CONFIRMED', itStatus:'PENDING', createdAt:Date.now(), memberRows, memberTypeCode:(isMember?(M.memberTypeCode||M.button||''):undefined), source:(isMember?(CATEGORY==='staff'?'staff_discount':'card'):undefined), voucherCat:(M.voucherCat||'') };
    const all=loadReqs(); all.unshift(req);
    if(!saveReqs(all)){ unlockConfirmBtn(); Swal.fire({icon:'error', title:'พื้นที่จัดเก็บไม่พอ', html:`โค้ดจำนวน <b>${codes.length.toLocaleString()}</b> โค้ด มากเกินกว่าที่เบราว์เซอร์จะเก็บได้ในระบบเดโมนี้<br><span style="color:#c0392b;font-size:13px">ลองแบ่งเป็นหลายไฟล์แล้วส่งทีละชุด</span>`, confirmButtonColor:'#c0392b' }); return; }
    const _extOk=commitPendingExtend(realCampaign());
    fireNotif('code_add_request', addTokens(codes.length), _extOk?'ขยายเวลา + เพิ่มโค้ดสำเร็จ — แจ้ง IT':'ยืนยันแล้ว — แจ้ง IT', req);
    try{ var _N=(window.PC_notify||(window.top&&window.top.PC_notify)); if(_N){ var _evk=isMember?(CATEGORY==='staff'?'staff_discount_request':'card_request'):'code_add_request'; var _lbl=isMember?(CATEGORY==='staff'?'ขอรหัสส่วนลดพนักงาน':'ขอออกบัตรสมาชิก'):'แจ้งเพิ่มโค้ดเข้าระบบ'; _N(_evk, { text:_lbl+' “'+realCampaign()+'” '+codes.length+' รายการ — รอ IT ดำเนินการ' }); } }catch(e){}
    M.parsed=null; M.fileName=''; M.rawText=''; SENDING=false; renderMKT(); }); }
/* commit การขยายที่ค้างไว้ (atomic): เรียกเมื่อ "แนบโค้ด + ส่ง IT" สำเร็จ → การขยายถึงจะมีผลจริง (กัน user ลืมแนบโค้ด) */
function pendingExtend(){ try{ return JSON.parse(localStorage.getItem('pc_pending_extend')||'null'); }catch(e){ return null; } }
function commitPendingExtend(campaign){
  const p=pendingExtend(); if(!p || p.campaign!==campaign) return false;
  try{
    const API=(window.parent&&window.parent.PC_API)||window.PC_API;
    if(API&&API.extendCampaign) API.extendCampaign(p.campaign, p.newEnd, p.note||'');
  }catch(e){}
  try{ localStorage.removeItem('pc_pending_extend'); }catch(e){}
  try{ if(window.parent) window.parent.__leaveGuard=null; }catch(e){}
  return true;
}
function confirmRemove(){ if(SENDING) return; if(!canConfirm()) return; const removable=M.review.rows.filter(r=>r.removable).map(r=>r.code); const skip=M.review.skipped;
  Swal.fire({icon:'question', title:'ยืนยันลบโค้ด?', html:`ลบ <b>${removable.length}</b> โค้ด — “${esc(realCampaign())}”<br><span style="color:#c0392b;font-size:13px">หลังยืนยันแก้ไขไม่ได้ ต้องลบคำขอแล้วทำใหม่</span>`, showCancelButton:true, confirmButtonColor:'#c0392b', confirmButtonText:'ยืนยันลบ + แจ้ง IT', cancelButtonText:'ยกเลิก'}).then(res=>{
    if(!res.isConfirmed) return; if(SENDING) return;
    if(recentDup('REMOVE', realCampaign(), '', removable.length)){ Swal.fire({icon:'info', iconColor:'#946200', title:'คำขอนี้ส่งไปแล้ว', html:'ดูที่แท็บติดตามสถานะ', confirmButtonColor:'#2e934a' }); M.parsed=null; M.fileName=''; M.rawText=''; renderMKT(); return; }
    lockConfirmBtn('กำลังลบ…'); let all=loadReqs(); const up=new Set(removable.map(c=>c.toUpperCase()));
    all.forEach(r=>{ if(r.type==='ADD'&&r.campaign===realCampaign()&&r.status==='CONFIRMED'){ r.codes=(r.codes||[]).filter(c=>!up.has(String(cCode(c)).toUpperCase())); r.count=r.codes.length; } });
    const c=campOf(realCampaign())||{};
    const req={ id:nextId(), type:'REMOVE', campaign:realCampaign(), button:c.button||'', promoCode:genPromo(c), proExpire:c.end||'', codes:removable.slice(), count:removable.length, skipped:skip, reporter:reporter(), status:'CONFIRMED', itStatus:'PENDING', createdAt:Date.now() };
    all.unshift(req); saveReqs(all);
    fireNotif('code_remove_request', rmTokens(removable.length, skip), 'ยืนยันแล้ว — แจ้ง IT', req);
    M.parsed=null; M.fileName=''; M.rawText=''; SENDING=false; renderMKT(); }); }

/* ---- my requests ---- */
function renderMyReqs(){ const el=document.getElementById('myReqs'); if(!el) return;
  let mine=loadReqs().filter(r=>(r.type==='ADD'||r.type==='REMOVE')).filter(inCat);
  if(TR.status==='pending') mine=mine.filter(r=>r.itStatus==='PENDING');
  else if(TR.status==='progress') mine=mine.filter(r=>r.itStatus==='DOWNLOADED');
  else if(TR.status==='done') mine=mine.filter(r=>r.itStatus==='DONE');
  if(TR.type==='add') mine=mine.filter(r=>r.type==='ADD');
  else if(TR.type==='remove') mine=mine.filter(r=>r.type==='REMOVE');
  const q=(TR.q||'').trim().toLowerCase();
  if(q) mine=mine.filter(r=> [r.id,r.campaign,r.button,r.reporter,r.kind].some(x=>String(x||'').toLowerCase().includes(q)) || (Array.isArray(r.codes)&&r.codes.some(c=>String((c&&c.code)||c||'').toLowerCase()===q)) );
  el.innerHTML=mine.length
    ? (TR.view==='card'
        ? mine.map(reqCardMKT).join('')
        : `<style id="trkTblCss">.trk-tbl{width:100%;border-collapse:collapse;font-size:.85rem}.trk-tbl thead th{background:var(--pc-black,#1a1d20);color:#fff;font-weight:600;text-align:left;padding:9px 12px;font-size:.74rem;white-space:nowrap;position:sticky;top:0;z-index:2}.trk-tbl tbody td{padding:8px 12px;border-top:1px solid #eef1f4;vertical-align:middle}.trk-tbl tbody tr:hover{background:#fafbfc}.trk-tbl .reqid{font-family:'JetBrains Mono',monospace;font-size:.8rem;color:#5a616b}.trk-tbl-wrap{border:1px solid #e7eaee;border-radius:12px;overflow:auto;max-height:620px}</style>`
          + `<div class="trk-tbl-wrap"><table class="trk-tbl"><thead><tr><th>เลขคำขอ</th><th>ชื่อ / ประเภทบัตร</th><th>ปุ่ม/โค้ด</th><th>ประเภท</th><th style="text-align:center">จำนวน</th><th>สถานะ</th><th>ผู้แจ้ง / วันที่</th><th></th></tr></thead><tbody>${mine.map(reqRowMKT).join('')}</tbody></table></div>`)
    : `<div class="empty"><i class="fas fa-inbox"></i>${q?'ไม่พบคำขอที่ตรงกับ “'+esc(TR.q)+'”':'ยังไม่มีคำขอในมุมมองนี้'}</div>`; }
function trStatusBadge(r){ const st=r.itStatus;
  const sm = st==='DONE' ? ['done','fa-circle-check', (r.type==='ADD'?'เสร็จ · พร้อมใช้':'เสร็จ · ลบแล้ว')] : (st==='DOWNLOADED' ? ['pending','fa-download','IT โหลดแล้ว'] : ['pending','fa-hourglass-half','รอ IT']);
  return `<span class="pill ${sm[0]}"><i class="fas ${sm[1]}" style="margin-right:5px"></i>${sm[2]}</span>`; }
function reqRowMKT(r){ const isAdd=r.type==='ADD'; const isMem=(r.kindShort==='member');
  const isComp=(r.source==='comp'||r.kindShort==='comp');
  const compVc=isComp?(r.promoCode||r.vcCode||compVcOf(r.button)||''):'';
  const codeCol = isMem ? (r.memberTypeCode||r.button||'—')
    : (isComp ? (compVc ? compVc+' · '+esc(r.button||'') : (r.button||'—')) : (r.button||'—'));
  const kindCol = isComp ? ('Voucher online (Comp'+(r.compYear?' '+r.compYear:'')+')') : (r.kind||'—');
  const act = r.itStatus==='PENDING'
    ? `<button class="btn btn-o btn-sm" onclick="delReq('${r.id}')"><i class="fas fa-xmark"></i>ยกเลิก</button>`
    : `<span class="mtag" style="background:#eaf4ee;color:#9a6700"><i class="fas fa-lock" style="color:#c9870a"></i>ล็อก</span>`;
  return `<tr>
    <td><span class="reqid">${esc(r.id)}</span></td>
    <td><div style="font-weight:600;font-family:'Kanit',sans-serif">${esc(r.campaign||'—')}</div><span class="pill ${isAdd?'add':'rm'}" style="font-size:.64rem">${r.crmSetup?'ตั้งค่า CRM':((isAdd?'เพิ่ม':'ลบ')+' '+(r.count||0)+' โค้ด')}</span></td>
    <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem">${esc(codeCol)}</td>
    <td style="font-size:.8rem">${esc(kindCol)}</td>
    <td style="text-align:center">${r.count||0}</td>
    <td>${trStatusBadge(r)}</td>
    <td style="white-space:nowrap"><div style="font-size:.82rem">${esc(r.reporter||'—')}</div><div style="color:#9aa1aa;font-size:.74rem">${fmtDT(r.createdAt)}</div></td>
    <td style="text-align:right;white-space:nowrap">${act}</td>
  </tr>`; }
function reqCardMKT(r){ const isAdd=r.type==='ADD'; const st=r.itStatus;
  const sm = st==='DONE' ? ['done','fa-circle-check', isAdd?'เสร็จ · พร้อมใช้งาน':'เสร็จ · ลบแล้ว'] : (st==='DOWNLOADED' ? ['pending','fa-download','IT โหลดไฟล์แล้ว'] : ['pending','fa-hourglass-half','รอ IT รับเรื่อง']);
  const cls2=(st==='DOWNLOADED'||st==='DONE')?'done':'active';
  const cls3=(st==='DONE')?'done':((st==='DOWNLOADED')?'active':'');
  const steps=`<div class="steps">
    <div class="stp done"><div class="dot"><i class="fas fa-check"></i></div><div class="slbl">ส่งให้ IT แล้ว</div></div>
    <div class="stp ${cls2}"><div class="dot">${cls2==='done'?'<i class="fas fa-check"></i>':'<i class="fas fa-download"></i>'}</div><div class="slbl">${r.crmSetup?'IT ตั้งค่า POS':'IT โหลดไฟล์'}</div></div>
    <div class="stp ${cls3}"><div class="dot">${cls3==='done'?'<i class="fas fa-check"></i>':'<i class="fas fa-database"></i>'}</div><div class="slbl">${isAdd?'เพิ่มเข้าระบบ':'ลบออกจากระบบ'}</div></div>
  </div>`;
  const meta = isAdd
    ? `${vTagHTML(r)}${(r.source==='comp'||r.kindShort==='comp')?`<span class="mtag" style="background:#f3eefe;color:#7a3ea8"><i class="fas fa-ticket"></i>${esc(r.promoCode||r.vcCode||compVcOf(r.button)||'ยังไม่ผูกโค้ด Voucher')}</span>`:''}<span class="mtag"><i class="fas fa-hand-pointer"></i>${esc(r.button||'—')}</span><span class="mtag"><i class="fas fa-tag"></i>${esc((r.source==='comp'||r.kindShort==='comp')?('Voucher online (Comp'+(r.compYear?' '+r.compYear:'')+')'):r.kind)}</span><span class="mtag"><i class="fas fa-calendar-day"></i>เริ่ม ${fmtDate(r.startDate)}</span><span class="mtag"><i class="fas fa-hourglass-end"></i>หมด ${fmtDate(r.proExpire)}</span>${r.customerGroup==='crm'?'<span class="mtag" style="background:#eafaf1;color:#15623c"><i class="fas fa-user-check"></i> ลูกค้า CRM</span>':''}`
    : `<span class="mtag"><i class="fas fa-hand-pointer"></i>${esc(r.button||'—')}</span><span class="mtag"><i class="fas fa-forward"></i>ข้าม redeem/ไม่พบ ${r.skipped||0}</span>`;
  const track=`<div class="rmeta" style="margin-top:9px;border-top:1px dashed #eef1f4;padding-top:10px"><span class="mtag"><i class="fas fa-user"></i>ผู้แจ้ง ${esc(r.reporter||'—')}</span><span class="mtag"><i class="fas fa-paper-plane"></i>แจ้ง ${fmtDT(r.createdAt)}</span>${r.doneAt?`<span class="mtag" style="background:#eafaf1;color:#1d7a4d"><i class="fas fa-circle-check" style="color:#54b585"></i>เข้าระบบ ${fmtDT(r.doneAt)}</span>`:''}</div>`;
  return `<div class="reqcard locked"><div class="rtop"><div style="flex:1">
    <div class="rnm">${esc(r.campaign)} <span class="pill ${isAdd?'add':'rm'}">${r.crmSetup?'ตั้งค่า CRM':((isAdd?'เพิ่ม':'ลบ')+' '+r.count+' โค้ด')}</span> <span class="reqid">${esc(r.id)}</span></div>
    <div class="rmeta">${meta}</div></div>
    <div><span class="pill ${sm[0]}"><i class="fas ${sm[1]}" style="margin-right:5px"></i>${sm[2]}</span></div></div>
    ${steps}${track}
    <div class="racts">${r.itStatus==='PENDING'
      ? `<span class="mtag"><i class="fas fa-clock"></i>IT ยังไม่รับเรื่อง</span><button class="btn btn-o btn-sm" onclick="delReq('${r.id}')"><i class="fas fa-xmark"></i>ยกเลิกคำขอ</button>`
      : `<span class="mtag" style="background:#eaf4ee;color:#9a6700"><i class="fas fa-lock" style="color:#c9870a"></i>IT ดำเนินการแล้ว — ยกเลิกไม่ได้</span>`}</div></div>`; }
function delReq(id){ Swal.fire({icon:'warning', title:'ลบคำขอนี้?', text:'การเปลี่ยนแปลงโค้ดของคำขอนี้จะถูกย้อนกลับ', showCancelButton:true, confirmButtonColor:'#c0392b', confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก'}).then(res=>{
    if(!res.isConfirmed) return; let all=loadReqs(); const r=all.find(x=>x.id===id); if(!r){ render(); return; }
    if(r.type==='REMOVE'){ const tgt=all.find(x=>x.type==='ADD'&&x.campaign===r.campaign&&x.status==='CONFIRMED'); if(tgt){ const have=new Set((tgt.codes||[]).map(c=>String(cCode(c)).toUpperCase())); (r.codes||[]).forEach(c=>{ const cd=cCode(c); const u=String(cd).toUpperCase(); if(!have.has(u)){ tgt.codes.push(cd); have.add(u);} }); tgt.count=tgt.codes.length; } }
    all=all.filter(x=>x.id!==id); saveReqs(all); render(); }); }

/* ---------- branch code tickets (pc_branch_tickets) ---------- */
const BVT_KEY='pc_branch_tickets';
function loadBVT(){ try{ return JSON.parse(localStorage.getItem(BVT_KEY))||[]; }catch(e){ return []; } }
function saveBVT(a){ localStorage.setItem(BVT_KEY, JSON.stringify(a)); }
function nextBVT(a){ let m=1000; a.forEach(t=>{ const n=parseInt(String(t.id||'').replace(/\D/g,'')); if(n>m) m=n; }); return 'BVT-'+(m+1); }
function ensureBRDemo(){ if(localStorage.getItem('pc_code_brdemo_ver')==='4') return;
  // clean slate: ลบเคสแจ้งโค้ดสาขา demo (สมหญิง รักดี) — ไม่ seed เคสปลอม
  const all=loadBVT().filter(t=>!(t && t.source==='code' && t.reporter==='สมหญิง รักดี (50231)'));
  saveBVT(all);
  localStorage.setItem('pc_code_brdemo_ver','4');
}
/* (ปิดการลบแล้ว) เดิมล้างเคสบัตร demo — แต่มันลบ "คำขอบัตรสมาชิกจริง" ทิ้งด้วย และรันซ้ำทุกครั้งที่ ver ถูกบั๊มพ์ตอน deploy → งานบัตรหาย · คงไว้เป็น no-op */
function ensureMemberCardDemo(){ try{ localStorage.setItem('pc_card_demo_ver','3'); }catch(e){} }

/* ===================== IT ===================== */
let ITF='pending', ITTAB='code', ITYPE='all';
function renderIT(){
  const reqs=loadReqs().filter(r=>(r.type==='ADD'||r.type==='REMOVE')).filter(inCat);
  const reports=loadBVT().filter(t=>t.source==='code');
  const cnt=n=>`<span class="seg-n">${n}</span>`;
  const penCode=reqs.filter(r=>r.itStatus!=='DONE').length;
  const penRep=reports.filter(t=>t.status==='OPEN'||t.status==='PROGRESS').length;
  const top=`<div class="seg seg-top">
    <button class="${ITTAB==='code'?'on':''}" onclick="ITTAB='code'; renderIT()"><i class="fas fa-cloud-arrow-down"></i>งานโค้ด ${cnt(penCode)}</button>
    <button class="${ITTAB==='branch'?'on':''}" onclick="ITTAB='branch'; renderIT()"><i class="fas fa-triangle-exclamation"></i>แจ้งจากสาขา ${cnt(penRep)}</button>
  </div>`;
  let body;
  if(ITTAB==='code'){
    const f=ITF; const base=reqs.filter(r=> f==='all'||(f==='pending'&&r.itStatus!=='DONE')||(f==='done'&&r.itStatus==='DONE'));
    const done=reqs.filter(r=>r.itStatus==='DONE').length;
    const addN=base.filter(r=>r.type==='ADD').length, rmN=base.filter(r=>r.type==='REMOVE').length;
    const list=ITYPE==='add'?base.filter(r=>r.type==='ADD'):(ITYPE==='remove'?base.filter(r=>r.type==='REMOVE'):base);
    body=`<div class="card"><h2><i class="fas fa-cloud-arrow-down"></i>คิวงานโค้ด — Code Promotion + ไฟล์ Backoffice</h2>
      <p class="sub">ข้อมูลตรงกับตาราง IT Settlement (<b>Type Promo · Code Promotion · Short Name</b>) · ProID ที่แนบมาอยู่ในไฟล์ดาวน์โหลด (ProID / ProStatus / ProExpire) นำไปอัป Backoffice · งานที่ยืนยันเสร็จจะย้ายไปแท็บ “เสร็จแล้ว”</p>
      <div class="fltbar"><span class="fltlbl"><i class="fas fa-circle-half-stroke"></i> สถานะงาน</span>
      ${dupBannerHTML(reqs)}
      <div class="seg" style="margin-bottom:0">
        <button class="${f==='pending'?'on':''}" onclick="ITF='pending'; renderIT()"><i class="fas fa-hourglass-half"></i>รอทำ ${cnt(penCode)}</button>
        <button class="${f==='done'?'on':''}" onclick="ITF='done'; renderIT()"><i class="fas fa-circle-check"></i>เสร็จแล้ว ${cnt(done)}</button>
        <button class="${f==='all'?'on':''}" onclick="ITF='all'; renderIT()"><i class="fas fa-layer-group"></i>ทั้งหมด ${cnt(reqs.length)}</button>
      </div></div>
      <div class="fltbar"><span class="fltlbl"><i class="fas fa-filter"></i> ประเภทคำขอ</span>
      <div class="typefilter" style="margin:0">
        <button class="tchip ${ITYPE==='all'?'on':''}" onclick="ITYPE='all'; renderIT()">ทั้งหมด ${base.length}</button>
        <button class="tchip add ${ITYPE==='add'?'on':''}" onclick="ITYPE='add'; renderIT()"><i class="fas fa-plus"></i> เฉพาะเพิ่ม ${addN}</button>
        <button class="tchip rm ${ITYPE==='remove'?'on':''}" onclick="ITYPE='remove'; renderIT()"><i class="fas fa-trash-can"></i> เฉพาะลบ ${rmN}</button>
      </div></div>
      ${list.length?list.map(reqCardIT).join(''):`<div class="empty"><i class="fas fa-mug-hot"></i>${f==='done'?'ยังไม่มีงานที่เสร็จ':(f==='pending'?'ไม่มีงานค้าง — เคลียร์หมดแล้ว 🎉':'ยังไม่มีงาน')}</div>`}
    </div>`;
  } else {
    body=`<div class="card"><h2><i class="fas fa-triangle-exclamation"></i>แจ้งจากสาขา — โค้ดใช้ไม่ได้ที่ POS</h2>
      <p class="sub">เรื่องที่สาขาแจ้งว่าโค้ดใช้ไม่ได้ที่หน้า POS · ไหลเข้าระบบ Ticket แจ้งปัญหาสาขา · งานค้าง ${penRep}</p>
      ${reports.length?reports.map(reportCardIT).join(''):'<div class="empty"><i class="fas fa-circle-check"></i>ยังไม่มีเรื่องแจ้งจากสาขา</div>'}
    </div>`;
  }
  document.getElementById('view').innerHTML = top + body;
}
function reqCardIT(r){ const isAdd=r.type==='ADD';
  const status=r.itStatus==='DONE'?`<span class="pill done">เพิ่ม/ลบเข้าระบบแล้ว</span>`:(r.itStatus==='DOWNLOADED'?'<span class="pill pending">โหลดแล้ว · รอยืนยันเสร็จ</span>':'<span class="pill pending">รอดำเนินการ</span>');
  const ko=kindOf(r.kind)||(campOf(r.campaign)?kindOf(campOf(r.campaign).kind):null)||{};
  const typePromo=ko.typePromo||r.kind||'—';
  const codePromo=ko.codePromo||'Online';
  const proStatus=isAdd?esc(r.proStatus):'Delete';
  const _shortNm = r.shortName || ((r.button && String(r.button).trim() && String(r.button).trim() !== String(r.promoCode||'').trim()) ? r.button : (r.campaign||''));
  const isMemberCard = (r.kindShort==='member');
  const isStaffCard = isMemberCard && (r.source==='staff_discount' || /^ST/i.test(String(r.memberTypeCode||r.button||'')));
  const typeCodeVal = r.memberTypeCode || r.button || '';
  const cmpos= isMemberCard ? `<div class="cmpos-strip">
    <div class="cmpos-fld promo"><div class="k"><i class="fas fa-id-card"></i> ${isStaffCard?'รหัสประเภท (Type Code)':'Member Type Code'}</div>
      <div class="v copy" onclick="copyPromo(this,'${esc(typeCodeVal)}')">${esc(typeCodeVal||'—')}<i class="far fa-copy"></i></div></div>
    <div class="cmpos-fld"><div class="k">${isStaffCard?'ประเภทส่วนลดพนักงาน':'ชื่อบัตร'}</div>
      <div class="v" style="font-family:'Kanit',sans-serif;font-size:.9rem;font-weight:600">${esc(r.campaign||'—')}</div></div>
  </div>` : `<div class="cmpos-strip">
    <div class="cmpos-fld promo"><div class="k"><i class="fas fa-tag"></i> Code Promotion</div>
      <div class="v copy" onclick="copyPromo(this,'${esc(r.promoCode||'')}')">${esc(r.promoCode||'—')}<i class="far fa-copy"></i></div></div>
    <div class="cmpos-fld"><div class="k">ชื่อปุ่มโปร (Short Name)</div>
      <div class="v copy" onclick="copyPromo(this,'${esc(_shortNm)}')">${esc(_shortNm||'—')}<i class="far fa-copy"></i></div></div>
    <div class="cmpos-fld"><div class="k">ชื่อแคมเปญ</div>
      <div class="v" style="font-family:'Kanit',sans-serif;font-size:.9rem;font-weight:600">${esc(r.campaign||'—')}</div></div>
  </div>`;
  const footer=`<div class="rmeta metafoot" style="margin-top:13px">${vTagHTML(r)}<span class="mtag"><i class="fas fa-calendar-day"></i>วันที่เริ่ม ${fmtDate(r.startDate)}</span><span class="mtag"><i class="fas fa-calendar-xmark"></i>วันหมดอายุ ${esc(r.proExpire||r.end||'—')}</span><span class="mtag"><i class="fas fa-file-lines"></i>ไฟล์ ${r.count} โค้ด</span><span class="mtag"><i class="fas fa-user"></i>ผู้ขอ ${esc(r.reporter||'—')}</span>${r.doneAt?`<span class="mtag" style="background:#eafaf1;color:#1d7a4d"><i class="fas fa-circle-check" style="color:#54b585"></i>เข้าระบบ ${fmtDT(r.doneAt)}</span>`:''}</div>`;
  const nameCap = r.kindShort==='member' ? (r.source==='staff_discount'?'ประเภทส่วนลดพนักงาน':'ประเภทบัตร') : 'ชื่อแคมเปญ';
  return `<div class="reqcard"><div class="rtop"><div style="flex:1">
    <div class="rnm-cap">${nameCap}</div>
    <div class="rnm">${esc(r.campaign)} <span class="pill ${isAdd?'add':'rm'}">${r.crmSetup?'ตั้งค่า CRM':((isAdd?'เพิ่ม':'ลบ')+' '+r.count+' โค้ด')}</span> <span class="reqid">${esc(r.id)}</span></div></div>
    <div>${status}</div></div>
    ${cmpos}${r.kindShort==='member'?memberCouponBox(r):''}${footer}
    <div class="racts" style="margin-top:14px;border-top:1px solid #f1f4f7;padding-top:13px">${r.crmSetup?`<span class="mtag" style="background:#eafaf1;color:#15623c"><i class="fas fa-user-check"></i> CRM · ตั้งค่าให้ POS (ไม่มีไฟล์โค้ด · interface ระบบสมาชิก)</span>`:`<button class="btn btn-d btn-sm" onclick="itDownload('${r.id}')"><i class="fas fa-download"></i>Download ไฟล์โค้ด (.xlsx)</button>`}
      ${r.itStatus!=='DONE'?`<button class="btn btn-g btn-sm" onclick="itDone('${r.id}')"><i class="fas fa-check"></i>${r.crmSetup?'ยืนยันตั้งค่าเสร็จ':'ยืนยัน+แจ้งเตือน'}</button>`:''}</div></div>`; }
/* ===== member coupon binding (IT บันทึก Code coupon / Coupon name ที่สร้างใน Backoffice ผูกกับ Type บัตร) ===== */
function memberCouponKey(r){ return 'T:'+String(r.memberTypeCode||r.button||r.campaign||'').toUpperCase(); }
function loadCoupons(){ try{ return JSON.parse(localStorage.getItem('pc_member_coupons'))||{}; }catch(e){ return {}; } }
function saveCoupons(o){ try{ localStorage.setItem('pc_member_coupons', JSON.stringify(o)); }catch(e){} }
function couponsFor(r){ return loadCoupons()[memberCouponKey(r)]||[]; }
/* seed คูปองจริงที่ผูกกับบัตร (data/member-card-coupons.js) — map card → Member Type code */
var CARD_TYPECODE={ PTN:'VIP04', GLD:'VIP03', GRN:'VIP08', BLK:'VIP05' };
function seedCouponsFor(r){ const key=memberCouponKey(r); const out=[];
  (window.PC_MEMBER_CARD_COUPONS||[]).forEach(function(b){ const tc=CARD_TYPECODE[String(b.card||'').toUpperCase()];
    if(tc && ('T:'+tc)===key) out.push({ id:'seed-'+b.code, codeCoupon:b.code, name:b.campaign||b.product||'', kind:'coupon', _seed:true }); });
  return out; }
var COUP_KB={ coupon:['#2c4a82','#eef4ff','Item Coupon'], bill:['#1d7a4d','#eafaf1','Bill Discount'], voucher:['#7a3ea8','#f3eefe','Voucher'] };
function kindBadge(k){ var b=COUP_KB[k]||COUP_KB.coupon; return '<span style="font-size:.63rem;font-weight:700;background:'+b[1]+';color:'+b[0]+';border-radius:5px;padding:1px 6px;white-space:nowrap;margin-right:6px">'+b[2]+'</span>'; }
function memberCouponBox(r){ const seed=seedCouponsFor(r); const manual=couponsFor(r); const list=seed.concat(manual);
  const isStaff=/^ST/i.test(String(r.memberTypeCode||r.button||''));
  const seedBadge='<span style="font-size:.66rem;font-weight:700;background:#eef4ff;color:#2c4a82;border:1px solid #cfe0fb;border-radius:6px;padding:2px 7px;white-space:nowrap"><i class="fas fa-link"></i> Backoffice</span>';
  const rows = list.length ? list.map(c=> c._seed
      ? `<div class="cprow"><span class="cpcode" title="คัดลอก" onclick="copyPromo(this,'${esc(c.codeCoupon)}')">${esc(c.codeCoupon)}<i class="far fa-copy"></i></span><span class="cpname">${kindBadge(c.kind)}${esc(c.name)}</span><span class="cpacts">${seedBadge}</span></div>`
      : `<div class="cprow"><span class="cpcode" title="คัดลอก" onclick="copyPromo(this,'${esc(c.codeCoupon)}')">${esc(c.codeCoupon)}<i class="far fa-copy"></i></span><span class="cpname">${kindBadge(c.kind)}${esc(c.name)}</span><span class="cpacts"><button title="แก้ไข" onclick="itEditCoupon('${r.id}','${c.id}')"><i class="fas fa-pen"></i></button><button title="ลบ" onclick="itDelCoupon('${r.id}','${c.id}')"><i class="fas fa-trash"></i></button></span></div>`).join('')
    : `<div class="cpempty">ยังไม่ได้ผูกสิทธิ์ — กด “เพิ่มสิทธิ์” เพื่อผูก Item Coupon / Bill Discount / Voucher เข้ากับ${isStaff?'ประเภทพนักงาน':'บัตร'}นี้</div>`;
  return `<div class="cpbox"><div class="cphead"><span class="ttl"><i class="fas fa-ticket"></i>สิทธิ์ที่ผูกกับ${isStaff?'ส่วนลดพนักงาน':'บัตร'} (คูปอง / Bill Discount)${(r.memberTypeCode||r.button)?` · Type ${esc(r.memberTypeCode||r.button)}`:''}</span><button class="cpadd" onclick="itAddCoupon('${r.id}')"><i class="fas fa-plus"></i>เพิ่มสิทธิ์</button></div><div class="cplist">${rows}</div></div>`; }
function couponPrompt(title, init){ init=init||{}; var kk=init.kind||'coupon'; return Swal.fire({ title, width:470, html:`<div style="text-align:left;font-size:14px">
    <label style="font-weight:600;display:block;margin:2px 0 4px">ประเภทสิทธิ์ <span style="color:#c0392b">*</span></label>
    <select id="cpK" class="swal2-input" style="margin:0 0 10px;width:100%"><option value="coupon"${kk==='coupon'?' selected':''}>Item Coupon (คูปองสินค้า)</option><option value="bill"${kk==='bill'?' selected':''}>Bill Discount (ส่วนลดบิล)</option><option value="voucher"${kk==='voucher'?' selected':''}>Voucher</option></select>
    <label style="font-weight:600;display:block;margin:2px 0 4px">Code (Coupon / Discount) <span style="color:#c0392b">*</span></label>
    <input id="cpC" class="swal2-input" style="margin:0 0 10px;width:100%;font-family:'JetBrains Mono',monospace" placeholder="เช่น 1082345" value="${esc(init.codeCoupon||'')}">
    <label style="font-weight:600;display:block;margin:2px 0 4px">ชื่อ (Coupon / Discount name) <span style="color:#c0392b">*</span></label>
    <input id="cpN" class="swal2-input" style="margin:0;width:100%" placeholder="เช่น Platinum - Giga FF" value="${esc(init.name||'')}"></div>`,
    showCancelButton:true, confirmButtonColor:'#2e934a', confirmButtonText:'บันทึก', cancelButtonText:'ยกเลิก',
    preConfirm:()=>{ const c=(document.getElementById('cpC').value||'').trim(), n=(document.getElementById('cpN').value||'').trim(), k=(document.getElementById('cpK').value||'coupon'); if(!c||!n){ Swal.showValidationMessage('กรอก Code และชื่อ'); return false; } return {codeCoupon:c, name:n, kind:k}; } }); }
function itAddCoupon(id){ const r=loadReqs().find(x=>x.id===id); if(!r) return; couponPrompt('เพิ่มสิทธิ์ที่ผูกกับประเภท').then(res=>{ if(!res.isConfirmed) return; const o=loadCoupons(), k=memberCouponKey(r); (o[k]=o[k]||[]).push({id:'cp'+Date.now().toString(36), ...res.value}); saveCoupons(o); renderIT();
  try{ var _N=(window.PC_notify||(window.top&&window.top.PC_notify)); if(_N){ var _st=/^ST/i.test(String(r.memberTypeCode||r.button||'')); _N(_st?'staff_discount_ready':'card_approved', { text:(_st?'ผูกสิทธิ์ส่วนลดพนักงาน':'ผูกสิทธิ์บัตรสมาชิก')+' “'+String(r.campaign||r.button||'')+'” เสร็จ — โค้ด '+String(res.value.codeCoupon||'')+' ('+String(res.value.name||'')+') พร้อมใช้งาน' }); } }catch(e){} }); }
function itEditCoupon(id,cid){ const r=loadReqs().find(x=>x.id===id); if(!r) return; const o=loadCoupons(), k=memberCouponKey(r); const c=(o[k]||[]).find(x=>x.id===cid); if(!c) return; couponPrompt('แก้ไขคูปอง', c).then(res=>{ if(!res.isConfirmed) return; Object.assign(c, res.value); saveCoupons(o); renderIT(); }); }
function itDelCoupon(id,cid){ const r=loadReqs().find(x=>x.id===id); if(!r) return; const o=loadCoupons(), k=memberCouponKey(r); o[k]=(o[k]||[]).filter(x=>x.id!==cid); saveCoupons(o); renderIT(); }
/* copy helpers — IT คัดลอกโค้ดไปวางใน CMPOS */
function copyText(t){
  return new Promise(function(res){
    function fb(){ try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.top='-9999px'; ta.style.opacity='0'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ ta.setSelectionRange(0, ta.value.length); }catch(e){} var ok=false; try{ ok=document.execCommand('copy'); }catch(e){} document.body.removeChild(ta); return ok; }catch(e){ return false; } }
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ res(true); }, function(){ res(fb()); }); return; } }catch(e){}
    res(fb());
  });
}
function copyCode(el, code){ copyText(code).then(()=>{ el.classList.add('copied'); const i=el.querySelector('i'); const oc=i?i.className:''; if(i) i.className='fas fa-check';
  clearTimeout(el._ct); el._ct=setTimeout(()=>{ el.classList.remove('copied'); if(i) i.className=oc||'far fa-copy'; },1100); }); }
function copyAll(id){ const r=loadReqs().find(x=>x.id===id); if(!r) return; const codes=r.codes||[]; const txt=codes.map(cCode).join('\n');
  copyText(txt).then(()=>{ Swal.fire({icon:'success', title:'คัดลอกแล้ว '+codes.length+' โค้ด', timer:1100, showConfirmButton:false}); }); }
function copyPromo(el, code){ copyText(code).then(()=>{ el.classList.add('copied'); const i=el.querySelector('i'); if(i) i.className='fas fa-check';
  clearTimeout(el._ct); el._ct=setTimeout(()=>{ el.classList.remove('copied'); if(i) i.className='far fa-copy'; },1100); }); }
function splitName(full){ const parts=String(full||'').trim().split(/\s+/).filter(Boolean); if(!parts.length) return {first:'',last:''}; const first=parts.shift(); return {first, last:parts.join(' ')}; }
function itDownload(id){ const r=loadReqs().find(x=>x.id===id); if(!r) return;
  const wb=XLSX.utils.book_new(); let ws, sheetName='Sheet1';
  if(r.kindShort==='member'){
    /* รูปแบบพร้อม import เข้า Backoffice (Member_Code) — IT นำไปใช้ได้ทันที ไม่ต้องแก้ไข */
    const st=(r.type==='REMOVE')?'Inactive':'Active';
    const isStaff=(r.source==='staff_discount');
    const head=['MemberCode','MemberTypeCode','FirstName','LastName','ExpireDate(2050-12-31)','IDCard','Status(Active)'];
    if(isStaff) head.push('Branch','CRMCode');
    const rows=[head];
    const src=(r.memberRows&&r.memberRows.length)?r.memberRows:(r.codes||[]).map(c=>({code:cCode(c),name:'',memberNo:''}));
    src.forEach(m=>{ const nm=splitName(m.name); const row=[m.code, m.typeCode||r.memberTypeCode||r.button||'', nm.first, nm.last, m.expire||r.proExpire||'', m.idCard||'', st]; if(isStaff) row.push(m.branch||'', m.crm||''); rows.push(row); });
    ws=XLSX.utils.aoa_to_sheet(rows); sheetName='Member_Code';
  } else if(r.kindShort==='comp'){
    /* โค้ดแลกฟรี (Comp Code) — ไฟล์จริงรายเดือน พร้อมอัปเข้า Backoffice/POS */
    const startByM={}; (r.compMonths||[]).forEach(x=>{ startByM[x.month]=x.start; });
    const expByM={}; (r.compMonths||[]).forEach(x=>{ expByM[x.month]=x.expire; });
    /* โค้ดแบบใหม่เก็บเป็นสตริง + แถบเดือน codeRuns=[[month,count],…] · แบบเก่าเป็น object {code,month,expire} */
    const runs=Array.isArray(r.codeRuns)?r.codeRuns:null; let ri=0, left=runs&&runs[0]?runs[0][1]:0;
    const rows=[['code','product','month','start_date','expire_date']];
    (r.codes||[]).forEach(c=>{
      let mo=c&&c.month, ex=c&&c.expire;
      if(runs){ while(left<=0 && ri<runs.length-1){ ri++; left=runs[ri][1]; } mo=runs[ri]?runs[ri][0]:''; left--; ex=expByM[mo]||''; }
      rows.push([cCode(c), r.button||'', mo||'', startByM[mo]||r.start||'', ex||r.end||'']);
    });
    ws=XLSX.utils.aoa_to_sheet(rows); sheetName='Comp_Code';
  } else {
    /* ⭐ FX-P91 — รูปแบบตามไฟล์จริงของ Backoffice (`ID_Imp….xlsx`)
       ชีต **Import_ID** · 3 คอลัมน์ ProID (= โค้ด) · ProStatus (Voucher/E-Coupon = HS) · ProExpire */
    const status=r.type==='REMOVE'?'Delete':(r.proStatus||(r.kindShort==='voucher'?'HS':'Normal')); const rows=[['ProID','ProStatus','ProExpire']];
    (r.codes||[]).forEach(c=> rows.push([cCode(c), status, r.proExpire||r.end||'']));
    ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=[{wch:18},{wch:12},{wch:14}]; sheetName='Import_ID';
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  /* ชื่อไฟล์: ใบ Voucher/Coupon ใช้รูปแบบ Backoffice `ID_Imp<ปีเดือนวันเวลา>.xlsx` · อื่น ๆ คงเดิม */
  const _d=new Date(), _p=n=>String(n).padStart(2,'0');
  const fn = sheetName==='Import_ID'
    ? 'ID_Imp'+_d.getFullYear()+(_d.getMonth()+1)+_d.getDate()+_p(_d.getHours())+_p(_d.getMinutes())+'.xlsx'
    : (String(r.campaign||'codes').replace(/[^\w\u0E00-\u0E7F-]+/g,'_'))+'_'+(r.kindShort==='member'?'member':(r.type==='REMOVE'?'remove':(r.kindShort||'add')))+'_'+r.id+'.xlsx';
  XLSX.writeFile(wb, fn);
  let all=loadReqs(); const t=all.find(x=>x.id===id); if(t&&t.itStatus==='PENDING'){ t.itStatus='DOWNLOADED'; t.downloadedAt=Date.now(); saveReqs(all); renderIT(); } }
/* ===== คำขอซ้ำ (จากการกดปุ่มยืนยันหลายครั้ง) — IT กวดลบที่ซ้ำออกได้ =====
   ซ้ำ = type + แคมเปญ + ปุ่ม + จำนวนโค้ด ตรงกัน · เก็บตัวเก่าสุด (ตัวจริง) ไว้ · ตัวที่ IT กดเสร็จแล้วจะเก็บไว้ก่อน */
function dupKeyOf(r){ return [r.type, String(r.campaign||''), String(r.button||''), (+r.count||0)].join('|'); }
function dupGroups(reqs){ const m=new Map();
  (reqs||[]).forEach(r=>{ const k=dupKeyOf(r); if(!m.has(k)) m.set(k,[]); m.get(k).push(r); });
  const out=[]; m.forEach((rows,k)=>{ if(rows.length<2) return;
    rows.sort((a,b)=> (b.itStatus==='DONE'?1:0)-(a.itStatus==='DONE'?1:0) || (+a.createdAt||0)-(+b.createdAt||0) );
    out.push({key:k, keep:rows[0], drop:rows.slice(1), rows:rows}); });
  return out; }
function dupBannerHTML(reqs){ const g=dupGroups(reqs); if(!g.length) return '';
  const n=g.reduce((s,x)=>s+x.drop.length,0);
  return `<div class="lead-lock" style="color:#8a4b00;background:#fff8e6;border-color:#f5e3b3;display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin:0 0 12px">
    <i class="fas fa-clone" style="color:#c47f00"></i>
    <span>พบคำขอซ้ำ <b>${n}</b> รายการ จาก <b>${g.length}</b> กลุ่ม (แคมเปญ+ปุ่ม+จำนวนโค้ดเดียวกัน)</span>
    <button class="btn btn-o btn-sm" style="margin-left:auto" onclick="itDupReview()"><i class="fas fa-list-check"></i>ดู / ลบตัวซ้ำ</button></div>`; }
function itDupReview(){ const reqs=loadReqs().filter(r=>(r.type==='ADD'||r.type==='REMOVE')).filter(inCat);
  const g=dupGroups(reqs);
  if(!g.length){ Swal.fire({icon:'success', title:'ไม่มีคำขอซ้ำ', confirmButtonColor:'#2e934a'}); return; }
  const rows=g.map(x=>{
    const keep=`<div style="font-size:12.5px;color:#15623c"><i class="fas fa-circle-check"></i> เก็บไว้ <b class="mono">${esc(x.keep.id)}</b>${x.keep.itStatus==='DONE'?' · เสร็จแล้ว':''}</div>`;
    const drop=x.drop.map(d=>`<span class="mono" style="background:#fdecec;color:#b02a37;border-radius:5px;padding:1px 7px;margin:2px 3px 2px 0;display:inline-block;font-size:12px">${esc(d.id)}</span>`).join('');
    return `<div style="border:1px solid #e6e9ec;border-radius:10px;padding:10px 12px;margin-bottom:8px;text-align:left">
      <div style="font-weight:600;font-size:13.5px">${esc(x.keep.campaign||'—')} ${x.keep.button?`· <span class="mono">${esc(x.keep.button)}</span>`:''} <span style="color:#6c757d;font-weight:400">· ${(+x.keep.count||0).toLocaleString()} โค้ด · ${x.keep.type==='ADD'?'เพิ่ม':'ลบ'}</span></div>
      ${keep}<div style="margin-top:5px;font-size:12.5px;color:#b02a37"><i class="fas fa-trash-can"></i> ลบ ${x.drop.length} รายการ: ${drop}</div></div>`; }).join('');
  const total=g.reduce((s,x)=>s+x.drop.length,0);
  Swal.fire({ title:'คำขอซ้ำที่จะลบ', width:660,
    html:`<div style="font-size:13.5px"><div style="text-align:left;color:#6c757d;font-size:12.5px;line-height:1.6;margin-bottom:11px">เก็บตัวเก่าสุดของแต่ละกลุ่มไว้ (หรือตัวที่ IT กดเสร็จแล้ว) · ที่เหลือคืองานที่กดซ้ำ — โค้ดจริงไม่หาย</div>${rows}</div>`,
    showCancelButton:true, confirmButtonColor:'#c0392b', confirmButtonText:`ลบทั้ง ${total} รายการ`, cancelButtonText:'ปิด' })
  .then(res=>{ if(!res.isConfirmed) return;
    const kill=new Set(); g.forEach(x=>x.drop.forEach(d=>kill.add(d.id)));
    const all=loadReqs().filter(r=>!kill.has(r.id)); saveReqs(all); renderIT();
    Swal.fire({icon:'success', title:'ลบคำขอซ้ำแล้ว', html:`ลบ ${total} รายการ · เหลืองานจริง ${g.length} รายการ`, confirmButtonColor:'#2e934a'}); }); }
function itDone(id){ let all=loadReqs(); const r=all.find(x=>x.id===id); if(!r) return; r.itStatus='DONE'; r.doneAt=Date.now(); saveReqs(all);
  const isAdd=r.type==='ADD'; const key=isAdd?'code_add_done':'code_remove_done';
  const tok={campaign:r.campaign, item:r.button||'—', count:r.count, startDate:fmtDate(r.startDate), date:fmtDate(toISO(new Date()))};
  Swal.fire({icon:'success', title:'อัปเดตเสร็จ — แจ้งทีมการตลาด/RD แล้ว', width:560, html:`<div style="text-align:left">${routeBannerHTML(key, tok)}</div>`, confirmButtonColor:'#2e934a'}).then(()=>renderIT()); }
function reportCardIT(t){
  const b=(t.buttons&&t.buttons[0])||{};
  const code=t.lookupCode||b.code||'';
  const SS={OPEN:['pending','รอตรวจ','#c9870a'],PROGRESS:['pending','กำลังตรวจสอบ','#2f5fb3'],RESOLVED:['done','แจ้งแก้ไขแล้ว','#1d7a4d'],CLOSED:['done','สาขาปิดงานแล้ว','#5a616b'],REJECTED:['rm','ตีกลับ','#c0392b']};
  const s=SS[t.status]||SS.OPEN;
  const issues=(b.issues||[]).map(x=>`<span class="mtag" style="background:#eaf4ee;color:#9a6700"><i class="fas fa-circle" style="font-size:.5rem;color:#c9870a"></i>${esc(x)}</span>`).join('');
  const log=(t.log||[]).slice(-3).map(e=>`<div style="font-size:.8rem;color:#5a616b;padding:2px 0"><b>${esc(e.by||'')}</b> · ${esc(SS[e.status]?SS[e.status][1]:e.status)}${e.note?` — ${esc(e.note)}`:''}</div>`).join('');
  const acts=(t.status==='OPEN'||t.status==='PROGRESS')
    ? `<div class="racts">${t.status==='OPEN'?`<button class="btn btn-o btn-sm" onclick="itTicket('${t.id}','PROGRESS')"><i class="fas fa-magnifying-glass"></i>รับเรื่อง · กำลังตรวจสอบ</button>`:''}<button class="btn btn-g btn-sm" onclick="itTicket('${t.id}','RESOLVED')"><i class="fas fa-reply"></i>แจ้งแก้ไขแล้ว → สาขา</button></div>`
    : '';
  return `<div class="reqcard" style="border-left:4px solid ${s[2]}"><div class="rtop"><div style="flex:1">
    <div class="rnm"><span class="code mono">${esc(code)}</span> <span class="reqid">${esc(t.id)}</span></div>
    <div class="rmeta" style="margin-top:7px"><span class="mtag"><i class="fas fa-store"></i>${esc(t.branch)}</span>${t.reporter?`<span class="mtag"><i class="fas fa-user"></i>ผู้แจ้ง ${esc(t.reporter)}</span>`:''}<span class="mtag"><i class="fas fa-bullhorn"></i>${esc(t.campaign||'—')}</span>${issues}</div>
    ${b.note?`<div class="hint" style="margin-top:7px"><i class="fas fa-quote-left"></i> ${esc(b.note)}</div>`:''}
    ${evThumbsHTML(t)}
    ${log?`<div style="margin-top:9px;border-top:1px dashed #eef1f4;padding-top:7px">${log}</div>`:''}</div>
    <div><span class="pill ${s[0]}">${esc(s[1])}</span></div></div>
    ${acts}</div>`;
}
function replyTemplates(){ try{ const a=JSON.parse(localStorage.getItem('pc_code_reply_templates')); if(Array.isArray(a)&&a.length) return a; }catch(e){}
  return ['กดรับข้อมูลฉุกเฉินที่เครื่อง POS แล้วลองใหม่','คีย์โค้ดเข้าระบบ CMPOS อีกครั้งแล้ว — ลองกดที่ POS','ตรวจสอบแล้วโค้ดถูกต้อง · กรุณา Sync/รีสตาร์ทเครื่อง POS แล้วลองใหม่','โค้ดหมดอายุหรือถูกใช้ไปแล้ว ไม่สามารถใช้ซ้ำได้']; }
function evArr(v){ return Array.isArray(v)?v.filter(Boolean):(v?[v]:[]); }
function evThumbsHTML(t){ const b=(t.buttons&&t.buttons[0])||{}; const A=evArr(b.evApp), P=evArr(b.evPos); if(!A.length&&!P.length) return '';
  const th=(arr,which,lbl)=>arr.map((u,i)=>`<img src="${u}" onclick="itEvZoom('${t.id}','${which}',${i})" style="width:50px;height:50px;object-fit:cover;border-radius:7px;border:1px solid #e7eaee;cursor:pointer" title="${lbl}">`).join('');
  return `<div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap;align-items:center"><span class="mtag" style="background:#fdecea;color:#c0392b"><i class="fas fa-paperclip"></i>หลักฐานแนบ (${A.length+P.length})</span>${th(A,'app','แอปลูกค้า')}${th(P,'pos','POS')}</div>`; }
function itEvZoom(id, which, idx){ const t=loadBVT().find(x=>x.id===id); const b=t&&t.buttons&&t.buttons[0]; if(!b) return; const arr=evArr(which==='app'?b.evApp:b.evPos); const src=arr[idx||0]; if(!src) return;
  Swal.fire({ title:which==='app'?'หลักฐานหน้าแอปลูกค้า':'หลักฐานหน้าเครื่อง POS', imageUrl:src, imageAlt:'evidence', width:560, confirmButtonColor:'#2e934a', confirmButtonText:'ปิด' }); }
function saveReplyTemplates(a){ localStorage.setItem('pc_code_reply_templates', JSON.stringify(a)); }
function replyPick(el){ const box=document.getElementById('replyBox'); if(!box) return; const t=el.getAttribute('data-tpl')||''; box.value=(box.value.trim()?box.value.trim()+'\n':'')+t; box.focus(); }
function replyAdd(id,status){ Swal.fire({ title:'เพิ่มคำตอบสำเร็จรูป', input:'text', inputPlaceholder:'ข้อความตอบกลับที่ใช้บ่อย', showCancelButton:true, confirmButtonColor:'#2e934a', confirmButtonText:'บันทึก', cancelButtonText:'ยกเลิก', inputValidator:v=>(!v||!v.trim())&&'พิมพ์ข้อความ' }).then(r=>{ if(r.isConfirmed){ const a=replyTemplates(); a.push(r.value.trim()); saveReplyTemplates(a); } itTicket(id,status); }); }
function itTicket(id, status){
  const isResolve=status==='RESOLVED';
  const chips=replyTemplates().map(t=>`<button type="button" class="rtpl" data-tpl="${esc(t)}" onclick="replyPick(this)">${esc(t)}</button>`).join('')+`<button type="button" class="rtpl add" onclick="replyAdd('${id}','${status}')"><i class="fas fa-plus"></i> เพิ่มคำตอบ</button>`;
  Swal.fire({ title:(isResolve?'แจ้งแก้ไขแล้ว → แจ้งกลับสาขา':'รับเรื่อง → แจ้งกลับสาขา'), width:580,
    html:`<div style="text-align:left;font-size:14px">
      <div style="font-weight:600;margin-bottom:7px;color:#5a616b"><i class="fas fa-comment-dots"></i> เลือกคำตอบสำเร็จรูป (กดเพื่อใส่)</div>
      <div class="rtpls">${chips}</div>
      <label style="font-weight:600;display:block;margin:13px 0 5px">ข้อความถึงสาขา</label>
      <textarea id="replyBox" class="swal2-textarea" style="margin:0;width:100%;min-height:84px" placeholder="${isResolve?'เช่น แก้โค้ดใน CMPOS แล้ว ลองกดที่ POS อีกครั้ง':'เช่น กำลังตรวจสอบโค้ดในระบบ CMPOS'}"></textarea>
    </div>`,
    showCancelButton:true, confirmButtonColor:'#2e934a', confirmButtonText:'บันทึก + แจ้งสาขา', cancelButtonText:'ยกเลิก',
    preConfirm:()=> (document.getElementById('replyBox').value||'').trim() })
    .then(r=>{ if(!r.isConfirmed) return; const note=(r.value||'').trim();
      const all=loadBVT(); const t=all.find(x=>x.id===id); if(!t) return;
      t.status=status; (t.log=t.log||[]).push({status, at:Date.now(), by:'IT', note}); saveBVT(all);
      Swal.fire({icon:'success', title:'แจ้งเตือนกลับสาขาแล้ว', width:560, html:`<div style="text-align:left"><div class="route" style="--lc:#2f5fb3"><div class="rh">แจ้งเตือนไปที่</div><div class="rl"><span class="ch mail"><i class="fas fa-envelope"></i> Email</span><span class="ch chat"><i class="fas fa-comments"></i> Team Chat</span> <span style="color:#9aa1aa">→</span> ${esc(t.branch)}</div>${note?`<div style="font-size:.84rem;color:#5a616b;margin-top:7px;background:#f6f8fa;border-radius:8px;padding:8px 11px">${esc(note)}</div>`:''}</div><div style="margin-top:9px;font-size:13px;color:#6b7280">สาขาจะเห็นใน “Ticket ของฉัน” (Branch Tickets) และกดปิดงานได้เมื่อแก้แล้ว</div></div>`, confirmButtonColor:'#2e934a'}).then(()=>renderIT()); });
}

/* ===================== สาขา (Branch lookup) ===================== */
let BRq='', BRres=undefined;
function renderBR(){
  document.getElementById('view').innerHTML=`
    <div class="card"><h2><i class="fas fa-magnifying-glass"></i>ตรวจสอบโค้ดในระบบ</h2>
      <p class="sub">สาขาไม่เห็นรายการโค้ดทั้งหมด — กรอกโค้ดที่ได้จากลูกค้าเพื่อตรวจว่าอยู่ในระบบโปรโมชันออนไลน์หรือไม่</p>
      <div class="actbar"><input class="inp" id="brInp" style="flex:1;min-width:220px" placeholder="กรอก/วางโค้ดจากลูกค้า" value="${esc(BRq)}" onkeydown="if(event.key==='Enter')brSearch()">
        <button class="btn btn-d" onclick="brSearch()"><i class="fas fa-magnifying-glass"></i>ค้นหา</button></div>
      <div class="hint" style="margin-top:8px"><i class="fas fa-circle-info"></i> ระบบจะสแกนทุกแคมเปญออนไลน์ที่ทีมการตลาด/RD แนบไฟล์เข้ามา</div>
      <div class="actbar" style="margin-top:10px"><span class="hint" style="margin:0 4px 0 0;align-self:center"><i class="fas fa-flask"></i> ลองดูตัวอย่าง:</span>
        <button class="btn btn-o btn-sm" onclick="brDemo('found')"><i class="fas fa-circle-check" style="color:#1d7a4d"></i> ค้นเจอ</button>
        <button class="btn btn-o btn-sm" onclick="brDemo('none')"><i class="fas fa-circle-xmark" style="color:#c0392b"></i> ค้นไม่เจอ</button></div>
      <div id="brResult"></div>
    </div>`;
  if(BRres!==undefined) brRender();
}
function brDemo(kind){ const code=kind==='found'?'PAYDAY0001':'GHOST9999'; const inp=document.getElementById('brInp'); if(inp) inp.value=code; brSearch(); }
function brSearch(){ const v=(document.getElementById('brInp').value||'').trim(); BRq=v; if(!v){ BRres=undefined; brRender(); return; }
  const up=v.toUpperCase(); let hit=null;
  loadReqs().forEach(r=>{ if(hit) return; if(r.type==='ADD'&&r.status==='CONFIRMED'){ if((r.codes||[]).some(c=>String(cCode(c)).toUpperCase()===up)) hit=r; } });
  BRres=hit?{found:true, req:hit, code:v}:{found:false, code:v}; brRender(); }
function brRender(){ const el=document.getElementById('brResult'); if(!el) return; if(BRres===undefined){ el.innerHTML=''; return; }
  if(BRres.found){ const r=BRres.req;
    el.innerHTML=`<div class="found yes"><div class="ftitle"><i class="fas fa-circle-check"></i>พบโค้ดในระบบ</div>
      <div class="rmeta" style="margin-top:12px">
        <span class="mtag" style="background:#eafaf1;color:#1d7a4d"><i class="fas fa-barcode" style="color:#54b585"></i>${esc(BRres.code)}</span>
        <span class="mtag"><i class="fas fa-bullhorn"></i>แคมเปญ: <b>${esc(r.campaign)}</b></span>
        <span class="mtag"><i class="fas fa-hand-pointer"></i>ปุ่มกด: <b>${esc(r.button||'—')}</b></span>
        <span class="mtag"><i class="fas fa-calendar-days"></i>เล่นแคมเปญ: ${fmtDate(r.start)} – ${fmtDate(r.end)}</span>
        <span class="mtag"><i class="fas fa-tag"></i>${esc(r.kind)}</span></div>
      <div class="hint" style="margin-top:12px;color:#1d7a4d"><i class="fas fa-circle-info"></i> โค้ดนี้มีอยู่ในระบบจริง — ถ้าที่หน้า <b>POS หาไม่เจอ / กดใช้ไม่ได้</b> ให้กดแจ้ง IT ตรวจสอบด้านล่าง</div>
      <div class="racts" style="margin-top:12px"><button class="btn btn-d btn-sm" onclick="brReport('${r.id}','${esc(BRres.code)}')"><i class="fas fa-flag"></i>แจ้ง IT — พบในระบบ แต่ใช้ไม่ได้ที่ POS</button></div></div>`;
  } else {
    el.innerHTML=`<div class="found no"><div class="ftitle"><i class="fas fa-circle-xmark"></i>ไม่พบโค้ดในระบบ</div>
      <div class="hint" style="margin-top:10px;color:#a14b3e">ตรวจสอบตัวสะกดอีกครั้ง — ถ้าลูกค้ายืนยันว่าได้รับโค้ดนี้จริง สามารถแจ้ง IT ตรวจสอบได้</div>
      <div class="racts" style="margin-top:13px"><button class="btn btn-o btn-sm" onclick="brReport('','${esc(BRres.code)}')"><i class="fas fa-flag"></i>แจ้ง IT ตรวจสอบ</button></div></div>`;
  }
}
function brReport(reqId, code){ const r=reqId?loadReqs().find(x=>x.id===reqId):null;
  const ctx={ campaign:r?r.campaign:'(ไม่พบในระบบ)', promoType:r?r.kind:'', branch:'', branchCode:'', saleMode:'',
    lookupCode:code, fromCodeLookup:true,
    buttons:[{ sn:r?(r.button||''):'', code:r?(r.promoCode||''):'', priceFull:'', priceDisc:'', kitchen:'', choose:'' }] };
  try{ localStorage.setItem('pc_report_ctx', JSON.stringify(ctx)); localStorage.setItem('pc_report_origin','Code Management.html'); }catch(e){}
  location.href='Report Code Problem.html';
}

/* ===================== settings (lead time) ===================== */
function openSettings(){ const s=settings();
  Swal.fire({ title:'ตั้งค่าการล็อกแจ้งเพิ่มโค้ด', width:520, confirmButtonColor:'#2e934a', confirmButtonText:'บันทึก', showCancelButton:true, cancelButtonText:'ยกเลิก',
    html:`<div style="text-align:left;font-size:14px">
      <label style="font-weight:600;display:block;margin:2px 0 4px">ต้องแจ้งล่วงหน้าอย่างน้อย (วัน)</label>
      <input id="swLead" type="number" min="0" max="30" class="swal2-input" style="margin:0 0 11px;width:100%" value="${s.leadDays}">
      <label style="font-weight:600;display:block;margin:2px 0 4px">แนะนำให้แจ้งล่วงหน้า (วัน)</label>
      <input id="swRec" type="number" min="0" max="30" class="swal2-input" style="margin:0 0 11px;width:100%" value="${s.recDays}">
      <label style="display:flex;align-items:center;gap:9px;font-weight:600;cursor:pointer;margin-top:4px">
        <input id="swWk" type="checkbox" ${s.countWeekend?'checked':''} style="width:18px;height:18px"> นับเสาร์-อาทิตย์ด้วย (ไม่ข้ามวันหยุด)</label>
      <div style="font-size:12px;color:#8a9099;margin-top:9px;line-height:1.45">ปิด = นับเฉพาะวันทำการ (ข้ามเสาร์-อาทิตย์) · เปิด = นับทุกวันรวมวันหยุด</div>
    </div>`,
    preConfirm:()=>{ const lead=Math.max(0,parseInt(document.getElementById('swLead').value||'0',10)); const rec=Math.max(0,parseInt(document.getElementById('swRec').value||'0',10)); const wk=document.getElementById('swWk').checked; return {leadDays:lead, recDays:rec, countWeekend:wk}; } }).then(res=>{
    if(!res.isConfirmed) return; saveSettings(res.value); M.startDate=''; render();
    Swal.fire({icon:'success', title:'บันทึกแล้ว', timer:1200, showConfirmButton:false}); }); }

/* ===================== init ===================== */
/* มาจากปุ่ม “แจ้งเพิ่มโค้ดบัตร” → เด้งเข้าแท็บ แจ้งเพิ่มโค้ด + prefill */
function consumeCardAddcode(){ let d=null; try{ d=JSON.parse(localStorage.getItem('pc_card_addcode')); }catch(e){} if(!d) return;
  try{ localStorage.removeItem('pc_card_addcode'); }catch(e){}
  ROLE='ADD'; try{ localStorage.setItem(ROLE_KEY,'ADD'); }catch(e){}
  var __vc=(d.voucherCat||'').toLowerCase();
  CATEGORY = (d.cat && ['promo','voucher','member','staff'].includes(d.cat)) ? d.cat
    : (['b2b','b2c','complain','comp'].includes(__vc)) ? 'voucher' : ((d.cat==='staff' || /staff|owner|พนักงาน|เจ้าของ/i.test(String(d.kind||'')) || /^ST/i.test(String(d.typeCode||d.prefix||'')))?'staff' : ((d.cat==='member' || /member/i.test(String(d.kind||'')))?'member':'promo')); try{ localStorage.setItem(CAT_KEY,CATEGORY); }catch(e){}
  M.mode='ADD'; M.campaign=d.name||''; M.kind=d.kind||'Member card'; M.button=d.prefix||''; M.memberTypeCode=d.typeCode||d.prefix||''; M.voucherCat=__vc; M.proExpire=d.end||M.proExpire; if(!M.startDate) M.startDate=toISO(minStartDate()); M.parsed=null; M.fileName=''; M.verified=false;
  // prefill จากหน้า "ขยายโปร" (โปรออนไลน์): แคมเปญจริงนอก master → inject ให้รู้จัก (button = โค้ดที่ขยาย) เพื่อให้กด "ส่งให้ IT" ได้
  if(CATEGORY!=='member' && CATEGORY!=='staff' && d.name && d.prefix && !allCampaigns().find(c=>c.name===d.name)){
    EXTRA_CAMPAIGNS.push({ name:d.name, kind:d.kind||'', button:d.prefix, start:d.start||M.startDate||'', end:d.end||'' });
  }
  // leave-guard (atomic extend): ออกจากหน้าก่อนแนบโค้ด → เตือนว่าการขยายยังไม่สำเร็จ
  if(d._pendingExtend){
    try{ if(window.parent) window.parent.__leaveGuard={ page:'CodeMgmt',
      check:function(){ try{ return !!localStorage.getItem('pc_pending_extend'); }catch(e){ return false; } },
      title:'ยังไม่ได้แนบโค้ด',
      html:'คุณเลือก "ขยาย + เพิ่มโค้ด" แต่ยังไม่ได้แนบโค้ดและส่งให้ IT<br><b>ออกตอนนี้ระบบจะบันทึกการขยายเวลาให้ (ส่งเข้าคิว IT)</b> แต่ยัง<b>ไม่มีโค้ดใหม่แนบ</b><br><small class="text-muted">ถ้าต้องการเพิ่มโค้ด ให้กด "อยู่ต่อ" แล้วแนบโค้ดก่อน</small>',
      /* เดิมทิ้งการขยายไปเลย → user กดขยายแล้วเงียบ ไม่เด้งเข้าหน้า IT · ตอนนี้ commit ให้ */
      onLeave:function(){
        try{
          var p=JSON.parse(localStorage.getItem('pc_pending_extend')||'null');
          if(p && p.campaign){
            var API=(window.PC_API)||(window.parent&&window.parent.PC_API)||null;
            if(API&&API.extendCampaign) API.extendCampaign(p.campaign, p.newEnd, (p.note||'') + ' (ยังไม่ได้แนบโค้ดใหม่)');
            else if(window.google&&google.script&&google.script.run) google.script.run.extendCampaign(p.campaign, p.newEnd, (p.note||'') + ' (ยังไม่ได้แนบโค้ดใหม่)');
            try{ if(window.PC_notify) window.PC_notify('promo_extended',{ threadKey:p.campaign, text:'ขยายเวลา "'+p.campaign+'" ถึง '+p.newEnd+' — ยังไม่ได้แนบโค้ดใหม่' }); }catch(e){}
          }
        }catch(e){}
        try{ localStorage.removeItem('pc_pending_extend'); }catch(e){}
      }
    }; }catch(e){}
  }
}
seed();
/* (ปิดการลบแล้ว) เดิมลบเทสเคสบัตรสมาชิก — แต่มันลบคำขอบัตรจริงทิ้ง → งานที่เพิ่มไม่ถูกบันทึก · คงไว้เป็น no-op */
(function clearCardTestOnce(){ try{ localStorage.setItem('pc_code_cardtest_cleared','1'); }catch(e){} })();
ensureBRDemo();
ensureMemberCardDemo();
consumeCardAddcode();
if(window.PC_MEMBER_ONLY){ ROLE='ADD'; M.mode='ADD'; if(M.kind!=='Member card'){ M.kind='Member card'; M.button=''; M.campaign=''; } }
else { if((CATEGORY==='member'||CATEGORY==='staff') && M.kind!=='Member card'){ M.kind='Member card'; M.button=''; M.campaign=''; }
  else if(CATEGORY==='voucher' && M.kind!=='Voucher online'){ M.kind='Voucher online'; M.button=''; M.campaign=''; }
  else if(CATEGORY==='promo' && M.kind==='Member card'){ M.kind=KINDS[1].label; M.button=''; M.campaign=''; } }
renderCats();
renderRoles();
render();
