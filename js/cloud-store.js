/* ============================================================================
 *  js/cloud-store.js — Client adapter: ซิงค์ "งานโปรโมชั่น" ขึ้น Cloudflare (D1)
 *  ---------------------------------------------------------------------------
 *  ทำ 2 อย่าง:
 *   (1) BACKUP/EXPORT — ดาวน์โหลด/กู้คืนข้อมูลโปรเป็นไฟล์ .json  (ใช้ได้ทันที ไม่ต้องมี cloud)
 *   (2) CLOUD SYNC   — pull ตอนเปิด + push อัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยน (เมื่อตั้งค่า Worker URL+Token)
 *
 *  ย้ายเฉพาะ key ของ "งานโปรโมชั่น" ก่อน (ส่วนอื่นยังไม่แตะ) — ดู TRACKED
 *  ปลอดภัย: ถ้ายังไม่ตั้งค่า cloud = เงียบสนิท ทำงานเหมือนเดิม (localStorage)
 * ========================================================================== */
(function () {
  'use strict';

  // key ที่จะย้ายขึ้น cloud — เฉพาะ "งานโปรโมชั่น + ตั้งค่าโปร + การเข้าระบบ" (ส่วนอื่นยังไม่แตะ)
  var TRACKED = [
    // --- ข้อมูลโปรหลัก + โค้ด ---
    'pc_mock_store_v28', 'pc_code_counter_v1', 'pc_product_promo', 'pc_code_requests',
    'pc_abbr_requests', 'pc_abbr_log',                            // คำขอเปลี่ยนตัวย่อ + ประวัติ (RD ยื่น → IT อนุมัติ ข้ามเครื่อง)
    'pc_subset_edits', 'pc_product_edits', 'pc_voucher_comp_map', // ผลการเปลี่ยนตัวย่อ + ตารางคู่รหัส Voucher รอบปี
    'pc_promo_files',                                             // ไฟล์แนบโปร (เปิดข้ามเครื่องได้)
    // --- ตั้งค่าที่เกี่ยวกับฟอร์ม/โปรโมชั่น ---
    'pc_cat_forms', 'pc_subset_forms', 'pc_mode_forms',           // Form Display (คุมการแสดงในฟอร์ม)
    'pc_master_lists', 'pc_salemode_master', 'pc_brand_master',   // master lists / sale mode / brand
    'pc_cat_flags', 'pc_cat_custom', 'pc_cat_attrs', 'pc_cat_stores', // หมวดสินค้า (เปิด/ปิด/ชื่อ/สาขา)
    'pc_dep_flags', 'pc_dep_custom',                              // แผนก
    'pc_product_flags', 'pc_product_coupon', 'pc_product_deleted', 'pc_platform_flags', 'pc_product_edits', // สินค้า/แพลตฟอร์ม/ราคาแก้รายสาขา
    'pc_subset_map', 'pc_subset_items', 'pc_subset_price', 'pc_itemset_comp', // subset ↔ ผง / item set
    'pc_subset_meta', 'pc_subset_powders', 'pc_subset_custom', 'pc_subset_deleted', 'pc_addon_subsets', // subset ที่เพิ่ม/แก้/ลบเอง + ผงในชุด
    // --- master data ที่ต้อง share ทุกเครื่อง (voucher/บัตร/ผูกคูปอง/Memo) ---
    'pc_vouchers', 'pc_member_cards', 'pc_member_coupons', 'pc_memo_docs',
    'pc_staff_discounts', 'pc_staff_conditions',                 // ส่วนลดพนักงาน (คำขอ + เงื่อนไข)
    'pc_card_links',                                             // ผูกบัตร (สิทธิ์บัตรสมาชิก VIP → IT ผูก Type Code)
    'pc_co_promotions',                                          // Co-Promotion (MKT แจ้ง ACC + IT interface ERP)
    'pc_product_reopen',                                         // RD แจ้งเปิด/ปิดปุ่มสินค้าเดิม (→ IT ยืนยัน)
    // --- งานสาขา (ticket/tender/ปิดบิลไม่ตรง) — เดิมไม่ซิงค์ = "ทำงานหน้าใครหน้ามัน" ---
    'pc_branch_tickets',                                         // ปัญหาสาขาแจ้ง (IT queue / Team queue)
    'pc_tender_requests', 'pc_tender_master', 'pc_tender_workflow', 'pc_op_zones', 'pc_branch_edc', 'pc_branch_edc_history', 'pc_area_zones', 'pc_epay', 'pc_edc_status_log', // Tender + workflow + OP↔Zone + EDC + โซน/Area + e-Payment + log สถานะเครื่อง
    'pc_billdiff_reports',                                       // แจ้งปิดบิลไม่ตรง (Diff)
    'pc_mock_isf',                                               // Item Set Builder (งานทำปุ่ม)
    'pc_plan_actions', 'pc_cmpos_license_req', 'pc_plan_cmpos_tasks', 'pc_plan_added', 'pc_asset_disposal', // งาน IT/แผนเครื่อง
    // --- ตั้งค่าระบบที่ทุกคนต้องเห็นตรงกัน ---
    'pc_notify_settings', 'pc_notify_templates', 'pc_notify_log', // การแจ้งเตือน (routing + template + log)
    'pc_lock_settings', 'pc_code_settings', 'pc_import_enabled', // ตั้งค่าล็อกแจ้งล่วงหน้า / โค้ด / เปิดปิด import ฟอร์ม
    'pc_issue_buttons', 'pc_report_settings',                    // ปุ่มแจ้งปัญหา + โหมดยืนยันสาขา
    'pc_calendar_settings', 'pc_branch_hours', 'pc_login_settings', // ปฏิทิน / เวลาสาขา / หน้า login
    'pc_cashier_users', 'pc_brands', 'pc_active_brand',          // แคชเชียร์ / แบรนด์
    'pc_branch_staff_roster',                                    // ทะเบียนพนักงานสาขา (รหัส→ชื่อ) สะสมเองจากหน้าแจ้งปัญหา (ยังไม่มี API พนักงาน)
    // --- การเข้าระบบ / สิทธิ์ ---
    'pc_permissions', 'pc_permissions_rwd'                        // สิทธิ์เข้าถึง + อ่าน/แก้/ลบ (บัญชีผู้ใช้อยู่ใน pc_mock_store_v28 แล้ว)
  ];
  // หมายเหตุ: ไม่ซิงค์ค่า session รายเครื่อง (pc_role/pc_userName/pc_bv_branch) — แต่ละคนล็อกอินเองในเครื่องตัวเอง
  var CFG_KEY = 'pc_cloud_cfg';

  /* ===== คีย์ที่เป็น "รายการงาน" (array ของ object ที่มี id) → ตอน pull ให้ MERGE ไม่ทับ =====
     เดิม pull เอาค่าจากคลาวด์ทับทั้งก้อน → งานที่เพิ่งกดบันทึกในเครื่อง (ยัง push ไม่ทัน)
     หายตอนรีเฟรช (เช่น กดยืนยันที่แท็บ IT หน้าแจ้งเพิ่มโค้ด/บัตร แล้วงานเด้งกลับสถานะเดิม) */
  var MERGE_LIST_KEYS = ['pc_subset_custom', 'pc_code_requests', 'pc_branch_tickets', 'pc_tender_requests', 'pc_billdiff_reports',
    'pc_staff_discounts', 'pc_staff_conditions', 'pc_co_promotions', 'pc_product_reopen',
    'pc_plan_actions', 'pc_cmpos_license_req', 'pc_plan_cmpos_tasks', 'pc_asset_disposal', 'pc_notify_log',
    'pc_abbr_requests', 'pc_abbr_log'];   // คำขอเปลี่ยนตัวย่อ: รวมราย id (ห้ามทับทั้งก้อน — ใบที่ยื่น/ลบจากอีกเครื่องจะหาย)
  var STAMP_FIELDS = ['doneAt', 'downloadedAt', 'updatedAt', 'savedAt', 'confirmedAt', 'createdAt', 'ts', 'at', 'time'];
  function _stamp(o) {
    var m = 0; if (!o || typeof o !== 'object') return 0;
    STAMP_FIELDS.concat(['deletedAt', 'excludeAt']).forEach(function (f) {
      var raw = o[f]; if (raw == null || raw === '') return;
      var v = Number(raw);
      if (isNaN(v)) { v = Date.parse(raw); }              // รองรับ ISO string (เดิม Number() = NaN → stamp 0 ทุกใบ)
      if (!isNaN(v) && v > m) m = v;
    });
    return m;
  }
  /* ---- FX-P84 — กุญแจประจำแถวสำหรับตัวรวมข้อมูล (merge) ----------------------
     เดิมรู้จักแค่ฟิลด์ `id` → แถวที่ไม่มี id (เช่น store.npdProducts = สินค้าที่ IT ขึ้นปุ่มจาก NPD/ผง
     ซึ่งใช้ itemCode เป็นกุญแจ) ถูกมองว่า "ไม่มีตัวตน" → ตอน pull ตัวรวมทิ้งแถวฝั่งคลาวด์ทั้งหมด
     = เครื่องอื่นไม่เห็นสินค้า NPD ใหม่ (แล้ว push รอบถัดไปยังลบของบนคลาวด์ทับอีก) */
  var ALT_ID = ['itemCode', 'reqId', 'ssCode', 'code', 'no', 'email', 'username', 'key', 'name'];
  function _idOf(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.id != null && o.id !== '') return 'id:' + String(o.id);
    for (var i = 0; i < ALT_ID.length; i++) { var v = o[ALT_ID[i]]; if (v != null && v !== '') return ALT_ID[i] + ':' + String(v); }
    return null;
  }
  /* ---- FX-P66 — ตราลายเซ็นข้อมูลเป็น "แฮช" ไม่ใช่สำเนา JSON ทั้งก้อน ----------
     เดิมเก็บ sig = ค่าดิบทั้งก้อน → pc_camp_edit_v2 + pc_key_edit_v2 บวมเป็นสำเนาที่สองของฐาน
     (วัดได้ 916KB + 817KB) → localStorage ชน 5MB → เขียนไม่ลง (QuotaExceededError)
     → pull/บันทึกล้มเงียบ = อาการ "ลบแล้วฟื้น / แก้แล้วไม่อยู่" */
  function _sig(s) {
    s = String(s == null ? '' : s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return s.length + '-' + h.toString(36);
  }
  /* ย้ายของเดิม (sig = JSON ดิบ) ให้เป็นแฮช — แฮชของค่าดิบ = แฮชของค่าปัจจุบัน จึงไม่หลงว่า "เปลี่ยน" */
  function _migSig(m) {
    var ch = false;
    Object.keys(m || {}).forEach(function (k) {
      var e = m[k];
      if (e && typeof e.sig === 'string' && e.sig.length > 48) { e.sig = _sig(e.sig); ch = true; }
    });
    return ch;
  }
  /* ---- เวลาแก้ไขราย key (หน้าตั้งค่า/master/สิทธิ์) — FX-P61 -----------------------
     เดิม: key กลุ่มนี้ pull มาเมื่อไหร่ = ทับทั้งก้อน → คนที่เพิ่งกดบันทึกในเครื่องโดนของเก่าทับได้
     ตอนนี้: จำเวลาที่ค่าในเครื่องเปลี่ยน แล้วส่งคู่กับคีย์เงา `<key>::_ts` — ตอน pull เทียบเวลา ใครใหม่กว่าชนะ */
  var KEY_TS_KEY = 'pc_key_edit_v2', TS_SUFFIX = '::_ts';
  function keyTs() { try { var m = JSON.parse(localStorage.getItem(KEY_TS_KEY) || '{}') || {}; if (_migSig(m)) saveKeyTs(m); return m; } catch (e) { return {}; } }
  function saveKeyTs(m) { try { localStorage.setItem(KEY_TS_KEY, JSON.stringify(m)); } catch (e) {} }
  function noteKeyEdit(k, val) {
    var m = keyTs(), e = m[k], sg = _sig(val);
    if (e && e.sig === sg) return Number(e.ts) || 0;
    /* ครั้งแรกที่เห็น key นี้ = ไม่รู้ว่าเก่าหรือใหม่ → ts 0 ให้คลาวด์ชนะ (กันเครื่องที่ข้อมูลค้างดันทับ) */
    var ts = e ? Date.now() : 0; m[k] = { ts: ts, sig: sg }; saveKeyTs(m); return ts;
  }
  function markKeyFromCloud(k, val, ts) { var m = keyTs(); m[k] = { ts: Number(ts) || 0, sig: _sig(val) }; saveKeyTs(m); }
  /* แนบเวลาแก้ไขไปกับทุก key ที่จะ push */
  function withKeyTs(body) {
    Object.keys(body).forEach(function (k) {
      if (k === STORE_KEY || k === META_CLOUDKEY || k.indexOf(CAMP_PREFIX) === 0 || k.indexOf(TS_SUFFIX) > 0) return;
      body[k + TS_SUFFIX] = String(noteKeyEdit(k, body[k]));
    });
    return body;
  }
  /* รวมรายการ local + cloud: union ตาม id · ตัวที่ stamp ใหม่กว่าชนะ · ไม่มี stamp = ของในเครื่องชนะ */
  function mergeList(localStr, cloudStr) {
    var L, C;
    try { L = JSON.parse(localStr); } catch (e) { L = null; }
    try { C = JSON.parse(cloudStr); } catch (e) { C = null; }
    if (!Array.isArray(L)) return { str: cloudStr, fromCloud: true };
    if (!Array.isArray(C)) return { str: localStr, fromCloud: false };
    var out = [], seen = {}, cMap = {};
    C.forEach(function (r) { var id = _idOf(r); if (id) cMap[id] = r; });
    L.forEach(function (r) {
      var id = _idOf(r);
      if (!id) { out.push(r); return; }
      seen[id] = 1;
      var c = cMap[id];
      out.push(c && _stamp(c) > _stamp(r) ? c : r);
    });
    C.forEach(function (r) { var id = _idOf(r); if (!id || seen[id]) return; seen[id] = 1; out.push(r); });
    return { str: JSON.stringify(out), fromCloud: false };
  }

  /* ===== phase 2: ซิงค์ "งานโปร (pc_mock_store_v28)" แบบแยกราย campaign =====
     แทนที่จะดันทั้งก้อน → แตกเป็น key ราย campaign (promo::c::<ชื่อ>) + meta (promo::meta)
     → MKT/IT/OP หลายคนแก้คนละแคมเปญพร้อมกัน = เขียนคนละ key = ไม่ทับกัน
     ลบแคมเปญ → ลบเฉพาะ key ที่ "เครื่องนี้เคยรู้จัก" (_snap) เท่านั้น = ไม่ไปลบของคนอื่น */
  var STORE_KEY = 'pc_mock_store_v28';
  var CAMP_PREFIX = 'promo::c::';
  var META_CLOUDKEY = 'promo::meta';
  var _snap = {};              // cloudKey -> ค่าที่ซิงค์ล่าสุด (รู้ว่าเครื่องนี้เคยเห็นแคมเปญไหน)
  var _migrateLegacy = false;  // true ถ้า cloud ยังเก็บแบบก้อนเดียว (ต้อง migrate ตอน push)
  var _hydrated = false;       // ห้ามส่งข้อมูลจากแท็บเก่าก่อนอ่าน Cloud สำเร็จ

  /* `working` สร้างได้จาก `months` อยู่แล้ว จึงไม่เก็บซ้ำใน localStorage.
     รองรับ backup/ข้อมูล cloud รุ่นเก่าที่ยังมี field นี้โดยตัดออกก่อนเขียนลงเครื่อง. */
  function compactStoreRaw(raw) {
    try {
      var s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || typeof s !== 'object') return typeof raw === 'string' ? raw : JSON.stringify(raw);
      var disk = Object.assign({}, s); delete disk.working;
      return JSON.stringify(disk);
    } catch (e) { return typeof raw === 'string' ? raw : JSON.stringify(raw); }
  }
  // Keep a recoverable copy before a Cloud pull replaces the browser store.
  // IndexedDB is used because localStorage is already close to its quota.
  function archiveBeforeReplace(raw) {
    if (!raw) return Promise.resolve();
    if (!window.indexedDB) return Promise.reject(new Error('Cannot archive local data before Cloud pull'));
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open('pc_sync_history', 1);
      open.onupgradeneeded = function () { open.result.createObjectStore('snapshots', { autoIncrement: true }); };
      open.onerror = function () { reject(open.error || new Error('History database unavailable')); };
      open.onsuccess = function () {
        var db = open.result, tx = db.transaction('snapshots', 'readwrite'), bucket = tx.objectStore('snapshots');
        bucket.add({ at: new Date().toISOString(), reason: 'before-cloud-pull', store: raw });
        tx.oncomplete = function () {
          var cleanup = db.transaction('snapshots', 'readwrite'), object = cleanup.objectStore('snapshots');
          var keys = object.getAllKeys();
          keys.onsuccess = function () { (keys.result || []).slice(0, -12).forEach(function (key) { object.delete(key); }); };
          cleanup.oncomplete = function () { db.close(); };
          cleanup.onerror = function () { db.close(); };
          resolve();
        };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('History archive failed')); };
        tx.onabort = function () { db.close(); reject(tx.error || new Error('History archive aborted')); };
      };
    });
  }

  /* Cloud ยังเก็บ working เพื่อให้ client รุ่นก่อนหน้าทำงานต่อได้; ถ้า local disk รุ่นใหม่
     ไม่มี working ให้สร้าง view นี้จาก months ก่อนแบ่งข้อมูลรายแคมเปญ. */
  function workingForStore(s) {
    if (s && Array.isArray(s.working) && s.working.length) return s.working;
    var groups = {}, order = [];
    Object.keys((s && s.months) || {}).forEach(function (month) {
      ((s.months || {})[month] || []).forEach(function (r) {
        if (!r || !r.campaign) return;
        var key = r.campaign + '||' + month + '||' + (r.shortName || '');
        if (!groups[key]) { groups[key] = { month: month, rows: [] }; order.push(key); }
        groups[key].rows.push(r);
      });
    });
    return order.map(function (key) {
      var g = groups[key], rows = g.rows, f = rows[0] || {};
      var total = rows.reduce(function (n, r) { return n + (parseFloat(r.gross) || 0) * (parseFloat(r.qty) || 1); }, 0);
      var textDiscount = typeof f.discount === 'string' && /[%฿]/.test(f.discount);
      return {
        timestamp: f.timestamp || f.submittedDate || '', month: g.month, campaign: f.campaign,
        promoType: f.promoType || f.typePromotion || '', start: f.start, end: f.end,
        stores: f.stores, saleMode: f.saleMode, itStatus: f.itStatus, opStatus: f.opStatus,
        codePromotion: f.codePromotion || '', codeItemSet: f.codeItemSet || f.itemPromotion || '',
        kitchen: f.kitchen || '', shortName: f.shortName || '', itemCode: '', itemNameEN: '', qty: '',
        gross: textDiscount ? '' : total.toFixed(2), discount: textDiscount ? f.discount : '', netPrice: '',
        detail: f.detail, mechanic: f.mechanic, attachment: f.attachment || '',
        updatedBy: f.updatedBy || '', updatedDate: f.updatedDate || '', cancelReason: f.cancelReason || '',
        cateRemark: f.cateRemark || '', minAmount: f.minAmount || 0, memoUrl: f.memoUrl || '',
        changeStatus: f.changeStatus || '', reason: f.reason || '', submittedDate: f.submittedDate || '',
        itDoneDate: f.itDoneDate || '', opDoneDate: f.opDoneDate || '', posReady: !!f.posReady,
        wentLive: !!f.wentLive, cancelHandled: !!f.cancelHandled, cancelAction: f.cancelAction || '',
        cancelHandledDate: f.cancelHandledDate || '', removedFromPos: !!f.removedFromPos,
        codeBurned: !!f.codeBurned, codesReturned: f.codesReturned || [], itRemark: f.itRemark || '',
        discountText: f.discountText || '', condition: f.condition || '', rejectReason: f.rejectReason || '',
        rejectCount: f.rejectCount || 0, extendCodeNote: f.extendCodeNote || '', proposalKind: f.proposalKind || '',
        branchNote: f.branchNote || '', _wasItemSet: f._wasItemSet || false, typeSel: f.typeSel || '',
        txnDate: f.txnDate || f.submittedDate || f.timestamp || '', submittedBy: f.submittedBy || f.reporter || '',
        reporter: f.reporter || f.submittedBy || '',
        submissionId: f.submissionId || '', submissionBatchId: f.submissionBatchId || '',
        submissionForm: f.submissionForm || '', submissionExpectedButtons: f.submissionExpectedButtons || 0,
        customerGroup: f.customerGroup || '', crmTarget: f.crmTarget || '', crmTargetName: f.crmTargetName || ''
      };
    });
  }

  function campOf(r) { return String((r && r.campaign) || '__nocamp'); }
  function campCloudKey(c) { return CAMP_PREFIX + encodeURIComponent(c); }
  function splitStore(s) {
    var meta = {}, camps = {};
    Object.keys(s || {}).forEach(function (k) { if (k !== 'working' && k !== 'months') meta[k] = s[k]; });
    workingForStore(s).forEach(function (r) { var c = campOf(r); (camps[c] = camps[c] || { w: [], m: {} }).w.push(r); });
    Object.keys((s && s.months) || {}).forEach(function (mk) {
      (s.months[mk] || []).forEach(function (r) { var c = campOf(r); (camps[c] = camps[c] || { w: [], m: {} }); (camps[c].m[mk] = camps[c].m[mk] || []).push(r); });
    });
    return { meta: meta, camps: camps };
  }

  // Build the D1 compare-and-swap payload from item-grain form rows without
  // touching the browser store. The caller adds any code/file key writes and
  // sends the complete payload with commitSubmission().
  async function prepareCampaignWrites(rows, submissionId) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('ไม่มีรายการปุ่มที่จะบันทึก');
    if (!submissionId) throw new Error('ไม่พบรหัสการส่งงาน');
    var byCampaign = {};
    rows.forEach(function (row) {
      if (!row || !String(row.campaign || '').trim() || !String(row.month || '').trim() ||
          !String(row.shortName || '').trim() || String(row.submissionBatchId || row.submissionId || '') !== submissionId) {
        throw new Error('ข้อมูลแคมเปญสำหรับบันทึก Cloud ไม่ครบ');
      }
      var name = String(row.campaign).trim();
      (byCampaign[name] = byCampaign[name] || []).push(row);
    });
    var writes = [];
    for (var campaign of Object.keys(byCampaign)) {
      var key = campCloudKey(campaign);
      var remote = await readCloudKey(key);
      var block = remote ? JSON.parse(remote.value) : { w: [], m: {}, _ts: 0 };
      if (!block || typeof block !== 'object' || !block.m || typeof block.m !== 'object') throw new Error('ข้อมูลแคมเปญบน Cloud ไม่ถูกต้อง');
      if (!Array.isArray(block.w)) block.w = workingForStore({ months: block.m });
      var newMonths = {};
      byCampaign[campaign].forEach(function (row) {
        var month = String(row.month);
        (newMonths[month] = newMonths[month] || []).push(row);
      });
      var newButtons = workingForStore({ months: newMonths });
      newButtons.forEach(function (button) {
        if (block.w.some(function (old) {
          return old && old.month === button.month && old.shortName === button.shortName;
        })) throw new Error('ปุ่มนี้มีอยู่ในแคมเปญบน Cloud แล้ว: ' + button.shortName);
      });
      Object.keys(newMonths).forEach(function (month) {
        if (block.m[month] != null && !Array.isArray(block.m[month])) throw new Error('ข้อมูลเดือนบน Cloud ไม่ถูกต้อง');
        block.m[month] = (block.m[month] || []).concat(newMonths[month]);
      });
      block.w = block.w.concat(newButtons);
      block._ts = Math.max(Date.now(), (Number(block._ts) || 0) + 1);
      writes.push({ key: key, value: JSON.stringify(block), expectedUpdatedAt: remote ? remote.updatedAt : null });
    }
    return writes;
  }

  async function savePreparedCampaignRows(rows, batchId, actor, extraWrites) {
    var writes = await prepareCampaignWrites(rows, batchId);
    (extraWrites || []).forEach(function (write) { writes.push(write); });
    var buttons = new Set(rows.map(function (row) {
      return [row.campaign, row.month, row.shortName].join('\u0000');
    }));
    var submission={submissionId: batchId, actor: actor, expectedButtons: buttons.size, writes: writes};
    if(window.PC_CoProEmail && (window.PC_CoProEmail.active() || (window.PC_CoProEmail.prepareSubmission && await window.PC_CoProEmail.prepareSubmission()))){
      if(!_hydrated||_inFlight||Object.keys(_pending).length)throw new Error('Cloud ยังไม่พร้อมสำหรับงานทดสอบอีเมล');
      var pilot=await window.PC_CoProEmail.registerPrimary(submission);
      var proof=await submissionReceipt(batchId);
      if(!proof||proof.savedAt!==pilot.savedAt||proof.savedButtons!==buttons.size)throw new Error('ยังยืนยันหลักฐานการบันทึกไม่ได้ กรุณาตรวจสถานะก่อนส่งซ้ำ');
      return proof;
    }
    return commitSubmission(submission);
  }
  /* รายการงานที่อยู่ใน meta (นอก months/working) — ต้อง MERGE ไม่ทับ
     เดิม pull เอา meta จากคลาวด์ทับทั้งก้อน → งานที่เพิ่งกดบันทึกในเครื่อง (ยัง push ไม่ทัน) หายทันที
     เช่น เพิ่มผงรสชาติ (flavor) ส่งแล้วขึ้นเลขเอกสาร แต่ตารางว่าง */
  var META_LIST_KEYS = ['flavor', 'npd', 'npdProducts', 'rmMaster', 'assets', 'plan2026', 'users', 'emails', 'trash', 'recipeCustom'];
  function mergeMetaList(localArr, cloudArr) {
    if (!Array.isArray(localArr)) return Array.isArray(cloudArr) ? cloudArr : localArr;
    if (!Array.isArray(cloudArr)) return localArr;
    var out = [], seen = {}, cMap = {};
    cloudArr.forEach(function (r) { var id = _idOf(r); if (id) cMap[id] = r; });
    localArr.forEach(function (r) {
      var id = _idOf(r);
      if (!id) { out.push(r); return; }
      seen[id] = 1;
      var c = cMap[id];
      out.push(c && _stamp(c) > _stamp(r) ? c : r);
    });
    cloudArr.forEach(function (r) { var id = _idOf(r); if (!id || seen[id]) return; seen[id] = 1; out.push(r); });
    return out;
  }
  var ROLE_MAP_KEYS = ['pc_permissions', 'pc_permissions_rwd'];
  /* ---- ตราเวลารายแคมเปญ (FX-P60) ----------------------------------------
     เดิม: ตอน pull ถ้าคลาวด์มีแคมเปญนั้น = ใช้ของคลาวด์ทับทันที โดยไม่ดูว่าใครใหม่กว่า
     → IT กดบันทึกเสร็จ (โค้ดลงแถวแล้ว) แต่ push ยังไม่ทัน / แท็บเก่าดันของเดิมขึ้นไปก่อน
       รอบ poll ถัดไป (15 วิ) ทับกลับเป็นของเดิม = โค้ดหาย · สถานะกลับเป็น PENDING
       (งานเด้งกลับมาหน้างาน แต่เลขในตัวนับถูก CONFIRM ไปแล้ว)
     ตอนนี้: จำเวลาที่ "ก้อนของแคมเปญในเครื่องเปลี่ยน" ไว้ แล้วแนบ _ts ไปกับก้อนที่ push
       ตอน pull เทียบ _ts — ของใครใหม่กว่าชนะ · ถ้าในเครื่องใหม่กว่า ให้คงไว้แล้ว push ตาม */
  var CAMP_TS_KEY = 'pc_camp_edit_v2';
  var _localStoreEdited = false;
  /* ---- ทะเบียนแคมเปญที่ถูกลบ (tombstone) — FX-P64 -----------------------------
     เดิม: แคมเปญที่ "มีเฉพาะในเครื่อง" = ถือว่าเพิ่งแจ้งเข้ามา → คงไว้ + push ขึ้นคลาวด์
       → แคมเปญที่เครื่องอื่นลบไปแล้ว โดนเครื่องที่ยังมีอยู่ "ดันกลับขึ้นใหม่" ทุกรอบ (ลบไม่หายสักที)
     ตอนนี้: เวลาลบ เขียนทะเบียนไว้บนคลาวด์ (ชื่อแคมเปญ → เวลา) · เครื่องอื่นเห็นแล้วลบของตัวเองตาม */
  var DEL_CLOUDKEY = 'promo::deleted';
  var _tombs = {};
  function campTs() { try { var m = JSON.parse(localStorage.getItem(CAMP_TS_KEY) || '{}') || {}; if (_migSig(m)) saveCampTs(m); return m; } catch (e) { return {}; } }
  function saveCampTs(m) { try { localStorage.setItem(CAMP_TS_KEY, JSON.stringify(m)); } catch (e) {} }
  function campSig(camp) { return _sig(JSON.stringify((camp && camp.m) || {})); }
  /* ประทับเวลาให้แคมเปญที่เนื้อหาในเครื่องต่างจากก้อนที่ซิงค์ล่าสุด (= มีคนแก้ในเครื่องนี้) */
  function noteLocalEdits(camps) {
    var m = campTs(), now = Date.now(), dirty = false;
    Object.keys(camps || {}).forEach(function (c) {
      var sig = campSig(camps[c]);
      var e2 = m[c];
      if (e2 && e2.sig === sig) return;           /* เนื้อหาเดิม → คงเวลาเดิม (ไม่ push ซ้ำ) */
      /* A campaign submitted after a successful Cloud pull is a real local edit,
         even when this browser has never seen its name before. Giving it ts=0
         lets an older deletion tombstone hide a newly submitted campaign. */
      m[c] = { ts: (_hydrated && _localStoreEdited ? now : 0), sig: sig }; dirty = true;
    });
    if (dirty) saveCampTs(m);
    return m;
  }
  function localTsOf(m, c) { return (m[c] && Number(m[c].ts)) || 0; }
  function reassembleFromCloud(keys) {
    var meta = {}; try { meta = JSON.parse(keys[META_CLOUDKEY] || '{}'); } catch (e) {}
    var store = {}; Object.keys(meta).forEach(function (k) { store[k] = meta[k]; });
    // A poll only runs when no local write is pending. Cloud is authoritative
    // here; silently unioning old browser rows revives deleted campaigns and
    // can later push an obsolete whole-store snapshot back to D1.
    store.working = []; store.months = {};
    var cloudTs = {};
    var putBlock = function (b) {
      (b.w || []).forEach(function (r) { store.working.push(r); });
      Object.keys(b.m || {}).forEach(function (mk) { (store.months[mk] = store.months[mk] || []); (b.m[mk] || []).forEach(function (r) { store.months[mk].push(r); }); });
    };
    Object.keys(keys).forEach(function (ck) {
      if (ck.indexOf(CAMP_PREFIX) !== 0) return;
      var b; try { b = JSON.parse(keys[ck]); } catch (e) { return; }
      var c = null; try { c = decodeURIComponent(ck.slice(CAMP_PREFIX.length)); } catch (e) {}
      /* Cloud อาจยังมีก้อนเก่าจากแท็บที่ค้างอยู่ แต่ทะเบียนลบใหม่กว่าแล้ว
         tombstone ต้องชนะเสมอ ไม่เช่นนั้นเปิดเว็บใหม่แล้วโปรที่ลบจะฟื้นกลับมา. */
      if (c != null && Number(_tombs[c]) >= (Number(b._ts) || 0) && Number(_tombs[c])) {
        return;
      }
      putBlock(b);
      if (c != null) cloudTs[c] = { ts: Number(b._ts) || 0, sig: campSig(b) };
    });
    saveCampTs(cloudTs);
    return store;
  }
  /* push งานโปรแบบราย campaign: เขียนเฉพาะแคมเปญที่เปลี่ยน + ลบเฉพาะที่เครื่องนี้เคยรู้จักแล้วหายไป */
  async function pushStore() {
    if (!_hydrated) throw new Error('CLOUD_NOT_READY');
    var raw = localStorage.getItem(STORE_KEY); if (raw == null) return;
    var store; try { store = JSON.parse(raw); } catch (e) { return; }
    var sp = splitStore(store);
    var tsMap = noteLocalEdits(sp.camps);
    var desired = {}; desired[META_CLOUDKEY] = JSON.stringify(sp.meta);
    Object.keys(sp.camps).forEach(function (c) {
      var ck = campCloudKey(c), previous = null;
      try { previous = JSON.parse(_snap[ck] || 'null'); } catch (e) {}
      // `working` is a derived view and may serialize differently after a
      // reload. Reuse the exact Cloud block when the authoritative month rows
      // did not change, so an unrelated save cannot resend 267 campaigns.
      if (previous && JSON.stringify(previous.m || {}) === JSON.stringify(sp.camps[c].m || {})) {
        desired[ck] = _snap[ck];
      } else {
        desired[ck] = JSON.stringify({ w: sp.camps[c].w, m: sp.camps[c].m, _ts: localTsOf(tsMap, c) });
      }
    });
    var body = {}; Object.keys(desired).forEach(function (ck) { if (_snap[ck] !== desired[ck]) body[ck] = desired[ck]; });
    /* แคมเปญที่เครื่องนี้เคยรู้จักแล้วหายไป = ถูกลบ → เขียนทะเบียนขึ้นคลาวด์ด้วย */
    var gone = Object.keys(_snap).filter(function (ck) { return ck.indexOf(CAMP_PREFIX) === 0 && !desired[ck]; });
    if (gone.length) {
      var now = Date.now(), changedTomb = false;
      gone.forEach(function (ck) { try { var c = decodeURIComponent(ck.slice(CAMP_PREFIX.length)); _tombs[c] = now; changedTomb = true; } catch (e) {} });
      if (changedTomb) body[DEL_CLOUDKEY] = JSON.stringify(_tombs);
    }
    if (Object.keys(body).length) {
      var deleteVersions={};gone.forEach(function(ck){deleteVersions[ck]=Number(_cloudMtime[ck]);});
      await writeChecked(body,deleteVersions);
    }
    var dels = Object.keys(_snap).filter(function (ck) { return ck.indexOf(CAMP_PREFIX) === 0 && !desired[ck]; });
    for (var i = 0; i < dels.length; i++) await deleteChecked(dels[i]);
    // Keep the legacy whole-store key as an additional recovery copy. Deleting
    // it is not needed for the split-key reader and makes incidents harder to recover.
    _migrateLegacy = false;
    _snap = {}; Object.keys(desired).forEach(function (ck) { _snap[ck] = desired[ck]; });
  }

  // ค่าเริ่มต้น: ฝัง Worker + Token ไว้ → ทุกเครื่อง (รวม deploy) ซิงค์อัตโนมัติทันที ไม่ต้องตั้งเอง
  // ถ้าผู้ใช้ตั้งค่าเองผ่านชิป ☁️ (บันทึกลง pc_cloud_cfg) จะ override ค่านี้
  var DEFAULT_CFG = { url: 'https://potato-promo-sync.quiet-surf-dda2.workers.dev', token: 'pc_ccd639fc5548ee482bccb1efca6791db69aad84aef9b15f2829a35f0847dc40c' };
  function cfg() { try { var c = JSON.parse(localStorage.getItem(CFG_KEY)); if (c && c.url && c.token) return c; } catch (e) {} return DEFAULT_CFG; }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
  function enabled() { var c = cfg(); return !!(c.url && c.token); }
  function base() { return String(cfg().url || '').replace(/\/+$/, ''); }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + (cfg().token || '') }, opts.headers || {});
    return fetch(base() + path, opts);
  }

  // Cloud-first contract for new form submissions. These functions never write
  // localStorage; the form keeps its unsent draft in memory until D1 commits.
  async function readCloudKey(key) {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    var response = await api('/promo/store/' + encodeURIComponent(key), { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('อ่านข้อมูลจาก Cloud ไม่สำเร็จ (' + response.status + ')');
    var item = await response.json();
    if (!item || !item.ok || typeof item.value !== 'string' || !Number.isSafeInteger(Number(item.updated_at))) throw new Error('ข้อมูลจาก Cloud ไม่ถูกต้อง');
    return { value: item.value, updatedAt: item.updated_at };
  }

  async function saveCoPromoDrafts(owner, value, expectedUpdatedAt) {
    if (!owner || typeof value !== 'string' || value.length > 500000) throw new Error('ข้อมูลฉบับร่างไม่ถูกต้อง');
    var key = 'pc_copro_drafts::' + encodeURIComponent(owner);
    var response = await api('/promo/store/' + encodeURIComponent(key), {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({value:value, expectedUpdatedAt:expectedUpdatedAt})
    });
    if (response.status === 409) throw new Error('ฉบับร่างเปลี่ยนจากอีกหน้าต่าง กรุณาเปิดงานค้างใหม่ก่อนแก้ไข');
    if (!response.ok) throw new Error('บันทึกฉบับร่างบน Cloud ไม่สำเร็จ');
    var ack = await response.json(), check = await readCloudKey(key);
    if (!ack.ok || !check || check.value !== value || Number(check.updatedAt) !== Number(ack.updated_at)) throw new Error('ยังตรวจยืนยันฉบับร่างบน Cloud ไม่สำเร็จ');
    return check;
  }

  async function readMailHistory() {
    var response = await api('/promo/mail-history', { cache: 'no-store' });
    if (!response.ok) throw new Error('อ่านสถานะเมลจาก Cloud ไม่สำเร็จ');
    var result = await response.json();
    if (!Array.isArray(result.items)) throw new Error('ข้อมูลสถานะเมลไม่ถูกต้อง');
    return result;
  }

  async function saveMailDecision(campaign, kind, revisionId, decision) {
    var owner=localStorage.getItem('pc_userName');
    if(!owner||decision!=='not_sent')throw Error('ข้อมูลสถานะเมลไม่ถูกต้อง');
    var key='pc_mail_decisions::'+encodeURIComponent(owner),prior=await readCloudKey(key),items=prior?JSON.parse(prior.value):{};
    var id=JSON.stringify([campaign,kind,revisionId||'']);
    items[id]={campaign:campaign,kind:kind,revisionId:revisionId||'',status:decision,user:owner,at:new Date().toISOString()};
    var value=JSON.stringify(items),response=await api('/promo/store/'+encodeURIComponent(key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:value,expectedUpdatedAt:prior?prior.updatedAt:null})});
    if(!response.ok)throw Error('ยังบันทึกสถานะไม่ส่งเมลบน Cloud ไม่สำเร็จ กรุณาลองใหม่');
    var check=await readCloudKey(key);if(!check||check.value!==value)throw Error('ยังยืนยันสถานะไม่ส่งเมลไม่ได้');
  }
  async function saveCoPromoRecords(value, expectedUpdatedAt) {
    var key='pc_co_promotions';
    if (_inFlight || _pending[key]) throw Error('ยังมีข้อมูล CoPromo ค้างซิงก์ กรุณารอสักครู่แล้วลองใหม่');
    var localBefore = localStorage.getItem(key);
    if(typeof value!=='string'||!Array.isArray(JSON.parse(value)))throw Error('ข้อมูล CoPromo ไม่ถูกต้อง');
    var response=await api('/promo/store/'+key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:value,expectedUpdatedAt:expectedUpdatedAt})});
    if(response.status===409)throw Error('ข้อมูล CoPromo เปลี่ยนจากอีกหน้าต่าง กรุณาลองอีกครั้ง');
    if(!response.ok)throw Error('บันทึกข้อมูล CoPromo บน Cloud ไม่สำเร็จ');
    var ack=await response.json(),check=await readCloudKey(key);
    if(!ack.ok||!check||check.value!==value||Number(check.updatedAt)!==Number(ack.updated_at))throw Error('ยังตรวจยืนยันการบันทึก CoPromo ไม่สำเร็จ');
    // Keep the old version on concurrent edits: their next sync must conflict,
    // never overwrite the intake that has just committed on Cloud.
    if (localStorage.getItem(key) !== localBefore || _pending[key] || _inFlight) throw Error('ข้อมูล CoPromo บันทึกบน Cloud แล้ว แต่มีการแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่');
    _set(key,value);
    markKeyFromCloud(key,value,check.updatedAt);
    delete _pending[key];
    _cloudMtime[key]=Number(check.updatedAt);_cloudCache[key]=value;
    return check;
  }

  async function loadCampaignEdit(campaign, month, actor, role) {
    var model=window.PC_PromotionEditModel;
    if(!model)throw new Error('ระบบแก้ไขยังไม่พร้อม กรุณารีเฟรช');
    var record=await readCloudKey(campCloudKey(campaign));
    if(!record)throw new Error('ไม่พบแคมเปญบน Cloud');
    var block=JSON.parse(record.value), deleted=await readCloudKey(DEL_CLOUDKEY);
    if(deleted && Number(JSON.parse(deleted.value)[campaign]) >= (Number(block._ts)||0) && Number(JSON.parse(deleted.value)[campaign]))throw new Error('แคมเปญนี้ถูกลบแล้ว');
    var policy=model.policy(block,actor,month,{role:role});if(!policy.allowed)throw new Error(policy.reason);
    var structuralEdits=false;
    try{var caps=await api('/promo/edit-capabilities',{cache:'no-store'});if(caps.ok)structuralEdits=(await caps.json()).structuralEdits===true;}catch(e){}
    return {campaign:campaign,month:month,actor:actor,role:String(role||''),structuralEdits:structuralEdits,expectedUpdatedAt:Number(record.updatedAt),original:block,form:model.toForm(block,month)};
  }
  async function saveCampaignEdit(context, form) {
    if(!context || !context.original)throw new Error('ไม่พบข้อมูลอ้างอิงงานเดิม กรุณาเปิดแก้ไขใหม่');
    var serialized=JSON.stringify(form);
    if(context._editPayload!==serialized){context._editPayload=serialized;context._editId='edit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
    var id=context._editId;
    var body={editId:id,actor:context.actor,actorRole:context.role||'',campaign:context.campaign,month:context.month,expectedUpdatedAt:context.expectedUpdatedAt,form:form};
    var response,ack;
    try { response=await api('/promo/campaign-edits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
    catch(e){var recovered=await submissionReceipt(id).catch(function(){return null;});if(recovered && recovered.kind==='CAMPAIGN_EDIT')return recovered;throw new Error('ยังยืนยันการแก้ไขไม่ได้ ข้อมูลยังอยู่ในฟอร์ม กรุณาลองบันทึกอีกครั้ง');}
    ack=await response.json();
    if(!response.ok){
      if(response.status===409)throw new Error(ack.message||'มีการเปลี่ยนข้อมูลระหว่างแก้ไข กรุณาเปิดงานล่าสุดอีกครั้ง ข้อมูลที่กรอกยังอยู่ในฟอร์ม');
      throw new Error(ack.message||'บันทึกการแก้ไขไม่สำเร็จ ('+response.status+')');
    }
    var receipt=await submissionReceipt(id);
    if(!ack.ok||!receipt||receipt.kind!=='CAMPAIGN_EDIT'||receipt.editId!==id)throw new Error('ยังตรวจยืนยันผลบันทึกไม่ได้ กรุณาลองอีกครั้งโดยไม่กรอกใหม่');
    return receipt;
  }

  async function assignITButtonCode(context) {
    if(!context.requestId)context.requestId='it-code-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
    var response,ack;
    try { response=await api('/promo/it-button-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context)}); }
    catch(e){var recovered=await submissionReceipt(context.requestId).catch(function(){return null;});if(recovered&&recovered.kind==='IT_BUTTON_CODE')return recovered;throw new Error('ยังยืนยันการจองรหัสไม่ได้ กรุณาลองอีกครั้ง');}
    ack=await response.json();
    if(!response.ok)throw new Error(ack.message||(response.status===409?'ข้อมูลเปลี่ยนระหว่างกำหนดรหัส กรุณาโหลดงานล่าสุด':'กำหนดรหัสไม่สำเร็จ ('+response.status+')'));
    var receipt=await submissionReceipt(context.requestId);
    if(!ack.ok||!receipt||receipt.kind!=='IT_BUTTON_CODE')throw new Error('ยังตรวจผลการกำหนดรหัสไม่ได้ กรุณาลองอีกครั้ง');
    return receipt;
  }

  async function submissionReceipt(submissionId) {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    var response = await api('/promo/submissions/' + encodeURIComponent(submissionId), { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('ตรวจหลักฐานการบันทึกจาก Cloud ไม่สำเร็จ (' + response.status + ')');
    var receipt = await response.json();
    if (!receipt || !receipt.ok || receipt.submissionId !== submissionId) throw new Error('หลักฐานจาก Cloud ไม่ถูกต้อง');
    return receipt;
  }

  async function commitSubmission(submission) {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    if (!_hydrated) throw new Error('Cloud ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่');
    if (_inFlight || Object.keys(_pending).length) throw new Error('ยังมีข้อมูลเก่าค้างส่งขึ้น Cloud กรุณาแก้การซิงก์ก่อนส่งงานใหม่');
    if (!submission || !submission.submissionId) throw new Error('ไม่พบรหัสการส่งงาน');
    var response;
    try {
      response = await api('/promo/submissions', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });
    } catch (networkError) {
      // The request may have committed before its response was lost. Resolve by
      // the same idempotency key; never generate another submission ID on retry.
      try {
        var found = await submissionReceipt(submission.submissionId);
        if (found) return found;
      } catch (receiptError) {}
      var unknown = new Error('ยังยืนยันผล Cloud ไม่ได้ โปรดตรวจสถานะด้วยรหัสการส่งเดิมก่อนส่งซ้ำ');
      unknown.code = 'CLOUD_OUTCOME_UNKNOWN';
      throw unknown;
    }
    var result;
    try { result = await response.json(); } catch (e) { result = null; }
    if (!response.ok || !result || !result.ok) {
      // A server error can also happen after commit. The receipt is authoritative.
      if (response.status >= 500 || response.ok) {
        try { var saved = await submissionReceipt(submission.submissionId); if (saved) return saved; } catch (e) {}
      }
      if (response.ok) {
        var unknownResponse = new Error('Cloud ตอบกลับไม่ครบ โปรดตรวจสถานะด้วยรหัสการส่งเดิมก่อนส่งซ้ำ');
        unknownResponse.code = 'CLOUD_OUTCOME_UNKNOWN';
        throw unknownResponse;
      }
      var error = new Error(result && result.error === 'version_conflict'
        ? 'ข้อมูลบน Cloud เปลี่ยนระหว่างส่งงาน กรุณาโหลดข้อมูลล่าสุดแล้วตรวจอีกครั้ง'
        : 'Cloud ไม่รับการบันทึก (' + response.status + ')');
      error.code = result && result.error || 'CLOUD_SAVE_FAILED';
      error.detail = result || null;
      throw error;
    }
    if (result.submissionId !== submission.submissionId || result.savedButtons !== submission.expectedButtons) {
      var mismatch = new Error('Cloud ตอบรับข้อมูลไม่ตรงกับงานที่ส่ง กรุณาตรวจหลักฐานก่อนส่งซ้ำ');
      mismatch.code = 'CLOUD_RECEIPT_MISMATCH';
      throw mismatch;
    }
    // A successful HTTP response is not enough for the user-facing success
    // state. Read the immutable receipt back from D1 before clearing the form.
    var confirmed;
    try { confirmed = await submissionReceipt(submission.submissionId); }
    catch (e) {
      var checkFailed = new Error('บันทึกอาจสำเร็จแล้ว แต่ยังอ่านหลักฐานจาก Cloud ไม่ได้ โปรดตรวจสถานะก่อนส่งซ้ำ');
      checkFailed.code = 'CLOUD_OUTCOME_UNKNOWN';
      throw checkFailed;
    }
    if (!confirmed || confirmed.savedButtons !== submission.expectedButtons || confirmed.savedAt !== result.savedAt) {
      var receiptMismatch = new Error('หลักฐานบน Cloud ไม่ตรงกับงานที่ส่ง โปรดแจ้ง IT ก่อนส่งซ้ำ');
      receiptMismatch.code = 'CLOUD_RECEIPT_MISMATCH';
      throw receiptMismatch;
    }
    return confirmed;
  }

  // Read the campaign key directly from D1 when checking a submission receipt.
  // This does not trust the browser's cached tracking rows as Cloud proof.
  async function readCampaignRows(campaign) {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    var key = CAMP_PREFIX + encodeURIComponent(String(campaign || '').trim());
    var response = await api('/promo/store/' + encodeURIComponent(key), { cache: 'no-store' });
    if (!response.ok) throw new Error('อ่านแคมเปญจาก Cloud ไม่สำเร็จ (' + response.status + ')');
    var item = await response.json();
    if (!item || !item.ok || typeof item.value !== 'string') throw new Error('ข้อมูลแคมเปญจาก Cloud ไม่ถูกต้อง');
    var block = JSON.parse(item.value), rows = [];
    // A campaign key can exist in D1 yet be hidden by a newer deletion record.
    // The receipt must not call that a successful, visible submission.
    var deletedResponse = await api('/promo/store/' + encodeURIComponent(DEL_CLOUDKEY), { cache: 'no-store' });
    if (deletedResponse.ok) {
      var deletedItem = await deletedResponse.json();
      if (!deletedItem || !deletedItem.ok || typeof deletedItem.value !== 'string') throw new Error('ทะเบียนลบจาก Cloud ไม่ถูกต้อง');
      var deleted = JSON.parse(deletedItem.value);
      var deletedAt = Number(deleted[String(campaign || '').trim()]) || 0;
      if (deletedAt && deletedAt >= (Number(block._ts) || 0)) throw new Error('แคมเปญถูกซ่อนด้วยทะเบียนลบเก่า');
    } else if (deletedResponse.status !== 404) {
      throw new Error('อ่านทะเบียนลบจาก Cloud ไม่สำเร็จ (' + deletedResponse.status + ')');
    }
    Object.keys(block.m || {}).forEach(function (month) { (block.m[month] || []).forEach(function (row) { rows.push(row); }); });
    return rows;
  }

  // Fresh server snapshot shared by every receipt in one history view.
  // Never use local tracking rows as evidence of a successful Cloud save.
  async function readSubmissionSnapshot() {
    await pull();
    if (!_hydrated) throw new Error('Cloud ยังโหลดไม่สำเร็จ');
    var keys = Object.assign({}, _cloudCache);
    var deleted = JSON.parse(keys[DEL_CLOUDKEY] || '{}');
    var events=Object.keys(keys).filter(function(k){return k.indexOf('promo::activity::')===0;}).map(function(k){return JSON.parse(keys[k]);}).filter(function(e){return e.kind==='DELETED';});
    var trash=JSON.parse(keys[META_CLOUDKEY]||'{}').trash||[];
    var evidence=events.map(function(e){return {at:e.at,user:e.user,rows:e.submissionRows||[]};}).concat(trash.map(function(t){return {at:t.deletedAt,user:t.deletedBy,rows:Object.values(t.months||{}).flat()};}));
    var snapshot=function (campaign) {
      var name = String(campaign || '').trim(), raw = keys[CAMP_PREFIX + encodeURIComponent(name)];
      if (raw == null) throw new Error('อ่านแคมเปญจาก Cloud ไม่สำเร็จ (404)');
      var block = JSON.parse(raw);
      if (Number(deleted[name]) && Number(deleted[name]) >= (Number(block._ts) || 0))
        throw new Error('แคมเปญถูกซ่อนด้วยทะเบียนลบเก่า');
      return Object.keys(block.m || {}).flatMap(function (month) { return block.m[month] || []; });
    };
    snapshot.deletedRows=evidence.flatMap(function(e){return e.rows;});
    snapshot.deletionFor=function(entry){
      var seen=Math.max(Number(entry.cloudSeenAt)||0,Number(entry.successShownAt)||0);
      var match=evidence.filter(function(e){return Date.parse(e.at)>=seen && e.rows.some(function(r){return r.campaign===entry.campaign && (entry.id?r.submissionId===entry.id:r.txnDate===entry.at && (r.submittedBy||r.reporter)===entry.user);});}).sort(function(a,b){return String(b.at).localeCompare(String(a.at));})[0];
      if(match)return {at:match.at,user:match.user};
      var stamp=Number(deleted[entry.campaign])||0,submitted=Date.parse(entry.at);
      if(!evidence.some(function(e){return e.rows.some(function(r){return r.campaign===entry.campaign;});}) && seen && stamp>=seen && Number.isFinite(submitted)&&stamp>=submitted)return {at:new Date(stamp).toISOString(),user:''};
      return null;
    };
    return snapshot;
  }

  // One immutable Cloud key per action avoids losing an audit entry when two
  // people change different campaigns at the same time. Do not use the large
  // campaign store or a shared localStorage array for this history.
  var ACTIVITY_PREFIX = 'promo::activity::';
  async function readActivity(date) {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('วันที่ไม่ถูกต้อง');
    var prefix = ACTIVITY_PREFIX + date + '::';
    var meta = await remoteMeta();
    var names = Object.keys(meta).filter(function (k) { return k.indexOf(prefix) === 0; });
    var records = [];
    for (var i = 0; i < names.length; i += 8) {
      var batch = await Promise.all(names.slice(i, i + 8).map(async function (key) {
        var response = await api('/promo/store/' + encodeURIComponent(key), { cache: 'no-store' });
        if (!response.ok) throw new Error('อ่านประวัติจาก Cloud ไม่สำเร็จ (' + response.status + ')');
        var item = await response.json();
        if (!item || !item.ok || typeof item.value !== 'string') throw new Error('ข้อมูลประวัติจาก Cloud ไม่ถูกต้อง');
        return JSON.parse(item.value);
      }));
      records.push.apply(records, batch);
    }
    return records;
  }
  async function appendActivity(event) {
    if (!enabled() || !_hydrated) throw new Error('Cloud ยังไม่พร้อมบันทึกประวัติ');
    var date = String(event && event.date || ''), id = String(event && event.id || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('ข้อมูลประวัติไม่ถูกต้อง');
    var key = ACTIVITY_PREFIX + date + '::' + id, value = JSON.stringify(event);
    var response = await api('/promo/store/' + encodeURIComponent(key), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value, expectedUpdatedAt: null })
    });
    if (response.status === 409) {
      var existing = await api('/promo/store/' + encodeURIComponent(key), { cache: 'no-store' });
      var saved = existing.ok ? await existing.json() : null;
      if (saved && saved.ok && saved.value === value) return true; // retry of the same event
      throw new Error('ประวัติรายการนี้มีข้อมูลไม่ตรงกัน');
    }
    if (!response.ok) throw new Error('บันทึกประวัติลง Cloud ไม่สำเร็จ (' + response.status + ')');
    var ack = await response.json();
    var check = await api('/promo/store/' + encodeURIComponent(key), { cache: 'no-store' });
    var item = check.ok ? await check.json() : null;
    if (!ack || !ack.ok || !item || !item.ok || item.value !== value) throw new Error('ตรวจยืนยันประวัติใน Cloud ไม่สำเร็จ');
    return true;
  }

  /* ---- pull: cloud → localStorage (คืน changed=true ถ้ามีอะไรต่างจากในเครื่อง) ---- */
  var _etag = null;
  var _writeEpoch = 0;
  /* ---- FX-P65: ดึงข้อมูลแบบรายคีย์ (meta-driven) ------------------------------
     อาการ: `GET /promo/store` (ก้อนเดียวทั้งฐาน ~หลาย MB) เริ่มล้มที่ Worker → เบราว์เซอร์ได้
       "Failed to fetch" ทั้งที่ /health ปกติ → ซิงค์ตายทั้งระบบ ข้อมูลค้างของเก่า
     แก้: อ่าน `GET /promo/meta` (เบา ~30KB) เอารายชื่อคีย์+เวลาแก้ไข แล้วดึงเฉพาะคีย์ที่เปลี่ยน
       ผ่าน `GET /promo/store/:key` ทีละชุด · คีย์ที่ไม่เปลี่ยนใช้ค่าที่แคชไว้ */
  var _cloudCache = {}, _cloudMtime = {};
  async function fetchKeysViaMeta(force) {
    var r = await api('/promo/meta');
    if (!r.ok) throw new Error('meta ' + r.status);
    var d = await r.json();
    if (!d || !d.ok || !d.meta || typeof d.meta !== 'object') throw new Error('invalid cloud meta');
    var meta = d.meta;
    // Audit events are read on demand by the Log page. Eagerly downloading
    // every historical event on every poll would slow all other screens.
    var names = Object.keys(meta).filter(function (k) { return k.indexOf(ACTIVITY_PREFIX) !== 0; });
    var cache = Object.assign({}, _cloudCache), mtime = Object.assign({}, _cloudMtime);
    var need = names.filter(function (k) { return force || cache[k] == null || mtime[k] !== meta[k]; });
    for (var i = 0; i < need.length; i += 8) {
      var batch = need.slice(i, i + 8);
      await Promise.all(batch.map(function (k) {
        return api('/promo/store/' + encodeURIComponent(k)).then(function (res) {
          if (!res.ok) throw new Error('key ' + k + ' ' + res.status);
          return res.json().then(function (j) {
            if (!j || !j.ok || typeof j.value !== 'string') throw new Error('invalid key ' + k);
            cache[k] = j.value; mtime[k] = meta[k];
          });
        });
      }));
    }
    Object.keys(cache).forEach(function (k) { if (names.indexOf(k) === -1) { delete cache[k]; delete mtime[k]; } });
    var keys = {}; names.forEach(function (k) { if (cache[k] != null) keys[k] = cache[k]; });
    return { keys: keys, meta: mtime, cache: cache };
  }
  async function remoteMeta() {
    var r = await api('/promo/meta');
    if (!r.ok) throw new Error('meta ' + r.status);
    var d = await r.json();
    if (!d || !d.ok || !d.meta || typeof d.meta !== 'object') throw new Error('invalid cloud meta');
    return d.meta;
  }
  function sameVersion(a, b) { return (a == null ? null : Number(a)) === (b == null ? null : Number(b)); }
  async function assertFresh(names) {
    var current = await remoteMeta();
    names.forEach(function (k) {
      if (!sameVersion(current[k], _cloudMtime[k])) throw new Error('CLOUD_CONFLICT:' + k);
    });
    return current;
  }
  async function writeChecked(body, deleteVersions) {
    var names = Object.keys(body); if (!names.length) return;
    await assertFresh(names);
    for (var i = 0; i < names.length; i++) {
      var k = names[i], expected = _cloudMtime[k] == null ? null : Number(_cloudMtime[k]);
      var r = await api('/promo/store/' + encodeURIComponent(k), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: body[k], expectedUpdatedAt: expected,
          ...(k===DEL_CLOUDKEY&&deleteVersions&&Object.keys(deleteVersions).length?{deletedCampaignVersions:deleteVersions,actor:localStorage.getItem('pc_userName')||''}:{}) })
      });
      if (r.status === 409) throw new Error('CLOUD_CONFLICT:' + k);
      if (!r.ok) throw new Error('push ' + r.status);
      var ack = await r.json();
      if (!ack || !ack.ok || !Number.isSafeInteger(Number(ack.updated_at))) throw new Error('invalid cloud acknowledgment ' + k);
      // A 2xx response alone does not prove the exact value is still there.
      var check = await api('/promo/store/' + encodeURIComponent(k));
      if (!check.ok) throw new Error('verify ' + k + ' ' + check.status);
      var item = await check.json();
      if (!item || !item.ok || item.value !== body[k] || Number(item.updated_at) !== Number(ack.updated_at)) {
        throw new Error('verify mismatch ' + k);
      }
      // Persist the acknowledged version per key; a later key in this batch
      // can still fail, so a retry must not resend a previously saved key as stale.
      _cloudMtime[k] = Number(ack.updated_at); _cloudCache[k] = body[k];
      var removedNames=(ack.deletedKeys||[]).map(function(key){return decodeURIComponent(key.slice(10));});
      (ack.linkedUpdates||[]).forEach(function(row){
        if(row.k!=='pc_co_promotions'&&!row.k.startsWith('pc_copro_drafts::'))return;
        var local=JSON.parse(localStorage.getItem(row.k)||row.v),filtered;
        if(row.k==='pc_co_promotions')filtered=local.filter(function(r){return removedNames.indexOf(r.campaign)===-1;});
        else filtered=Object.assign({},local,{items:Object.fromEntries(Object.entries(local.items||{}).filter(function(pair){return removedNames.indexOf(pair[1].campaign)===-1;}))});
        _set(row.k,JSON.stringify(filtered));_cloudMtime[row.k]=Number(row.updated_at);_cloudCache[row.k]=row.v;
      });
      (ack.deletedKeys||[]).forEach(function(deleted){delete _snap[deleted];delete _cloudMtime[deleted];delete _cloudCache[deleted];});
    }
  }
  async function deleteChecked(k) {
    await assertFresh([k]);
    var r = await api('/promo/store/' + encodeURIComponent(k), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedUpdatedAt: _cloudMtime[k] == null ? null : Number(_cloudMtime[k]) })
    });
    if (r.status === 409) throw new Error('CLOUD_CONFLICT:' + k);
    if (!r.ok) throw new Error('delete ' + k + ' ' + r.status);
    var meta = await remoteMeta();
    if (meta[k] != null) throw new Error('delete verify ' + k);
    delete _cloudMtime[k]; delete _cloudCache[k];
  }
  var _pullPromise = null, _readyPromise = null;
  function pull(opt) {
    // Startup, page reads and polling must share the same hydration request.
    if (_pullPromise) return _pullPromise;
    var request = pullOnce(opt);
    _pullPromise = request;
    var clear = function () { if (_pullPromise === request) _pullPromise = null; };
    request.then(clear, clear);
    return request;
  }
  function whenReady() {
    if (!enabled() || _hydrated) return Promise.resolve();
    if (_readyPromise) return _readyPromise;
    var timer;
    var loading = (async function () {
      for (var attempt = 0; attempt < 3; attempt++) {
        try { await pull(); if (_hydrated) return; throw new Error('Cloud ยังไม่พร้อม'); }
        catch (e) {
          // Do not retry over a concurrent local edit or an invalid empty DB.
          if (attempt === 2 || /LOCAL_CHANGED_DURING_PULL|CLOUD_EMPTY_NEEDS_ADMIN|archive|History /i.test(String(e && e.message || e))) throw e;
          await new Promise(function (resolve) { setTimeout(resolve, 250 * (attempt + 1)); });
        }
      }
    })();
    var request = Promise.race([loading, new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('เชื่อมต่อ Cloud ใช้เวลานาน กรุณาลองโหลดข้อมูลอีกครั้ง')); }, 45000);
    })]);
    _readyPromise = request;
    var clear = function () { clearTimeout(timer); if (_readyPromise === request) _readyPromise = null; };
    request.then(clear, clear);
    return request;
  }
  async function pullOnce(opt) {
    if (!enabled()) return { changed: false, reason: 'not-configured' };
    var epochAtStart = _writeEpoch;
    var wasHydrated = _hydrated;
    _hydrated = false; // a partial/failed pull must never authorize a later push
    var keys = null, incomingMeta = null, incomingCache = null, incomingEtag = null;
    /* ⭐ ถ้าคลาวด์ยังเป็นก้อนเดิม (ETag ตรง) → ตอบ 304 ไม่ต้องโหลดข้อมูล 2-3MB ซ้ำทุกรอบ */
    var hdr = (_etag && wasHydrated && !(opt && opt.force)) ? { 'If-None-Match': _etag } : {};
    try {
      var r = await api('/promo/store', { headers: hdr });
      if (r.status === 304) { _hydrated = wasHydrated; return { changed: false, keys: 0, cached: true }; }
      if (!r.ok) throw new Error('pull ' + r.status);
      try { incomingEtag = r.headers.get('ETag'); } catch (e) {}
      var d = await r.json();
      if (!d || !d.ok || !d.keys || !d.meta) throw new Error('invalid cloud response');
      keys = d.keys;
      Object.keys(d.meta).forEach(function (k) { if (typeof keys[k] !== 'string') throw new Error('missing cloud key ' + k); });
      incomingMeta = d.meta; incomingCache = Object.assign({}, keys);
    } catch (bulkErr) {
      var fetched = await fetchKeysViaMeta(!!(opt && opt.force));
      keys = fetched.keys; incomingMeta = fetched.meta; incomingCache = fetched.cache;
    }
    // A user may have saved while the network request was running. Never
    // replace that write with the response from an earlier read.
    if (_writeEpoch !== epochAtStart) {
      _hydrated = wasHydrated; // no Cloud value has been applied yet
      if (_hydrated && Object.keys(_pending).length && !_timer) _timer = setTimeout(flush, 1200);
      throw new Error('LOCAL_CHANGED_DURING_PULL');
    }
    if (keys[META_CLOUDKEY] == null && keys[STORE_KEY] == null) throw new Error('CLOUD_EMPTY_NEEDS_ADMIN');
    // Attachments are read from Cloud on demand. Reclaim only local copies
    // whose every original byte is already present in this verified response.
    if (keys.pc_promo_files != null && !_pending.pc_promo_files) {
      try {
        var localFiles = JSON.parse(localStorage.getItem('pc_promo_files') || '{}');
        var remoteFiles = JSON.parse(keys.pc_promo_files);
        if (Object.keys(localFiles).every(function (id) { return JSON.stringify(localFiles[id]) === JSON.stringify(remoteFiles[id]); }))
          localStorage.removeItem('pc_promo_files');
      } catch (e) {} // Preserve unknown/local-only originals.
    }
    var changed = false, n = 0;
    // (1) งานโปร: ประกอบร่างจาก key ราย campaign (promo::c::*) + meta
    var campKeys = Object.keys(keys).filter(function (k) { return k.indexOf(CAMP_PREFIX) === 0; });
    var hasMeta = keys[META_CLOUDKEY] != null;
    if (campKeys.length || hasMeta) {
      try { _tombs = JSON.parse(keys[DEL_CLOUDKEY] || '{}') || {}; } catch (e) { _tombs = {}; }
      var store = reassembleFromCloud(keys);
      var newStr = JSON.stringify(store);
      var compactStr = compactStoreRaw(newStr);
      if (localStorage.getItem(STORE_KEY) !== compactStr) {
        await archiveBeforeReplace(localStorage.getItem(STORE_KEY));
        _set(STORE_KEY, compactStr);
        if (window.PC_API && window.PC_API.reloadFromStorage) window.PC_API.reloadFromStorage();
        changed = true;
      }
      _snap = {}; if (hasMeta) _snap[META_CLOUDKEY] = keys[META_CLOUDKEY]; campKeys.forEach(function (ck) { _snap[ck] = keys[ck]; });
      _migrateLegacy = (keys[STORE_KEY] != null); // ถ้ายังมีก้อนเก่าค้าง → ลบตอน push ถัดไป
    } else if (keys[STORE_KEY] != null) {
      // รุ่นเก่า: cloud ยังเก็บก้อนเดียว → โหลดมาใช้ แล้ว migrate ตอน push แรก
      if (localStorage.getItem(STORE_KEY) !== keys[STORE_KEY]) {
        await archiveBeforeReplace(localStorage.getItem(STORE_KEY));
        _set(STORE_KEY, keys[STORE_KEY]);
        if (window.PC_API && window.PC_API.reloadFromStorage) window.PC_API.reloadFromStorage();
        changed = true;
      }
      _snap = {}; _migrateLegacy = true;
    }
    // (2) key อื่น ๆ (ตั้งค่า/สิทธิ์): ยังใช้ทั้งก้อน (แก้พร้อมกันน้อย)
    TRACKED.forEach(function (k) {
      if (k === STORE_KEY || k === 'pc_promo_files') return;
      if (keys[k] == null) return;
      n++;
      var cur = localStorage.getItem(k);
      if (k === 'pc_code_requests' || k === 'pc_co_promotions') {
        // A campaign tombstone also invalidates its older attachment registrations.
        // Filter after merging so stale tabs cannot resurrect deleted mapping codes.
        var mergedRequests = mergeList(cur || '[]', keys[k]);
        var liveRequests = JSON.parse(mergedRequests.str).filter(function (request) {
          var deletedAt = Number(_tombs[String(request && request.campaign || '').trim()]) || 0;
          var createdAt = Number(request && request.createdAt) || Date.parse(request && request.createdAt) || 0;
          return !deletedAt || (k==='pc_code_requests'&&!createdAt) || createdAt > deletedAt;
        });
        var requestsRaw = JSON.stringify(liveRequests);
        if (requestsRaw !== cur) { _set(k, requestsRaw); changed = true; }
        if (requestsRaw !== keys[k]) queuePush(k);
        return;
      }
      if (cur === keys[k]) return;
      /* ⭐ ตารางสิทธิ์ = รวมรายบทบาท — บทบาทใหม่ที่เพิ่งเพิ่มในโค้ด (เช่น SC) ต้องไม่ถูกคลาวด์ลบทิ้ง
         (คลาวด์ชนะสำหรับบทบาทที่มีอยู่แล้ว · บทบาทที่มีแค่ในเครื่องเก็บไว้แล้วดันขึ้นให้) */
      if (ROLE_MAP_KEYS.indexOf(k) !== -1 && cur != null) {
        var lo = {}, cl = {};
        try { lo = JSON.parse(cur) || {}; } catch (e) { lo = {}; }
        try { cl = JSON.parse(keys[k]) || {}; } catch (e) { cl = null; }
        if (cl && typeof cl === 'object') {
          var mrg = {}; Object.keys(cl).forEach(function (r) { mrg[r] = cl[r]; });
          var addedLocal = false;
          Object.keys(lo).forEach(function (r) { if (!(r in mrg)) { mrg[r] = lo[r]; addedLocal = true; } });
          var mstr = JSON.stringify(mrg);
          if (mstr !== cur) { _set(k, mstr); changed = true; }
          if (addedLocal) queuePush(k);
          return;
        }
      }
      if (MERGE_LIST_KEYS.indexOf(k) !== -1 && cur != null) {
        var mg = mergeList(cur, keys[k]);
        if (mg.str !== cur) { _set(k, mg.str); changed = true; }
        if (mg.str !== keys[k]) queuePush(k);   // ของในเครื่องมีของใหม่กว่า → ดันขึ้นคลาวด์
        return;
      }
      /* ⭐ FX-P61 — key ที่ยังทับทั้งก้อน (ตั้งค่า/master/สิทธิ์): เทียบเวลาก่อน
         ของในเครื่องใหม่กว่า → คงไว้แล้วดันขึ้นแทน (กันงานที่เพิ่งกดบันทึกหาย) */
      if (cur != null) {
        var lt = 0; try { var _m = keyTs()[k]; lt = (_m && _m.sig === _sig(cur)) ? (Number(_m.ts) || 0) : 0; } catch (e) {}
        var ct = Number(keys[k + TS_SUFFIX]) || 0;
        if (lt && lt > ct) { queuePush(k); return; }
      }
      _set(k, keys[k]); markKeyFromCloud(k, keys[k], keys[k + TS_SUFFIX]); changed = true;
    });
    // คีย์ Subset ที่เพิ่งเริ่มซิงค์: ส่งรายการเดิมในเครื่องขึ้น Cloud ด้วย
    ['pc_subset_custom', 'pc_subset_deleted', 'pc_addon_subsets'].forEach(function (k) {
      if (keys[k] == null && localStorage.getItem(k) != null) queuePush(k);
    });
    _cloudMtime = incomingMeta; _cloudCache = incomingCache; _etag = incomingEtag;
    if(keys.pc_code_counter_v1!=null&&window.PC_COUNTER&&PC_COUNTER.reloadFromStorage)PC_COUNTER.reloadFromStorage();
    _hydrated = true; _localStoreEdited = false;
    if (Object.keys(_pending).length && !_timer && !_inFlight) _timer = setTimeout(flush, 1200);
    return { changed: changed, keys: n };
  }

  /* ---- push: localStorage → cloud (debounced auto-push + pushAll) ---- */
  var _pending = {}, _timer = null, _inFlight = false, _inFlightPromise = null, _fails = 0, _retryTimer = null, _lastError = null;
  var RETRY_MS = [4000, 12000, 30000];
  function queuePush(k) { _pending[k] = 1; if (!_hydrated || _timer || _inFlight) return; _timer = setTimeout(flush, 1200); }
  /* ⭐ เน็ตสะดุด/เวิร์กเกอร์ตอบช้า 1 ครั้ง = ไม่ใช่ "ซิงค์มีปัญหา" — ลองใหม่ให้เองก่อน
     ขึ้นชิปแดงเมื่อพลาดติดกัน 3 ครั้ง (หรือเครื่องออฟไลน์) เท่านั้น */
  function failSoft(keys) {
    _fails++;
    if (keys) keys.forEach(function (k) { _pending[k] = 1; });
    if (_fails >= 3 || (navigator && navigator.onLine === false)) setStatus('err');
    var wait = RETRY_MS[Math.min(_fails - 1, RETRY_MS.length - 1)];
    if (Object.keys(_pending).length && !_retryTimer) {
      _retryTimer = setTimeout(function () { _retryTimer = null; flush(); }, wait);
    }
  }
  function failReset() { _fails = 0; if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; } }
  async function flush() {
    _timer = null;
    if (!enabled() || !_hydrated) return false;
    if (_inFlight) return _inFlightPromise; // รอ request เดิมก่อน ไม่ยิงซ้อน
    var pend = Object.keys(_pending); _pending = {};
    if (!pend.length) return true;
    _inFlight = true; setStatus('sync');
    _inFlightPromise = (async function () {
      try {
        if (pend.indexOf(STORE_KEY) !== -1) await pushStore();
        var body = {}; pend.forEach(function (k) { if (k === STORE_KEY) return; var v = localStorage.getItem(k); if (v != null) body[k] = v; });
        withKeyTs(body);
        if (Object.keys(body).length) await writeChecked(body);
        _etag = null;
        _lastError = null; failReset(); setStatus('ok');
        return true;
      } catch (e) {
        _lastError = e;
        if (/^CLOUD_CONFLICT:/.test(String(e && e.message || e))) {
          pend.forEach(function (k) { _pending[k] = 1; });
          setStatus('err'); // หยุด retry: ต้องตรวจความขัดแย้งก่อน
        } else failSoft(pend);
        return false;
      } finally {
        _inFlight = false;
        if (Object.keys(_pending).length && !_timer && !_retryTimer && !/^CLOUD_CONFLICT:/.test(String(_lastError && _lastError.message || ''))) {
          _timer = setTimeout(flush, 1500);
        }
      }
    })();
    return _inFlightPromise;
  }
  async function syncNow() {
    if (!enabled()) throw new Error('Cloud ไม่ได้เชื่อมต่อ');
    if (!_hydrated) throw new Error('Cloud ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่');
    if (_timer) { clearTimeout(_timer); _timer = null; }
    for (var attempt = 0; attempt < 4; attempt++) {
      if (_inFlight) await _inFlightPromise;
      if (!Object.keys(_pending).length) return true;
      if (!(await flush())) throw (_lastError || new Error('Cloud ยังไม่ยืนยันการบันทึก'));
    }
    throw (_lastError || new Error('Cloud ยังมีข้อมูลค้างส่ง'));
  }
  // Never send a whole database with an unverified keepalive request on tab
  // close. A normal foreground save waits for Cloud; hidden tabs may only try
  // the regular checked path while the browser still permits it to complete.
  try {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && _hydrated && Object.keys(_pending).length) flush(); });
    window.addEventListener('beforeunload', function (event) {
      if (_inFlight || Object.keys(_pending).length) { event.preventDefault(); event.returnValue = ''; }
    });
  } catch (e) {}

  async function pushAll() {
    if (!enabled() || !_hydrated) return false;
    await pushStore();  // งานโปร → แยกราย campaign (+ migrate ก้อนเก่า)
    var body = {}; TRACKED.forEach(function (k) {
      if (k === STORE_KEY || (k === 'pc_promo_files' && !_pending[k])) return;
      var v = localStorage.getItem(k);
      if (v != null && v !== _cloudCache[k]) body[k] = v;
    });
    if (Object.keys(body).length) await writeChecked(withKeyTs(body));
    return true;
  }

  /* ---- wrap setItem → auto-push key ที่ track (เขียนจริงด้วย _set กัน recursion) ---- */
  var _set = localStorage.setItem.bind(localStorage);
  try {
    /* FX-P67 — พื้นที่เต็ม (QuotaExceededError) = ท่อตัน: เขียนข้อมูลใหม่ไม่ลง ของเก่าค้าง แล้วดันทับกันไปมา
       → คืนพื้นที่จากคีย์ที่เลิกใช้ (ตราเวลารุ่นเก่า) + snapshot ฐานรุ่นเก่า แล้วลองเขียนอีกครั้ง */
    var DEAD = ['pc_key_edit_v1', 'pc_camp_edit_v1'];
    function reclaim() {
      DEAD.forEach(function (k) { try { if ((localStorage.getItem(k) || '').length > 2) _set(k, '{}'); } catch (e) {} });
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k2 = localStorage.key(i);
          if (k2 && /^pc_mock_store_v\d+$/.test(k2) && k2 !== 'pc_mock_store_v28') localStorage.removeItem(k2);
        }
      } catch (e) {}
    }
    localStorage.setItem = function (k, v) {
      if (k === STORE_KEY) v = compactStoreRaw(v);
      try { _set(k, v); } catch (e) {
        reclaim();
        try { _set(k, v); } catch (e2) { window.__PC_QUOTA_FULL = { at: new Date().toISOString(), key: k }; throw e2; }
      }
      if (TRACKED.indexOf(k) !== -1 && enabled()) {
        _writeEpoch++;
        if (k === STORE_KEY && _hydrated) _localStoreEdited = true;
        queuePush(k);
      }
    };
  } catch (e) {}

  /* ---- BACKUP/EXPORT (ไม่ต้องมี cloud) ----
     ถ้าเบราว์เซอร์รองรับ (Chrome/Edge) จะถามโฟลเดอร์ครั้งแรกครั้งเดียว แล้วจำไว้
     → กดสำรองครั้งต่อไปไฟล์วิ่งเข้าโฟลเดอร์นั้นเลย (เช่น "Backup Pro") ไม่ต้องเลือกซ้ำ
     เบราว์เซอร์ที่ไม่รองรับ → ดาวน์โหลดปกติ */
  var DIRDB = 'pc_backup_dir';
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('pc_backup', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function dirGet() {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var q = db.transaction('h', 'readonly').objectStore('h').get(DIRDB);
        q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function dirSet(h) {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var q = db.transaction('h', 'readwrite').objectStore('h').put(h, DIRDB);
        q.onsuccess = function () { res(true); }; q.onerror = function () { res(false); };
      });
    }).catch(function () { return false; });
  }
  function backupJson() {
    var out = { _app: 'potato-promo', _exportedAt: new Date().toISOString(), keys: {} };
    TRACKED.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) out.keys[k] = v; });
    return JSON.stringify(out, null, 2);
  }
  function backupName() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return 'potato-promo-backup-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  }
  function downloadFallback(text, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportLatestHistory() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('เบราว์เซอร์ไม่รองรับประวัติอัตโนมัติ'));
      var open = indexedDB.open('pc_sync_history', 1);
      open.onupgradeneeded = function () { open.result.createObjectStore('snapshots', { autoIncrement: true }); };
      open.onerror = function () { reject(open.error || new Error('เปิดประวัติไม่ได้')); };
      open.onsuccess = function () {
        var db = open.result, tx = db.transaction('snapshots', 'readonly');
        var request = tx.objectStore('snapshots').openCursor(null, 'prev');
        request.onsuccess = function () {
          db.close();
          var item = request.result && request.result.value;
          if (!item) return reject(new Error('ยังไม่มีสำเนาก่อน Cloud ดึงข้อมูล'));
          var filename = 'potato-promo-local-history-' + String(item.at || '').replace(/[^0-9]/g, '').slice(0, 14) + '.json';
          downloadFallback(JSON.stringify({ kind: 'local-before-cloud-pull', at: item.at, store: item.store }), filename);
          resolve(filename);
        };
        request.onerror = function () { db.close(); reject(request.error || new Error('อ่านประวัติไม่ได้')); };
      };
    });
  }
  async function exportFile(opts) {
    opts = opts || {};
    var text = backupJson(), name = backupName();
    if (!window.showDirectoryPicker) { downloadFallback(text, name); return { mode: 'download', name: name }; }
    try {
      var dir = opts.pickNew ? null : await dirGet();
      if (dir && dir.queryPermission) {
        var st = await dir.queryPermission({ mode: 'readwrite' });
        if (st !== 'granted') { st = await dir.requestPermission({ mode: 'readwrite' }); if (st !== 'granted') dir = null; }
      }
      if (!dir) {
        dir = await window.showDirectoryPicker({ id: 'pcBackup', mode: 'readwrite', startIn: 'documents' });
        await dirSet(dir);
      }
      var fh = await dir.createFileHandle(name, { create: true });
      var w = await fh.createWritable(); await w.write(text); await w.close();
      return { mode: 'folder', name: name, dir: dir.name };
    } catch (e) {
      if (e && e.name === 'AbortError') return { mode: 'cancel' };
      downloadFallback(text, name); return { mode: 'download', name: name, err: String(e && e.message || e) };
    }
  }
  async function backupNow(pickNew) {
    var r = await exportFile({ pickNew: !!pickNew });
    if (r.mode === 'cancel') return;
    if (window.Swal) {
      if (r.mode === 'folder') Swal.fire({ icon: 'success', title: 'สำรองข้อมูลแล้ว', html: 'บันทึกลงโฟลเดอร์ <b>' + String(r.dir).replace(/</g, '&lt;') + '</b><br><span class="small text-muted">' + r.name + '</span>', confirmButtonColor: '#2e934a' });
      else Swal.fire({ icon: 'success', title: 'สำรองข้อมูลแล้ว', html: 'ไฟล์ <b>' + r.name + '</b> อยู่ในโฟลเดอร์ดาวน์โหลด<br><span class="small text-muted">' + (window.showDirectoryPicker ? 'เลือกโฟลเดอร์เองได้ด้วยปุ่ม “เปลี่ยนโฟลเดอร์”' : 'เบราว์เซอร์นี้ยังไม่รองรับการเลือกโฟลเดอร์ (ใช้ Chrome/Edge)') + '</span>', confirmButtonColor: '#2e934a' });
    }
    try { var el = document.getElementById('pcBkDir'); if (el && r.dir) el.textContent = 'โฟลเดอร์สำรอง: ' + r.dir; } catch (e) {}
  }
  async function exportInfo() {
    if (!window.showDirectoryPicker) return { support: false };
    var d = await dirGet();
    return { support: true, dir: d ? d.name : '' };
  }
  function importData(text) {
    var d = JSON.parse(text); var keys = d.keys || d; var n = 0;
    Object.keys(keys).forEach(function (k) { if (TRACKED.indexOf(k) !== -1) { _set(k, k === STORE_KEY ? compactStoreRaw(keys[k]) : keys[k]); n++; } });
    return n;
  }
  function importFilePick() {
    if (enabled()) {
      var warning = 'ระบบปิดการกู้ไฟล์เก่าทับ Cloud โดยตรง เพื่อไม่ให้ข้อมูลล่าสุดของคนอื่นหาย กรุณาส่งไฟล์ให้ IT เทียบและกู้เฉพาะรายการ';
      if (window.Swal) Swal.fire('ต้องตรวจไฟล์ก่อนกู้', warning, 'warning'); else alert(warning);
      return;
    }
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function (e) {
        try {
          var n = importData(e.target.result);
          if (window.Swal) Swal.fire({ icon: 'success', title: 'กู้ข้อมูลแล้ว', html: 'นำเข้า <b>' + n + '</b> ชุดข้อมูล<br><span class="text-muted small">ระบบจะรีโหลดเพื่อโหลดข้อมูลใหม่</span>', timer: 1800, showConfirmButton: false }).then(reloadOnce);
          else reloadOnce();
        } catch (err) { if (window.Swal) Swal.fire('ผิดพลาด', 'ไฟล์ไม่ถูกต้อง: ' + String(err), 'error'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }
  function reloadOnce() { try { sessionStorage.setItem('pc_cloud_pulled', String(Date.now())); } catch (e) {} location.reload(); }

  /* ---- ทดสอบ + บันทึกการตั้งค่า cloud ---- */
  async function testAndSave(url, token) {
    url = String(url || '').trim(); token = String(token || '').trim();
    if (!url || !token) throw new Error('กรอก URL และ Token ให้ครบ');
    var r = await fetch(url.replace(/\/+$/, '') + '/health'); if (!r.ok) throw new Error('เชื่อมต่อ Worker ไม่ได้ (health ' + r.status + ')');
    saveCfg({ url: url, token: token });
    // Connecting to a Cloud account must not upload an old browser snapshot.
    _hydrated = false; _snap = {}; _cloudCache = {}; _cloudMtime = {}; _etag = null;
    await pull({ force: true });
    return true;
  }

  /* ============================ UI: chip + config ============================ */
  var _chipEl = null;
  function isAdmin() { try { return (localStorage.getItem('pc_role') || 'Admin') === 'Admin'; } catch (e) { return false; } }
  function setStatus(s) {
    if (!_chipEl) return;
    var map = {
      off:  { t: 'ตั้งค่า Cloud', c: '#6c757d', i: 'fa-cloud' },
      ok:   { t: 'ซิงค์แล้ว',     c: '#1d7a4d', i: 'fa-cloud-arrow-up' },
      sync: { t: 'กำลังซิงค์…',   c: '#9a6700', i: 'fa-cloud-arrow-up' },
      pulled:{t: 'ดึงข้อมูลใหม่', c: '#1d7a4d', i: 'fa-cloud-arrow-down' },
      err:  { t: 'ซิงค์มีปัญหา — แตะเพื่อลองใหม่',  c: '#c0392b', i: 'fa-triangle-exclamation' },
    };
    var m = map[s] || map.off;
    /* พนักงานทั่วไป: เห็นเฉพาะตอน "ซิงค์มีปัญหา" (err)
       แอดมิน: เห็นปุ่มตลอด เพื่อกดสำรอง/กู้ข้อมูล และตั้งค่า Cloud ได้ (ไม่ต้องจำคีย์ลัด) */
    var showAlways = isAdmin();
    _chipEl.style.display = (s === 'err' || showAlways) ? 'inline-flex' : 'none';
    _chipEl.style.background = (s === 'err') ? '#fff5f5' : '#fff';
    _chipEl.style.borderColor = m.c; _chipEl.style.color = m.c;
    var label = (s === 'err') ? m.t : (showAlways ? 'สำรอง / กู้ข้อมูล' : m.t);
    var icon = (s === 'err') ? m.i : (showAlways ? 'fa-database' : m.i);
    _chipEl.title = (s === 'err') ? m.t : 'สำรองข้อมูลเป็นไฟล์ / กู้จากไฟล์ / ตั้งค่า Cloud (แอดมินเท่านั้น)';
    _chipEl.innerHTML = '<i class="fas ' + icon + '"></i><span>' + label + '</span>';
  }
  function chip() {
    if (_chipEl) return;
    _chipEl = document.createElement('button');
    _chipEl.id = 'pcCloudChip';
    _chipEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.6px solid #6c757d;border-radius:999px;padding:7px 13px;font-family:Kanit,sans-serif;font-weight:700;font-size:.8rem;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.14)';
    _chipEl.onclick = openConfig;
    document.body.appendChild(_chipEl);
    // ⭐ ชิปถูกซ่อนตอนปกติ → เปิดตั้งค่า Cloud ด้วยคีย์ลัด Ctrl+Shift+C (สำหรับแอดมิน)
    if (!window.__pcCloudKey) { window.__pcCloudKey = true;
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); openConfig(); }
      });
    }
    setStatus(enabled() ? 'ok' : 'off');
    /* สลับผู้ใช้/ล็อกอินใหม่ในแท็บอื่น → อัปเดตการมองเห็นปุ่มตามสิทธิ์ */
    try { window.addEventListener('storage', function (e) { if (e && e.key === 'pc_role') setStatus(enabled() ? 'ok' : 'off'); }); } catch (e) {}
    window.PC_CLOUD_refreshChip = function () { setStatus(enabled() ? 'ok' : 'off'); };
  }
  function fillBkDir() { try { exportInfo().then(function (i) { var el = document.getElementById('pcBkDir'); if (!el) return; el.textContent = i.support ? ('โฟลเดอร์สำรอง: ' + (i.dir || 'ยังไม่ได้เลือก (จะถามครั้งแรก)')) : 'เบราว์เซอร์นี้บันทึกลงโฟลเดอร์ดาวน์โหลด'; }); } catch (e) {} }
  function openConfig() {
    if (!isAdmin()) {
      if (window.Swal) Swal.fire({ icon: 'info', title: 'สำหรับแอดมินเท่านั้น', text: 'การสำรอง/กู้ข้อมูล และตั้งค่า Cloud เปิดให้เฉพาะผู้ใช้สิทธิ์แอดมิน', confirmButtonColor: '#6c757d' });
      return;
    }
    var c = cfg();
    if (!window.Swal) {
      var url = prompt('Cloudflare Worker URL', c.url || '');
      if (url === null) return;
      var token = prompt('SYNC_TOKEN', c.token || '');
      if (token === null) return;
      testAndSave(url, token).then(function () { setStatus('ok'); alert('เชื่อมต่อ + ซิงค์ขึ้น cloud แล้ว'); }).catch(function (e) { alert('ผิดพลาด: ' + e.message); });
      return;
    }
    Swal.fire({
      title: '<i class="fas fa-cloud text-primary me-2"></i>ตั้งค่า Cloud (งานโปรโมชั่น)',
      width: 560,
      html:
        '<div class="text-start">' +
        '<div class="small text-muted mb-2">ซิงค์เฉพาะงานโปรโมชั่นขึ้น Cloudflare (D1) — ถ้ายังไม่ deploy Worker ใช้ปุ่มสำรอง/กู้ไฟล์ด้านล่างไปก่อนได้</div>' +
        '<label class="small fw-bold">Worker URL</label>' +
        '<input id="cclUrl" class="form-control form-control-sm mb-2" placeholder="https://potato-promo-sync.xxx.workers.dev" value="' + (c.url || '').replace(/"/g, '&quot;') + '">' +
        '<label class="small fw-bold">SYNC_TOKEN</label>' +
        '<input id="cclTok" class="form-control form-control-sm mb-2" placeholder="โทเคนลับที่ตั้งไว้ตอน deploy" value="' + (c.token || '').replace(/"/g, '&quot;') + '">' +
        '<div id="cclMsg" class="small fw-bold mt-1" style="min-height:18px"></div>' +
        '<hr class="my-2"><div class="small fw-bold text-muted mb-1">สำรอง/กู้ข้อมูล (ไฟล์ .json — ใช้ได้เลย ไม่ต้องมี cloud)</div>' +
        '<div class="d-flex gap-2">' +
        '<button type="button" class="btn btn-outline-dark btn-sm flex-grow-1" onclick="window.PC_CLOUD.backupNow()"><i class="fas fa-download me-1"></i>สำรองเป็นไฟล์</button>' +
        '<button type="button" class="btn btn-outline-dark btn-sm flex-grow-1" onclick="window.PC_CLOUD.importFilePick()"><i class="fas fa-upload me-1"></i>กู้จากไฟล์</button>' +
        '</div><button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-2" onclick="window.PC_CLOUD.exportLatestHistory().then(function(n){alert(\'ดาวน์โหลด \'+n+\' แล้ว — ส่งให้ IT ตรวจสอบก่อนนำเข้าระบบ\')}).catch(function(e){alert(e.message)})">ดาวน์โหลดสำเนาอัตโนมัติก่อน Cloud ดึงข้อมูล</button>' +
        '<div class="d-flex align-items-center gap-2 mt-2"><span class="small text-muted flex-grow-1" id="pcBkDir">โฟลเดอร์สำรอง: —</span>' +
        '<button type="button" class="btn btn-link btn-sm p-0" onclick="window.PC_CLOUD.backupNow(true)">เปลี่ยนโฟลเดอร์</button></div></div>',
      showCancelButton: true, confirmButtonText: '<i class="fas fa-plug"></i> เชื่อมต่อ + ซิงค์', confirmButtonColor: '#2e934a', cancelButtonText: 'ปิด',
      didOpen: function () {
        var btn = Swal.getConfirmButton();
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var url = document.getElementById('cclUrl').value, tok = document.getElementById('cclTok').value;
          var msg = document.getElementById('cclMsg'); msg.style.color = '#9a6700'; msg.textContent = 'กำลังเชื่อมต่อ…';
          testAndSave(url, tok).then(function () { msg.style.color = '#1d7a4d'; msg.textContent = '✓ เชื่อมต่อ + ซิงค์ขึ้น cloud แล้ว'; setStatus('ok'); setTimeout(function () { Swal.close(); }, 900); })
            .catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = '✗ ' + e.message; });
        });
      }
    });
  }

  /* ---- init: pull ตอนเปิด (รีโหลดครั้งเดียวถ้ามีของใหม่จาก cloud) ---- */
  async function init() {
    chip();
    if (!enabled()) return;
    try {
      var r = await pull();
      var lastReload = 0;
      try { lastReload = Number(sessionStorage.getItem('pc_cloud_pulled')) || 0; } catch (e) {}
      // Chrome Restore can preserve sessionStorage from the previous day. A
      // short-lived marker prevents reload loops without hiding new Cloud data.
      if (r.changed && Date.now() - lastReload > 30000) { reloadOnce(); return; }
      try { sessionStorage.removeItem('pc_cloud_pulled'); } catch (e) {}
      // หลัง pull เสร็จ (cloud→local) → บังคับแก้ข้อมูล Co-Promo ที่ต้องอัปเดต แล้ว push กลับ cloud ให้คงอยู่
      try { if (window.PC_applyCoPromoFixes && window.PC_applyCoPromoFixes()) await syncNow(); } catch (e) { setStatus('err'); return; }
      setStatus('ok');
    } catch (e) { setStatus('err'); }
    startPolling();
  }

  /* ---- near-realtime: poll cloud ทุก ~15 วิ → ถ้ามีของใหม่จากเครื่องอื่น โชว์ปุ่ม "รีเฟรช"
     (ไม่ auto-reload เพื่อไม่ให้ข้อมูลที่กำลังกรอกหาย) ---- */
  var POLL_MS = 20000, _pollTimer = null, _refreshPill = null, _polling = false;
  function pendingLocal() { return _timer != null || _inFlight || Object.keys(_pending).length > 0; }
  async function poll() {
    if (!enabled() || pendingLocal() || document.hidden || _polling) return;   // อย่าดึงทับตอนกำลังพิมพ์/แท็บถูกซ่อน/รอบก่อนยังไม่จบ
    _polling = true;
    try {
      // The sync Worker does not provide 304/ETag for /promo/store. Polling
      // that endpoint would transfer and parse the whole database every 20s.
      // Compare lightweight key versions first; a real change still uses the
      // normal guarded pull so storage reload/conflict behavior stays intact.
      try {
        var latestMeta = await remoteMeta();
        var latestKeys = Object.keys(latestMeta), knownKeys = Object.keys(_cloudMtime);
        if (_hydrated && latestKeys.length === knownKeys.length &&
          latestKeys.every(function (k) { return sameVersion(latestMeta[k], _cloudMtime[k]); })) {
          failReset(); setStatus('ok'); return;
        }
      } catch (metaError) {
        // Older Worker or temporary meta failure: preserve the existing full
        // pull fallback instead of silently skipping external changes.
      }
      var r = await pull();
      failReset();
      if (r.changed) showRefreshPill();
      else setStatus('ok');
    } catch (e) { failSoft(null); }   // พลาดครั้งเดียวไม่เตือน — ครบ 3 ครั้งติดหรือออฟไลน์จึงขึ้นชิปแดง
    finally { _polling = false; }
  }
  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(poll, POLL_MS);
    // ดึงทันทีเมื่อผู้ใช้กลับมาที่แท็บ (เห็นข้อมูลล่าสุดเร็วขึ้น)
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }
  function showRefreshPill() {
    setStatus('pulled');
    if (_refreshPill) return;
    _refreshPill = document.createElement('button');
    _refreshPill.id = 'pcCloudRefresh';
    _refreshPill.title = 'มีข้อมูลใหม่จากเครื่องอื่น — คลิกเพื่อรีเฟรช';
    _refreshPill.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:100000;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#1d7a4d;color:#fff;border:0;border-radius:50%;font-size:1.25rem;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.24);animation:pcCloudSpinPop .25s ease';
    _refreshPill.innerHTML = '<i class="fas fa-rotate" style="animation:pcCloudSpin 2s linear infinite"></i>';
    _refreshPill.onclick = function () { reloadOnce(); };
    try { var st = document.createElement('style'); st.textContent = '@keyframes pcCloudSpinPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}@keyframes pcCloudSpin{to{transform:rotate(360deg)}}'; document.head.appendChild(st); } catch (e) {}
    document.body.appendChild(_refreshPill);
  }

  /* ==========================================================================
   *  FX-P79 — กันพื้นที่เต็มอีก (ตัวเก็บกวาดอัตโนมัติ)
   *  ทุกครั้งที่เปิดระบบ: ตัดล็อกแจ้งเตือนเก่า · ลบร่างค้างของงานที่ปิดแล้ว · ลบคีย์รุ่นเก่าที่เลิกใช้
   *  + รายงานคีย์ที่ใกล้เกินพิกัดของคลาวด์ (ดูได้ที่ PC_CLOUD.health()) */
  var JANITOR = {
    logCap: 300,          /* pc_notify_log — เก็บล่าสุดกี่รายการ */
    draftDays: 30,        /* ร่าง (draft) เก่าเกินกี่วัน = ลบ */
    warnKB: 450           /* คีย์เดียวใหม่เกินเท่านี้ = เสี่ยงคลาวด์ดันไม่ขึ้น */
  };
  function kb(v) { return Math.round(String(v == null ? '' : v).length / 1024); }
  function janitor() {
    var freed = 0;
    /* 1) ล็อกแจ้งเตือน — เก็บเท่าที่จำเป็น */
    try {
      var lg = JSON.parse(localStorage.getItem('pc_notify_log') || '[]');
      if (Array.isArray(lg) && lg.length > JANITOR.logCap) {
        var before = kb(JSON.stringify(lg));
        localStorage.setItem('pc_notify_log', JSON.stringify(lg.slice(0, JANITOR.logCap)));
        freed += before - kb(localStorage.getItem('pc_notify_log'));
      }
    } catch (e) {}
    /* 2) ร่างเก่าเกิน 30 วัน (ดูจาก savedAt/ts ข้างใน) */
    try {
      var cut = Date.now() - JANITOR.draftDays * 864e5, del = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || !/draft/i.test(k)) continue;
        var raw = localStorage.getItem(k) || '';
        var m = raw.match(/"(savedAt|ts|updatedAt)"\s*:\s*"?(\d{10,13}|\d{4}-\d{2}-\d{2})/);
        var when = null;
        if (m) when = /^\d{10,13}$/.test(m[2]) ? Number(m[2].length === 10 ? m[2] + '000' : m[2]) : Date.parse(m[2]);
        if (when && when < cut) { del.push([k, kb(raw)]); }
      }
      del.forEach(function (d) { try { localStorage.removeItem(d[0]); freed += d[1]; } catch (e) {} });
    } catch (e) {}
    /* 3) คีย์รุ่นเก่าที่เลิกใช้แล้ว */
    try {
      ['pc_key_edit_v1', 'pc_camp_edit_v1'].forEach(function (k) {
        var n = kb(localStorage.getItem(k)); if (n > 1) { localStorage.setItem(k, '{}'); freed += n; }
      });
    } catch (e) {}
    return freed;
  }
  function health() {
    var used = 0, big = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), n = kb(localStorage.getItem(k));
        used += n;
        if (TRACKED.indexOf(k) !== -1 && n >= JANITOR.warnKB) big.push(k + ' = ' + n + 'KB');
      }
    } catch (e) {}
    return { usedKB: used, limitKB: 5120, pct: Math.round(used / 5120 * 100), bigCloudKeys: big,
      lastFail: window.__PC_QUOTA_FULL || null, cloudReady: _hydrated, pending: Object.keys(_pending),
      lastSyncError: _lastError ? String(_lastError.message || _lastError) : null };
  }

  window.PC_CLOUD = {
    cfg: cfg, setup: function (url, token) { return testAndSave(url, token); },
    enabled: enabled, pull: pull, pushAll: pushAll, syncNow: syncNow,
    readMailHistory:readMailHistory, saveMailDecision:saveMailDecision, readCloudKey: readCloudKey, saveCoPromoDrafts: saveCoPromoDrafts, saveCoPromoRecords: saveCoPromoRecords, submissionReceipt: submissionReceipt, commitSubmission: commitSubmission,
    loadCampaignEdit:loadCampaignEdit, saveCampaignEdit:saveCampaignEdit, assignITButtonCode:assignITButtonCode,
    prepareCampaignWrites: prepareCampaignWrites,
    savePreparedCampaignRows: savePreparedCampaignRows,
    readCampaignRows: readCampaignRows,
    readSubmissionSnapshot: readSubmissionSnapshot, readActivity: readActivity, appendActivity: appendActivity,
    hasPending: function () { return _inFlight || Object.keys(_pending).length > 0; },
    ready: function () { return _hydrated; }, whenReady: whenReady,
    exportFile: exportFile, exportInfo: exportInfo, backupNow: backupNow, exportLatestHistory: exportLatestHistory,
    importFilePick: importFilePick, openConfig: openConfig,
    janitor: janitor, health: health,
    TRACKED: TRACKED,
  };
  try { var _fr = janitor(); if (_fr > 40) console.log('[cloud-store] คืนพื้นที่ ' + _fr + 'KB'); var _h = health(); if (_h.pct >= 80 || _h.bigCloudKeys.length) console.warn('[cloud-store] พื้นที่ใช้ ' + _h.pct + '%', _h.bigCloudKeys); } catch (e) {}
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
