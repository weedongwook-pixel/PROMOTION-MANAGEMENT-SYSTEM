/* Maintenance / Audit request — external logic. Entry: window.initMaintenance.
   Type/Model/Spec datalists + auto-fill come from the hardware master (getMasterData). */
(function () {
  let masterMapping = {};
  function fillDatalist(id, items) { const l = document.getElementById(id); if (!l) return; l.innerHTML = (items || []).map(i => `<option value="${i}"></option>`).join(''); }
  function initAutoFill(row) {
    if (!row) return;
    const t = row.querySelector('input[name="type[]"], input[name="audit_type[]"]');
    const m = row.querySelector('input[name="model[]"], input[name="audit_model[]"]');
    const s = row.querySelector('input[name="spec[]"], input[name="audit_spec[]"]');
    if (!t) return;
    t.addEventListener('input', function () {
      const mp = masterMapping[this.value];
      if (mp) { if (m) m.value = mp.model || ''; if (s && mp.spec) s.value = mp.spec; [m, s].forEach(el => { if (el) { el.style.backgroundColor = '#e8f0fe'; setTimeout(() => el.style.backgroundColor = '', 700); } }); }
    });
  }
  function initMaintenance() {
    const bl = document.getElementById('branchList');
    if (bl && window.PC_BRANCH_MASTER) bl.innerHTML = window.PC_BRANCH_MASTER.map(b => `<option value="${b.id} ${b.name}"></option>`).join('');
    google.script.run.withSuccessHandler(function (data) {
      masterMapping = (data && data.mapping) || {};
      fillDatalist('typeList', data.types); fillDatalist('modelList', data.models); fillDatalist('specList', data.specs || []);
      initAutoFill(document.querySelector('#maint-page #repairItems .item-box'));
      initAutoFill(document.querySelector('#maint-page #auditItems .item-box'));
    }).getMasterData();
  }
  function addItem(containerId) {
    const container = document.getElementById(containerId);
    const isAudit = containerId === 'auditItems';
    const row = document.createElement('div');
    row.className = 'item-box';
    const p = isAudit ? 'audit_' : '';
    const snName = isAudit ? 'audit_sn[]' : 'oldSn[]';
    const req = isAudit ? '' : 'required';
    row.innerHTML = `<div class="row g-2">
        <div class="col-4"><label class="form-label">ประเภท</label><input class="form-control" name="${p}type[]" list="typeList" ${req}></div>
        <div class="col-4"><label class="form-label">รุ่น</label><input class="form-control" name="${p}model[]" list="modelList" ${req}></div>
        <div class="col-4"><label class="form-label">สเปค</label><input class="form-control" name="${p}spec[]" list="specList" ${req}></div>
        <div class="col-12 mt-2"><input type="text" class="form-control" name="${snName}" placeholder="Serial Number" ${req}></div>
      </div>
      <button type="button" class="btn mt-1 p-0 text-danger small" style="border:none;background:none;font-weight:800;" onclick="this.parentElement.remove()">[ ลบรายการ / Remove ]</button>`;
    container.appendChild(row);
    initAutoFill(row);
  }
  function handleMaintSubmit(e) {
    if (e) e.preventDefault();
    const form = document.getElementById('maForm');
    if (!form.checkValidity()) { form.reportValidity(); return false; }
    const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังส่ง...';
    const fd = new FormData(form); const obj = {};
    fd.forEach((v, k) => { if (obj[k] !== undefined) { if (!Array.isArray(obj[k])) obj[k] = [obj[k]]; obj[k].push(v); } else obj[k] = v; });
    google.script.run.withSuccessHandler(function (res) {
      if (String(res).startsWith('Error')) { Swal.fire('ผิดพลาด', res, 'error'); btn.disabled = false; btn.innerHTML = 'ส่งข้อมูลแผนก IT (SUBMIT)'; return; }
      document.getElementById('form-content').style.display = 'none';
      document.getElementById('success-page').style.display = 'block';
      document.getElementById('display-ticket').innerText = obj.ticketNo || res;
    }).processMaintenanceForm(obj, [], null);
    return false;
  }
  Object.assign(window, { initMaintenance, addItem, handleMaintSubmit });
  if (document.getElementById('maint-page')) initMaintenance();
})();
