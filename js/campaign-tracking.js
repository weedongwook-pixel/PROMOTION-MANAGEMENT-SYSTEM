/* Campaign_Tracking (MKT Promotions Tracking) — externalized from inline <script> to dodge editor Babel-merge + shell executeScripts skip. Wrapped in IIFE; page handlers exposed via window.* */
(function(){

  let allCampaigns = []; 
  var ctStaffMode = false;
  var ctStatusFilter = 'ALL', ctLifeFilter = 'ALL';
  function ctIsStaff(c){ return /staff\s*discount|owner\s*discount/i.test(String(c||'')); }
  let currentPage = 1; 
  let rowsPerPage = 99999;
  let expandedRowIdx = null;
  let currentStoreCache = {}; 
  // สิทธิ์: Admin = แก้ไขได้ทุกช่อง + เห็นปุ่ม "จัดกลุ่ม" · MKT/อื่นๆ = อ่านอย่างเดียว (ซ่อนปุ่มแอดมิน + ช่องรายละเอียด readonly)
  var IS_ADMIN = (function(){ try{ return (localStorage.getItem('pc_role')||'Admin')==='Admin'; }catch(e){ return true; } })();

  window.initCampaign_Tracking = function() {
    var __ro=document.getElementById('mktRoStyle');
    if(!IS_ADMIN){ if(!__ro){ var st=document.createElement('style'); st.id='mktRoStyle'; st.textContent='.mkt-admin-only{display:none!important}.ct-ro{background:#f5f6f8!important;border:1px solid #e3e7ec!important;color:#444!important;cursor:default}'; document.head.appendChild(st); } }
    else if(__ro){ __ro.remove(); }
    window.ctLoadItemMaster(); window.loadTrackingData(); if (window.ctRenderRail) window.ctRenderRail('promo');
  };

  /* ===== item master lookup (ดึงชื่อ EN/TH จากชีต Item Master ตาม Item Code) ===== */
  let ctItemMap = {};
  // ดึงราคาเต็ม (Gross) จาก item master ตาม Sale Mode — ใช้กับ Price Promotion (กฎ: Gross=ราคา item master, Net=[ราคา])
  window.ctPriceFor = function(p, sale){
    p = p || {}; sale = String(sale||'').toLowerCase();
    if(/grab/.test(sale)) return (p.prices&&p.prices.Grab)||p.priceDLV||'';
    if(/line/.test(sale)) return (p.prices&&p.prices.Lineman)||p.priceDLV||'';
    if(/panda/.test(sale)) return (p.prices&&p.prices.Panda)||p.priceDLV||'';
    if(/shopee/.test(sale)) return (p.prices&&p.prices.Shopee)||p.priceDLV||'';
    if(/robin/.test(sale)) return (p.prices&&p.prices.Robinhood)||p.priceDLV||'';
    if(/gokoo/.test(sale)) return (p.prices&&p.prices.Gokoo)||p.priceDLV||'';
    if(/deliver/.test(sale)) return p.priceDLV||'';
    if(/take\s*away|takeaway/.test(sale)) return p.priceTA||'';
    return p.priceTA||p.priceDLV||'';
  };
  window.ctLoadItemMaster = function(){
    try{
      if (typeof google==='undefined' || !google.script || !google.script.run) return;
      google.script.run.withSuccessHandler(function(d){
        var items=(d&&d.items)||[]; var m={};
        items.forEach(function(it){ m[String(it.itemCode)]={ en:(it.itemNameEN||it.itemNameEn||''), th:(it.itemNameTH||it.itemNameTh||''), type:(it.itemType||''), priceTA:(it.priceTA||it.priceTakeaway||''), priceDLV:(it.priceDLV||it.priceDelivery||''), prices:{ Grab:(it.priceGrab||''), Lineman:(it.priceLineman||it.priceLineMan||''), Panda:(it.pricePanda||''), Shopee:(it.priceShopee||''), Robinhood:(it.priceRobinhood||''), Gokoo:(it.priceGokoo||'') } }; });
        ctItemMap=m;
      }).withFailureHandler(function(){}).getMasterDataExtended();
    }catch(e){}
  };
  function ctItemName(code){ return ctItemMap[String(code)] || null; }

  /* ===== NPD — แท็บสินค้าใหม่ (โชว์ข้อมูล lifecycle RD → IT → OP) ===== */
  var ctNpdData = [];
  function ctEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;'); }
  window.ctRenderRail = function (active) {
    var el = document.getElementById('ctRail'); if (!el) return;
    var items = [['promo','fa-bullhorn','Promotions','Promotions'],['npd','fa-flask','NPD Items','สินค้าใหม่ (NPD)'],['flavor','fa-mortar-pestle','Flavor Powder','ผงรสชาติ (Flavor)']];
    el.innerHTML = '<div class="pc-rail-grp" data-en="TRACKING" data-th="ติดตามงาน">ติดตามงาน</div>' + items.map(function (it) {
      return '<div class="pc-rail-item ' + (it[0] === active ? 'on' : '') + '" onclick="window.ctSwitchTab(\'' + it[0] + '\')"><i class="fas ' + it[1] + '"></i><span class="navlbl" data-en="' + it[2] + '" data-th="' + it[3] + '">' + it[3] + '</span></div>';
    }).join('');
  };
  window.ctSwitchTab = function (tab) {
    var promo = tab === 'promo';
    ctStaffMode = false;
    if (!promo && window.ctSetFocus) window.ctSetFocus(false);
    var sr = document.getElementById('summaryRow'); if (sr) sr.style.display = (tab === 'promo') ? '' : 'none';
    var pb = document.getElementById('ctPromoBox'); if (pb) pb.style.display = promo ? '' : 'none';
    var nb = document.getElementById('ctNpdTab'); if (nb) nb.style.display = tab === 'npd' ? 'block' : 'none';
    var fb = document.getElementById('ctFlvTab'); if (fb) fb.style.display = tab === 'flavor' ? 'block' : 'none';
    document.querySelectorAll('#ctTabs .ct-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    if (window.ctRenderRail) window.ctRenderRail(tab);
    if (promo) { currentPage = 1; if (window.renderTracking) window.renderTracking(); }
    if (tab === 'npd') window.loadCtNpd();
    if (tab === 'flavor') window.loadCtFlv();
  };
  window.loadCtNpd = function () {
    var box = document.getElementById('ctNpdTab');
    box.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-warning"></div></div>';
    google.script.run.withSuccessHandler(function (d) { ctNpdData = d || []; window.renderCtNpd(); }).withFailureHandler(function (e) { box.innerHTML = '<div class="text-danger p-4">' + e + '</div>'; }).getNPDList();
  };
  window.renderCtNpd = function () {
    var box = document.getElementById('ctNpdTab');
    if (!ctNpdData.length) { box.innerHTML = '<div class="text-center p-5 bg-white rounded-3 shadow-sm border"><i class="fas fa-flask fa-2x text-muted mb-2 d-block"></i><span class="fw-bold text-muted">ยังไม่มีสินค้าใหม่ (NPD)</span></div>'; return; }
    var rows = ctNpdData.map(function (n) {
      var itDone = (n.itStatus || '') === 'COMPLETE';
      var itBadge = itDone ? '<span class="status-badge bg-success text-white">IT เสร็จ</span>' : '<span class="status-badge bg-warning text-dark">รอ IT</span>';
      var op = n.status || 'PENDING';
      var opBadge = op === 'CONFIRMED' ? '<span class="status-badge bg-success text-white">ยืนยันแล้ว</span>' : (op === 'REJECTED' ? '<span class="status-badge bg-danger text-white">ตีกลับ</span>' : '<span class="status-badge bg-secondary text-white">รอตรวจ</span>');
      var itemNames = (n.items || []).map(function (i) { return ctEsc(i.name); }).join(', ');
      return '<tr>' +
        '<td class="text-start ps-3"><div class="fw-bold text-brand-green">' + n.id + '</div><small class="text-muted">' + ctEsc(n.project || '') + '</small></td>' +
        '<td class="text-start"><span class="badge bg-light text-dark border">' + (n.items || []).length + ' รายการ</span> <small class="text-muted d-block">' + itemNames + '</small></td>' +
        '<td class="small">' + (window.PCfmt ? PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end) : (n.start || '') + ' – ' + (n.end || '')) + '</td>' +
        '<td class="small">' + ((n.channels || []).join(', ') || '-') + '</td>' +
        '<td>' + itBadge + '</td>' +
        '<td>' + opBadge + '</td>' +
        '<td><button class="btn-circle btn-edit-mode" title="ดูรายละเอียด" onclick="window.ctNpdView(\'' + n.id + '\')"><i class="fas fa-eye"></i></button></td>' +
        '</tr>';
    }).join('');
    box.innerHTML = '<div class="table-container border"><div class="table-responsive-scroll"><table class="table table-hover align-middle m-0"><thead class="text-center"><tr>' +
      '<th class="text-start ps-3">เลขที่ / Project</th><th class="text-start">สินค้า</th><th>ช่วงเวลา</th><th>ช่องทาง</th><th>IT Status</th><th>OP Status</th><th>ดู</th>' +
      '</tr></thead><tbody class="text-center">' + rows + '</tbody></table></div></div>';
  };
  window.ctNpdView = function (id) {
    var n = ctNpdData.find(function (x) { return x.id === id; }); if (!n) return;
    var box = document.getElementById('ctNpdTab');
    if (box && window.PC_NpdView) { box.innerHTML = window.PC_NpdView.render(n, { back: 'window.renderCtNpd()' }); try { box.scrollIntoView({ block: 'start' }); } catch (e) {} return; }
    if (box && window.npdFullView) { box.innerHTML = window.npdFullView(n, ctEsc, 'window.renderCtNpd()'); try { box.scrollIntoView({ block: 'start' }); } catch (e) {} return; }
    var rangeTxt = window.PCfmt ? (PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end)) : ((n.start || '') + ' – ' + (n.end || ''));
    Swal.fire({ title: '<span style="font-size:1rem">' + n.id + ' · ' + ctEsc(n.project || '') + '</span>', width: 760, html: '<div class="text-start"><div class="small text-muted mb-2">ช่วง ' + rangeTxt + ' · สาขา ' + ctEsc(n.store || '-') + (n.rd ? ' · RD ' + ctEsc(n.rd) : '') + '</div>' + window.npdDetailHTML(n, ctEsc) + '</div>', confirmButtonColor: '#198754', confirmButtonText: 'ปิด' });
  };

  /* ===== Flavor (ผงรสชาติ) — แท็บเพิ่มผง (view-only lifecycle RD → IT → OP) ===== */
  var ctFlvData = [];
  window.loadCtFlv = function () {
    var box = document.getElementById('ctFlvTab');
    box.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-warning"></div></div>';
    google.script.run.withSuccessHandler(function (d) { ctFlvData = d || []; window.renderCtFlv(); }).withFailureHandler(function (e) { box.innerHTML = '<div class="text-danger p-4">' + e + '</div>'; }).getFlavorList();
  };
  window.renderCtFlv = function () {
    var box = document.getElementById('ctFlvTab');
    if (!ctFlvData.length) { box.innerHTML = '<div class="text-center p-5 bg-white rounded-3 shadow-sm border"><i class="fas fa-mortar-pestle fa-2x text-muted mb-2 d-block"></i><span class="fw-bold text-muted">ยังไม่มีรายการเพิ่มผงรสชาติ</span></div>'; return; }
    var rows = ctFlvData.map(function (n) {
      var itDone = (n.itStatus || '') === 'COMPLETE';
      var itBadge = itDone ? '<span class="status-badge bg-success text-white">IT เสร็จ</span>' : '<span class="status-badge bg-warning text-dark">รอ IT</span>';
      var op = n.status || 'PENDING';
      var opBadge = op === 'CONFIRMED' ? '<span class="status-badge bg-success text-white">ยืนยันแล้ว</span>' : (op === 'REJECTED' ? '<span class="status-badge bg-danger text-white">ตีกลับ</span>' : '<span class="status-badge bg-secondary text-white">รอตรวจ</span>');
      var nPow = (n.groups || []).reduce(function (a, g) { return a + (g.flavors || []).length; }, 0);
      return '<tr>' +
        '<td class="text-start ps-3"><div class="fw-bold text-brand-green">' + n.id + '</div><small class="text-muted">' + ctEsc(n.project || '') + '</small></td>' +
        '<td class="text-start"><span class="badge bg-light text-dark border">' + (n.groups || []).length + ' กลุ่ม</span> <small class="text-muted d-block">' + nPow + ' ผงรสชาติ</small></td>' +
        '<td class="small">' + (window.PCfmt ? PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end) : (n.start || '') + ' – ' + (n.end || '')) + '</td>' +
        '<td>' + itBadge + '</td>' +
        '<td>' + opBadge + '</td>' +
        '<td><button class="btn-circle btn-edit-mode" title="ดูรายละเอียด" onclick="window.ctFlvView(\'' + n.id + '\')"><i class="fas fa-eye"></i></button></td>' +
        '</tr>';
    }).join('');
    box.innerHTML = '<div class="table-container border"><div class="table-responsive-scroll"><table class="table table-hover align-middle m-0"><thead class="text-center"><tr>' +
      '<th class="text-start ps-3">เลขที่ / Project</th><th class="text-start">ผงรสชาติ</th><th>ช่วงเวลา</th><th>IT Status</th><th>OP Status</th><th>ดู</th>' +
      '</tr></thead><tbody class="text-center">' + rows + '</tbody></table></div></div>';
  };
  window.ctFlvView = function (id) {
    var n = ctFlvData.find(function (x) { return x.id === id; }); if (!n) return;
    var rangeTxt = window.PCfmt ? (PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end)) : ((n.start || '') + ' – ' + (n.end || ''));
    Swal.fire({ title: '<span style="font-size:1rem">' + n.id + ' · ' + ctEsc(n.project || '') + '</span>', width: 760, html: '<div class="text-start"><div class="small text-muted mb-2">ช่วง ' + rangeTxt + (n.rd ? ' · RD ' + ctEsc(n.rd) : '') + '</div>' + window.flvDetailHTML(n, ctEsc) + '</div>', confirmButtonColor: '#198754', confirmButtonText: 'ปิด' });
  };
  /* ===== shared Flavor detail renderer (groups → flavor powders) ===== */
  window.flvDetailHTML = function (n, esc) {
    return (n.groups || []).map(function (g) {
      var pw = (g.flavors || []).map(function (w, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(w.cmpos || '—') + '</td><td class="text-start">' + esc(w.eng || '-') + '</td><td class="mono">' + esc(w.code || '') + '</td><td class="text-start">' + esc(w.desc || '') + '</td><td>' + esc(w.qty || '') + '</td><td>' + esc(w.unit || '') + '</td><td class="small">' + esc(w.spoon || '') + '</td><td>' + ((+w.price > 0) ? '+฿' + (+w.price) : '-') + '</td></tr>';
      }).join('');
      return '<div class="border rounded-3 p-2 mb-2" style="background:#fffdf4;border-color:#e3d27e!important">' +
        '<div class="fw-bold mb-1"><i class="fas fa-mortar-pestle me-1 text-warning"></i>' + esc(g.name || 'Subset') + (g.ssCode ? ' <span class="badge bg-dark">' + esc(g.ssCode) + '</span>' : '') + ' <span class="text-muted small">· ' + (g.flavors || []).length + ' ผง</span></div>' +
        '<table class="table table-sm table-bordered mb-0" style="font-size:11px"><thead class="table-light"><tr><th>No</th><th>CMPOS</th><th>ENG</th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon</th><th>Price</th></tr></thead><tbody>' + (pw || '<tr><td colspan="9" class="text-muted">ไม่มีผง</td></tr>') + '</tbody></table></div>';
    }).join('') || '<div class="text-muted small mb-2">— ไม่มีกลุ่มผง —</div>';
  };

  /* ===== shared NPD detail renderer (latest model: central Subset pool + products) ===== */
  window.npdDetailHTML = function (n, esc) {
    var DLV = ['Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'Gokoo'];
    var subsets = (n.subsets || []).map(function (s) {
      var pw = (s.powders || []).map(function (w, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(w.cmpos || '—') + '</td><td class="text-start">' + esc(w.eng || '-') + '</td><td class="mono">' + esc(w.code || '') + '</td><td class="text-start">' + esc(w.desc || '') + '</td><td>' + esc(w.qty || '') + '</td><td>' + esc(w.unit || '') + '</td><td class="small">' + esc(w.spoon || '') + '</td><td>' + ((+w.price > 0) ? '+฿' + (+w.price) : '-') + '</td></tr>';
      }).join('');
      return '<div class="border rounded-3 p-2 mb-2" style="background:#fffdf4;border-color:#e3d27e!important">' +
        '<div class="fw-bold mb-1"><i class="fas fa-mortar-pestle me-1 text-warning"></i>' + esc(s.name || 'Subset') + (s.ssCode ? ' <span class="badge bg-dark">' + esc(s.ssCode) + '</span>' : '') + (s.cat ? ' <span class="text-muted small">· ' + esc(s.cat) + '</span>' : '') + '</div>' +
        '<table class="table table-sm table-bordered mb-0" style="font-size:11px"><thead class="table-light"><tr><th>No</th><th>CMPOS</th><th>ENG</th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon</th><th>Price</th></tr></thead><tbody>' + (pw || '<tr><td colspan="9" class="text-muted">ไม่มีผง</td></tr>') + '</tbody></table></div>';
    }).join('') || '<div class="text-muted small mb-2">— ไม่มี Subset —</div>';

    var items = (n.items || []).map(function (it) {
      var sm = it.saleModes || (it.channels || []);
      var chips = sm.length ? sm.map(function (c) { return '<span class="badge bg-secondary me-1">' + esc(c) + (DLV.indexOf(c) !== -1 ? ' DLV' : '') + '</span>'; }).join('') : '<span class="text-muted small">—</span>';
      var pr = [];
      var B = function (x) { return window.PCfmt ? PCfmt.baht(x) : '฿' + esc(x); };
      if (it.priceTakeaway) pr.push('Take Away ' + B(it.priceTakeaway));
      if (it.priceDelivery) pr.push('Delivery ' + B(it.priceDelivery));
      DLV.forEach(function (c) { if (it.prices && it.prices[c] != null && it.prices[c] !== '') pr.push(esc(c) + ' ' + B(it.prices[c])); });
      if (!pr.length && (it.price || it.sellingPrice)) pr.push(B(it.price || it.sellingPrice));
      var priceTxt = pr.join(' · ') || '—';
      var rm = (it.recipes || []).map(function (r, i) {
        var ch = (r.channels || []).join(', ');
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(r.code || r.itemCode || '-') + '</td><td class="text-start">' + esc(r.desc || r.description || '') + '</td><td>' + esc(r.qty || r.quantity || '') + '</td><td>' + esc(r.unit || '') + '</td><td class="small text-start">' + esc(ch || '-') + '</td></tr>';
      }).join('');
      var fml = (it.formulas || []).map(function (f) { return '<li>เลือกได้ <b>' + esc(f.choose) + '</b> ผง จาก <b>' + esc(f.ss || f.subName || '-') + '</b></li>'; }).join('') || '<li class="text-muted">ไม่มีสูตรผง</li>';
      return '<div class="border rounded-3 p-2 mb-2 text-start">' +
        '<div class="d-flex justify-content-between align-items-start"><div><b>' + esc(it.name || '-') + '</b>' + (it.th ? ' <span class="text-muted small">/ ' + esc(it.th) + '</span>' : '') + '</div></div>' +
        '<div class="small text-muted">Item Code: <b>' + esc(it.code || it.itemCode || '—') + '</b>' + (it.cmpos ? ' · CMPOS: <b>' + esc(it.cmpos) + '</b>' : '') + (it.ssCode ? ' · SS: <b>' + esc(it.ssCode) + '</b>' : '') + ' · ' + esc(it.category || '-') + '</div>' +
        '<div class="mt-1 small"><i class="fas fa-truck me-1 text-warning"></i>Sale Mode: ' + chips + '</div>' +
        '<div class="mt-1 small"><i class="fas fa-tag me-1 text-success"></i>ราคา: <b>' + priceTxt + '</b></div>' +
        '<table class="table table-sm table-bordered mt-2 mb-1" style="font-size:11px"><thead class="table-dark"><tr><th>No</th><th>Item Code</th><th>Description</th><th>Qty</th><th>Unit</th><th>ช่องทาง</th></tr></thead><tbody>' + (rm || '<tr><td colspan="6" class="text-muted">—</td></tr>') + '</tbody></table>' +
        '<div class="small fw-bold"><i class="fas fa-flask me-1 text-success"></i>สูตรผง (Powder Formula):</div><ul class="mb-0" style="font-size:.82rem">' + fml + '</ul>' +
        '</div>';
    }).join('');

    return '<div class="fw-bold small text-uppercase mb-1 mt-1"><i class="fas fa-layer-group me-1 text-warning"></i>คลัง Subset (ใช้ร่วม)</div>' + subsets +
      '<div class="fw-bold small text-uppercase mb-1 mt-2"><i class="fas fa-box-open me-1"></i>ปุ่มสินค้า (' + (n.items || []).length + ')</div>' + items;
  };

  window.clearViewState = function() {
    expandedRowIdx = null;
    if (window.ctSetFocus) window.ctSetFocus(false);
    const tbody = document.getElementById('trackingTableBody');
    if (tbody) tbody.innerHTML = '';
  };

  window.loadTrackingData = function() {
    Swal.fire({ 
      html: `
        <div class="d-flex flex-column align-items-center justify-content-center py-3">
          <div class="spinner-border text-warning mb-3" role="status" style="width: 2.5rem; height: 2.5rem;"></div>
          <div class="fw-bold" style="font-size:14px; color:#555;">กำลังดึงข้อมูล...</div>
        </div>`,
      showConfirmButton: false,
      allowOutsideClick: false,
      width: '220px',
      padding: '1rem'
    });
    
    window.clearViewState();
    window.__ctLoading = true;

    google.script.run.withSuccessHandler(function(data) {
      Swal.close();
      window.__ctLoading = false; window.__ctLoaded = true;
      allCampaigns = data || [];
      /* FX-P59 — ถ้าผู้ใช้สลับไปหน้าอื่นแล้ว (ตารางถูกถอดออก) อย่าวาดทับหน้าที่เปิดอยู่ */
      if (!document.getElementById('trackingTableBody')) return;
      // ดึงชุดแคมเปญ + โค้ดที่เป็น Co-Promotion (สำหรับป้าย badge — match ชื่อ หรือ โค้ด)
      try {
        google.script.run.withSuccessHandler(function(cs){ window.__ctCoPromo = new Set(cs || []); window.renderTracking(); }).getCoPromoCampaigns();
        google.script.run.withSuccessHandler(function(codes){ window.__ctCoPromoCodes = new Set((codes||[]).map(function(c){return String(c).toUpperCase();})); window.renderTracking(); }).getCoPromoCodes();
      } catch(e){}
      window.populateFilters(allCampaigns);
      window.renderTracking();
      if (!window.__ctExtAsked) { window.__ctExtAsked = true; setTimeout(function () { try { window.ctResumePendingExtend(); } catch (e) {} }, 800); }
    })
    .withFailureHandler(err => { window.__ctLoading = false; Swal.fire('Error', 'ไม่สามารถดึงข้อมูลได้: ' + err, 'error'); })
    .getAllCampaignData();
  };

window.openFile = function(url, name) {
  if (window.pcOpenAttach) return window.pcOpenAttach(url, name);
  if (url && /^https?:/.test(url)) window.open(url, '_blank');
  else Swal.fire({ title: 'ไม่พบไฟล์', text: 'แคมเปญนี้ไม่มีไฟล์แนบหรือลิงก์ไม่ถูกต้อง', icon: 'info' });
};

  window.exportDetailedExcel = function() {
    if (typeof XLSX === 'undefined') { Swal.fire('Error', 'XLSX library ยังไม่โหลด', 'error'); return; }
    if (!window.PC_PromoReport) { Swal.fire('Error', 'ตัวสร้างรายงานยังไม่โหลด (promo-report.js)', 'error'); return; }
    Swal.fire({ title: 'กำลังสร้างรายงาน Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    google.script.run.withSuccessHandler(function(rows){
      rows = rows || [];
      if (!rows.length) { Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีรายการให้ส่งออก', 'info'); return; }
      try {
        var fn = 'Promo_Report_' + new Date().toISOString().slice(0,10) + '.xlsx';
        var camps = new Set(rows.map(function(r){ return r.campaign; })).size;
        Promise.resolve(window.PC_PromoReport.exportExcel(rows, fn)).then(function(){
          Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', html: 'รายงานแบบบล็อก <b>' + camps + '</b> แคมเปญ → <b>' + fn + '</b>', timer: 2400, showConfirmButton: false });
        }).catch(function(e){ Swal.fire('Error', String(e && e.message || e), 'error'); });
      } catch(e){ Swal.fire('Error', String(e && e.message || e), 'error'); }
    }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).getFullPromoExport('ALL');
  };

  window.toggleAll = function(source) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
  };

  /* พิมพ์โปรที่ติ๊กเลือก (ใช้ checkbox แถว + ติ๊ก All หัวตาราง) */
  window.printSelectedCampaigns = function(){
    var seen={}, names=[];
    document.querySelectorAll('.row-checkbox:checked').forEach(function(c){ var n=c.getAttribute('data-campaign'); if(n && !seen[n]){ seen[n]=1; names.push(n); } });
    if(!names.length){ Swal.fire('ยังไม่ได้เลือก','ติ๊กเลือกโปรที่ต้องการพิมพ์ก่อน (หรือใช้ช่องติ๊ก All ที่หัวตาราง)','info'); return; }
    var map={}; allCampaigns.forEach(function(c){ if(!map[c.campaign]) map[c.campaign]=c; });
    var rows = names.map(function(n){ return map[n]; }).filter(Boolean);
    window.ctPrintRows(rows, 'รายการโปรโมชันที่เลือก ('+rows.length+' รายการ)');
  };
  /* renderer พิมพ์ตาราง (ใช้ทั้งพิมพ์ที่เลือก/พิมพ์ทั้งหมด) */
  window.ctPrintRows = function(rows, title){
    var esc=function(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;'})[c];});};
    var body = rows.map(function(c,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(c.campaign)+'</td><td>'+esc(c.promoType||'')+'</td><td>'+esc(c.codePromotion||c.promoCode||c.codeItemSet||c.itemPromoCode||'')+'</td><td>'+esc(c.startDate||'')+'</td><td>'+esc(c.endDate||'')+'</td><td>'+esc(c.channel||'')+'</td><td>'+esc(c.itStatus||'')+'</td><td>'+esc(c.opStatus||'')+'</td><td>'+esc(c.txnDate?new Date(c.txnDate).toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'')+'</td><td>'+esc(c.reporter||c.submittedBy||'')+'</td></tr>'; }).join('');
    var st='body{font-family:Kanit,sans-serif;padding:24px;color:#1a1d20}h2{margin:0 0 4px}.sub{color:#666;font-size:13px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #cfd4da;padding:6px 8px;text-align:left}thead th{background:#1a1d20;color:#fff}tbody tr:nth-child(even){background:#f6f8fa}';
    var html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+st+'</style></head><body>'+
      '<h2>'+esc(title)+'</h2><div class="sub">Potato Corner · พิมพ์เมื่อ '+new Date().toLocaleString('th-TH')+'</div>'+
      '<table><thead><tr><th>#</th><th>ชื่อแคมเปญ</th><th>ประเภท</th><th>Code Promotion</th><th>เริ่ม</th><th>สิ้นสุด</th><th>ช่องทาง</th><th>IT</th><th>OP</th><th>วันที่ทำรายการ</th><th>ผู้ส่งงาน</th></tr></thead><tbody>'+body+'</tbody></table></body></html>';
    var w=window.open('','_blank'); if(!w){ Swal.fire('ป๊อปอัปถูกบล็อก','กรุณาอนุญาต popup เพื่อพิมพ์','warning'); return; }
    w.document.write(html); w.document.close();
    try{ w.focus(); setTimeout(function(){ try{ w.print(); }catch(e){} }, 500); }catch(e){}
  };

  // ===== ปุ่มกรอง (แบบเดียวกับหน้า OP): สถานะ (opStatus) + ประเภท lifecycle (changeStatus) =====
  window.setCtStatusFilter = function(btn, f){
    ctStatusFilter = f; currentPage = 1;
    var g = document.getElementById('ctStatusFilter');
    if(g) g.querySelectorAll('button').forEach(function(b){
      b.classList.remove('active','btn-success','btn-secondary','text-white','btn-outline-secondary');
      if(b===btn){ b.classList.add('active', f==='ALL'?'btn-success':'btn-secondary','text-white'); }
      else b.classList.add('btn-outline-secondary');
    });
    window.renderTracking();
  };
  window.setCtLifeFilter = function(btn, lf){
    ctLifeFilter = lf; currentPage = 1;
    var g = document.getElementById('ctLifeFilter');
    if(g) g.querySelectorAll('button').forEach(function(b){
      b.classList.remove('active','btn-dark','btn-outline-dark');
      if(b===btn) b.classList.add('active','btn-dark'); else b.classList.add('btn-outline-dark');
    });
    window.renderTracking();
  };

  // Co-Promotion? — match ด้วยชื่อแคมเปญ หรือ โค้ด (Code Promotion / Code Item Set)
  window.ctIsCoPromo = function(camp){
    if (window.__ctCoPromo && window.__ctCoPromo.has(camp.campaign)) return true;
    if (window.__ctCoPromoCodes) {
      var codes = [camp.codePromotion, camp.promoCode, camp.codeItemSet, camp.itemPromoCode, camp.code];
      for (var i=0;i<codes.length;i++){ var c=String(codes[i]||'').trim().toUpperCase(); if(c && window.__ctCoPromoCodes.has(c)) return true; }
    }
    return false;
  };

  window.renderTracking = function() {
    const tbody = document.getElementById('trackingTableBody');
    if (!tbody) return;
    /* FX-P59 — ข้อมูลยังมาไม่ถึง (สลับหน้าเร็ว) → ดึงให้เองครั้งเดียว แทนการขึ้น "ไม่พบข้อมูลที่ค้นหา" */
    if (!allCampaigns.length && !window.__ctLoaded && !window.__ctLoading) {
      window.__ctLoading = true;
      setTimeout(function () { window.__ctLoading = false; if (!allCampaigns.length && document.getElementById('trackingTableBody')) window.loadTrackingData(); }, 50);
    }
    expandedRowIdx = null; // any full re-render (filter/refresh/paginate) collapses the open detail
    if (window.ctSetFocus) window.ctSetFocus(false);
    const searchTerm = (document.getElementById('searchTerm')?.value || '').toLowerCase();
    const monthVal = document.getElementById('monthPicker')?.value;

    const filters = {
      campaign: document.getElementById('f_name')?.value,
      promoType: document.getElementById('f_type')?.value,
      startDate: document.getElementById('f_start')?.value,
      endDate: document.getElementById('f_end')?.value,
      channel: document.getElementById('f_mode')?.value,
      itStatus: document.getElementById('f_it')?.value,
      opStatus: document.getElementById('f_op')?.value,
      reporter: document.getElementById('f_reporter')?.value
    };

    const uniqueMap = new Map();
    allCampaigns.forEach(item => {
      if (!uniqueMap.has(item.campaign)) {
        uniqueMap.set(item.campaign, item);
      }
    });
    const uniqueData = Array.from(uniqueMap.values());
    /* index โค้ดต่อแคมเปญ (Code Promotion / Code Item Set จากทุก line) — ให้ค้นหาด้วยโค้ดได้ */
    const codeIndex = {};
    allCampaigns.forEach(item => {
      const key = item.campaign; if (!key) return;
      const codes = [item.codePromotion, item.promoCode, item.codeItemSet, item.itemPromoCode, item.code, item.shortName, item.kitchen, item.itemNameEN, item.itemCode].filter(Boolean).join(' ').toLowerCase();
      codeIndex[key] = (codeIndex[key] ? codeIndex[key] + ' ' : '') + codes;
    });

    const filteredData = uniqueData.filter(c => {
      const matchSearch = (!searchTerm || (c.campaign || '').toLowerCase().includes(searchTerm) || (codeIndex[c.campaign] || '').includes(searchTerm));
      var _mOnly = document.getElementById('monthOnlyPicker')?.value || '';
      if (_mOnly && !pcMonthOverlap(_mOnly, c.startDate, c.endDate)) return false;
      let matchMonth = true;
      if(monthVal) {
        /* FX-P54 — โหมดของตัวกรองวันที่: ใช้งานวันนั้น (เดิม) / เริ่มวันนั้น / จบวันนั้น */
        var _pD = function(s){ var mm=String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); if(mm) return new Date(+mm[3],+mm[2]-1,+mm[1]).getTime(); var t=Date.parse(s); return isNaN(t)?0:t; };
        var _d=Date.parse(monthVal), _st=_pD(c.startDate), _en=_pD(c.endDate);
        var _dm=(document.getElementById('dateMode')||{}).value||'ACTIVE';
        /* เทียบ "วันเดียวกัน" ต้องเทียบเป็นข้อความ Y-M-D — Date.parse('2026-08-03') = เที่ยงคืน UTC
           แต่วันที่ในตารางถูกแปลงเป็นเที่ยงคืนตามเครื่อง ต่างกัน 7 ชม. → เทียบ === ไม่มีวันตรง */
        var _ymd=function(ms){ if(!ms) return ''; var dd=new Date(ms); return dd.getFullYear()+'-'+('0'+(dd.getMonth()+1)).slice(-2)+'-'+('0'+dd.getDate()).slice(-2); };
        var _pick=String(monthVal).slice(0,10);
        if(_dm==='START') matchMonth = _ymd(_st)===_pick;
        else if(_dm==='END') matchMonth = _ymd(_en)===_pick;
        else matchMonth = (!_st || _d>=_st) && (!_en || _d<=_en);
      }
      let matchFilter = true;
      for (let key in filters) { 
        if (!filters[key]) continue;
        if (key === 'campaign' || key === 'reporter') {
          if (!String(c[key]||'').toLowerCase().includes(String(filters[key]).toLowerCase())) matchFilter = false;
        } else if ((c[key] || '-') !== filters[key]) matchFilter = false; 
      }
      // ปุ่มกรอง: สถานะ (opStatus) + ประเภท lifecycle (changeStatus) — NEW = ยังไม่มี change
      var _op = String(c.opStatus||'WAITING').toUpperCase();
      var matchStatus = (ctStatusFilter==='ALL') || _op===ctStatusFilter;
      var _chg = String(c.changeStatus||'').toUpperCase();
      var matchLife = (ctLifeFilter==='ALL') || (ctLifeFilter==='NEW' ? !_chg : _chg===ctLifeFilter);
      return matchSearch && matchMonth && matchFilter && matchStatus && matchLife;
    });

    const ctToDate = (s)=>{ const m=String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():(Date.parse(s)||0); };
    filteredData.sort((a,b)=> ctToDate(b.startDate) - ctToDate(a.startDate));
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    let html = '';
    const fmtTxn = (s)=>{ if(!s) return ''; const d=new Date(s); return isNaN(d.getTime())?esc(String(s)):d.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
    paginatedData.forEach(camp => {
      const isExpanded = String(expandedRowIdx) === String(camp.rowIdx);
      const chg = (camp.changeStatus || '').toUpperCase();
      const isCancelled = (chg === 'CANCELLED' || camp.opStatus === 'CANCELLED');
      
      let itCls = 'bg-warning text-dark';
      if (camp.itStatus === 'COMPLETE') itCls = 'bg-success text-white';
      else if (camp.itStatus === 'CANCELLED') itCls = 'bg-secondary text-white';

      let lifeTag = '';
      if (chg === 'EXTENDED') lifeTag = '<span class="life-tag tag-ext"><i class="fas fa-calendar-plus"></i> ขยายเวลา</span>';
      /* remark ฝั่ง MKT: ขยายแล้วแต่ยังไม่ได้แนบโค้ดใหม่ — เตือนให้ตามแนบ ไม่งั้นโค้ดไม่พอใช้ช่วงที่ขยาย */
      var _noCode = /ยังไม่ได้แนบโค้ดใหม่/.test(String(camp.extendCodeNote || ''));
      if (_noCode && (chg === 'EXTENDED' || chg === 'REDUCED')) lifeTag += '<span class="life-tag" style="background:#fff4e5;color:#8a5a00;border:1px solid #e0a800" title="ขยายเวลาแล้วแต่ยังไม่ได้แนบโค้ดใหม่ — กดปุ่มขยายอีกครั้งแล้วเลือกเพิ่มโค้ด"><i class="fas fa-triangle-exclamation"></i> ยังไม่แนบโค้ด</span>';
      else if (chg === 'REDUCED') lifeTag = '<span class="life-tag tag-red"><i class="fas fa-calendar-minus"></i> ลดเวลา</span>';
      else if (chg === 'CANCELLED') lifeTag = '<span class="life-tag tag-cancel"><i class="fas fa-ban"></i> ยกเลิก</span>';
      else if (String(camp.opStatus || '').toUpperCase() !== 'CONFIRMED') lifeTag = '<span class="life-tag tag-new">NEW</span>';

      let endCls = '', endFlag = '';
      if (chg === 'EXTENDED') { endCls = 'text-info fw-bold'; endFlag = '<i class="fas fa-arrow-up-long end-flag text-info" title="ขยายวันสิ้นสุด"></i>'; }
      else if (chg === 'REDUCED') { endCls = 'text-danger fw-bold'; endFlag = '<i class="fas fa-arrow-down-long end-flag text-danger" title="ลดวันสิ้นสุด"></i>'; }

      const opCls = (camp.opStatus === 'CONFIRMED' || camp.opStatus === 'APPROVED' || camp.opStatus === 'COMPLETE') ? 'bg-success text-white' : 
                    (camp.opStatus === 'REJECTED' ? 'bg-danger text-white' : (camp.opStatus === 'CANCELLED' ? 'bg-danger text-white' : 'bg-secondary text-white'));
      
      html += `
        <tr data-rowidx="${camp.rowIdx}" class="${isExpanded ? 'expand-row fw-bold' : ''}">
          <td><input class="form-check-input row-checkbox" type="checkbox" data-campaign="${camp.campaign}"></td>
          <td class="text-start ps-3"><div>${camp.campaign || ''}${camp.customerGroup === 'crm' ? ` <span class="badge" style="background:#eafaf1;color:#15623c;border:1px solid #bfe6cf;font-weight:700;font-size:.62rem;vertical-align:middle" title="โปรลูกค้า CRM${camp.crmTargetName ? ' · ' + camp.crmTargetName : ''}"><i class="fas fa-user-check"></i> CRM</span>` : ''}${(window.ctIsCoPromo && window.ctIsCoPromo(camp)) ? ` <span class="badge" style="background:#fff0e6;color:#a24a12;border:1px solid #f2c9a8;font-weight:800;font-size:.62rem;vertical-align:middle" title="Co-Promotion (ร่วมพาร์ทเนอร์)"><i class="fas fa-handshake"></i> CO-PROMO</span>` : ''} ${(window.PC_voucherTag ? PC_voucherTag(camp) : '')}</div>${lifeTag}</td>
          <td class="text-start ps-3">${camp.promoType || ''}</td>
          <td>${camp.startDate || ''}</td>
          <td class="${endCls}">${camp.endDate || ''}${endFlag}</td>
          <td style="text-align:left">${window.PCniceChannel ? PCniceChannel(camp.channel) : (camp.channel || '-')}</td>
          <td><span class="status-badge ${itCls}">${camp.itStatus || 'PENDING'}</span></td>
          <td><span class="status-badge ${opCls}">${camp.opStatus || 'WAITING'}</span>${camp.opStatus === 'REJECTED' && camp.rejectReason ? `<button class="btn btn-sm btn-link text-danger p-0 d-block mx-auto" style="font-size:.65rem;" onclick="window.showRejectReason('${encodeURIComponent(camp.rejectReason||'').replace(/'/g,'%27')}')"><i class="fas fa-circle-info me-1"></i>ดูเหตุผล</button>` : ''}</td>
          <td class="small">${camp.txnDate ? fmtTxn(camp.txnDate) : '<span class="text-muted">-</span>'}</td>
          <td class="small">${(camp.reporter||camp.submittedBy) ? esc(camp.reporter||camp.submittedBy) : '<span class="text-muted">-</span>'}</td>
          <td>
            <div class="d-flex justify-content-center">
              <button class="btn-circle btn-edit-mode shadow-sm" title="ดูรายละเอียด" onclick="window.toggleExpand(${camp.rowIdx})"><i class="fas ${isExpanded ? 'fa-times text-danger' : 'fa-eye'}"></i></button>
              <button class="btn-circle btn-light border shadow-sm text-dark mkt-admin-only" title="แก้ไขทุกช่องในแถวนี้ (แอดมิน)" onclick="window.ctEditRow(${camp.rowIdx})" ${isCancelled ? 'disabled' : ''}><i class="fas fa-pen"></i></button>
              <button class="btn-circle btn-light border shadow-sm text-primary" onclick="window.extendCampaignPopup('${camp.campaign}', '${camp.endDate}', '${camp.startDate}', '${String(camp.promoType||'').replace(/'/g,"\\'")}', '${String(camp.itemPromoCode||'').replace(/'/g,"\\'")}')" ${isCancelled ? 'disabled' : ''}><i class="fas fa-calendar-plus"></i></button>
              <button class="btn-circle btn-light border shadow-sm text-danger" onclick="window.cancelCampaignPopup('${String(camp.campaign||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')}')" ${isCancelled ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;

      if (isExpanded) {
        html += `<tr class="expand-row"><td colspan="11" class="expand-content-cell"><div class="item-table-wrapper" id="expand-container-${camp.rowIdx}"><div class="text-center py-4"><div class="spinner-border spinner-border-sm text-warning" role="status"></div></div></div></td></tr>`;
      }
    });

    tbody.innerHTML = html || '<tr><td colspan="11" class="py-5 text-muted text-center">ไม่พบข้อมูลที่ค้นหา</td></tr>';
    window.renderSummary({ 
      all: filteredData.length, 
      pending: filteredData.filter(x=>x.itStatus!=='COMPLETE' && x.itStatus!=='CANCELLED').length, 
      complete: filteredData.filter(x=>x.itStatus==='COMPLETE').length 
    });
    window.updatePaginationControls(filteredData.length, Math.ceil(filteredData.length / rowsPerPage));
    if (expandedRowIdx !== null) window.fetchItemsToRow(expandedRowIdx);
  };

  /* ===== แก้ไขทุกช่องระดับแคมเปญในตาราง MKT (แอดมิน) — inline row edit → updateCampaignMeta ===== */
  function ctToISO(s){ var m=String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); if(m) return m[3]+'-'+m[2]+'-'+m[1]; var t=Date.parse(s); if(!isNaN(t)){ var d=new Date(t); var mo=('0'+(d.getMonth()+1)).slice(-2), da=('0'+d.getDate()).slice(-2); return d.getFullYear()+'-'+mo+'-'+da; } return ''; }
  function ctOpts(list, cur){ return list.map(function(v){ return '<option value="'+v+'"'+(String(cur||'').toUpperCase()===v?' selected':'')+'>'+v+'</option>'; }).join(''); }
  window.ctEditRow = function(rowIdx){
    if(!IS_ADMIN){ return; }
    var tbody = document.getElementById('trackingTableBody'); if(!tbody) return;
    var tr = tbody.querySelector('tr[data-rowidx="'+rowIdx+'"]'); if(!tr) return;
    var camp = allCampaigns.find(function(x){ return String(x.rowIdx)===String(rowIdx); }); if(!camp) return;
    // ตัวเลือก promoType จากค่าที่มีในระบบ + ค่ามาตรฐาน
    var types = [].concat(['Price Promotion','Item Set','Item Coupon','Bill Discount','Voucher','E-Voucher','Item coupon Online','Bill discount Online','Voucher Online'],
      allCampaigns.map(function(c){ return c.promoType; })).filter(Boolean);
    types = Array.from(new Set(types));
    var dlId = 'ctmType-'+rowIdx;
    var dl = '<datalist id="'+dlId+'">'+types.map(function(t){ return '<option value="'+ctEsc(t)+'">'; }).join('')+'</datalist>';
    var inSt = 'form-control form-control-sm ctm-f';
    tr.classList.add('ctm-editing');
    tr.innerHTML =
      '<td class="text-center"><i class="fas fa-pen text-warning" title="กำลังแก้ไข"></i></td>'+
      '<td class="ps-2"><input class="'+inSt+'" data-f="campaign" value="'+ctEsc(camp.campaign||'')+'">'+dl+'</td>'+
      '<td class="ps-2"><input class="'+inSt+'" data-f="promoType" list="'+dlId+'" value="'+ctEsc(camp.promoType||'')+'"></td>'+
      '<td><input type="date" class="'+inSt+'" data-f="start" value="'+ctToISO(camp.startDate)+'"></td>'+
      '<td><input type="date" class="'+inSt+'" data-f="end" value="'+ctToISO(camp.endDate)+'"></td>'+
      '<td><input class="'+inSt+'" data-f="saleMode" style="text-align:left" value="'+ctEsc(camp.channel||'')+'"></td>'+
      '<td><select class="form-select form-select-sm ctm-f" data-f="itStatus">'+ctOpts(['PENDING','COMPLETE','CANCELLED'], camp.itStatus)+'</select></td>'+
      '<td><select class="form-select form-select-sm ctm-f" data-f="opStatus">'+ctOpts(['WAITING','CONFIRMED','REJECTED','CANCELLED'], camp.opStatus)+'</select></td>'+
      '<td class="small text-muted text-center">'+(camp.txnDate?ctEsc(new Date(camp.txnDate).toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})):'—')+'</td>'+
      '<td class="small text-muted text-center">'+ctEsc(camp.reporter||camp.submittedBy||'—')+'</td>'+
      '<td><div class="d-flex justify-content-center gap-1">'+
        '<button class="btn-circle btn-success shadow-sm" title="บันทึก" onclick="window.ctSaveRow('+rowIdx+',\''+String(camp.campaign||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')"><i class="fas fa-check"></i></button>'+
        '<button class="btn-circle btn-light border shadow-sm text-danger" title="ยกเลิก" onclick="window.renderTracking()"><i class="fas fa-times"></i></button>'+
      '</div></td>';
    var f = tr.querySelector('input[data-f="campaign"]'); if(f) f.focus();
  };
  window.ctSaveRow = function(rowIdx, oldName){
    var tbody = document.getElementById('trackingTableBody'); if(!tbody) return;
    var tr = tbody.querySelector('tr[data-rowidx="'+rowIdx+'"]'); if(!tr) return;
    var patch = {};
    tr.querySelectorAll('.ctm-f').forEach(function(el){ patch[el.getAttribute('data-f')] = el.value; });
    if(!String(patch.campaign||'').trim()){ Swal.fire('','ชื่อแคมเปญห้ามว่าง','warning'); return; }
    Swal.fire({ title:'กำลังบันทึก...', allowOutsideClick:false, didOpen:function(){ Swal.showLoading(); } });
    google.script.run.withSuccessHandler(function(r){
      if(r&&r.status==='success'){ Swal.fire({icon:'success',title:'บันทึกแล้ว',text:r.message,timer:1600,showConfirmButton:false}); window.loadTrackingData(); }
      else Swal.fire('ผิดพลาด',(r&&r.message)||'ไม่สำเร็จ','error');
    }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).updateCampaignMeta(oldName, patch);
  };

  window.handleFileChange = function(rowIdx, hasExistingFile) {
    const fileInput = document.getElementById(`memoFile-${rowIdx}`);
    const saveBtn = document.getElementById(`saveBtn-${rowIdx}`);
    if (fileInput && fileInput.files.length > 0) {
      saveBtn.disabled = false;
      saveBtn.style.backgroundColor = "#198754";
      saveBtn.style.color = "white";
      saveBtn.title = "บันทึกไฟล์ Memo ใหม่";
    } else if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.backgroundColor = "#adb5bd";
      saveBtn.title = "แนบไฟล์ Memo ใหม่ก่อนจึงบันทึกได้";
    }
  };

window.fetchItemsToRow = function(targetRowIdx) {
    const container = document.getElementById(`expand-container-${targetRowIdx}`);
    if (!container) return;
    container.innerHTML = '<div class="text-center p-4"><div class="spinner-border"></div> Loading...</div>';

    const campBase = allCampaigns.find(x => x.rowIdx === targetRowIdx);
    if (!campBase) return;
    
    const campaignName = campBase.campaign; 
    const isCancelled = (campBase.itStatus === 'CANCELLED' || campBase.opStatus === 'CANCELLED');
    const isCoupon = (campBase.promoType || '').toLowerCase().includes('coupon');
    const typeLower = (campBase.promoType || '').toLowerCase();
    const isSpecialType = typeLower.includes('voucher') || typeLower.includes('bill discount');
    const isPrice = typeLower.includes('price');

    google.script.run.withSuccessHandler(res => {
      currentStoreCache[targetRowIdx] = res.storeData || [];
      
      let lastShortName = "";
      const items = res.items || [];
      const groupSummaries = {};
      items.forEach(it => { 
        if (!groupSummaries[it.shortName]) groupSummaries[it.shortName] = 0; 
        groupSummaries[it.shortName] += (parseFloat(it.qty||0) * parseFloat(it.price||0)); 
      });
      // ตรวจ Code Promo ซ้ำข้ามปุ่มในแคมเปญเดียวกัน → ไฮไลต์เตือน
      const _codeByShort = {};
      items.forEach(it => { if (it.shortName && i_codeOf(it)) _codeByShort[it.shortName] = i_codeOf(it); });
      const _codeCount = {};
      Object.keys(_codeByShort).forEach(sn => { const c = _codeByShort[sn]; _codeCount[c] = (_codeCount[c]||0)+1; });
      function i_codeOf(it){ return it.codePromotion || ''; }
      // ตรวจ Item Code / Item Set ซ้ำข้ามปุ่มด้วย (โค้ดไอเทมเดียวไปอยู่หลายปุ่ม)
      const _setByShort = {};
      items.forEach(it => { if (it.shortName) { const sc = (it.itemSetCode && it.itemSetCode !== '-') ? it.itemSetCode : ((it.itemCode && it.itemCode !== 'N/A') ? it.itemCode : ''); if (sc) _setByShort[it.shortName] = sc; } });
      const _setCount = {};
      Object.keys(_setByShort).forEach(sn => { const c = _setByShort[sn]; _setCount[c] = (_setCount[c]||0)+1; });

      const _bracketNet = (s) => { const m = String(s||'').match(/\[(\d+(?:\.\d+)?)\]/); return m ? parseFloat(m[1]) : null; };
      const _campNet = _bracketNet(campaignName);
      let rowsHtml = items.map((i, idx) => {
        /* บรรทัดแรกของปุ่มเท่านั้นที่โชว์ Code Promotion/Item Set/ครัว/ชื่อปุ่ม
           แถวสินค้าที่ไม่มีชื่อปุ่ม (ว่าง/-) = ลูกของปุ่มก่อนหน้า · เดิมถูกนับเป็นปุ่มใหม่ ทำให้โค้ดโชว์ซ้ำทุกแถว */
        const _snRaw = String(i.shortName == null ? '' : i.shortName).trim();
        const _snEmpty = (_snRaw === '' || _snRaw === '-');
        const isHeader = !_snEmpty && _snRaw !== lastShortName;
        if (!_snEmpty) lastShortName = _snRaw;

        const rowGross = parseFloat(i.qty || 0) * parseFloat(i.price || 0);
        const rowDiscount = parseFloat(i.discount || 0);
        const rowNet = rowGross - rowDiscount;
        const groupNet = (groupSummaries[i.shortName] || 0) - parseFloat(i.discount || 0);
        // ราคาใน [ ] = Net (เช่น WOW Set 1 [109], Combo JCNG[165]) — ถ้า Net คำนวณได้ 0/ว่าง ใช้เลขในวงเล็บแทน
        const _fbNet = (_bracketNet(i.shortName) != null ? _bracketNet(i.shortName) : _campNet);
        const _codeVal = isHeader ? (i.codePromotion || res.promoCode || '') : '';
        const _codeDup = isHeader && _codeVal && _codeCount[_codeVal] > 1;
        const _imp = (typeof ctItemMap !== 'undefined' && ctItemMap[String(i.itemCode)]) || {};
        const _imGross = (window.ctPriceFor ? window.ctPriceFor(_imp, String((campBase && (campBase.channel || campBase.saleMode)) || '')) : '');

        let dGross, dDiscount, dNet;
        if (isCoupon) {
            dGross = rowGross.toFixed(2);
            dDiscount = rowDiscount.toFixed(2);
            dNet = rowNet.toFixed(2);
        } else {
            let _gShow = (isPrice && _imGross != null && _imGross !== '' && !isNaN(parseFloat(_imGross))) ? parseFloat(_imGross) : rowGross;
            if (parseFloat(i.price) > 0) _gShow = parseFloat(i.price) * (parseFloat(i.qty) || 1);  // ราคาที่แก้เองมาก่อน item master
            dGross = isHeader ? _gShow.toFixed(2) : '';
            dDiscount = isHeader ? i.discount || 0 : '';
            let _hdrNet = (parseFloat(i.netPrice) > 0 ? parseFloat(i.netPrice) : (_fbNet != null ? _fbNet : groupNet));
            dNet = isSpecialType ? '' : (isHeader ? _hdrNet.toFixed(2) : '');
        }
        const _pEditable = !isCancelled;   // เปิดให้แก้ราคาได้ทุกแถว (ข้อมูลเข้าไม่ครบ — กรอกเองได้)
        const _pAttr = 'data-code="'+String(_codeVal||i.codePromotion||'').replace(/"/g,'&quot;')+'" data-item="'+String(i.itemCode||'').replace(/"/g,'&quot;')+'"';
        /* ราคา/ส่วนลด/Net เป็นข้อมูล "รายสินค้า" → แถวลูกต้องโชว์ด้วย (ต่างจาก Code Promotion ที่โชว์เฉพาะบรรทัดแรกของปุ่ม) */
        const _isChildRow = (typeof _snEmpty !== 'undefined') ? _snEmpty : false;
        const _vGross = (i.price!=null && i.price!=='' && parseFloat(i.price)>0) ? (parseFloat(i.price)*(parseFloat(i.qty)||1)) : ((isHeader||_isChildRow) ? (dGross||'') : '');
        const _vDisc  = (i.discount!=null && i.discount!=='') ? i.discount : ((isHeader||isCoupon||_isChildRow) ? (dDiscount||0) : 0);
        let _vNet     = (parseFloat(i.netPrice)>0) ? parseFloat(i.netPrice) : ((isHeader||isCoupon||_isChildRow) ? (dNet||'') : '');
        /* แถวสินค้าเสริมของปุ่ม (ไม่มีชื่อปุ่ม) มัก net=0 ในข้อมูล → คิดจาก ราคา − ส่วนลด ให้เห็นตัวเลขจริง */
        if (_isChildRow && (_vNet === '' || _vNet == null || Number(_vNet) === 0)) {
          const _g = parseFloat(_vGross) || 0, _d = /[%฿]/.test(String(_vDisc)) ? 0 : (parseFloat(_vDisc) || 0);
          if (_g > 0) _vNet = Math.max(0, _g - _d);
        }

const fileDisplay = isHeader ? (i.itemRowUrl && i.itemRowUrl.trim() !== "" ? 
    `<i class="fas fa-folder-open fa-lg text-primary" style="cursor:pointer;" 
        onclick="window.pcOpenAttach('${i.itemRowUrl}')" 
        title="View Attachment"></i>` : 
    `<span class="text-muted" title="No file attached"><i class="fas fa-file-circle-xmark fa-lg"></i></span>`) : '';

        const greyStyle = 'background-color: #f1f3f5; color: transparent; border-color: #dee2e6;';
        const promoGreyStyle = 'background-color: #f1f3f5; color: #6c757d; border: 1px solid #dee2e6; font-weight: bold;';
        const _im = ctItemName(i.itemCode) || {};
        const _mEn = String(_im.en || '').replace(/"/g,'&quot;');   // ItemNameEN = ชื่อโชว์บิลครัว
        const _mTh = String(_im.th || '').replace(/"/g,'&quot;');   // ItemNameTH = ชื่อปุ่ม POS
        const _isSet = /item\s*set/i.test(_im.type || '');
        const _hasSet = i.itemSetCode && i.itemSetCode !== '-';
        // ---- ค่าตั้งต้นต่อแถว ----
        let _kitchen = isHeader ? (i.kitchen || '') : '';
        let _short   = isHeader ? (i.shortName || '') : '';
        let _setCode = _hasSet ? i.itemSetCode : (_isSet ? (i.itemCode || '') : (i.itemSetCode || ''));
        let _itemCodeCell = (_isSet || isCoupon || isSpecialType) ? '' : (i.itemCode || '');
        let _nameEn = String(_im.en || i.itemNameEn || '').replace(/"/g,'&quot;');
        let _nameTh = String(_im.th || i.itemNameTh || '').replace(/"/g,'&quot;');
        if (isPrice) {
          // Price Promo: ครัว=Kitchen Name(จริง) · Short Name=ชื่อปุ่ม · รหัส=Code Item Set(หัวปุ่ม) · โชว์ Item Code + ชื่อสินค้าครบทุกบรรทัด (ให้ตรงกับหน้า OP)
          _kitchen = isHeader ? String(i.kitchen||'').replace(/"/g,'&quot;') : '';
          _short   = isHeader ? String(i.shortName||'').replace(/"/g,'&quot;') : '';
          _setCode = isHeader ? (_hasSet ? i.itemSetCode : (i.itemCode || '')) : '';
          _itemCodeCell = i.itemCode || '';
          _nameEn = String(_im.en || i.itemNameEn || '').replace(/"/g,'&quot;');
          _nameTh = String(_im.th || i.itemNameTh || '').replace(/"/g,'&quot;');
        }
        if (isCoupon || isSpecialType) {   // Item Coupon / Bill Discount / Voucher / E-Voucher → Item Set + ครัว ว่างเสมอ · โชว์ Item Code + ชื่อสินค้า
          _setCode = '';
          _kitchen = '';
          _itemCodeCell = i.itemCode || '';
        }

        const _edAttr = 'data-code="'+String(_codeVal||i.codePromotion||'').replace(/"/g,'&quot;')+'" data-item="'+String(i.itemCode||'').replace(/"/g,'&quot;')+'"';
        const _edStyle = 'background:#f0f8ff;border:1px solid #b8d4f0;';
        return `<tr>
          <td class="fw-bold text-dark" style="white-space:nowrap;background:#f3f6fb;font-size:.8rem">${isHeader ? (/item\s*set/i.test(String(campBase.promoType||'')) ? 'Price Promotion' : (campBase.promoType||'-')) : ''}</td>
          <td><input type="text" class="item-input row-edit" data-f="codePromotion" ${_edAttr} value="${_codeVal}" style="${_codeDup ? 'background:#fdecec;color:#c0392b;border:2px solid #e74c3c;font-weight:bold;' : _edStyle}" ${_codeDup ? 'title="⚠ Code Promo ซ้ำกับปุ่มอื่นในแคมเปญนี้"' : ''}></td>
          <td><input type="text" class="item-input row-edit" data-f="itemPromotion" ${_edAttr} value="${isHeader ? _setCode : ''}" style="${(isHeader && _setCode && _setCount[_setCode] > 1) ? 'background:#fdecec;color:#c0392b;border:2px solid #e74c3c;font-weight:bold;' : _edStyle}" ${(isHeader && _setCode && _setCount[_setCode] > 1) ? 'title="⚠ Item Code/Item Set ซ้ำกับปุ่มอื่น"' : ''}></td>
          <td><input type="text" class="item-input row-edit" data-f="kitchen" ${_edAttr} value="${_kitchen}" style="${_edStyle}"></td>
          <td><input type="text" class="item-input row-edit" data-f="shortName" ${_edAttr} value="${_short}" style="${_edStyle}"></td>
          <td><div class="input-group input-group-sm"><input type="text" class="item-input row-edit item-code-blue" data-f="itemCode" ${_edAttr} data-short="${String(i.shortName||'').replace(/"/g,'&quot;')}" data-camp="${String(campaignName).replace(/"/g,'&quot;')}" data-sale="${String(campBase.saleMode||'').replace(/"/g,'&quot;')}" value="${_itemCodeCell || (i.itemCode||'')}" style="${_edStyle}"><button class="btn btn-outline-primary mkt-admin-only" type="button" title="เลือกสินค้า (กรองหมวด)" onclick="window.ctPickItem(this)"><i class="fas fa-magnifying-glass"></i></button>${isHeader ? `<button class="btn btn-outline-success mkt-admin-only" type="button" title="เพิ่มสินค้าในปุ่มนี้" onclick="window.ctAddItem(this)"><i class="fas fa-plus"></i></button>` : ''}<button class="btn btn-outline-danger mkt-admin-only" type="button" title="ลบรายการนี้ (ลบทุกที่)" onclick="window.ctDeleteItem(this)"><i class="fas fa-trash"></i></button></div></td>
          <td><input type="text" class="item-input row-edit" data-f="itemNameEN" ${_edAttr} style="text-align:left;${_edStyle}" value="${_nameEn}"></td>
          <td><input type="text" class="item-input row-edit" data-f="itemNameTH" ${_edAttr} style="text-align:left;${_edStyle}" value="${_nameTh}"></td>
          <td><input type="number" class="item-input row-edit" data-f="qty" ${_edAttr} value="${i.qty||0}" style="${_edStyle}" oninput="window.ctRecalcNet(this)"></td>
          <td><input type="number" class="item-input row-edit price-edit" data-f="gross" ${_edAttr} value="${_vGross}" style="background:#fffdf0;border:1px solid #f0d98c;" oninput="window.ctRecalcNet(this)"></td>
          <td class="fw-bold text-success align-middle" style="white-space:nowrap;background:#eef9f1">${isHeader ? '฿'+Number(groupSummaries[i.shortName]||0).toLocaleString() : ''}</td>
          <td><input type="${/[%฿]/.test(String(_vDisc))?'text':'number'}" class="item-input row-edit price-edit text-danger-custom" data-f="discount" ${_edAttr} value="${_vDisc}" style="background:#fffdf0;border:1px solid #f0d98c;" oninput="window.ctRecalcNet(this)"></td>
          <td><input type="number" class="item-input row-edit price-edit item-net-bold" data-f="net" ${_edAttr} value="${_vNet}" style="background:#fffdf0;border:1px solid #f0d98c;font-weight:bold;"></td>
          <td class="text-center">${fileDisplay}</td>
        </tr>`;
      }).join('');

      const _campJs = String(campaignName).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      let memoHtml = res.hasMemo 
        ? `<div class="h-100 p-3" style="border: 1px solid #dc3545; border-radius: 12px; background: #fff5f5;">
            <div class="text-center w-100">
              <small class="fw-bold d-block text-danger mb-2" style="letter-spacing: 1px; font-size: 12px;">MEMO MKT: [ATTACHED]</small>
              <div class="d-flex align-items-center gap-2 mb-3">
                <i class="fas fa-file-signature fa-3x text-danger"></i>
                <button type="button" class="btn btn-danger flex-grow-1 shadow-sm fw-bold" onclick="window.pcViewMemo('${_campJs}', '${res.memoUrl}')">
                  <i class="fas fa-external-link-alt me-2"></i>VIEW MEMO
                </button>
              </div>
              <input type="file" id="memoFile-${targetRowIdx}" class="form-control form-control-sm" accept=".pdf" onchange="window.handleFileChange(${targetRowIdx}, true)" ${isCancelled ? 'disabled' : ''}>
            </div>
          </div>`
        : `<div class="h-100 p-3" style="border: 1px dashed #dee2e6; border-radius: 12px; background: #fafafa;">
            <div class="text-center w-100">
              <i class="fas fa-file-upload fa-2x text-muted mb-2"></i>
              <small class="fw-bold d-block text-dark mb-2">ATTACH MEMO <span class="text-muted">(PDF ONLY)</span></small>
              <input type="file" id="memoFile-${targetRowIdx}" class="form-control form-control-sm border-0 bg-light" accept=".pdf" onchange="window.handleFileChange(${targetRowIdx}, false)" ${isCancelled ? 'disabled' : ''}>
            </div>
          </div>`;

      const btnColor = res.hasMemo ? "#6c757d" : "#1a1d20";
      const cleanDetail = (res.promotionDetail || '-').replace(/\n/g, '<br>').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const cleanCondition = (res.condition || '-').replace(/\n/g, '<br>').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      // per-button detail (complete/verbatim from file) for the popup — 1 entry per ปุ่ม (shortName)
      window.__ctDetailCache = window.__ctDetailCache || {};
      (function(){ var seen={}, list=[]; (items||[]).forEach(function(it){ var sn=it.shortName||'-'; if(seen[sn])return; seen[sn]=1; list.push({sn:sn, detail:String(it.detail||''), condition:String(it.condition||'')}); }); window.__ctDetailCache[targetRowIdx]={list:list, campDetail:String(res.promotionDetail||''), campCond:String(res.condition||'')}; })();

      container.innerHTML = `
        <div class="row g-3 mb-4 align-items-stretch">
          <div class="col-md-5">${memoHtml}</div>
          <div class="col-md-4">
            <div class="cate-box h-100 p-3 d-flex flex-column justify-content-center" style="border-radius: 12px; background: #fff;">
              <small class="fw-bold d-block text-muted text-center mb-4" style="font-size: 18px; letter-spacing: 0.9px;">PRODUCT CATEGORY (POS)</small>
              <div class="bg-light rounded p-2">
                  <input id="cateRemark-${targetRowIdx}" class="form-control fw-bold text-dark text-center border-0 bg-transparent" style="font-size: 18px; letter-spacing: 1px;" value="${String(res.cateRemark||'').replace(/"/g,'&quot;')}" placeholder="พิมพ์หมวด POS…">
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="d-flex flex-column h-100 gap-2">
              <button class="btn btn-dark flex-grow-1 d-flex align-items-center justify-content-center gap-3" onclick="window.showStorePopup(${targetRowIdx})" style="border-radius: 12px;">
                <i class="fas fa-store fa-2x"></i>
                <div class="text-start"><small class="fw-bold d-block" style="font-size: 16px; line-height: 1;">STORES</small></div>
              </button>
              <button class="btn btn-outline-dark flex-grow-1 d-flex align-items-center justify-content-center gap-3" onclick="window.showPromotionDetailPopup(${targetRowIdx})" style="border-radius: 12px; background: #fff;">
                <i class="fas fa-info-circle fa-2x"></i>
                <div class="text-start" style="line-height: 1.2;">
                  <small class="fw-bold d-block" style="font-size: 11px;">Promotion Detail</small>
                  <small class="fw-bold d-block" style="font-size: 11px;">& Condition</small>
                </div>
              </button>
            </div>
          </div>
        </div>
        <div class="mkt-admin-only d-flex align-items-center gap-2 mb-2 p-2 rounded flex-wrap" style="background:#eef7ff;border:1px solid #cfe2ff;">
          <span class="small fw-bold text-muted"><i class="fas fa-bullhorn me-1"></i>ชื่อแคมเปญ:</span>
          <input id="campName-${targetRowIdx}" class="form-control form-control-sm fw-bold" style="max-width:360px" value="${String(campaignName).replace(/"/g,'&quot;')}">
          <button class="btn btn-sm btn-outline-primary" onclick="window.ctSaveName('${String(campaignName).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',${targetRowIdx})"><i class="fas fa-pen me-1"></i>แก้ชื่อ</button>
          <button class="btn btn-sm btn-primary fw-bold" onclick="window.ctNewButton('${String(campaignName).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',${targetRowIdx})"><i class="fas fa-plus me-1"></i>สร้างปุ่มใหม่</button>
          <button class="btn btn-sm btn-success fw-bold ms-auto px-3" onclick="window.savePrices('${String(campaignName).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}',${targetRowIdx})"><i class="fas fa-save me-1"></i>บันทึกการแก้ไข</button>
        </div>
        <div class="ct-detail-wrap"><table class="table table-sm table-bordered align-middle shadow-sm mb-4 ct-detail">
          <thead class="table-dark small text-center">
            <tr>
              <th style="background-color: #1f7a3d; white-space:nowrap;">Type Promotion</th>
              <th style="background-color: #343a40; width: 100px;">Code Promo</th>
              <th>Code Item Set</th>
              <th>Kitchen</th>
              <th>Short Name</th>
              <th>Item Code</th>
              <th>Name EN</th>
              <th>Name TH</th>
              <th>Qty</th>
              <th>Gross</th>
              <th style="white-space:nowrap">ราคารวมปกติ</th>
              <th>Discount</th>
              <th>Net</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody class="text-center bg-white" id="ctMainBody-${targetRowIdx}" data-camp="${String(campaignName).replace(/"/g,'&quot;')}" data-sale="${String(campBase.saleMode||'').replace(/"/g,'&quot;')}" data-promotype="${String(campBase.promoType||'').replace(/"/g,'&quot;')}">${rowsHtml}</tbody>
        </table></div>
        <button id="saveBtn-${targetRowIdx}" class="btn btn-circle shadow" onclick="window.saveInline(${targetRowIdx})" title="แนบไฟล์ Memo ใหม่ก่อนจึงจะบันทึกได้" style="background-color: #adb5bd; color: white;" disabled>
          <i class="fas fa-save"></i>
        </button>
        <div id="btnLife-${targetRowIdx}" class="mt-3"></div>`;
      if(!IS_ADMIN){ try{ container.querySelectorAll('.row-edit').forEach(function(i){ i.readOnly=true; i.classList.add('ct-ro'); }); }catch(e){} }
      try { window.loadButtonLifecycle(campaignName, targetRowIdx); } catch(e){}
    }).getPromoDetails(campaignName);
};
  
  /* ===== PER-BUTTON lifecycle panel (ขยาย/ลด/ยกเลิก รายปุ่ม) ===== */
  function ctLifeName(cs){ return ({EXTENDED:'ขยาย',REDUCED:'ลด',CANCELLED:'ยกเลิก'})[cs]||cs; }
  function ctLifeBadge(b){
    var cs = b.changeStatus||'';
    if(!cs) return '<span class="text-muted">—</span>';
    if(b.opStatus!=='CONFIRMED') return '<span class="badge bg-warning text-dark"><i class="fas fa-clock me-1"></i>รอ OP ยืนยัน ('+ctLifeName(cs)+')</span>';
    var m = ({EXTENDED:['bg-info text-dark','ขยายเวลา'],REDUCED:['bg-danger','ลดเวลา'],CANCELLED:['bg-dark','ยกเลิก']})[cs];
    return m ? '<span class="badge '+m[0]+'">'+m[1]+'</span>' : '—';
  }
  window.ctBlifeToggleAll = function(rowIdx, on){ document.querySelectorAll('#btnLife-'+rowIdx+' .ct-blife').forEach(function(c){ c.checked = on; }); };
  window.loadButtonLifecycle = function(campaignName, rowIdx){
    var host = document.getElementById('btnLife-'+rowIdx); if(!host) return;
    var esc = function(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;'})[c];}); };
    var cq = String(campaignName).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    google.script.run.withSuccessHandler(function(btns){
      btns = btns || [];
      if(btns.length < 2){ host.innerHTML=''; return; }
      var rows = btns.map(function(b){
        return '<tr>'+
          '<td class="text-center"><input type="checkbox" class="form-check-input ct-blife" data-sn="'+String(b.shortName).replace(/"/g,'&quot;')+'"></td>'+
          '<td class="text-start fw-bold">'+esc(b.shortName)+'</td>'+
          '<td class="text-center">'+esc(b.end||'-')+'</td>'+
          '<td class="text-center">'+ctLifeBadge(b)+'</td>'+
          '<td class="text-center"><span class="badge '+(b.opStatus==='CONFIRMED'?'bg-success':(b.opStatus==='REJECTED'?'bg-danger':'bg-secondary'))+'">'+esc(b.opStatus)+'</span></td>'+
        '</tr>';
      }).join('');
      host.innerHTML =
        '<div class="border rounded-3 p-3" style="background:#fbfdfb;border-color:#d7e8dc!important">'+
          '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">'+
            '<div class="fw-bold" style="color:#15623c"><i class="fas fa-calendar-week me-1"></i>จัดการรายปุ่ม — ขยาย / ลด / ยกเลิก เฉพาะปุ่มที่เลือก <span class="text-muted fw-normal small">('+btns.length+' ปุ่ม)</span></div>'+
            '<div class="d-flex gap-2">'+
              '<button class="btn btn-sm btn-outline-primary fw-bold" onclick="window.ctBtnLifecycleAction(\''+cq+'\','+rowIdx+',\'extend\')"><i class="fas fa-calendar-plus me-1"></i>ขยาย/ลดเวลาที่เลือก</button>'+
              '<button class="btn btn-sm btn-outline-danger fw-bold" onclick="window.ctBtnLifecycleAction(\''+cq+'\','+rowIdx+',\'cancel\')"><i class="fas fa-ban me-1"></i>ยกเลิกที่เลือก</button>'+
            '</div>'+
          '</div>'+
          '<table class="table table-sm table-bordered align-middle mb-0" style="font-size:.82rem">'+
            '<thead class="table-light text-center"><tr><th style="width:44px"><input type="checkbox" class="form-check-input" onclick="window.ctBlifeToggleAll('+rowIdx+',this.checked)"></th><th class="text-start">ปุ่ม (Short Name)</th><th style="width:120px">วันสิ้นสุด</th><th style="width:200px">สถานะเปลี่ยนแปลง</th><th style="width:110px">OP</th></tr></thead>'+
            '<tbody>'+rows+'</tbody>'+
          '</table>'+
          '<div class="text-muted small mt-2"><i class="fas fa-circle-info me-1"></i>ป้าย ขยาย/ลด/ยกเลิก จะขึ้นจริง<b>หลัง OP ยืนยันปุ่มนั้น</b> · ระหว่างรอจะขึ้น "รอ OP ยืนยัน" · ปุ่มไม่หายจากระบบ</div>'+
        '</div>';
    }).withFailureHandler(function(){ host.innerHTML=''; }).getCampaignButtons(campaignName);
  };
  window.ctBtnLifecycleAction = function(campaignName, rowIdx, mode){
    var checked = [].slice.call(document.querySelectorAll('#btnLife-'+rowIdx+' .ct-blife:checked')).map(function(c){ return c.getAttribute('data-sn'); });
    if(!checked.length){ Swal.fire('ยังไม่ได้เลือกปุ่ม','ติ๊กปุ่มที่ต้องการก่อน','info'); return; }
    var listHtml = '<div style="text-align:left;font-size:13px;max-height:150px;overflow:auto;background:#f8f9fa;border-radius:8px;padding:8px 12px;margin-top:8px">'+checked.map(function(s){ return '• '+String(s).replace(/</g,'&lt;'); }).join('<br>')+'</div>';
    var done = function(res){ Swal.fire('สำเร็จ',(res&&res.message)||'บันทึกแล้ว','success'); window.fetchItemsToRow(rowIdx); if(window.loadTrackingData) window.loadTrackingData(); };
    if(mode==='cancel'){
      Swal.fire({ icon:'warning', title:'ยกเลิก '+checked.length+' ปุ่ม?', html:'ปุ่มที่จะยกเลิก:'+listHtml+'<input id="ctCancelReason" class="swal2-input" placeholder="เหตุผล (ไม่บังคับ)">', showCancelButton:true, confirmButtonText:'ยกเลิกปุ่มที่เลือก', confirmButtonColor:'#dc3545', cancelButtonText:'ปิด' }).then(function(r){
        if(!r.isConfirmed) return;
        var reason=(document.getElementById('ctCancelReason')||{}).value||'';
        Swal.fire({title:'กำลังยกเลิก...',allowOutsideClick:false,didOpen:function(){Swal.showLoading();}});
        google.script.run.withSuccessHandler(done).withFailureHandler(function(e){Swal.fire('Error',String(e),'error');}).cancelButtons(campaignName, checked, reason);
      });
    } else {
      Swal.fire({ icon:'question', title:'ขยาย/ลดเวลา '+checked.length+' ปุ่ม', html:'ปุ่มที่เลือก:'+listHtml+'<label class="d-block text-start small fw-bold mt-2 mb-1">วันสิ้นสุดใหม่</label><input id="ctNewEnd" type="date" class="swal2-input" style="margin:0 0 8px 0"><input id="ctExtNote" class="swal2-input" style="margin:0" placeholder="หมายเหตุถึง IT (ไม่บังคับ)">', showCancelButton:true, confirmButtonText:'บันทึกวันใหม่', confirmButtonColor:'#2e934a', cancelButtonText:'ปิด' }).then(function(r){
        if(!r.isConfirmed) return;
        var nd=(document.getElementById('ctNewEnd')||{}).value||'';
        if(!nd){ Swal.fire('ใส่วันสิ้นสุดใหม่ก่อน','','warning'); return; }
        var note=(document.getElementById('ctExtNote')||{}).value||'';
        Swal.fire({title:'กำลังบันทึก...',allowOutsideClick:false,didOpen:function(){Swal.showLoading();}});
        google.script.run.withSuccessHandler(done).withFailureHandler(function(e){Swal.fire('Error',String(e),'error');}).extendButtons(campaignName, checked, nd, note);
      });
    }
  };

  // live: Net = Gross − ส่วนลด (เมื่อแก้ Gross หรือ ส่วนลด ในแถวเดียวกัน)
  window.ctRecalcNet = function(el){
    const tr = el.closest('tr'); if(!tr) return;
    const g = tr.querySelector('input[data-f="gross"]');
    const d = tr.querySelector('input[data-f="discount"]');
    const n = tr.querySelector('input[data-f="net"]');
    if(g&&d&&n){
      const gv = parseFloat(g.value)||0, dv = parseFloat(d.value)||0;
      n.value = (gv - dv).toFixed(2);
    }
    // อัปเดต "ราคารวมปกติ" (รวม qty×gross ต่อปุ่ม) แบบสด ๆ
    try { window.ctRecalcGroupTotal(tr.closest('tbody')); } catch(e){}
  };
  // รวม qty×gross ต่อปุ่ม (data-short) → เขียนลงเซลล์ "ราคารวมปกติ" ของแถวหัวปุ่ม
  window.ctRecalcGroupTotal = function(tbody){
    if(!tbody) return;
    var totals = {};
    var rows = [].slice.call(tbody.querySelectorAll('tr'));
    rows.forEach(function(tr){
      var codeI = tr.querySelector('input[data-f="itemCode"]'); if(!codeI) return;
      var sn = codeI.getAttribute('data-short')||'';
      var q = parseFloat((tr.querySelector('input[data-f="qty"]')||{}).value)||0;
      var g = parseFloat((tr.querySelector('input[data-f="gross"]')||{}).value)||0;
      if(totals[sn]==null) totals[sn]=0;
      totals[sn] += q*g;
    });
    var seen = {};
    rows.forEach(function(tr){
      var cell = tr.querySelector('td.text-success'); if(!cell) return;
      var codeI = tr.querySelector('input[data-f="itemCode"]');
      var sn = codeI ? (codeI.getAttribute('data-short')||'') : '';
      if(seen[sn]) return;   // เฉพาะแถวหัวปุ่ม (แถวแรกของกลุ่ม)
      seen[sn] = 1;
      cell.textContent = '฿'+Number(totals[sn]||0).toLocaleString();
    });
  };
  window.ctPickItem = function(btn){
    if(!window.PCItemCatePicker){ Swal.fire('','ตัวเลือกสินค้ายังไม่พร้อม','warning'); return; }
    var tr = btn.closest('tr'); if(!tr) return;
    var codeI = tr.querySelector('input[data-f="itemCode"]');
    var enI = tr.querySelector('input[data-f="itemNameEN"]');
    var thI = tr.querySelector('input[data-f="itemNameTH"]');
    var grossI = tr.querySelector('input[data-f="gross"]');
    // form key สำหรับ subset — อิงตาม promoType ของแคมเปญ (coupon/bill/voucher) · Price/Item Set → union ทั้ง 3 แบบ
    var _pt = String((tr.closest('tbody') && tr.closest('tbody').getAttribute('data-promotype')) || '').toLowerCase();
    var _sf = /coupon/.test(_pt) ? 'coupon' : (/bill/.test(_pt) ? 'bill' : (/voucher/.test(_pt) ? 'voucher' : ['coupon','bill','voucher']));
    window.PCItemCatePicker.open(function(it){
      if(codeI){ codeI.value=it.itemCode; codeI.dispatchEvent(new Event('input',{bubbles:true})); codeI.dispatchEvent(new Event('change',{bubbles:true})); }
      if(enI) enI.value = it.nameEN || it.nameTH || '';
      if(thI) thI.value = it.nameTH || it.nameEN || '';
      // ดึงราคาสินค้าตาม sale mode ของแถว (ช่องการขาย) → ช่อง Gross
      try{
        var sale = String((codeI&&codeI.getAttribute('data-sale'))||'').toLowerCase();
        var P = it.prices||{}; var pr='';
        if(/take\s*away|takeaway|\bta\b/.test(sale)) pr=P.TA;
        else if(/grab/.test(sale)) pr=P.GRAB;
        else if(/lineman/.test(sale)) pr=P.LINEMAN;
        else if(/shopee/.test(sale)) pr=P.SHOPEE;
        else if(/robinhood/.test(sale)) pr=P.ROBINHOOD;
        else if(/gokoo/.test(sale)) pr=P.GOKOO;
        else if(/panda/.test(sale)) pr=P.PANDA;
        if(pr===''||pr==null) pr = P.DLV;
        if(pr===''||pr==null) pr = (it.price!=null&&it.price!=='')?it.price:'';
        if(grossI && pr!==''&&pr!=null){ grossI.value=pr; grossI.dispatchEvent(new Event('input',{bubbles:true})); }
      }catch(e){}
    }, { title:'เลือกสินค้าเข้าคูปอง', subsetForm:_sf, allSubsets:true });
  };

  /* สร้างปุ่ม POS ใหม่ (shortName ใหม่) — ต่อแถวเปล่าเข้าตารางหลัก · Admin เท่านั้น · บันทึกผ่าน "บันทึกการแก้ไข" */
  window.ctNewButton = function(campaignName, rowIdx){
    var tb = document.getElementById('ctMainBody-'+rowIdx); if(!tb) return;
    var tok = '__new_'+Date.now()+'_'+Math.floor(Math.random()*10000);
    var camp = tb.getAttribute('data-camp')||campaignName||'';
    var sale = tb.getAttribute('data-sale')||'';
    var ptype = tb.getAttribute('data-promotype')||'';
    var ptypeShow = /item\s*set/i.test(String(ptype)) ? 'Price Promotion' : (ptype||'-');
    var esc = function(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); };
    var edStyle = 'background:#fffbe6;border:1px dashed #f0c85a;';
    var tr = document.createElement('tr');
    tr.setAttribute('data-newbtn','1');
    tr.innerHTML =
      '<td class="fw-bold text-dark" style="white-space:nowrap;background:#f3f6fb;font-size:.8rem">'+esc(ptypeShow)+'</td>'+
      '<td><div class="input-group input-group-sm"><input type="text" class="item-input row-edit" data-f="codePromotion" data-code="" data-item="'+tok+'" placeholder="Code Promo" style="'+edStyle+'"><button class="btn btn-outline-warning" type="button" title="ใช้เลขที่จองไว้ / ขอเลขจากตัวนับกลาง" onclick="window.ctPickCode(this)"><i class="fas fa-hashtag"></i></button></div></td>'+
      '<td><input type="text" class="item-input row-edit" data-f="itemPromotion" data-code="" data-item="'+tok+'" placeholder="Code Item Set" style="'+edStyle+'"></td>'+
      '<td><input type="text" class="item-input row-edit" data-f="kitchen" data-code="" data-item="'+tok+'" placeholder="Kitchen" style="'+edStyle+'"></td>'+
      '<td><input type="text" class="item-input row-edit ct-newsn" data-f="shortName" data-code="" data-item="'+tok+'" placeholder="ชื่อปุ่ม *" style="'+edStyle+'font-weight:bold;"></td>'+
      '<td><div class="input-group input-group-sm"><input type="text" class="item-input row-edit item-code-blue" data-f="itemCode" data-code="" data-item="'+tok+'" data-short="" data-camp="'+esc(camp)+'" data-sale="'+esc(sale)+'" placeholder="Item Code" style="'+edStyle+'">'+
        '<button class="btn btn-outline-primary" type="button" title="เลือกสินค้า (กรองหมวด)" onclick="window.ctPickItem(this)"><i class="fas fa-magnifying-glass"></i></button>'+
        '<button class="btn btn-outline-success" type="button" title="เพิ่มสินค้าในปุ่มนี้" onclick="window.ctAddItem(this)"><i class="fas fa-plus"></i></button>'+
        '<button class="btn btn-outline-danger" type="button" title="ลบแถวนี้" onclick="window.ctDeleteItem(this)"><i class="fas fa-trash"></i></button></div></td>'+
      '<td><input type="text" class="item-input row-edit" data-f="itemNameEN" data-code="" data-item="'+tok+'" style="text-align:left;'+edStyle+'"></td>'+
      '<td><input type="text" class="item-input row-edit" data-f="itemNameTH" data-code="" data-item="'+tok+'" style="text-align:left;'+edStyle+'"></td>'+
      '<td><input type="number" class="item-input row-edit" data-f="qty" data-code="" data-item="'+tok+'" value="1" style="'+edStyle+'"></td>'+
      '<td><input type="number" class="item-input row-edit price-edit" data-f="gross" data-code="" data-item="'+tok+'" value="" oninput="window.ctRecalcNet(this)" style="'+edStyle+'"></td>'+
      '<td class="fw-bold text-success align-middle" style="white-space:nowrap;background:#eef9f1"></td>'+
      '<td><input type="number" class="item-input row-edit price-edit text-danger-custom" data-f="discount" data-code="" data-item="'+tok+'" value="0" oninput="window.ctRecalcNet(this)" style="'+edStyle+'"></td>'+
      '<td><input type="number" class="item-input row-edit price-edit item-net-bold" data-f="net" data-code="" data-item="'+tok+'" value="0" style="'+edStyle+'font-weight:bold;"></td>'+
      '<td class="text-center"><span class="badge bg-primary">ปุ่มใหม่</span></td>';
    tb.appendChild(tr);
    var sn = tr.querySelector('.ct-newsn'); if(sn) sn.focus();
    // เชื่อม data-short ของช่อง itemCode ให้ตามชื่อปุ่มที่พิมพ์ (สำหรับ pick/add)
    if(sn){ sn.addEventListener('input', function(){ var ic=tr.querySelector('input[data-f="itemCode"]'); if(ic) ic.setAttribute('data-short', sn.value||''); }); }
    if(window.Swal) Swal.fire({ toast:true, position:'top-end', icon:'info', title:'เพิ่มแถวปุ่มใหม่ — กรอกชื่อปุ่ม+สินค้า แล้วกด “บันทึกการแก้ไข”', showConfirmButton:false, timer:3200 });
  };

  /* ใช้เลขโค้ดที่ "จองไว้" (RESERVED) จากตัวนับกลาง หรือ "ขอเลขใหม่" มาใส่ช่อง Code Promo ของปุ่มใหม่ */
  window.ctPickCode = function(btn){
    var tr = btn.closest('tr'); if(!tr) return;
    var input = tr.querySelector('input[data-f="codePromotion"]'); if(!input) return;
    var tb = tr.closest('tbody');
    var ptype = tb ? (tb.getAttribute('data-promotype')||'') : '';
    var camp  = tb ? (tb.getAttribute('data-camp')||'') : '';
    var t = String(ptype).toLowerCase();
    var ctype = /bill/.test(t) ? 'bill' : (/coupon/.test(t) ? 'coupon' : (/voucher/.test(t) ? 'voucher' : 'promo'));
    var C = (function(){ try{ if(window.top && window.top.PC_COUNTER) return window.top.PC_COUNTER; }catch(e){} return window.PC_COUNTER; })();
    if(!C || !C.list){ if(window.Swal) Swal.fire('ไม่พบระบบเลขโค้ดกลาง','โหลดหน้าใหม่แล้วลองอีกครั้ง','error'); return; }
    var TLBL = { promo:'Code Promotion (P)', bill:'Bill Discount (BD)', coupon:'Item Coupon (IC)', voucher:'Voucher (VC)' };
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var reserved = (C.list({})||[]).filter(function(e){ return e && e.status==='RESERVED'; });
    reserved.sort(function(a,b){ var am=a.type===ctype?0:1, bm=b.type===ctype?0:1; if(am!==bm) return am-bm; return String(b.at||'').localeCompare(String(a.at||'')); });
    var listHtml = reserved.length ? reserved.map(function(e){
      var mine = e.type===ctype;
      return '<button type="button" class="ctcode-pick" data-code="'+esc(e.code)+'" style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid '+(mine?'#f0c85a':'#e3e7eb')+';background:'+(mine?'#fffbe6':'#fff')+';border-radius:8px;padding:8px 11px;margin-bottom:6px;cursor:pointer">'+
        '<span style="font-family:JetBrains Mono,monospace;font-weight:800;color:#15623c">'+esc(e.code)+'</span>'+
        '<span style="font-size:12px;color:#8a9099">'+esc(TLBL[e.type]||e.type)+(e.where?(' · '+esc(e.where)):'')+'</span></button>';
    }).join('') : '<div style="color:#9aa5b1;text-align:center;padding:14px">— ยังไม่มีเลขที่จองไว้ —</div>';
    var next = C.peek ? C.peek(ctype) : '';
    Swal.fire({
      title:'ใช้เลขโค้ด — '+(TLBL[ctype]||ctype), width:520,
      html:'<div style="text-align:left;font-size:14px">'+
        '<div style="font-weight:700;margin-bottom:6px"><i class="fas fa-bookmark" style="color:#c9870a"></i> เลขที่จองไว้ (แตะเพื่อใช้)</div>'+
        '<div style="max-height:230px;overflow:auto">'+listHtml+'</div>'+
        '<div style="border-top:1px dashed #e3e7eb;margin:12px 0 10px"></div>'+
        '<div style="font-weight:700;margin-bottom:6px"><i class="fas fa-hashtag" style="color:#2980b9"></i> ขอเลขใหม่จากตัวนับกลาง</div>'+
        '<div style="display:flex;align-items:center;gap:10px"><span style="font-family:JetBrains Mono,monospace;font-weight:800;font-size:1.3rem;color:#2980b9">'+esc(next||'—')+'</span>'+
        '<span style="font-size:12px;color:#8a9099">'+esc(TLBL[ctype]||ctype)+' ถัดไป (จองแล้วเลขจะไม่ถูกใช้ซ้ำ)</span></div>'+
      '</div>',
      showCancelButton:true, cancelButtonText:'ปิด', confirmButtonText:'ขอเลขใหม่นี้', confirmButtonColor:'#2980b9',
      didOpen:function(){
        var pop = Swal.getPopup();
        [].slice.call(pop.querySelectorAll('.ctcode-pick')).forEach(function(b){
          b.addEventListener('click', function(){ input.value=this.getAttribute('data-code'); input.dispatchEvent(new Event('input',{bubbles:true})); Swal.close(); });
        });
      }
    }).then(function(res){
      if(!res.isConfirmed) return;
      var ent = C.reserve ? C.reserve(ctype, { where: camp || 'MKT Campaign Tracking', field: 'ปุ่มใหม่' }) : null;
      var code = (ent && ent.code) ? ent.code : next;
      if(code){ input.value=code; input.dispatchEvent(new Event('input',{bubbles:true})); Swal.fire({ icon:'success', title:'จองเลขแล้ว', html:'<b style="font-family:JetBrains Mono,monospace">'+esc(code)+'</b><div style="font-size:12px;color:#8a9099;margin-top:5px">ใส่ในช่อง Code Promo ให้แล้ว</div>', timer:2000, showConfirmButton:false }); }
    });
  };

  window.ctAddItem = function(btn){
    var tr = btn.closest('tr'); if(!tr) return;
    var clone = tr.cloneNode(true);
    var tok = '__new_'+Date.now()+'_'+Math.floor(Math.random()*10000);
    clone.querySelectorAll('[data-item]').forEach(function(el){ el.setAttribute('data-item', tok); });
    clone.querySelectorAll('input[data-f]').forEach(function(inp){
      var f = inp.getAttribute('data-f'); inp.readOnly=false; inp.classList.remove('ct-ro');
      if(['itemCode','itemNameEN','itemNameTH','gross'].indexOf(f)>=0) inp.value='';
      else if(f==='qty') inp.value='1';
      else if(['discount','net'].indexOf(f)>=0) inp.value='0';
      else if(['codePromotion','itemPromotion','kitchen','shortName'].indexOf(f)>=0) inp.value='';
    });
    var addB = clone.querySelector('button[onclick*="ctAddItem"]'); if(addB) addB.remove();
    if(clone.children[0]) clone.children[0].textContent='';
    var cs = clone.querySelector('td.text-success'); if(cs) cs.textContent='';
    tr.parentNode.insertBefore(clone, tr.nextSibling);
    var codeI = clone.querySelector('input[data-f="itemCode"]'); if(codeI) codeI.focus();
  };

  window.ctDeleteItem = function(btn){
    var tr = btn.closest('tr'); if(!tr) return;
    var codeI = tr.querySelector('input[data-f="itemCode"]');
    var isI = tr.querySelector('input[data-f="itemPromotion"]');
    var item = (codeI && codeI.value || '').trim();
    var di = (codeI && codeI.getAttribute('data-item')) || '';
    var short = (codeI && codeI.getAttribute('data-short')) || '';
    var camp = (codeI && codeI.getAttribute('data-camp')) || '';
    var codeP = (codeI && codeI.getAttribute('data-code')) || '';   // โค้ดโปรของแถว (sub-item เก็บใน data-code — ช่อง value ว่าง)
    var itemSet = (isI && isI.value || '').trim();
    if((!item && !codeP && !short) || di.indexOf('__new')===0){ tr.remove(); try{ window.ctRecalcGroupTotal(tr.closest('tbody')); }catch(e){} return; }   // แถวที่เพิ่งเพิ่มยังไม่ได้บันทึก → ลบออกจากตารางเฉย ๆ
    Swal.fire({title:'ลบรายการนี้?', html:'<b>'+(short||codeP||'-')+'</b><br>รหัส '+(item||'-')+'<br><span class="small text-muted">ลบเฉพาะแถวนี้ (ไม่กระทบรายการอื่น) · sync MKT / OP / หน้าสาขา / ตารางสินค้า</span>', icon:'warning', showCancelButton:true, confirmButtonColor:'#dc3545', confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก'}).then(function(r){
      if(!r.isConfirmed) return;
      Swal.fire({title:'กำลังลบ...', allowOutsideClick:false, didOpen:function(){Swal.showLoading();}});
      google.script.run.withSuccessHandler(function(res){
        if(res&&res.status==='success'){ Swal.fire('ลบแล้ว', res.message, 'success').then(function(){ window.loadTrackingData(); }); }
        else Swal.fire('ผิดพลาด',(res&&res.message)||'ไม่สำเร็จ','error');
      }).withFailureHandler(function(e){Swal.fire('Error',String(e),'error');}).deleteCampaignItem(camp, { shortName:short, codePromotion:codeP, itemCode:item, itemSet:itemSet });
    });
  };

  window.ctSaveName = function(oldName, rowIdx){
    var inp = document.getElementById('campName-'+rowIdx); if(!inp) return;
    var nv = (inp.value||'').trim();
    if(!nv){ Swal.fire('','กรุณาใส่ชื่อแคมเปญ','warning'); return; }
    if(nv===oldName){ Swal.fire('','ชื่อไม่เปลี่ยนแปลง','info'); return; }
    Swal.fire({title:'กำลังบันทึก...',allowOutsideClick:false,didOpen:function(){Swal.showLoading();}});
    google.script.run.withSuccessHandler(function(r){
      if(r&&r.status==='success'){ Swal.fire('สำเร็จ', r.message, 'success').then(function(){ window.loadTrackingData(); }); }
      else Swal.fire('ผิดพลาด',(r&&r.message)||'ไม่สำเร็จ','error');
    }).withFailureHandler(function(e){Swal.fire('Error',String(e),'error');}).renameCampaign(oldName, nv);
  };

  window.savePrices = function(campaignName, rowIdx){
    const container = document.getElementById(`expand-container-${rowIdx}`) || document;
    const inputs = [].slice.call((container.querySelectorAll ? container : document).querySelectorAll('.row-edit'));
    const map = {};
    inputs.forEach(el=>{
      const code = el.getAttribute('data-code')||'', item = el.getAttribute('data-item')||'', f = el.getAttribute('data-f');
      const k = code+'||'+item;
      map[k] = map[k] || { code:code, item:item };
      map[k][f] = el.value;
      var _sh = el.getAttribute('data-short'); if(_sh && !map[k]._short) map[k]._short = _sh;
    });
    const lines = Object.keys(map).map(k=>map[k]);
    if(!lines.length){ Swal.fire('ไม่มีรายการ', 'แคมเปญนี้ไม่มีช่องที่แก้ไขได้', 'info'); return; }
    Swal.fire({ title:'กำลังบันทึก...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
    google.script.run.withSuccessHandler(r=>{
      if(r&&r.status==='success'){ Swal.fire('สำเร็จ', r.message, 'success'); window.loadTrackingData(); }
      else Swal.fire('ผิดพลาด', (r&&r.message)||'ไม่สำเร็จ', 'error');
    }).withFailureHandler(e=>Swal.fire('Error', String(e), 'error')).updateCampaignPrices(campaignName, lines, ((document.getElementById('cateRemark-'+rowIdx)||{}).value));
  };
  window.showStorePopup = function(rowIdx) {
    let stores = currentStoreCache[rowIdx];
    let tableRows = '';
    if (Array.isArray(stores) && stores.length > 0) {
      tableRows = stores.map(s => `
          <tr>
            <td class="text-brand-green fw-bold" style="width: 80px;">${s.id || "-"}</td>
            <td class="text-start">${s.nameEn || "-"}</td>
            <td class="text-start">${s.nameTh || "-"}</td>
          </tr>`).join('');
    }
    Swal.fire({
      title: '<i class="fas fa-store me-2"></i>Participating Stores',
      html: `
        <div class="table-responsive" style="max-height:450px; overflow-y:auto; border-radius: 8px; border: 1px solid #dee2e6;">
          <table class="table table-sm table-bordered table-striped align-middle mb-0" style="font-size: 14px;">
            <thead class="table-dark" style="position: sticky; top: 0; z-index: 1;">
              <tr><th style="width: 100px;">ID</th><th>Name EN</th><th>Name TH</th></tr>
            </thead>
            <tbody class="text-start bg-white">${tableRows || '<tr><td colspan="3" class="text-center py-3">No store information available.</td></tr>'}</tbody>
          </table>
        </div>`,
      confirmButtonColor: '#1a1d20',
      width: '800px'
    });
  };

  window.showPromotionDetailPopup = function(arg, legacyDetail) {
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var htmlBody = '';
    var cache = (typeof arg === 'number' || /^\d+$/.test(String(arg))) ? (window.__ctDetailCache||{})[arg] : null;
    if (cache && cache.list && cache.list.length) {
      // per-button — show every button's COMPLETE detail + condition (verbatim, full text)
      htmlBody = cache.list.map(function(b){
        var d = b.detail ? esc(b.detail).replace(/\n/g,'<br>') : '<span class="text-muted">-</span>';
        var c = b.condition ? esc(b.condition).replace(/\n/g,'<br>') : '<span class="text-muted">-</span>';
        return '<div class="text-start p-3 border rounded mb-2 bg-light">'
          + '<div class="fw-bold text-success small mb-2"><i class="fas fa-hand-pointer me-1"></i>' + esc(b.sn) + '</div>'
          + '<div class="mb-2"><label class="fw-bold text-primary small"><i class="fas fa-clipboard-list me-1"></i> \u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e42\u0e1b\u0e23\u0e42\u0e21\u0e0a\u0e31\u0e48\u0e19:</label>'
          + '<div class="mt-1" style="white-space: pre-wrap; font-size: 13px; line-height:1.6;">' + d + '</div></div>'
          + '<div><label class="fw-bold text-warning small"><i class="fas fa-comment-alt me-1"></i> \u0e40\u0e07\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e02:</label>'
          + '<div class="mt-1" style="white-space: pre-wrap; font-size: 13px; line-height:1.6;">' + c + '</div></div>'
          + '</div>';
      }).join('');
    } else {
      // legacy fallback (campaign-level or direct strings)
      var det = cache ? esc(cache.campDetail).replace(/\n/g,'<br>') : (legacyDetail || arg || '-');
      var cond = cache ? esc(cache.campCond).replace(/\n/g,'<br>') : (legacyDetail != null ? arg : '-');
      htmlBody = '<div class="text-start p-3 border rounded mb-2 bg-light">'
        + '<label class="fw-bold text-primary small"><i class="fas fa-clipboard-list me-1"></i> \u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e42\u0e1b\u0e23\u0e42\u0e21\u0e0a\u0e31\u0e48\u0e19:</label>'
        + '<div class="mt-1" style="white-space: pre-wrap; font-size: 13px;">' + (det || '-') + '</div></div>'
        + '<div class="text-start p-3 border rounded bg-light">'
        + '<label class="fw-bold text-warning small"><i class="fas fa-comment-alt me-1"></i> \u0e40\u0e07\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e02:</label>'
        + '<div class="mt-1" style="white-space: pre-wrap; font-size: 13px;">' + (cond || '-') + '</div></div>';
    }
    Swal.fire({
      title: '<i class="fas fa-info-circle me-2"></i>Promotion Detail & Condition',
      html: '<div style="max-height:65vh;overflow:auto;">' + htmlBody + '</div>',
      confirmButtonColor: '#1a1d20',
      width: '640px'
    });
  };

  window.saveInline = async function(rowIdx) {
    const camp = allCampaigns.find(x => x.rowIdx === rowIdx);
    const fileInput = document.getElementById(`memoFile-${rowIdx}`);
    const viewBtn = document.getElementById(`viewMemoBtn-${rowIdx}`);
    const hasExistingFile = viewBtn !== null;
    let isOverwrite = false;
    if (!fileInput) return;
    if (hasExistingFile && fileInput.files.length > 0) {
      const confirm = await Swal.fire({
        title: 'ต้องการแก้ไข Memo หรือไม่?',
        text: "ตรวจพบไฟล์เดิมอยู่แล้ว คุณต้องการอัปโหลดไฟล์ใหม่ทับใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, บันทึกใหม่',
        cancelButtonText: 'ยกเลิก'
      });
      if (!confirm.isConfirmed) return;
      isOverwrite = true;
    }
    Swal.fire({ html: '<div class="d-flex align-items-center justify-content-center gap-2"><div class="spinner-border spinner-border-sm text-success"></div><span style="font-size:14px;">Saving...</span></div>', showConfirmButton: false, allowOutsideClick: false, width: '180px' });
    const data = { rowIdx: rowIdx, campaign: camp.campaign, status: camp.itStatus, isOverwrite: isOverwrite };
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64Data = e.target.result.split(',')[1];
        const fileData = { base64: base64Data, mimeType: file.type, fileName: `MEMO_${camp.campaign.replace(/[^a-z0-9ก-๙]/gi, '_')}.pdf` };
        google.script.run.withSuccessHandler(saveSuccess).withFailureHandler(saveError).processEditWithFile(data, fileData);
      };
      reader.readAsDataURL(file);
    } else {
      google.script.run.withSuccessHandler(saveSuccess).withFailureHandler(saveError).processEditWithFile(data, null);
    }
  };

  function saveSuccess(res) {
    if (res && res.status === "success") {
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', confirmButtonColor: '#198754' }).then(() => {
        expandedRowIdx = null; window.loadTrackingData();
      });
    } else {
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: res.message, confirmButtonColor: '#dc3545' });
    }
  }

  function saveError(err) { Swal.fire({ icon: 'error', title: 'System Error', text: err }); }

  // map promoType ออนไลน์ → kind ของหน้าจัดการโค้ด (สำหรับ prefill เมื่อต้องเพิ่มโค้ดหลังขยาย)
  window.extKindFromType = function(pt){
    pt = String(pt||'').toLowerCase();
    if(/bill/.test(pt))    return { kind:'Bill discount online', cat:'promo' };
    if(/voucher/.test(pt)) return { kind:'Voucher online',       cat:'voucher' };
    if(/coupon/.test(pt))  return { kind:'Item coupon online',   cat:'promo' };
    return null;
  };
  /* กู้การขยายที่ค้าง: ถ้าเคยเลือก "ขยาย + เพิ่มโค้ด" แล้วปิดหน้า/รีเฟรชไปก่อนแนบโค้ด
     เดิมค้างเงียบ ไม่มีอะไรเกิด (งานไม่เด้งเข้าหน้า IT) → ถามให้ชัดว่าจะขยายเลยไหม */
  window.ctResumePendingExtend = function () {
    var p = null; try { p = JSON.parse(localStorage.getItem('pc_pending_extend') || 'null'); } catch (e) {}
    if (!p || !p.campaign) return;
    Swal.fire({
      icon: 'warning', title: 'มีการขยายเวลาค้างอยู่',
      html: '<div class="text-start"><b>' + String(p.campaign).replace(/</g,'&lt;') + '</b>' +
        '<div class="small text-muted mt-1">คุณเลือก “ขยาย + เพิ่มโค้ด” ถึงวันที่ <b>' + String(p.newEnd || '-') + '</b> แต่ยังไม่ได้แนบโค้ด — การขยายจึงยังไม่ถูกบันทึกและยังไม่เข้าคิว IT</div></div>',
      showDenyButton: true, showCancelButton: true,
      confirmButtonText: 'ขยายเลย (ไม่เพิ่มโค้ด)', confirmButtonColor: '#2e934a',
      denyButtonText: 'ไปแนบโค้ด', denyButtonColor: '#0d6efd',
      cancelButtonText: 'ยกเลิกการขยาย'
    }).then(function (r) {
      if (r.isConfirmed) {
        try { localStorage.removeItem('pc_pending_extend'); } catch (e) {}
        google.script.run.withSuccessHandler(function (res) {
          Swal.fire('สำเร็จ', (res && res.message) || 'ขยายเวลาแล้ว', 'success');
          window.loadTrackingData();
        }).extendCampaign(p.campaign, p.newEnd, (p.note || '') + ' (ยังไม่ได้แนบโค้ดใหม่)');
      } else if (r.isDenied) {
        if (typeof window.loadPage === 'function') window.loadPage('CodeMgmt', document.getElementById('nav-CodeMgmt'));
      } else {
        try { localStorage.removeItem('pc_pending_extend'); localStorage.removeItem('pc_card_addcode'); } catch (e) {}
      }
    });
  };

  window.extendCampaignPopup = function(campaignName, currentEnd, startDateStr, promoType, codePromo) {
    const todayStr = new Date().toISOString().split('T')[0];
    // เฉพาะโปรออนไลน์ (โค้ดอยู่ในระบบ Code Management) → ถามว่าต้องเพิ่มโค้ดใหม่ในระบบหลังขยายไหม
    const isOnline = /online/i.test(String(promoType||''));
    const onlineKind = window.extKindFromType(promoType);
    const onlineExtras = (isOnline && onlineKind) ? `
          <hr>
          <label class="d-flex align-items-start gap-2 mb-2" style="cursor:pointer;font-size:13px;line-height:1.4">
            <input type="checkbox" id="extOldCode" class="mt-1">
            <span><b>โค้ดเดิมในระบบ ต้องขยายวันหมดอายุด้วยหรือไม่?</b><br>
            <span class="text-muted" style="font-size:11px">ถ้าติ๊ก ระบบจะแนบ "Noted" ให้ IT ขยายวันหมดอายุของโค้ดที่มีอยู่เดิมในระบบ</span></span>
          </label>
          <label class="d-flex align-items-start gap-2" style="cursor:pointer;font-size:13px;line-height:1.4">
            <input type="checkbox" id="extAddCode" class="mt-1">
            <span><b>หลังขยาย ต้องเพิ่มโค้ดใหม่ในระบบหรือไม่?</b><br>
            <span class="text-muted" style="font-size:11px">ถ้าติ๊ก ระบบจะพาไปหน้า "แจ้งเพิ่มโค้ด" — <b>การขยายจะสมบูรณ์เมื่อแนบโค้ดเสร็จ</b> (กันลืมแนบโค้ด)</span></span>
          </label>` : '';
    Swal.fire({
      title: 'ปรับปรุงระยะเวลาแคมเปญ',
      html: `
        <div class="text-start">
          <p class="mb-1"><b>แคมเปญ:</b> ${campaignName}</p>
          <label class="small fw-bold">วันเริ่มต้น: ${startDateStr}</label><br>
          <label class="small fw-bold text-primary">สิ้นสุดปัจจุบัน: ${currentEnd}</label>
          <hr>
          <label class="small fw-bold">ระบุวันที่สิ้นสุดใหม่:</label>
          <input type="date" id="newEndDate" class="form-control mt-2" min="${todayStr}">
          <p class="mt-2 text-muted" style="font-size: 11px;">*จะส่งเมลแจ้ง MKT อัตโนมัติ (ขยายเวลา/ลดเวลา)</p>
          ${onlineExtras}
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันและส่งเมล',
      confirmButtonColor: '#2e934a',
      preConfirm: () => {
        const dateVal = document.getElementById('newEndDate').value;
        if (!dateVal) return Swal.showValidationMessage('กรุณาเลือกวันที่');
        const addCode = !!(document.getElementById('extAddCode') && document.getElementById('extAddCode').checked);
        const oldExtend = !!(document.getElementById('extOldCode') && document.getElementById('extOldCode').checked);
        return { date: dateVal, addCode: addCode, oldExtend: oldExtend };
      }
    }).then((result) => {
      if (!result.isConfirmed) return;
      const newEnd = result.value.date;
      const wantAddCode = result.value.addCode;
      const note = result.value.oldExtend ? ('\uD83D\uDCCC โค้ดเดิมในระบบ: ขยายวันหมดอายุถึง ' + newEnd + ' ด้วย') : '';
      if (wantAddCode && onlineKind) {
        // ATOMIC: ยังไม่ commit ขยาย — เก็บ pending แล้วไปหน้าเพิ่มโค้ด · ขยายจะสำเร็จเมื่อแนบโค้ดเสร็จ (กันลืมแนบ)
        try {
          localStorage.setItem('pc_pending_extend', JSON.stringify({ campaign: campaignName, newEnd: newEnd, note: note, kind: onlineKind.kind, cat: onlineKind.cat, codePromo: codePromo || '' }));
          localStorage.setItem('pc_card_addcode', JSON.stringify({ name: campaignName, kind: onlineKind.kind, cat: onlineKind.cat, prefix: codePromo || '', end: newEnd, _fromExtend: true, _pendingExtend: true }));
        } catch(e) {}
        Swal.fire({
          icon: 'info', title: 'ไปแนบโค้ดก่อน',
          html: 'การขยายจะ <b>สมบูรณ์เมื่อแนบโค้ดเสร็จ</b> (กันลืมแนบโค้ด)<br><span class="text-muted" style="font-size:12px">กำลังพาไปหน้า “แจ้งเพิ่มโค้ด”…</span>',
          timer: 1800, showConfirmButton: false
        }).then(() => { if (typeof window.loadPage === 'function') window.loadPage('CodeMgmt', document.getElementById('nav-CodeMgmt')); });
        return;
      }
      // ขยายทันที (ไม่เพิ่มโค้ด) — แนบ Noted ถ้าติ๊กขยายโค้ดเดิม
      Swal.fire({ title: 'กำลังดำเนินการและส่ง Email...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      google.script.run.withSuccessHandler(res => {
        if (res.status === "success") { Swal.fire('สำเร็จ', res.message, 'success'); window.loadTrackingData(); }
        else Swal.fire('ผิดพลาด', res.message, 'error');
      }).extendCampaign(campaignName, newEnd, note);
    });
  };

  window.cancelCampaignPopup = function(campaignName) {
    Swal.fire({
      title: 'ยืนยันการยกเลิกแคมเปญ?',
      html: `<p class="text-start mb-0"><b>แคมเปญ:</b> ${campaignName}</p>`,
      input: 'textarea',
      inputPlaceholder: 'ระบุเหตุผลการยกเลิก...',
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'ยืนยันยกเลิกและส่งเมล',
      preConfirm: (val) => { if(!val) return Swal.showValidationMessage('กรุณาระบุเหตุผล'); return val; }
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการและส่ง Email...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        google.script.run.withSuccessHandler(res => {
          if(res.status === "success") {
            Swal.fire('สำเร็จ', res.message, 'success');
            window.loadTrackingData();
          } else {
            Swal.fire('ผิดพลาด', res.message, 'error');
          }
        }).cancelCampaign(campaignName, result.value);
      }
    });
  };

  window.fillGrossFromMaster = function(){
    Swal.fire({ icon:'question', title:'เติม Gross จาก Item master?', html:'ระบบจะดึง <b>ราคาเต็มรายช่องทาง</b> จากชีท Item master มาเติมช่อง Gross<br>ให้แคมเปญ <b>Type Price Promotion</b> ที่ยังไม่มีราคา (ของที่กรอกเองไว้แล้วจะไม่ถูกทับ)',
      showCancelButton:true, confirmButtonText:'เติมเลย', cancelButtonText:'ยกเลิก', confirmButtonColor:'#1a1d20' }).then(res=>{
      if(!res.isConfirmed) return;
      Swal.fire({ title:'กำลังเติมราคา...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
      google.script.run.withSuccessHandler(r=>{
        if(r&&r.status==='success'){ Swal.fire('สำเร็จ', r.message, 'success'); window.loadTrackingData(); }
        else Swal.fire('ผิดพลาด', (r&&r.message)||'ไม่สำเร็จ', 'error');
      }).withFailureHandler(e=>Swal.fire('Error', String(e), 'error')).fillPricePromoGross(true);
    });
  };
  window.groupSelectedCampaigns = function(){
    const names = [...new Set([...document.querySelectorAll('.row-checkbox:checked')].map(c => c.getAttribute('data-campaign')).filter(Boolean))];
    if(names.length < 1){ Swal.fire('ยังไม่ได้เลือก', 'ติ๊กแคมเปญที่ต้องการจัดกลุ่มก่อน (เลือกได้หลายแคมเปญ)', 'info'); return; }
    // ตัวเลือกชื่อปลายทาง: แคมเปญที่เลือก + แคมเปญทั้งหมดในระบบ
    const allCamps = [...new Set((typeof allCampaigns !== 'undefined' ? allCampaigns : []).map(d => d.campaign).filter(Boolean))].sort();
    const opts = [...new Set(names.concat(allCamps))];
    const dl = opts.map(n => '<option value="'+String(n).replace(/"/g,'&quot;')+'">').join('');
    Swal.fire({
      title:'จัดกลุ่มเข้าแคมเปญ',
      html:'<div style="text-align:left;font-size:14px">ย้าย <b>'+names.length+'</b> แคมเปญที่เลือกไปรวมใต้ชื่อเดียว:<div style="max-height:120px;overflow:auto;background:#f8f9fa;border-radius:8px;padding:6px 10px;margin:6px 0;font-size:13px">'+names.map(n=>'• '+String(n).replace(/</g,'&lt;')).join('<br>')+'</div><label style="font-weight:600;display:block;margin-top:6px">ชื่อแคมเปญปลายทาง</label></div><input id="grpTarget" class="swal2-input" list="grpList" placeholder="พิมพ์หรือเลือกชื่อเดิม" value="'+String(names[0]).replace(/"/g,'&quot;')+'" style="margin-top:4px"><datalist id="grpList">'+dl+'</datalist>',
      showCancelButton:true, confirmButtonText:'จัดกลุ่ม', cancelButtonText:'ยกเลิก', confirmButtonColor:'#198754',
      preConfirm:()=>{ const v=(document.getElementById('grpTarget').value||'').trim(); if(!v){ Swal.showValidationMessage('กรุณาใส่ชื่อแคมเปญปลายทาง'); return false; } return v; }
    }).then(res=>{ if(!res.isConfirmed) return;
      Swal.fire({ title:'กำลังจัดกลุ่ม...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
      google.script.run.withSuccessHandler(r=>{
        if(r&&r.status==='success'){ Swal.fire('สำเร็จ', r.message, 'success'); window.loadTrackingData(); }
        else Swal.fire('ผิดพลาด', (r&&r.message)||'ไม่สำเร็จ', 'error');
      }).withFailureHandler(e=>Swal.fire('Error', String(e), 'error')).groupCampaigns(names, res.value);
    });
  };
  window.deleteSelectedCampaigns = function(){
    const names = [...document.querySelectorAll('.row-checkbox:checked')].map(c => c.getAttribute('data-campaign')).filter(Boolean);
    const uniq = [...new Set(names)];
    if(!uniq.length){ Swal.fire('ยังไม่ได้เลือก', 'ติ๊กแถวที่ต้องการลบก่อน', 'info'); return; }
    // หาโค้ดที่จองผูกกับแคมเปญที่เลือก (RESERVED/CONFIRMED) — จับคู่ด้วยชื่อแคมเปญ (where)
    var _PC = window.PC_COUNTER, _ents = [];
    try {
      if(_PC && _PC.list){
        var _sel = {}; uniq.forEach(function(n){ _sel[String(n||'').trim()] = 1; });
        _ents = _PC.list({}).filter(function(e){
          return _sel[String(e.where||'').trim()] && (e.status==='RESERVED' || e.status==='CONFIRMED');
        });
      }
    } catch(e){}

    var _doDelete = function(){
      Swal.fire({ title:'กำลังลบ...', allowOutsideClick:false, didOpen:()=>Swal.showLoading() });
      google.script.run.withSuccessHandler(r=>{ Swal.fire({icon:'success', title:'ย้ายเข้าถังขยะแล้ว 🗑️', html:((r&&r.message)||'ย้ายแล้ว')+'<div class="text-muted small" style="margin-top:8px">กู้คืนได้ที่ปุ่ม <b>ถังขยะ</b> (เก็บ 60 วัน)</div>', confirmButtonColor:'#2e934a'}); window.loadTrackingData(); }).withFailureHandler(e=>Swal.fire('Error', String(e), 'error')).deleteCampaigns(uniq);
    };
    var _SRC = 'Promotions Tracking (ลบหลายแคมเปญ)';
    var _returnCodes = function(){
      var ok=0, burned=0;
      _ents.forEach(function(en){
        try{
          if(en.status==='RESERVED' && typeof _PC.returnCode==='function'){ if(_PC.returnCode(en.code, en.type, _SRC)) ok++; }
          else if(typeof _PC.release==='function'){ if(_PC.release(en.code, en.type, _SRC)) burned++; }
        }catch(e){}
      });
      return { ok:ok, burned:burned };
    };
    var _keepCodes = function(){
      if(!_PC || typeof _PC.note!=='function') return;
      _ents.forEach(function(en){
        try{ _PC.note({ act:'KEEP', type:en.type, code:en.code, where:en.where, from:_SRC }); }catch(e){}
      });
    };

    var _listHtml = '<div style="text-align:left;max-height:170px;overflow:auto;font-size:13px;margin-top:8px;background:#f8f9fa;border-radius:8px;padding:8px 12px">'+uniq.map(n=>'• '+(n||'').replace(/</g,'&lt;')).join('<br>')+'</div>';

    if(_ents.length){
      var _nRes = _ents.filter(e=>e.status==='RESERVED').length;
      var _nCon = _ents.filter(e=>e.status==='CONFIRMED').length;
      var _codeHtml = '<div style="text-align:left;max-height:150px;overflow:auto;font-size:12px;margin-top:8px;background:#fff8e6;border:1px solid #f3d98b;border-radius:8px;padding:8px 12px">'+_ents.map(function(e){ return '<b>'+(e.code||'')+'</b> <span class="badge bg-secondary">'+e.status+'</span> <span class="text-muted">'+(e.where||'').replace(/</g,'&lt;')+'</span>'; }).join('<br>')+'</div>';
      Swal.fire({
        icon:'question',
        title:'ย้าย '+uniq.length+' แคมเปญเข้าถังขยะ — คืนโค้ดกลับคลังไหม?',
        html: _listHtml + '<div style="text-align:left;font-size:13px;margin-top:10px"><b>โค้ดที่จองผูกอยู่ '+_ents.length+' รายการ</b> ('+_nRes+' RESERVED · '+_nCon+' CONFIRMED)</div>' + _codeHtml + '<div class="text-muted small" style="text-align:left;margin-top:6px">RESERVED → คืนเข้าคลังใช้ใหม่ได้ · CONFIRMED → คืนแบบเผาเลข (release)</div>',
        showDenyButton:true, showCancelButton:true,
        confirmButtonText:'คืนโค้ด + เข้าถังขยะ', confirmButtonColor:'#2e934a',
        denyButtonText:'เข้าถังขยะเฉยๆ (ไม่คืนโค้ด)', cancelButtonText:'ยกเลิก'
      }).then(function(r){
        if(r.isDismissed && !r.isDenied && !r.isConfirmed) return;
        if(r.isConfirmed){
          var s = _returnCodes();
          var msg = []; if(s.ok) msg.push('คืนเข้าคลัง '+s.ok); if(s.burned) msg.push('เผาเลข '+s.burned);
          if(msg.length) Swal.fire({ icon:'success', title:'คืนโค้ดแล้ว', text:msg.join(' · '), timer:1300, showConfirmButton:false });
        } else if(r.isDenied){
          _keepCodes(); // เก็บโค้ดไว้ แต่บันทึกกิจกรรมว่าลบงานจากหน้านี้
        }
        _doDelete();
      });
      return;
    }

    Swal.fire({ icon:'warning', title:'ย้ายแคมเปญที่เลือกเข้าถังขยะ?', html:'จะย้าย <b>'+uniq.length+'</b> แคมเปญออกจากตาราง (ทุกปุ่ม/ทุกเดือน):<br>'+_listHtml+'<div class="text-muted small" style="text-align:left;margin-top:6px"><i class="fas fa-trash-can-arrow-up me-1"></i>กู้คืนได้ที่ปุ่มถังขยะ (เก็บ 60 วัน) · ไม่มีโค้ดที่จองผูกกับแคมเปญเหล่านี้</div>', showCancelButton:true, confirmButtonText:'ย้ายเข้าถังขยะ', cancelButtonText:'ยกเลิก', confirmButtonColor:'#dc3545' }).then(res=>{
      if(!res.isConfirmed) return;
      _doDelete();
    });
  };
  window.updateRowsPerPage = (v) => { rowsPerPage = parseInt(v); window.resetPageAndRender(); };
  /* ===== ถังขยะแคมเปญ (soft-delete) — ดู / กู้คืน / ล้างถาวร ===== */
  window.ctOpenTrash = function(){
    google.script.run.withSuccessHandler(function(list){
      list = list || [];
      var body = list.length ? list.map(function(t){
        var when = (t.deletedAt||'').replace('T',' ').slice(0,16);
        var camps = (t.campaigns||[]).map(function(n){return String(n).replace(/</g,'&lt;');}).join(', ');
        var codes = (t.codes||[]).length ? ('<div class="text-muted" style="font-size:11px;margin-top:2px">โค้ด: '+t.codes.slice(0,8).join(', ')+((t.codes.length>8)?' …':'')+'</div>') : '';
        return '<div style="text-align:left;border:1px solid #e5e8ec;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff">'
          +'<div class="fw-bold" style="font-size:13px">'+camps+'</div>'
          +'<div class="text-muted" style="font-size:11px">ลบเมื่อ '+when+(t.deletedBy?(' · โดย '+String(t.deletedBy).replace(/</g,'&lt;')):'')+' · '+(t.rowCount||0)+' แถว</div>'+codes
          +'<div style="margin-top:8px;display:flex;gap:8px">'
          +'<button class="btn btn-sm btn-success" onclick="window.ctRestoreTrash(\''+t.id+'\')"><i class="fas fa-trash-can-arrow-up me-1"></i>กู้คืน</button>'
          +'<button class="btn btn-sm btn-outline-danger" onclick="window.ctPurgeTrash(\''+t.id+'\')"><i class="fas fa-xmark me-1"></i>ล้างถาวร</button>'
          +'</div></div>';
      }).join('') : '<div class="text-muted" style="padding:24px 0">ถังขยะว่าง — ยังไม่มีแคมเปญที่ถูกลบ</div>';
      Swal.fire({ title:'<i class="fas fa-trash-can me-2"></i>ถังขยะแคมเปญ', html:'<div style="max-height:60vh;overflow:auto">'+body+'</div><div class="text-muted small" style="margin-top:6px">เก็บ 60 วัน · กู้คืนได้กลับเข้าตารางพร้อมข้อมูลผูกพัน</div>', width:'640px', confirmButtonText:'ปิด', confirmButtonColor:'#6c757d' });
    }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).listTrash();
  };
  window.ctRestoreTrash = function(id){
    Swal.fire({ title:'กู้คืนแคมเปญนี้?', icon:'question', showCancelButton:true, confirmButtonText:'กู้คืน', cancelButtonText:'ยกเลิก', confirmButtonColor:'#2e934a' }).then(function(r){
      if(!r.isConfirmed) return;
      Swal.fire({ title:'กำลังกู้คืน...', allowOutsideClick:false, didOpen:function(){Swal.showLoading();} });
      google.script.run.withSuccessHandler(function(res){ Swal.fire({icon:'success', title:'กู้คืนแล้ว', text:(res&&res.message)||'', confirmButtonColor:'#2e934a'}); window.loadTrackingData(); }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).restoreTrash(id);
    });
  };
  window.ctPurgeTrash = function(id){
    Swal.fire({ icon:'warning', title:'ล้างถาวร?', text:'ลบออกจากถังขยะถาวร — กู้คืนไม่ได้อีก', showCancelButton:true, confirmButtonText:'ล้างถาวร', cancelButtonText:'ยกเลิก', confirmButtonColor:'#dc3545' }).then(function(r){
      if(!r.isConfirmed) return;
      google.script.run.withSuccessHandler(function(){ window.ctOpenTrash(); }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).purgeTrash(id);
    });
  };
  window.renameCampaignPopup = function(oldName){
    Swal.fire({ title:'เปลี่ยนชื่อแคมเปญ', input:'text', inputValue:oldName, inputLabel:'ชื่อแคมเปญใหม่', inputPlaceholder:'เช่น Grab-Combo',
      showCancelButton:true, confirmButtonText:'บันทึก', cancelButtonText:'ยกเลิก', confirmButtonColor:'#198754',
      inputValidator:(v)=>(!v||!v.trim())?'กรุณาใส่ชื่อ':undefined
    }).then(res=>{ if(!res.isConfirmed) return;
      Swal.fire({title:'กำลังบันทึก...', allowOutsideClick:false, didOpen:()=>Swal.showLoading()});
      google.script.run.withSuccessHandler(r=>{
        if(r&&r.status==='success'){ Swal.fire('สำเร็จ', r.message, 'success'); window.loadTrackingData(); }
        else Swal.fire('ผิดพลาด', (r&&r.message)||'ไม่สำเร็จ', 'error');
      }).withFailureHandler(e=>Swal.fire('Error', String(e), 'error')).renameCampaign(oldName, res.value.trim());
    });
  };
  window.resetPageAndRender = () => { currentPage = 1; window.renderTracking(); };
  
  window.changePage = (p, totalPages) => { 
    if(p >= 1 && p <= totalPages) { 
      currentPage = p; 
      window.renderTracking(); 
    } 
  };

  window.toggleExpand = function(rowIdx) {
    const tbody = document.getElementById('trackingTableBody');
    if (!tbody) return;
    const wasOpen = String(expandedRowIdx) === String(rowIdx);
    // collapse any open detail row + reset all edit icons
    const openDetail = tbody.querySelector('tr.expand-detail-row');
    if (openDetail) openDetail.remove();
    tbody.querySelectorAll('.btn-edit-mode i').forEach(i => { i.className = 'fas fa-eye'; });
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('expand-row', 'fw-bold'));
    if (wasOpen) { expandedRowIdx = null; window.ctSetFocus(false); return; }
    // locate the row whose edit button targets this rowIdx
    const btn = [...tbody.querySelectorAll('.btn-edit-mode')]
      .find(b => (b.getAttribute('onclick') || '').replace(/\s/g, '').includes('toggleExpand(' + rowIdx + ')'));
    if (!btn) { expandedRowIdx = null; window.ctSetFocus(false); return; }
    const tr = btn.closest('tr');
    expandedRowIdx = rowIdx;
    btn.querySelector('i').className = 'fas fa-times text-danger';
    tr.classList.add('expand-row', 'fw-bold');
    const exp = document.createElement('tr');
    exp.className = 'expand-detail-row expand-row';
    exp.innerHTML = `<td colspan="10" class="expand-content-cell"><div class="item-table-wrapper" id="expand-container-${rowIdx}"><div class="text-center py-4"><div class="spinner-border spinner-border-sm text-warning" role="status"></div></div></div></td>`;
    tr.after(exp);
    window.fetchItemsToRow(rowIdx);
    // enter full-screen promo view: collapse banner/tabs/summary and bring the row to the top
    window.ctSetFocus(true);
    const scroller = document.querySelector('.ct-scope .table-responsive-scroll');
    if (scroller) { requestAnimationFrame(() => { const head = scroller.querySelector('thead'); const off = head ? head.offsetHeight : 0; scroller.scrollTop = Math.max(0, tr.offsetTop - off); }); }
  };

  window.ctSetFocus = function(on) {
    const scope = document.querySelector('.ct-scope');
    if (scope) scope.classList.toggle('ct-focus', !!on);
  };

  window.ctExitFocus = function() {
    if (expandedRowIdx != null) window.toggleExpand(expandedRowIdx);
    else window.ctSetFocus(false);
  };
  
  window.showRejectReason = function(reason) {
    try { reason = decodeURIComponent(reason); } catch (e) {}
    const safe = String(reason || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    Swal.fire({ icon: 'warning', title: 'OP ตีกลับงานนี้', html: `<div class="text-start p-3 border rounded bg-light" style="white-space:pre-wrap;font-size:13px;"><b class="text-danger d-block mb-2">เหตุผล / สิ่งที่ต้องแก้ไข:</b>${safe}</div>`, width: '520px', confirmButtonColor: '#dc3545', confirmButtonText: 'รับทราบ' });
  };


  /* ---- ปฏิทินกรองเดือน: โปรที่ช่วงเวลาคาบเกี่ยวเดือนที่เลือก ---- */
  function pcMonthOverlap(monthVal, startStr, endStr) {
    if (!monthVal) return true;
    var p = String(monthVal).split('-'); if (p.length < 2) return true;
    var y = +p[0], mo = +p[1] - 1;
    var mS = new Date(y, mo, 1).getTime(), mE = new Date(y, mo + 1, 0, 23, 59, 59).getTime();
    var pd = function (s) { var mm = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); if (mm) return new Date(+mm[3], +mm[2] - 1, +mm[1]).getTime(); var t = Date.parse(s); return isNaN(t) ? 0 : t; };
    var st = pd(startStr), en = pd(endStr);
    if (!st && !en) return false;
    if (!en) return st <= mE;
    if (!st) return en >= mS;
    return st <= mE && en >= mS;
  }
  window.clearFilters = function() {
    ['searchTerm', 'monthPicker', 'monthOnlyPicker'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    if(document.getElementById('dateMode')) document.getElementById('dateMode').value = 'ACTIVE';
    ['f_name','f_type','f_start','f_end','f_mode','f_it','f_op','f_reporter'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    window.resetPageAndRender();
  };

  window.populateFilters = function(data) {
    const fields = { f_type:'promoType', f_start:'startDate', f_end:'endDate', f_mode:'channel', f_it:'itStatus', f_op:'opStatus' };
    Object.keys(fields).forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const uniqueVals = [...new Set(data.map(item => item[fields[id]] || '-'))].sort();
      select.innerHTML = '<option value="">ALL</option>' + uniqueVals.map(v => `<option value="${v}">${v}</option>`).join('');
    });
  };

  window.updatePaginationControls = function(total, pages) {
    const start = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, total);
    if(document.getElementById('paginationInfo')) document.getElementById('paginationInfo').innerText = `Showing ${start} to ${end} of ${total} entries`;
    
    let html = `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                  <a class="page-link" href="#" onclick="window.changePage(${currentPage - 1}, ${pages}); return false;">Prev</a>
                </li>`;
    
    for (let i = 1; i <= pages; i++) { 
      if (i===1 || i===pages || (i>=currentPage-1 && i<=currentPage+1)) { 
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                   <a class="page-link" href="#" onclick="window.changePage(${i}, ${pages}); return false;">${i}</a>
                 </li>`; 
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += `<li class="page-item disabled"><a class="page-link">...</a></li>`;
      }
    }
    
    html += `<li class="page-item ${currentPage === pages || pages === 0 ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="window.changePage(${currentPage + 1}, ${pages}); return false;">Next</a>
             </li>`;
    
    if(document.getElementById('paginationControls')) document.getElementById('paginationControls').innerHTML = html;
  };

  window.renderSummary = function(c) {
    const summaryRow = document.getElementById('summaryRow');
    if(!summaryRow) return;
    const items = [ 
      { t: 'TOTAL CAMPAIGNS', v: c.all, c: 'bg-dark text-white', i: 'fa-layer-group' }, 
      { t: 'PENDING / UPDATED', v: c.pending, c: 'bg-warning text-dark', i: 'fa-clock' }, 
      { t: 'COMPLETED', v: c.complete, c: 'bg-success text-white', i: 'fa-check-double' } 
    ];
    summaryRow.innerHTML = items.map(item => `
      <div class="col-md-4 mb-3">
        <div class="card shadow-sm border-0 ${item.c}">
          <div class="card-body p-3 d-flex justify-content-between align-items-center">
            <div>
              <small class="fw-bold opacity-75 d-block text-uppercase" style="font-size: 0.7rem;">${item.t}</small>
              <h3 class="fw-bold m-0">${item.v}</h3>
            </div>
            <i class="fas ${item.i} fa-2x opacity-25"></i>
          </div>
        </div>
      </div>`).join('');
  };

  /* self-init: 73KB external file may finish loading after the shell 300ms init call, so trigger init here (deduped to avoid double-run). */
  window.initCampaign_Tracking = (function(orig){ return function(){ var now=Date.now(); if(window.__ctLastInit && (now-window.__ctLastInit)<1500) return; window.__ctLastInit=now; return orig.apply(this, arguments); }; })(window.initCampaign_Tracking);
  try{ window.initCampaign_Tracking(); }catch(e){ console.error("[ct self-init]", e); }

})();
