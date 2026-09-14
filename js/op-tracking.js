/* Op_Tracking — externalized from inline <script> to dodge editor Babel-merge + shell executeScripts skip. IIFE-wrapped; handlers on window.* */
(function(){

  var optData = [];
  var optFilter = 'ALL';
  var optLifeFilter = 'ALL'; // กรองตาม lifecycle: ALL / NEW / EXTENDED / REDUCED / CANCELLED
  var optRowsPerPage = 99999;
  var optExpanded = null;
  var optStoreCache = {};

  window.initOp_Tracking = function () {
    window.optLoadItemMaster();
    window.loadOpTasks();
    window.loadNpdOp();
    if (window.optRenderRail) window.optRenderRail('promo');
  };

  /* ===== item master lookup (ดึงชื่อ EN/TH จาก Item Master ตาม Item Code) ===== */
  var optItemMap = {};
  window.optLoadItemMaster = function(){
    try{
      if (typeof google==='undefined' || !google.script || !google.script.run) return;
      google.script.run.withSuccessHandler(function(d){
        var items=(d&&d.items)||[]; var m={};
        items.forEach(function(it){ m[String(it.itemCode)]={ en:(it.itemNameEN||it.itemNameEn||''), th:(it.itemNameTH||it.itemNameTh||''), type:(it.itemType||'') }; });
        optItemMap=m;
      }).withFailureHandler(function(){}).getMasterDataExtended();
    }catch(e){}
  };
  function optItemName(code){ return optItemMap[String(code)] || null; }

  window.optRenderRail = function (active) {
    var el = document.getElementById('optRail'); if (!el) return;
    var items = [['promo','fa-bullhorn','Tracking Promotion','ตรวจสอบโปรโมชั่น'],['npd','fa-flask','NPD Items','สินค้าใหม่ NPD'],['flavor','fa-mortar-pestle','Flavor','ผงรสชาติ (Flavor)']];
    el.innerHTML = '<div class="pc-rail-grp" data-en="OP TRACKING" data-th="ตรวจสอบ (OP)">ตรวจสอบ (OP)</div>' + items.map(function (it) {
      return '<div class="pc-rail-item ' + (it[0] === active ? 'on' : '') + '" onclick="window.optSwitchTab(\'' + it[0] + '\')"><i class="fas ' + it[1] + '"></i><span class="navlbl" data-en="' + it[2] + '" data-th="' + it[3] + '">' + it[3] + '</span></div>';
    }).join('');
  };
  window.optSwitchTab = function (tab) {
    optExpanded = null; if (window.optSetFocus) window.optSetFocus(false);
    var isPromo = tab === 'promo', isNpd = tab === 'npd', isFlv = tab === 'flavor';
    if (!isPromo && !isNpd && !isFlv) isPromo = true;
    document.getElementById('tabPromo').style.display = isPromo ? 'block' : 'none';
    document.getElementById('tabNPD').style.display = isNpd ? 'block' : 'none';
    var tf = document.getElementById('tabFlavor'); if (tf) tf.style.display = isFlv ? 'block' : 'none';
    var bp = document.getElementById('tabBtnPromo'), bn = document.getElementById('tabBtnNpd');
    if (bp) bp.classList.toggle('active', isPromo);
    if (bn) bn.classList.toggle('active', isNpd);
    if (isFlv && window.loadFlavorOp) window.loadFlavorOp();
    if (window.optRenderRail) window.optRenderRail(tab);
  };

  window.setOptFilter = function (btn, val) {
    optFilter = val;
    optExpanded = null;
    document.querySelectorAll('#optFilter button').forEach(b => { b.classList.remove('active', 'btn-success'); b.classList.add('btn-outline-secondary'); });
    btn.classList.add('active', 'btn-success'); btn.classList.remove('btn-outline-secondary');
    window.renderOpt();
  };
  window.setOptLifeFilter = function (btn, val) {
    optLifeFilter = val;
    optExpanded = null;
    document.querySelectorAll('#optLifeFilter button').forEach(function (b) { b.classList.remove('active', 'btn-dark'); b.classList.add('btn-outline-dark'); });
    btn.classList.add('active', 'btn-dark'); btn.classList.remove('btn-outline-dark');
    window.renderOpt();
  };

  /* ===== ล้างตัวกรอง (ทุกตารางหน้า OP) — คืนสถานะ/ประเภท = ทั้งหมด · ล้างค้นหา + วันที่ ===== */
  function opClickAll(groupId, attr) {
    var g = document.getElementById(groupId); if (!g) return;
    var b = g.querySelector('[' + attr + '="ALL"]'); if (b) b.click();
  }
  function opClearVal(id, ev) {
    var el = document.getElementById(id); if (!el || !el.value) return;
    el.value = '';
    try { el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); } catch (e) {}
  }

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
  window.optClearFilters = function () {
    opClearVal('optSearch', 'input'); opClearVal('optMonth', 'change'); opClearVal('optMonthPick', 'change');
    var _odm = document.getElementById('optDateMode'); if (_odm) _odm.value = 'ACTIVE';
    var rs = document.getElementById('optRowsSelect'); if (rs) rs.value = '99999';
    if (typeof window.optSetRows === 'function') window.optSetRows('99999');
    opClickAll('optLifeFilter', 'data-lf'); opClickAll('optFilter', 'data-f');
    if (typeof window.renderOpt === 'function') window.renderOpt();
  };
  window.npdOpClearFilters = function () {
    opClearVal('npdOpSearch', 'input');
    opClickAll('npdOpFilter', 'data-f');
    if (typeof window.renderNpdOp === 'function') window.renderNpdOp();
  };
  window.flvOpClearFilters = function () {
    opClearVal('flvOpSearch', 'input');
    opClickAll('flvOpFilter', 'data-f');
    if (typeof window.renderFlvOp === 'function') window.renderFlvOp();
  };
  window.optSetRows = function (v) { optRowsPerPage = parseInt(v) || 99999; optExpanded = null; window.renderOpt(); };
  window.optToggleAll = function (src) { document.querySelectorAll('.opt-row-checkbox').forEach(function (cb) { cb.checked = src.checked; }); };

  /* EXPORT EXCEL — รายงานแบบบล็อก (เหมือนฝั่ง MKT · promo-report.js) */
  window.optExportExcel = function(){
    if (typeof XLSX === 'undefined') { Swal.fire('Error','XLSX library ยังไม่โหลด','error'); return; }
    if (!window.PC_PromoReport) { Swal.fire('Error','ตัวสร้างรายงานยังไม่โหลด (promo-report.js)','error'); return; }
    Swal.fire({ title:'กำลังสร้างรายงาน Excel...', allowOutsideClick:false, didOpen:function(){Swal.showLoading();} });
    google.script.run.withSuccessHandler(function(rows){
      rows = rows || [];
      if (!rows.length) { Swal.fire('ไม่มีข้อมูล','ยังไม่มีรายการให้ส่งออก','info'); return; }
      try {
        var fn = 'Promo_Report_'+new Date().toISOString().slice(0,10)+'.xlsx';
        var camps = new Set(rows.map(function(r){return r.campaign;})).size;
        Promise.resolve(window.PC_PromoReport.exportExcel(rows, fn)).then(function(){
          Swal.fire({ icon:'success', title:'ส่งออกสำเร็จ', html:'รายงานแบบบล็อก <b>'+camps+'</b> แคมเปญ → <b>'+fn+'</b>', timer:2400, showConfirmButton:false });
        }).catch(function(e){ Swal.fire('Error', String(e && e.message || e), 'error'); });
      } catch(e){ Swal.fire('Error', String(e && e.message || e), 'error'); }
    }).withFailureHandler(function(e){ Swal.fire('Error', String(e), 'error'); }).getFullPromoExport('ALL');
  };
  /* พิมพ์ — ถ้าติ๊กเลือกไว้ = พิมพ์เฉพาะที่เลือก · ไม่ติ๊ก = พิมพ์ทั้งหมด */
  window.optPrint = function(){
    var checked = [...new Set([...document.querySelectorAll('.opt-row-checkbox:checked')].map(function(c){return c.getAttribute('data-campaign');}).filter(Boolean))];
    var map=new Map(); (optData||[]).forEach(function(c){ if(!map.has(c.campaign)) map.set(c.campaign,c); });
    var rows, title;
    if(checked.length){ rows = checked.map(function(n){return map.get(n);}).filter(Boolean); title='รายการโปรที่เลือก ('+rows.length+' รายการ)'; }
    else { rows = [...map.values()]; title='รายการโปรโมชันทั้งหมด ('+rows.length+' รายการ)'; }
    window.optPrintRows(rows, title);
  };
  window.optPrintRows = function(rows, title){
    var esc=function(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;'})[c];});};
    var body = rows.map(function(c,i){ return '<tr><td>'+(i+1)+'</td><td>'+esc(c.campaign)+'</td><td>'+esc(c.promoType||'')+'</td><td>'+esc(c.codePromotion||c.promoCode||c.codeItemSet||c.itemPromoCode||'')+'</td><td>'+esc(c.startDate||'')+'</td><td>'+esc(c.endDate||'')+'</td><td>'+esc(c.channel||'')+'</td><td>'+esc(c.itStatus||'')+'</td><td>'+esc(c.opStatus||'')+'</td></tr>'; }).join('');
    var html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title>'+
      '<style>body{font-family:"Kanit",sans-serif;padding:24px;color:#1a1d20}h2{margin:0 0 4px}.sub{color:#666;font-size:13px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #cfd4da;padding:6px 8px;text-align:left}thead th{background:#1a1d20;color:#fff}tbody tr:nth-child(even){background:#f6f8fa}@media print{.noprint{display:none}}</style>'+
      '</head><body><h2>'+esc(title)+'</h2><div class="sub">Potato Corner · พิมพ์เมื่อ '+new Date().toLocaleString('th-TH')+'</div>'+
      '<table><thead><tr><th>#</th><th>ชื่อแคมเปญ</th><th>ประเภท</th><th>Code Promotion</th><th>เริ่ม</th><th>สิ้นสุด</th><th>ช่องทาง</th><th>IT</th><th>OP</th></tr></thead><tbody>'+body+'</tbody></table>'+
      '<button class="noprint" onclick="window.print()" style="margin-top:16px;padding:8px 18px;border:0;background:#2e934a;color:#fff;border-radius:8px;font-weight:700;cursor:pointer">🖨️ พิมพ์</button>'+
      '<scr'+'ipt>setTimeout(function(){try{window.print();}catch(e){}},400);<\/scr'+'ipt></body></html>';
    var w=window.open('','_blank'); if(!w){ Swal.fire('ป๊อปอัปถูกบล็อก','กรุณาอนุญาต popup เพื่อพิมพ์','warning'); return; } w.document.write(html); w.document.close();
  };

  window.loadOpTasks = function () {
    optExpanded = null;
    window.__optLoading = true;
    google.script.run.withSuccessHandler(function (data) {
      window.__optLoading = false; window.__optLoaded = true;
      optData = data || [];
      /* FX-P59 — สลับไปหน้าอื่นแล้ว อย่าวาดทับหน้าที่เปิดอยู่ */
      if (!document.getElementById('optBody')) return;
      window.renderOpt();
    }).withFailureHandler(e => { window.__optLoading = false; Swal.fire('Error', String(e), 'error'); }).getAllCampaignData();
  };

  window.fillOptFilters = function (base) {
    var esc2 = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
    var uniq = function(a){ return [...new Set(a.filter(Boolean))].sort(); };
    var setOpts = function(id, vals){ var el=document.getElementById(id); if(!el) return; var cur=el.value; el.innerHTML='<option value="">ALL</option>'+vals.map(function(v){return '<option value="'+esc2(v)+'">'+esc2(v)+'</option>';}).join(''); if(vals.indexOf(cur)>=0) el.value=cur; };
    setOpts('opf_name', uniq(base.map(function(c){return c.campaign;})));
    setOpts('opf_type', uniq(base.map(function(c){return c.promoType;})));
    setOpts('opf_start', uniq(base.map(function(c){return c.startDate;})));
    setOpts('opf_end', uniq(base.map(function(c){return c.endDate;})));
    setOpts('opf_mode', uniq(base.map(function(c){return c.channel;})));
    setOpts('opf_it', uniq(base.map(function(c){return c.itStatus||'PENDING';})));
    setOpts('opf_op', uniq(base.map(function(c){return c.opStatus==='CONFIRMED'?'COMPLETE':'WAITING';})));
  };
  window.renderOpt = function () {
    const month = document.getElementById('optMonth')?.value || '';
    const search = (document.getElementById('optSearch')?.value || '').toLowerCase();

    // dedup: one row per campaign (a campaign can have many POS buttons)
    const seen = new Map();
    const optSIdx = {};
    optData.forEach(c => {
      if (!seen.has(c.campaign)) seen.set(c.campaign, c);
      var k = c.campaign; if (!k) return;
      var extra = [c.shortName, c.kitchen, c.codePromotion, c.codeItemSet, c.itemNameEN, c.itemCode].filter(Boolean).join(' ').toLowerCase();
      optSIdx[k] = (optSIdx[k] ? optSIdx[k] + ' ' : '') + extra;
    });
    let rows = [...seen.values()];
    window.fillOptFilters(rows);

    rows = rows.filter(c => (c.changeStatus || '') !== 'CANCELLED' || optFilter === 'ALL' || optLifeFilter === 'CANCELLED');
    if (optLifeFilter && optLifeFilter !== 'ALL') {
      rows = rows.filter(c => { const _chg = (c.changeStatus || '').toUpperCase(); return optLifeFilter === 'NEW' ? !_chg : _chg === optLifeFilter; });
    }
    /* FX-P54 — โหมดของตัวกรองวันที่: ใช้งานวันนั้น (เดิม) / เริ่มวันนั้น / จบวันนั้น */
    if (month) { var _pO=function(s){ var mm=String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); if(mm) return new Date(+mm[3],+mm[2]-1,+mm[1]).getTime(); var t=Date.parse(s); return isNaN(t)?0:t; }; var _d=Date.parse(month); var _dm=(document.getElementById('optDateMode')||{}).value||'ACTIVE'; var _ymd=function(ms){ if(!ms) return ''; var dd=new Date(ms); return dd.getFullYear()+'-'+('0'+(dd.getMonth()+1)).slice(-2)+'-'+('0'+dd.getDate()).slice(-2); }; var _pick=String(month).slice(0,10); rows = rows.filter(function(c){ var _st=_pO(c.startDate), _en=_pO(c.endDate); if(_dm==='START') return _ymd(_st)===_pick; if(_dm==='END') return _ymd(_en)===_pick; return (!_st||_d>=_st)&&(!_en||_d<=_en); }); }
    var _mPick = document.getElementById('optMonthPick')?.value || '';
    if (_mPick) rows = rows.filter(function (c) { return pcMonthOverlap(_mPick, c.startDate, c.endDate); });
    if (optFilter !== 'ALL') rows = rows.filter(c => (c.opStatus || 'WAITING') === optFilter);
    if (search) rows = rows.filter(c => (c.campaign || '').toLowerCase().includes(search) || (optSIdx[c.campaign] || '').includes(search));
    const _hf = id => (document.getElementById(id)?.value || '');
    const _fn=_hf('opf_name'),_ft=_hf('opf_type'),_fs=_hf('opf_start'),_fe=_hf('opf_end'),_fm=_hf('opf_mode'),_fi=_hf('opf_it'),_fo=_hf('opf_op');
    if(_fn) rows=rows.filter(c=>(c.campaign||'')===_fn);
    if(_ft) rows=rows.filter(c=>(c.promoType||'')===_ft);
    if(_fs) rows=rows.filter(c=>(c.startDate||'')===_fs);
    if(_fe) rows=rows.filter(c=>(c.endDate||'')===_fe);
    if(_fm) rows=rows.filter(c=>(c.channel||'')===_fm);
    if(_fi) rows=rows.filter(c=>(c.itStatus||'PENDING')===_fi);
    if(_fo) rows=rows.filter(c=>((c.opStatus==='CONFIRMED')?'COMPLETE':'WAITING')===_fo);

    // sort by promotion start date descending (ล่าสุด/ปัจจุบันก่อน) + จำกัดจำนวนแถวตามตัวเลือก
    const toDate = (s) => { const m = String(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3], +m[2]-1, +m[1]).getTime() : (Date.parse(s)||0); };
    rows.sort((a,b) => toDate(b.startDate) - toDate(a.startDate));
    if (optRowsPerPage && optRowsPerPage < rows.length) rows = rows.slice(0, optRowsPerPage);
    if (optExpanded != null && !rows.some(c => String(c.rowIdx) === String(optExpanded))) optExpanded = null;

    const baseSeen = new Map();
    optData.forEach(c => { if (!baseSeen.has(c.campaign)) baseSeen.set(c.campaign, c); });
    const base = [...baseSeen.values()].filter(c => (c.changeStatus || '') !== 'CANCELLED');
    window.renderOptSummary({
      waiting: base.filter(c => (c.opStatus || 'WAITING') === 'WAITING').length,
      approved: base.filter(c => c.opStatus === 'CONFIRMED').length,
      total: base.length
    });

    const tbody = document.getElementById('optBody');
    if (!tbody) return;
    /* FX-P59 — ข้อมูลยังมาไม่ถึง (สลับหน้าเร็ว) → ดึงให้เองครั้งเดียว แทนการขึ้น "ไม่มีรายการในสถานะนี้" */
    if (!optData.length && !window.__optLoaded && !window.__optLoading) {
      window.__optLoading = true;
      setTimeout(function () { window.__optLoading = false; if (!optData.length && document.getElementById('optBody')) window.loadOpTasks(); }, 50);
    }
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="py-5 text-muted">ไม่มีรายการในสถานะนี้</td></tr>'; return; }

    let html = '';
    rows.forEach(c => {
      const expanded = String(optExpanded) === String(c.rowIdx);
      const itDone = c.itStatus === 'COMPLETE';
      const itCls = itDone ? 'bg-success text-white' : 'bg-warning text-dark';
      const itEn = itDone ? 'COMPLETE' : 'PENDING';
      const itTh = itDone ? 'ขึ้นปุ่มแล้ว' : 'รอ IT ทำปุ่ม';
      const op = c.opStatus || 'WAITING';
      const opCls = op === 'CONFIRMED' ? 'bg-success text-white' : (op === 'REJECTED' ? 'bg-warning text-dark' : 'bg-danger text-white fw-bold');
      const opWord = op === 'CONFIRMED' ? 'ยืนยันแล้ว' : (op === 'REJECTED' ? 'ตีกลับ' : 'รอตรวจสอบ');
      const actLabel = op === 'CONFIRMED' ? '<i class="fas fa-check me-1"></i>ยืนยันถูกต้อง' : (op === 'REJECTED' ? '<i class="fas fa-pen me-1"></i>รอแก้ไข' : (expanded ? '<i class="fas fa-chevron-up me-1"></i>ปิด' : '<i class="fas fa-hourglass-half me-1"></i>รอการตรวจสอบ'));
      const actCls = op === 'CONFIRMED' ? 'btn-success' : (op === 'REJECTED' ? 'btn-warning' : (expanded ? 'btn-secondary' : 'btn-outline-primary'));
      const chg = (c.changeStatus || '').toUpperCase();
      let lifeTag = '';
      if (chg === 'EXTENDED') lifeTag = '<span class="life-tag tag-ext"><i class="fas fa-calendar-plus"></i> ขยายเวลา</span>';
      else if (chg === 'REDUCED') lifeTag = '<span class="life-tag tag-red"><i class="fas fa-calendar-minus"></i> ลดเวลา</span>';
      else if (chg === 'CANCELLED') lifeTag = '<span class="life-tag tag-cancel"><i class="fas fa-ban"></i> ยกเลิก</span>';
      else if (String(c.opStatus || '').toUpperCase() !== 'CONFIRMED') lifeTag = '<span class="life-tag tag-new">NEW</span>';

      let endCls = '', endFlag = '';
      if (chg === 'EXTENDED') { endCls = 'text-info fw-bold'; endFlag = '<i class="fas fa-arrow-up-long end-flag text-info" title="ขยายวันสิ้นสุด"></i>'; }
      else if (chg === 'REDUCED') { endCls = 'text-danger fw-bold'; endFlag = '<i class="fas fa-arrow-down-long end-flag text-danger" title="ลดวันสิ้นสุด"></i>'; }

      html += `
        <tr class="${expanded ? 'fw-bold opt-open' : ''}">
          <td><input class="form-check-input opt-row-checkbox" type="checkbox" data-campaign="${c.campaign}"></td>
          <td class="text-start ps-3"><div>${c.campaign}</div>${(window.PC_voucherTag ? PC_voucherTag(c) : '')}${lifeTag}</td>
          <td class="text-start"><span class="fw-bold">${c.promoType || '-'}</span></td>
          <td class="small">${c.startDate || ''}</td>
          <td class="small ${endCls}">${c.endDate || ''}${endFlag}</td>
          <td class="small">${window.PCniceChannel ? PCniceChannel(c.channel) : (c.channel || '-')}</td>
          <td><span class="status-badge ${itCls}" data-en="${itEn}" data-th="${itTh}">${itTh}</span></td>
          <td><span class="status-badge ${opCls}">${opWord}</span>${op === 'REJECTED' && c.rejectReason ? `<button class="btn btn-sm btn-link text-danger p-0 d-block mx-auto" style="font-size:.65rem;" onclick="window.optShowReject(${c.rowIdx})"><i class="fas fa-circle-info me-1"></i>ดูเหตุผล</button>` : ''}</td>
          <td>
            <button class="btn btn-sm ${expanded ? 'btn-secondary' : 'btn-outline-primary'} fw-bold" ${itDone ? '' : 'disabled'} title="${itDone ? 'ดูรายละเอียด / ตรวจสอบ' : 'รอ IT ตั้งค่าปุ่มก่อน'}" onclick="window.optToggle(${c.rowIdx})">${expanded ? '<i class="fas fa-chevron-up me-1"></i>ปิด' : '<i class="fas fa-eye me-1"></i>ดูรายละเอียด'}</button>
          </td>
        </tr>`;
      if (expanded) html += `<tr class="opt-open-detail"><td colspan="9" class="expand-content-cell"><div class="item-table-wrapper" id="opt-exp-${c.rowIdx}"><div class="text-center py-4"><div class="spinner-border spinner-border-sm text-success"></div></div></div></td></tr>`;
    });
    tbody.innerHTML = html;
    if (optExpanded !== null) window.optFetch(optExpanded);
    window.optSetFocus(optExpanded != null);
    var _ofn = document.getElementById('optFocusName');
    if (_ofn) { var _fc = (optExpanded != null) ? (rows.find(c => String(c.rowIdx) === String(optExpanded)) || {}) : {}; _ofn.textContent = _fc.campaign ? ('· ' + _fc.campaign) : ''; }
  };

  window.renderOptSummary = function (c) {
    const items = [
      { t: 'รอตรวจสอบ', v: c.waiting, cls: 'bg-warning text-dark', i: 'fa-clock' },
      { t: 'ตรวจแล้ว', v: c.approved, cls: 'bg-success text-white', i: 'fa-circle-check' },
      { t: 'ทั้งหมด', v: c.total, cls: 'bg-dark text-white', i: 'fa-layer-group' },
    ];
    var _optSum = document.getElementById('optSummary'); if (!_optSum) return; _optSum.innerHTML = items.map(it => `
      <div class="col-md-4 mb-2"><div class="card shadow-sm border-0 ${it.cls}"><div class="card-body p-3 d-flex justify-content-between align-items-center">
        <div><small class="fw-bold opacity-75 d-block text-uppercase" style="font-size:.7rem;">${it.t}</small><h3 class="fw-bold m-0">${it.v}</h3></div>
        <i class="fas ${it.i} fa-2x opacity-25"></i></div></div></div>`).join('');
  };

  window.optToggle = function (rowIdx) { optExpanded = (optExpanded === rowIdx) ? null : rowIdx; window.renderOpt(); };
  window.optSetFocus = function (on) { var sc = document.querySelector('.opt-scope'); if (sc) sc.classList.toggle('opt-focus', !!on); };
  window.optExitFocus = function () { optExpanded = null; window.renderOpt(); };

  window.optFetch = function (rowIdx) {
    const cont = document.getElementById('opt-exp-' + rowIdx);
    if (!cont) return;
    const base = optData.find(x => x.rowIdx === rowIdx);
    if (!base) return;
    const isCoupon = (base.promoType || '').toLowerCase().includes('coupon');
    const _tl = (base.promoType || '').toLowerCase();
    const isSpecialType = _tl.includes('voucher') || _tl.includes('bill discount');
    const isPrice = _tl.includes('price');
    google.script.run.withSuccessHandler(function (res) {
      if (!res || res.status !== 'success') { cont.innerHTML = '<div class="text-danger p-3">ไม่พบรายละเอียด</div>'; return; }
      optStoreCache[rowIdx] = res.storeData || [];
      let last = '';
      const rowsHtml = (res.items || []).map(i => {
        const isHeader = i.shortName !== last; last = i.shortName;
        return `<tr>
          <td><input class="ro-input" value="${isHeader ? (res.promoCode || '') : ''}" readonly></td>
          <td><input class="ro-input" value="${isHeader ? (i.itemSetCode || '') : ''}" readonly></td>
          <td><input class="ro-input" value="${isHeader ? (i.kitchen || '') : ''}" readonly></td>
          <td><input class="ro-input" value="${isHeader ? (i.shortName || '') : ''}" readonly></td>
          <td><input class="ro-input" style="color:#0d6efd;font-weight:bold;" value="${i.itemCode || ''}" readonly></td>
          <td><input class="ro-input" style="text-align:left;" value="${i.itemNameEn || ''}" readonly></td>
          <td><input class="ro-input" value="${i.qty || 0}" readonly></td>
          <td><input class="ro-input" value="${i.price || 0}" readonly></td>
          <td><input class="ro-input text-danger" value="${i.discount || 0}" readonly></td>
          <td><input class="ro-input fw-bold" value="${i.netPrice || 0}" readonly></td>
        </tr>`;
      }).join('');
      const _campJs = String(base.campaign || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const memoHtml = res.hasMemo
        ? `<div class="h-100 p-3" style="border:1px solid #dc3545;border-radius:12px;background:#fff5f5;">
            <div class="text-center w-100">
              <small class="fw-bold d-block text-danger mb-2" style="letter-spacing:1px;font-size:12px;">MEMO MKT: [ATTACHED]</small>
              <div class="d-flex align-items-center gap-2">
                <i class="fas fa-file-signature fa-3x text-danger"></i>
                <button type="button" class="btn btn-danger flex-grow-1 shadow-sm fw-bold" onclick="window.pcViewMemo('${_campJs}','${res.memoUrl}')"><i class="fas fa-external-link-alt me-2"></i>VIEW MEMO</button>
              </div>
            </div>
          </div>`
        : `<div class="h-100 p-3 d-flex flex-column justify-content-center" style="border:1px dashed #dee2e6;border-radius:12px;background:#fafafa;">
              <div class="text-center w-100">
                <i class="fas fa-file-signature fa-2x text-muted mb-2"></i>
                <small class="fw-bold d-block text-dark mb-1">MEMO</small>
                <small class="text-muted">— ยังไม่มี Memo แนบ —</small>
              </div>
            </div>`;
      const det = (res.promotionDetail || '-').replace(/\n/g, '<br>');
      const cond = (res.condition || '-').replace(/\n/g, '<br>');
      window.__optDetailCache = window.__optDetailCache || {};
      (function(){
        var seen={}, list=[];
        (res.items||[]).forEach(function(it){ var sn=it.shortName||'-'; if(seen[sn])return; seen[sn]=1; list.push({sn:sn, detail:String(it.detail||''), condition:String(it.condition||'')}); });
        window.__optDetailCache[rowIdx] = { cond:cond, det:det, campDetail:det, campCond:cond, list:list };
      })();

      // group items by button (shortName) for per-button review
      const btnOrder = [];
      const btnMap = {};
      (res.items || []).forEach(i => {
        const k = i.shortName || '-';
        if (!btnMap[k]) { btnMap[k] = []; btnOrder.push(k); }
        btnMap[k].push(i);
      });
      const alreadyConfirmed = String(base.opStatus || '').trim().toUpperCase() === 'CONFIRMED';

      const btnCards = btnOrder.map((sn, bi) => {
        const items = btnMap[sn];
        const h = items[0];
        const btnTotal = items.reduce((s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.qty) || 1), 0);
        const btnNet = items.reduce((s, it) => { const np = (it.netPrice != null && it.netPrice !== '') ? it.netPrice : it.price; return s + (parseFloat(np) || 0) * (parseInt(it.qty) || 1); }, 0);
        const _kitchenLbl = String(h.kitchen || '').replace(/"/g, '&quot;');
        const itemRows = items.map((i, ri) => {
          const _im = optItemName(i.itemCode) || {};
          const _isSet = /item\s*set/i.test(_im.type||'');
          const _hasSet = h.itemSetCode && h.itemSetCode !== '-';
          let _kitchen = ri===0 ? (h.kitchen||'') : '';
          let _short   = ri===0 ? (sn||'') : '';
          let _setCode = ri===0 ? (_hasSet ? h.itemSetCode : (_isSet ? (i.itemCode||'') : '')) : '';
          let _itemCodeCell = (_isSet || isCoupon || isSpecialType) ? '' : (i.itemCode||'');
          let _en = String(_im.en || i.itemNameEn || '').replace(/"/g,'&quot;');
          let _th = String(_im.th || i.itemNameTh || '').replace(/"/g,'&quot;');
          if (isPrice) {   // Price Promo: ครัว=Kitchen Name · Short Name=ชื่อปุ่ม · โชว์รหัส+ชื่อสินค้าครบทุกบรรทัด
            _kitchen = ri===0 ? String(h.kitchen||'').replace(/"/g,'&quot;') : '';
            _short   = ri===0 ? String(sn||'').replace(/"/g,'&quot;') : '';
            _setCode = ri===0 ? (_hasSet ? h.itemSetCode : (i.itemCode||'')) : '';
            _itemCodeCell = i.itemCode||'';
          }
          if (isCoupon || isSpecialType) {   // Item Coupon / Bill Discount / Voucher / E-Voucher → Item Set + ครัว ว่างเสมอ · โชว์ Item Code + ชื่อสินค้า
            _setCode = '';
            _kitchen = '';
            _itemCodeCell = i.itemCode || '';
          }
          return `<tr>
            <td><input class="ro-input" style="font-weight:bold;background:#f3f6fb" value="${ri === 0 ? (/item\s*set/i.test(String(base.promoType||'')) ? 'Price Promotion' : (base.promoType||'')) : ''}" readonly></td>
            <td><input class="ro-input" value="${ri === 0 ? (h.codePromotion || h.promoCode || res.promoCode || '') : ''}" readonly></td>
            <td><input class="ro-input" value="${_setCode}" readonly></td>
            <td><input class="ro-input" style="text-align:left;" value="${_kitchen}" readonly></td>
            <td><input class="ro-input" style="text-align:left;" value="${_short}" readonly></td>
            <td><input class="ro-input" style="color:#0d6efd;font-weight:bold;" value="${_itemCodeCell}" readonly></td>
            <td><input class="ro-input" style="text-align:left;" value="${_en}" readonly></td>
            <td><input class="ro-input" style="text-align:left;" value="${_th}" readonly></td>
            <td><input class="ro-input" value="${i.qty || 0}" readonly></td>
            <td><input class="ro-input" value="${i.price || 0}" readonly></td>
            <td><input class="ro-input text-danger" value="${i.discount || 0}" readonly></td>
            <td><input class="ro-input fw-bold" value="${i.netPrice || 0}" readonly></td>
          </tr>`; }).join('');
        return `
          <div class="btn-review border rounded-3 mb-3" data-btn="${bi}" data-short="${(sn||'').replace(/"/g,'&quot;')}">
            <div class="d-flex justify-content-between align-items-center px-3 py-2" style="background:#f1f3f5;border-bottom:1px solid #dee2e6;border-radius:12px 12px 0 0;">
              <div class="d-flex align-items-center flex-wrap gap-2">
                <span class="fw-bold"><i class="fas fa-hand-pointer me-1 text-success"></i>${sn}</span>
                ${_kitchenLbl ? `<span class="badge" style="background:#fff3cd;color:#8a6d0b;border:1px solid #ffe69c;font-size:.72rem"><i class="fas fa-receipt me-1"></i>บิลครัว: ${_kitchenLbl}</span>` : ''}
                ${btnTotal > 0 ? `<span class="badge" style="background:#e7f1ff;color:#0d6efd;font-size:.72rem"><i class="fas fa-tag me-1"></i>ราคาปกติ ฿${btnTotal.toLocaleString()}</span>` : ''}
                ${(btnNet > 0 && btnNet < btnTotal) ? `<span class="badge bg-success" style="font-size:.72rem"><i class="fas fa-arrow-down me-1"></i>ราคาลด ฿${btnNet.toLocaleString()}</span>` : ''}
              </div>
              <div class="btn-group btn-group-sm review-toggle" role="group">
                <button type="button" class="btn btn-outline-success rv-ok ${alreadyConfirmed ? 'active' : ''}" ${alreadyConfirmed ? 'disabled' : ''} onclick="window.optMark(this,'ok')"><i class="fas fa-check"></i> ถูกต้อง</button>
                <button type="button" class="btn btn-outline-danger rv-no" ${alreadyConfirmed ? 'disabled' : ''} onclick="window.optMark(this,'no')"><i class="fas fa-xmark"></i> ไม่ถูกต้อง</button>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-bordered align-middle mb-0">
                <thead class="table-dark small text-center"><tr><th style="white-space:nowrap">Type Promotion</th><th>Code Promo</th><th>Item Set</th><th style="min-width:170px;"><i class="fas fa-receipt me-1 text-warning"></i>Kitchen</th><th style="min-width:160px;">Short Name</th><th>Item Code</th><th>Name EN</th><th>Name TH</th><th>Qty</th><th>Gross</th><th>Discount</th><th>Net</th></tr></thead>
                <tbody class="text-center bg-white">${itemRows}</tbody>
              </table>
            </div>
          </div>`;
      }).join('');

      cont.innerHTML = `
        <div class="row g-3 mb-4 align-items-stretch">
          <div class="col-md-5">${memoHtml}</div>
          <div class="col-md-4">
            <div class="h-100 p-3 d-flex flex-column justify-content-center" style="border-radius:12px;background:#fff;">
              <small class="fw-bold d-block text-muted text-center mb-4" style="font-size:18px;letter-spacing:0.9px;">PRODUCT CATEGORY (POS)</small>
              <div class="bg-light rounded p-3 text-center"><span class="fw-bold text-dark" style="font-size:18px;letter-spacing:1px;">${res.cateRemark || '-'}</span></div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="d-flex flex-column h-100 gap-2">
              <button class="btn btn-dark flex-grow-1 d-flex align-items-center justify-content-center gap-3" onclick="window.optStores(${rowIdx})" style="border-radius:12px;">
                <i class="fas fa-store fa-2x"></i>
                <div class="text-start"><small class="fw-bold d-block" style="font-size:16px;line-height:1;">STORES</small></div>
              </button>
              <button class="btn btn-outline-dark flex-grow-1 d-flex align-items-center justify-content-center gap-3" onclick="window.optDetail(${rowIdx})" style="border-radius:12px;background:#fff;">
                <i class="fas fa-info-circle fa-2x"></i>
                <div class="text-start" style="line-height:1.2;"><small class="fw-bold d-block" style="font-size:11px;">Promotion Detail</small><small class="fw-bold d-block" style="font-size:11px;">& Condition</small></div>
              </button>
            </div>
          </div>
        </div>
        <div class="p-3 rounded-3 mb-3 d-flex align-items-start gap-3" style="background:#fff4e5;border:1.5px solid #e0a800">
          <i class="fas fa-triangle-exclamation mt-1" style="color:#8a5a00;font-size:1.15rem"></i>
          <div class="small fw-bold" style="color:#8a5a00;line-height:1.5">กรุณาตรวจสอบปุ่มรับข้อมูลเครื่อง POS ก่อนทำการตรวจสอบปุ่มทุกครั้ง<div class="fw-normal mt-1" style="opacity:.85">ให้เครื่อง POS รับข้อมูลปุ่มล่าสุดให้เสร็จก่อน แล้วจึงติ๊กผลตรวจ — ถ้ายังไม่รับข้อมูล ปุ่มที่เห็นบนเครื่องอาจเป็นของเก่า</div></div>
        </div>
        <div class="fw-bold small text-uppercase text-muted mb-2"><i class="fas fa-list-check me-1"></i>ตรวจแต่ละปุ่ม (${btnOrder.length} ปุ่ม) — ติ๊ก ถูกต้อง/ไม่ถูกต้อง ทุกปุ่ม แล้วกดบันทึก</div>
        ${btnCards}
        <div class="d-flex justify-content-between align-items-center mt-3 p-3 rounded-3" style="background:${base.opStatus==='CONFIRMED'?'#eef1f4':'#fff8e1'};">
          <div class="small fw-bold text-muted" id="opt-review-status-${rowIdx}">${base.opStatus==='CONFIRMED'?'<i class="fas fa-circle-check me-1 text-success"></i>ตรวจสอบยืนยันแล้ว — รอเคสเปลี่ยนแปลงจาก MKT (ขยาย/ลด/ยกเลิก)':'<i class="fas fa-circle-info me-1"></i>ยังตรวจไม่ครบทุกปุ่ม'}</div>
          ${base.opStatus==='CONFIRMED'
            ? '<button class="btn btn-secondary fw-bold px-4" disabled title="ตรวจสอบแล้ว — จะเปิดให้ตรวจใหม่เมื่อ MKT ส่งเคสเปลี่ยนแปลง"><i class="fas fa-check-double me-2"></i>ตรวจแล้ว</button>'
            : `<button class="btn btn-success fw-bold px-4" onclick="window.optSaveReview('${base.campaign.replace(/'/g, "\\'")}', ${rowIdx})"><i class="fas fa-save me-2"></i>บันทึกผลตรวจสอบ</button>`}
        </div>
        <div class="alert alert-light border mt-2 mb-0 small"><i class="fas fa-lock me-1 text-secondary"></i> OP ตรวจสอบและบันทึกผลเท่านั้น — ถ้ามีปุ่มใด "ไม่ถูกต้อง" ระบบจะส่งกลับให้ IT แก้</div>`;
      window.optUpdateReviewStatus(rowIdx);
    }).getPromoDetails(base.campaign);
  };

  // mark one button ok/no (toggle within its group)
  window.optMark = function (btn, val) {
    const grp = btn.closest('.review-toggle');
    const card = btn.closest('.btn-review');
    const exp = btn.closest('.item-table-wrapper');
    const rowIdx = exp ? exp.id.replace('opt-exp-', '') : null;
    if (val === 'no') {
      // clicking "ไม่ถูกต้อง" → open issue picker for THIS button
      const issues = ['ชื่อปุ่มผิด','ตัวย่อสินค้าผิด','สินค้าไม่ถูกต้อง','ตัวเลือกผงสินค้าไม่ถูกต้อง','กดปุ่มไม่ลดราคา','ปุ่มลดราคาไม่ถูกต้อง','อื่นๆ'];
      const prev = card.getAttribute('data-issues') ? card.getAttribute('data-issues').split('|') : [];
      const prevDetail = card.getAttribute('data-detail') || '';
      const checks = issues.map(t => `<label class="d-flex align-items-center gap-2 p-2 border rounded-2 mb-1" style="cursor:pointer;"><input type="checkbox" class="form-check-input m-0 rj-issue" value="${t}" ${prev.includes(t) ? 'checked' : ''}><span class="small fw-bold">${t}</span></label>`).join('');
      Swal.fire({
        title: 'ปุ่มนี้ไม่ถูกต้อง', width: '540px',
        html: `<div class="text-start">
            <div class="alert alert-warning small py-2"><b>ปุ่ม:</b> ${card.getAttribute('data-short')}</div>
            <div class="fw-bold small text-muted mb-2"><i class="fas fa-list-check me-1"></i>เลือกหัวข้อที่ต้องแก้ไข (เลือกได้หลายข้อ)</div>
            ${checks}
            <div class="fw-bold small text-muted mt-3 mb-1"><i class="fas fa-pen me-1"></i>รายละเอียด <span class="text-danger">*</span></div>
            <textarea id="rjDetail" class="form-control" rows="2" placeholder="อธิบายสิ่งที่ต้องแก้ไข">${prevDetail}</textarea>
            <div id="rjErr" class="text-danger small fw-bold mt-2" style="min-height:18px;"></div>
          </div>`,
        showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'บันทึกหัวข้อ', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
          const picked = [...document.querySelectorAll('.rj-issue:checked')].map(c => c.value);
          const detail = (document.getElementById('rjDetail').value || '').trim();
          const clean = detail.replace(/\s+/g, ' ');
          const letters = (clean.match(/[ก-๙a-zA-Z0-9]/g) || []).length;
          const err = document.getElementById('rjErr'); const fail = m => { err.textContent = m; return false; };
          if (!picked.length) return fail('⚠ เลือกอย่างน้อย 1 หัวข้อ');
          if (clean.length < 10) return fail('⚠ กรอกรายละเอียดอย่างน้อย 10 ตัวอักษร');
          if (letters < 6) return fail('⚠ กรุณากรอกข้อความที่มีความหมาย');
          if (/(.)\1{4,}/.test(clean)) return fail('⚠ พบการพิมพ์ตัวอักษรซ้ำผิดปกติ');
          if (new Set(clean.replace(/\s/g, '').split('')).size < 4) return fail('⚠ กรุณากรอกรายละเอียดที่มีความหมาย');
          return { picked, detail };
        }
      }).then(r => {
        if (!r.isConfirmed) {
          // if no issues stored yet, revert this button to un-marked
          if (!card.getAttribute('data-issues')) { grp.querySelectorAll('button').forEach(b => b.classList.remove('active')); }
          return;
        }
        card.setAttribute('data-issues', r.value.picked.join('|'));
        card.setAttribute('data-detail', r.value.detail);
        grp.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // show chosen issues inline under the toggle
        let tagEl = card.querySelector('.rv-no-tags');
        if (!tagEl) { tagEl = document.createElement('div'); tagEl.className = 'rv-no-tags small text-danger px-3 py-1'; grp.closest('.btn-review').querySelector('.table-responsive').before(tagEl); }
        tagEl.innerHTML = `<i class="fas fa-triangle-exclamation me-1"></i>${r.value.picked.join(' · ')} — ${r.value.detail}`;
        if (rowIdx) window.optUpdateReviewStatus(rowIdx);
      });
      return;
    }
    // ok
    grp.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    card.removeAttribute('data-issues'); card.removeAttribute('data-detail');
    const t = card.querySelector('.rv-no-tags'); if (t) t.remove();
    if (rowIdx) window.optUpdateReviewStatus(rowIdx);
  };

  window.optUpdateReviewStatus = function (rowIdx) {
    const exp = document.getElementById('opt-exp-' + rowIdx);
    if (!exp) return;
    // already CONFIRMED → save button is disabled (no .btn-success); keep the confirmed message
    if (!exp.querySelector('button.btn-success')) {
      const el0 = document.getElementById('opt-review-status-' + rowIdx);
      if (el0) el0.innerHTML = '<i class="fas fa-circle-check me-1 text-success"></i>ตรวจสอบยืนยันแล้ว — รอเคสเปลี่ยนแปลงจาก MKT (ขยาย/ลด/ยกเลิก)';
      return;
    }
    const cards = [...exp.querySelectorAll('.btn-review')];
    const marked = cards.filter(c => c.querySelector('.rv-ok.active') || c.querySelector('.rv-no.active'));
    const bad = cards.filter(c => c.querySelector('.rv-no.active'));
    const el = document.getElementById('opt-review-status-' + rowIdx);
    if (!el) return;
    if (marked.length < cards.length) {
      el.innerHTML = `<i class="fas fa-circle-info me-1 text-warning"></i>ตรวจแล้ว ${marked.length}/${cards.length} ปุ่ม — ต้องครบทุกปุ่ม`;
    } else if (bad.length > 0) {
      el.innerHTML = `<i class="fas fa-rotate-left me-1 text-danger"></i>มี ${bad.length} ปุ่มไม่ถูกต้อง — บันทึกแล้วจะส่งกลับ IT`;
    } else {
      el.innerHTML = `<i class="fas fa-circle-check me-1 text-success"></i>ทุกปุ่มถูกต้อง — บันทึกแล้วส่งให้สาขา`;
    }
  };

  /* เตือนก่อนบันทึกผลตรวจทุกครั้ง — ต้องให้เครื่อง POS รับข้อมูลปุ่มล่าสุดก่อน */
  window.optPosSyncGate = function () {
    return Swal.fire({
      icon: 'warning', title: 'ตรวจสอบปุ่มรับข้อมูลเครื่อง POS แล้วหรือยัง?',
      html: '<div class="text-start small"><b>กรุณาตรวจสอบปุ่มรับข้อมูลเครื่อง POS ก่อนทำการตรวจสอบปุ่มทุกครั้ง</b><div class="text-muted mt-2">ถ้าเครื่อง POS ยังไม่รับข้อมูลปุ่มล่าสุด ปุ่มที่เห็นบนเครื่องอาจเป็นของเก่า ทำให้ผลตรวจไม่ตรงกับที่ IT ตั้งค่าไว้</div></div>',
      showCancelButton: true, reverseButtons: true, confirmButtonColor: '#198754',
      confirmButtonText: '<i class="fas fa-check me-1"></i>รับข้อมูลแล้ว — ตรวจต่อ', cancelButtonText: 'ยังไม่ได้รับข้อมูล'
    }).then(function (g) { return !!g.isConfirmed; });
  };
  window.optSaveReview = function (campaign, rowIdx) {
    return window.optPosSyncGate().then(function (okGate) { if (okGate) window.optSaveReviewGo(campaign, rowIdx); });
  };
  window.optSaveReviewGo = function (campaign, rowIdx) {
    const exp = document.getElementById('opt-exp-' + rowIdx);
    const cards = [...exp.querySelectorAll('.btn-review')];
    const unmarked = cards.filter(c => !c.querySelector('.rv-ok.active') && !c.querySelector('.rv-no.active'));
    if (unmarked.length) return Swal.fire({ icon: 'warning', title: 'ตรวจไม่ครบ', text: 'กรุณาติ๊ก ถูกต้อง/ไม่ถูกต้อง ให้ครบทุกปุ่มก่อนบันทึก', confirmButtonColor: '#000' });
    const badCards = cards.filter(c => c.querySelector('.rv-no.active'));
    const badNames = badCards.map(c => c.getAttribute('data-short'));

    if (badCards.length === 0) {
      Swal.fire({ title: 'ยืนยันผลตรวจสอบ?', html: `<b>${campaign}</b><br><span class="text-muted small">ทุกปุ่มถูกต้อง — ส่งให้สาขาเห็น</span>`, icon: 'question', showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' })
        .then(r => { if (!r.isConfirmed) return; Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ตรวจสอบถูกต้องแล้ว!', text: 'ส่งให้สาขาเรียบร้อย', timer: 1500, showConfirmButton: false }).then(() => { optExpanded = null; window.loadOpTasks(); })).setOpStatus(campaign, 'CONFIRMED', ''); });
    } else {
      // build reason from each bad button's stored issues
      const reason = badCards.map(c => {
        const sn = c.getAttribute('data-short');
        const iss = (c.getAttribute('data-issues') || '').split('|').filter(Boolean).join(' · ');
        const det = c.getAttribute('data-detail') || '';
        return `▸ ${sn} [${iss}]\n   ${det}`;
      }).join('\n');
      Swal.fire({ title: 'ส่งกลับ IT เพื่อแก้ไข?', html: `<div class="text-start"><div class="alert alert-danger small py-2 mb-2"><b>ปุ่มไม่ถูกต้อง (${badNames.length}):</b><br>${badNames.map(n => '• ' + n).join('<br>')}</div><div class="text-muted small">รายละเอียดที่ระบุไว้แต่ละปุ่มจะถูกส่งให้ IT</div></div>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'ส่งกลับ IT', cancelButtonText: 'ยกเลิก' })
        .then(r => { if (!r.isConfirmed) return; Swal.fire({ title: 'กำลังส่งกลับ IT...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ส่งกลับ IT เรียบร้อย', timer: 1500, showConfirmButton: false }).then(() => { optExpanded = null; window.loadOpTasks(); })).setOpStatus(campaign, 'REJECTED', reason); });
    }
  };

  window.optRejectWithButtons = function (campaign, badNames) {
    const issues = ['ชื่อปุ่มผิด','ตัวย่อสินค้าผิด','สินค้าไม่ถูกต้อง','ตัวเลือกผงสินค้าไม่ถูกต้อง','กดปุ่มไม่ลดราคา','ปุ่มลดราคาไม่ถูกต้อง','อื่นๆ'];
    const checks = issues.map(t => `<label class="d-flex align-items-center gap-2 p-2 border rounded-2 mb-1" style="cursor:pointer;"><input type="checkbox" class="form-check-input m-0 rj-issue" value="${t}"><span class="small fw-bold">${t}</span></label>`).join('');
    Swal.fire({
      title: 'มีปุ่มไม่ถูกต้อง — ส่งกลับ IT', width: '560px',
      html: `<div class="text-start">
          <div class="alert alert-danger small py-2"><b>ปุ่มที่ไม่ถูกต้อง (${badNames.length}):</b><br>${badNames.map(n => '• ' + n).join('<br>')}</div>
          <div class="fw-bold small text-muted mb-2"><i class="fas fa-list-check me-1"></i>เลือกหัวข้อที่ต้องแก้ไข (เลือกได้หลายข้อ)</div>
          ${checks}
          <div class="fw-bold small text-muted mt-3 mb-1"><i class="fas fa-pen me-1"></i>รายละเอียดที่ต้องแก้ไข <span class="text-danger">*</span></div>
          <textarea id="rjDetail" class="form-control" rows="3" placeholder="อธิบายสิ่งที่ต้องแก้ไขให้ IT"></textarea>
          <div id="rjErr" class="text-danger small fw-bold mt-2" style="min-height:18px;"></div>
        </div>`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'ส่งกลับ IT', cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const picked = [...document.querySelectorAll('.rj-issue:checked')].map(c => c.value);
        const detail = (document.getElementById('rjDetail').value || '').trim();
        const clean = detail.replace(/\s+/g, ' ');
        const letters = (clean.match(/[ก-๙a-zA-Z0-9]/g) || []).length;
        const err = document.getElementById('rjErr'); const fail = m => { err.textContent = m; return false; };
        if (picked.length === 0) return fail('⚠ กรุณาเลือกหัวข้อที่ต้องแก้ไขอย่างน้อย 1 ข้อ');
        if (clean.length < 10) return fail('⚠ กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร');
        if (letters < 6) return fail('⚠ กรุณากรอกรายละเอียดที่เป็นข้อความ');
        if (/(.)\1{4,}/.test(clean)) return fail('⚠ พบการพิมพ์ซ้ำผิดปกติ');
        return { issues: picked, detail };
      }
    }).then(r => {
      if (!r.isConfirmed) return;
      const reasonText = '[ปุ่มไม่ถูกต้อง: ' + badNames.join(' · ') + ' | ' + r.value.issues.join(' · ') + ']\n' + r.value.detail;
      Swal.fire({ title: 'กำลังส่งกลับ IT...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ส่งกลับ IT เรียบร้อย', timer: 1500, showConfirmButton: false }).then(() => { optExpanded = null; window.loadOpTasks(); })).setOpStatus(campaign, 'REJECTED', reasonText);
    });
  };

  window.optStores = function (rowIdx) {
    const stores = optStoreCache[rowIdx] || [];
    const rows = stores.length ? stores.map(s => `<tr><td class="fw-bold text-success">${s.id}</td><td class="text-start ps-3">${s.nameEn}</td><td class="text-start ps-3">${s.nameTh}</td></tr>`).join('') : '<tr><td colspan="3" class="text-center py-3 text-muted">ทุกสาขา / ไม่มีข้อมูล</td></tr>';
    Swal.fire({ title: '<i class="fas fa-store me-2 text-dark"></i> Participating Stores', html: `<div class="table-responsive" style="max-height:440px;overflow:auto;border:1px solid #dee2e6;border-radius:8px;"><table class="table table-sm table-striped table-hover align-middle mb-0" style="font-size:14px;"><thead class="table-dark" style="position:sticky;top:0;"><tr><th>ID</th><th>Name EN</th><th>Name TH</th></tr></thead><tbody>${rows}</tbody></table></div>`, width: '780px', confirmButtonColor: '#1a1d20', confirmButtonText: 'OK' });
  };

  window.optDetail = function (rowIdx) {
    const c = (window.__optDetailCache || {})[rowIdx] || {};
    const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    let htmlBody = '';
    if (c.list && c.list.length) {
      // per-button — โชว์รายละเอียด+เงื่อนไขครบทุกปุ่ม (ตรงกับหน้า MKT)
      htmlBody = c.list.map(function (b) {
        const d = b.detail ? esc(b.detail).replace(/\n/g, '<br>') : '<span class="text-muted">-</span>';
        const cc = b.condition ? esc(b.condition).replace(/\n/g, '<br>') : '<span class="text-muted">-</span>';
        return '<div class="text-start p-3 border rounded mb-2 bg-light">'
          + '<div class="fw-bold text-success small mb-2"><i class="fas fa-hand-pointer me-1"></i>' + esc(b.sn) + '</div>'
          + '<div class="mb-2"><label class="fw-bold text-primary small"><i class="fas fa-clipboard-list me-1"></i> รายละเอียดโปรโมชั่น:</label><div style="white-space:pre-wrap;font-size:13px;">' + d + '</div></div>'
          + '<div><label class="fw-bold text-warning small"><i class="fas fa-list-ul me-1"></i> เงื่อนไข:</label><div style="white-space:pre-wrap;font-size:13px;">' + cc + '</div></div>'
          + '</div>';
      }).join('');
    } else {
      const det = c.det || '-', cond = c.cond || '-';
      htmlBody = '<div class="text-start p-3 border rounded mb-2 bg-light"><label class="fw-bold text-primary small">รายละเอียด:</label><div style="white-space:pre-wrap;font-size:13px;">' + det + '</div></div><div class="text-start p-3 border rounded bg-light"><label class="fw-bold text-warning small">เงื่อนไข:</label><div style="white-space:pre-wrap;font-size:13px;">' + cond + '</div></div>';
    }
    Swal.fire({ title: '<i class="fas fa-info-circle me-2"></i> รายละเอียด & เงื่อนไข', html: '<div style="max-height:65vh;overflow:auto;">' + htmlBody + '</div>', width: '600px', confirmButtonColor: '#1a1d20' });
  };

  window.optShowReject = function (rowIdx) {
    const c = (optData || []).find(x => String(x.rowIdx) === String(rowIdx));
    const reason = c ? (c.rejectReason || '-') : '-';
    const safe = String(reason).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    Swal.fire({ icon: 'warning', title: 'เหตุผลที่ตีกลับ', html: `<div class="text-start p-3 border rounded bg-light" style="white-space:pre-wrap;font-size:13px;">${safe}</div>`, width: '520px', confirmButtonColor: '#dc3545', confirmButtonText: 'ปิด' });
  };

  window.optVerify = function (name) {
    Swal.fire({ title: 'ยืนยันว่าปุ่มถูกต้อง?', html: `<b>${name}</b><br><span class="text-muted small">เมื่อยืนยันแล้ว รายละเอียดจะถูกส่งไปแสดงให้สาขาเห็น</span>`, icon: 'question', showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'ยืนยันถูกต้อง', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() }); google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ตรวจสอบถูกต้องแล้ว!', text: 'ส่งให้สาขาเรียบร้อย', timer: 1500, showConfirmButton: false }).then(() => window.loadOpTasks())).setOpStatus(name, 'CONFIRMED', ''); });
  };

  window.optReject = function (name) {
    const issues = [
      'ชื่อปุ่มผิด',
      'ตัวย่อสินค้าผิด',
      'สินค้าไม่ถูกต้อง',
      'ตัวเลือกผงสินค้าไม่ถูกต้อง',
      'กดปุ่มไม่ลดราคา',
      'ปุ่มลดราคาไม่ถูกต้อง',
      'อื่นๆ',
    ];
    const checks = issues.map((t, i) =>
      `<label class="d-flex align-items-center gap-2 p-2 border rounded-2 mb-1" style="cursor:pointer;">
         <input type="checkbox" class="form-check-input m-0 rj-issue" value="${t}" ${t === 'อื่นๆ' ? 'data-other="1"' : ''}>
         <span class="small fw-bold">${t}</span>
       </label>`).join('');
    Swal.fire({
      title: 'ตีกลับเพื่อแก้ไข',
      width: '560px',
      html: `
        <div class="text-start">
          <div class="fw-bold small text-muted mb-2"><i class="fas fa-list-check me-1"></i>เลือกหัวข้อที่ต้องแก้ไข (เลือกได้หลายข้อ)</div>
          ${checks}
          <div class="fw-bold small text-muted mt-3 mb-1"><i class="fas fa-pen me-1"></i>รายละเอียดเพิ่มเติม <span class="text-danger">*</span></div>
          <textarea id="rjDetail" class="form-control" rows="3" placeholder="อธิบายสิ่งที่ต้องแก้ไขให้ชัดเจน เช่น ปุ่มที่ 2 ราคาควรเป็น 139 ไม่ใช่ 149"></textarea>
          <div id="rjErr" class="text-danger small fw-bold mt-2" style="min-height:18px;"></div>
        </div>`,
      showCancelButton: true, confirmButtonColor: '#dc3545',
      confirmButtonText: 'ยืนยันตีกลับ', cancelButtonText: 'ยกเลิก',
      didOpen: () => {
        const otherCb = document.querySelector('.rj-issue[data-other="1"]');
        const detail = document.getElementById('rjDetail');
        if (otherCb) otherCb.addEventListener('change', () => { if (otherCb.checked) detail.focus(); });
      },
      preConfirm: () => {
        const picked = [...document.querySelectorAll('.rj-issue:checked')].map(c => c.value);
        const detail = (document.getElementById('rjDetail').value || '').trim();
        const err = document.getElementById('rjErr');
        const fail = (m) => { err.textContent = m; return false; };

        if (picked.length === 0) return fail('⚠ กรุณาเลือกหัวข้อที่ต้องแก้ไขอย่างน้อย 1 ข้อ');
        if (!detail) return fail('⚠ กรุณากรอกรายละเอียดเพิ่มเติม');

        // anti-garbage validation
        const clean = detail.replace(/\s+/g, ' ');
        const letters = (clean.match(/[ก-๙a-zA-Z0-9]/g) || []).length;
        if (clean.length < 10) return fail('⚠ รายละเอียดสั้นเกินไป กรุณาอธิบายให้ชัดเจน (อย่างน้อย 10 ตัวอักษร)');
        if (letters < 6) return fail('⚠ กรุณากรอกรายละเอียดที่เป็นข้อความ ไม่ใช่สัญลักษณ์');
        if (/(.)\1{4,}/.test(clean)) return fail('⚠ พบการพิมพ์ตัวอักษรซ้ำผิดปกติ กรุณากรอกใหม่');
        if (/^(.)(\1| )*$/.test(clean)) return fail('⚠ กรุณากรอกรายละเอียดที่มีความหมาย');
        const distinct = new Set(clean.replace(/\s/g, '').split('')).size;
        if (distinct < 4) return fail('⚠ รายละเอียดไม่สมบูรณ์ กรุณาอธิบายเพิ่มเติม');

        return { issues: picked, detail };
      }
    }).then(r => {
      if (!r.isConfirmed) return;
      const reasonText = '[' + r.value.issues.join(' · ') + ']\n' + r.value.detail;
      Swal.fire({ title: 'กำลังส่งกลับ IT...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      google.script.run.withSuccessHandler(() =>
        Swal.fire({ icon: 'success', title: 'ตีกลับเรียบร้อย', text: 'ส่งงานกลับไปที่ IT แล้ว', timer: 1500, showConfirmButton: false }).then(() => window.loadOpTasks())
      ).setOpStatus(name, 'REJECTED', reasonText);
    });
  };

  /* ===== NPD review tab ===== */
  var npdOpData = [];
  var npdOpFilter = 'PENDING';

  window.loadNpdOp = function () {
    google.script.run.withSuccessHandler(function (data) { npdOpData = data || []; window.renderNpdOp(); })
      .withFailureHandler(e => console.error(e)).getNPDList();
  };

  window.npdOpSetFilter = function (btn, val) {
    npdOpFilter = val;
    document.querySelectorAll('#npdOpFilter button').forEach(b => { b.classList.remove('active', 'btn-success'); b.classList.add('btn-outline-secondary'); });
    btn.classList.add('active', 'btn-success'); btn.classList.remove('btn-outline-secondary');
    window.renderNpdOp();
  };

  window.renderNpdOp = function () {
    const search = (document.getElementById('npdOpSearch')?.value || '').toLowerCase();
    let rows = npdOpData.slice();
    if (npdOpFilter !== 'ALL') rows = rows.filter(n => (n.status || 'PENDING') === npdOpFilter);
    if (search) rows = rows.filter(n => (n.project || '').toLowerCase().includes(search) || (n.items || []).some(i => (i.name || '').toLowerCase().includes(search)));

    window.renderNpdOpSummary({
      pending: npdOpData.filter(n => (n.status || 'PENDING') === 'PENDING').length,
      confirmed: npdOpData.filter(n => n.status === 'CONFIRMED').length,
      total: npdOpData.length
    });

    const tbody = document.getElementById('npdOpBody');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="py-5 text-muted">ไม่มีรายการในสถานะนี้</td></tr>'; return; }
    tbody.innerHTML = rows.map((n, idx) => {
      const st = n.status || 'PENDING';
      const stCls = st === 'CONFIRMED' ? 'bg-success text-white' : (st === 'REJECTED' ? 'bg-danger text-white' : 'bg-warning text-dark');
      const itemNames = (n.items || []).map(i => i.name).join(', ');
      return `
        <tr>
          <td class="text-start ps-3"><div class="fw-bold">${n.id}</div><small class="text-muted">${n.project || ''}</small></td>
          <td class="text-start"><span class="badge bg-light text-dark border">${(n.items || []).length} รายการ</span> <small class="text-muted d-block">${itemNames}</small></td>
          <td class="small">${window.PCfmt ? PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end) : (n.start || '') + ' – ' + (n.end || '')}</td>
          <td class="small">${(n.channels || []).join(', ') || '-'}</td>
          <td><span class="status-badge ${stCls}">${st}</span>${st === 'REJECTED' && n.rejectReason ? `<button class="btn btn-sm btn-link text-danger p-0 d-block mx-auto" style="font-size:.65rem;" onclick="window.optShowReject('${(n.rejectReason||'').replace(/'/g, "\\'")}')"><i class="fas fa-circle-info me-1"></i>ดูเหตุผล</button>` : ''}</td>
          <td>
            <button class="btn-circle btn-light border shadow-sm text-primary" title="ดูรายละเอียด" onclick="window.npdOpView('${n.id}')"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-success fw-bold" ${st === 'CONFIRMED' ? 'disabled' : ''} onclick="window.npdOpVerify('${n.id}')"><i class="fas fa-check"></i> ตรวจสอบถูกต้อง</button>
            <button class="btn btn-sm btn-outline-danger fw-bold" ${st === 'REJECTED' ? 'disabled' : ''} onclick="window.npdOpReject('${n.id}')"><i class="fas fa-rotate-left"></i> ตีกลับ</button>
          </td>
        </tr>`;
    }).join('');
  };

  window.renderNpdOpSummary = function (c) {
    const items = [
      { t: 'รอตรวจสอบ', v: c.pending, cls: 'bg-warning text-dark', i: 'fa-clock' },
      { t: 'ยืนยันแล้ว', v: c.confirmed, cls: 'bg-success text-white', i: 'fa-circle-check' },
      { t: 'ทั้งหมด', v: c.total, cls: 'bg-dark text-white', i: 'fa-flask' },
    ];
    document.getElementById('npdOpSummary').innerHTML = items.map(it => `
      <div class="col-md-4 mb-2"><div class="card shadow-sm border-0 ${it.cls}"><div class="card-body p-3 d-flex justify-content-between align-items-center">
        <div><small class="fw-bold opacity-75 d-block text-uppercase" style="font-size:.7rem;">${it.t}</small><h3 class="fw-bold m-0">${it.v}</h3></div>
        <i class="fas ${it.i} fa-2x opacity-25"></i></div></div></div>`).join('');
  };

  window.npdOpView = function (id) {
    const n = npdOpData.find(x => x.id === id);
    if (!n) return;
    var det = document.getElementById('npdOpDetail'), list = document.getElementById('npdOpList');
    if (det && window.PC_NpdView) {
      det.innerHTML = window.PC_NpdView.render(n, { back: 'window.npdOpBackToList()' });
      if (list) list.style.display = 'none';
      det.style.display = 'block';
      try { det.scrollIntoView({ block: 'start' }); } catch (e) {}
      return;
    }
    if (det && window.npdFullViewOp) {
      det.innerHTML = window.npdFullViewOp(n);
      if (list) list.style.display = 'none';
      det.style.display = 'block';
      try { det.scrollIntoView({ block: 'start' }); } catch (e) {}
      return;
    }
    Swal.fire({
      title: `<span class="text-success">${n.id}</span><div class="small text-muted">${n.project || ''}</div>`,
      html: `<div class="text-start">
        <div class="small mb-2"><b>ช่วงเวลา:</b> ${window.PCfmt ? PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end) : n.start + ' – ' + n.end}<br><b>สาขาที่ร่วม:</b> ${(n.store || '-')}${n.rd ? '<br><b>RD ผู้แจ้ง:</b> ' + n.rd : ''}${n.remark ? '<br><b>Remark:</b> ' + n.remark : ''}</div>
        ${window.npdDetailHTMLOp(n)}
      </div>`,
      width: '760px', confirmButtonColor: '#1a1d20', confirmButtonText: 'ปิด'
    });
  };
  window.npdOpBackToList = function () {
    var det = document.getElementById('npdOpDetail'), list = document.getElementById('npdOpList');
    if (det) { det.style.display = 'none'; det.innerHTML = ''; }
    if (list) list.style.display = '';
  };

  /* ===== shared NPD detail renderer (latest model: central Subset pool + products) ===== */
  function npdOpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;'); }
  window.npdDetailHTMLOp = function (n) {
    var esc = npdOpEsc;
    var DLV = ['Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'Gokoo'];
    var subsets = (n.subsets || []).map(function (s) {
      var pw = (s.powders || []).map(function (w, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(w.cmpos || '—') + '</td><td class="text-start">' + esc(w.eng || '-') + '</td><td class="text-start">' + esc(w.th || '') + '</td><td class="mono">' + esc(w.code || '') + '</td><td class="text-start">' + esc(w.desc || '') + '</td><td>' + esc(w.qty || '') + '</td><td>' + esc(w.unit || '') + '</td><td class="small">' + esc(w.spoon || '') + '</td><td>' + ((+w.price > 0) ? '+฿' + (+w.price) : '-') + '</td></tr>';
      }).join('');
      return '<div class="border rounded-3 p-2 mb-2" style="background:#fffdf4;border-color:#e3d27e!important">' +
        '<div class="fw-bold mb-1"><i class="fas fa-mortar-pestle me-1 text-warning"></i>' + esc(s.name || 'Subset') + (s.ssCode ? ' <span class="badge bg-dark">' + esc(s.ssCode) + '</span>' : '') + (s.name2 ? ' <span class="text-muted small">· ' + esc(s.name2) + '</span>' : '') + (s.cat ? ' <span class="text-muted small">· ' + esc(s.cat) + '</span>' : '') + '</div>' +
        '<table class="table table-sm table-bordered mb-0" style="font-size:11px"><thead class="table-light"><tr><th>No</th><th>CMPOS</th><th>ENG</th><th>TH</th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon</th><th>Price</th></tr></thead><tbody>' + (pw || '<tr><td colspan="10" class="text-muted">ไม่มีผง</td></tr>') + '</tbody></table></div>';
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
      var fml = (it.formulas || []).map(function (f) { var mn = (f.chooseMin != null && f.chooseMin !== '') ? f.chooseMin : f.choose; var mx = (f.chooseMax != null && f.chooseMax !== '') ? f.chooseMax : f.choose; var rng = (mn && mx && String(mn) !== String(mx)) ? (esc(mn) + '–' + esc(mx)) : esc(mx || mn || f.choose || '1'); return '<li>เลือกได้ <b>' + rng + '</b> ผง จาก <b>' + esc(f.ss || f.subName || '-') + '</b></li>'; }).join('') || '<li class="text-muted">ไม่มีสูตรผง</li>';
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

  /* ===== NPD full-page read-only view (แยกหน้า · เหมือนฟอร์ม RD · แก้ไขไม่ได้) ===== */
  window.npdFullViewOp = function (n) {
    var esc = npdOpEsc;
    var D = function (v) { return window.PCfmt ? PCfmt.date(v) : (v || '-'); };
    var fld = function (label, val) { return '<div class="col-md-3"><label class="small fw-bold text-uppercase text-muted mb-1">' + label + '</label><div class="form-control form-control-sm bg-light" style="cursor:default">' + esc(val || '-') + '</div></div>'; };
    var head = '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">' +
      '<button class="btn btn-outline-dark fw-bold" onclick="window.npdOpBackToList()"><i class="fas fa-arrow-left me-1"></i>ย้อนกลับ</button>' +
      '<span class="fw-bold">' + esc(n.id) + ' · ' + esc(n.project || '') + '</span>' +
      '<span class="badge bg-secondary"><i class="fas fa-eye me-1"></i>ดูอย่างเดียว · แก้ไขไม่ได้</span></div>';
    var info = '<div class="bg-white rounded-3 shadow-sm border mb-3"><div class="px-3 py-2 fw-bold text-white" style="background:#1a1d20;border-radius:8px 8px 0 0;font-size:.8rem"><i class="fas fa-circle-info me-2 text-warning"></i>ข้อมูลทั่วไป</div><div class="p-3"><div class="row g-2">' +
      fld('Project', n.project) + fld('เริ่ม', D(n.start)) + fld('สิ้นสุด', D(n.end)) + fld('RD ผู้แจ้ง', n.rd) +
      '<div class="col-md-8"><label class="small fw-bold text-uppercase text-muted mb-1">สาขาที่ร่วม</label><div class="form-control form-control-sm bg-light">' + esc(n.store || 'ALL') + '</div></div>' +
      fld('หมวดสินค้า', n.category) + (n.remark ? '<div class="col-md-12"><label class="small fw-bold text-uppercase text-muted mb-1">Remark</label><div class="form-control form-control-sm bg-light">' + esc(n.remark) + '</div></div>' : '') +
      '</div></div></div>';
    return '<div class="p-1">' + head + info + window.npdDetailHTMLOp(n) + '</div>';
  };

  window.npdOpVerify = function (id) {
    Swal.fire({ title: 'ยืนยันว่าข้อมูลถูกต้อง?', icon: 'question', showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'ยืนยันถูกต้อง', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ยืนยันแล้ว!', timer: 1400, showConfirmButton: false }).then(() => window.loadNpdOp())).setNpdStatus(id, 'CONFIRMED', ''); });
  };

  window.npdOpReject = function (id) {
    const issues = ['ชื่อสินค้า/POS Name ผิด', 'ราคาขายไม่ถูกต้อง', 'สูตร/ส่วนผสมไม่ถูกต้อง', 'หมวดสินค้าไม่ถูกต้อง', 'ข้อมูลไม่ครบ', 'อื่นๆ'];
    const checks = issues.map(t => `<label class="d-flex align-items-center gap-2 p-2 border rounded-2 mb-1" style="cursor:pointer;"><input type="checkbox" class="form-check-input m-0 rj-issue" value="${t}"><span class="small fw-bold">${t}</span></label>`).join('');
    Swal.fire({
      title: 'ตีกลับเพื่อแก้ไข', width: '560px',
      html: `<div class="text-start"><div class="fw-bold small text-muted mb-2"><i class="fas fa-list-check me-1"></i>เลือกหัวข้อที่ต้องแก้ไข</div>${checks}<div class="fw-bold small text-muted mt-3 mb-1"><i class="fas fa-pen me-1"></i>รายละเอียด <span class="text-danger">*</span></div><textarea id="rjDetail" class="form-control" rows="3" placeholder="อธิบายสิ่งที่ต้องแก้ไขให้ชัดเจน"></textarea><div id="rjErr" class="text-danger small fw-bold mt-2" style="min-height:18px;"></div></div>`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'ยืนยันตีกลับ', cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const picked = [...document.querySelectorAll('.rj-issue:checked')].map(c => c.value);
        const detail = (document.getElementById('rjDetail').value || '').trim();
        const err = document.getElementById('rjErr'); const fail = m => { err.textContent = m; return false; };
        if (!picked.length) return fail('⚠ กรุณาเลือกหัวข้ออย่างน้อย 1 ข้อ');
        const clean = detail.replace(/\s+/g, ' ');
        const letters = (clean.match(/[ก-๙a-zA-Z0-9]/g) || []).length;
        if (clean.length < 10) return fail('⚠ รายละเอียดสั้นเกินไป (อย่างน้อย 10 ตัวอักษร)');
        if (letters < 6) return fail('⚠ กรุณากรอกรายละเอียดที่เป็นข้อความ');
        if (/(.)\1{4,}/.test(clean)) return fail('⚠ พบการพิมพ์ตัวอักษรซ้ำผิดปกติ');
        if (new Set(clean.replace(/\s/g, '').split('')).size < 4) return fail('⚠ รายละเอียดไม่สมบูรณ์');
        return { issues: picked, detail };
      }
    }).then(r => {
      if (!r.isConfirmed) return;
      const reasonText = '[' + r.value.issues.join(' · ') + ']\n' + r.value.detail;
      google.script.run.withSuccessHandler(() => Swal.fire({ icon: 'success', title: 'ตีกลับเรียบร้อย', timer: 1400, showConfirmButton: false }).then(() => window.loadNpdOp())).setNpdStatus(id, 'REJECTED', reasonText);
    });
  };

  /* ===== Flavor (ผงรสชาติ) review tab — OP ตรวจสอบ/ตีกลับ (getFlavorList + setFlavorStatus) ===== */
  function flvOpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;'); }
  var flavorOpData = [];
  var flavorOpFilter = 'PENDING';
  window.loadFlavorOp = function () {
    google.script.run.withSuccessHandler(function (data) { flavorOpData = data || []; window.renderFlavorOp(); })
      .withFailureHandler(function (e) { console.error(e); }).getFlavorList();
  };
  window.flvOpSetFilter = function (btn, val) {
    flavorOpFilter = val;
    document.querySelectorAll('#flvOpFilter button').forEach(function (b) { b.classList.remove('active', 'btn-success'); b.classList.add('btn-outline-secondary'); });
    btn.classList.add('active', 'btn-success'); btn.classList.remove('btn-outline-secondary');
    window.renderFlavorOp();
  };
  window.renderFlavorOp = function () {
    var search = ((document.getElementById('flvOpSearch') || {}).value || '').toLowerCase();
    var rows = flavorOpData.slice();
    if (flavorOpFilter !== 'ALL') rows = rows.filter(function (n) { return (n.status || 'PENDING') === flavorOpFilter; });
    if (search) rows = rows.filter(function (n) { return (n.project || '').toLowerCase().indexOf(search) >= 0 || (n.groups || []).some(function (g) { return (g.flavors || []).some(function (w) { return (w.eng || '').toLowerCase().indexOf(search) >= 0; }); }); });
    window.renderFlvOpSummary({
      pending: flavorOpData.filter(function (n) { return (n.status || 'PENDING') === 'PENDING'; }).length,
      confirmed: flavorOpData.filter(function (n) { return n.status === 'CONFIRMED'; }).length,
      total: flavorOpData.length
    });
    var tbody = document.getElementById('flvOpBody');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="py-5 text-muted">ไม่มีรายการในสถานะนี้</td></tr>'; return; }
    tbody.innerHTML = rows.map(function (n) {
      var st = n.status || 'PENDING';
      var stCls = st === 'CONFIRMED' ? 'bg-success text-white' : (st === 'REJECTED' ? 'bg-danger text-white' : 'bg-warning text-dark');
      var itDone = (n.itStatus || '') === 'COMPLETE';
      var itBadge = itDone ? '<span class="status-badge bg-success text-white">IT เสร็จ</span>' : '<span class="status-badge bg-warning text-dark">รอ IT</span>';
      var nPow = (n.groups || []).reduce(function (a, g) { return a + (g.flavors || []).length; }, 0);
      var range = window.PCfmt ? (PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end)) : ((n.start || '') + ' – ' + (n.end || ''));
      return '<tr>' +
        '<td class="text-start ps-3"><div class="fw-bold">' + flvOpEsc(n.id) + '</div><small class="text-muted">' + flvOpEsc(n.project || '') + '</small></td>' +
        '<td class="text-start"><span class="badge bg-light text-dark border">' + nPow + ' ผง</span></td>' +
        '<td class="small">' + range + '</td>' +
        '<td>' + itBadge + '</td>' +
        '<td><span class="status-badge ' + stCls + '">' + st + '</span>' + (st === 'REJECTED' && n.rejectReason ? '<button class="btn btn-sm btn-link text-danger p-0 d-block mx-auto" style="font-size:.65rem;" onclick="window.optShowReject(\'' + String(n.rejectReason || '').replace(/'/g, "\\'") + '\')"><i class="fas fa-circle-info me-1"></i>ดูเหตุผล</button>' : '') + '</td>' +
        '<td>' +
          '<button class="btn-circle btn-light border shadow-sm text-primary" title="ดูรายละเอียด" onclick="window.flavorOpView(\'' + n.id + '\')"><i class="fas fa-eye"></i></button> ' +
          '<button class="btn btn-sm btn-success fw-bold" ' + ((st === 'CONFIRMED' || !itDone) ? 'disabled' : '') + ' title="' + (itDone ? '' : 'รอ IT ตั้งค่าก่อน') + '" onclick="window.flavorOpVerify(\'' + n.id + '\')"><i class="fas fa-check"></i> ตรวจสอบถูกต้อง</button> ' +
          '<button class="btn btn-sm btn-outline-danger fw-bold" ' + (st === 'REJECTED' ? 'disabled' : '') + ' onclick="window.flavorOpReject(\'' + n.id + '\')"><i class="fas fa-rotate-left"></i> ตีกลับ</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  };
  window.renderFlvOpSummary = function (c) {
    var items = [
      { t: 'รอตรวจสอบ', v: c.pending, cls: 'bg-warning text-dark', i: 'fa-clock' },
      { t: 'ยืนยันแล้ว', v: c.confirmed, cls: 'bg-success text-white', i: 'fa-circle-check' },
      { t: 'ทั้งหมด', v: c.total, cls: 'bg-dark text-white', i: 'fa-mortar-pestle' }
    ];
    document.getElementById('flvOpSummary').innerHTML = items.map(function (it) { return '<div class="col-md-4 mb-2"><div class="card shadow-sm border-0 ' + it.cls + '"><div class="card-body p-3 d-flex justify-content-between align-items-center"><div><small class="fw-bold opacity-75 d-block text-uppercase" style="font-size:.7rem;">' + it.t + '</small><h3 class="fw-bold m-0">' + it.v + '</h3></div><i class="fas ' + it.i + ' fa-2x opacity-25"></i></div></div></div>'; }).join('');
  };
  window.flvDetailHTMLOp = function (n) {
    var esc = flvOpEsc;
    return (n.groups || []).map(function (g) {
      var pw = (g.flavors || []).map(function (w, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(w.cmpos || '—') + '</td><td class="text-start">' + esc(w.eng || '-') + '</td><td class="text-start">' + esc(w.th || '') + '</td><td class="mono">' + esc(w.code || '') + '</td><td class="text-start">' + esc(w.desc || '') + '</td><td>' + esc(w.qty || '') + '</td><td>' + esc(w.unit || '') + '</td><td class="small">' + esc(w.spoon || '') + '</td><td>' + ((+w.price > 0) ? '+฿' + (+w.price) : '-') + '</td></tr>';
      }).join('');
      return '<div class="border rounded-3 p-2 mb-2" style="background:#fffdf4;border-color:#e3d27e!important">' +
        '<div class="fw-bold mb-1"><i class="fas fa-mortar-pestle me-1 text-warning"></i>' + esc(g.name || 'Subset') + (g.ssCode ? ' <span class="badge bg-dark">' + esc(g.ssCode) + '</span>' : '') + '</div>' +
        '<table class="table table-sm table-bordered mb-0" style="font-size:11px"><thead class="table-light"><tr><th>No</th><th>CMPOS</th><th>ENG</th><th>TH</th><th>Code RM</th><th>Description</th><th>Qty</th><th>Unit</th><th>Spoon</th><th>Price</th></tr></thead><tbody>' + (pw || '<tr><td colspan="10" class="text-muted">ไม่มีผง</td></tr>') + '</tbody></table></div>';
    }).join('') || '<div class="text-muted small mb-2">— ไม่มีกลุ่มผง —</div>';
  };
  window.flavorOpView = function (id) {
    var n = flavorOpData.find(function (x) { return x.id === id; });
    if (!n) return;
    var range = window.PCfmt ? (PCfmt.date(n.start) + ' – ' + PCfmt.date(n.end)) : ((n.start || '') + ' – ' + (n.end || ''));
    Swal.fire({
      title: '<span class="text-success">' + flvOpEsc(n.id) + '</span><div class="small text-muted">' + flvOpEsc(n.project || '') + '</div>',
      html: '<div class="text-start"><div class="small mb-2"><b>ช่วงเวลา:</b> ' + range + (n.rd ? '<br><b>RD ผู้แจ้ง:</b> ' + flvOpEsc(n.rd) : '') + (n.remark ? '<br><b>Remark:</b> ' + flvOpEsc(n.remark) : '') + '</div>' + window.flvDetailHTMLOp(n) + '</div>',
      width: '760px', confirmButtonColor: '#1a1d20', confirmButtonText: 'ปิด'
    });
  };
  window.flavorOpVerify = function (id) {
    Swal.fire({ title: 'ยืนยันว่าผงถูกต้อง?', icon: 'question', showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'ยืนยันถูกต้อง', cancelButtonText: 'ยกเลิก' })
      .then(function (r) { if (!r.isConfirmed) return; google.script.run.withSuccessHandler(function () { Swal.fire({ icon: 'success', title: 'ยืนยันแล้ว!', timer: 1400, showConfirmButton: false }).then(function () { window.loadFlavorOp(); }); }).setFlavorStatus(id, 'CONFIRMED', ''); });
  };
  window.flavorOpReject = function (id) {
    var issues = ['ชื่อผง/POS Name ผิด', 'Code RM/ส่วนผสมไม่ถูกต้อง', 'Qty/Unit ไม่ถูกต้อง', 'ราคา (Price) ไม่ถูกต้อง', 'ข้อมูลไม่ครบ', 'อื่นๆ'];
    var checks = issues.map(function (t) { return '<label class="d-flex align-items-center gap-2 p-2 border rounded-2 mb-1" style="cursor:pointer;"><input type="checkbox" class="form-check-input m-0 rj-issue" value="' + t + '"><span class="small fw-bold">' + t + '</span></label>'; }).join('');
    Swal.fire({
      title: 'ตีกลับเพื่อแก้ไข', width: '560px',
      html: '<div class="text-start"><div class="fw-bold small text-muted mb-2"><i class="fas fa-list-check me-1"></i>เลือกหัวข้อที่ต้องแก้</div>' + checks + '<div class="fw-bold small text-muted mt-3 mb-1"><i class="fas fa-pen me-1"></i>รายละเอียด <span class="text-danger">*</span></div><textarea id="rjDetail" class="form-control" rows="3" placeholder="อธิบายสิ่งที่ต้องแก้ไขให้ชัดเจน"></textarea><div id="rjErr" class="text-danger small fw-bold mt-2" style="min-height:18px;"></div></div>',
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'ยืนยันตีกลับ', cancelButtonText: 'ยกเลิก',
      preConfirm: function () {
        var picked = [].slice.call(document.querySelectorAll('.rj-issue:checked')).map(function (c) { return c.value; });
        var detail = (document.getElementById('rjDetail').value || '').trim();
        var err = document.getElementById('rjErr'); var fail = function (m) { err.textContent = m; return false; };
        if (!picked.length) return fail('⚠ กรุณาเลือกหัวข้ออย่างน้อย 1 ข้อ');
        var clean = detail.replace(/\s+/g, ' ');
        var letters = (clean.match(/[ก-๎a-zA-Z0-9]/g) || []).length;
        if (clean.length < 10) return fail('⚠ รายละเอียดสั้นเกินไป (อย่างน้อย 10 ตัวอักษร)');
        if (letters < 6) return fail('⚠ กรุณากรอกรายละเอียดที่เป็นข้อความ');
        return { issues: picked, detail: detail };
      }
    }).then(function (r) {
      if (!r.isConfirmed) return;
      var reasonText = '[' + r.value.issues.join(' · ') + ']\n' + r.value.detail;
      google.script.run.withSuccessHandler(function () { Swal.fire({ icon: 'success', title: 'ตีกลับเรียบร้อย', timer: 1400, showConfirmButton: false }).then(function () { window.loadFlavorOp(); }); }).setFlavorStatus(id, 'REJECTED', reasonText);
    });
  };


  /* self-init: external file may load after shell init call.
     FIX: ไม่ให้ boot-time init (ตอนแอปโหลด ยังไม่มี DOM หน้า Op) ไป arm ตัว dedup
     จนบล็อกการโหลดจริงตอน navigate เข้าหน้า → ตารางว่างต้องกด Refresh
       · dedup เฉพาะเมื่อ "ตารางถูก render แล้ว" (optBody มีแถว) — ถ้ายังว่าง โหลดเสมอ
       · boot self-init รันเฉพาะเมื่อหน้า Op อยู่ใน DOM จริง */
  window.initOp_Tracking = (function(orig){ return function(){
    var now=Date.now();
    var _b=document.getElementById('optBody'); var painted=!!(_b && _b.children.length);
    if (painted && window.__optLastInit && (now-window.__optLastInit)<1500) return;
    window.__optLastInit=now; return orig.apply(this, arguments);
  }; })(window.initOp_Tracking);
  if (document.getElementById('optBody') || document.getElementById('optMonth')) { try{ window.initOp_Tracking(); }catch(e){ console.error("[op self-init]", e); } }
})();
