/* CMPOS Installation/Delivery form — external logic. Entry: window.initCmposForm.
   On submit, writes each device with a serial straight into the asset register. */
(function () {
  function val(id) { const e = document.getElementById(id); return e ? (e.value || '') : ''; }
  function byName(n) { const e = document.querySelector('#cmpos-page [name="' + n + '"]'); return e ? (e.value || '') : ''; }

  function initCmposForm() {
    const sel = document.getElementById('cmpos_branch');
    if (sel && !sel.dataset.filled && window.PC_BRANCH_MASTER) {
      sel.innerHTML = '<option value="">— เลือกสาขา —</option>' + window.PC_BRANCH_MASTER.map(b => `<option value="${b.id}">${b.id} · ${b.name}</option>`).join('');
      sel.dataset.filled = '1';
    }
    try { const h = (location.hash || ''); const q = new URLSearchParams(h.indexOf('?') >= 0 ? h.split('?')[1] : location.search); const shop = q.get('shop'); if (shop && sel) { sel.value = shop; cmposBranchChanged(); } } catch (e) {}
    const idEl = document.getElementById('installDate');
    if (idEl) idEl.onchange = function () { document.querySelectorAll('#cmpos-page .wa-start').forEach(el => el.value = this.value); };
  }

  function cmposBranchChanged() {
    const shop = document.getElementById('cmpos_branch').value;
    if (!shop) { document.getElementById('branchName').value = ''; document.getElementById('displayJobType').innerText = '—'; return; }
    google.script.run.withSuccessHandler(function (d) {
      document.getElementById('branchName').value = d.branchName || shop;
      document.getElementById('displayJobType').innerText = d.jobType || 'New Store';
      setupFields(d.jobType, d.items);
    }).getInitialData(shop);
  }
  function setupFields(jobType, items) {
    ['item_pos', 'item_printer_c', 'item_printer_k', 'item_drawer', 'item_ups', 'item_scanner'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'block'; });
    const s = document.getElementById('item_pos'); // open POS by default
    const b = document.getElementById('body_pos'); if (b) { b.style.display = 'block'; const ic = document.getElementById('icon_pos'); if (ic) ic.innerText = '−'; }
  }

  function toggleMainSection(id, iconId) { const x = document.getElementById(id), ic = document.getElementById(iconId); x.style.display = (x.style.display === 'none') ? 'block' : 'none'; ic.innerText = (x.style.display === 'none') ? '+' : '−'; }
  function toggleItem(id, iconId) { const x = document.getElementById(id), ic = document.getElementById(iconId); x.style.display = (x.style.display === 'none' || !x.style.display) ? 'block' : 'none'; ic.innerText = (x.style.display === 'none') ? '+' : '−'; }
  function toggleKitchenReq(checked) { const sn3 = document.getElementById('sn_3'); if (sn3) sn3.required = checked; const b = document.getElementById('body_pri_k'); if (b) b.style.opacity = checked ? '1' : '0.5'; }

  function cmposSubmit(e) {
    if (e) e.preventDefault();
    const shop = document.getElementById('cmpos_branch').value;
    if (!shop) { Swal.fire('เลือกสาขาก่อน', '', 'warning'); return false; }
    const devices = [];
    for (let i = 1; i <= 6; i++) {
      const sn = document.getElementById('sn_' + i); if (!sn) continue;
      const serial = (sn.value || '').trim(); if (!serial) continue;
      devices.push({ type: val('type_' + i), brand: val('brand_' + i), spec: val('spec_' + i), serial: serial, hwsw: byName('hwsw_' + i), waStart: byName('start_' + i), waEnd: byName('end_' + i) });
    }
    if (!devices.length) { Swal.fire('ยังไม่ได้กรอก Serial', 'กรอกอย่างน้อย 1 เครื่อง', 'info'); return false; }
    const payload = { shopCode: shop, branchName: document.getElementById('branchName').value, doNumber: byName('doNumber'), installDate: val('installDate'), staffName: byName('staffName'), devices: devices };
    const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.innerHTML = '🔄 กำลังบันทึกเข้าทะเบียน...';
    google.script.run.withSuccessHandler(function (res) {
      if (res === 'Success') {
        Swal.fire({ icon: 'success', title: 'อัพเดทเข้าทะเบียน Asset แล้ว', html: '<b>' + devices.length + '</b> เครื่อง → ' + shop + '<br><span style="font-size:0.85rem;color:#666;">ตรวจได้ที่หน้า ทะเบียนเครื่อง</span>', confirmButtonColor: '#2e934a' })
          .then(() => { document.getElementById('cmposForm').reset(); document.getElementById('cmpos_branch').value = shop; cmposBranchChanged(); });
      } else { Swal.fire('ผิดพลาด', res, 'error'); }
      btn.disabled = false; btn.innerHTML = 'ยืนยันการส่งงาน COMPLETE';
    }).processForm(payload);
    return false;
  }

  Object.assign(window, { initCmposForm, cmposBranchChanged, toggleMainSection, toggleItem, toggleKitchenReq, cmposSubmit });
  if (document.getElementById('cmpos-page')) initCmposForm();
})();
