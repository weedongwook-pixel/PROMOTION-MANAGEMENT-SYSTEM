/* แผน IT Device 2026 — IT's editable worklist page. External file (avoids inline
   instrumentation). Entry: window.initPlan2026. Data drives RD case detection. */
(function () {
  let planRows = [];
  let editing = null; // shopCode being edited, or '' for new
  let _planInit = 0;

  const NEED = { INSTALL: 'ติดตั้งใหม่', SWAP: 'เปลี่ยนเครื่อง', ADD: 'เพิ่มเครื่อง', KEEP: 'คงเดิม' };
  const NEEDCLASS = { INSTALL: 'k-INSTALL', SWAP: 'k-SWAP', ADD: 'k-ADD', KEEP: 'k-KEEP' };
  const ACTINFO = {
    FULL:     { label: 'เปิดสาขาใหม่', icon: 'fa-store', color: '#2e934a' },
    Renovate: { label: 'Renovate ปรับปรุง', icon: 'fa-paint-roller', color: '#2c4a82' },
    Relocate: { label: 'Relocate ย้ายที่', icon: 'fa-truck', color: '#d9410e' },
    Transfer: { label: 'Transfer โอนรหัส', icon: 'fa-right-left', color: '#6b3fa0' },
    Close:    { label: 'ปิดสาขา', icon: 'fa-store-slash', color: '#c0392b' },
  };
  function actInfo(a) { return ACTINFO[a] || { label: a || '-', icon: 'fa-circle', color: '#888' }; }
  const ST = { pending: ['รอดำเนินการ', '#dc3545'], 'in-case': ['อยู่ในคิว RD', '#2c4a82'], done: ['เสร็จแล้ว', '#2e934a'], ok: ['ใช้เครื่องเดิม', '#888'] };
  const ACTIONS = ['FULL', 'Renovate', 'Relocate', 'Transfer', 'Close'];
  const DEVOPTS = ['', 'Opening', 'Replace', 'Add Dev', 'Old', '-'];

  function planDateKey(s) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || '')); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 9e15; }

  function loadPlan() {
    google.script.run.withSuccessHandler(rows => { planRows = rows || []; renderPlan(); }).getPlanWork();
  }
  function initPlan2026() {
    const el = document.getElementById('plan-page');
    if (el) { if (el.__pInit) return; el.__pInit = true; }
    const op = (localStorage.getItem('pc_userName') || 'IT').toUpperCase();
    const o = document.getElementById('planOperator'); if (o) o.textContent = op;
    loadPlan();
  }

  const THMONTH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const THMONTHFULL = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONMAP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function monthOf(s) {
    s = String(s || '');
    let m = /(\d{1,2})\/(\d{2})\/(\d{4})/.exec(s);
    if (m) return { num: +m[2], year: +m[3], day: +m[1], tbc: false };
    let mm = /([a-z]{3})[a-z]*\s*'?(\d{2,4})/i.exec(s);
    if (mm && MONMAP[mm[1].toLowerCase()]) { let y = +mm[2]; if (y < 100) y += 2000; return { num: MONMAP[mm[1].toLowerCase()], year: y, day: 0, tbc: /tbc/i.test(s) }; }
    return null;
  }
  function monthKey(p) { const mo = monthOf(p.openingDate); return mo ? (mo.year + '-' + String(mo.num).padStart(2, '0')) : 'zzz-tbc'; }

  function renderPlan() {
    // summary (always full set)
    const c = { INSTALL: 0, SWAP: 0, ADD: 0, KEEP: 0, done: 0, pending: 0 };
    planRows.forEach(p => { c[p.need] = (c[p.need] || 0) + 1; if (p.status === 'done') c.done++; if (p.status === 'pending') c.pending++; });
    const sum = document.getElementById('planSummary');
    if (sum) sum.innerHTML =
      `<span class="psum"><b>${planRows.length}</b> แถว</span>` +
      `<span class="psum pi"><b>${c.INSTALL}</b> ติดตั้งใหม่</span>` +
      `<span class="psum ps"><b>${c.SWAP}</b> เปลี่ยนเครื่อง</span>` +
      `<span class="psum pa"><b>${c.ADD}</b> เพิ่ม</span>` +
      `<span class="psum pk"><b>${c.KEEP}</b> คงเดิม</span>` +
      `<span class="psum pd"><b>${c.pending}</b> รอทำ</span>`;

    // month filter options
    const mf = document.getElementById('pf_month');
    if (mf) {
      const keys = [...new Set(planRows.map(monthKey))].sort();
      const cur = mf.value;
      mf.innerHTML = '<option value="">ทุกเดือน</option>' + keys.map(k => {
        const lbl = k === 'zzz-tbc' ? 'ยังไม่ระบุ (TBC)' : (THMONTHFULL[+k.slice(5)] + ' ' + k.slice(0, 4));
        return `<option value="${k}"${k === cur ? ' selected' : ''}>${lbl}</option>`;
      }).join('');
    }
    const fM = (mf && mf.value) || '';
    const fS = (document.getElementById('pf_status') || {}).value || '';
    // action filter options
    const af = document.getElementById('pf_action');
    if (af) {
      const acts = [...new Set(planRows.map(p => p.action).filter(Boolean))];
      const cur = af.value;
      af.innerHTML = '<option value="">ทุกประเภทงาน</option>' + acts.map(a => `<option value="${a}"${a === cur ? ' selected' : ''}>${actInfo(a).label}</option>`).join('');
    }
    const fA = (af && af.value) || '';

    const list = document.getElementById('plan-list');
    if (!list) return;
    let rows = planRows.filter(p => (!fM || monthKey(p) === fM) && (!fS || p.status === fS) && (!fA || p.action === fA));
    rows.sort((a, b) => planDateKey(a.openingDate) - planDateKey(b.openingDate));
    if (!rows.length) { list.innerHTML = '<div class="text-center text-muted py-5">— ไม่มีรายการ — <button class="pbtn pbtn-y ms-2" onclick="planAdd()">+ เพิ่มแถว</button></div>'; return; }

    // group by month
    const groups = {}; const order = [];
    rows.forEach(p => { const k = monthKey(p); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(p); });
    list.innerHTML = order.map(k => {
      const mo = k === 'zzz-tbc' ? null : { num: +k.slice(5), year: +k.slice(0, 4) };
      const title = mo ? (THMONTHFULL[mo.num] + ' ' + mo.year) : 'ยังไม่ระบุวัน (TBC)';
      const cards = groups[k].map(cardHtml).join('');
      return `<div class="month-sec"><div class="month-head"><i class="fa-solid fa-calendar"></i> ${title} <span class="mn">${groups[k].length} สาขา</span></div>${cards}</div>`;
    }).join('');
  }
  function cardHtml(p) {
    const st = ST[p.status] || ['—', '#888'];
    const ai = actInfo(p.action);
    const mo = monthOf(p.openingDate);
    const day = mo && mo.day ? mo.day : '–';
    const mon = mo ? THMONTH[mo.num] : 'TBC';
    const dev = [p.devices.pos && ('POS:' + p.devices.pos), p.devices.printerCashier && ('แคชเชียร์:' + p.devices.printerCashier), p.devices.printerKitchen && ('ครัว:' + p.devices.printerKitchen)].filter(Boolean).join(' · ') || '—';
    let act = '';
    if (p.status === 'pending' && (p.need === 'INSTALL' || p.need === 'SWAP' || p.need === 'ADD'))
      act = `<button class="pbtn pbtn-y" onclick="planCmpos('${p.shopCode}')"><i class="fa-solid fa-envelope me-1"></i>ส่งให้ CMPOS</button>`;
    else if (p.status === 'done') act = `<span style="color:#2e934a;font-weight:900;"><i class="fa-solid fa-check"></i></span>`;
    return `<div class="pcard" style="border-left-color:${ai.color};">
      <div class="pc-date"><b>${day}</b><span>${mon}</span></div>
      <div class="pc-acttag" style="background:${ai.color};"><i class="fa-solid ${ai.icon}"></i><span class="al">${ai.label}</span></div>
      <div class="pc-main">
        <div class="pc-shop"><b>${p.shopCode}</b>${p.name}<span class="pc-type">${p.type || '-'}</span></div>
        <div class="pc-meta"><span class="need ${NEEDCLASS[p.need] || ''}">${NEED[p.need] || p.need}</span><span class="conf ${/confirm/i.test(p.confirm) ? 'c-ok' : 'c-tbc'}">${p.confirm}</span><span style="color:#999;">${dev}</span></div>
      </div>
      <div class="pc-right">
        <span class="pstatus" style="background:${st[1]};">${st[0]}</span>
        ${act}
        <button class="pbtn pbtn-d" title="แก้ไข" onclick="planEdit('${p.shopCode}')"><i class="fa-solid fa-pen"></i></button>
        <button class="pbtn pbtn-x" title="ลบ" onclick="planDelete('${p.shopCode}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }

  /* ---------- editor ---------- */
  function planEdit(shopCode) {
    const p = planRows.find(x => x.shopCode === shopCode);
    editing = shopCode;
    fillEditor(p ? { shopCode: p.shopCode, name: p.name, type: p.type, action: p.action, openingDate: p.openingDate, confirm: p.confirm, pos: p.devices.pos, printerCashier: p.devices.printerCashier, printerKitchen: p.devices.printerKitchen } : null);
    showEditor(true);
  }
  function planAdd() { editing = ''; fillEditor(null); showEditor(true); }
  function fillEditor(p) {
    p = p || { shopCode: '', name: '', type: '', action: 'Renovate', openingDate: '', confirm: 'Tentative', pos: '', printerCashier: '', printerKitchen: '' };
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v == null ? '' : v; };
    set('pe_shop', p.shopCode); set('pe_name', p.name); set('pe_type', p.type);
    set('pe_action', p.action || 'Renovate'); set('pe_open', p.openingDate); set('pe_confirm', p.confirm || 'Tentative');
    set('pe_pos', p.pos); set('pe_cashier', p.printerCashier); set('pe_kitchen', p.printerKitchen);
    const sh = document.getElementById('pe_shop'); if (sh) sh.readOnly = !!editing;
    const hint = document.getElementById('pe_hint'); if (hint) hint.textContent = '';
    document.getElementById('pe_title').textContent = editing ? ('แก้ไขแผน — ' + editing) : 'เพิ่มแผนใหม่';
  }
  function showEditor(on) {
    const m = document.getElementById('planEditor'); if (m) m.style.display = on ? 'flex' : 'none';
  }
  function planShopChanged() {
    const code = (document.getElementById('pe_shop').value || '').trim();
    const b = (window.PC_BRANCH_MASTER || []).find(x => x.id === code);
    if (b) { document.getElementById('pe_name').value = b.name || ''; document.getElementById('pe_type').value = b.type || ''; }
  }
  function planSuggest() {
    const code = (document.getElementById('pe_shop').value || '').trim();
    if (!code) { Swal.fire('ใส่รหัสสาขาก่อน', '', 'info'); return; }
    google.script.run.withSuccessHandler(res => {
      if (!res) return;
      document.getElementById('pe_pos').value = res.pos;
      const hint = document.getElementById('pe_hint'); if (hint) hint.textContent = '💡 ' + res.reason;
    }).suggestDevice(code);
  }
  function planSave() {
    const g = id => (document.getElementById(id).value || '').trim();
    const row = { shopCode: g('pe_shop'), name: g('pe_name'), type: g('pe_type'), action: g('pe_action'),
      openingDate: g('pe_open'), confirm: g('pe_confirm'), pos: g('pe_pos'), printerCashier: g('pe_cashier'), printerKitchen: g('pe_kitchen') };
    if (!row.shopCode) { Swal.fire('ต้องระบุรหัสสาขา', '', 'warning'); return; }
    google.script.run.withSuccessHandler(res => {
      showEditor(false);
      Swal.fire({ icon: 'success', title: res.message || 'บันทึกแล้ว', timer: 1300, showConfirmButton: false });
      loadPlan();
    }).savePlanRow(row);
  }
  function planDelete(shopCode) {
    Swal.fire({ title: 'ลบแผน?', text: shopCode, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; google.script.run.withSuccessHandler(() => { Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1000, showConfirmButton: false }); loadPlan(); }).deletePlanRow(shopCode); });
  }

  /* ---------- staging (in-system, no file switch) ---------- */
  function planStage(shopCode, reason) {
    const kind = reason === 'transfer' ? 'tocoCo' : reason;
    if (!(window.RD && window.RD.addTrigger)) { planOpenRd(shopCode); return; }
    const t = window.RD.addTrigger({ branchId: shopCode, kind: kind, source: 'plan2026' });
    if (t) Swal.fire({ icon: 'success', title: 'เข้าคิว RD แล้ว', text: shopCode + ' → คิวแจ้งยกเลิก/จดใหม่ (รอ IT จับเคส)', timer: 1900, showConfirmButton: false });
    else Swal.fire({ icon: 'info', title: 'มีงานในคิวอยู่แล้ว', text: shopCode, timer: 1400, showConfirmButton: false });
    loadPlan();
  }
  function planStageAll() {
    const targets = planRows.filter(p => p.need === 'SWAP' && p.status === 'pending' && /confirm/i.test(p.confirm));
    if (!targets.length) { Swal.fire('ไม่มีรายการ', 'ไม่มีงานเปลี่ยนเครื่อง (Confirmed) ที่ต้อง stage', 'info'); return; }
    Swal.fire({ title: 'Auto-stage เคส?', html: 'สร้างงานเข้าคิว RD <b>' + targets.length + '</b> สาขา (Confirmed + เปลี่ยนเครื่อง)', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'ดำเนินการ', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; let n = 0; targets.forEach(p => { const kind = p.reason === 'transfer' ? 'tocoCo' : p.reason; if (window.RD && window.RD.addTrigger && window.RD.addTrigger({ branchId: p.shopCode, kind: kind, source: 'plan2026' })) n++; }); Swal.fire({ icon: 'success', title: 'เข้าคิวแล้ว', text: n + ' สาขา → คิว RD', timer: 1900, showConfirmButton: false }); loadPlan(); });
  }
  function planCmpos(shopCode) {
    google.script.run.withSuccessHandler(res => {
      if (!res || res.status !== 'success') { Swal.fire('ไม่สำเร็จ', (res && res.message) || '-', 'error'); return; }
      Swal.fire({ title: 'แจ้งติดตั้งให้ CMPOS', icon: 'success', html: `<div style="text-align:left;font-size:0.85rem;"><b>ถึง:</b> ${res.to}<br><b>สาขา:</b> ${shopCode}</div>`, showCancelButton: true, confirmButtonText: '<i class="fa-solid fa-envelope"></i> เปิดอีเมล', cancelButtonText: 'ปิด', confirmButtonColor: '#2e934a' }).then(r => { if (r.isConfirmed && res.mailto) window.open(res.mailto, '_blank'); });
    }).requestCmposAssetData([shopCode]);
  }
  function planOpenRd(shopCode) {
    try { localStorage.setItem('pc_rd_open_case', JSON.stringify({ branchId: shopCode, at: Date.now() })); } catch (e) {}
    window.open('RD Cancel & Re-register.html?branch=' + encodeURIComponent(shopCode), '_blank');
  }

  Object.assign(window, { initPlan2026, loadPlan, planAdd, planEdit, planSave, planDelete, planShopChanged, planSuggest, planStage, planStageAll, planCmpos, planOpenRd, planCloseEditor: () => showEditor(false) });
  if (document.getElementById('plan-page')) initPlan2026();
})();
