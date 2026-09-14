/* ============================================================================
 *  js/store-java.js — ตัวแทน js/cloud-store.js สำหรับ backend Java (Spring Boot)
 *  โหลดไฟล์นี้ "แทน" cloud-store.js แล้วทุกหน้าใช้งานได้เหมือนเดิม (API ชื่อเดียวกัน)
 *    window.PC_CLOUD = { pull, pushAll, flushSync, exportFile, importFilePick, testAndSave }
 *  endpoint ฝั่ง Java: GET/POST /api/store · DELETE /api/store/{key} · POST /api/import
 * ========================================================================== */
(function () {
  'use strict';

  /* key ที่ย้ายขึ้น server — ชุดเดียวกับ cloud-store.js (แก้ที่นี่ที่เดียว) */
  var TRACKED = [
    'pc_mock_store_v28', 'pc_code_counter_v1', 'pc_product_promo', 'pc_code_requests',
    'pc_cat_forms', 'pc_subset_forms', 'pc_mode_forms',
    'pc_master_lists', 'pc_salemode_master', 'pc_brand_master',
    'pc_cat_flags', 'pc_cat_custom', 'pc_cat_attrs', 'pc_cat_stores',
    'pc_dep_flags', 'pc_dep_custom',
    'pc_product_flags', 'pc_product_coupon', 'pc_product_deleted', 'pc_platform_flags', 'pc_product_edits',
    'pc_subset_map', 'pc_subset_items', 'pc_subset_price', 'pc_itemset_comp',
    'pc_subset_meta', 'pc_subset_powders',
    'pc_vouchers', 'pc_member_cards', 'pc_member_coupons', 'pc_memo_docs',
    'pc_staff_discounts', 'pc_staff_conditions', 'pc_card_links', 'pc_co_promotions', 'pc_product_reopen',
    'pc_branch_tickets', 'pc_tender_requests', 'pc_tender_master', 'pc_tender_workflow', 'pc_op_zones',
    'pc_branch_edc', 'pc_branch_edc_history', 'pc_area_zones', 'pc_epay', 'pc_edc_status_log',
    'pc_billdiff_reports', 'pc_mock_isf',
    'pc_plan_actions', 'pc_cmpos_license_req', 'pc_plan_cmpos_tasks', 'pc_plan_added', 'pc_asset_disposal',
    'pc_notify_settings', 'pc_notify_templates', 'pc_notify_log',
    'pc_lock_settings', 'pc_code_settings', 'pc_import_enabled',
    'pc_issue_buttons', 'pc_report_settings',
    'pc_calendar_settings', 'pc_branch_hours', 'pc_login_settings',
    'pc_cashier_users', 'pc_brands', 'pc_active_brand', 'pc_branch_staff_roster',
    'pc_permissions', 'pc_permissions_rwd'
  ];
  /* คีย์ที่เป็น "รายการงาน" (array ของ object ที่มี id) → merge ไม่ทับตอน pull */
  var MERGE_LIST_KEYS = ['pc_code_requests', 'pc_branch_tickets', 'pc_tender_requests', 'pc_billdiff_reports',
    'pc_staff_discounts', 'pc_staff_conditions', 'pc_co_promotions', 'pc_product_reopen',
    'pc_plan_actions', 'pc_cmpos_license_req', 'pc_plan_cmpos_tasks', 'pc_asset_disposal', 'pc_notify_log'];
  var STAMP_FIELDS = ['doneAt', 'downloadedAt', 'updatedAt', 'savedAt', 'confirmedAt', 'createdAt', 'ts', 'at', 'time'];

  var CFG_KEY = 'pc_java_cfg';
  /* ค่าเริ่มต้น: เสิร์ฟหน้าเว็บจาก Java ตัวเดียวกัน → ใช้ origin เดิม ไม่ต้องตั้งอะไร */
  var DEFAULT_CFG = { url: location.origin, token: '' };
  function cfg() { try { var c = JSON.parse(localStorage.getItem(CFG_KEY)); if (c && c.url) return c; } catch (e) {} return DEFAULT_CFG; }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
  function base() { return String(cfg().url || '').replace(/\/+$/, ''); }
  function enabled() { return !!base(); }
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Authorization': 'Bearer ' + (cfg().token || '') };
    opts.headers = Object.assign(h, opts.headers || {});
    return fetch(base() + path, opts);
  }

  var _set = localStorage.setItem.bind(localStorage);

  function _stamp(o) { var m = 0; if (!o || typeof o !== 'object') return 0; STAMP_FIELDS.forEach(function (f) { var v = Number(o[f]); if (!isNaN(v) && v > m) m = v; }); return m; }
  function mergeList(localStr, cloudStr) {
    var L, C;
    try { L = JSON.parse(localStr); } catch (e) { L = null; }
    try { C = JSON.parse(cloudStr); } catch (e) { C = null; }
    if (!Array.isArray(L)) return cloudStr;
    if (!Array.isArray(C)) return localStr;
    var out = [], seen = {}, cMap = {};
    C.forEach(function (r) { if (r && r.id != null) cMap[String(r.id)] = r; });
    L.forEach(function (r) {
      var id = (r && r.id != null) ? String(r.id) : null;
      if (!id) { out.push(r); return; }
      seen[id] = 1; var c = cMap[id];
      out.push(c && _stamp(c) > _stamp(r) ? c : r);
    });
    C.forEach(function (r) { var id = (r && r.id != null) ? String(r.id) : null; if (!id || seen[id]) return; seen[id] = 1; out.push(r); });
    return JSON.stringify(out);
  }

  /* ---- pull: Java → localStorage ---- */
  async function pull() {
    if (!enabled()) return { changed: false, reason: 'not-configured' };
    var r = await api('/api/store'); if (!r.ok) throw new Error('pull ' + r.status);
    var d = await r.json(); var keys = d.keys || {}; var changed = false, n = 0;
    TRACKED.forEach(function (k) {
      if (keys[k] == null) return;
      n++;
      var cur = localStorage.getItem(k);
      if (cur === keys[k]) return;
      if (MERGE_LIST_KEYS.indexOf(k) !== -1 && cur != null) {
        var mg = mergeList(cur, keys[k]);
        if (mg !== cur) { _set(k, mg); changed = true; }
        if (mg !== keys[k]) queuePush(k);
        return;
      }
      _set(k, keys[k]); changed = true;
    });
    return { changed: changed, keys: n };
  }

  /* ---- push (debounce 1.2 วิ) + flush ทันทีตอนปิดหน้า ---- */
  var _pending = {}, _timer = null;
  function queuePush(k) { _pending[k] = 1; if (_timer) return; _timer = setTimeout(flush, 1200); }
  function bodyOf(pend) { var b = {}; pend.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) b[k] = v; }); return b; }
  async function flush() {
    _timer = null; if (!enabled()) { _pending = {}; return; }
    var pend = Object.keys(_pending); _pending = {}; if (!pend.length) return;
    setStatus('sync');
    try {
      var body = bodyOf(pend);
      if (Object.keys(body).length) await api('/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setStatus('ok');
    } catch (e) { setStatus('err'); }
  }
  function flushSync() {
    if (!enabled()) return;
    var pend = Object.keys(_pending); if (!pend.length) return;
    _pending = {}; if (_timer) { clearTimeout(_timer); _timer = null; }
    var body = bodyOf(pend); if (!Object.keys(body).length) return;
    try {
      fetch(base() + '/api/store', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg().token || '') },
        body: JSON.stringify(body) });
    } catch (e) {}
  }
  async function pushAll() {
    if (!enabled()) return false;
    var body = bodyOf(TRACKED);
    if (!Object.keys(body).length) return true;
    var r = await api('/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  }

  try {
    localStorage.setItem = function (k, v) { _set(k, v); if (TRACKED.indexOf(k) !== -1 && enabled()) queuePush(k); };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSync(); });
    window.addEventListener('pagehide', flushSync);
    window.addEventListener('beforeunload', flushSync);
  } catch (e) {}

  /* ---- backup ไฟล์ (ทำงานได้แม้ไม่มี server) ---- */
  function exportFile() {
    var out = { _app: 'potato-promo', _exportedAt: new Date().toISOString(), keys: {} };
    TRACKED.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) out.keys[k] = v; });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'potato-promo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function importFilePick() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var fd = new FormData(); fd.append('file', f);
      api('/api/import', { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (d) {
        if (window.Swal) Swal.fire({ icon: 'success', title: 'นำเข้าแล้ว', html: 'บันทึก <b>' + (d.imported || 0) + '</b> ชุดข้อมูลเข้า Java', timer: 1800, showConfirmButton: false }).then(reloadOnce);
        else reloadOnce();
      }).catch(function (e) { if (window.Swal) Swal.fire('ผิดพลาด', String(e), 'error'); });
    };
    inp.click();
  }
  function reloadOnce() { try { sessionStorage.setItem('pc_cloud_pulled', '1'); } catch (e) {} location.reload(); }

  async function testAndSave(url, token) {
    url = String(url || '').trim().replace(/\/+$/, ''); token = String(token || '').trim();
    if (!url) throw new Error('กรอก URL ของ Java backend');
    var r = await fetch(url + '/api/health', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) throw new Error('ต่อ Java ไม่ได้ (health ' + r.status + ')');
    saveCfg({ url: url, token: token });
    await pushAll();
    return true;
  }

  /* ---- ชิปสถานะ (โผล่เฉพาะตอนซิงค์มีปัญหา — เหมือน cloud-store.js) ---- */
  var _chip = null;
  function setStatus(s) {
    if (!_chip) return;
    var err = (s === 'err');
    _chip.style.display = err ? 'inline-flex' : 'none';
    _chip.style.borderColor = err ? '#c0392b' : '#6c757d';
    _chip.style.color = err ? '#c0392b' : '#6c757d';
    _chip.innerHTML = '<i class="fas fa-triangle-exclamation"></i><span>ซิงค์กับเซิร์ฟเวอร์มีปัญหา</span>';
  }
  function chip() {
    if (_chip) return;
    _chip = document.createElement('button');
    _chip.id = 'pcJavaChip';
    _chip.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;display:none;align-items:center;gap:7px;background:#fff;border:1.6px solid #6c757d;border-radius:999px;padding:7px 13px;font-family:Kanit,sans-serif;font-weight:700;font-size:.8rem;cursor:pointer';
    _chip.onclick = function () { flush(); };
    document.body.appendChild(_chip);
  }

  window.PC_CLOUD = { pull: pull, pushAll: pushAll, flushSync: flushSync, exportFile: exportFile,
    importFilePick: importFilePick, testAndSave: testAndSave, cfg: cfg, TRACKED: TRACKED };

  /* pull ครั้งแรกตอนเปิดแอป (reload 1 ครั้งถ้าข้อมูลต่างจากในเครื่อง) */
  function boot() {
    chip();
    if (!enabled()) return;
    pull().then(function (res) {
      if (res && res.changed) {
        try { if (sessionStorage.getItem('pc_cloud_pulled')) return; sessionStorage.setItem('pc_cloud_pulled', '1'); } catch (e) {}
        location.reload();
      }
    }).catch(function () { setStatus('err'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
