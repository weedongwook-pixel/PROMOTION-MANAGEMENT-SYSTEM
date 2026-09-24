/* =====================================================================
   NPD Form Redesign — prototype logic (v4, Direction A only)
   Structure:  Subset = shared central pool (separate section, nested cards)
               Product (many "buttons") → สูตรผง references shared Subsets
   Changes (v4):
     - Direction locked to A (nested cards); B/C + master picker removed
     - Powder "Code RM" = dropdown from RM master (shows Description), auto-fills Desc
     - Powder "Unit" = combobox (datalist of used units + free type)
     - "สร้าง Subset ใหม่" button moved into Subset section (after Category)
     - Selling Price: single-price mode (one input for all) / split-by-channel mode
     - Add-on (Price) list at product level
     - Flavor tab: per-powder "Subset ปลายทาง" dropdown (from DB), target card removed
   ===================================================================== */
(function () {
  "use strict";

  var UNITS_TH = ['กรัม', 'มล.', 'ชิ้น', 'ช้อน', 'กก.'];
  var UNITS_EN = ['g', 'ml', 'pcs', 'spoon', 'kg'];
  function curUnits() { return (window.PC_LANG === 'EN') ? UNITS_EN : UNITS_TH; }
  /* หน่วย + ขนาดช้อน = สลับ TH/EN ตามปุ่มเปลี่ยนภาษา (แปลงค่าในตาราง ไม่ใช่แค่ label) */
  function npdLang() { return (window.PC_LANG === 'EN') ? 'EN' : 'TH'; }
  var UNIT_TH2EN = { 'กรัม': 'g', 'มล.': 'ml', 'ชิ้น': 'pcs', 'ช้อน': 'spoon', 'กก.': 'kg' };
  var UNIT_EN2TH = { 'g': 'กรัม', 'G': 'กรัม', 'ml': 'มล.', 'pcs': 'ชิ้น', 'spoon': 'ช้อน', 'kg': 'กก.' };
  function convUnit(u, lang) { u = String(u == null ? '' : u).trim(); if (!u) return u; var m = (lang === 'EN') ? UNIT_TH2EN : UNIT_EN2TH; return (m[u] != null) ? m[u] : u; }
  function convSpoon(s, lang) { s = String(s == null ? '' : s); if (!s) return s; return (lang === 'EN') ? s.replace(/ช้อน/g, 'spoon') : s.replace(/spoon/g, 'ช้อน'); }
  function npdConvertUnitsLang() { var lang = npdLang(); function cv(w) { if (!w) return; if (w.unit) w.unit = convUnit(w.unit, lang); if (w.spoon) w.spoon = convSpoon(w.spoon, lang); } (state.subsets || []).forEach(function (s) { (s.powders || []).forEach(cv); }); (state.products || []).forEach(function (p) { (p.recipes || []).forEach(function (r) { if (r.unit) r.unit = convUnit(r.unit, lang); }); }); if (state.flavor && state.flavor.powders) state.flavor.powders.forEach(cv); }
  var NPD_CH_DEF = ['Take-Away', 'Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'Gokoo'];
  /* Sale Mode = ดึงจาก master (pc_salemode_master) — เพิ่ม/เปิด-ปิดช่องทางได้ที่หน้า CatModeMaster ไม่ต้องแก้โค้ด */
  function npdChannels(){ try{ var m=JSON.parse(localStorage.getItem('pc_salemode_master')||'null'); if(Array.isArray(m)){ var mf=JSON.parse(localStorage.getItem('pc_mode_forms')||'{}')||{}; var a=m.filter(function(x){return x&&x.active!==0&&x.active!==false;}).map(function(x){return String(x.name||'').trim();}).filter(function(n){ var o=mf[n]; return n && !npdIsAggr(n) && !(o&&o.npd===false); }); if(a.length){ if(!a.some(npdIsTA)) a.unshift('Take-Away'); return a; } } }catch(e){} return NPD_CH_DEF; }
  /* ตัดชื่อรวม ๆ ออก — Delivery/ALL DELIVERY/ALL CHANNEL/Online ไม่ใช่ช่องทางจริง ราคาแต่ละเจ้าไม่เท่ากัน ต้องกรอกแยกราย Grab/Lineman/… */
  function npdIsAggr(c){ var lo=String(c||'').trim().toLowerCase(); return lo==='delivery'||lo==='all delivery'||lo==='all channel'||lo==='online'; }
  function npdIsTA(c){ return String(c||'').replace(/[\s-]/g,'').toLowerCase()==='takeaway'; }
  function npdDelivery(){ return npdChannels().filter(function(c){ return !npdIsTA(c); }); }

  // Raw-material master — source for the "Code RM" dropdown (code + description)
  var RM_MASTER = [
    { code: '3097', desc: 'ผงปรุงรส Cheese 500G' }, { code: '3095', desc: 'ผงปรุงรส Sour Cream 500G' },
    { code: '3099', desc: 'ผงปรุงรส สาหร่าย 500G' }, { code: '3112', desc: 'ผงปรุงรส BBQ 500G' },
    { code: '3114', desc: 'ผงปรุงรส เผ็ด 500G' }, { code: '3110', desc: 'ผงปรุงรส ทรัฟเฟิล 500G' },
    { code: '3131', desc: 'ผงปรุงรส วาซาบิ 500G' }, { code: '3140', desc: 'ผงปรุงรส ไข่เค็ม 500G' },
    { code: '3141', desc: 'ผงปรุงรส ต้มยำ 500G' },
    { code: '3060', desc: 'ข้อไก่ทอด' }, { code: '4001', desc: 'ถ้วย Large' }
  ];
  // ใช้ RM master จริง (data/rm-master.js) ถ้าโหลดแล้ว
  if (window.PC_RM_MASTER && window.PC_RM_MASTER.length) RM_MASTER = window.PC_RM_MASTER.map(function (r) { return { code: r.code, desc: r.desc, unit: r.unit || '' }; });
  // Product Category master (cateCode + name) — Category dropdown source; Code is IT-filled for new ones
  var CATEGORY_MASTER = [
    { code: '101', name: 'Fries' }, { code: '104', name: 'Super Chicken Pop' }, { code: '108', name: 'Specialty Chicken' },
    { code: '110', name: 'Small Bites' }, { code: '111', name: 'Seafood' }, { code: '115', name: 'SAUCE & TOPPING' }, { code: '201', name: 'Beverages' }
  ];
  var CAT_LIST = CATEGORY_MASTER.slice();   // mutable — augmented with real master categories at init
  // Shop selection master — built dynamically from real branch data (data/seed.js → window.PC_SEED.branches)
  // Type → list of selectable rows {code, d1, d2, ids:[branchId...]}. Shop Master = per-branch.
  var SHOP_DATA = { 'Shop Group': { c: 'Group', rows: [] }, 'Shop Class': { c: 'Class', rows: [] }, 'Shop Type': { c: 'Type', rows: [] }, 'Shop Master': { c: 'Branch', rows: [] } };
  var BRANCHES = [];   // [{id,en,th,group,class,type}]
  function buildShopData() {
    var seed = (window.PC_SEED && Array.isArray(window.PC_SEED.branches)) ? window.PC_SEED.branches : [];
    BRANCHES = seed.map(function (b) { return { id: b.id, en: b.name || '', th: b.nameTH || '', group: b.group || '-', class: b.class || '-', type: b.type || '-' }; });
    if (!BRANCHES.length) { // fallback demo set if seed missing
      BRANCHES = [
        { id: 'PC1001', en: 'Central World', th: 'เซนทรัล เวิลด์', group: 'BKK', class: 'Central', type: 'COCO' },
        { id: 'PC1002', en: 'Mega Bangna', th: 'เมกะบางนา', group: 'GBKK', class: 'Indy', type: 'COCO' }
      ];
    }
    function groupBy(key) {
      var map = {};
      BRANCHES.forEach(function (b) { var k = b[key] || '-'; (map[k] = map[k] || []).push(b.id); });
      return Object.keys(map).sort().map(function (k) { return { code: k, d1: k, d2: map[k].length + ' สาขา', ids: map[k] }; });
    }
    SHOP_DATA['Shop Group'].rows = groupBy('group');
    SHOP_DATA['Shop Class'].rows = groupBy('class');
    SHOP_DATA['Shop Type'].rows = groupBy('type');
    SHOP_DATA['Shop Master'].rows = BRANCHES.map(function (b) { return { code: b.id, d1: b.en, d2: b.th, ids: [b.id] }; });
  }
  // Existing Subsets in the database — ดึงจาก Subset master จริง (data/subset-master.js)
  var SUBSETS_MASTER = (window.PC_SUBSET_MASTER && window.PC_SUBSET_MASTER.length) ? window.PC_SUBSET_MASTER.map(function (s) { return { ssCode: s.ssCode, name: s.name, short: s.short }; }) : [];
  /* Form Display filter (pc_subset_forms[ss].npd / pc_cat_forms[cat].npd) — คุมจากหน้า Form Display */
  function npdSubsetShown(ss) { try { var m = JSON.parse(localStorage.getItem('pc_subset_forms') || '{}') || {}; var o = m[ss]; if (o && o.npd !== undefined) return !!o.npd; } catch (e) {} return true; }
  function npdCatShown(cat) { try { var m = JSON.parse(localStorage.getItem('pc_cat_forms') || '{}') || {}; var o = m[cat]; if (o && o.npd !== undefined) return !!o.npd; } catch (e) {} return true; }

  var seq = 0;
  function uid(p) { return (p || 'x') + (++seq) + '_' + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* ป้ายสถานะโค้ดที่ auto-run (RD เห็น): จอง (RESERVED) / ยืนยันแล้ว (CONFIRMED) */
  function ccBadge(code) {
    code = String(code == null ? '' : code).trim(); if (!code) return '';
    var st = 'RESERVED';
    try { if (window.PC_COUNTER && PC_COUNTER.entryOf) { var e = PC_COUNTER.entryOf(code); if (e && e.status) st = e.status; } } catch (x) {}
    if (st === 'CONFIRMED') return '<span class="cc-resv ok" title="IT ยืนยันแล้ว"><i class="fas fa-circle-check"></i> CONFIRMED</span>';
    return '<span class="cc-resv" title="จองเลขแล้ว · รอ IT บันทึก"><i class="fas fa-hourglass-half"></i> RESERVED</span>';
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function rmFind(code) { code = String(code == null ? '' : code).trim(); return RM_MASTER.find(function (r) { return r.code === code; }); }
  function loginUser() { try { return localStorage.getItem('pc_userName') || 'RD (ผู้เข้าสู่ระบบ)'; } catch (e) { return 'RD (ผู้เข้าสู่ระบบ)'; } }

  function mkPowder(seed) { seed = seed || {}; return { id: uid('w'), cmpos: seed.cmpos || '', eng: seed.eng || '', th: seed.th || '', code: seed.code || '', desc: seed.desc || '', qty: seed.qty || '', unit: seed.unit || 'g', spoon: seed.spoon || '', addon: (seed.addon != null ? seed.addon : ''), seq: seed.seq || '', noFlavor: !!seed.noFlavor, std: !!seed.std, targetSS: seed.targetSS || '' }; }
  function mkSubset(seed) { seed = seed || {}; return { id: uid('s'), ssCode: seed.ssCode || '', name: seed.name || '', name2: seed.name2 || '', cat: seed.cat || '', registered: !!seed.registered, powders: seed.powders || [] }; }
  function mkRecipe(seed) { seed = seed || {}; return { code: seed.code || '', desc: seed.desc || '', qty: seed.qty || '', unit: seed.unit || 'G', channels: seed.channels || [] }; }
  /* ผงรสมาตรฐาน (ลำดับคงที่บน POS) — เติมให้ทุก Subset ใหม่อัตโนมัติ เพื่อลดการกรอกซ้ำ */
  var STD_POWDERS = [
    { seq: 1,  eng: 'Cheese',         th: 'Cheese',         code: '3097', desc: 'ผงปรุงรส Cheese 500G',       unit: 'g', spoon: 'ช้อน 5 ml * 1 ช้อน' },
    { seq: 2,  eng: 'BBQ',            th: 'BBQ',            code: '3128', desc: 'ผงปรุงรส BBQ 500G',          unit: 'g', spoon: 'ช้อน 5 ml * 2 ช้อน' },
    { seq: 3,  eng: 'Sour Cream',     th: 'Sour Cream',     code: '3095', desc: 'ผงปรุงรส Sour Cream 500G',   unit: 'g', spoon: 'ช้อน 5 ml * 2 ช้อน' },
    { seq: 4,  eng: 'Chilli BBQ',     th: 'Chilli BBQ',     code: '3096', desc: 'ผงปรุงรส Chilli BBQ 500G',   unit: 'g', spoon: 'ช้อน 5 ml * 2 ช้อน' },
    { seq: 5,  eng: 'Truffle +THB10', th: 'Truffle +THB10', code: '3024', desc: 'ผงปรุงรส Truffle',           unit: 'g', addon: 10, spoon: 'ช้อน 5 ml * 1 ช้อน' },
    { seq: 6,  eng: 'Truffle 2',      th: 'Truffle 2',      code: '3024', desc: 'ผงปรุงรส Truffle',           unit: 'g', spoon: 'ช้อน 5 ml * 1 ช้อน' },
    { seq: 7,  eng: 'Sweet Corn',     th: 'Sweet Corn',     code: '3101', desc: 'ผงปรุงรส sweet corn 500 G.', unit: 'g', spoon: 'ช้อน 5 ml * 2 ช้อน' },
    { seq: 8,  eng: 'Salted',         th: 'Salted',         code: '3022', desc: 'เกลือ',                       unit: 'g', spoon: '1 ช้อน pinch' },
    { seq: 99, eng: 'No flavor',      th: 'No flavor',      code: '',     desc: '',                            unit: '',  noFlavor: true }
  ];
  function stdPowders(formula) { var lang = npdLang(); return STD_POWDERS.map(function (p) { var w = mkPowder(p); w.cmpos = npdReserveCMPOS(); w.std = true; if (formula === 2 && !w.noFlavor && SPOON_F2[p.eng]) w.spoon = SPOON_F2[p.eng]; if (!w.noFlavor) { w.unit = convUnit(w.unit, lang); w.spoon = convSpoon(w.spoon, lang); } return w; }); }
  /* สูตร 2 — ค่าเริ่มต้น "ขนาดช้อน" ต่างจากสูตร 1 (ชื่อผง/ตัวย่อ/หน่วย เหมือนเดิม) */
  var SPOON_F2 = { 'Cheese': 'ช้อน 5 ml * 1.5 ช้อน', 'BBQ': 'ช้อน 5 ml * 3 ช้อน', 'Sour Cream': 'ช้อน 5 ml * 3 ช้อน', 'Chilli BBQ': 'ช้อน 5 ml * 3 ช้อน', 'Truffle +THB10': 'ช้อน 5 ml * 1.5 ช้อน', 'Truffle 2': 'ช้อน 5 ml * 1.5 ช้อน', 'Sweet Corn': 'ช้อน 5 ml * 3 ช้อน', 'Salted': '1.5 ช้อน pinch' };
  // strip a trailing " <suffix>" from a name (used when swapping the Subset Name 2 suffix)
  function stripSuffix(v, suf) { v = String(v == null ? '' : v); suf = String(suf || '').trim(); if (suf && v.length >= suf.length + 1 && v.slice(-(suf.length + 1)) === ' ' + suf) return v.slice(0, -(suf.length + 1)); return v; }
  // เติม "ตัวย่อผงบน POS" (Subset Name 2) ต่อท้ายชื่อผง EN/TH ทุกตัวในชุด (สลับจากตัวย่อเดิม → ใหม่)
  function applyName2Suffix(sub, oldN2, newN2) {
    newN2 = String(newN2 || '').trim();
    (sub.powders || []).forEach(function (w) {
      ['eng', 'th'].forEach(function (k) {
        var base = stripSuffix(w[k], oldN2).replace(/\s+$/, '');
        w[k] = (base && newN2) ? base + ' ' + newN2 : base;
      });
    });
  }
  function mkProduct(seed) {
    seed = seed || {};
    return {
      id: uid('p'), name: seed.name || '', th: seed.th || '', code: seed.code || '',
      category: seed.category || '', cateCode: seed.cateCode || '', priceTakeaway: seed.priceTakeaway || '', priceDelivery: seed.priceDelivery || '', splitOpen: !!seed.splitOpen,
      prices: seed.prices || {}, saleModes: seed.saleModes || [],
      recipes: seed.recipes || [mkRecipe()], formulas: seed.formulas || []
    };
  }

  var state = {
    tab: 'new',
    category: '', cateCode: '',   // central — ใช้กับทุกปุ่มสินค้า
    products: [],
    subsets: [],          // shared central pool
    storeMode: 'ALL',     // 'ALL' or 'SELECT'
    storeConds: [],       // selected shop conditions [{type,code,d1,d2}]
    flavor: {
      project: 'Flavored Chicken Joint', start: '', end: '', rd: 'RD',
      powders: [mkPowder({ eng: 'Tom Yum', code: '3141', desc: 'ผงปรุงรส ต้มยำ 500G', qty: '1.91', unit: 'g', spoon: 'ช้อน 5 ml * 1 ช้อน', addon: 5, targetSS: 'SS0018' })]
    }
  };

  function seedData() {
    state.subsets = [];
    var p = mkProduct({ name: 'Large Chicken Joint', th: 'ลาร์จ ข้อไก่ทอด', code: '108005', category: 'Specialty Chicken', cateCode: '108', priceTakeaway: '79', priceDelivery: '85', saleModes: ['Take-Away', 'Grab'] });
    p.recipes = [
      mkRecipe({ code: '3060', desc: 'ข้อไก่ทอด', qty: '85', unit: 'G', channels: ['Take-Away', 'Grab'] }),
      mkRecipe({ code: '4001', desc: 'ถ้วย Large', qty: '1', unit: 'pcs', channels: ['Take-Away'] })
    ];
    p.prices = { 'Take-Away': '79', 'Grab': '85' };
    p.formulas = [];
    state.products = [p];
    state.category = 'Specialty Chicken'; state.cateCode = '108';
  }

  function P(pid) { return state.products.find(function (p) { return p.id === pid; }); }
  function Ssub(sid) { return state.subsets.find(function (s) { return s.id === sid; }); }
  /* resolve formula subId → {ssCode,name,count} · รองรับทั้งชุดในฟอร์ม (id) และ Subset ใน DB ('db:'+ssCode) */
  function resolveFormulaSub(subId) {
    if (!subId) return null;
    if (String(subId).indexOf('db:') === 0) { var code = String(subId).slice(3); var d = SUBSETS_MASTER.find(function (x) { return x.ssCode === code; }); return d ? { ssCode: d.ssCode, name: d.name, count: 0 } : null; }
    var s = Ssub(subId); return s ? { ssCode: s.ssCode, name: s.name, count: (s.powders || []).length } : null;
  }

  function flavorSubOpts(sel) {
    return '<option value="">— เลือก Subset —</option>' + SUBSETS_MASTER.filter(function (s) { return s.ssCode === sel || npdSubsetShown(s.ssCode); }).map(function (s) {
      return '<option value="' + esc(s.ssCode) + '"' + (s.ssCode === sel ? ' selected' : '') + '>' + esc(s.ssCode) + ' · ' + esc(s.name) + '</option>';
    }).join('');
  }
  var SPOONS = ['ช้อน 5 ml * 1 ช้อน','ช้อน 5 ml * 1.5 ช้อน','ช้อน 5 ml * 2 ช้อน','ช้อน 5 ml * 3 ช้อน','1 ช้อน pinch','1.5 ช้อน pinch'];
  function refreshUnitDatalist() {
    var set = {}; curUnits().forEach(function (u) { set[u] = 1; });
    state.subsets.forEach(function (s) { s.powders.forEach(function (w) { if (w.unit) set[w.unit] = 1; }); });
    state.products.forEach(function (p) { (p.recipes || []).forEach(function (r) { if (r.unit) set[r.unit] = 1; }); });
    (state.flavor.powders || []).forEach(function (w) { if (w.unit) set[w.unit] = 1; });
    var dl = document.getElementById('unitDatalist');
    if (dl) dl.innerHTML = Object.keys(set).map(function (u) { return '<option value="' + esc(u) + '"></option>'; }).join('');
    // spoon-size datalist (common values + ones already used)
    var sset = {}; SPOONS.forEach(function (u) { sset[u] = 1; });
    state.subsets.forEach(function (s) { s.powders.forEach(function (w) { if (w.spoon) sset[w.spoon] = 1; }); });
    (state.flavor.powders || []).forEach(function (w) { if (w.spoon) sset[w.spoon] = 1; });
    var sdl = document.getElementById('spoonList');
    if (sdl) sdl.innerHTML = Object.keys(sset).map(function (u) { return '<option value="' + esc(u) + '"></option>'; }).join('');
  }

  /* ===================== SUBSET POOL (shared, nested cards) ===================== */
  function powderTable(sub) {
    var rows = sub.powders.map(function (w, i) {
      var nf = !!w.noFlavor;
      var naCell = '<td><input class="form-control form-control-sm text-center" disabled value="—" title="ไม่ใช้ผง — เป็นปุ่มลูกค้าไม่เอาผง" style="background:#f1f3f5;min-width:90px"></td>';
      var seqCell = '<td>' + (w.std
        ? '<input type="number" class="form-control form-control-sm text-center fw-bold it-field" readonly title="ลำดับมาตรฐาน — แก้ไม่ได้" style="width:58px" value="' + esc(w.seq || (i + 1)) + '">'
        : '<input type="number" min="1" class="form-control form-control-sm text-center fw-bold" style="width:58px" value="' + esc(w.seq || (i + 1)) + '" title="ลำดับแสดงบน POS" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'seq\',this.value)">') + '</td>';
      var cmposCell = '<td><input class="form-control form-control-sm mono it-field" readonly title="รันอัตโนมัติจากโค้ดกลาง (หมวดผง 103)" style="width:88px" value="' + esc(w.cmpos) + '" placeholder="' + (nf ? '—' : '— IT —') + '"></td>';
      var engCell = '<td><input class="form-control form-control-sm border-secondary" style="min-width:120px" value="' + esc(w.eng) + '" placeholder="Cheese" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'eng\',this.value)"></td>';
      var thCell = '<td><input class="form-control form-control-sm border-secondary" style="min-width:120px" value="' + esc(w.th) + '" placeholder="ชีส" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'th\',this.value)"></td>';
      var rest = nf
        ? (naCell + naCell + naCell + naCell + naCell)
        : ('<td><input class="form-control form-control-sm border-secondary mono" list="rmList" style="width:120px" value="' + esc(w.code) + '" placeholder="Code RM" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'code\',this.value)" onchange="RD.rmPick(\'' + sub.id + '\',\'' + w.id + '\',this.value)"></td>' +
           '<td><input class="form-control form-control-sm border-secondary" style="min-width:150px" value="' + esc(w.desc) + '" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'desc\',this.value)"></td>' +
           '<td><input type="number" step="any" min="0" class="form-control form-control-sm border-secondary text-center" style="width:70px" value="' + esc(w.qty) + '" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'qty\',this.value)"></td>' +
           '<td><input class="form-control form-control-sm border-secondary text-center" list="unitDatalist" style="width:74px" value="' + esc(w.unit) + '" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'unit\',this.value)"></td>' +
           '<td><input class="form-control form-control-sm border-secondary" list="spoonList" style="min-width:130px" value="' + esc(w.spoon) + '" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'spoon\',this.value)"></td>');
      var priceCell = nf
        ? '<td><input class="form-control form-control-sm text-center" disabled value="—" style="background:#f1f3f5;width:96px"></td>'
        : '<td><div class="input-group input-group-sm" style="width:96px"><span class="input-group-text px-1">฿</span><input type="number" min="0" class="form-control border-secondary text-center" value="' + esc(w.addon) + '" oninput="RD.setW(\'' + sub.id + '\',\'' + w.id + '\',\'addon\',this.value)"></div></td>';
      var delCell = '<td class="text-center"><i class="fas fa-times text-danger" style="cursor:pointer" onclick="RD.delW(\'' + sub.id + '\',\'' + w.id + '\')"></i></td>';
      return '<tr' + (nf ? ' style="background:#fbfbe8"' : '') + '>' + seqCell + cmposCell + engCell + thCell + rest + priceCell + delCell + '</tr>';
    }).join('');
    return '<div class="border border-dark rounded" style="overflow:visible">' +
      '<table class="table table-sm align-middle m-0 powder-tbl">' +
      '<thead><tr><th style="width:58px">ลำดับ</th><th>CMPOS <span class="cc-resv"><i class="fas fa-hourglass-half"></i> RESERVED</span></th><th>Name (EN) <span class="it-tag" style="background:#198754;color:#fff">Bill Kitchen</span></th><th>Name (TH) <span class="it-tag" style="background:#198754;color:#fff">Button POS</span></th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon Size</th><th>Price</th><th style="width:30px"></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="11" class="text-center text-muted py-2">ยังไม่มีผงใน Subset นี้</td></tr>') + '</tbody></table></div>' +
      '<div class="d-flex gap-2 mt-2">' +
      '<button class="btn btn-sm btn-dark fw-bold" onclick="RD.addW(\'' + sub.id + '\')"><i class="fas fa-plus me-1"></i>กรอกผงใหม่</button>' +
      '</div>';
  }
  function subsetFields(sub) {
    return '<div class="row g-2 align-items-end">' +
      '<div class="col-md-2"><label class="hint fw-bold text-uppercase">SS Code <span class="cc-resv"><i class="fas fa-hourglass-half"></i> RESERVED</span></label><input class="form-control form-control-sm mono it-field" readonly title="รันอัตโนมัติจากโค้ดกลาง" value="' + esc(sub.ssCode) + '" placeholder="— IT —"></div>' +
      '<div class="col-md-4"><label class="hint fw-bold text-uppercase req">Subset Name</label><input class="form-control form-control-sm border-dark" value="' + esc(sub.name) + '" placeholder="Flavored Chicken Joint 1" oninput="RD.setS(\'' + sub.id + '\',\'name\',this.value)" onchange="RD.checkSubName(\'' + sub.id + '\')"></div>' +
      '<div class="col-md-3"><label class="hint fw-bold text-uppercase req">Subset Name 2 <span class="hint" style="text-transform:none">· ตัวย่อผงบน POS</span></label><input class="form-control form-control-sm border-dark mono" value="' + esc(sub.name2) + '" placeholder="เช่น FF1" maxlength="10" oninput="RD.setS(\'' + sub.id + '\',\'name2\',this.value)" onchange="RD.applyN2(\'' + sub.id + '\')" title="พิมพ์ตัวย่อแล้วกด Enter / คลิกออก → ระบบจะต่อท้ายชื่อผง EN/TH ให้อัตโนมัติ"></div>' +
      '<div class="col-md-3"><label class="hint fw-bold text-uppercase d-block">&nbsp;</label>' +
      (sub.registered
        ? '<button class="btn btn-sm btn-outline-success fw-bold w-100" onclick="RD.editSub(\'' + sub.id + '\')" title="กดเพื่อแก้ไขข้อมูล Subset นี้ (ปลดล็อก)"><i class="fas fa-circle-check me-1"></i>เพิ่มแล้ว · แก้ไข</button>'
        : '<button class="btn btn-sm btn-dark fw-bold w-100" onclick="RD.registerSub(\'' + sub.id + '\')" title="เพิ่ม Subset นี้ให้เลือกได้ในสูตรผง (ยังไม่บันทึกเข้าฐานข้อมูลจริง — IT จะใส่โค้ดและกดบันทึกที่หน้า IT)"><i class="fas fa-plus me-1"></i>เพิ่ม</button>') +
      '</div>' +
      '</div>';
  }
  function subsetsA() {
    if (!state.subsets.length) {
      return '<button class="btn ghost-btn w-100" onclick="RD.addS()"><i class="fas fa-plus-circle me-2"></i>สร้าง Subset แรก</button>';
    }
    return state.subsets.map(function (s, i) {
      return '<div class="subset-card mb-3">' +
        '<div class="subset-head d-flex justify-content-between align-items-center px-3 py-2">' +
        '<span class="fw-bold"><i class="fas fa-mortar-pestle me-2 text-warning"></i>Subset #' + (i + 1) + (s.ssCode ? ' · <span class="ss-badge">' + esc(s.ssCode) + '</span>' : '') + '</span>' +
        '<i class="fas fa-trash-alt text-danger" style="cursor:pointer" onclick="RD.delS(\'' + s.id + '\')"></i></div>' +
        '<div class="p-3">' + subsetFields(s) + '<div class="mt-3">' + powderTable(s) + '</div></div></div>';
    }).join('') + '<button class="btn ghost-btn w-100" onclick="RD.addS()"><i class="fas fa-plus-circle me-2"></i>เพิ่ม Subset</button>';
  }
  function renderSubsets() {
    var box = document.getElementById('subsetSection'); if (!box) return;
    box.innerHTML = subsetsA();
  }

  /* ===================== PRODUCTS (many buttons) + สูตรผง ===================== */
  function rmTable(p) {
    var sm = p.saleModes || [];
    var chCell = function (r, i) {
      if (!sm.length) return '<span class="hint">— ติ๊ก Sale Mode ก่อน —</span>';
      return sm.map(function (ch) {
        var on = (r.channels || []).indexOf(ch) !== -1;
        return '<label class="rm-ch' + (on ? ' on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="RD.toggleRmCh(\'' + p.id + '\',' + i + ',\'' + ch + '\')">' + ch + '</label>';
      }).join('');
    };
    var rows = p.recipes.map(function (r, i) {
      return '<tr class="rm-row">' +
        '<td class="text-center fw-bold">' + (i + 1) + '</td>' +
        '<td><input class="form-control form-control-sm border-secondary mono" list="rmList" style="width:120px" value="' + esc(r.code) + '" placeholder="Code RM" oninput="RD.setR(\'' + p.id + '\',' + i + ',\'code\',this.value)" onchange="RD.rmPickR(\'' + p.id + '\',' + i + ',this.value)"></td>' +
        '<td><input class="form-control form-control-sm border-secondary rm-desc" style="min-width:150px" value="' + esc(r.desc) + '" oninput="RD.setR(\'' + p.id + '\',' + i + ',\'desc\',this.value)"></td>' +
        '<td><input type="number" step="any" class="form-control form-control-sm border-secondary text-center" style="width:64px" value="' + esc(r.qty) + '" oninput="RD.setR(\'' + p.id + '\',' + i + ',\'qty\',this.value)"></td>' +
        '<td><input class="form-control form-control-sm border-secondary text-center rm-unit" list="unitDatalist" style="width:74px" value="' + esc(r.unit) + '" oninput="RD.setR(\'' + p.id + '\',' + i + ',\'unit\',this.value)"></td>' +
        '<td><div class="d-flex flex-wrap gap-1">' + chCell(r, i) + '</div></td>' +
        '<td class="text-center"><i class="fas fa-times text-danger" style="cursor:pointer" onclick="RD.delR(\'' + p.id + '\',' + i + ')"></i></td></tr>';
    }).join('');
    return '<div class="border border-dark rounded" style="overflow:visible" data-prod="' + p.id + '"><table class="table table-sm align-middle m-0 recipe-tbl">' +
      '<thead><tr><th style="width:40px">No</th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>ผูกกับช่องทาง (Delivery / Take-Away)</th><th style="width:30px"></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<button class="btn btn-sm btn-dark fw-bold mt-2" onclick="RD.addR(\'' + p.id + '\')"><i class="fas fa-plus me-1"></i>Raw Material</button>';
  }
  function formulaSection(p) {
    var rows = (p.formulas || []).map(function (f, i) {
      var s = resolveFormulaSub(f.subId);
      var max = (s && s.count) ? s.count : 0;
      var inForm = state.subsets.filter(function (x) { return x.registered; }).map(function (x) { var label = (x.ssCode ? x.ssCode + ' · ' : '') + (x.name || 'Subset'); return '<option value="' + x.id + '"' + (x.id === f.subId ? ' selected' : '') + '>' + esc(label) + '</option>'; }).join('');
      var dbOpts = SUBSETS_MASTER.filter(function (x) { return ('db:' + x.ssCode) === f.subId || npdSubsetShown(x.ssCode); }).map(function (x) { var v = 'db:' + x.ssCode; return '<option value="' + v + '"' + (v === f.subId ? ' selected' : '') + '>' + esc(x.ssCode + ' · ' + (x.name || '')) + '</option>'; }).join('');
      var opts = '<option value="">— เลือก Subset —</option>' +
        (inForm ? '<optgroup label="ชุดใหม่ในฟอร์มนี้">' + inForm + '</optgroup>' : '') +
        (dbOpts ? '<optgroup label="Subset ในระบบ (ฐานข้อมูล)">' + dbOpts + '</optgroup>' : '');
      return '<div class="d-flex gap-2 align-items-center mb-2 flex-wrap">' +
        '<span class="badge bg-dark">#' + (i + 1) + '</span>' +
        '<span class="ss-badge" title="SS Code (IT กรอก)">' + esc(s ? (s.ssCode || '— IT —') : '—') + '</span>' +
        '<select class="form-select form-select-sm border-dark" style="max-width:280px" onchange="RD.setFormula(\'' + p.id + '\',\'' + f.id + '\',\'subId\',this.value)">' + opts + '</select>' +
        '<span class="small">Min</span>' +
        '<input type="number" min="1" max="' + (max || 99) + '" class="form-control form-control-sm border-dark text-center fw-bold" style="width:60px" title="ขั้นต่ำ (min)" value="' + esc(f.chooseMin != null ? f.chooseMin : (f.choose || 1)) + '" oninput="RD.setFormula(\'' + p.id + '\',\'' + f.id + '\',\'chooseMin\',this.value)">' +
        '<span class="small">Max</span>' +
        '<input type="number" min="1" max="' + (max || 99) + '" class="form-control form-control-sm border-dark text-center fw-bold" style="width:60px" title="ขั้นสูง (max)" value="' + esc(f.chooseMax != null ? f.chooseMax : (f.choose || 1)) + '" oninput="RD.setFormula(\'' + p.id + '\',\'' + f.id + '\',\'chooseMax\',this.value)">' +
        '<span class="small">ผง <span class="hint">' + (max ? '(จาก ' + max + ' ผงในชุด)' : '') + '</span></span>' +
        '<i class="fas fa-times text-danger ms-auto" style="cursor:pointer" onclick="RD.delFormula(\'' + p.id + '\',\'' + f.id + '\')"></i>' +
        '</div>';
    }).join('') || '<div class="hint mb-2">ยังไม่มีสูตรผง — เพิ่มเพื่อกำหนดว่าเลือกได้กี่ผงจาก Subset ใด</div>';
    return '<hr class="my-3"><div class="d-flex align-items-center mb-2 flex-wrap"><span class="fw-bold text-uppercase" style="font-size:.82rem"><i class="fas fa-flask me-2 text-success"></i>สูตรผง (Powder Formula)</span>' +
      '<span class="hint ms-2">เลือกได้กี่ผง · จาก Subset ใด</span></div>' +
      '<div class="p-2 rounded" style="background:#eef7f1;border:1px solid #bfe3cd">' + rows +
      '<button class="btn btn-sm btn-success fw-bold mt-1" onclick="RD.addFormula(\'' + p.id + '\')"><i class="fas fa-plus me-1"></i>เพิ่มสูตรผง</button></div>';
  }
  function priceBlock(p) {
    var sm = p.saleModes || []; p.prices = p.prices || {};
    var hasTA = true;   // ช่องราคา Take Away เปิดให้กรอกเสมอ (ไม่ต้องรอติ๊ก Sale Mode)
    var delivCh = sm.filter(function (c) { return npdDelivery().indexOf(c) !== -1; });
    var oneField = function (label, val, key) {
      return '<div style="min-width:200px"><label class="hint fw-bold">' + label + '</label><div class="input-group input-group-sm"><span class="input-group-text">฿</span><input type="number" min="0" class="form-control border-dark text-center fw-bold" value="' + esc(val || '') + '" oninput="RD.setPriceField(\'' + p.id + '\',\'' + key + '\',this.value)"></div></div>';
    };
    var fields = '<div class="d-flex flex-wrap gap-3 align-items-end mb-2">';
    if (hasTA) fields += oneField('Selling Price (฿) Take Away', p.priceTakeaway, 'priceTakeaway');
    if (delivCh.length) { var allDlv = delivCh.length === npdDelivery().length; fields += oneField('Selling Price (฿) ' + (allDlv ? 'All Delivery' : 'Delivery (' + delivCh.length + ' ช่องทาง)'), p.priceDelivery, 'priceDelivery'); }
    if (delivCh.length) fields += '<button type="button" class="btn btn-sm ' + (p.splitOpen ? 'btn-success' : 'btn-outline-dark') + ' fw-bold" onclick="RD.toggleSplit(\'' + p.id + '\')"><i class="fas fa-sliders me-1"></i>แยกตามช่องทาง</button>';
    fields += '</div>';
    var split = '';
    if (p.splitOpen && delivCh.length) {
      var inputs = delivCh.map(function (ch) {
        var val = (p.prices[ch] != null && p.prices[ch] !== '') ? p.prices[ch] : (p.priceDelivery || '');
        return '<div style="min-width:118px"><label class="hint fw-bold">' + ch + ' <span class="hint">DLV</span></label><div class="input-group input-group-sm"><span class="input-group-text">฿</span><input type="number" min="0" class="form-control border-secondary text-center" value="' + esc(val) + '" oninput="RD.setPrice(\'' + p.id + '\',\'' + ch + '\',this.value)"></div></div>';
      }).join('');
      split = '<div class="p-2 rounded mb-2" style="background:#f4f6f9;border:1px dashed #c2c8ce"><div class="hint fw-bold mb-1"><i class="fas fa-truck me-1"></i>ราคาแยกรายช่อง Delivery</div><div class="d-flex flex-wrap gap-2">' + inputs + '</div></div>';
    }
    return fields + split;
  }
  function productCard(p, idx) {
    var sm = p.saleModes || [];
    var allOn = sm.length && npdChannels().every(function (c) { return sm.indexOf(c) !== -1; });
    var delvOn = npdDelivery().every(function (c) { return sm.indexOf(c) !== -1; }) && !allOn;
    var allPills = '<label class="sale-pill" style="border-color:#2e934a;background:#e8f6ee"><input type="checkbox" ' + (allOn ? 'checked' : '') + ' onchange="RD.saleAll(\'' + p.id + '\',\'all\',this.checked)"><span class="text-success fw-bold">ALL CHANNELS</span></label>' +
      '<label class="sale-pill" style="border-color:#0dcaf0;background:#e7fafd"><input type="checkbox" ' + (delvOn ? 'checked' : '') + ' onchange="RD.saleAll(\'' + p.id + '\',\'delivery\',this.checked)"><span style="color:#055160" class="fw-bold">ALL DELIVERY</span></label>' +
      '<span class="vr mx-1"></span>';
    var salePills = npdChannels().map(function (ch) {
      var on = sm.indexOf(ch) !== -1;
      var deliv = npdDelivery().indexOf(ch) !== -1;
      return '<label class="sale-pill' + (on ? ' on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="RD.toggleSaleMode(\'' + p.id + '\',\'' + ch + '\')">' + ch + (deliv ? ' <span class="hint">DLV</span>' : '') + '</label>';
    }).join('');
    return '<div class="item-card bg-white shadow-sm mb-4">' +
      '<div class="d-flex justify-content-between align-items-center px-3 py-2" style="background:var(--pc-yellow);border-bottom:2px solid #000;">' +
      '<span class="fw-bold"><i class="fas fa-box-open me-2"></i>ปุ่มสินค้า #' + (idx + 1) + '</span>' +
      '<i class="fas fa-trash-alt text-danger" style="cursor:pointer" onclick="RD.delProduct(\'' + p.id + '\')"></i></div>' +
      '<div class="p-3">' +
        '<div class="row g-3 mb-3">' +
        '<div class="col-md-3"><label class="small fw-bold text-uppercase mb-1">Item Code <span class="cc-resv"><i class="fas fa-hourglass-half"></i> RESERVED</span></label><input class="form-control it-field mono" readonly title="รันอัตโนมัติจากโค้ดกลาง (ตามหมวด)" value="' + esc(p.code) + '" placeholder="— IT —"></div>' +
        '<div class="col-md-3"><label class="small fw-bold text-uppercase mb-1 req">Item Name (EN) <span class="it-tag" style="background:#198754;color:#fff">โชว์บิลครัว</span></label><input class="form-control border-dark" value="' + esc(p.name) + '" oninput="RD.setP(\'' + p.id + '\',\'name\',this.value);RD.posCount(this,40)"><div class="char-count text-muted text-end">' + (p.name || '').length + '/40</div></div>' +
        '<div class="col-md-3"><label class="small fw-bold text-uppercase mb-1">Item Name (TH) <span class="it-tag" style="background:#198754;color:#fff">ปุ่ม POS</span></label><input class="form-control border-dark" value="' + esc(p.th) + '" oninput="RD.setP(\'' + p.id + '\',\'th\',this.value);RD.posCount(this,20)"><div class="char-count text-muted text-end">' + (p.th || '').length + '/20</div></div>' +
        '</div>' +
        '<div class="fw-bold small text-uppercase mb-1"><i class="fas fa-truck me-1 text-warning"></i>Sale Mode (ช่องทางขาย)</div>' +
        '<div class="d-flex flex-wrap gap-2 mb-3">' + allPills + salePills + '</div>' +
        '<div class="fw-bold small text-uppercase mb-1"><i class="fas fa-tag me-1 text-success"></i>Selling Price (฿) — ต่อช่องทางที่ติ๊ก</div>' +
        priceBlock(p) +
        '<div class="fw-bold small text-uppercase mb-1 mt-3"><i class="fas fa-list-ol me-1 text-success"></i>Raw Material — ผูกกับช่องทางขาย</div>' +
        rmTable(p) +
        formulaSection(p) +
      '</div></div>';
  }
  function renderProducts() {
    document.getElementById('productList').innerHTML = state.products.map(productCard).join('');
    refreshUnitDatalist();
  }
  function renderAll() { renderSubsets(); renderProducts(); refreshUnitDatalist(); }

  /* ===================== FLAVOR TAB (per-powder target subset) ===================== */
  function flavorPowderRow(w, i) {
    return '<tr>' +
      '<td><input type="number" min="1" class="form-control form-control-sm text-center fw-bold" style="width:54px" value="' + esc(w.seq || (i + 1)) + '" title="ลำดับแสดงบน POS" oninput="RD.setFW(\'' + w.id + '\',\'seq\',this.value)"></td>' +
      '<td><select class="form-select form-select-sm border-dark" style="min-width:170px" onchange="RD.setFW(\'' + w.id + '\',\'targetSS\',this.value)">' + flavorSubOpts(w.targetSS) + '</select></td>' +
      '<td><input class="form-control form-control-sm mono it-field" readonly title="ไอทีกรอกตอนขึ้นปุ่ม" style="width:90px" value="' + esc(w.cmpos) + '" placeholder="— IT —"></td>' +
      '<td><input class="form-control form-control-sm border-secondary" value="' + esc(w.eng) + '" placeholder="Tom Yum" oninput="RD.setFW(\'' + w.id + '\',\'eng\',this.value)"></td>' +
      '<td><input class="form-control form-control-sm border-secondary" value="' + esc(w.th) + '" placeholder="ต้มยำ" oninput="RD.setFW(\'' + w.id + '\',\'th\',this.value)"></td>' +
      '<td><input class="form-control form-control-sm border-secondary mono" list="rmList" style="width:120px" value="' + esc(w.code) + '" placeholder="Code RM" oninput="RD.setFW(\'' + w.id + '\',\'code\',this.value)" onchange="RD.rmPickF(\'' + w.id + '\',this.value)"></td>' +
      '<td><input class="form-control form-control-sm border-secondary" style="min-width:150px" value="' + esc(w.desc) + '" placeholder="ผงปรุงรส ต้มยำ 500G" oninput="RD.setFW(\'' + w.id + '\',\'desc\',this.value)"></td>' +
      '<td><input type="number" step="any" class="form-control form-control-sm border-secondary text-center" style="width:70px" value="' + esc(w.qty) + '" oninput="RD.setFW(\'' + w.id + '\',\'qty\',this.value)"></td>' +
      '<td><input class="form-control form-control-sm border-secondary text-center" list="unitDatalist" style="width:74px" value="' + esc(w.unit) + '" oninput="RD.setFW(\'' + w.id + '\',\'unit\',this.value)"></td>' +
      '<td><input class="form-control form-control-sm border-secondary" list="spoonList" style="min-width:120px" value="' + esc(w.spoon) + '" placeholder="ช้อน 5 ml * 1 ช้อน" oninput="RD.setFW(\'' + w.id + '\',\'spoon\',this.value)"></td>' +
      '<td><div class="input-group input-group-sm" style="width:92px"><span class="input-group-text px-1">฿</span><input type="number" min="0" class="form-control border-secondary text-center" value="' + esc(w.addon) + '" oninput="RD.setFW(\'' + w.id + '\',\'addon\',this.value)"></div></td>' +
      '<td class="text-center"><i class="fas fa-times text-danger" style="cursor:pointer" onclick="RD.delFW(\'' + w.id + '\')"></i></td></tr>';
  }
  function renderFlavor() {
    var f = state.flavor;
    var rows = f.powders.map(flavorPowderRow).join('');
    document.getElementById('tabFlavor').innerHTML =
      '<div class="alert mb-3" style="background:#e7fafd;border:1px solid #8fe0ef;border-radius:12px;"><i class="fas fa-circle-info me-2 text-info"></i>ใช้เมื่อต้องการ <b>เพิ่มผงรสชาติใหม่</b> เข้าระบบ — กรอกผงใหม่ แล้วเลือก <b>Subset ปลายทาง</b> ของแต่ละผงได้เลย (เลือกจากฐานข้อมูล Subset ที่มีอยู่)</div>' +
      '<div class="bg-white rounded-3 shadow-sm border mb-3"><div class="sec-head"><i class="fas fa-circle-info me-2 text-warning"></i>ข้อมูลทั่วไป (Flavor Project)</div>' +
      '<div class="p-3"><div class="row g-3">' +
      '<div class="col-12 mb-1"><label class="small fw-bold" style="cursor:pointer;display:inline-flex;align-items:center;gap:7px"><input type="checkbox" ' + (f.saleType === 'seasonal' ? 'checked' : '') + ' onchange="RD.setF(\'saleType\', this.checked?\'seasonal\':\'core\')"> ประเภทการขาย — ติ๊ก = <b>สินค้าขายชั่วคราว</b> · ไม่ติ๊ก = <b>สินค้าขายหลัก</b></label></div>' +
      '<div class="col-md-5"><label class="small fw-bold text-uppercase mb-1 req">ชื่อชุดผงรสชาติ / Project</label><input class="form-control border-dark" value="' + esc(f.project) + '" oninput="RD.setF(\'project\',this.value)"></div>' +
      '<div class="col-md-3"><label class="small fw-bold text-uppercase mb-1 req">วันที่เริ่ม</label><input type="date" class="form-control border-dark" value="' + esc(f.start) + '" oninput="RD.setF(\'start\',this.value)"></div>' +
      '<div class="col-md-2"><label class="small fw-bold text-uppercase mb-1 req">วันที่สิ้นสุด</label><input type="date" class="form-control border-dark" value="' + esc(f.end) + '" oninput="RD.setF(\'end\',this.value)"></div>' +
      '<div class="col-md-2"><label class="small fw-bold text-uppercase mb-1">RD ผู้แจ้ง</label><input class="form-control it-field" readonly title="ชื่อผู้เข้าสู่ระบบ" value="' + esc(f.rd) + '"></div>' +
      '</div></div></div>' +
      '<div class="bg-white rounded-3 shadow-sm border mb-4"><div class="sec-head"><i class="fas fa-mortar-pestle me-2 text-warning"></i>ผงรสชาติใหม่ (New Powder) — เลือก Subset ปลายทางของแต่ละผง</div>' +
      '<div class="p-3"><div class="table-responsive border border-dark rounded"><table class="table table-sm align-middle m-0 powder-tbl">' +
      '<thead><tr><th style="width:34px">No</th><th>Subset ปลายทาง</th><th>CMPOS <span class="it-tag">IT</span></th><th>Name (EN) <span class="it-tag" style="background:#198754;color:#fff">Bill Kitchen</span></th><th>Name (TH) <span class="it-tag" style="background:#198754;color:#fff">Button POS</span></th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon Size</th><th>Price</th><th style="width:30px"></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<button class="btn btn-sm btn-dark fw-bold mt-2" onclick="RD.addFW()"><i class="fas fa-plus me-1"></i>เพิ่มผงใหม่อีกตัว</button></div></div>' +
      '<div class="text-center mb-2"><button class="btn btn-warning shadow px-5 py-3 fw-bold border border-dark text-dark" style="min-width:380px;font-size:1.15rem;border-radius:12px;" onclick="RD.submit(\'flavor\')">ส่งให้ IT ขึ้นปุ่ม <i class="fas fa-paper-plane ms-2"></i></button></div>';
    refreshUnitDatalist();
  }

  /* ===================== handlers ===================== */
  var RD = {};
  RD.switchTab = function (t) {
    state.tab = t;
    document.getElementById('tabNew').style.display = t === 'new' ? 'block' : 'none';
    document.getElementById('tabFlavor').style.display = t === 'flavor' ? 'block' : 'none';
    document.getElementById('tabBtnNew').classList.toggle('active', t === 'new');
    document.getElementById('tabBtnFlavor').classList.toggle('active', t === 'flavor');
    if (t === 'flavor') renderFlavor();
  };

  /* Item Code ปุ่มสินค้า — รันตามหมวดที่เลือก (reserveCat(cateCode) = CATECODE+running) · คืนเลขตอนลบ/เปลี่ยนหมวด */
  /* FX-P81 — เลขที่ตัวนับคืนเข้าคลัง (freed) อาจถูกใช้ไปแล้วโดยงานอื่น/ข้อมูลหลัก
     → จองแล้วต้องเช็คซ้ำก่อนใช้ ถ้าชนให้ข้ามไปเลขถัดไป (สูงสุด 25 รอบ) */
  function npdCodeTaken(code) {
    code = String(code || '').trim(); if (!code) return false;
    try { if (window.PC_API && PC_API.checkCode) { var r = PC_API.checkCode('item', code); if (r && r.status === 'dup') return true; } } catch (e) {}
    try { var MD = (window.PC_API && PC_API.getMasterDataExtended) ? (PC_API.getMasterDataExtended().items || []) : []; if (MD.some(function (m) { return String(m.itemCode) === code; })) return true; } catch (e) {}
    return false;
  }
  function npdReserveItem(cat) {
    try {
      if (!cat || !window.PC_COUNTER || !PC_COUNTER.reserveCat) return '';
      var skipped = [];
      for (var i = 0; i < 25; i++) {
        var e = PC_COUNTER.reserveCat(String(cat), { where: 'NPD (RD ปุ่มสินค้า · หมวด ' + cat + ')' });
        if (!e || !e.code) break;
        if (!npdCodeTaken(e.code)) {
          /* เลขที่ข้ามไป = ถูกใช้จริงแล้ว ปล่อยค้างไว้ไม่ต้องคืน (กันแจกซ้ำอีก) */
          if (skipped.length && window.Swal) Swal.fire({ toast: true, position: 'top-end', timer: 3500, showConfirmButton: false, icon: 'info', title: 'ข้ามเลขที่ถูกใช้แล้ว ' + skipped.length + ' เลข', text: 'ได้เลข ' + e.code });
          return e.code;
        }
        skipped.push(e.code);
      }
    } catch (x) {}
    return '';
  }
  function npdReturnItem(code) { try { if (window.PC_COUNTER && PC_COUNTER.returnCode && String(code || '').trim()) PC_COUNTER.returnCode(String(code).trim(), 'item', { from: 'NPD (RD เปลี่ยนหมวด/ลบปุ่ม)' }); } catch (x) {} }
  /* sync item code ของทุกปุ่มให้ตรงกับ cateCode ปัจจุบัน */
  function npdSyncItemCodes() {
    var cc = String(state.cateCode || '').trim();
    (state.products || []).forEach(function (p) {
      if (p._codeCat === cc && p.code) return;              // ตรงหมวดแล้ว ข้าม
      if (p.code) { npdReturnItem(p.code); p.code = ''; }     // หมวดเปลี่ยน/ล้าง → คืนเลขเก่า
      if (cc) { p.code = npdReserveItem(cc); p._codeCat = cc; } else { p._codeCat = ''; }
    });
  }
  RD.setP = function (pid, k, v) { var p = P(pid); if (p) p[k] = v; };
  RD.setCat = function (v) { state.category = v; };
  RD.catPick = function (v) { state.category = v; var c = CAT_LIST.find(function (x) { return x.name.toLowerCase() === String(v || '').trim().toLowerCase(); }); state.cateCode = c ? c.code : ''; if (state.cateCode) state.dept = deptOf(state.cateCode); var el = document.getElementById('npCateCode'); if (el) el.value = state.cateCode; renderDeptList(); npdSyncItemCodes(); renderProducts(); };

  /* ===== participating-stores selection ("Add Shop" pattern) ===== */
  function condKey(c) { return c.type + '|' + c.code; }
  function condBranchCount(conds) {
    var set = {}; conds.forEach(function (c) { (c.ids || []).forEach(function (id) { set[id] = 1; }); });
    return Object.keys(set).length;
  }
  function renderStores() {
    var lbl = document.getElementById('npStoreLabel'); if (!lbl) return;
    if (state.storeMode === 'ALL' || !state.storeConds.length) { lbl.innerHTML = '<i class="fas fa-store me-1 text-success"></i>ทุกสาขา (ALL STORES)'; return; }
    var nBranch = condBranchCount(state.storeConds);
    var byType = {};
    state.storeConds.forEach(function (c) { var t = c.type; if (!byType[t]) byType[t] = { conds: 0, ids: {} }; byType[t].conds++; (c.ids || []).forEach(function (id) { byType[t].ids[id] = 1; }); });
    var typeChips = Object.keys(byType).map(function (t) {
      var b = byType[t]; var nb = Object.keys(b.ids).length;
      return '<span class="badge bg-secondary me-1 d-inline-flex align-items-center" style="font-weight:500;gap:5px">' +
        '<i class="fas fa-layer-group" style="opacity:.7"></i>' + esc(t) + ' · ' + nb + ' สาขา' +
        '<i class="fas fa-times-circle" style="cursor:pointer;opacity:.8" title="ลบทั้งหมวดนี้" onclick="RD.storeRemoveType(\'' + esc(t) + '\')"></i></span>';
    }).join('');
    lbl.innerHTML = '<div class="d-flex align-items-center gap-2 flex-wrap w-100">' +
      '<span class="badge bg-success" style="font-weight:600"><i class="fas fa-store me-1"></i>รวม ' + nBranch + ' สาขา</span>' +
      typeChips +
      '<div class="d-flex gap-1 ms-auto">' +
      '<button type="button" class="btn btn-sm btn-dark py-0 px-2" style="font-size:.74rem" onclick="RD.storeDetail()"><i class="fas fa-list-ul me-1"></i>ดูรายละเอียด</button>' +
      '<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size:.74rem" onclick="RD.storeClearAll()" title="ล้างทั้งหมด"><i class="fas fa-trash-alt me-1"></i>ล้าง</button>' +
      '</div></div>';
  }
  RD.storeRemoveType = function (t) { state.storeConds = state.storeConds.filter(function (c) { return c.type !== t; }); state.storeMode = state.storeConds.length ? 'SELECT' : 'ALL'; renderStores(); };
  RD.storeClearAll = function () { state.storeConds = []; state.storeMode = 'ALL'; renderStores(); };
  RD.storeDetail = function () {
    var conds = state.storeConds;
    var set = {}; conds.forEach(function (c) { (c.ids || []).forEach(function (id) { set[id] = 1; }); });
    var totalIds = Object.keys(set);
    var rowsByType = {};
    conds.forEach(function (c) { (rowsByType[c.type] = rowsByType[c.type] || []).push(c); });
    var sections = Object.keys(rowsByType).map(function (t) {
      var tset = {}; rowsByType[t].forEach(function (c) { (c.ids || []).forEach(function (id) { tset[id] = 1; }); });
      var ids = Object.keys(tset);
      var condBadges = rowsByType[t].map(function (c) { return '<span class="badge bg-dark me-1 mb-1" style="font-weight:500">' + esc(c.code) + ' · ' + esc(c.d1) + '</span>'; }).join('');
      var brRows = ids.map(function (id) {
        var b = BRANCHES.find(function (x) { return x.id === id; }) || { id: id, en: '', th: '' };
        return '<tr><td class="fw-bold text-primary">' + esc(b.id) + '</td><td>' + esc(b.en) + '</td><td>' + esc(b.th) + '</td></tr>';
      }).join('');
      return '<div class="mb-3 border rounded-3" style="overflow:hidden">' +
        '<div class="px-2 py-1 fw-bold d-flex justify-content-between align-items-center" style="background:#2f6dab;color:#fff;font-size:.85rem"><span><i class="fas fa-layer-group me-1"></i>' + esc(t) + ' · ' + ids.length + ' สาขา</span></div>' +
        '<div class="p-2"><div class="mb-2">' + condBadges + '</div>' +
        '<div style="max-height:30vh;overflow:auto"><table class="table table-sm table-hover m-0" style="font-size:.8rem"><thead style="position:sticky;top:0;background:#eef1f4"><tr><th>Code</th><th>Branch (EN)</th><th>Branch (TH)</th></tr></thead><tbody>' + (brRows || '<tr><td colspan="3" class="text-muted text-center py-2">—</td></tr>') + '</tbody></table></div></div></div>';
    }).join('');
    Swal.fire({
      title: '<span style="font-size:1rem">สาขาที่ร่วมรายการ · รวม ' + totalIds.length + ' สาขา</span>', width: 700,
      html: '<div class="text-start" style="max-height:62vh;overflow:auto">' + sections + '</div>',
      confirmButtonColor: '#1a1d20', confirmButtonText: 'ปิด',
      showDenyButton: true, denyButtonText: 'ล้างทั้งหมด', denyButtonColor: '#dc3545'
    }).then(function (r) { if (r.isDenied) { RD.storeClearAll(); } });
  };
  RD.storeRows = function () {
    var type = document.getElementById('stType').value;
    var q = (document.getElementById('stSearch').value || '').toLowerCase();
    var data = SHOP_DATA[type] || { c: '', rows: [] };
    document.getElementById('stColCode').textContent = data.c + ' Code';
    document.getElementById('stColD1').textContent = data.c + ' Des1';
    document.getElementById('stColD2').textContent = data.c + ' Des2';
    var filtered = data.rows.filter(function (r) { return !q || (r.code + ' ' + r.d1 + ' ' + r.d2).toLowerCase().indexOf(q) !== -1; });
    var rows = filtered.map(function (r) {
      var on = RD._stTmp.some(function (c) { return c.type === type && c.code === r.code; });
      return '<tr style="cursor:pointer" class="' + (on ? 'table-warning' : '') + '" onclick="RD.storeToggle(\'' + esc(r.code) + '\')"><td class="text-center"><input type="checkbox" class="form-check-input" ' + (on ? 'checked' : '') + ' onclick="event.stopPropagation();RD.storeToggle(\'' + esc(r.code) + '\')"></td>' +
        '<td class="fw-bold text-primary">' + esc(r.code) + '</td><td>' + esc(r.d1) + '</td><td>' + esc(r.d2) + '</td></tr>';
    }).join('');
    document.getElementById('stBody').innerHTML = rows || '<tr><td colspan="4" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>';
    var allOn = filtered.length && filtered.every(function (r) { return RD._stTmp.some(function (c) { return c.type === type && c.code === r.code; }); });
    var allBox = document.getElementById('stAll'); if (allBox) allBox.checked = !!allOn;
    document.getElementById('stCount').textContent = 'เลือก ' + RD._stTmp.length + ' เงื่อนไข · ' + condBranchCount(RD._stTmp) + ' สาขา';
  };
  RD.openStoreModal = function () {
    RD._stTmp = state.storeConds.slice();
    RD.storeRows();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('storeModal')).show();
  };
  RD.storeToggle = function (code) {
    var type = document.getElementById('stType').value;
    var data = SHOP_DATA[type] || { rows: [] };
    var r = data.rows.find(function (x) { return x.code === code; }); if (!r) return;
    var i = RD._stTmp.findIndex(function (c) { return c.type === type && c.code === code; });
    if (i === -1) RD._stTmp.push({ type: type, code: r.code, d1: r.d1, d2: r.d2, ids: r.ids || [] }); else RD._stTmp.splice(i, 1);
    RD.storeRows();
  };
  RD.storeToggleAll = function (on) {
    var type = document.getElementById('stType').value;
    var q = (document.getElementById('stSearch').value || '').toLowerCase();
    var data = SHOP_DATA[type] || { rows: [] };
    var filtered = data.rows.filter(function (r) { return !q || (r.code + ' ' + r.d1 + ' ' + r.d2).toLowerCase().indexOf(q) !== -1; });
    filtered.forEach(function (r) {
      var i = RD._stTmp.findIndex(function (c) { return c.type === type && c.code === r.code; });
      if (on && i === -1) RD._stTmp.push({ type: type, code: r.code, d1: r.d1, d2: r.d2, ids: r.ids || [] });
      if (!on && i !== -1) RD._stTmp.splice(i, 1);
    });
    RD.storeRows();
  };
  RD.storeClear = function () { RD._stTmp = []; RD.storeRows(); };
  RD.storeApply = function () {
    state.storeConds = RD._stTmp.slice();
    var _allSet = {}; state.storeConds.forEach(function (c) { (c.ids || []).forEach(function (id) { _allSet[id] = 1; }); });
    if (BRANCHES.length && Object.keys(_allSet).length >= BRANCHES.length) { state.storeConds = []; state.storeMode = 'ALL'; }
    else state.storeMode = state.storeConds.length ? 'SELECT' : 'ALL';
    renderStores();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('storeModal')).hide();
  };
  RD._stTmp = [];
  RD.setPrice = function (pid, ch, v) { var p = P(pid); if (p) { p.prices = p.prices || {}; p.prices[ch] = v; } };
  RD.setPriceField = function (pid, k, v) { var p = P(pid); if (p) p[k] = v; };
  RD.toggleSplit = function (pid) { var p = P(pid); if (p) { p.splitOpen = !p.splitOpen; renderProducts(); } };
  RD.posCount = function (el, limit) { limit = limit || 20; var c = el.parentElement.querySelector('.char-count'); if (c) { var n = el.value.length, over = n > limit; c.textContent = n + '/' + limit + (over ? ' • เกิน ' + limit + ' ตัว' : ''); c.className = 'char-count text-end ' + (over ? 'text-danger fw-bold' : 'text-muted'); } };
  RD.setR = function (pid, i, k, v) { var p = P(pid); if (p && p.recipes[i]) { p.recipes[i][k] = v; if (k === 'unit') refreshUnitDatalist(); if (k === 'code') { var row = document.querySelectorAll('[data-prod="' + pid + '"] .rm-row')[i]; if (!String(v || '').trim()) { p.recipes[i].desc = ''; p.recipes[i].unit = ''; if (row) { var d0 = row.querySelector('.rm-desc'); if (d0) d0.value = ''; var u0 = row.querySelector('.rm-unit'); if (u0) u0.value = ''; } } else { var rm = rmFind(v); if (rm) { p.recipes[i].desc = rm.desc; if (rm.unit) p.recipes[i].unit = rm.unit; if (row) { var d = row.querySelector('.rm-desc'); if (d) d.value = rm.desc; var u = row.querySelector('.rm-unit'); if (u && rm.unit) u.value = rm.unit; } } } } } };
  RD.rmPickR = function (pid, i, code) { var p = P(pid); if (!p || !p.recipes[i]) return; p.recipes[i].code = code; if (!String(code || '').trim()) { p.recipes[i].desc = ''; p.recipes[i].unit = ''; renderProducts(); return; } var rm = rmFind(code); if (rm) { p.recipes[i].desc = rm.desc; if (rm.unit) p.recipes[i].unit = rm.unit; } renderProducts(); };
  RD.addProduct = function () { var p = mkProduct({ recipes: [mkRecipe()] }); if (String(state.cateCode || '').trim()) { p.code = npdReserveItem(state.cateCode); p._codeCat = state.cateCode; } state.products.push(p); renderProducts(); };
  RD.delProduct = function (pid) { var p0 = P(pid); if (p0 && p0.code) npdReturnItem(p0.code); state.products = state.products.filter(function (p) { return p.id !== pid; }); renderProducts(); };
  RD.addR = function (pid) { var p = P(pid); if (p) { p.recipes.push(mkRecipe({ channels: (p.saleModes || []).slice() })); renderProducts(); } };
  RD.delR = function (pid, i) { var p = P(pid); if (p) { p.recipes.splice(i, 1); if (!p.recipes.length) p.recipes.push(mkRecipe()); renderProducts(); } };
  RD.toggleSaleMode = function (pid, ch) {
    var p = P(pid); if (!p) return;
    p.saleModes = p.saleModes || [];
    var i = p.saleModes.indexOf(ch);
    if (i === -1) {
      p.saleModes.push(ch);
      (p.recipes || []).forEach(function (r) { r.channels = r.channels || []; if (r.channels.indexOf(ch) === -1) r.channels.push(ch); });
    } else {
      p.saleModes.splice(i, 1);
      (p.recipes || []).forEach(function (r) { r.channels = (r.channels || []).filter(function (c) { return c !== ch; }); });
    }
    renderProducts();
  };
  RD.saleAll = function (pid, kind, on) {
    var p = P(pid); if (!p) return; p.saleModes = p.saleModes || [];
    var affected = (kind === 'all') ? npdChannels() : npdDelivery();
    if (kind === 'all' && !on) { p.saleModes = []; }
    else { affected.forEach(function (c) { var i = p.saleModes.indexOf(c); if (on && i === -1) p.saleModes.push(c); if (!on && i !== -1) p.saleModes.splice(i, 1); }); }
    (p.recipes || []).forEach(function (r) {
      r.channels = r.channels || [];
      affected.forEach(function (c) { var i = r.channels.indexOf(c); if (on && i === -1) r.channels.push(c); if (!on && i !== -1) r.channels.splice(i, 1); });
      r.channels = r.channels.filter(function (c) { return p.saleModes.indexOf(c) !== -1; });
    });
    renderProducts();
  };
  RD.toggleRmCh = function (pid, ri, ch) {
    var p = P(pid); if (!p || !p.recipes[ri]) return;
    var r = p.recipes[ri]; r.channels = r.channels || [];
    var i = r.channels.indexOf(ch);
    if (i === -1) r.channels.push(ch); else r.channels.splice(i, 1);
    renderProducts();
  };

  /* subset pool handlers (product-independent) */
  RD.setS = function (sid, k, v) { var s = Ssub(sid); if (s) s[k] = v; if (k === 'name' || k === 'cat') renderProducts(); };
  RD.setW = function (sid, wid, k, v) { var s = Ssub(sid); if (!s) return; var w = s.powders.find(function (x) { return x.id === wid; }); if (w) { w[k] = v; if (k === 'unit') refreshUnitDatalist(); if (k === 'code' && !String(v || '').trim()) { w.desc = ''; w.unit = ''; } } };
  RD.rmPick = function (sid, wid, code) {
    var s = Ssub(sid); if (!s) return; var w = s.powders.find(function (x) { return x.id === wid; }); if (!w) return;
    w.code = code; if (!String(code || '').trim()) { w.desc = ''; w.unit = ''; renderSubsets(); return; } var rm = rmFind(code); if (rm) { w.desc = rm.desc; if (rm.unit) w.unit = rm.unit; } renderSubsets();
  };
  /* Auto-run SS code ผ่านระบบเลขโค้ดกลาง — จองเลขทันทีตอนเพิ่ม Subset (ถือว่ามีข้อมูลแล้ว);
     ลบ Subset ที่ยังไม่บันทึก = คืนเลข (ไม่เผาทิ้ง) → เลขไม่ข้าม · เฉพาะเลข CONFIRMED (บันทึกแล้ว) ถึงเผาทิ้ง */
  function npdReserveSS() { try { if (window.PC_COUNTER && PC_COUNTER.reserve) { var e = PC_COUNTER.reserve('ss', { where: 'NPD (RD เพิ่ม Subset)' }); return e ? e.code : ''; } } catch (x) {} return ''; }
  function npdReturnSS(code) { try { if (window.PC_COUNTER && PC_COUNTER.returnCode && String(code || '').trim()) PC_COUNTER.returnCode(String(code).trim(), 'ss', { from: 'NPD (RD ลบ Subset)' }); } catch (x) {} }
  /* CMPOS รายผง (ปุ่มบน POS) — รันใน หมวดผง (Flavors = 103) แบบ CATECODE+running · คืนเลขตอนลบ (type item) */
  var POWDER_CAT = '103';
  function npdReserveCMPOS() { try { if (window.PC_COUNTER && PC_COUNTER.reserveCat) { var e = PC_COUNTER.reserveCat(POWDER_CAT, { where: 'NPD (RD เพิ่มผง · หมวดผง ' + POWDER_CAT + ')' }); return e ? e.code : ''; } } catch (x) {} return ''; }
  function npdReturnCMPOS(code) { try { if (window.PC_COUNTER && PC_COUNTER.returnCode && String(code || '').trim()) PC_COUNTER.returnCode(String(code).trim(), 'item', { from: 'NPD (RD ลบผง)' }); } catch (x) {} }
  RD.addS = function () {
    if (!window.Swal) { var sub0 = mkSubset({ powders: stdPowders(1) }); sub0.ssCode = npdReserveSS(); state.subsets.push(sub0); renderAll(); return; }
    Swal.fire({
      title: 'เลือกสูตรผงเริ่มต้น',
      html: '<div style="text-align:left;font-size:13.5px;color:#555">เลือกสูตรผงมาตรฐานสำหรับ Subset ใหม่ — ชื่อผง/ตัวย่อเหมือนกัน ต่างกันที่ค่าเริ่มต้น <b>ขนาดช้อน</b><br><br><b>สูตร 1</b> · ช้อนน้อย (1–2 ช้อน)<br><b>สูตร 2</b> · ช้อนมาก (1.5–3 ช้อน)</div>',
      showDenyButton: true, showCancelButton: true,
      confirmButtonText: '<i class="fas fa-flask me-1"></i>สูตร 1', denyButtonText: '<i class="fas fa-flask me-1"></i>สูตร 2', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#2e934a', denyButtonColor: '#b9860b'
    }).then(function (r) {
      if (r.isDismissed) return;
      var f = r.isDenied ? 2 : 1;
      var sub = mkSubset({ powders: stdPowders(f) }); sub.ssCode = npdReserveSS(); state.subsets.push(sub); renderAll();
    });
  };
  RD.applyN2 = function (sid) { var s = Ssub(sid); if (!s) return; applyName2Suffix(s, s._appliedN2 || '', s.name2 || ''); s._appliedN2 = String(s.name2 || '').trim(); renderSubsets(); renderProducts();
    var ab = String(s.name2 || '').trim(); if (ab && dbHasSubAbbr(ab, sid)) npdDupToast('ตัวย่อ "' + ab + '" ซ้ำกับ Subset ที่มีอยู่แล้ว (ตรวจจากฐานข้อมูล) — กรุณาใช้ตัวย่ออื่น'); };
  /* dup-check helpers — เทียบกับฐานข้อมูลจริง (SUBSETS_MASTER) + Subset ในฟอร์ม */
  function dbHasSubName(name, exceptSid) { var nrm = function (s) { return String(s || '').replace(/\s+/g, ''); }; name = nrm(name); if (!name) return false;
    if (SUBSETS_MASTER.some(function (s) { return nrm(s.name) === name; })) return true;
    return state.subsets.some(function (s) { return s.id !== exceptSid && nrm(s.name) === name; }); }
  function dbHasSubAbbr(ab, exceptSid) { var nrm = function (s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); }; ab = nrm(ab); if (!ab) return false;
    if (SUBSETS_MASTER.some(function (s) { return nrm(s.short) === ab; })) return true;
    return state.subsets.some(function (s) { return s.id !== exceptSid && nrm(s.name2) === ab; }); }
  function npdDupToast(msg) { Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: msg, showConfirmButton: false, timer: 4000, timerProgressBar: true }); }
  RD.checkSubName = function (sid) { var s = Ssub(sid); if (!s) return; var nm = String(s.name || '').trim(); if (nm && dbHasSubName(nm, sid)) npdDupToast('ชื่อ "' + nm + '" ซ้ำกับ Subset ที่มีอยู่แล้ว (ตรวจจากฐานข้อมูล) — กรุณาใช้ชื่ออื่น'); };
  RD.editSub = function (sid) { var s = Ssub(sid); if (!s) return; s.registered = false; renderAll(); };
  RD.registerSub = function (sid) {    var s = Ssub(sid); if (!s) return;
    var nm = String(s.name || '').trim();
    if (!nm) { Swal.fire('กรอกชื่อก่อน', 'กรุณากรอก Subset Name ก่อนกดเพิ่ม', 'warning'); return; }
    if (!String(s.name2 || '').trim()) { Swal.fire('กรอก Subset Name 2', 'กรุณากรอกตัวย่อผงที่โชว์บน POS (เช่น FF1) ก่อนกดเพิ่ม', 'warning'); return; }
    var dup = dbHasSubName(nm, sid);
    if (dup) { Swal.fire('ชื่อซ้ำ', 'มี Subset ชื่อ "' + nm + '" อยู่แล้ว (ในฟอร์มหรือฐานข้อมูล) — กรุณาใช้ชื่ออื่น', 'error'); return; }
    var n2 = String(s.name2 || '').trim();
    var dup2 = dbHasSubAbbr(n2, sid);
    if (dup2) { Swal.fire('ตัวย่อซ้ำ', 'มี Subset ที่ใช้ตัวย่อ (Name 2) "' + n2 + '" อยู่แล้ว (ในฟอร์มหรือฐานข้อมูล) — กรุณาใช้ตัวย่ออื่น', 'error'); return; }
    s.registered = true; renderAll();
  };
  RD.delS = function (sid) { var s0 = Ssub(sid); if (s0) { if (s0.ssCode) npdReturnSS(s0.ssCode); (s0.powders || []).forEach(function (w) { npdReturnCMPOS(w.cmpos); }); } state.subsets = state.subsets.filter(function (s) { return s.id !== sid; }); state.products.forEach(function (p) { p.formulas = (p.formulas || []).filter(function (f) { return f.subId !== sid; }); }); renderAll(); };
  RD.addW = function (sid) {
    var s = Ssub(sid); if (!s) return;
    var w = mkPowder({ unit: 'g' }); w.cmpos = npdReserveCMPOS();
    // ลำดับถัดไป = max seq ที่ไม่ใช่ 99 + 1 (ต่อท้ายผงเกลือ/ผงสุดท้าย)
    var maxSeq = 0; (s.powders || []).forEach(function (p) { var n = parseInt(p.seq, 10); if (!isNaN(n) && n !== 99 && n > maxSeq) maxSeq = n; });
    w.seq = maxSeq + 1;
    // แทรกก่อนแถว No flavor เพื่อให้ No flavor (99) อยู่ล่างสุดเสมอ
    var nfIdx = -1; (s.powders || []).forEach(function (p, idx) { if (p.noFlavor && nfIdx < 0) nfIdx = idx; });
    if (nfIdx >= 0) s.powders.splice(nfIdx, 0, w); else s.powders.push(w);
    renderAll();
  };
  RD.delW = function (sid, wid) { var s = Ssub(sid); if (s) { var w0 = s.powders.find(function (w) { return w.id === wid; }); if (w0) npdReturnCMPOS(w0.cmpos); s.powders = s.powders.filter(function (w) { return w.id !== wid; }); renderAll(); } };

  /* formula handlers (per product) */
  RD.addFormula = function (pid) { var p = P(pid); if (p) { var reg = state.subsets.filter(function (x) { return x.registered; }); p.formulas.push({ id: uid('f'), subId: reg[0] ? reg[0].id : '', chooseMin: 1, chooseMax: 1 }); renderProducts(); } };
  RD.delFormula = function (pid, fid) { var p = P(pid); if (p) { p.formulas = p.formulas.filter(function (f) { return f.id !== fid; }); renderProducts(); } };
  RD.setFormula = function (pid, fid, k, v) { var p = P(pid); if (p) { var f = p.formulas.find(function (x) { return x.id === fid; }); if (f) { f[k] = v; if (k === 'subId') renderProducts(); } } };

  /* flavor handlers */
  RD.setF = function (k, v) { state.flavor[k] = v; };
  RD.setFW = function (wid, k, v) { var w = state.flavor.powders.find(function (x) { return x.id === wid; }); if (w) { w[k] = v; if (k === 'unit') refreshUnitDatalist(); if (k === 'code' && !String(v || '').trim()) { w.desc = ''; w.unit = ''; } } };
  RD.rmPickF = function (wid, code) { var w = state.flavor.powders.find(function (x) { return x.id === wid; }); if (!w) return; w.code = code; if (!String(code || '').trim()) { w.desc = ''; w.unit = ''; renderFlavor(); return; } var rm = rmFind(code); if (rm) { w.desc = rm.desc; if (rm.unit) w.unit = rm.unit; } renderFlavor(); };
  RD.addFW = function () { state.flavor.powders.push(mkPowder({ unit: 'g' })); renderFlavor(); };
  RD.delFW = function (wid) { state.flavor.powders = state.flavor.powders.filter(function (w) { return w.id !== wid; }); if (!state.flavor.powders.length) state.flavor.powders.push(mkPowder({ unit: 'g' })); renderFlavor(); };

  /* ===================== submit (wired to backend) ===================== */
  function backendOn() { return (typeof google !== 'undefined' && google.script && google.script.run); }
  function warnFill(m) { Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: m, confirmButtonColor: '#000' }); return false; }
  function getVal(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }

  /* build the NPD payload that matches the backend/IT/Op/Campaign data shape */
  function buildNewPayload() {
    var storeStr, storeConds = [];
    if (state.storeMode === 'ALL' || !state.storeConds.length) { storeStr = 'ALL'; }
    else {
      var set = {}; state.storeConds.forEach(function (c) { (c.ids || []).forEach(function (id) { set[id] = 1; }); });
      storeStr = Object.keys(set).join(', '); storeConds = state.storeConds.slice();
    }
    var depCode = state.dept || deptOf(state.cateCode);
    var subsets = state.subsets.filter(function (s) { return String(s.name || '').trim(); }).map(function (s) {
      return {
        ssCode: s.ssCode || '', name: String(s.name).trim(), name2: String(s.name2 || '').trim(), cat: s.cat || '', registered: !!s.registered,
        powders: (s.powders || []).map(function (w) {
          /* `price` เป็นชื่อเดิมที่ฝั่ง IT ใช้ ส่วน `addon` เก็บไว้ด้วยเพื่อให้
             การสร้าง Product Master ผงไม่ทำราคา Add-on หาย */
          var addon = (w.addon === '' || w.addon == null) ? '' : num(w.addon);
          return { cmpos: w.cmpos || '', eng: w.eng || '', th: w.th || '', code: w.code || '', desc: w.desc || '', qty: w.qty || '', unit: w.unit || '', spoon: w.spoon || '', price: addon, addon: addon, seq: w.seq || '', noFlavor: !!w.noFlavor, std: !!w.std, targetSS: w.targetSS || '' };
        })
      };
    });
    var items = state.products.map(function (p) {
      return {
        name: String(p.name || '').trim(), th: String(p.th || '').trim(), code: p.code || '',
        /* เก็บ master attributes ไว้ที่ item ด้วย เพื่อให้ขั้น IT COMPLETE
           สร้าง Product Master ได้โดยไม่ต้องเดาจากเลขรหัสสินค้า */
        category: state.category || '', cateCode: state.cateCode || '',
        department: deptName(depCode), depCode: depCode,
        sellStores: storeStr, storeConds: storeConds.slice(),
        saleModes: (p.saleModes || []).slice(), priceTakeaway: p.priceTakeaway || '', priceDelivery: p.priceDelivery || '',
        prices: Object.assign({}, p.prices || {}),
        recipes: (p.recipes || []).map(function (r) { return { code: r.code || '', desc: r.desc || '', qty: r.qty || '', unit: r.unit || '', channels: (r.channels || []).slice() }; }),
        formulas: (p.formulas || []).map(function (f) { var s = resolveFormulaSub(f.subId); var mn = parseInt(f.chooseMin != null ? f.chooseMin : f.choose, 10) || 1; var mx = parseInt(f.chooseMax != null ? f.chooseMax : f.choose, 10) || mn; if (mx < mn) mx = mn; return { ss: s ? (s.ssCode || s.name || '') : '', ssName: s ? (s.name || '') : '', chooseMin: mn, chooseMax: mx, choose: mx }; })
      };
    });
    return {
      project: getVal('npProject'), start: getVal('npStart'), end: getVal('npEnd'),
      store: storeStr, storeMode: state.storeMode || 'ALL', storeConds: storeConds, remark: '', rd: getVal('npRd') || loginUser(),
      category: state.category || '', cateCode: state.cateCode || '', depCode: depCode, department: deptName(depCode),
      subsets: subsets, items: items
    };
  }

  RD.resetNew = function () {
    state.subsets = []; state.products = [mkProduct({ recipes: [mkRecipe()] })];
    state.storeConds = []; state.storeMode = 'ALL'; state.category = ''; state.cateCode = '';
    var pj = document.getElementById('npProject'); if (pj) pj.value = '';
    var ce = document.getElementById('npCategory'); if (ce) ce.value = '';
    var cc = document.getElementById('npCateCode'); if (cc) cc.value = '';
    renderStores(); renderAll();
  };
  RD.resetFlavor = function () { state.flavor.powders = [mkPowder({ unit: 'g' })]; renderFlavor(); };
  /* ออกจากหน้า NPD โดยไม่บันทึก → คืนเลข SS + CMPOS ที่จองไว้เข้า counter กลาง
     (หลังกดส่งสำเร็จ resetNew เคลียร์ state.subsets แล้ว จึงไม่คืนเลขที่ส่งไปจริง) */
  /* ── ลายเซ็นข้อมูล (เฉพาะช่องที่ "ผู้ใช้กรอกจริง") — เทียบกับ baseline ตอนเปิดหน้า
     เพื่อไม่ให้ข้อมูลตัวอย่าง (seed) ที่ระบบใส่ไว้เอง ถูกนับว่าเป็น "ข้อมูลกรอกค้าง" ── */
  function npdSig() {
    try {
      var p = [];
      var g = function (id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
      p.push('P:' + g('npProject'));
      p.push('C:' + (state.category || ''));
      (state.products || []).forEach(function (x) {
        var v = String(x.name || '').trim() + '|' + String(x.th || '').trim() + '|' + String(x.code || '').trim();
        if (v !== '||') p.push('p:' + v);
      });
      (state.subsets || []).forEach(function (s) {
        if (String(s.name || '').trim() || String(s.name2 || '').trim()) p.push('s:' + String(s.name || '').trim() + '|' + String(s.name2 || '').trim());
        (s.powders || []).forEach(function (w) { if (String(w.eng || '').trim() || String(w.code || '').trim()) p.push('sw:' + String(w.eng || '').trim() + String(w.code || '').trim()); });
      });
      ((state.flavor && state.flavor.powders) || []).forEach(function (w) { if (String(w.eng || '').trim()) p.push('f:' + String(w.eng || '').trim() + String(w.code || '').trim()); });
      return p.join('~');
    } catch (e) { return ''; }
  }
  /* มีข้อมูลกรอกค้าง (ต่างจากตอนเปิดหน้า) ไหม — สำหรับ leave-guard */
  function npdHasData() { return npdSig() !== (window.__npdBaseline || ''); }

  /* ── Draft (ฉบับร่าง) — เก็บทั้งฟอร์มไว้ทำต่อ ── */
  var NPD_DRAFT_KEY = 'pc_npd_draft';
  /* ล็อกเลขถาวรเหมือนหน้า IT: เลขที่จองจะไม่คืนตอนออกจากหน้า ถ้าบันทึกร่าง/ส่งงานแล้ว
     คืนเข้า pool (recycle) เฉพาะตอน "ทิ้งร่าง/ลบรายการ" — ไม่เผาเลขทิ้ง */
  var npdKeepCodes = false;
  function npdReturnSnapshotCodes(d) {
    try {
      ((d && d.subsets) || []).forEach(function (s) {
        if (s.ssCode) npdReturnSS(s.ssCode);
        (s.powders || []).forEach(function (w) { if (w.cmpos) npdReturnCMPOS(w.cmpos); });
      });
      ((d && d.products) || []).forEach(function (p) { if (p.code) npdReturnItem(p.code); });
    } catch (e) {}
  }
  function npdConfirmAllCodes() {
    try {
      if (!window.PC_COUNTER || !PC_COUNTER.confirm) return;
      (state.subsets || []).forEach(function (s) {
        if (s.ssCode) PC_COUNTER.confirm(s.ssCode, 'ss');
        (s.powders || []).forEach(function (w) { if (w.cmpos) PC_COUNTER.confirm(w.cmpos, 'item'); });
      });
      (state.products || []).forEach(function (p) { if (p.code) PC_COUNTER.confirm(p.code, 'item'); });
    } catch (e) {}
  }
  function npdSnapshot() {
    return {
      project: getVal('npProject'), start: getVal('npStart'), end: getVal('npEnd'), rd: getVal('npRd'),
      category: state.category || '', cateCode: state.cateCode || '', dept: state.dept || '',
      storeMode: state.storeMode || 'ALL', storeConds: state.storeConds || [],
      subsets: state.subsets || [], products: state.products || [], savedAt: Date.now()
    };
  }
  RD.saveDraft = function () {
    try {
      localStorage.setItem(NPD_DRAFT_KEY, JSON.stringify(npdSnapshot()));
      npdKeepCodes = true;   // บันทึกร่างแล้ว = ล็อกเลข ไม่คืนตอนออกจากหน้า
      window.__npdBaseline = npdSig();   // บันทึกร่างแล้ว = ไม่ถือว่ามีข้อมูลค้าง
      if (window.Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', iconColor: '#2e934a', title: 'บันทึกร่างแล้ว', text: 'เปิดหน้านี้อีกครั้งจะถามให้ทำต่อจากร่าง', showConfirmButton: false, timer: 1800 });
    } catch (e) { if (window.Swal) Swal.fire('บันทึกร่างไม่สำเร็จ', String(e), 'error'); }
    return true;
  };
  RD.clearDraft = function () { try { localStorage.removeItem(NPD_DRAFT_KEY); } catch (e) {} };
  function npdRestoreSnapshot(d) {
    try {
      state.category = d.category || ''; state.cateCode = d.cateCode || ''; state.dept = d.dept || '';
      state.storeMode = d.storeMode || 'ALL'; state.storeConds = d.storeConds || [];
      state.subsets = d.subsets || [];
      state.products = (d.products && d.products.length) ? d.products : [mkProduct({ recipes: [mkRecipe()] })];
      var pj = document.getElementById('npProject'); if (pj) pj.value = d.project || '';
      var st = document.getElementById('npStart'); if (st && d.start) st.value = d.start;
      var en = document.getElementById('npEnd'); if (en && d.end) en.value = d.end;
      var catEl = document.getElementById('npCategory'); if (catEl) catEl.value = state.category;
      var ccEl = document.getElementById('npCateCode'); if (ccEl) ccEl.value = state.cateCode;
      renderDeptList(); renderStores(); renderAll();
    } catch (e) {}
  }
  window.disposeNPD = function () {
    window.__leaveGuard = null;
    try {
      if (!npdKeepCodes) {   // ไม่ได้บันทึกร่าง/ส่งงาน → คืนเลข seed/ที่ยังไม่ใช้ เข้า pool (recycle)
        (state.subsets || []).forEach(function (s) {
          if (s.ssCode) npdReturnSS(s.ssCode);
          (s.powders || []).forEach(function (w) { if (w.cmpos) npdReturnCMPOS(w.cmpos); });
        });
        (state.products || []).forEach(function (p) { if (p.code) npdReturnItem(p.code); });
      }
      state.subsets = [];
    } catch (e) {}
    npdKeepCodes = false;
  };

  /* standalone-prototype fallback: show a read-only summary instead of submitting */
  function summaryNew() {
    var poolHtml = state.subsets.map(function (s) {
      var pw = s.powders.map(function (w) { return '<li>' + esc(w.eng || '–') + ' <span class="mono text-muted">' + esc(w.code) + '</span>' + (num(w.addon) > 0 ? ' <span class="badge bg-warning text-dark">+฿' + num(w.addon) + '</span>' : '') + '</li>'; }).join('');
      return '<div class="mb-1"><b>' + esc(s.name || 'Subset') + '</b> <span class="text-muted">(' + s.powders.length + ' ผง)</span><ul class="mb-1" style="font-size:.85rem">' + (pw || '<li class="text-muted">ไม่มีผง</li>') + '</ul></div>';
    }).join('') || '<span class="text-muted">ยังไม่มี Subset</span>';
    var prodHtml = state.products.map(function (p) {
      var fmls = (p.formulas || []).map(function (f) { var s = resolveFormulaSub(f.subId); var mn = f.chooseMin != null ? f.chooseMin : f.choose; var mx = f.chooseMax != null ? f.chooseMax : f.choose; var rng = (mn === mx) ? esc(mn) : (esc(mn) + '–' + esc(mx)); return '<li>เลือกได้ <b>' + rng + '</b> ผง จาก <b>' + esc(s ? (s.name || 'Subset') : '—') + '</b></li>'; }).join('');
      var priceTxt = (p.saleModes || []).map(function (ch) { var deliv = npdDelivery().indexOf(ch) !== -1; return ch + ' ฿' + esc(p.prices && p.prices[ch] != null && p.prices[ch] !== '' ? p.prices[ch] : (deliv ? (p.priceDelivery || '–') : (p.priceTakeaway || '–'))); }).join(' · ') || '–';
      return '<div class="border rounded-3 p-2 mb-2"><b>' + esc(p.name || '(ไม่มีชื่อ)') + '</b><div class="hint">' + priceTxt + '</div>' + (fmls ? '<ul class="mb-0 mt-1" style="font-size:.85rem">' + fmls + '</ul>' : '<div class="hint">ยังไม่มีสูตรผง</div>') + '</div>';
    }).join('');
    Swal.fire({ title: '<span style="font-size:1rem">สรุป (prototype) — NPD สินค้าใหม่</span>', width: 680, html: '<div class="text-start" style="max-height:60vh;overflow:auto"><div class="mb-2"><span class="badge bg-dark"><i class="fas fa-tags me-1"></i>หมวด: ' + esc(state.category || '—') + (state.cateCode ? ' · CMPOS ' + esc(state.cateCode) : '') + '</span></div><div class="fw-bold mb-1"><i class="fas fa-mortar-pestle me-1 text-warning"></i>คลัง Subset</div>' + poolHtml + '<hr><div class="fw-bold mb-1"><i class="fas fa-box-open me-1"></i>ปุ่มสินค้า (' + state.products.length + ')</div>' + prodHtml + '</div>', confirmButtonColor: '#2e934a', confirmButtonText: 'รับทราบ' });
  }

  RD.submit = function (which) {
    if (which === 'new') {
      var project = getVal('npProject'), start = getVal('npStart'), end = getVal('npEnd');
      if (!project) return warnFill('กรุณาระบุชื่อชุดสินค้า / Project');
      if (!start) return warnFill('กรุณาระบุวันที่เริ่ม');
      if (!end) return warnFill('กรุณาระบุวันที่สิ้นสุด');
      if (new Date(start) > new Date(end)) return warnFill('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
      if (!state.products.length) return warnFill('กรุณาเพิ่มปุ่มสินค้าอย่างน้อย 1 ปุ่ม');
      for (var i = 0; i < state.products.length; i++) { if (!String(state.products[i].name || '').trim()) return warnFill('กรุณาระบุชื่อปุ่มสินค้า (Item Name) ให้ครบทุกปุ่ม'); }
      var names = {}, dupName = null, abbrs = {}, dupAbbr = null;
      var _nrm = function (s) { return String(s || '').replace(/\s+/g, ''); };
      var _nab = function (s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); };
      state.subsets.forEach(function (s) {
        var k = _nrm(s.name); if (k) { if (names[k]) dupName = s.name; names[k] = 1; }
        var a = _nab(s.name2); if (a) { if (abbrs[a]) dupAbbr = s.name2; abbrs[a] = 1; }
      });
      if (dupName) return Swal.fire('ชื่อ Subset ซ้ำ', 'มี Subset ชื่อ "' + dupName + '" มากกว่าหนึ่งรายการ — กรุณาแก้ก่อนส่ง', 'error');
      if (dupAbbr) return Swal.fire('ตัวย่อ Subset ซ้ำ', 'มี Subset ที่ใช้ตัวย่อ (Name 2) "' + dupAbbr + '" มากกว่าหนึ่งรายการ — กรุณาแก้ก่อนส่ง', 'error');

      // ── ตรวจ Subset แต่ละชุด: ชื่อ + ตัวย่อ ห้ามว่าง · ผง (ยกเว้น No flavor) ต้องมีจำนวน+หน่วย · ราคาว่าง→0 ──
      for (var si = 0; si < state.subsets.length; si++) {
        var s = state.subsets[si];
        var sname = String(s.name || '').trim();
        if (!sname) return warnFill('Subset #' + (si + 1) + ': กรุณากรอกชื่อ Subset');
        if (!String(s.name2 || '').trim()) return warnFill('Subset "' + sname + '": กรุณากรอก Subset Name 2 (ตัวย่อผงบน POS)');
        var pws = s.powders || [];
        var _pn = {};
        for (var wi = 0; wi < pws.length; wi++) {
          var w = pws[wi];
          if (w.noFlavor) continue;                                              // No flavor = ปุ่มไม่เอาผง ไม่ต้องกรอกช่องอื่น
          if (!String(w.eng || '').trim() && !String(w.th || '').trim()) continue; // แถวว่างล้วน ข้าม
          var _pk = String(w.eng || '').replace(/\s+/g, '').toLowerCase();        // ชื่อผง EN ห้ามซ้ำในชุดเดียวกัน
          if (_pk) { if (_pn[_pk]) return warnFill('Subset "' + sname + '": มีชื่อผง "' + w.eng + '" ซ้ำกันในชุด — กรุณาแก้ก่อนส่ง'); _pn[_pk] = 1; }
          if (!String(w.qty || '').trim()) return warnFill('Subset "' + sname + '" ลำดับ ' + (w.seq || (wi + 1)) + ': กรุณากรอกจำนวน (Qty)');
          if (!String(w.unit || '').trim()) return warnFill('Subset "' + sname + '" ลำดับ ' + (w.seq || (wi + 1)) + ': กรุณากรอกหน่วย (Unit)');
          if (!String(w.addon).trim()) w.addon = 0;                              // ราคาเว้นว่าง → เติม 0
        }
      }

      for (var _pi = 0; _pi < state.products.length; _pi++) {
        var _pd = state.products[_pi];
        for (var _ri = 0; _ri < (_pd.recipes || []).length; _ri++) {
          var _rr = _pd.recipes[_ri];
          var _rv = ['code', 'desc', 'qty', 'unit'].map(function (k) { return String(_rr[k] == null ? '' : _rr[k]).trim(); });
          if (_rv.some(function (v) { return !!v; }) && !_rv.every(function (v) { return !!v; })) {
            return warnFill('ปุ่มสินค้า "' + (_pd.name || '#' + (_pi + 1)) + '": Recipe RM แถว ' + (_ri + 1) + ' ต้องกรอก Code RM, Description, Qty และ Unit ให้ครบ หรือเคลียร์ทั้งแถว');
          }
        }
        for (var _fi = 0; _fi < (_pd.formulas || []).length; _fi++) {
          if (!resolveFormulaSub(_pd.formulas[_fi].subId)) return warnFill('ปุ่มสินค้า "' + (_pd.name || '#' + (_pi + 1)) + '": สูตรผง #' + (_fi + 1) + ' กรุณาเลือก Subset ให้ครบ (ถ้าเว้นว่าง ข้อมูลสูตรผงแถวนี้จะไม่ถูกส่งไปให้ IT)');
        }
      }
      if (!backendOn()) return summaryNew();
      var payload = buildNewPayload();
      Swal.fire({ title: 'ยืนยันการส่งให้ IT?', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'ส่ง', cancelButtonText: 'ยกเลิก' }).then(function (r) {
        if (!r.isConfirmed) return;
        if (RD._sending) return; RD._sending = true;            // SHOULD: guard double-submit
        var key = RD._submitKey || (RD._submitKey = 'npd-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: function () { Swal.showLoading(); } });
        google.script.run.withSuccessHandler(function (res) {
          RD._sending = false;
          if (res && res.status && res.status !== 'success') { return Swal.fire('บันทึกไม่ได้', res.message || 'ข้อมูลซ้ำ/ชนกัน', 'error'); }
          RD._submitKey = null;
          var rmTxt = (res && res.newRm && res.newRm.length) ? '<br><span style="color:#2e934a">+ เพิ่ม RM ใหม่ ' + res.newRm.length + ' รายการ</span>' : '';
          var saveTxt = (res && res.saved) ? '<br><span style="font-size:.78rem;color:#667085">บันทึกแล้ว: ' + res.saved.subsets + ' Subset · ' + res.saved.powders + ' ผง · ' + res.saved.items + ' สินค้า · ' + res.saved.recipeRows + ' Recipe RM</span>' : '';
          Swal.fire({ icon: 'success', title: 'ส่งเรียบร้อย!', html: 'เลขที่เอกสาร: <b>' + (res && res.id || '-') + '</b><br>จำนวนปุ่มสินค้า: ' + payload.items.length + ' รายการ' + saveTxt + rmTxt, confirmButtonColor: '#2e934a' }).then(function () { npdConfirmAllCodes(); RD.clearDraft(); RD.resetNew(); window.__npdBaseline = npdSig(); });
        }).withFailureHandler(function (e) { RD._sending = false; Swal.fire('Error', String(e), 'error'); }).submitNPD(payload, key);
      });
    } else {
      var f = state.flavor;
      if (!String(f.project || '').trim()) return warnFill('กรุณาระบุชื่อชุดผงรสชาติ / Project');
      if (!f.start) return warnFill('กรุณาระบุวันที่เริ่ม');
      if (!f.end) return warnFill('กรุณาระบุวันที่สิ้นสุด');
      if (new Date(f.start) > new Date(f.end)) return warnFill('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
      var pw = (f.powders || []).filter(function (w) { return String(w.eng || '').trim(); });
      if (!pw.length) return warnFill('กรุณาเพิ่มผงรสชาติอย่างน้อย 1 ตัว (ระบุ ENG Name)');
      if (pw.some(function (w) { return !w.targetSS; })) return warnFill('กรุณาเลือก Subset ปลายทางให้ครบทุกผง');

      var byTarget = {}; pw.forEach(function (w) { (byTarget[w.targetSS] = byTarget[w.targetSS] || []).push(w); });
      var groups = Object.keys(byTarget).map(function (ss) {
        var sub = SUBSETS_MASTER.find(function (s) { return s.ssCode === ss; });
        return {
          ssCode: ss, name: sub ? sub.name : '',
          flavors: byTarget[ss].map(function (w) { return { seq: w.seq || '', cmpos: w.cmpos || '', eng: w.eng || '', th: w.th || '', code: w.code || '', desc: w.desc || '', qty: w.qty || '', unit: w.unit || '', spoon: w.spoon || '', price: num(w.addon) }; })
        };
      });
      var payload = { project: String(f.project).trim(), start: f.start, end: f.end, rd: f.rd, groups: groups };

      if (!backendOn()) {
        var gHtml = groups.map(function (g) { return '<div class="border rounded-3 p-2 mb-2"><b>' + esc(g.ssCode) + ' · ' + esc(g.name) + '</b><ul class="mb-0 mt-1" style="font-size:.85rem">' + g.flavors.map(function (x) { return '<li>' + esc(x.eng) + '</li>'; }).join('') + '</ul></div>'; }).join('');
        return Swal.fire({ title: '<span style="font-size:1rem">สรุป (prototype) — ผงรสชาติใหม่</span>', width: 560, html: '<div class="text-start">' + gHtml + '</div>', confirmButtonColor: '#2e934a', confirmButtonText: 'รับทราบ' });
      }
      Swal.fire({ title: 'ยืนยันการส่งให้ IT?', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'ส่ง', cancelButtonText: 'ยกเลิก' }).then(function (r) {
        if (!r.isConfirmed) return;
        if (RD._sendingF) return; RD._sendingF = true;          // SHOULD: guard double-submit
        var keyF = RD._submitKeyF || (RD._submitKeyF = 'flv-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: function () { Swal.showLoading(); } });
        google.script.run.withSuccessHandler(function (res) {
          RD._sendingF = false;
          if (res && (res.status === 'duplicate' || res.status === 'conflict')) { return Swal.fire('บันทึกไม่ได้', res.message || 'ข้อมูลซ้ำ/ชนกัน', 'error'); }
          RD._submitKeyF = null;
          Swal.fire({ icon: 'success', title: 'ส่งเรียบร้อย!', html: 'เลขที่เอกสาร: <b>' + (res && res.id || '-') + '</b><br>จำนวนผง: ' + pw.length + ' ตัว', confirmButtonColor: '#2e934a' }).then(function () { RD.resetFlavor(); });
        }).withFailureHandler(function (e) { RD._sendingF = false; Swal.fire('Error', String(e), 'error'); }).submitFlavor(payload, keyF);
      });
    }
  };

  function hasBackend() { return (typeof google !== 'undefined' && google.script && google.script.run); }
  var DEPT_NAMES = { '100': 'Food', '200': 'Beverages', '300': 'Packaging / Other' };
  function deptOf(code) { var n = parseInt(code, 10); if (isNaN(n)) return ''; return String(Math.floor(n / 100) * 100); }
  function deptName(code) { return DEPT_NAMES[code] || ('Dept ' + code); }
  function departments() { var set = {}; CAT_LIST.forEach(function (c) { var d = deptOf(c.code); if (d) set[d] = 1; }); Object.keys(DEPT_NAMES).forEach(function (d) { set[d] = 1; }); return Object.keys(set).sort(function(a,b){return (parseInt(a,10)||0)-(parseInt(b,10)||0);}); }
  function renderDeptList() {
    var el = document.getElementById('npDept'); if (!el) return; var cur = state.dept || '';
    el.innerHTML = '<option value="">— เลือกแผนก —</option>' + departments().map(function (d) { return '<option value="' + d + '"' + (d === cur ? ' selected' : '') + '>' + esc(d + ' · ' + deptName(d)) + '</option>'; }).join('');
  }
  function renderCatList() {
    var list = (state.dept ? CAT_LIST.filter(function (c) { return deptOf(c.code) === state.dept; }) : CAT_LIST).filter(function (c) { return c.name === state.category || npdCatShown(c.name); }).sort(function(a,b){var na=parseInt(a.code,10),nb=parseInt(b.code,10);if(!isNaN(na)&&!isNaN(nb)&&na!==nb)return na-nb;if(isNaN(na)&&!isNaN(nb))return 1;if(!isNaN(na)&&isNaN(nb))return -1;return String(a.name||'').localeCompare(String(b.name||''));});
    var cl = document.getElementById('catNameList');
    if (cl) cl.innerHTML = list.map(function (c) { return '<option value="' + esc(c.name) + '">' + (c.code ? esc(c.code) + ' · ' : '') + esc(c.name) + '</option>'; }).join('');
    var sel = document.getElementById('npCategory');
    if (sel && sel.tagName === 'SELECT') {
      var cur = state.category || '';
      sel.innerHTML = '<option value="">' + (state.dept ? '— เลือกหมวดสินค้า —' : '— เลือกแผนกก่อน —') + '</option>' +
        list.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === cur ? ' selected' : '') + '>' + (c.code ? esc(c.code) + ' · ' : '') + esc(c.name) + '</option>'; }).join('');
    }
  }
  RD.deptPick = function (code) {
    state.dept = String(code || '');
    var c = CAT_LIST.find(function (x) { return x.name === state.category; });
    if (!state.dept || !c || deptOf(c.code) !== state.dept) { state.category = ''; state.cateCode = ''; var cc0 = document.getElementById('npCateCode'); if (cc0) cc0.value = ''; }
    renderCatList(); npdSyncItemCodes(); renderProducts();
  };
  /* รหัสหมวดใหม่ = รันในช่วงของแผนกที่เลือก (100→1xx, 200→2xx ...) */
  function nextCateCode() { var base = parseInt(state.dept || '100', 10); var mx = base; CAT_LIST.forEach(function (c) { var n = parseInt(c.code, 10); if (!isNaN(n) && n >= base && n < base + 100 && n > mx) mx = n; }); return String(mx + 1); }
  RD.addCategory = function () {
    if (!state.dept) { Swal.fire('เลือกแผนกก่อน', 'กรุณาเลือก Department ก่อนเพิ่มหมวดสินค้า (รหัสหมวดจะรันตามช่วงของแผนก)', 'warning'); return; }
    Swal.fire({
      title: 'เพิ่มหมวดสินค้าใหม่ · แผนก ' + state.dept + ' (' + deptName(state.dept) + ')', input: 'text', inputLabel: 'ชื่อหมวด (EN)', inputPlaceholder: 'เช่น Specialty Wraps',
      showCancelButton: true, confirmButtonText: '<i class="fas fa-plus me-1"></i>เพิ่ม', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#2e934a',
      inputValidator: function (v) {
        v = String(v || '').trim(); if (!v) return 'กรุณากรอกชื่อหมวด';
        var nrm = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };
        if (CAT_LIST.some(function (c) { return nrm(c.name) === nrm(v); })) return 'มีหมวด "' + v + '" อยู่แล้วในฐานข้อมูล — เลือกจากรายการได้เลย';
      }
    }).then(function (r) {
      if (!r.isConfirmed) return; var nm = String(r.value || '').trim(); var code = nextCateCode();
      CAT_LIST.push({ code: code, name: nm });
      state.category = nm; state.cateCode = code;
      renderCatList();
      var cc = document.getElementById('npCateCode'); if (cc) cc.value = code;
      npdSyncItemCodes(); renderProducts();
      Swal.fire({ icon: 'success', title: 'เพิ่มหมวดแล้ว', html: 'หมวด: <b>' + esc(nm) + '</b><br>รหัสหมวด (auto · แผนก ' + state.dept + '): <b>' + esc(code) + '</b>', timer: 2200, showConfirmButton: false });
    });
  };
  function loadRealCategories(cb) {
    if (!hasBackend()) { cb && cb(); return; }
    google.script.run.withSuccessHandler(function (md) {
      (md && md.items || []).forEach(function (it) {
        var nm = it.category, cd = it.cateCode;
        if (nm && !CAT_LIST.some(function (c) { return c.name.toLowerCase() === String(nm).toLowerCase(); })) CAT_LIST.push({ code: cd || '', name: nm });
      });
      cb && cb();
    }).withFailureHandler(function () { cb && cb(); }).getMasterDataExtended();
  }

  function init() {
    /* dirty-check: มีข้อมูลกรอกค้างจริงไหม (Project / ชื่อปุ่ม / ชื่อ Subset / ผง) */
    var t = new Date(), iso = function (d) { return d.toISOString().slice(0, 10); };
    var nm = new Date(t.getFullYear(), t.getMonth() + 1, 1), nme = new Date(t.getFullYear(), t.getMonth() + 2, 0);
    ['npStart', 'npEnd'].forEach(function (id, i) { var el = document.getElementById(id); if (el) el.value = iso(i ? nme : nm); });
    state.flavor.start = iso(nm); state.flavor.end = iso(nme);
    var user = loginUser();
    state.flavor.rd = user;
    var rdEl = document.getElementById('npRd'); if (rdEl) { rdEl.value = user; rdEl.readOnly = true; rdEl.classList.add('it-field'); }
    var dl = document.getElementById('rmList'); if (dl) dl.innerHTML = RM_MASTER.map(function (r) { return '<option value="' + esc(r.code) + '">' + esc(r.code) + ' · ' + esc(r.desc) + '</option>'; }).join('');
    if (window.PC_SUBSET_MASTER && window.PC_SUBSET_MASTER.length) SUBSETS_MASTER = window.PC_SUBSET_MASTER.map(function (s) { return { ssCode: s.ssCode, name: s.name, short: s.short }; });
    renderCatList();
    buildShopData();
    if (hasBackend()) {
      // real system → start with a clean empty form (no demo seed)
      state.subsets = [];
      state.products = [mkProduct({ recipes: [mkRecipe()] })];
      state.category = ''; state.cateCode = '';
    } else {
      seedData();   // standalone prototype → demonstrate with sample data
    }
    if (state.cateCode) state.dept = deptOf(state.cateCode);
    var catEl = document.getElementById('npCategory'); if (catEl) catEl.value = state.category;
    var ccEl = document.getElementById('npCateCode'); if (ccEl) ccEl.value = state.cateCode;
    renderDeptList();
    state.tab = 'new';
    renderStores();
    renderAll();
    /* baseline หลังเรนเดอร์เสร็จ (รวม seed) → ใช้เทียบว่ามีข้อมูล "กรอกใหม่" ไหม */
    window.__npdBaseline = npdSig();
    /* leave-guard: เตือนเฉพาะเมื่อกรอกข้อมูลค้างจริง + ให้เลือกบันทึกร่าง */
    window.__leaveGuard = { page: 'NPD', check: npdHasData, onDraft: RD.saveDraft };
    loadRealCategories(function () { renderDeptList(); renderCatList(); });
    /* ถ้ามีฉบับร่างค้างอยู่ → ถามว่าจะทำต่อไหม */
    try {
      var draftRaw = localStorage.getItem(NPD_DRAFT_KEY);
      if (draftRaw && window.Swal) {
        var d = JSON.parse(draftRaw);
        var hasContent = d && (String(d.project || '').trim()
          || (d.products || []).some(function (p) { return String(p.name || '').trim(); })
          || (d.subsets || []).some(function (s) { return String(s.name || '').trim(); }));
        if (hasContent) {
          Swal.fire({
            title: 'พบฉบับร่าง', icon: 'question',
            html: 'มีฉบับร่าง NPD ที่บันทึกค้างไว้<br><small class="text-muted">ต้องการทำต่อจากร่าง หรือเริ่มกรอกใหม่?</small>',
            showCancelButton: true, confirmButtonColor: '#2e934a',
            confirmButtonText: '<i class="fas fa-folder-open me-1"></i>ทำต่อจากร่าง', cancelButtonText: 'เริ่มใหม่'
          }).then(function (r) {
            if (r.isConfirmed) { npdRestoreSnapshot(d); }
            else { npdReturnSnapshotCodes(d); RD.clearDraft(); }
            window.__npdBaseline = npdSig();
          });
        }
      }
    } catch (e) {}
  }

  window.RD = RD;
  window.initNPD = init;
  /* หน่วย (Unit) ล้อตามเมนูสลับภาษา TH/EN — เมื่อสลับภาษา รีเฟรช datalist หน่วยให้ตรงภาษา */
  if (typeof window.applyLang === 'function' && !window.__npdLangHook) {
    window.__npdLangHook = true;
    var _npdApplyLang = window.applyLang;
    window.applyLang = function () { var r = _npdApplyLang.apply(this, arguments); try { npdConvertUnitsLang(); if (document.getElementById('productList')) renderAll(); else if (document.getElementById('unitDatalist')) refreshUnitDatalist(); if (document.getElementById('tabFlavor')) renderFlavor(); } catch (e) {} return r; };
  }
  // Auto-init: standalone → on DOMContentLoaded; inside the shell → self-run once the page DOM is present,
  // because js/npd-redesign.js is an async <script src> that can finish loading AFTER the loader's one-shot
  // 300ms initNPD() check (init() is idempotent, so a redundant loader call is harmless).
  if (typeof window.loadPage !== 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  } else if (document.getElementById('productList')) {
    init();
  }
})();
