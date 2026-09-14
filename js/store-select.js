/* =====================================================================
   StoreSelect — shared store-selection component (NPD-style "Add Shop")
   ใช้ร่วมทุกฟอร์ม (NPD / Proposal / Voucher / Coupon / BillDiscount)

   Behavior (เหมือนหน้า NPD):
   - Modal: Type selector (Shop Group / Class / Type / Master) เปลี่ยนหัวตาราง
            Code/Des1/Des2 + Search + ติ๊ก All + CLEAR ALL + APPLY
   - Field: โชว์เฉพาะหัวข้อ (Type) ที่เลือก + จำนวนสาขารวม (ไม่ล้น)
   - ปุ่ม "ดูรายละเอียด": popup แยกตาม Type โชว์ชื่อสาขาเต็ม
   - ปุ่มลบราย Type + ล้างทั้งหมด

   Usage:
     var inst = StoreSelect.create({
       fieldEl, hiddenEl,           // DOM nodes
       getBranches: () => [...],    // [{id,name,nameTH,type,group,class}]
       onChange: (ids) => {}        // optional
     });
     inst.openModal();  inst.setIds([...]);  inst.getIds();
   Hidden input value = comma-joined branch IDs (back-compat).
   ===================================================================== */
window.StoreSelect = (function () {
  "use strict";
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  var TYPES = ['Shop Group', 'Shop Class', 'Shop Type', 'Shop Master'];
  var TYPE_KEY = { 'Shop Group': 'group', 'Shop Class': 'class', 'Shop Type': 'type', 'Shop Master': 'master' };
  var TYPE_COL = { 'Shop Group': 'Group', 'Shop Class': 'Class', 'Shop Type': 'Type', 'Shop Master': 'Branch' };

  var modalEl = null, active = null, stTmp = [];

  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'ssStoreModal';
    modalEl.tabIndex = -1;
    modalEl.innerHTML =
      '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style="max-width:560px"><div class="modal-content" style="border:none;border-radius:14px;overflow:hidden;">' +
      '<div class="modal-header text-white" style="background:#1a1d20;"><h5 class="modal-title fw-bold"><i class="fas fa-store text-warning me-2"></i>SELECT STORES</h5>' +
      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body" style="background:#f4f6f9;">' +
      '<div class="p-3 mb-3 rounded-3" style="background:#fff;border:1px solid #e6e9ee;"><div class="d-flex align-items-end gap-2" style="max-width:520px">' +
      '<div class="flex-grow-1"><label class="fw-bold text-uppercase" style="font-size:.7rem;color:#888">Type</label>' +
      '<select id="ssType" class="form-select form-select-sm border-dark fw-bold">' + TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
      '</div></div>' +
      '<div class="d-flex justify-content-between align-items-center mb-2 gap-2">' +
      '<div class="input-group input-group-sm" style="max-width:340px"><span class="input-group-text">Search:</span><input id="ssSearch" type="text" class="form-control"></div>' +
      '<span id="ssCount" class="badge bg-dark px-3 py-2">เลือก 0 เงื่อนไข · 0 สาขา</span></div>' +
      '<div class="bg-white rounded-3 border" style="overflow:hidden;"><div style="max-height:340px;overflow:auto;">' +
      '<table class="table table-sm table-hover align-middle m-0" style="font-size:.85rem;width:auto;margin:0 auto">' +
      '<thead style="position:sticky;top:0;z-index:1;background:#1a1d20;color:#fff;border-bottom:2px solid #2e934a;"><tr>' +
      '<th style="width:54px" class="text-center"><label class="d-inline-flex align-items-center gap-1" style="cursor:pointer;font-size:.66rem;font-weight:700" title="เลือกทั้งหมดที่แสดง"><input type="checkbox" id="ssAll" class="form-check-input m-0">All</label></th>' +
      '<th id="ssColCode" style="width:1%;white-space:nowrap">Group Code</th><th id="ssColD1">Group Des1</th><th id="ssColD2" style="width:1%;white-space:nowrap">Group Des2</th></tr></thead>' +
      '<tbody id="ssBody"></tbody></table></div></div></div>' +
      '<div class="modal-footer bg-white d-flex justify-content-end gap-2">' +
      '<button class="btn btn-outline-danger fw-bold" id="ssClear">CLEAR ALL</button>' +
      '<button class="btn btn-dark fw-bold px-4" id="ssApply"><i class="fas fa-check me-1"></i>APPLY SELECTION</button></div>' +
      '</div></div>';
    document.body.appendChild(modalEl);
    modalEl.querySelector('#ssType').addEventListener('change', renderRows);
    modalEl.querySelector('#ssSearch').addEventListener('input', renderRows);
    modalEl.querySelector('#ssAll').addEventListener('click', function () { toggleAll(this.checked); });
    modalEl.querySelector('#ssClear').addEventListener('click', function () { stTmp = []; renderRows(); });
    modalEl.querySelector('#ssApply').addEventListener('click', applySel);
    modalEl.querySelector('#ssBody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-code]'); if (!tr) return; toggleCond(tr.getAttribute('data-code'));
    });
  }

  function buildShopData(branches) {
    var data = {};
    TYPES.forEach(function (t) { data[t] = { c: TYPE_COL[t], rows: [] }; });
    function groupBy(key) {
      var map = {};
      branches.forEach(function (b) { var k = (b[key] != null && b[key] !== '') ? b[key] : '-'; (map[k] = map[k] || []).push(b.id); });
      return Object.keys(map).sort().map(function (k) { return { code: k, d1: k, d2: map[k].length + ' สาขา', ids: map[k] }; });
    }
    data['Shop Group'].rows = groupBy('group');
    data['Shop Class'].rows = groupBy('class');
    data['Shop Type'].rows = groupBy('type');
    data['Shop Master'].rows = branches.map(function (b) { return { code: b.id, d1: b.name || '', d2: b.nameTH || '', ids: [b.id] }; });
    return data;
  }

  function condBranchCount(conds) { var s = {}; conds.forEach(function (c) { (c.ids || []).forEach(function (id) { s[id] = 1; }); }); return Object.keys(s).length; }

  /* ---- token serialization (dynamic: G:/C:/T: resolve against CURRENT branches) ---- */
  function valueFromConds(conds, branches) {
    var ids = {}; conds.forEach(function (c) { (c.ids || []).forEach(function (id) { ids[id] = 1; }); });
    var total = (branches || []).length, count = Object.keys(ids).length;
    if (total > 0 && count >= total) return 'ALL';
    var toks = conds.map(function (c) {
      if (c.type === 'Shop Group') return 'G:' + c.code;
      if (c.type === 'Shop Class') return 'C:' + c.code;
      if (c.type === 'Shop Type') return 'T:' + c.code;
      return c.code;
    });
    var seen = {}, out = []; toks.forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
    return out.join(', ');
  }
  function tokensToConds(tokens, branches) {
    branches = branches || [];
    return tokens.map(function (tok) {
      tok = String(tok).trim();
      function byKey(key, val) { return branches.filter(function (b) { return String(b[key]) === val; }).map(function (b) { return b.id; }); }
      if (/^G:/i.test(tok)) { var g = tok.slice(2); var gi = byKey('group', g); return { type: 'Shop Group', code: g, d1: g, d2: gi.length + ' สาขา', ids: gi }; }
      if (/^C:/i.test(tok)) { var c = tok.slice(2); var ci = byKey('class', c); return { type: 'Shop Class', code: c, d1: c, d2: ci.length + ' สาขา', ids: ci }; }
      if (/^T:/i.test(tok)) { var t = tok.slice(2); var ti = byKey('type', t); return { type: 'Shop Type', code: t, d1: t, d2: ti.length + ' สาขา', ids: ti }; }
      if (tok.toUpperCase() === 'ALL') { var ai = branches.map(function (b) { return b.id; }); return { type: 'Shop Master', code: 'ALL', d1: 'ทุกสาขา', d2: ai.length + ' สาขา', ids: ai }; }
      return { type: 'Shop Master', code: tok, d1: tok, d2: '', ids: [tok] };
    });
  }
  function condsSummary(conds, val) {
    if (val === 'ALL') return 'ทุกสาขา (รวมสาขาใหม่)';
    var ids = {}; conds.forEach(function (c) { (c.ids || []).forEach(function (id) { ids[id] = 1; }); });
    var n = Object.keys(ids).length;
    var hasCond = conds.some(function (c) { return c.type !== 'Shop Master'; });
    if (hasCond && conds.length <= 3) {
      var parts = conds.map(function (c) {
        var p = c.type === 'Shop Group' ? 'กลุ่ม ' : c.type === 'Shop Class' ? 'คลาส ' : c.type === 'Shop Type' ? 'ประเภท ' : '';
        return p + c.code;
      });
      return parts.join(' · ') + ' (' + n + ' สาขา)';
    }
    return 'รวม ' + n + ' สาขา';
  }

  function renderRows() {
    var inst = active; if (!inst) return;
    var type = modalEl.querySelector('#ssType').value;
    var q = (modalEl.querySelector('#ssSearch').value || '').toLowerCase();
    var data = inst.shop[type] || { c: '', rows: [] };
    modalEl.querySelector('#ssColCode').textContent = data.c + ' Code';
    modalEl.querySelector('#ssColD1').textContent = data.c + ' Des1';
    modalEl.querySelector('#ssColD2').textContent = data.c + ' Des2';
    var filtered = data.rows.filter(function (r) { return !q || (r.code + ' ' + r.d1 + ' ' + r.d2).toLowerCase().indexOf(q) !== -1; });
    modalEl.querySelector('#ssBody').innerHTML = filtered.map(function (r) {
      var on = stTmp.some(function (c) { return c.type === type && c.code === r.code; });
      return '<tr data-code="' + esc(r.code) + '" style="cursor:pointer" class="' + (on ? 'table-warning' : '') + '"><td class="text-center"><input type="checkbox" class="form-check-input" ' + (on ? 'checked' : '') + ' onclick="event.stopPropagation();StoreSelect._tog(\'' + esc(r.code) + '\')"></td>' +
        '<td class="fw-bold" style="white-space:nowrap;color:#1a1d20">' + esc(r.code) + '</td><td style="color:#1a1d20">' + esc(r.d1) + '</td><td style="white-space:nowrap;color:#1a1d20">' + esc(r.d2) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="text-center text-muted py-4">ไม่พบข้อมูล</td></tr>';
    var allOn = filtered.length && filtered.every(function (r) { return stTmp.some(function (c) { return c.type === type && c.code === r.code; }); });
    modalEl.querySelector('#ssAll').checked = !!allOn;
    modalEl.querySelector('#ssCount').textContent = 'เลือก ' + stTmp.length + ' เงื่อนไข · ' + condBranchCount(stTmp) + ' สาขา';
  }
  function toggleCond(code) {
    var inst = active; var type = modalEl.querySelector('#ssType').value;
    var data = inst.shop[type] || { rows: [] };
    var r = data.rows.find(function (x) { return x.code === code; }); if (!r) return;
    var i = stTmp.findIndex(function (c) { return c.type === type && c.code === code; });
    if (i === -1) stTmp.push({ type: type, code: r.code, d1: r.d1, d2: r.d2, ids: r.ids || [] }); else stTmp.splice(i, 1);
    renderRows();
  }
  function toggleAll(on) {
    var inst = active; var type = modalEl.querySelector('#ssType').value;
    var q = (modalEl.querySelector('#ssSearch').value || '').toLowerCase();
    var data = inst.shop[type] || { rows: [] };
    data.rows.filter(function (r) { return !q || (r.code + ' ' + r.d1 + ' ' + r.d2).toLowerCase().indexOf(q) !== -1; }).forEach(function (r) {
      var i = stTmp.findIndex(function (c) { return c.type === type && c.code === r.code; });
      if (on && i === -1) stTmp.push({ type: type, code: r.code, d1: r.d1, d2: r.d2, ids: r.ids || [] });
      if (!on && i !== -1) stTmp.splice(i, 1);
    });
    renderRows();
  }
  function applySel() {
    var inst = active; inst.conds = stTmp.slice();
    inst.renderField(); inst.fireChange();
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
  }

  function Instance(opts) {
    this.fieldEl = opts.fieldEl; this.hiddenEl = opts.hiddenEl;
    this.getBranches = opts.getBranches || function () { return []; };
    this.onChange = opts.onChange || function () {};
    this.conds = []; this.shop = {};
  }
  Instance.prototype.fireChange = function () {
    var ids = this.getIds();
    var val = valueFromConds(this.conds, this.getBranches());
    this.allMode = (val === 'ALL');
    if (this.hiddenEl) this.hiddenEl.value = val;
    this.onChange(ids);
  };
  Instance.prototype.getIds = function () { var s = {}; this.conds.forEach(function (c) { (c.ids || []).forEach(function (id) { s[id] = 1; }); }); return Object.keys(s); };
  Instance.prototype.setValue = function (str) {
    var toks = String(str || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (toks.length === 1 && toks[0].toUpperCase() === 'ALL') {
      var all = (this.getBranches() || []).map(function (b) { return b.id; });
      this.allMode = true;
      this.conds = all.length ? [{ type: 'Shop Master', code: 'ALL', d1: 'ทุกสาขา (รวมสาขาใหม่)', d2: '', ids: all }] : [];
    } else { this.allMode = false; this.conds = tokensToConds(toks, this.getBranches() || []); }
    this.renderField();
  };
  Instance.prototype.setIds = function (ids) {
    ids = (ids || []).filter(Boolean);
    var isAll = ids.length === 1 && String(ids[0]).toUpperCase() === 'ALL';
    if (isAll) {
      var all = (this.getBranches() || []).map(function (b) { return b.id; }).filter(Boolean);
      this.allMode = true;
      this.conds = all.length ? [{ type: 'Shop Master', code: 'ALL', d1: 'ทุกสาขา (รวมสาขาใหม่)', d2: '', ids: all }] : [];
    } else {
      this.allMode = false;
      if (ids.length) this.conds = [{ type: 'Shop Master', code: '(custom)', d1: ids.length + ' สาขา', d2: '', ids: ids.slice() }];
      else this.conds = [];
    }
    this.renderField();
  };
  Instance.prototype.renderField = function () {
    var el = this.fieldEl, self = this; if (!el) return;
    if (!this.conds.length) { el.innerHTML = '<span class="text-muted"><i class="fas fa-store me-1"></i>ยังไม่เลือกสาขา</span><button type="button" class="btn btn-sm btn-dark py-0 px-2 ms-2" style="font-size:.74rem" onclick="StoreSelect._open(\'' + this._id + '\')"><i class="fas fa-list text-warning me-1"></i>เลือกสาขา</button>'; return; }
    var nBranch = this.getIds().length;
    var byType = {};
    this.conds.forEach(function (c) { var t = c.type; if (!byType[t]) byType[t] = { ids: {} }; (c.ids || []).forEach(function (id) { byType[t].ids[id] = 1; }); });
    var chips = Object.keys(byType).map(function (t) {
      return '<span class="badge bg-secondary me-1 d-inline-flex align-items-center" style="font-weight:500;gap:5px"><i class="fas fa-layer-group" style="opacity:.7"></i>' + esc(t) + ' · ' + Object.keys(byType[t].ids).length + ' สาขา' +
        '<i class="fas fa-times-circle" style="cursor:pointer;opacity:.8" title="ลบหมวดนี้" onclick="StoreSelect._delType(\'' + self._id + '\',\'' + esc(t) + '\')"></i></span>';
    }).join('');
    el.innerHTML = '<div class="d-flex align-items-center gap-2 flex-wrap w-100">' +
      '<span class="badge bg-success" style="font-weight:600"><i class="fas fa-store me-1"></i>รวม ' + nBranch + ' สาขา' + (self.allMode ? ' · ทุกสาขา (รวมสาขาใหม่อัตโนมัติ)' : '') + '</span>' + (self.allMode ? '' : chips) +
      '<div class="d-flex gap-1 ms-auto">' +
      '<button type="button" class="btn btn-sm btn-dark py-0 px-2" style="font-size:.74rem" onclick="StoreSelect._open(\'' + this._id + '\')"><i class="fas fa-list text-warning me-1"></i>เลือกสาขา</button>' +
      '<button type="button" class="btn btn-sm btn-outline-dark py-0 px-2" style="font-size:.74rem" onclick="StoreSelect._detail(\'' + this._id + '\')"><i class="fas fa-list-ul me-1"></i>ดูรายละเอียด</button>' +
      '<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size:.74rem" onclick="StoreSelect._clear(\'' + this._id + '\')" title="ล้างทั้งหมด"><i class="fas fa-trash-alt"></i></button>' +
      '</div></div>';
  };
  Instance.prototype.openModal = function () {
    ensureModal();
    this.shop = buildShopData(this.getBranches());
    active = this; stTmp = this.conds.slice();
    modalEl.querySelector('#ssType').value = 'Shop Master';
    modalEl.querySelector('#ssSearch').value = '';
    renderRows();
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  };
  Instance.prototype.detail = function () {
    var self = this; var branches = this.getBranches();
    var find = function (id) { return branches.find(function (b) { return b.id === id; }) || { id: id, name: '', nameTH: '' }; };
    var rowsByType = {}; this.conds.forEach(function (c) { (rowsByType[c.type] = rowsByType[c.type] || []).push(c); });
    var total = this.getIds().length;
    var sections = Object.keys(rowsByType).map(function (t) {
      var tset = {}; rowsByType[t].forEach(function (c) { (c.ids || []).forEach(function (id) { tset[id] = 1; }); });
      var ids = Object.keys(tset);
      var condBadges = rowsByType[t].map(function (c) { return '<span class="badge bg-dark me-1 mb-1" style="font-weight:500">' + esc(c.code) + ' · ' + esc(c.d1) + '</span>'; }).join('');
      var brRows = ids.map(function (id) { var b = find(id); return '<tr><td class="fw-bold text-primary">' + esc(b.id) + '</td><td>' + esc(b.name) + '</td><td>' + esc(b.nameTH || '') + '</td></tr>'; }).join('');
      return '<div class="mb-3 border rounded-3" style="overflow:hidden"><div class="px-2 py-1 fw-bold d-flex justify-content-between" style="background:#2f6dab;color:#fff;font-size:.85rem"><span><i class="fas fa-layer-group me-1"></i>' + esc(t) + ' · ' + ids.length + ' สาขา</span></div>' +
        '<div class="p-2"><div class="mb-2">' + condBadges + '</div><div style="max-height:30vh;overflow:auto"><table class="table table-sm table-hover m-0" style="font-size:.8rem"><thead style="position:sticky;top:0;background:#eef1f4"><tr><th>Code</th><th>Branch (EN)</th><th>Branch (TH)</th></tr></thead><tbody>' + (brRows || '<tr><td colspan="3" class="text-muted text-center py-2">—</td></tr>') + '</tbody></table></div></div></div>';
    }).join('');
    Swal.fire({ title: '<span style="font-size:1rem">สาขาที่ร่วมรายการ · รวม ' + total + ' สาขา</span>', width: 700, html: '<div class="text-start" style="max-height:62vh;overflow:auto">' + sections + '</div>', confirmButtonColor: '#1a1d20', confirmButtonText: 'ปิด', showDenyButton: true, denyButtonText: 'ล้างทั้งหมด', denyButtonColor: '#dc3545' })
      .then(function (r) { if (r.isDenied) { self.conds = []; self.renderField(); self.fireChange(); } });
  };

  var registry = {}, seq = 0;
  function create(opts) {
    var inst = new Instance(opts); inst._id = 'ss' + (++seq); registry[inst._id] = inst;
    inst.renderField();
    if (opts.hiddenEl && opts.hiddenEl.value) { inst.setValue(opts.hiddenEl.value); }
    return inst;
  }
  // Modal-only picker — opens the NPD-style modal, calls onApply(ids) on APPLY.
  // Does NOT manage a field; the caller keeps its own field/hidden-input system.
  var picker = null;
  function pick(opts) {
    if (!picker) {
      picker = new Instance({ getBranches: opts.getBranches });
      picker._id = 'sspick'; registry[picker._id] = picker;
    }
    picker.getBranches = opts.getBranches || function () { return []; };
    picker.renderField = function () {};   // no field
    picker.fireChange = function () {
      var ids = picker.getIds();
      var val = valueFromConds(picker.conds, picker.getBranches());
      (opts.onApply || function () {})(ids, val, condsSummary(picker.conds, val));
    };
    var toks = (opts.initialIds || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (toks.length === 1 && toks[0].toUpperCase() === 'ALL') {
      var allb = (picker.getBranches() || []).map(function (b) { return b.id; });
      picker.conds = allb.length ? [{ type: 'Shop Master', code: 'ALL', d1: 'ทุกสาขา', d2: '', ids: allb }] : [];
    } else {
      picker.conds = tokensToConds(toks, picker.getBranches() || []);
    }
    picker.openModal();
  }
  return {
    create: create,
    pick: pick,
    _open: function (id) { registry[id] && registry[id].openModal(); },
    _detail: function (id) { registry[id] && registry[id].detail(); },
    _clear: function (id) { var i = registry[id]; if (i) { i.conds = []; i.renderField(); i.fireChange(); } },
    _delType: function (id, t) { var i = registry[id]; if (i) { i.conds = i.conds.filter(function (c) { return c.type !== t; }); i.renderField(); i.fireChange(); } },
    _tog: function (code) { toggleCond(code); }
  };
})();
