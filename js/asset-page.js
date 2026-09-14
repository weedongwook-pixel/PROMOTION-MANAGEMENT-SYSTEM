/* ทะเบียนเครื่อง Asset page logic — external file so the preview
   does not text-instrument the inline script. Entry: window.initAsset */
let assetAll = [];
  let assetFiltered = [];
  let assetPage = 1;
  let assetRowsPerPage = 9999;
  let assetSort = { key: '', asc: true };
  let assetDrift = [];
  let planWork = [];
  let activeDriftTab = 'NEW';
  const ASSET_REPORT_NAME = "MA_RECONCILE_REPORT_2026";

  function loadAssetData() {
    const op = (localStorage.getItem('pc_userName') || 'IT').toUpperCase();
    const opEl = document.getElementById('assetOperator'); if (opEl) opEl.textContent = op;
    const tplOp = document.getElementById('tpl-operator'); if (tplOp) tplOp.textContent = op;
    const s = document.getElementById('assetSearch'); if (s) s.value = "";
    document.querySelectorAll('#asset-page .col-filter').forEach(f => f.value = "");
    Swal.fire({ title: 'REFRESHING DATA...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    google.script.run.withSuccessHandler(data => {
      assetAll = data || []; assetFiltered = data || [];
      assetPage = 1; assetBuildFilters(assetAll); assetRender(); Swal.close();
      scanDrift();
    }).getAssetInventory();
  }
  // guarded mount entry — collapses the loader-call + self-init double on one mount,
  // but a fresh navigation injects a new #asset-page (no flag) so it always re-loads.
  function initAsset() {
    const el = document.getElementById('asset-page');
    if (el) { if (el.__amInit) return; el.__amInit = true; }
    loadAssetData();
  }

  /* ---------- AUTO-DETECT: fleet drift (new branch / machine swap / orphan) ---------- */
  function planActionable() { return planWork.filter(p => p.status === 'pending' || p.status === 'in-case').length; }
  function afterScan() {
    const total = assetDrift.length + planActionable();
    const badge = document.getElementById('driftBadge');
    const cnt = document.getElementById('driftCount');
    if (cnt) cnt.textContent = total;
    if (badge) badge.style.display = total ? '' : 'none';
    if (document.getElementById('driftPanel') && document.getElementById('driftPanel').style.display !== 'none') renderDrift();
  }
  function scanDrift() {
    google.script.run.withSuccessHandler(items => { assetDrift = items || []; afterScan(); }).getAssetDrift();
    google.script.run.withSuccessHandler(items => { planWork = items || []; afterScan(); }).getPlanWork();
  }
  function toggleDrift() {
    const p = document.getElementById('driftPanel'); if (!p) return;
    const show = p.style.display === 'none';
    p.style.display = show ? '' : 'none';
    if (show) renderDrift();
  }
  const DRIFT_LABEL = { NEW: 'สาขาใหม่', SWAP: 'เปลี่ยนเครื่อง', CASE: 'เคส RD', ORPHAN: 'ไม่มีสาขาแม่' };
  const DRIFT_TABS = [
    { key: 'NEW', label: 'สาขาใหม่', icon: 'fa-store', kinds: ['NEW'] },
    { key: 'CHANGE', label: 'เปลี่ยนเครื่อง', icon: 'fa-right-left', kinds: ['SWAP', 'CASE'] },
    { key: 'ORPHAN', label: 'ไม่มีสาขาแม่', icon: 'fa-triangle-exclamation', kinds: ['ORPHAN'] },
    { key: 'PLAN', label: 'แผน 2026', icon: 'fa-calendar-days', kinds: [] },
  ];
  function driftTabItems(key) {
    if (key === 'PLAN') return [...planWork];
    const tab = DRIFT_TABS.find(t => t.key === key) || DRIFT_TABS[0];
    return assetDrift.filter(d => tab.kinds.includes(d.kind)).sort((a, b) => a.shopCode.localeCompare(b.shopCode));
  }
  function setDriftTab(key) { activeDriftTab = key; renderDrift(); }
  function renderDrift() {
    if (!driftTabItems(activeDriftTab).length) { const f = DRIFT_TABS.find(t => driftTabItems(t.key).length); if (f) activeDriftTab = f.key; }
    const tabsEl = document.getElementById('driftTabs');
    if (tabsEl) tabsEl.innerHTML = DRIFT_TABS.map(t => {
      const n = t.key === 'PLAN' ? planActionable() : driftTabItems(t.key).length;
      return `<button class="drift-tab ${t.key === activeDriftTab ? 'active' : ''}" onclick="setDriftTab('${t.key}')"><i class="fa-solid ${t.icon} me-1"></i>${t.label}<span class="drift-tcount">${n}</span></button>`;
    }).join('');
    renderDriftList();
  }
  function renderDriftList() {
    const wrap = document.getElementById('driftList'); if (!wrap) return;
    if (activeDriftTab === 'PLAN') { renderPlanList(wrap); return; }
    if (!assetDrift.length) { wrap.innerHTML = '<div class="text-center text-muted py-4">ไม่พบความเปลี่ยนแปลง — ทะเบียนตรงกับฐานข้อมูลสาขา ✓</div>'; return; }
    const items = driftTabItems(activeDriftTab);
    if (!items.length) { wrap.innerHTML = '<div class="text-center text-muted py-4">— ไม่มีรายการในหมวดนี้ —</div>'; return; }
    let head = '';
    if (activeDriftTab === 'NEW') {
      head = `<div class="drift-actionbar"><label class="mb-0 d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input" onchange="document.querySelectorAll('.drift-pick').forEach(c=>c.checked=this.checked)"> เลือกทั้งหมด</label><span class="text-muted" style="font-size:0.68rem;">ติ๊กสาขาที่ยังไม่มีเครื่อง → ส่งให้ CMPOS กรอกข้อมูลติดตั้ง</span><button class="drift-apply" onclick="sendCmposEmail()"><i class="fa-solid fa-envelope me-1"></i>ส่งเมล CMPOS</button></div>`;
    }
    wrap.innerHTML = head + items.map(d => {
      const tick = d.kind === 'NEW' ? `<input type="checkbox" class="drift-pick form-check-input" data-shop="${d.shopCode}">` : '';
      return `<div class="drift-row">${tick}<span class="drift-kind k-${d.kind}">${DRIFT_LABEL[d.kind] || d.kind}</span><div class="drift-info"><b>${d.shopCode}</b> ${d.shopName} — ${d.detail}<div class="drift-suggest">↳ ${d.suggest}</div></div><button class="drift-apply" onclick="applyDrift('${d.id}')">${d.kind === 'ORPHAN' ? 'RETIRE' : 'APPLY'}</button></div>`;
    }).join('');
  }
  function planDateKey(s) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || '')); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 9e15; }
  function renderPlanList(wrap) {
    const items = [...planWork].sort((a, b) => planDateKey(a.openingDate) - planDateKey(b.openingDate));
    if (!items.length) { wrap.innerHTML = '<div class="text-center text-muted py-4">— ไม่มีแผนปี 2026 —</div>'; return; }
    const ST = { pending: ['รอดำเนินการ', '#dc3545'], 'in-case': ['อยู่ในเคส', '#2c4a82'], done: ['เสร็จแล้ว', '#2e934a'], ok: ['ใช้เครื่องเดิม', '#888'] };
    const NEED = { INSTALL: 'ติดตั้งใหม่', SWAP: 'เปลี่ยนเครื่อง', ADD: 'เพิ่มเครื่อง', KEEP: 'คงเดิม' };
    const head = `<div class="drift-actionbar"><i class="fa-solid fa-calendar-days"></i><span style="font-weight:900;">แผน IT Device 2026</span><span class="text-muted" style="font-size:0.68rem;">FULL=เปิดใหม่ · Renovate/Relocate=เปลี่ยน/คงเครื่อง · เรียงตามวันเปิด</span><button class="drift-apply" onclick="stageAllPlan()"><i class="fa-solid fa-bolt me-1"></i>auto-stage เคส (Confirmed)</button></div>`;
    wrap.innerHTML = head + items.map(p => {
      const st = ST[p.status] || ['—', '#888'];
      let btn = '';
      if (p.need === 'INSTALL' && p.status === 'pending') btn = `<button class="drift-apply" onclick="planCmpos('${p.shopCode}')"><i class="fa-solid fa-envelope me-1"></i>แจ้ง CMPOS</button>`;
      else if (p.need === 'SWAP' && p.status === 'pending') btn = `<button class="drift-apply" onclick="stagePlanTrigger('${p.shopCode}','${p.reason}')"><i class="fa-solid fa-folder-plus me-1"></i>เปิดเคส</button>`;
      else if (p.status === 'in-case') btn = `<button class="drift-apply" style="background:#dde6f5;" onclick="openRdCase('${p.shopCode}','')">อยู่ในคิว RD</button>`;
      const dev = [p.devices.pos && ('POS:' + p.devices.pos), p.devices.printerCashier && ('แคชเชียร์:' + p.devices.printerCashier), p.devices.printerKitchen && ('ครัว:' + p.devices.printerKitchen)].filter(Boolean).join(' · ');
      return `<div class="drift-row"><span class="drift-kind k-${p.need}">${NEED[p.need] || p.need}</span><div class="drift-info"><b>${p.shopCode}</b> ${p.name} — ${p.action} · เปิด ${p.openingDate} <span style="color:#999;">(${p.confirm})</span><div class="drift-suggest">${dev || '—'}${p.pic ? ' · PIC ' + p.pic : ''}</div></div><span class="plan-status" style="background:${st[1]};">${st[0]}</span>${btn}</div>`;
    }).join('');
  }
  function planCmpos(shopCode) {
    google.script.run.withSuccessHandler(res => {
      if (!res || res.status !== 'success') { Swal.fire('ไม่สำเร็จ', (res && res.message) || '-', 'error'); return; }
      Swal.fire({ title: 'แจ้งติดตั้งให้ CMPOS', icon: 'success', html: `<div style="text-align:left;font-size:0.85rem;"><b>ถึง:</b> ${res.to}<br><b>สาขา:</b> ${shopCode}</div>`, showCancelButton: true, confirmButtonText: '<i class="fa-solid fa-envelope"></i> เปิดอีเมล', cancelButtonText: 'ปิด', confirmButtonColor: '#2e934a' }).then(r => { if (r.isConfirmed && res.mailto) window.open(res.mailto, '_blank'); });
    }).requestCmposAssetData([shopCode]);
  }
  function planOpenCase(shopCode, reason) { openRdCase(shopCode, reason); }
  // Stage an RD case IN-SYSTEM (no file switch): create a trigger that lands in the
  // RD Cancel/Re-register "งานจาก Master Data" queue for IT to grab.
  function stagePlanTrigger(shopCode, reason) {
    const kind = reason === 'transfer' ? 'tocoCo' : reason; // renovate/relocate pass through
    if (!(window.RD && window.RD.addTrigger)) { openRdCase(shopCode, reason); return; }
    const t = window.RD.addTrigger({ branchId: shopCode, kind: kind, source: 'plan2026' });
    if (t) Swal.fire({ icon: 'success', title: 'เข้าคิว RD แล้ว', text: shopCode + ' → คิวแจ้งยกเลิก/จดใหม่ (รอ IT จับเคส)', timer: 1900, showConfirmButton: false });
    else Swal.fire({ icon: 'info', title: 'มีงานในคิวอยู่แล้ว', text: shopCode, timer: 1500, showConfirmButton: false });
    loadAssetData();
  }
  function stageAllPlan() {
    const targets = planWork.filter(p => p.need === 'SWAP' && p.status === 'pending' && /confirm/i.test(p.confirm));
    if (!targets.length) { Swal.fire('ไม่มีรายการ', 'ไม่มีงานเปลี่ยนเครื่อง (Confirmed) ที่ต้อง stage', 'info'); return; }
    Swal.fire({ title: 'Auto-stage เคส?', html: 'สร้างงานเข้าคิว RD <b>' + targets.length + '</b> สาขา (Confirmed + เปลี่ยนเครื่อง)', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'ดำเนินการ', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; let n = 0; targets.forEach(p => { const kind = p.reason === 'transfer' ? 'tocoCo' : p.reason; if (window.RD && window.RD.addTrigger && window.RD.addTrigger({ branchId: p.shopCode, kind: kind, source: 'plan2026' })) n++; }); Swal.fire({ icon: 'success', title: 'เข้าคิวแล้ว', text: n + ' สาขา → คิว RD', timer: 1900, showConfirmButton: false }); loadAssetData(); });
  }
  function openRdCase(branchId, caseId) {
    try { localStorage.setItem('pc_rd_open_case', JSON.stringify({ branchId: branchId, caseId: caseId || '', at: Date.now() })); } catch (e) {}
    const q = '?branch=' + encodeURIComponent(branchId) + (caseId ? '&case=' + encodeURIComponent(caseId) : '');
    window.open('RD Cancel & Re-register.html' + q, '_blank');
  }
  function applyDrift(id) {
    const item = assetDrift.find(d => d.id === id); if (!item) return;
    google.script.run.withSuccessHandler(res => {
      if (res && res.status === 'success') { Swal.fire({ icon: 'success', title: 'อัปเดตทะเบียนแล้ว', text: res.message, timer: 1500, showConfirmButton: false }); loadAssetData(); }
      else Swal.fire('ไม่สำเร็จ', (res && res.message) || '-', 'error');
    }).applyAssetDrift(item);
  }
  function applyAllDrift() {
    Swal.fire({ title: 'APPLY ALL?', text: 'เพิ่มเครื่องให้สาขาใหม่ + apply การเปลี่ยนเครื่องทั้งหมด (ไม่รวม orphan)', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'ดำเนินการ', cancelButtonText: 'ยกเลิก' })
      .then(r => { if (!r.isConfirmed) return; google.script.run.withSuccessHandler(res => { Swal.fire({ icon: 'success', title: 'เสร็จสิ้น', text: 'อัปเดต ' + (res ? res.applied : 0) + ' รายการ', timer: 1600, showConfirmButton: false }); loadAssetData(); }).applyAllAssetDrift(); });
  }
  function sendCmposEmail() {
    const picked = [...document.querySelectorAll('.drift-pick:checked')].map(c => c.getAttribute('data-shop'));
    if (!picked.length) { Swal.fire('ยังไม่ได้เลือก', 'กรุณาติ๊กสาขาที่ต้องการส่งให้ CMPOS', 'info'); return; }
    google.script.run.withSuccessHandler(res => {
      if (!res || res.status !== 'success') { Swal.fire('ไม่สำเร็จ', (res && res.message) || '-', 'error'); return; }
      Swal.fire({
        title: 'ส่งคำขอให้ CMPOS', icon: 'success',
        html: `<div style="text-align:left; font-size:0.85rem;"><b>ถึง:</b> ${res.to}<br><b>เรื่อง:</b> ${res.subject}<br><b>สาขา (${picked.length}):</b> ${picked.join(', ')}</div>`,
        showCancelButton: true, confirmButtonText: '<i class="fa-solid fa-envelope"></i> เปิดอีเมล', cancelButtonText: 'ปิด', confirmButtonColor: '#2e934a'
      }).then(r => { if (r.isConfirmed && res.mailto) window.open(res.mailto, '_blank'); });
    }).requestCmposAssetData(picked);
  }

  function triggerUpdateMA() {
    Swal.fire({
      title: 'CONFIRM UPDATE?', text: "คำนวณและบันทึกวันที่เริ่ม–สิ้นสุด MA ปี 2026 ใหม่ทั้งหมด",
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'อัปเดต', cancelButtonText: 'ยกเลิก'
    }).then((r) => {
      if (!r.isConfirmed) return;
      Swal.fire({ title: 'UPDATING...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      google.script.run.withSuccessHandler(res => { Swal.fire('SUCCESS', res, 'success'); loadAssetData(); }).updateMAScheduleInSheet();
    });
  }

  function assetBuildFilters(data) {
    document.querySelectorAll('#asset-page select.col-filter').forEach(sel => {
      const key = sel.getAttribute('data-key');
      if (key === 'waEnd' || key === 'maBadge') return; // fixed-option filters
      const vals = [...new Set(data.map(i => String(i[key] || '').trim()))].filter(v => v !== "").sort();
      sel.innerHTML = '<option value="">ALL</option>';
      vals.forEach(v => { const o = document.createElement('option'); o.value = v.toUpperCase(); o.textContent = v; sel.appendChild(o); });
    });
  }

  function assetRender() {
    const start = (assetPage - 1) * assetRowsPerPage;
    const pageData = assetFiltered.slice(start, start + assetRowsPerPage);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let totalMA = 0, counts = { POS: 0, PRINT: 0 };

    assetFiltered.forEach(item => {
      if (item.maBadge === 'YES') {
        totalMA += parseFloat(item.maCost || 0);
        const b = String(item.typeBrand || '').toUpperCase();
        if (b.includes('POS')) counts.POS++; else if (b.includes('PRINT')) counts.PRINT++;
      }
    });
    document.getElementById('maSumAmount').textContent = totalMA.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('maSumVat').textContent = (totalMA * 0.07).toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('maSumGrand').textContent = (totalMA * 1.07).toLocaleString(undefined, { minimumFractionDigits: 2 }) + " THB";
    document.getElementById('maItemCounts').innerHTML = `<span class="ma-style-tag">POS: ${counts.POS}</span><span class="ma-style-tag">PRINT: ${counts.PRINT}</span>`;

    let html = '';
    pageData.forEach(item => {
      const waDate = assetParse(item.waEnd);
      const isWaExp = waDate && waDate < today;
      const maCostVal = parseFloat(item.maCost || 0);
      const maPeriod = (item.maStart && item.maStart !== "-") ? `<div style="font-size:0.55rem; color:#666; margin-top:2px;">${item.maStart} ถึง ${item.maEnd}</div>` : '';
      html += `<tr>
          <td class="text-center fw-bold" style="color:var(--pc-green);">${item.shopCode}</td>
          <td>${item.shopName}</td><td>${item.typeBrand}</td><td>${item.type}</td><td>${item.model || '-'}</td><td class="fw-bold">${item.sn}</td>
          <td class="text-center fw-bold">${item.yearsInService} Y</td>
          <td class="text-center"><span class="war-badge" style="color:${isWaExp ? 'var(--pc-red)' : 'var(--pc-green)'}; border-color:${isWaExp ? 'var(--pc-red)' : 'var(--pc-green)'};">${isWaExp ? 'EXPIRED' : 'AVAILABLE'}</span><br><small style="color:#888;">${item.waEnd || '-'}</small></td>
          <td class="text-center"><div class="d-flex align-items-center justify-content-center"><span class="ma-circle ${String(item.maBadge).toUpperCase() === 'YES' ? 'circle-yes' : 'circle-no'}"></span>${item.maBadge}</div><div class="fw-bold" style="color:#d9410e;">${maCostVal.toLocaleString()}.-</div>${maPeriod}</td>
          <td><span class="badge status-badge ${item.statusUse === 'Active' ? 'bg-success' : 'bg-secondary'}">${String(item.statusUse).toUpperCase()}</span></td>
        </tr>`;
    });
    document.getElementById('asset-list').innerHTML = html || '<tr><td colspan="10" class="text-center py-4">NO_DATA</td></tr>';
    const tp = Math.ceil(assetFiltered.length / assetRowsPerPage);
    document.getElementById('pageLabel').textContent = `PAGE ${assetPage} / ${tp || 1}`;
    document.getElementById('pageStats').textContent = `NODES: ${assetFiltered.length}`;
  }

  function filterAssets() {
    const g = document.getElementById("assetSearch").value.toUpperCase();
    const cols = Array.from(document.querySelectorAll('#asset-page .col-filter'));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    assetFiltered = assetAll.filter(item => {
      if (!Object.values(item).join(" ").toUpperCase().includes(g)) return false;
      return cols.every(input => {
        const val = input.value.toUpperCase().trim(); if (!val) return true;
        const key = input.getAttribute('data-key');
        if (key === 'waEnd') { const d = assetParse(item.waEnd); return ((d && d < today) ? 'EXPIRED' : 'AVAILABLE').includes(val); }
        if (key === 'maBadge') return String(item.maBadge).toUpperCase() === val;
        return String(item[key] || '').toUpperCase().includes(val);
      });
    });
    assetPage = 1; assetRender();
  }

  function sortTable(key) {
    if (assetSort.key === key) assetSort.asc = !assetSort.asc;
    else { assetSort.key = key; assetSort.asc = true; }
    assetFiltered.sort((a, b) => {
      let x = a[key] || '', y = b[key] || '';
      if (['yearsInService', 'maCost', 'shopCode'].includes(key)) { x = parseFloat(String(x).replace(/[^\d.]/g, '')) || 0; y = parseFloat(String(y).replace(/[^\d.]/g, '')) || 0; }
      return assetSort.asc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });
    assetRender();
  }

  function printAssetReport() {
    const maList = assetFiltered.filter(i => i.maBadge === 'YES');
    let content = '', sum = 0;
    const groups = { POS: { count: 0, cost: 0, desc: "Maintenance Service for Toshiba POS Systems" }, PRINT: { count: 0, cost: 0, desc: "Maintenance Service for Thermal Receipt Printers" } };
    maList.forEach(item => {
      const cost = parseFloat(item.maCost || 0); sum += cost;
      const b = String(item.typeBrand || '').toUpperCase();
      if (b.includes('POS')) { groups.POS.count++; groups.POS.cost += cost; } else { groups.PRINT.count++; groups.PRINT.cost += cost; }
      content += `<tr><td>${item.shopCode}</td><td>${item.shopName}</td><td>${item.typeBrand} / ${item.type} / ${item.model || '-'}</td><td>${item.sn}</td><td style="text-align:center;">${item.waEnd}</td><td style="text-align:center;">${item.maStart || '-'}</td><td style="text-align:center;">${item.maEnd || '-'}</td><td style="text-align:right;">${cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`;
    });
    let summary = '';
    for (const k in groups) if (groups[k].count > 0) {
      const excl = groups[k].cost, vat = excl * 0.07, incl = excl + vat;
      summary += `<tr><td>${groups[k].desc}</td><td style="text-align:center;">${groups[k].count}</td><td style="text-align:right;">${excl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td style="text-align:right;">${vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td style="text-align:right; font-weight:bold;">${incl.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`;
    }
    document.getElementById('tpl-reconUnit').textContent = maList.length;
    document.getElementById('tpl-reconAmount').textContent = sum.toLocaleString();
    document.getElementById('tpl-printContent').innerHTML = content;
    document.getElementById('tpl-summaryByGroup').innerHTML = summary;
    document.getElementById('tpl-sumExcl').textContent = sum.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('tpl-sumExclFinal').textContent = sum.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('tpl-sumVat').textContent = (sum * 0.07).toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('tpl-sumGrand').textContent = (sum * 1.07).toLocaleString(undefined, { minimumFractionDigits: 2 }) + " THB";
    document.getElementById('tpl-printDate').textContent = new Date().toLocaleString('th-TH');
    const win = window.open('', '', 'width=1100,height=900');
    if (!win) { Swal.fire('Popup ถูกบล็อก', 'กรุณาอนุญาต popup เพื่อพิมพ์รายงาน', 'warning'); return; }
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML).join('\n');
    win.document.write('<html><head><title>' + ASSET_REPORT_NAME + '</title><style>' + styles + '</style></head><body>' + document.getElementById('assetPrintTemplate').innerHTML + '</body></html>');
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  }

  function exportToExcel() {
    const maList = assetFiltered.filter(i => i.maBadge === 'YES');
    const headers = ["SHOP_CODE", "SHOP_NAME", "TYPE", "BRAND", "MODEL", "SERIAL_NUMBER", "WA_END", "MA_START", "MA_END", "MA_COST"];
    const keys = ["shopCode", "shopName", "typeBrand", "type", "model", "sn", "waEnd", "maStart", "maEnd", "maCost"];
    let csv = "\uFEFF" + headers.join(",") + "\n";
    maList.forEach(i => { csv += keys.map(k => `"${String(i[k] || '').replace(/"/g, '""')}"`).join(",") + "\n"; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = ASSET_REPORT_NAME + ".csv"; link.click();
    Swal.fire({ icon: 'success', title: 'DOWNLOAD SUCCESS', text: ASSET_REPORT_NAME + '.csv', timer: 1800, showConfirmButton: false });
  }

  function assetParse(d) {
    if (!d || d === "-") return null;
    const s = String(d);
    if (s.includes("/")) { const p = s.split("/"); let y = parseInt(p[2], 10); if (y > 2500) y -= 543; return new Date(y, p[1] - 1, p[0]); }
    return new Date(s);
  }
  function changeRowSize() { assetRowsPerPage = parseInt(document.getElementById('rowSize').value); assetPage = 1; assetRender(); }
  function nextPage() { if (assetPage < Math.ceil(assetFiltered.length / assetRowsPerPage)) { assetPage++; assetRender(); } }
  function prevPage() { if (assetPage > 1) { assetPage--; assetRender(); } }

  Object.assign(window, { initAsset, loadAssetData, changeRowSize, triggerUpdateMA, filterAssets, sortTable, printAssetReport, exportToExcel, nextPage, prevPage, toggleDrift, setDriftTab, applyDrift, applyAllDrift, sendCmposEmail, planCmpos, planOpenCase, openRdCase, stagePlanTrigger, stageAllPlan });
  // self-init on load in case the external script finishes loading after the shell's 300ms init call
  if (document.getElementById('asset-page')) initAsset();
