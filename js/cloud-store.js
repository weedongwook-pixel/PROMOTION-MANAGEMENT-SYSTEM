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
    'pc_subset_meta', 'pc_subset_powders',                       // subset meta / ผงในชุด (ใช้ในฟอร์ม Item Set)
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
  var MERGE_LIST_KEYS = ['pc_code_requests', 'pc_branch_tickets', 'pc_tender_requests', 'pc_billdiff_reports',
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

  function campOf(r) { return String((r && r.campaign) || '__nocamp'); }
  function campCloudKey(c) { return CAMP_PREFIX + encodeURIComponent(c); }
  function splitStore(s) {
    var meta = {}, camps = {};
    Object.keys(s || {}).forEach(function (k) { if (k !== 'working' && k !== 'months') meta[k] = s[k]; });
    ((s && s.working) || []).forEach(function (r) { var c = campOf(r); (camps[c] = camps[c] || { w: [], m: {} }).w.push(r); });
    Object.keys((s && s.months) || {}).forEach(function (mk) {
      (s.months[mk] || []).forEach(function (r) { var c = campOf(r); (camps[c] = camps[c] || { w: [], m: {} }); (camps[c].m[mk] = camps[c].m[mk] || []).push(r); });
    });
    return { meta: meta, camps: camps };
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
  /* ---- ทะเบียนแคมเปญที่ถูกลบ (tombstone) — FX-P64 -----------------------------
     เดิม: แคมเปญที่ "มีเฉพาะในเครื่อง" = ถือว่าเพิ่งแจ้งเข้ามา → คงไว้ + push ขึ้นคลาวด์
       → แคมเปญที่เครื่องอื่นลบไปแล้ว โดนเครื่องที่ยังมีอยู่ "ดันกลับขึ้นใหม่" ทุกรอบ (ลบไม่หายสักที)
     ตอนนี้: เวลาลบ เขียนทะเบียนไว้บนคลาวด์ (ชื่อแคมเปญ → เวลา) · เครื่องอื่นเห็นแล้วลบของตัวเองตาม */
  var DEL_CLOUDKEY = 'promo::deleted';
  var _tombs = {};
  function campTs() { try { var m = JSON.parse(localStorage.getItem(CAMP_TS_KEY) || '{}') || {}; if (_migSig(m)) saveCampTs(m); return m; } catch (e) { return {}; } }
  function saveCampTs(m) { try { localStorage.setItem(CAMP_TS_KEY, JSON.stringify(m)); } catch (e) {} }
  /* ประทับเวลาให้แคมเปญที่เนื้อหาในเครื่องต่างจากก้อนที่ซิงค์ล่าสุด (= มีคนแก้ในเครื่องนี้) */
  function noteLocalEdits(camps) {
    var m = campTs(), now = Date.now(), dirty = false;
    Object.keys(camps || {}).forEach(function (c) {
      var sig = _sig(JSON.stringify(camps[c]));
      var e2 = m[c];
      if (e2 && e2.sig === sig) return;           /* เนื้อหาเดิม → คงเวลาเดิม (ไม่ push ซ้ำ) */
      /* ⭐ เพิ่งเห็นแคมเปญนี้ครั้งแรก (ไม่รู้ว่าของในเครื่องเก่าหรือใหม่) = ตั้ง ts 0 → ให้คลาวด์ชนะ
         กันเครื่องที่ถือข้อมูลเก่าค้าง พออัปโค้ดใหม่ครั้งแรกแล้วหลงนึกว่าตัวเองเพิ่งแก้ → ดันของเก่าทับ */
      m[c] = { ts: (e2 ? now : 0), sig: sig }; dirty = true;
    });
    if (dirty) saveCampTs(m);
    return m;
  }
  function localTsOf(m, c) { return (m[c] && Number(m[c].ts)) || 0; }
  function reassembleFromCloud(keys) {
    var meta = {}; try { meta = JSON.parse(keys[META_CLOUDKEY] || '{}'); } catch (e) {}
    var local = {}; try { local = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) {}
    var store = {}; Object.keys(meta).forEach(function (k) { store[k] = meta[k]; });
    /* คีย์รายการงาน: รวม local + cloud (ตัวที่ stamp ใหม่กว่าชนะ) */
    META_LIST_KEYS.forEach(function (k) {
      if (!Array.isArray(local[k]) && !Array.isArray(meta[k])) return;
      store[k] = mergeMetaList(local[k], meta[k]);
      /* FX-P84 — ผลรวมมีของที่คลาวด์ยังไม่มี (เครื่องนี้เพิ่งเพิ่ม) → ดันขึ้นให้เครื่องอื่นเห็นด้วย */
      try { if (JSON.stringify(store[k]) !== JSON.stringify(meta[k] || [])) queuePush(STORE_KEY); } catch (e) {}
    });
    /* ตัวนับเลขเอกสาร: ใช้ค่ามากสุด กันออกเลขซ้ำเมื่อ 2 เครื่องส่งพร้อมกัน */
    ['_flvSeq', '_npdSeq', '_revSeq'].forEach(function (k) {
      var a = Number(local[k]) || 0, b = Number(meta[k]) || 0;
      if (a || b) store[k] = Math.max(a, b);
    });
    store.working = []; store.months = {};
    var localCamps = splitStore(local).camps;
    var tsMap = noteLocalEdits(localCamps);
    var seenCamp = {};
    var putBlock = function (b) {
      (b.w || []).forEach(function (r) { store.working.push(r); });
      Object.keys(b.m || {}).forEach(function (mk) { (store.months[mk] = store.months[mk] || []); (b.m[mk] || []).forEach(function (r) { store.months[mk].push(r); }); });
    };
    Object.keys(keys).forEach(function (ck) {
      if (ck.indexOf(CAMP_PREFIX) !== 0) return;
      var b; try { b = JSON.parse(keys[ck]); } catch (e) { return; }
      var c = null; try { c = decodeURIComponent(ck.slice(CAMP_PREFIX.length)); } catch (e) {}
      if (c != null) seenCamp[c] = 1;
      /* ⭐ ของในเครื่องใหม่กว่าก้อนบนคลาวด์ → คงของในเครื่อง แล้วดันขึ้นแทน (กันงานที่เพิ่งบันทึกถูกทับ) */
      if (c != null && localCamps[c]) {
        var lt = localTsOf(tsMap, c), ct = Number(b._ts) || 0;
        var same = JSON.stringify({ w: b.w || [], m: b.m || {} }) === JSON.stringify(localCamps[c]);
        if (!same && lt > ct) { putBlock(localCamps[c]); queuePush(STORE_KEY); return; }
      }
      putBlock(b);
    });
    /* ⭐ แคมเปญที่มีเฉพาะในเครื่อง (เพิ่งแจ้งเข้ามา ยัง push ไม่ขึ้น) ต้องคงไว้ ไม่ใช่ถูกล้างทิ้ง
       เดิมประกอบ working/months จากคลาวด์ล้วน → งานโปรที่เพิ่งบันทึกหายตอน poll (ทุก 15 วิ) */
    Object.keys(localCamps).forEach(function (c) {
      if (seenCamp[c]) return;                       /* คลาวด์มีแล้ว → จัดการไปแล้วด้านบน */
      /* ⭐ FX-P64 — ถ้าเครื่องอื่นลบแคมเปญนี้ทิ้งหลังการแก้ครั้งสุดท้ายของเครื่องนี้ → ลบตาม ไม่ดันกลับขึ้น */
      var tomb = Number(_tombs[c]) || 0;
      if (tomb && tomb >= localTsOf(tsMap, c)) { queuePush(STORE_KEY); return; }
      var b = localCamps[c];
      (b.w || []).forEach(function (r) { store.working.push(r); });
      Object.keys(b.m || {}).forEach(function (mk) { (store.months[mk] = store.months[mk] || []); (b.m[mk] || []).forEach(function (r) { store.months[mk].push(r); }); });
      queuePush(STORE_KEY);                          /* ดันขึ้นคลาวด์ให้เครื่องอื่นเห็นด้วย */
    });
    return store;
  }
  /* push งานโปรแบบราย campaign: เขียนเฉพาะแคมเปญที่เปลี่ยน + ลบเฉพาะที่เครื่องนี้เคยรู้จักแล้วหายไป */
  async function pushStore() {
    var raw = localStorage.getItem(STORE_KEY); if (raw == null) return;
    var store; try { store = JSON.parse(raw); } catch (e) { return; }
    var sp = splitStore(store);
    var tsMap = noteLocalEdits(sp.camps);
    var desired = {}; desired[META_CLOUDKEY] = JSON.stringify(sp.meta);
    Object.keys(sp.camps).forEach(function (c) {
      desired[campCloudKey(c)] = JSON.stringify({ w: sp.camps[c].w, m: sp.camps[c].m, _ts: localTsOf(tsMap, c) });
    });
    var body = {}; Object.keys(desired).forEach(function (ck) { if (_snap[ck] !== desired[ck]) body[ck] = desired[ck]; });
    /* แคมเปญที่เครื่องนี้เคยรู้จักแล้วหายไป = ถูกลบ → เขียนทะเบียนขึ้นคลาวด์ด้วย */
    var gone = Object.keys(_snap).filter(function (ck) { return ck.indexOf(CAMP_PREFIX) === 0 && !desired[ck]; });
    if (gone.length) {
      var now = Date.now(), changedTomb = false;
      gone.forEach(function (ck) { try { var c = decodeURIComponent(ck.slice(CAMP_PREFIX.length)); if (!_tombs[c]) { _tombs[c] = now; changedTomb = true; } } catch (e) {} });
      if (changedTomb) body[DEL_CLOUDKEY] = JSON.stringify(_tombs);
    }
    if (Object.keys(body).length) {
      await api('/promo/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    var dels = Object.keys(_snap).filter(function (ck) { return ck.indexOf(CAMP_PREFIX) === 0 && !desired[ck]; });
    for (var i = 0; i < dels.length; i++) { try { await api('/promo/store/' + encodeURIComponent(dels[i]), { method: 'DELETE' }); } catch (e) {} }
    if (_migrateLegacy) { try { await api('/promo/store/' + encodeURIComponent(STORE_KEY), { method: 'DELETE' }); } catch (e) {} _migrateLegacy = false; }
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

  /* ---- pull: cloud → localStorage (คืน changed=true ถ้ามีอะไรต่างจากในเครื่อง) ---- */
  var _etag = null;
  /* ---- FX-P65: ดึงข้อมูลแบบรายคีย์ (meta-driven) ------------------------------
     อาการ: `GET /promo/store` (ก้อนเดียวทั้งฐาน ~หลาย MB) เริ่มล้มที่ Worker → เบราว์เซอร์ได้
       "Failed to fetch" ทั้งที่ /health ปกติ → ซิงค์ตายทั้งระบบ ข้อมูลค้างของเก่า
     แก้: อ่าน `GET /promo/meta` (เบา ~30KB) เอารายชื่อคีย์+เวลาแก้ไข แล้วดึงเฉพาะคีย์ที่เปลี่ยน
       ผ่าน `GET /promo/store/:key` ทีละชุด · คีย์ที่ไม่เปลี่ยนใช้ค่าที่แคชไว้ */
  var _cloudCache = {}, _cloudMtime = {};
  async function fetchKeysViaMeta(force) {
    var r = await api('/promo/meta');
    if (!r.ok) throw new Error('meta ' + r.status);
    var d = await r.json(); var meta = d.meta || {};
    var names = Object.keys(meta);
    var need = names.filter(function (k) { return force || _cloudCache[k] == null || _cloudMtime[k] !== meta[k]; });
    for (var i = 0; i < need.length; i += 8) {
      var batch = need.slice(i, i + 8);
      await Promise.all(batch.map(function (k) {
        return api('/promo/store/' + encodeURIComponent(k)).then(function (res) {
          if (!res.ok) return null;
          return res.json().then(function (j) { if (j && j.ok) { _cloudCache[k] = j.value; _cloudMtime[k] = meta[k]; } });
        }).catch(function () { });
      }));
    }
    Object.keys(_cloudCache).forEach(function (k) { if (!(k in meta)) { delete _cloudCache[k]; delete _cloudMtime[k]; } });
    var keys = {}; names.forEach(function (k) { if (_cloudCache[k] != null) keys[k] = _cloudCache[k]; });
    return keys;
  }
  async function pull(opt) {
    if (!enabled()) return { changed: false, reason: 'not-configured' };
    var keys = null;
    /* ⭐ ถ้าคลาวด์ยังเป็นก้อนเดิม (ETag ตรง) → ตอบ 304 ไม่ต้องโหลดข้อมูล 2-3MB ซ้ำทุกรอบ */
    var hdr = (_etag && !(opt && opt.force)) ? { 'If-None-Match': _etag } : {};
    try {
      var r = await api('/promo/store', { headers: hdr });
      if (r.status === 304) return { changed: false, keys: 0, cached: true };
      if (!r.ok) throw new Error('pull ' + r.status);
      try { var et = r.headers.get('ETag'); if (et) _etag = et; } catch (e) {}
      var d = await r.json(); keys = d.keys || {};
    } catch (bulkErr) {
      keys = await fetchKeysViaMeta(!!(opt && opt.force));   // ก้อนใหญ่ล้ม → ดึงรายคีย์แทน
      _etag = null;
    }
    var changed = false, n = 0;
    // (1) งานโปร: ประกอบร่างจาก key ราย campaign (promo::c::*) + meta
    var campKeys = Object.keys(keys).filter(function (k) { return k.indexOf(CAMP_PREFIX) === 0; });
    var hasMeta = keys[META_CLOUDKEY] != null;
    if (campKeys.length || hasMeta) {
      try { _tombs = JSON.parse(keys[DEL_CLOUDKEY] || '{}') || {}; } catch (e) { _tombs = {}; }
      var store = reassembleFromCloud(keys);
      var newStr = JSON.stringify(store);
      if (localStorage.getItem(STORE_KEY) !== newStr) { _set(STORE_KEY, newStr); changed = true; }
      _snap = {}; if (hasMeta) _snap[META_CLOUDKEY] = keys[META_CLOUDKEY]; campKeys.forEach(function (ck) { _snap[ck] = keys[ck]; });
      _migrateLegacy = (keys[STORE_KEY] != null); // ถ้ายังมีก้อนเก่าค้าง → ลบตอน push ถัดไป
    } else if (keys[STORE_KEY] != null) {
      // รุ่นเก่า: cloud ยังเก็บก้อนเดียว → โหลดมาใช้ แล้ว migrate ตอน push แรก
      if (localStorage.getItem(STORE_KEY) !== keys[STORE_KEY]) { _set(STORE_KEY, keys[STORE_KEY]); changed = true; }
      _snap = {}; _migrateLegacy = true;
    }
    // (2) key อื่น ๆ (ตั้งค่า/สิทธิ์): ยังใช้ทั้งก้อน (แก้พร้อมกันน้อย)
    TRACKED.forEach(function (k) {
      if (k === STORE_KEY) return;
      if (keys[k] == null) return;
      n++;
      var cur = localStorage.getItem(k);
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
    return { changed: changed, keys: n };
  }

  /* ---- push: localStorage → cloud (debounced auto-push + pushAll) ---- */
  var _pending = {}, _timer = null, _inFlight = false, _fails = 0, _retryTimer = null;
  var RETRY_MS = [4000, 12000, 30000];
  function queuePush(k) { _pending[k] = 1; if (_timer || _inFlight) return; _timer = setTimeout(flush, 1200); }
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
    _timer = null; if (!enabled()) { _pending = {}; return; }
    if (_inFlight) { if (!_timer) _timer = setTimeout(flush, 1500); return; }   // กันยิงทับกันจนเวิร์กเกอร์ตอบไม่ทัน
    var pend = Object.keys(_pending); _pending = {};
    if (!pend.length) return;
    _inFlight = true; setStatus('sync');
    try {
      if (pend.indexOf(STORE_KEY) !== -1) await pushStore();   // งานโปร → แยกราย campaign
      var body = {}; pend.forEach(function (k) { if (k === STORE_KEY) return; var v = localStorage.getItem(k); if (v != null) body[k] = v; });
      withKeyTs(body);
      if (Object.keys(body).length) {
        var res = await api('/promo/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('push ' + res.status);
      }
      _etag = null;                       // ของเราเพิ่งเปลี่ยน → ให้ poll รอบหน้าโหลดของจริง
      failReset(); setStatus('ok');
    } catch (e) { failSoft(pend); }
    finally { _inFlight = false; if (Object.keys(_pending).length && !_timer && !_retryTimer) _timer = setTimeout(flush, 1500); }
  }
  /* ---- flush ทันทีตอนปิด/ซ่อนหน้า (ไม่รอ debounce 1.2 วิ) — กันงานที่เพิ่งกดหายตอนรีเฟรช ---- */
  function flushSync() {
    if (!enabled()) return;
    var pend = Object.keys(_pending); if (!pend.length) return;
    _pending = {}; if (_timer) { clearTimeout(_timer); _timer = null; }
    var body = {};
    pend.forEach(function (k) { if (k === STORE_KEY) return; var v = localStorage.getItem(k); if (v != null) body[k] = v; });
    if (pend.indexOf(STORE_KEY) !== -1) {
      try {
        var sp = splitStore(JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
        var tsMap = noteLocalEdits(sp.camps);
        body[META_CLOUDKEY] = JSON.stringify(sp.meta);
        /* ⚠️ ต้องแนบ _ts ทุกครั้ง — เดิม flushSync (ตอนปิด/รีเฟรชหน้า) ดันก้อนแคมเปญขึ้นแบบไม่มีเวลา
           → ของเก่าในแท็บนั้นทับของใหม่บนคลาวด์ได้ (ต้นเหตุเดียวกับ FX-P60) */
        Object.keys(sp.camps).forEach(function (c) {
          body[campCloudKey(c)] = JSON.stringify({ w: sp.camps[c].w, m: sp.camps[c].m, _ts: localTsOf(tsMap, c) });
        });
      } catch (e) {}
    }
    if (!Object.keys(body).length) return;
    try {
      fetch(base() + '/promo/store', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg().token || '') },
        body: JSON.stringify(body) });
    } catch (e) {}
  }
  try {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSync(); });
    window.addEventListener('pagehide', flushSync);
    window.addEventListener('beforeunload', flushSync);
  } catch (e) {}

  async function pushAll() {
    if (!enabled()) return false;
    await pushStore();  // งานโปร → แยกราย campaign (+ migrate ก้อนเก่า)
    var body = {}; TRACKED.forEach(function (k) { if (k === STORE_KEY) return; var v = localStorage.getItem(k); if (v != null) body[k] = v; });
    if (Object.keys(body).length) { var r = await api('/promo/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.ok; }
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
      try { _set(k, v); } catch (e) {
        reclaim();
        try { _set(k, v); } catch (e2) { window.__PC_QUOTA_FULL = { at: new Date().toISOString(), key: k }; throw e2; }
      }
      if (TRACKED.indexOf(k) !== -1 && enabled()) queuePush(k);
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
    Object.keys(keys).forEach(function (k) { if (TRACKED.indexOf(k) !== -1) { _set(k, keys[k]); n++; } });
    return n;
  }
  function importFilePick() {
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
  function reloadOnce() { try { sessionStorage.setItem('pc_cloud_pulled', '1'); } catch (e) {} location.reload(); }

  /* ---- ทดสอบ + บันทึกการตั้งค่า cloud ---- */
  async function testAndSave(url, token) {
    url = String(url || '').trim(); token = String(token || '').trim();
    if (!url || !token) throw new Error('กรอก URL และ Token ให้ครบ');
    var r = await fetch(url.replace(/\/+$/, '') + '/health'); if (!r.ok) throw new Error('เชื่อมต่อ Worker ไม่ได้ (health ' + r.status + ')');
    saveCfg({ url: url, token: token });
    // ครั้งแรก: ดัน localStorage ที่มีอยู่ขึ้น cloud แล้วดึงกลับให้ตรงกัน
    await pushAll();
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
        '</div>' +
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
      if (r.changed && !sessionStorage.getItem('pc_cloud_pulled')) { reloadOnce(); return; }
      // หลัง pull เสร็จ (cloud→local) → บังคับแก้ข้อมูล Co-Promo ที่ต้องอัปเดต แล้ว push กลับ cloud ให้คงอยู่
      try { if (window.PC_applyCoPromoFixes && window.PC_applyCoPromoFixes()) { await pushAll(); } } catch (e) {}
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
    return { usedKB: used, limitKB: 5120, pct: Math.round(used / 5120 * 100), bigCloudKeys: big, lastFail: window.__PC_QUOTA_FULL || null };
  }

  window.PC_CLOUD = {
    cfg: cfg, setup: function (url, token) { return testAndSave(url, token); },
    enabled: enabled, pull: pull, pushAll: pushAll,
    exportFile: exportFile, exportInfo: exportInfo, backupNow: backupNow, importFilePick: importFilePick, openConfig: openConfig,
    janitor: janitor, health: health,
    TRACKED: TRACKED,
  };
  try { var _fr = janitor(); if (_fr > 40) console.log('[cloud-store] คืนพื้นที่ ' + _fr + 'KB'); var _h = health(); if (_h.pct >= 80 || _h.bigCloudKeys.length) console.warn('[cloud-store] พื้นที่ใช้ ' + _h.pct + '%', _h.bigCloudKeys); } catch (e) {}
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
