/* ============================================================================
 * POTATO CORNER — MOCK BACKEND
 * Re-implements every google.script.run server function from Code.gs against an
 * in-browser data store (seeded from the real Excel export, persisted to
 * localStorage). Lets the whole Apps Script web-app run standalone with no Google.
 * ==========================================================================*/
(function () {
  "use strict";

  const SEED = window.PC_SEED || { items: [], branches: [], users: [], categories: [] };
  // Real product catalog (data/item-master.js) is loaded LAZILY for fast first paint.
  // Resolve SEED.items live from window.PC_ITEM_MASTER so it picks up the catalog whenever
  // it finishes streaming in the background — no init-time dependency on the 1.25MB file.
  (function () {
    var _demoItems = SEED.items || [];
    function liveItems() { return (window.PC_ITEM_MASTER && window.PC_ITEM_MASTER.length) ? window.PC_ITEM_MASTER : _demoItems; }
    try {
      Object.defineProperty(SEED, "items", { get: liveItems, set: function (v) { _demoItems = v; }, configurable: true });
      if (window.PC_SEED && window.PC_SEED !== SEED) Object.defineProperty(window.PC_SEED, "items", { get: liveItems, set: function (v) { _demoItems = v; }, configurable: true });
    } catch (e) { if (window.PC_ITEM_MASTER && window.PC_ITEM_MASTER.length) SEED.items = window.PC_ITEM_MASTER; }
  })();
  const STORE_KEY = "pc_mock_store_v28";

  /* ---- demo users (Users sheet only had 1 admin; add MKT/IT for role testing) */
  const USERS = [
    { username: "One",  password: "Theone", role: "Admin", name: "Wanvisa" },
    { username: "mkt",  password: "mkt",     role: "MKT",   name: "MKT Team" },
    { username: "it",   password: "it",      role: "IT",    name: "IT Support" },
    { username: "op",   password: "op",      role: "OP",    name: "Operations" },
    { username: "acc",  password: "acc",     role: "ACC",   name: "Accounting" },
    { username: "bd",   password: "bd",      role: "BD",    name: "BD Team" },
    { username: "rd",   password: "rd",      role: "RD",    name: "RD / NPD Team" },
    { username: "hq",   password: "hq",      role: "Admin HQ", name: "Admin HQ" },
    { username: "wanvisa.c@rocksgroup.com", password: "ms-sso", role: "Admin", name: "Wanvisa Chanthowong", email: "wanvisa.c@rocksgroup.com" },
  ];
  // combined list = built-in demo users (with admin overrides applied) + admin-added users
  function allUsers() {
    const ov = (store && store.userOverrides) || {};
    const base = USERS.map(u => Object.assign({}, u, ov[u.username] || {}));
    return base.concat((store && store.users) || []);
  }

  /* ===========================================================================
   * DATA STORE  (mirrors the Google Sheet structure)
   *  - working : IT_WORKING_SHEET rows (one per POS button)
   *  - months  : { "YYYY-MM": [ Promotion month rows (one per item line) ] }
   * ========================================================================== */
  let store = loadStore();
  rebuildWorking(store);
  // ⭐ normalize Type: "Voucher Normal" / "Voucher Online" → "Voucher" (idempotent · แก้ทั้งของเก่า · self-correct หลัง cloud pull)
  (function normalizeVoucherTypes(){
    try {
      var n = 0;
      Object.keys(store.months || {}).forEach(function (m) {
        (store.months[m] || []).forEach(function (r) {
          ["promoType", "typePromotion", "typeSel"].forEach(function (k) {
            if (/^voucher\s+normal\b/i.test(String(r[k] || ""))) { r[k] = "Voucher"; n++; }  // เฉพาะ Normal · ไม่ยุ่ง Online
          });
        });
      });
      if (n) persist();
    } catch (e) {}
  })();
  // ⭐ C: ล็อกโค้ด VC0293 (M CARD COUPON 100 THB) = CONFIRMED ในคลังเลข → IT คีย์ใช้ได้ ไม่ถูกแจกซ้ำ (เฉพาะโค้ดนี้ · idempotent)
  setTimeout(function () {
    try {
      if (!window.PC_COUNTER || !PC_COUNTER.state) return;
      var st = PC_COUNTER.state(); if (!st.reservations) st.reservations = {};
      var k = "voucher::VC0293", e = st.reservations[k], now = new Date().toISOString();
      if (!e) {
        st.reservations[k] = { code: "VC0293", type: "voucher", num: 293, status: "CONFIRMED", where: "M CARD COUPON 100 THB", campaign: "M CARD COUPON 100 THB", field: "", by: "IT", at: now, confirmedAt: now, releasedAt: "" };
        if (PC_COUNTER._save) PC_COUNTER._save(); else if (PC_COUNTER.store && PC_COUNTER.store.write) PC_COUNTER.store.write(st);
      } else if (e.status !== "CONFIRMED") {
        e.status = "CONFIRMED"; e.confirmedAt = now; e.campaign = e.campaign || "M CARD COUPON 100 THB";
        if (PC_COUNTER._save) PC_COUNTER._save();
      }
    } catch (e) {}
  }, 2500);
  var NPD_SEED_VER = 6;
  if (!Array.isArray(store.npd) || (!store.npd.length && !store._npdSeeded)) { store.npd = seedDemoNpd(); store._npdSeeded = true; store._npdSeedVer = NPD_SEED_VER; persist(); } // seed-once: ไม่เขียนทับ NPD ที่ IT แก้ไปแล้วตอน bump version (refresh seed = bump STORE_KEY)
  var FLV_SEED_VER = 2;
  if (!Array.isArray(store.flavor) || (!store.flavor.length && !store._flvSeeded)) { store.flavor = seedDemoFlavor(); store._flvSeeded = true; store._flvSeedVer = FLV_SEED_VER; persist(); } // seed-once
  // Non-destructive: ensure there is a PENDING Item Set for IT_Settlement to work on (does NOT wipe user data)
  var ITEMSET_DEMO_VER = 1;
  if (store._itemSetDemoVer !== ITEMSET_DEMO_VER) { if(!window.PC_REAL_PROMOS) ensureDemoItemSet(store); store._itemSetDemoVer = ITEMSET_DEMO_VER; persist(); }
  // Bill Discount Confirmed (จากไฟล์ Backoffice) → inject เป็นงาน COMPLETE/CONFIRMED ขึ้นทั้ง MKT + OP (idempotent ตาม code)
  var BILLDISC_SEED_VER = 4;
  if (store._billDiscVer !== BILLDISC_SEED_VER) { seedBillDiscountConfirmed(store); backfillBillDiscountData(store); backfillCouponVoucherData(store); store._billDiscVer = BILLDISC_SEED_VER; persist(); }
  // Pro July 2026 (47 POS buttons จากไฟล์ Pro July 2026-546632a4.xlsx · data/pro-july-2026.js) → inject เข้า months (idempotent ตาม campaign+shortName+itemCode) · working rebuild อัตโนมัติ
  var PROJULY_SEED_VER = 2;   // v2: replace-reconcile จากไฟล์ Pro July 2026-0c4c7901.xlsx (shortName+code ทุกแถว · ลบของเดิม 16 แคมเปญแล้ว inject ใหม่)
  if (store._proJulyVer !== PROJULY_SEED_VER) { seedProJuly2026(store); store._proJulyVer = PROJULY_SEED_VER; persist(); }
  // Voucher & Item Coupon Confirmed (Backoffice/CMPOS) → inject months (idempotent ตาม codePromotion) · itemCode ยังไม่ map
  var VOUCHERCOUPON_SEED_VER = 2;
  if (store._vcCouponVer !== VOUCHERCOUPON_SEED_VER) { seedVoucherCouponConfirmed(store); store._vcCouponVer = VOUCHERCOUPON_SEED_VER; persist(); }
  // Co-Promotion (เรียกเก็บพาร์ทเนอร์: Co-Promotion + E-Voucher) — import ข้อมูลจริงจากไฟล์ (data/co-promotions-seed.js)
  // → pc_co_promotions · merge-by-code: แทนที่/เพิ่มตามโค้ด (ลบเคสตัวอย่างที่โค้ดซ้ำ) · คงงานที่ MKT กรอกเองไว้
  try {
    var _coSeed = window.PC_COPROMO_SEED;
    if (_coSeed && Array.isArray(_coSeed.records)) {
      var _coVer = 0; try { _coVer = +localStorage.getItem("pc_copromo_seed_ver") || 0; } catch (e) {}
      if (_coVer < (_coSeed.ver || 1)) {
        var _existing = []; try { _existing = JSON.parse(localStorage.getItem("pc_co_promotions") || "[]") || []; } catch (e) {}
        var _seedCodes = {}; _coSeed.records.forEach(function (r) { var c = String(r.codePromotion || "").trim().toUpperCase(); if (c) _seedCodes[c] = 1; });
        var _kept = _existing.filter(function (x) { var c = String(x.codePromotion || "").trim().toUpperCase(); return !(c && _seedCodes[c]); });
        localStorage.setItem("pc_co_promotions", JSON.stringify(_coSeed.records.concat(_kept)));
        localStorage.setItem("pc_copromo_seed_ver", String(_coSeed.ver || 1));
      }
    }
  } catch (e) {}
  // ⭐ Pop-up 1981 Soul & Sold — อัปเดต/สร้าง Co-Promo คูปอง The Mall (VC0287-0292) ตามไฟล์ Copro update
  //   idempotent: แก้เฉพาะเมื่อข้อมูลยังไม่ตรง · เรียกซ้ำได้ (cloud-store เรียกอีกครั้งหลัง pull เพื่อ push ขึ้น cloud)
  window.PC_applyCoPromoFixes = function () {
    try {
      var CAMP = "Pop-up 1981 Soul & Sold";
      var DT_G = "ลูกค้าซื้อสินค้าใน Gourmet market ครบ 400 บาท / ใบเสร็จ นำไปแลกคูปองส่วนลดรวม 100 บาท ( มี 3 ใบ  ส่วนลด 50 บาท / ส่วนลด 30 บาท และส่วนลด 20 บาท) เพื่อใช้ใน Gourmet eats\n\n- จำกัดสิทธิ์ 300 สิทธิ์แรก / วัน รวมทั้งหมด 2,700 สิทธิ์ตลอดรายการ\n- 1 สิทธิ์ / หมายเลข M card / เดือน\n- เงื่อนไขการใช้ 1 สิทธิ์ / ใบเสร็จ\n- คูปองหมดอายุวันที่ 31 กรกฎาคม 2569 / 31 สิงหาคม 2569 / 30 กันยายน 2569";
      var DT_M = "ลูกค้ากดใช้ 1 คะแนน เพื่อแลกเป็นคูปองส่วนลดรวม 100 บาท ( มี 3 ใบ  ส่วนลด 50 บาท / ส่วนลด 30 บาท และส่วนลด 20 บาท) ผ่าน แอป M CARD Application\n\n- จำกัดสิทธิ์\nกรกฎาคม : 500 สิทธิ์แรก / วัน รวม 1,500 สิทธิ์\nสิงหาคม : รวม 300 สิทธิ์\nกันยายน : รวม 300 สิทธิ์\n- เงื่อนไขการใช้ 1 สิทธิ์ / ใบเสร็จ\n- คูปองหมดอายุทุกวันที่ 8 ของเดือน";
      var POP = [
        { code: "VC0289", name: "Gourmet market คูปองส่วนลด 50 บาท", inc: 50, exc: 46.728971962616818, period: "15 - 17 Jul 26", start: "2026-07-15", end: "2026-07-17", g: 1 },
        { code: "VC0288", name: "Gourmet market คูปองส่วนลด 30 บาท", inc: 30, exc: 28.037383177570092, period: "15 - 17 Jul 26", start: "2026-07-15", end: "2026-07-17", g: 1 },
        { code: "VC0287", name: "Gourmet market คูปองส่วนลด 20 บาท", inc: 20, exc: 18.691588785046729, period: "15 - 17 Jul 26", start: "2026-07-15", end: "2026-07-17", g: 1 },
        { code: "VC0290", name: "Mcard1 คะแนน คูปองส่วนลด 50 บาท", inc: 50, exc: 46.728971962616818, period: "2 - 4 Jul 26", start: "2026-07-02", end: "2026-07-04", g: 0 },
        { code: "VC0291", name: "Mcard1 คะแนน คูปองส่วนลด 30 บาท", inc: 30, exc: 28.037383177570092, period: "2 - 4 Jul 26", start: "2026-07-02", end: "2026-07-04", g: 0 },
        { code: "VC0292", name: "Mcard1 คะแนน คูปองส่วนลด 20 บาท", inc: 20, exc: 18.691588785046729, period: "2 - 4 Jul 26", start: "2026-07-02", end: "2026-07-04", g: 0 }
      ];
      var list = []; try { list = JSON.parse(localStorage.getItem("pc_co_promotions") || "[]") || []; } catch (e) {}
      var changed = false;
      POP.forEach(function (r) {
        var data = {
          campaign: CAMP, type: "คูปองใช้แทนเงินสด", source: "co",
          codePromotion: r.code, codeItemSet: "",
          cmposName: r.name, buttonName: r.name,
          brand: "The Mall", billingEntity: "The Mall Group Co.,Ltd",
          detail: (r.g ? DT_G : DT_M),
          periodText: r.period, start: r.start, end: r.end,
          paymentType: "Pay per use", soNo: "", quota: "",
          priceIncVat: r.inc, priceExcVat: r.exc,
          paymentCondition: "", remark: "", note: "",
          promoType: "Voucher",
          interfaceSetup: 1, salesInterface: 1, status: "INTERFACED", interfaceBy: "(import จากไฟล์)"
        };
        var rec = list.find(function (x) { return String(x.codePromotion || "").trim().toUpperCase() === r.code; });
        if (rec) {
          var need = rec.campaign !== CAMP || rec.cmposName !== r.name || String(rec.priceIncVat) !== String(r.inc) || rec.interfaceSetup !== 1 || rec.status !== "INTERFACED";
          if (need) { Object.assign(rec, data); changed = true; }
        } else {
          data.id = "COPOP" + r.code; data.createdBy = "MKT (import)"; data.createdAt = new Date().toISOString();
          list.unshift(data); changed = true;
        }
      });
      // เพิ่ม E-Voucher ที่ยังขาด (add-if-missing · ไม่ทับเรคคอร์ดที่มีอยู่)
      try {
        var EVOU = window.PC_EVOUCHER_COPRO || [];
        var _have = {}; list.forEach(function (x) { var c = String(x.codePromotion || "").trim().toUpperCase(); if (c) _have[c] = 1; });
        EVOU.forEach(function (v) {
          var code = String(v.code || "").trim(); if (!code || _have[code.toUpperCase()]) return;
          var nm = (/^\d+$/.test(v.name) ? code : v.name) || code;
          list.unshift({
            id: "COEV" + code, campaign: nm, type: v.type || "E-Voucher", source: "co",
            codePromotion: code, codeItemSet: "",
            cmposName: nm, buttonName: nm,
            brand: v.brand || "", billingEntity: "",
            detail: v.name || nm, periodText: (v.start ? (v.start + (v.end ? " → " + v.end : "")) : (v.life || "")),
            start: v.start || "", end: v.end || "",
            paymentType: "Pay per use", soNo: "", quota: "",
            priceIncVat: (v.inc === "" ? "" : v.inc), priceExcVat: (v.exc === "" ? "" : v.exc),
            paymentCondition: "", remark: v.remark || "", note: v.life || "",
            promoType: "E-Voucher",
            interfaceSetup: 1, salesInterface: 1, status: "INTERFACED", interfaceBy: "(import จากไฟล์)",
            createdBy: "MKT (import)", createdAt: new Date().toISOString()
          });
          _have[code.toUpperCase()] = 1; changed = true;
        });
      } catch (e) {}
      // LINEGIFT e-Voucher → Brand = LINE (idempotent)
      list.forEach(function (r) {
        if (/LINEGIFT/i.test(String(r.type || '')) && String(r.brand || '') !== 'LINE') { r.brand = 'LINE'; changed = true; }
      });
      // โปรหมดเขต (end < วันนี้) → ถือว่า Interface แล้วอัตโนมัติ (ออกจากคิว IT)
      var _cpToday = new Date().toISOString().slice(0, 10);
      list.forEach(function (r) {
        var en = String(r.end || '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(en) && en < _cpToday && !r.interfaceSetup) {
          r.interfaceSetup = 1; r.salesInterface = 1; r.status = 'INTERFACED';
          if (!r.interfaceBy) r.interfaceBy = '(หมดเขต — auto)';
          changed = true;
        }
      });
      if (changed) localStorage.setItem("pc_co_promotions", JSON.stringify(list));
      return changed;
    } catch (e) { return false; }
  };
  try { window.PC_applyCoPromoFixes(); } catch (e) {}
  // Non-destructive: full showcase grid (all promo types × all stages) for walking through every page
  var SHOWCASE_VER = 1;
  if (store._showcaseVer !== SHOWCASE_VER) { if(!window.PC_REAL_PROMOS) ensureShowcase(store); store._showcaseVer = SHOWCASE_VER; persist(); }
  // ทะเบียนเครื่อง Asset register — seeded from MA_Hardware_Listing 2026 (data/asset-seed.js).
  // Multi-device-per-branch (POS + thermal printers under MA). seed-once: คงการแก้ไข (Stock In/Out/dispatch) ไว้ — refresh seed = bump STORE_KEY.
  var ASSET_SEED_VER = 1;
  if (!Array.isArray(store.assets) || (!store._assetSeeded && !store._assetSeedVer)) {
    store.assets = (window.PC_ASSET_SEED || []).map(a => Object.assign({}, a));
    store._assetSeeded = true; store._assetSeedVer = ASSET_SEED_VER; persist();
  }
  // Plan 2026 — IT's own editable device-deployment worklist (seeded from data/plan-2026.js).
  var PLAN_SEED_VER = 1;
  if (!Array.isArray(store.plan2026) || (!store._planSeeded && !store._planSeedVer)) {
    store.plan2026 = (window.PC_PLAN_2026 || []).map(p => Object.assign({}, p));
    store._planSeeded = true; store._planSeedVer = PLAN_SEED_VER; persist();
  }

  // one-time backfill: NPD ที่ IT ปิดงานไปแล้วก่อนมี recipeCustom → เขียนสูตร RM รายสินค้าย้อนหลัง (แยกช่องทาง)
  if (store._recipeCustomVer !== 1) {
    store.recipeCustom = store.recipeCustom || {};
    (store.npd || []).forEach(function (n) {
      if (String(n.itStatus || "").toUpperCase() !== "COMPLETE" || !Array.isArray(n.items)) return;
      n.items.forEach(function (it) { var c = String(it.code || "").trim(); if (c) npdSaveRecipe(it, c, n.id); });
    });
    store._recipeCustomVer = 1; persist();
  }

  function cleanupOldStores() {
    try {
      const rm = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^pc_mock_store_v\d+$/.test(k) && k !== STORE_KEY) rm.push(k);
      }
      rm.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      return rm.length;
    } catch (e) { return 0; }
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        cleanupOldStores();
        /* `working` เป็น view ที่สร้างกลับจาก months ได้ทุกครั้ง แต่เคยถูกเก็บซ้ำ
           ใน localStorage จนพื้นที่ Chrome เต็ม. แปลงข้อมูลเดิมให้เล็กลงทันทีตอนเปิด
           โดยไม่กระทบ object ที่ใช้งานในหน่วยความจำ. */
        if (parsed && Object.prototype.hasOwnProperty.call(parsed, "working")) {
          try { localStorage.setItem(STORE_KEY, compactStoreString(parsed)); } catch (e) {}
        }
        return parsed;
      }
    } catch (e) {}
    // v28 ยังไม่มี → ย้ายข้อมูลจาก snapshot เวอร์ชันล่าสุดที่มีอยู่ (กันข้อมูลที่ผู้ใช้ทำไว้หาย)
    let migrated = null;
    try {
      const verKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const m = k && k.match(/^pc_mock_store_v(\d+)$/);
        if (m && k !== STORE_KEY) verKeys.push([parseInt(m[1], 10), k]);
      }
      verKeys.sort(function (a, b) { return b[0] - a[0]; });
      for (let j = 0; j < verKeys.length; j++) {
        try { const r = localStorage.getItem(verKeys[j][1]); if (r) { const p = JSON.parse(r); if (p && p.months) { migrated = p; break; } } } catch (e) {}
      }
    } catch (e) {}
    cleanupOldStores();           // ลบเวอร์ชันเก่าทั้งหมด คืนพื้นที่
    if (migrated && migrated.months) { persist(migrated); return migrated; }
    const s = { working: [], months: {} };
    seedDemo(s);
    persist(s);
    return s;
  }
  /* FX-P67 — เดิมกลืน error ตอนเขียนไม่ลง (พื้นที่เต็ม QuotaExceededError)
     → ฟอร์มขึ้น "บันทึกสำเร็จ" ทั้งที่งานหาย และตัวซิงค์ดึงข้อมูลใหม่ลงไม่ได้
     ตอนนี้: คืนพื้นที่จากคีย์ที่เลิกใช้ + snapshot เก่า → ลองเขียนอีกครั้ง → ยังไม่ได้ = คืน false */
  var DEAD_KEYS = ['pc_key_edit_v1', 'pc_camp_edit_v1'];
  function freeSpace() {
    var freed = 0;
    DEAD_KEYS.forEach(function (k) {
      try { var n = (localStorage.getItem(k) || '').length; if (n > 2) { localStorage.setItem(k, '{}'); freed += n; } } catch (e) {}
    });
    try { cleanupOldStores(); } catch (e) {}
    return freed;
  }
  /* `working` เป็นข้อมูล derived จาก `months` (rebuildWorking) จึงไม่ต้องเก็บลง disk
     การตัดออกลดขนาด backup/localStorage ราว 20%+ และสร้างกลับทันทีทุกครั้งที่เปิดระบบ. */
  function compactStoreString(s) {
    const disk = Object.assign({}, s || {});
    delete disk.working;
    return JSON.stringify(disk);
  }
  function persist(s) {
    s = s || store;
    try { rebuildWorking(s); } catch (e) {}
    var json; try { json = compactStoreString(s); } catch (e) { return false; }
    try { localStorage.setItem(STORE_KEY, json); window.__PC_PERSIST_FAIL = null; return true; } catch (e) {
      freeSpace();
      try { localStorage.setItem(STORE_KEY, json); window.__PC_PERSIST_FAIL = null; return true; } catch (e2) {
        window.__PC_PERSIST_FAIL = { at: new Date().toISOString(), error: String((e2 && e2.name) || e2), bytes: json.length };
        return false;
      }
    }
  }
  /* \u0e2a\u0e16\u0e32\u0e19\u0e30\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e40\u0e01\u0e47\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25 (\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e1a\u0e19 window \u2014 \u0e2b\u0e49\u0e32\u0e21\u0e41\u0e15\u0e30 API \u0e17\u0e35\u0e48\u0e19\u0e35\u0e48 \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28) */
  window.PC_STORAGE = function () {
    var used = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); used += (localStorage.getItem(k) || '').length + k.length; } } catch (e) {}
    return { usedKB: Math.round(used / 1024), lastFail: window.__PC_PERSIST_FAIL || null };
  };

  /* Single source of truth = s.months (item-grain, partitioned by month for the
   * month filter). The legacy IT_WORKING_SHEET (button-grain) is now a DERIVED
   * view rebuilt from months on every persist — no separate stored table, no
   * double-write. Consumers that read store.working keep working unchanged. */
  function rebuildWorking(s) {
    s = s || store;
    // FX-P57: ชื่อแคมเปญที่มีช่องว่าง/แท็บนำหน้า-ต่อท้าย ทำให้การเทียบชื่อแบบตรงตัวไม่โดนแถว → ตัดหัวท้ายทุกครั้งที่ persist
    Object.keys(s.months || {}).forEach(function (mk) {
      (s.months[mk] || []).forEach(function (r) {
        if (typeof r.campaign !== "string") return;
        var t = r.campaign.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, "");
        if (t !== r.campaign) r.campaign = t;
      });
    });
    const groups = {}, order = [];
    Object.keys(s.months || {}).forEach(function (month) {
      (s.months[month] || []).forEach(function (r) {
        if (!r.campaign) return;
        const key = r.campaign + "||" + month + "||" + r.shortName;
        if (!groups[key]) { groups[key] = { month: month, rows: [] }; order.push(key); }
        groups[key].rows.push(r);
      });
    });
    s.working = order.map(function (key) {
      const g = groups[key], rows = g.rows, f = rows[0];
      const total = rows.reduce(function (a, it) { return a + (parseFloat(it.gross) || 0) * (parseFloat(it.qty) || 1); }, 0);
      const discIsText = typeof f.discount === "string" && /[%\u0e3f]/.test(f.discount);
      return {
        timestamp: f.timestamp || f.submittedDate || "", month: g.month, campaign: f.campaign,
        promoType: f.promoType || f.typePromotion || "", start: f.start, end: f.end,
        stores: f.stores, saleMode: f.saleMode, itStatus: f.itStatus, opStatus: f.opStatus,
        codePromotion: f.codePromotion || "", codeItemSet: f.codeItemSet || f.itemPromotion || "",
        kitchen: f.kitchen || "", shortName: f.shortName, itemCode: "", itemNameEN: "", qty: "",
        gross: discIsText ? "" : total.toFixed(2), discount: discIsText ? f.discount : "", netPrice: "",
        detail: f.detail, mechanic: f.mechanic, attachment: f.attachment || "",
        updatedBy: f.updatedBy || "", updatedDate: f.updatedDate || "", cancelReason: f.cancelReason || "",
        cateRemark: f.cateRemark || "", minAmount: f.minAmount || 0, memoUrl: f.memoUrl || "",
        changeStatus: f.changeStatus || "", reason: f.reason || "", submittedDate: f.submittedDate || "",
        itDoneDate: f.itDoneDate || "", opDoneDate: f.opDoneDate || "", posReady: !!f.posReady,
        /* FX-P45 — สถานะที่ต้องรอดจากการ rebuild (เดิมหาย → หน้าสาขา/ยกเลิกอ่านค่าผิด) */
        wentLive: !!f.wentLive, cancelHandled: !!f.cancelHandled, cancelAction: f.cancelAction || "",
        cancelHandledDate: f.cancelHandledDate || "", removedFromPos: !!f.removedFromPos,
        codeBurned: !!f.codeBurned, codesReturned: f.codesReturned || [], itRemark: f.itRemark || "",
        discountText: f.discountText || "", condition: f.condition || "",
        rejectReason: f.rejectReason || "", rejectCount: f.rejectCount || 0,
        extendCodeNote: f.extendCodeNote || "",
        proposalKind: f.proposalKind || "",
        branchNote: f.branchNote || "",
        _wasItemSet: f._wasItemSet || false,
        typeSel: f.typeSel || "",
        customerGroup: f.customerGroup || "", crmTarget: f.crmTarget || "", crmTargetName: f.crmTargetName || "",
      };
    });
  }
  // expose a reset so we can wipe demo state if needed
  window.PC_resetMock = function () { localStorage.removeItem(STORE_KEY); store = loadStore(); };
  // clear ALL promotions/NPD but keep users + permissions — for fresh testing
  window.PC_clearPromos = function () {
    store.working = []; store.months = {}; store.npd = []; store.flavor = [];
    store.rejectIssues = {};
    persist();
    return "cleared";
  };
  // normalize all promos back to a fresh testable state (clears cancel/reject/change markers)
  window.PC_normalizePromos = function () {
    const fix = (r) => { r.itStatus = "PENDING"; r.opStatus = "WAITING"; r.changeStatus = ""; r.rejectReason = ""; r.cancelReason = ""; r.reason = ""; r.itDoneDate = ""; r.opDoneDate = ""; r.rejectCount = 0; };
    (store.working || []).forEach(fix);
    Object.keys(store.months || {}).forEach(m => store.months[m].forEach(fix));
    store.rejectIssues = {};
    persist();
    return "normalized " + (store.working || []).length + " buttons";
  };

  /* ---------- helpers (function declarations so they hoist above seedDemo) ---------- */
  function NOW() { return new Date().toISOString(); }
  /* FX-P47 — วันที่แบบ YYYY-MM-DD ต้องเป็นวันที่ "ตามเครื่อง" ไม่ใช่ UTC
     (เดิมใช้ NOW().slice(0,10) → ช่วง 00:00–07:00 น. ไทย ได้วันที่ย้อนหลัง 1 วัน) */
  function TODAY() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function currentUser() { try { return localStorage.getItem("pc_userName") || localStorage.getItem("pc_role") || ""; } catch (e) { return ""; } }
  // ติดหน่วยส่วนลด/มูลค่า: CUR→฿ · PCT→% (เก็บเป็น text ติดหน่วย — ระบบ/IT/MKT รู้ว่า ฿ หรือ %)
  function fmtUnit(v, unit) { const n = Number(v) || 0; return n + (unit === "PCT" ? "%" : "฿"); }
  // mock email — logs to store.emails + console (test recipient: it@rocks-foods.com)
  function sendMail(to, subject, body) {
    if (!store.emails) store.emails = [];
    store.emails.push({ to: to || "it@rocks-foods.com", subject, body, sentAt: NOW() });
    console.log("[mock-mail] →", to, "|", subject);
  }
  window.PC_getEmails = function () { return (store && store.emails) || []; };

  /* ===========================================================================
   * CONCURRENCY + UNIQUENESS LAYER  (Web Standards §4 / §9 — MUST items)
   *  - rev()        : monotonic revision stamp for optimistic locking
   *  - RM master    : central, deduped table; new codes harvested from forms
   *  - conflict()   : standard 409-style response the UI can detect
   * ========================================================================== */
  let _revCounter = (store && store._revSeq) || 0;
  function rev() { _revCounter += 1; if (store) store._revSeq = _revCounter; return _revCounter; }
  function stampVersion(rec) { rec.version = rev(); rec.updatedAt = NOW(); return rec; }
  function conflict(msg) { return { status: "conflict", code: 409, message: msg || "ข้อมูลถูกแก้ไขโดยผู้ใช้อื่นแล้ว กรุณาโหลดใหม่อีกครั้ง" }; }
  function dupError(msg) { return { status: "duplicate", code: 409, message: msg }; }

  /* ---- central RM master (rm_code unique) ---- */
  const RM_SEED = [
    { code: "3060", desc: "ข้อไก่ทอด", unit: "G" },
    { code: "3070", desc: "เนื้อเป็ด", unit: "G" },
    { code: "3095", desc: "ผงปรุงรส Sour Cream 500G", unit: "g" },
    { code: "3097", desc: "ผงปรุงรส Cheese 500G", unit: "g" },
    { code: "3110", desc: "ผงปรุงรส ทรัฟเฟิล 500G", unit: "g" },
    { code: "3116", desc: "เฟรนช์ฟรายส์ Kaida", unit: "g" },
    { code: "4001", desc: "ถ้วย Large", unit: "pcs" },
    { code: "4002", desc: "ถุง Mega", unit: "pcs" },
  ];
  function rmMaster() {
    if (!store.rmMaster) {
      const seed = (typeof window !== "undefined" && window.PC_RM_MASTER && window.PC_RM_MASTER.length)
        ? window.PC_RM_MASTER.map(r => ({ code: r.code, desc: r.desc, unit: r.unit || "g" }))
        : RM_SEED.map(r => Object.assign({}, r));
      store.rmMaster = seed; persist();
    }
    return store.rmMaster;
  }
  function normCode(c) { return String(c == null ? "" : c).trim(); }
  function findRm(code) { const c = normCode(code).toLowerCase(); return rmMaster().find(r => normCode(r.code).toLowerCase() === c) || null; }

  // INTERNAL: harvest any RM codes found in a NPD payload into rm_master (new ones only)
  function harvestRm(payload) {
    const added = [];
    const take = (code, desc, unit) => {
      code = normCode(code); if (!code) return;
      if (findRm(code)) return;                 // already known → skip (no duplicate)
      const d = normCode(desc); if (!d) return; // กัน RM ที่ไม่มี description → ไม่ harvest (กันแถวว่างใน RM Master)
      rmMaster().push(stampVersion({ code, desc: d, unit: normCode(unit) || "g" }));
      added.push(code);
    };
    (payload && payload.subsets || []).forEach(ss => (ss.powders || []).forEach(p => take(p.code, p.desc, p.unit)));
    (payload && payload.items || []).forEach(it => (it.recipes || []).forEach(r => take(r.code, r.desc, r.unit)));
    return added;
  }
  // INTERNAL: subset names within a payload + across existing NPD must be unique
  function dupSubsetName(payload) {
    const names = (payload && payload.subsets || []).map(s => normCode(s.name).toLowerCase()).filter(Boolean);
    const seen = {};
    for (const n of names) { if (seen[n]) return n; seen[n] = 1; }   // dup inside this form
    return null;
  }
  window.PC_getRmMaster = () => rmMaster().filter(r => normCode(r.code) && normCode(r.desc));

  /* ---- SHOULD: idempotency — same submit key returns the original result, no dup ---- */
  function idemRemember(key, result) {
    if (!key) return result;
    if (!store._idem) store._idem = {};
    store._idem[key] = { id: result.id, at: NOW() };
    persist();
    return result;
  }
  function idemSeen(key) {
    if (!key || !store._idem) return null;
    return store._idem[key] || null;
  }

  /* ---- SHOULD: soft-lock — show "being edited by …" so people don't collide head-on ---- */
  const LOCK_TTL = 2 * 60 * 1000; // 2 min — auto-expires so a closed tab never blocks forever
  function lockActive(l) { return l && (Date.now() - new Date(l.at).getTime()) < LOCK_TTL; }
  function _acquireLock(recId, user) {
    if (!store._locks) store._locks = {};
    const cur = store._locks[recId];
    if (lockActive(cur) && cur.user !== user) return { status: "locked", by: cur.user, message: "กำลังถูกแก้ไขโดย " + cur.user };
    store._locks[recId] = { user: user || "?", at: NOW() }; persist();
    return { status: "success" };
  }
  function _releaseLock(recId, user) {
    if (store._locks && store._locks[recId] && (store._locks[recId].user === user || !user)) { delete store._locks[recId]; persist(); }
    return { status: "success" };
  }
  function _getLock(recId) {
    const l = store._locks && store._locks[recId];
    return lockActive(l) ? { locked: true, by: l.user } : { locked: false };
  }
  function fmtDate(v) {
    // delegate to the central formatter when present (Web Standards §10); fall back to local logic
    if (window.PCfmt && typeof window.PCfmt.date === "function") { return v ? window.PCfmt.date(v) : "-"; }
    if (!v) return "-";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const [y, m, d] = v.slice(0, 10).split("-");
      return `${d}/${m}/${y}`;
    }
    return String(v);
  }
  const branchMap = (() => {
    const m = {};
    SEED.branches.forEach(b => { m[b.id] = { en: b.name, th: b.nameTH }; });
    return m;
  })();
  function branchIdsForToken(tok) {
    tok = String(tok || "").trim(); if (!tok) return [];
    if (tok.toUpperCase() === "ALL") return SEED.branches.map(b => b.id);
    if (/^G:/i.test(tok)) { const g = tok.slice(2); return SEED.branches.filter(b => String(b.group) === g).map(b => b.id); }
    if (/^C:/i.test(tok)) { const c = tok.slice(2); return SEED.branches.filter(b => String(b.class) === c).map(b => b.id); }
    if (/^T:/i.test(tok)) { const t = tok.slice(2); return SEED.branches.filter(b => String(b.type) === t).map(b => b.id); }
    return [tok];
  }
  // null = "ทุกสาขา (dynamic)"; otherwise array of concrete branch ids resolved vs CURRENT master
  function expandStoreIds(storeStr) {
    const s = String(storeStr || "").trim();
    if (s === "" || /(^|,)\s*ALL\s*(,|$)/i.test(s)) return null;
    const set = {}; s.split(",").forEach(tok => branchIdsForToken(tok).forEach(id => { set[id] = 1; }));
    return Object.keys(set);
  }
  function resolveStores(storeStr) {
    const s = String(storeStr || "").trim();
    if (s === "" || /(^|,)\s*ALL\s*(,|$)/i.test(s)) return [{ id: "ALL", nameEn: "All Stores", nameTh: "ทุกสาขา" }];
    return (expandStoreIds(storeStr) || []).map(id => {
      const info = branchMap[id] || { en: "Unknown", th: "ไม่พบข้อมูล" };
      return { id, nameEn: info.en, nameTh: info.th };
    });
  }

  /* ===========================================================================
   * SEED DEMO CAMPAIGNS  (so Dashboard / Tracking / IT have content on load)
   * ========================================================================== */
  function loadRealPromos(s) {
    s.working = []; s.months = {};
    (window.PC_REAL_PROMOS || []).forEach(function (cfg) { addButtonGroup(s, cfg); });
    // LIVE price promotions (Price Promotion sheet × item master) — already through workflow,
    // injected as COMPLETE/CONFIRMED month rows so they show on Branch View + MKT/OP tracking.
    (window.PC_PRICE_PROMOS_LIVE || []).forEach(function (cfg) { addButtonGroup(s, cfg); });
    // Item coupon / Voucher / Bill Discount (online codes) จาก data/code-promos.js
    (window.PC_CODE_PROMOS || []).forEach(function (cfg) { addButtonGroup(s, cfg); });
  }
  function seedDemo(s) {
    // ถ้ามีไฟล์โปรจริง (data/real-promos.js) — แม้เป็น array ว่าง ก็ใช้โหมดจริง (สละเตว่าง ไม่มี demo)
    if (window.PC_REAL_PROMOS) { loadRealPromos(s); return; }
    const month = "2026-06";

    // Real store list (173 stores) exactly as in the Excel "Promotion 2026-06" sheet
    const AMAZE_STORES = "PC1001, PC1002, PC1003, PC1004, PC1005, PC1006, PC1007, PC1008, PC1009, PC1010, PC1011, PC1012, PC1013, PC1014, PC1015, PC1016, PC1018, PC1019, PC1022, PC1023, PC1024, PC1025, PC1027, PC1028, PC1029, PC1033, PC1034, PC1035, PC1036, PC1037, PC1038, PC1039, PC1040, PC1042, PC1043, PC1045, PC1046, PC1047, PC1050, PC1051, PC1054, PC1055, PC1056, PC1057, PC1058, PC1059, PC1060, PC1061, PC1062, PC1063, PC1064, PC1065, PC1066, PC1067, PC1068, PC1069, PC1071, PC1072, PC1073, PC1074, PC1075, PC1076, PC1077, PC1078, PC1079, PC1080, PC1081, PC1082, PC1083, PC1084, PC1085, PC1086, PC1087, PC1089, PC1090, PC1091, PC1092, PC1093, PC1094, PC1095, PC1096, PC1097, PC1098, PC1099, PC1101, PC1102, PC1103, PC1104, PC1105, PC1106, PC1107, PC2002, PC2004, PC2010, PC2012, PC2014, PC2015, PC2016, PC2018, PC2019, PC2020, PC2022, PC2023, PC2024, PC2025, PC2026, PC2027, PC2028, PC2029, PC2030, PC2031, PC3001, PC3005, PC3010, PC3011, PC3012, PC3013, PC3014, PC3015, PC5002, PC5004, PC6001, PC6002, PC6003, PC6004, PC6005, PC6006, PC6007, PC6008, PC6009, PC6010, PC6011, PC6012, PC6013, PC6014, PC6015, PC6016, PC6017, PC6018, PC6019, PC6020, PC6021, PC6022, PC6023, PC6024, PC6025, PC6026, PC6027, PC6028, PC6029, PC6030, PC6031, PC6032, PC6033, PC6034, PCFT01, PCOT02, PCSE01, PCSE02, PCSE03, PCSE04, PCSE05, PCSE06, PCSE07, PCSE08";
    const AMAZE_DETAIL = "- ลูกค้ารับฟรี Upsize Jumbo Fries to Mega Fries\nQuota : 10,000 QTY\n- ลูกค้ารับฟรี Jumbo Fries or Large Chicken Pop\nQuota : 2,501 QTY";
    const AMAZE_MECH = "- เลือกทรัฟเฟิลบวกเพิ่ม 10 บาทต่อถ้วย";

    /* === 1) AMAZE x Potato Corner — REAL DATA (Coupon Online, PENDING) =========
       Two real POS buttons exactly as submitted by MKT, awaiting IT settlement. */
    addButtonGroup(s, {
      month, campaign: "Amaze x Potato Corner", promoType: "Coupon Online",
      typePromotion: "Coupon", codePromotion: "Online",
      start: "2026-06-15", end: "2026-10-15", stores: AMAZE_STORES,
      saleMode: "Take Away", itStatus: "PENDING", opStatus: "WAITING",
      kitchen: "", shortName: "AMAZE อัพไซซ์ JFF TO MFF",
      submittedDate: "2026-06-07", itDoneDate: "", opDoneDate: "",
      detail: AMAZE_DETAIL, mechanic: AMAZE_MECH,
      attachment: "https://docs.google.com/spreadsheets/d/17IMqXDh3_T_pL1iSKz9HIXexhgrjHeOz/edit?usp=drivesdk",
      items: [
        { catCode: "101", itemCode: "101003", itemNameEN: "MEGA FRIES", qty: 1, gross: 89, discount: 20, netPrice: 69 },
      ],
    });
    addButtonGroup(s, {
      month, campaign: "Amaze x Potato Corner", promoType: "Coupon Online",
      typePromotion: "Coupon", codePromotion: "Online",
      start: "2026-06-15", end: "2026-10-15", stores: AMAZE_STORES,
      saleMode: "Take Away", itStatus: "PENDING", opStatus: "WAITING",
      kitchen: "", shortName: "AMAZE รับฟรี JFF OR LCK",
      submittedDate: "2026-06-07", itDoneDate: "", opDoneDate: "",
      detail: AMAZE_DETAIL, mechanic: AMAZE_MECH,
      attachment: "https://docs.google.com/spreadsheets/d/1OVt1e3fHvtLozuzzLQM8QCTxmYcR-JFn/edit?usp=drivesdk",
      items: [
        { catCode: "101", itemCode: "101002", itemNameEN: "JUMBO FRIES", qty: 1, gross: 69, discount: 69, netPrice: 0 },
        { catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 1, gross: 69, discount: 69, netPrice: 0 },
      ],
    });

    /* === 2) Super Fries Set — Item Set (COMPLETE + CONFIRMED) ==================
       Fully through the pipeline, so Branch View / Memo have a live promotion. */
    addButtonGroup(s, {
      month, campaign: "Super Fries Set [149]", promoType: "Item Set",
      typePromotion: "Item Set", codePromotion: "", codeItemSet: "1070001",
      start: "2026-06-01", end: "2026-06-30", stores: AMAZE_STORES,
      saleMode: "Take Away", itStatus: "COMPLETE", opStatus: "CONFIRMED",
      kitchen: "SUPER FRIES SET", shortName: "SuperFriesSet[149]",
      itemPromotion: "1070001", cateRemark: "Fries",
      submittedDate: "2026-05-25", itDoneDate: "2026-05-28", opDoneDate: "2026-05-30",
      detail: "เซ็ตสุดคุ้ม Mega Fries + Large Super Chicken Pop ราคาพิเศษ 149 บาท",
      mechanic: "ราคาพิเศษเฉพาะ Take Away · จากปกติ 158 บาท",
      attachment: "",
      items: [
        { catCode: "101", itemCode: "101003", itemNameEN: "MEGA FRIES", qty: 1, gross: 89, discount: 9, netPrice: 149 },
        { catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 1, gross: 69, discount: 0, netPrice: 0 },
      ],
    });

    /* === 3) Delivery Treat — Bill Discount (COMPLETE + CONFIRMED, then EXTENDED)
       Demonstrates a change marker persisting alongside a completed status. */
    addButtonGroup(s, {
      month, campaign: "Delivery Treat 50.-", promoType: "Bill Discount Normal",
      typePromotion: "Bill Discount", codePromotion: "Normal",
      start: "2026-06-05", end: "2026-06-30", stores: "PC1001, PC1002, PC1003, PC1004, PC1005, PC1006, PC1007, PC1008",
      saleMode: "GRAB, LINEMAN", itStatus: "COMPLETE", opStatus: "CONFIRMED", changeStatus: "EXTENDED",
      kitchen: "BILL-50OFF", shortName: "Delivery50off",
      codePromotion: "BILL50", cateRemark: "All",
      submittedDate: "2026-05-30", itDoneDate: "2026-06-02", opDoneDate: "2026-06-03",
      detail: "ลดทันที 50 บาท เมื่อสั่งครบ 300 บาท ผ่าน GRAB / LINEMAN",
      mechanic: "เฉพาะสินค้าราคาปกติ ไม่ร่วมรายการโปรโมชั่นอื่น", minAmount: 300,
      discountText: "50 ฿",
      items: [
        { catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products *เฉพาะสินค้าราคาปกติเท่านั้น", qty: "All", gross: "All", discount: "50 ฿", netPrice: "" },
      ],
    });
    ensureShowcase(s);
  }

  /* ===========================================================================
   * SHOWCASE SEED — one representative campaign per (promo type × workflow stage)
   * so every page can be walked through with all cases visible. Non-destructive:
   * only adds a campaign if its name is not already present.
   * Stages covered: PENDING (รอ IT) · POS-READY (IT ทำปุ่มแล้ว) · COMPLETE+รอ OP
   *                  · LIVE (COMPLETE+CONFIRMED) · REJECTED (ตีกลับ) · CANCELLED · EXTENDED
   * ========================================================================== */
  function ensureShowcase(s) {
    const have = new Set((s.working || []).map(w => String(w.campaign || "").trim().toLowerCase()));
    Object.keys(s.months || {}).forEach(m => (s.months[m] || []).forEach(r => have.add(String(r.campaign || "").trim().toLowerCase())));
    const month = "2026-06";
    const ST10 = "PC1001, PC1002, PC1003, PC1004, PC1005, PC1006, PC1007, PC1008, PC1009, PC1010";
    const ST5  = "PC1001, PC1002, PC1003, PC1004, PC1005";
    const DLV  = "GRAB, LINEMAN, ShopeeFood";
    const add = (cfg) => {
      if (have.has(String(cfg.campaign).trim().toLowerCase())) return;
      addButtonGroup(s, cfg); have.add(String(cfg.campaign).trim().toLowerCase());
    };

    /* ---------- ITEM SET ---------- */
    // POS-READY: IT ทำปุ่ม POS เสร็จแล้ว (มี Code Item Set) แต่ยังไม่ปิดงาน settle
    add({
      month, campaign: "Snack Duo Set [99]", promoType: "Item Set", typePromotion: "Item Set",
      codePromotion: "", codeItemSet: "1070010", itemPromotion: "1070010",
      start: "2026-06-10", end: "2026-06-30", stores: ST10, saleMode: "Take Away",
      itStatus: "PENDING", opStatus: "WAITING", posReady: true, kitchen: "SNACK DUO", shortName: "SnackDuoSet[99]",
      submittedDate: "2026-06-08", cateRemark: "Fries",
      detail: "เซ็ตจิ้นจุใจ Jumbo Fries + Large Chicken Pop ราคา 99 บาท",
      mechanic: "[STAGE] Item Set · IT ทำปุ่ม POS เสร็จ (posReady) รอปิดงาน settle",
      items: [
        { catCode: "101", itemCode: "101002", itemNameEN: "JUMBO FRIES", qty: 1, gross: 69, discount: 39, netPrice: 99 },
        { catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 1, gross: 69, discount: 0, netPrice: 0 },
      ],
    });
    // COMPLETE รอ OP ตรวจ
    add({
      month, campaign: "Family Feast Set [299]", promoType: "Item Set", typePromotion: "Item Set",
      codePromotion: "", codeItemSet: "1070011", itemPromotion: "1070011",
      start: "2026-06-12", end: "2026-07-12", stores: ST10, saleMode: "Take Away",
      itStatus: "COMPLETE", opStatus: "WAITING", kitchen: "FAMILY FEAST", shortName: "FamilyFeast[299]",
      submittedDate: "2026-06-05", itDoneDate: "2026-06-09", cateRemark: "Fries",
      detail: "เซ็ตครอบครัว Mega Fries x2 + Large Chicken Pop x2 ราคา 299 บาท",
      mechanic: "[STAGE] Item Set · IT ปิดงานแล้ว (COMPLETE) รอ OP ตรวจสอบ",
      items: [
        { catCode: "101", itemCode: "101003", itemNameEN: "MEGA FRIES", qty: 2, gross: 89, discount: 67, netPrice: 299 },
        { catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 2, gross: 69, discount: 0, netPrice: 0 },
      ],
    });

    /* ---------- COUPON ---------- */
    // LIVE: COMPLETE + CONFIRMED (ขึ้นระบบ/ติดตามผลแล้ว)
    add({
      month, campaign: "Songkran Splash Coupon", promoType: "Coupon Offline", typePromotion: "Coupon",
      codePromotion: "Offline", start: "2026-06-01", end: "2026-06-20", stores: ST10, saleMode: "Take Away",
      itStatus: "COMPLETE", opStatus: "CONFIRMED", kitchen: "", shortName: "SongkranSplash",
      submittedDate: "2026-05-20", itDoneDate: "2026-05-24", opDoneDate: "2026-05-26",
      attachment: "https://drive.google.com/demo-coupon-songkran",
      detail: "คูปองหน้าร้าน ลด 20 บาท เมื่อซื้อ Mega Fries",
      mechanic: "[STAGE] Coupon · LIVE (COMPLETE + CONFIRMED) ขึ้นระบบ/ติดตามผลแล้ว",
      items: [{ catCode: "101", itemCode: "101003", itemNameEN: "MEGA FRIES", qty: 1, gross: 89, discount: 20, netPrice: 69 }],
    });
    // REJECTED: OP ตีกลับ → กลับไปที่ IT
    add({
      month, campaign: "Member Day Coupon", promoType: "Coupon Online", typePromotion: "Coupon",
      codePromotion: "Online", start: "2026-06-18", end: "2026-06-25", stores: ST5, saleMode: "Take Away",
      itStatus: "PENDING", opStatus: "REJECTED", kitchen: "", shortName: "MemberDay",
      submittedDate: "2026-06-09", itDoneDate: "", opDoneDate: "",
      rejectReason: "[ราคา/ส่วนลด · เงื่อนไข]\nราคา Net ไม่ตรงกับโครงสร้างที่แจ้ง กรุณาตรวจสอบและส่งกลับ",
      rejectCount: 1, attachment: "https://drive.google.com/demo-coupon-memberday",
      detail: "คูปองสมาชิก ลด 30 บาท",
      mechanic: "[STAGE] Coupon · REJECTED — OP ตีกลับ ส่งกลับไปที่ IT แก้ไข",
      items: [{ catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 1, gross: 69, discount: 30, netPrice: 39 }],
    });

    /* ---------- BILL DISCOUNT ---------- */
    // PENDING: รอ IT / รอ OP
    add({
      month, campaign: "Payday Bill 100.-", promoType: "Bill Discount Normal", typePromotion: "Bill Discount",
      codePromotion: "Normal", start: "2026-06-25", end: "2026-06-30", stores: ST10, saleMode: DLV,
      itStatus: "PENDING", opStatus: "WAITING", kitchen: "", shortName: "Payday100off", minAmount: 500,
      submittedDate: "2026-06-11", discountText: "100 ฿", cateRemark: "All",
      detail: "ลดทันที 100 บาท เมื่อสั่งครบ 500 บาท ช่วงเงินเดือนออก",
      mechanic: "[STAGE] Bill Discount · PENDING รอ IT ตั้งค่า",
      items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: "100 ฿", netPrice: "" }],
    });
    // CANCELLED: ยกเลิก (เก็บ record ไว้ติดตาม)
    add({
      month, campaign: "Weekend Bill 15%", promoType: "Bill Discount Normal", typePromotion: "Bill Discount",
      codePromotion: "Normal", start: "2026-06-07", end: "2026-06-08", stores: ST5, saleMode: DLV,
      itStatus: "COMPLETE", opStatus: "CONFIRMED", changeStatus: "CANCELLED", kitchen: "BILL-15PCT", shortName: "Weekend15off",
      submittedDate: "2026-05-30", itDoneDate: "2026-06-02", opDoneDate: "2026-06-03",
      cancelReason: "งบโปรโมชั่นเดือนนี้เต็ม — เลื่อนไปเดือนหน้า", minAmount: 250, discountText: "15 %", cateRemark: "All",
      detail: "ลด 15% ทั้งบิล เมื่อสั่งครบ 250 บาท เฉพาะสุดสัปดาห์",
      mechanic: "[STAGE] Bill Discount · CANCELLED — ยกเลิกแล้ว นำปุ่มออกจาก POS (ข้อมูลยังอยู่)",
      items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: "15 %", netPrice: "" }],
    });

    /* ---------- VOUCHER ---------- */
    // PENDING
    add({
      month, campaign: "Cash Voucher 100.-", promoType: "Voucher Cash", typePromotion: "Voucher",
      codePromotion: "Cash", start: "2026-06-20", end: "2026-07-20", stores: ST10, saleMode: "Take Away",
      itStatus: "PENDING", opStatus: "WAITING", kitchen: "", shortName: "CashVoucher100", minAmount: 0,
      submittedDate: "2026-06-13", discountText: "100 ฿",
      detail: "บัตรเงินสด มูลค่า 100 บาท ใช้แทนเงินสดได้ทุกเมนู",
      mechanic: "[STAGE] Voucher · PENDING รอ IT ตั้งค่า",
      items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: "100 ฿", netPrice: "" }],
    });
    // LIVE
    add({
      month, campaign: "Gift Voucher 200.-", promoType: "Voucher Gift", typePromotion: "Voucher",
      codePromotion: "Gift", start: "2026-06-01", end: "2026-07-31", stores: ST10, saleMode: "Take Away",
      itStatus: "COMPLETE", opStatus: "CONFIRMED", kitchen: "", shortName: "GiftVoucher200", minAmount: 0,
      submittedDate: "2026-05-18", itDoneDate: "2026-05-22", opDoneDate: "2026-05-24",
      attachment: "https://drive.google.com/demo-voucher-gift200", discountText: "200 ฿",
      detail: "บัตรของขวัญ มูลค่า 200 บาท",
      mechanic: "[STAGE] Voucher · LIVE (COMPLETE + CONFIRMED) ขึ้นระบบ/ติดตามผลแล้ว",
      items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: "200 ฿", netPrice: "" }],
    });
    // COMPLETE รอ OP
    add({
      month, campaign: "Welcome Voucher 50.-", promoType: "Voucher Cash", typePromotion: "Voucher",
      codePromotion: "Cash", start: "2026-06-15", end: "2026-07-15", stores: ST5, saleMode: "Take Away",
      itStatus: "COMPLETE", opStatus: "WAITING", kitchen: "", shortName: "WelcomeVoucher50", minAmount: 0,
      submittedDate: "2026-06-06", itDoneDate: "2026-06-10",
      discountText: "50 ฿",
      detail: "บัตรต้อนรับสมาชิกใหม่ มูลค่า 50 บาท",
      mechanic: "[STAGE] Voucher · COMPLETE — IT เสร็จ รอ OP ตรวจสอบ",
      items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: "50 ฿", netPrice: "" }],
    });
  }

  /* Bill Discount Confirmed (data/bill-discount-confirmed.js) → month rows ที่ผ่าน workflow แล้ว
   * (IT COMPLETE · OP CONFIRMED) · idempotent: ข้ามถ้ามี codePromotion เดิมอยู่แล้ว · ขึ้นทั้ง
   * MKT (Campaign Tracking) + OP (Op Tracking) เพราะอ่าน store.months ชุดเดียวกัน */
  /* Pro July 2026 seed → month rows จาก data/pro-july-2026.js (window.PC_PRO_JULY_2026)
     idempotent: ข้ามแถวที่มีอยู่แล้ว (key = campaign|shortName|itemCode|codeItemSet) → ไม่ทับงานที่ user แก้/บันทึกไปแล้ว
     inject เข้า store.months เท่านั้น · store.working ถูก rebuild จาก months โดย persist() อยู่แล้ว
     → เมื่อ IT กดบันทึก (saveSettlementBatch) จะวิ่งครบทุกส่วนเหมือนแถวปกติทุกประการ */
  function seedProJuly2026(s) {
    var data = (typeof window !== "undefined") && window.PC_PRO_JULY_2026;
    if (!data || !data.months) return;
    // แคมเปญที่ไฟล์เป็นเจ้าของ (source of truth) → replace-reconcile: ลบของเดิมทั้งหมดของแคมเปญเหล่านี้ แล้ว inject จากไฟล์
    var nrm = function (x) { return String(x || "").replace(/\s+/g, " ").trim(); };
    var owned = {}; (data.campaigns || []).forEach(function (n) { owned[nrm(n)] = 1; });
    // ถ้าไม่มี data.campaigns (ไฟล์รุ่นเก่า) → owned จาก month rows
    if (!Object.keys(owned).length) { Object.keys(data.months).forEach(function (mk) { (data.months[mk] || []).forEach(function (r) { owned[nrm(r.campaign)] = 1; }); }); }
    // ⭐ content guard (กันลบงานที่ user จัดปุ่มไว้): replace-reconcile จะทำ "ครั้งเดียว" เท่านั้น
    //   ถ้า reconcile แล้ว (แคมเปญ BOGO ซึ่งมีเฉพาะในไฟล์ v2 โผล่ในตารางแล้ว) → ข้ามทั้งหมด ไม่แตะ months
    //   → group/ลบ/เพิ่มปุ่มของ user หลัง reconcile จะไม่ถูกล้างอีก แม้ seed จะถูกเรียกซ้ำ (เครื่องใหม่/cloud reset)
    var reconciled = false;
    Object.keys(s.months || {}).forEach(function (mk) { (s.months[mk] || []).forEach(function (r) { if (nrm(r.campaign) === nrm("Shopee Food - อร่อยสุดฟิน - BOGO")) reconciled = true; }); });
    if (reconciled) return;
    // เก็บสถานะ workflow เดิมไว้ (ตาม shortName) เพื่อไม่ให้ re-import รีเซ็ตงานที่ทำไปแล้ว
    var prevByShort = {};
    Object.keys(s.months).forEach(function (mk) {
      (s.months[mk] || []).forEach(function (r) {
        if (!owned[nrm(r.campaign)]) return;
        var k = nrm(r.shortName); if (!k || prevByShort[k]) return;
        prevByShort[k] = { itStatus: r.itStatus, opStatus: r.opStatus, memoUrl: r.memoUrl, attachment: r.attachment, changeStatus: r.changeStatus, posReady: r.posReady };
      });
    });
    // ลบแถวเดิมของแคมเปญที่ไฟล์เป็นเจ้าของ (ทุกเดือน)
    Object.keys(s.months).forEach(function (mk) {
      s.months[mk] = (s.months[mk] || []).filter(function (r) { return !owned[nrm(r.campaign)]; });
      if (!s.months[mk].length) delete s.months[mk];
    });
    // inject แถวจากไฟล์ (คืนสถานะ workflow เดิมตาม shortName ถ้ามี)
    Object.keys(data.months).forEach(function (mk) {
      s.months[mk] = s.months[mk] || [];
      (data.months[mk] || []).forEach(function (r) {
        var row = JSON.parse(JSON.stringify(r));
        var prev = prevByShort[nrm(row.shortName)];
        if (prev) {
          if (prev.itStatus) row.itStatus = prev.itStatus;
          if (prev.opStatus) row.opStatus = prev.opStatus;
          if (prev.memoUrl) row.memoUrl = prev.memoUrl;
          if (prev.attachment) row.attachment = prev.attachment;
          if (prev.changeStatus) row.changeStatus = prev.changeStatus;
          if (prev.posReady) row.posReady = prev.posReady;
        }
        s.months[mk].push(row);
      });
    });
  }

  /* Voucher & Item Coupon Confirmed seed → month rows จาก data/voucher-coupon-confirmed.js
     idempotent: ข้ามถ้ามี codePromotion เดิม (IC/VC ไม่ซ้ำ) · itemCode เว้นว่าง (รอ mapping) */
  function seedVoucherCouponConfirmed(s) {
    var data = (typeof window !== "undefined") && window.PC_VOUCHER_COUPON_CONFIRMED;
    if (!data || !data.records) return;
    var fileCodes = {};
    data.records.forEach(function (r) { var c = String(r.codePromotion || "").trim().toUpperCase(); if (c) fileCodes[c] = 1; });
    var isVC = function (pt) { pt = String(pt || "").toLowerCase(); return pt.indexOf("voucher") >= 0 || pt.indexOf("coupon") >= 0; };
    // sync-delete: ลบเฉพาะ 2 Type (Voucher / Item Coupon) ที่ code ไม่มีในไฟล์
    Object.keys(s.months).forEach(function (mk) {
      s.months[mk] = (s.months[mk] || []).filter(function (r) {
        if (!isVC(r.promoType || r.typePromotion)) return true;
        var c = String(r.codePromotion || "").trim().toUpperCase();
        return c && fileCodes[c];
      });
      if (!s.months[mk].length) delete s.months[mk];
    });
    // inject file records (dedup by code)
    var haveCode = {};
    Object.keys(s.months).forEach(function (mk) {
      (s.months[mk] || []).forEach(function (r) { var c = String(r.codePromotion || "").trim().toUpperCase(); if (c) haveCode[c] = 1; });
    });
    data.records.forEach(function (r) {
      var c = String(r.codePromotion || "").trim().toUpperCase();
      if (c && haveCode[c]) return;
      var mk = r.month || "2026-07";
      s.months[mk] = s.months[mk] || [];
      s.months[mk].push(JSON.parse(JSON.stringify(r)));
      if (c) haveCode[c] = 1;
    });
  }

  function seedBillDiscountConfirmed(s) {
    var list = window.PC_BILL_DISCOUNT_CONFIRMED || [];
    if (!list.length) return;
    list.forEach(function (bd) {
      var code = String(bd.code || "").trim(); if (!code) return;
      var dup = Object.keys(s.months || {}).some(function (m) {
        return (s.months[m] || []).some(function (r) { return String(r.codePromotion || "").toUpperCase() === code.toUpperCase(); });
      });
      if (dup) return;                                  // มีอยู่แล้ว — ไม่ inject ซ้ำ
      var month = (String(bd.start || "").slice(0, 7)) || "2026-06";
      var discText = bd.value + " " + (bd.unit || "฿");
      addButtonGroup(s, {
        month: month, campaign: bd.name, promoType: "Bill Discount Online", typePromotion: "Bill Discount",
        codePromotion: code, codeItemSet: "",
        start: bd.start, end: bd.end, stores: "ALL", saleMode: "ALL",
        itStatus: "COMPLETE", opStatus: "CONFIRMED", kitchen: "", shortName: bd.name,
        detail: bd.name, mechanic: "ส่วนลดท้ายบิล " + discText, discountText: discText,
        submittedDate: bd.start, itDoneDate: bd.start, opDoneDate: bd.start,
        items: [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: discText, netPrice: "" }],
      });
    });
  }

  /* Backfill: เติม "ส่วนลด (discount)" + "หมวดหมู่ (cateRemark)" ให้ทุกแถว Bill Discount ที่ยังว่าง
   * — ดึงตัวเลขส่วนลดจากชื่อแคมเปญ (เช่น "...50%" → 50 % · "...30 บาท/THB" → 30 ฿ · staff/owner ไม่มีเลข → 50 %)
   * — หมวดหมู่ default = "สินค้าราคาปกติเท่านั้น" · ไม่ทับค่าที่ user กรอกไว้แล้ว (เติมเฉพาะช่องว่าง)
   * ให้ทุกงานในตารางเหมือน BD167 Whoscall (มีราคาส่วนลด + หมวดครบ) */
  function billDiscountAmount(name) {
    name = String(name || "");
    var pm = name.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pm) return pm[1] + " %";
    var am = name.match(/(\d+(?:\.\d+)?)\s*(?:บาท|thb|฿|baht)/i);
    if (am) return am[1] + " ฿";
    if (/staff|owner|พนักงาน|เจ้าของ/i.test(name)) return "50 %";
    return "";
  }
  function backfillBillDiscountData(s) {
    var CATE_DEFAULT = "สินค้าราคาปกติเท่านั้น";
    var isBill = function (r) { return /bill/i.test(String(r.typePromotion || r.promoType || "")); };
    var apply = function (r) {
      if (!isBill(r)) return;
      var d = billDiscountAmount(r.campaign);
      if (d && !String(r.discount || "").trim()) r.discount = d;
      if (d && !String(r.discountText || "").trim()) r.discountText = d;
      if (!String(r.cateRemark || "").trim()) r.cateRemark = CATE_DEFAULT;
    };
    (s.working || []).forEach(apply);
    Object.keys(s.months || {}).forEach(function (m) { (s.months[m] || []).forEach(apply); });
  }

  /* Backfill: Coupon (IC) + Voucher (VC) — เติม "ส่วนลด/มูลค่า" + "หมวดหมู่" ที่ยังว่าง
   * — ดึงค่าจากชื่อแคมเปญ: จำนวน+บาท/%/CASH → ตัวเลข · รับฟรี/แถม/อัพไซซ์/แลก → ป้ายสิทธิ์ (ไม่กุอามตัวเลขมั่ว)
   * — ไม่ทับค่าที่มีอยู่แล้ว (เติมเฉพาะช่องว่าง) · ถ้ามีไฟล์จริงค่อยทับภายหลัง */
  function couponVoucherValue(name) {
    name = String(name || "");
    var pm = name.match(/(\d+(?:\.\d+)?)\s*%/); if (pm) return pm[1] + " %";
    var am = name.match(/(\d+(?:\.\d+)?)\s*(?:บาท|thb|฿|baht)/i); if (am) return am[1] + " ฿";
    var cm = name.match(/(?:cash|เงินสด)\s*(\d+)/i); if (cm) return cm[1] + " ฿";
    var fm = name.match(/(?:รับฟรี|ฟรี|free|แถม)\s*([A-Za-z0-9ก-๎\.\s]{2,20})/i);
    if (fm) return "ฟรี " + fm[1].replace(/[\[\(].*$/, "").trim();
    if (/upsize|อัพไซ/i.test(name)) return "อัพไซซ์";
    if (/แลกซื้อ|แลก|redeem/i.test(name)) return "แลกรับสิทธิ์";
    return "";
  }
  function backfillCouponVoucherData(s) {
    var isCV = function (r) { return /coupon|voucher/i.test(String(r.typePromotion || r.promoType || "")); };
    var apply = function (r) {
      if (!isCV(r)) return;
      if (!String(r.discount || "").trim()) { var v = couponVoucherValue(r.campaign); if (v) { r.discount = v; if (!String(r.discountText || "").trim()) r.discountText = v; } }
      if (!String(r.cateRemark || "").trim()) r.cateRemark = /voucher/i.test(String(r.typePromotion || r.promoType || "")) ? "บัตรกำนัล / ใช้แทนเงินสด" : "ใช้ตามเงื่อนไขคูปอง";
    };
    (s.working || []).forEach(apply);
    Object.keys(s.months || {}).forEach(function (m) { (s.months[m] || []).forEach(apply); });
  }

  /* Push one POS-button group into both the month sheet and the working sheet */
  function ensureDemoItemSet(s) {
    var month = "2026-06";
    var exists = (s.working || []).some(function (w) {
      return String(w.typePromotion || w.promoType || "").toLowerCase().indexOf("item set") !== -1
        && String(w.itStatus || "").toUpperCase() !== "COMPLETE";
    });
    if (exists) return; // user already has a pending Item Set — don't add noise
    var STORES = "PC1001, PC1002, PC1003, PC1004, PC1005, PC1006, PC1007, PC1008, PC1009, PC1010";
    addButtonGroup(s, {
      month: month, campaign: "Combo Cheese Lover [159]", promoType: "Item Set",
      typePromotion: "Item Set", codePromotion: "", codeItemSet: "",
      start: "2026-06-01", end: "2026-06-30", stores: STORES,
      saleMode: "Take Away", itStatus: "PENDING", opStatus: "WAITING",
      kitchen: "", shortName: "ComboCheeseLover[159]", cateRemark: "",
      submittedDate: "2026-06-10", itDoneDate: "", opDoneDate: "",
      detail: "เซ็ตสุดคุ้ม Mega Fries + Large Chicken Pop + Pepsi ราคาพิเศษ 159 บาท",
      mechanic: "ราคาพิเศษเฉพาะ Take Away · เลือกผงรสได้ 1 รส", attachment: "",
      items: [
        { catCode: "101", itemCode: "101003", itemNameEN: "MEGA FRIES", qty: 1, gross: 89, discount: 0, netPrice: 159 },
        { catCode: "104", itemCode: "104001", itemNameEN: "LARGE Super Chicken Pop", qty: 1, gross: 69, discount: 0, netPrice: 0 },
        { catCode: "201", itemCode: "201005", itemNameEN: "PEPSI 22oz", qty: 1, gross: 25, discount: 0, netPrice: 0 }
      ]
    });
  }

  function addButtonGroup(s, cfg) {
    const ts = NOW();
    if (!s.months[cfg.month]) s.months[cfg.month] = [];
    const items = cfg.items || [];
    items.forEach((it, idx) => {
      s.months[cfg.month].push({
        month: cfg.month, campaign: cfg.campaign, start: cfg.start, end: cfg.end, stores: cfg.stores,
        saleMode: cfg.saleMode, typePromotion: cfg.typePromotion, promoType: cfg.promoType || cfg.typePromotion || "",
        codePromotion: cfg.codePromotion || "", codeItemSet: cfg.codeItemSet || "", itemPromotion: cfg.itemPromotion || "",
        kitchen: cfg.kitchen || "", shortName: cfg.shortName, catCode: it.catCode || "",
        itemCode: it.itemCode, itemNameEN: it.itemNameEN, qty: it.qty,
        gross: it.gross, discount: (it.discount !== undefined ? it.discount : (idx === 0 ? it.discount : 0)), netPrice: it.netPrice,
        isSubset: it.isSubset || "", chooseMin: it.chooseMin || "", chooseMax: it.chooseMax || "",
        detail: cfg.detail, mechanic: cfg.mechanic,
        itStatus: cfg.itStatus, opStatus: cfg.opStatus, changeStatus: cfg.changeStatus || "",
        reporter: cfg.reporter || "", updatedBy: "seed@rocks-foods.com", timestamp: ts,
        attachment: cfg.attachment || "", memoUrl: "", updatedDate: ts,
        cateRemark: cfg.cateRemark || "", cate: cfg.cate || "", minAmount: cfg.minAmount || 0, posReady: !!cfg.posReady,
        addons: it.addons || cfg.addons || "",
        cancelReason: cfg.cancelReason || "", reason: cfg.cancelReason || "",
        rejectReason: cfg.rejectReason || "", rejectCount: cfg.rejectCount || 0,
        proposalKind: cfg.proposalKind || "",
        codeChannel: cfg.codeChannel || "",   /* FX-P85 — Online/Normal/Offline ของฟอร์ม (Code Promotion เก็บเลขจริง) */
        submittedDate: cfg.submittedDate || ts, itDoneDate: cfg.itDoneDate || "", opDoneDate: cfg.opDoneDate || "",
        customerGroup: cfg.customerGroup || "", crmTarget: cfg.crmTarget || "", crmTargetName: cfg.crmTargetName || "",
      });
    });
  }

  /* ===========================================================================
   * SERVER FUNCTIONS  (named exactly as in Code.gs)
   * ========================================================================== */
  const API = {};

  /* ---- Add on → IT สร้าง Subset ใหม่จากรายการที่ MKT กรอก แล้วผูกกับสินค้าในชุด ---- */
  API.createSubsetFromAddon = (campaign, shortName, addons, opts) => {
    addons = addons || [];
    if (!addons.length) return { status: "error", message: "ไม่มีรายการ Add on" };
    campaign = String(campaign || "").trim(); shortName = String(shortName || "").trim();
    // ออก SS code จากตัวนับกลาง (กันชนของเดิม) → fallback baseline
    let ss = "";
    try { if (window.PC_COUNTER) { const e = window.PC_COUNTER.reserve("ss", { where: campaign + "|" + shortName + " (Add on)", by: "IT" }); ss = e ? e.code : ""; if (ss && window.PC_COUNTER.confirm) window.PC_COUNTER.confirm(ss, "ss"); } } catch (e) {}
    if (!ss) { const mx = cgBaseline("ss"); ss = "SS" + String(mx + 1).padStart(4, "0"); }
    const name = (opts && opts.name) || (shortName + " Add on");
    // subset master (runtime — เก็บใน pc_addon_subsets ให้ ItemSet/Products เห็น)
    try { const SM = window.PC_SUBSET_MASTER || []; if (!SM.find(x => x.ssCode === ss)) SM.push({ ssCode: ss, name: name, short: name, status: "Active", promoFormActive: "Show", _addon: true }); } catch (e) {}
    try { const reg = JSON.parse(localStorage.getItem("pc_addon_subsets") || "{}"); reg[ss] = { ssCode: ss, name: name, short: name, status: "Active", _addon: true }; localStorage.setItem("pc_addon_subsets", JSON.stringify(reg)); } catch (e) {}
    try { const cust = JSON.parse(localStorage.getItem("pc_subset_custom") || "[]"); if (!cust.find(x => x.ssCode === ss)) { cust.push({ ssCode: ss, nameTH: name, nameEN: name }); localStorage.setItem("pc_subset_custom", JSON.stringify(cust)); } } catch (e) {}
    // หา item code ของปุ่มในชุด → ผูก subset เป็นกลุ่มเลือกได้ (optional, min 0)
    const itemCodes = {};
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() === campaign && String(r.shortName || "").trim() === shortName && r.itemCode) itemCodes[String(r.itemCode)] = 1;
    }));
    try {
      const comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}");
      Object.keys(itemCodes).forEach(ic => { comp[ic] = comp[ic] || []; if (!comp[ic].some(b => b.code === ss)) comp[ic].push({ code: ss, min: 0, max: addons.length, _addon: true }); });
      localStorage.setItem("pc_itemset_comp", JSON.stringify(comp));
    } catch (e) {}
    // เก็บรายการสินค้า Add on + ราคา ของ subset นี้
    try { const ap = JSON.parse(localStorage.getItem("pc_addon_items") || "{}"); ap[ss] = addons; localStorage.setItem("pc_addon_items", JSON.stringify(ap)); } catch (e) {}
    // mark month rows ว่าสร้าง subset แล้ว
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() === campaign && String(r.shortName || "").trim() === shortName) r.addonSubset = ss;
    }));
    persist();
    return { status: "success", ss: ss, name: name, boundItems: Object.keys(itemCodes), message: "สร้าง Subset " + ss + " จาก Add on แล้ว (" + addons.length + " รายการ) ผูกกับสินค้าในชุดเรียบร้อย" };
  };

  /* ---- RM master (rm_code unique) — public surface defined after API exists ---- */
  /* ---- IT กดสร้าง Subset จาก Add on ทั้งแคมเปญ (รายปุ่มที่มี addons) ---- */
  API.createAddonSubsetForCampaign = (campaign, month) => {
    campaign = String(campaign || "").trim();
    const byBtn = {};
    Object.keys(store.months).forEach(m => { if (month && m !== month) return; (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() !== campaign || !r.addons) return;
      try { const a = JSON.parse(r.addons); if (a && a.length) { const k = r.shortName || ""; (byBtn[k] = byBtn[k] || []).push.apply(byBtn[k], a); } } catch (e) {}
    }); });
    const results = [];
    Object.keys(byBtn).forEach(sn => {
      const seen = {}, list = [];
      byBtn[sn].forEach(x => { const c = String(x.code || x.name); if (!seen[c]) { seen[c] = 1; list.push(x); } });
      results.push(API.createSubsetFromAddon(campaign, sn, list));
    });
    if (!results.length) return { status: "error", message: "ไม่พบ Add on ในแคมเปญนี้" };
    return { status: "success", results, message: "สร้าง Subset จาก Add on แล้ว " + results.length + " ปุ่ม (" + results.map(r => r.ss).filter(Boolean).join(", ") + ")" };
  };

  API.checkRmCode = (code) => {
    const c = normCode(code);
    if (!c) return { exists: false };
    const hit = findRm(c);
    return hit ? { exists: true, code: hit.code, desc: hit.desc, unit: hit.unit } : { exists: false };
  };
  API.getRmMaster = () => rmMaster().filter(r => normCode(r.code) && normCode(r.desc));
  // สูตร RM รายสินค้าจาก NPD (BOM ที่ไม่มีในไฟล์ recipe-bom.js) — keyed by itemCode
  API.getRecipeCustom = () => { syncCompletedNpdMasters(); return store.recipeCustom || {}; };
  API.setRmStatus = (code, status) => {
    const r = findRm(code); if (!r) return { status: "error", message: "ไม่พบ RM" };
    r.status = status; stampVersion(r); persist();
    return { status: "success" };
  };
  API.addRmCode = (rm) => {
    const code = normCode(rm && rm.code);
    if (!code) return dupError("กรุณากรอกรหัส RM");
    if (findRm(code)) return dupError("รหัส RM \"" + code + "\" มีอยู่แล้วในระบบ — ใช้รายการเดิมได้เลย");
    const row = stampVersion({ code, desc: normCode(rm.desc), unit: normCode(rm.unit) || "g" });
    rmMaster().push(row); persist();
    return { status: "success", message: "เพิ่ม RM ใหม่เรียบร้อย", code };
  };
  // soft-lock + fetch-latest (SHOULD) — bound here so they exist on API
  API.acquireLock = (recId, user) => _acquireLock(recId, user);
  API.releaseLock = (recId, user) => _releaseLock(recId, user);
  API.getLock = (recId) => _getLock(recId);
  API.getNpdById = (id) => { const n = (store.npd || []).find(x => x.id === id); return n ? JSON.parse(JSON.stringify(n)) : null; };

  API.getAppUrl = () => location.href.split("#")[0];

  // SPA page loader — fetches the page partial (returns a Promise; runner awaits it)
  API.getPageContent = (filename) =>
    fetch("pages/" + filename + ".html", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("not found"); return r.text(); })
      .catch(() => `<div class="p-5 text-center text-danger"><h4>\u274c \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e2b\u0e19\u0e49\u0e32: ${filename}</h4></div>`);
  API.include = () => "";

  /* ===========================================================================
   * ทะเบียนเครื่อง Asset register  (mirrors Apps Script Code.gs asset functions)
   *   store.assets = one row per physical device (serial = identity)
   *   - getAssetInventory()       → rows shaped for pages/Asset.html
   *   - updateMAScheduleInSheet() → recompute MA Start/End for 2026, persist
   *   - getMasterData()           → device-type catalog (dropdowns) from Master_Hardware
   * ========================================================================== */
  function assetParseDate(s) {
    if (!s || s === "-") return null;
    const str = String(s).trim();
    if (str.includes("/")) {
      const p = str.split("/"); let y = parseInt(p[2], 10);
      if (y > 2500) y -= 543;                       // พ.ศ. → ค.ศ.
      const d = new Date(y, parseInt(p[1], 10) - 1, parseInt(p[0], 10));
      return isNaN(d) ? null : d;
    }
    const d = new Date(str); return isNaN(d) ? null : d;
  }
  function assetFmtDate(d) {
    if (!d) return "-";
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  function assetMaRate(a) {
    const c = String(a.category || "").toUpperCase();
    if (a.maFee) return a.maFee;                    // rate carried from the listing
    if (c.includes("PRINT")) return 1400;
    if (c.includes("POS")) return 5900;
    return 0;
  }
  // pro-rata MA charge = (days between MA start..end)/365 × annual rate, capped at rate.
  // Reproduces the "MA Charge 2026" column of the source sheet.
  function assetMaCharge(a) {
    const ms = assetParseDate(a.maStart), me = assetParseDate(a.maEnd);
    const rate = assetMaRate(a);
    if (!ms || !me || rate <= 0 || me < ms) return 0;
    const days = Math.round((me.getTime() - ms.getTime()) / 86400000);
    const cost = (rate / 365) * days;
    return cost > rate ? rate : cost;
  }

  API.getAssetInventory = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (store.assets || []).map((a, idx) => {
      const waStart = assetParseDate(a.waStart);
      let years = "-";
      if (waStart) {
        let dy = today.getFullYear() - waStart.getFullYear();
        if (today.getMonth() < waStart.getMonth() || (today.getMonth() === waStart.getMonth() && today.getDate() < waStart.getDate())) dy--;
        years = (dy >= 0 ? dy : 0).toString();
      }
      const statusRaw = String(a.status || "").toUpperCase();
      const hasMa = !!(a.maStart && a.maStart !== "-" && a.maEnd && a.maEnd !== "-");
      const onMa = statusRaw.includes("ACTIVE") && hasMa && assetMaRate(a) > 0;
      const cost = onMa ? assetMaCharge(a) : 0;
      return {
        rowNum: idx + 1, id: a.id,
        shopCode: a.shopCode || "-", shopName: a.shopName || "-", company: a.company || "-",
        typeBrand: a.category || "-",   // TYPE column (POS / Printer)
        type: a.brand || "-",           // BRAND column
        brand: a.brand || "-", model: a.model || "-", spec: a.spec || "-",
        sn: a.serial || "-", yearsInService: years,
        waEnd: a.waEnd || "-",
        maBadge: onMa ? "YES" : "NO", maCost: cost.toFixed(2),
        maStart: a.maStart || "-", maEnd: a.maEnd || "-",
        statusUse: a.status || "-",
      };
    });
  };

  // Recompute MA Start/End for the 2026 budget year (pro-rata from warranty end → 31 Dec 2026)
  API.updateMAScheduleInSheet = () => {
    const start2026 = new Date(2026, 0, 1), end2026 = new Date(2026, 11, 31);
    let updated = 0;
    (store.assets || []).forEach(a => {
      const statusRaw = String(a.status || "").toUpperCase();
      const waEnd = assetParseDate(a.waEnd);
      const rate = assetMaRate(a);
      let ms = null, me = null;
      if (statusRaw.includes("ACTIVE") && rate > 0 && (!waEnd || waEnd < end2026)) {
        if (!waEnd || waEnd < start2026) ms = new Date(start2026);
        else { ms = new Date(waEnd); ms.setDate(ms.getDate() + 1); }
        me = new Date(end2026);
      }
      if (ms && me) { a.maStart = assetFmtDate(ms); a.maEnd = assetFmtDate(me); updated++; }
      else { a.maStart = "-"; a.maEnd = "-"; }
    });
    persist();
    return "อัปเดตสำเร็จ " + updated + " รายการ";
  };

  // Device-type catalog (mirrors Apps Script getMasterData on the Master_Hardware sheet)
  API.getMasterData = () => {
    const cat = window.PC_HARDWARE_MASTER || [];
    const mapping = {};
    cat.forEach(r => { if (r.type && !mapping[r.type]) mapping[r.type] = { model: r.model || "", spec: "" }; });
    return {
      types: [...new Set(cat.map(r => r.type).filter(Boolean))],
      models: [...new Set(cat.map(r => r.model).filter(Boolean))],
      brands: [...new Set(cat.map(r => r.brand).filter(Boolean))],
      catalog: cat, mapping,
    };
  };

  /* ===========================================================================
   * Asset DRIFT engine — auto-detect fleet changes vs the asset register
   *   getAssetDrift()        → list of changes the register hasn't absorbed yet
   *   applyAssetDrift(item)  → write the fix into store.assets (+ device_rd_history)
   *   applyAllAssetDrift()   → bulk-apply NEW / SWAP / CASE (ORPHAN stays manual)
   * Sources: PC_BRANCH_MASTER (สาขาจริง) · window.RD cases (เปลี่ยนเครื่อง) · store.assets
   * ========================================================================== */
  // Live branch list = static PC_BRANCH_MASTER (all 165) with Master Settings edits applied
  // by id, PLUS any branch that exists only in pc_master_lists (a genuinely new addition).
  // Union — never drops base branches even if pc_master_lists is partial/stale.
  function liveBranches() {
    const base = window.PC_BRANCH_MASTER || [];
    let ml = null; try { ml = JSON.parse(localStorage.getItem("pc_master_lists")); } catch (e) {}
    const edits = (ml && Array.isArray(ml.branches)) ? ml.branches : [];
    const editById = {}; edits.forEach(b => { if (b && b.id) editById[b.id] = b; });
    const out = base.map(b => editById[b.id] ? Object.assign({}, b, editById[b.id]) : b);
    const baseIds = new Set(base.map(b => b.id));
    edits.forEach(b => { if (b && b.id && !baseIds.has(b.id)) out.push(b); });
    return out;
  }
  function activePosByShop() {
    const m = {};
    (store.assets || []).forEach(a => {
      if (String(a.category || "").toUpperCase().includes("POS") && String(a.status || "").toUpperCase() === "ACTIVE")
        (m[a.shopCode] = m[a.shopCode] || []).push(a);
    });
    return m;
  }
  function nextAssetId(shop) {
    let n = 0; (store.assets || []).forEach(a => { if (a.shopCode === shop) { const mm = /-(\d+)$/.exec(a.id || ""); if (mm) n = Math.max(n, +mm[1]); } });
    return "AST-" + shop + "-" + String(n + 1).padStart(2, "0");
  }
  API.getAssetDrift = () => {
    const BM = liveBranches();
    const cases = (window.RD && window.RD.getCases) ? (window.RD.getCases() || []) : [];
    const pos = activePosByShop();
    const bmIds = new Set(BM.map(b => b.id));
    const isInactive = b => String(b.active || "Active") === "Inactive" || String(b.opStatus || "Operating").toUpperCase() === "CLOSED";
    const items = [];
    // 1) NEW — branch exists in master but no active POS row in the register
    BM.forEach(b => {
      if ((pos[b.id] || []).length) return;
      if (isInactive(b)) return; // สาขาปิด/Inactive ไม่ต้องเพิ่มเครื่อง
      items.push({ id: "NEW-" + b.id, kind: "NEW", shopCode: b.id, shopName: b.name || b.id,
        detail: "สาขาในฐานข้อมูลแต่ยังไม่มีเครื่อง POS ในทะเบียน",
        suggest: "เพิ่มเครื่อง POS: " + (b.brandModel || "-") + " / " + (b.machineType || "-") + " · S/N " + (b.serialNumber || "-"),
        payload: { shopCode: b.id } });
    });
    // 2) SWAP — active POS serial differs from the branch master serial
    BM.forEach(b => {
      const rows = pos[b.id] || []; if (!rows.length) return;
      if (isInactive(b)) return; // สาขาปิด → ไปเข้า rule CLOSED แทน
      const sn = String(b.serialNumber || "").trim(); if (!sn) return;
      if (rows.some(r => String(r.serial || "").trim().toUpperCase() === sn.toUpperCase())) return;
      items.push({ id: "SWAP-" + b.id, kind: "SWAP", shopCode: b.id, shopName: b.name || b.id,
        detail: "Serial ในทะเบียน (" + rows.map(r => r.serial || "—").join("/") + ") ไม่ตรงฐานข้อมูลสาขา (" + sn + ")",
        suggest: "เปลี่ยนเป็นเครื่อง S/N " + sn + " · retire เครื่องเดิม",
        payload: { shopCode: b.id, newSerial: sn, brand: b.brandModel, model: b.machineType, spec: b.specMachine } });
    });
    // 2.5) CLOSED — Shop Master = ตัวหลัก: สาขาปิด/Inactive แต่ยังมีเครื่อง Active ในทะเบียน → retire
    BM.forEach(b => {
      const rows = pos[b.id] || []; if (!rows.length) return;
      if (!isInactive(b)) return;
      items.push({ id: "CLOSED-" + b.id, kind: "CLOSED", shopCode: b.id, shopName: b.name || b.id,
        detail: "สาขาปิด/Inactive ใน Shop Master แต่ยังมีเครื่อง POS Active " + rows.length + " เครื่อง",
        suggest: "retire เครื่องทั้งหมดของสาขานี้ (ตาม Shop Master)",
        payload: { shopCode: b.id } });
    });
    // 3) CASE — an RD cancel/re-register case swapped a machine not yet in the register
    cases.forEach(c => {
      const m = c.newMachine; if (!m || !m.serialNumber) return;
      const sc = c.shopCode || c.branchId || (c.branch && c.branch.id); if (!sc) return;
      const rows = pos[sc] || [];
      if (rows.some(r => String(r.serial || "").trim().toUpperCase() === String(m.serialNumber).trim().toUpperCase())) return;
      items.push({ id: "CASE-" + c.id, kind: "CASE", shopCode: sc, shopName: (rows[0] || {}).shopName || sc,
        detail: "เคส RD " + c.id + " เปลี่ยนเครื่องใหม่ (S/N " + m.serialNumber + ") ยังไม่เข้าทะเบียน",
        suggest: "apply เครื่องใหม่ + retire เดิม + บันทึก device_rd_history",
        payload: { shopCode: sc, newSerial: m.serialNumber, brand: m.brandModel, model: m.machineType, spec: m.specMachine, caseId: c.id } });
    });
    // 4) ORPHAN — register has a device whose shopCode is not in the branch master
    [...new Set((store.assets || []).map(a => a.shopCode))].forEach(sc => {
      if (bmIds.has(sc)) return;
      const rows = (store.assets || []).filter(a => a.shopCode === sc && String(a.status || "").toUpperCase() === "ACTIVE");
      if (!rows.length) return;
      items.push({ id: "ORPH-" + sc, kind: "ORPHAN", shopCode: sc, shopName: (rows[0] || {}).shopName || sc,
        detail: "มีเครื่องในทะเบียน " + rows.length + " เครื่อง แต่ไม่พบสาขานี้ในฐานข้อมูลสาขา",
        suggest: "ตรวจสอบ — สาขาปิด/รหัสผิด → retire หรือแก้รหัส",
        payload: { shopCode: sc } });
    });
    return items;
  };
  API.applyAssetDrift = (item) => {
    if (!item || !item.kind) return { status: "error", message: "ไม่มีรายการ" };
    const p = item.payload || {};
    const BM = liveBranches();
    const branch = BM.find(b => b.id === p.shopCode) || {};
    store.assets = store.assets || []; store.deviceRdHistory = store.deviceRdHistory || [];
    if (item.kind === "NEW") {
      store.assets.push({ id: nextAssetId(p.shopCode), shopCode: p.shopCode, shopName: branch.name || p.shopCode,
        company: branch.company || "-", owner: branch.type || "-", category: "POS",
        brand: branch.brandModel || "-", model: branch.machineType || "-", spec: branch.specMachine || "-",
        serial: branch.serialNumber || "-", hwsw: "Hardware", waStart: "-", waEnd: "-", maStart: "-", maEnd: "-",
        maFee: 5900, maCharge: 0, status: "Active", source: "auto-new-branch" });
      persist(); return { status: "success", message: "เพิ่มเครื่อง POS ให้ " + p.shopCode };
    }
    if (item.kind === "SWAP" || item.kind === "CASE") {
      const olds = store.assets.filter(a => a.shopCode === p.shopCode && String(a.category || "").toUpperCase().includes("POS") && String(a.status || "").toUpperCase() === "ACTIVE");
      olds.forEach(o => { o.status = "Retired"; o.retiredAt = Date.now(); store.deviceRdHistory.push({ assetId: o.id, shopCode: p.shopCode, serial: o.serial, action: "RETIRE", at: Date.now(), caseId: p.caseId || null }); });
      const ref = olds[0] || {};
      const row = { id: nextAssetId(p.shopCode), shopCode: p.shopCode, shopName: ref.shopName || branch.name || p.shopCode,
        company: ref.company || branch.company || "-", owner: ref.owner || branch.type || "-", category: "POS",
        brand: p.brand || branch.brandModel || "-", model: p.model || branch.machineType || "-", spec: p.spec || branch.specMachine || "-",
        serial: p.newSerial || "-", hwsw: "Hardware", waStart: "-", waEnd: "-", maStart: "-", maEnd: "-",
        maFee: ref.maFee || 5900, maCharge: 0, status: "Active", source: item.kind === "CASE" ? ("rd-case:" + p.caseId) : "serial-swap" };
      store.assets.push(row);
      store.deviceRdHistory.push({ assetId: row.id, shopCode: p.shopCode, serial: row.serial, action: "ACTIVE", at: Date.now(), caseId: p.caseId || null });
      persist(); return { status: "success", message: "เปลี่ยนเครื่อง " + p.shopCode + " → S/N " + (p.newSerial || "-") };
    }
    if (item.kind === "CLOSED") {
      const olds = store.assets.filter(a => a.shopCode === p.shopCode && String(a.status || "").toUpperCase() === "ACTIVE");
      olds.forEach(o => { o.status = "Retired"; o.retiredAt = Date.now(); store.deviceRdHistory.push({ assetId: o.id, shopCode: p.shopCode, serial: o.serial, action: "RETIRE", at: Date.now(), reason: "branch-closed" }); });
      persist(); return { status: "success", message: "retire " + olds.length + " เครื่องของสาขาปิด " + p.shopCode };
    }
    if (item.kind === "ORPHAN") {
      store.assets.filter(a => a.shopCode === p.shopCode).forEach(a => { a.status = "Retired"; a.retiredAt = Date.now(); });
      persist(); return { status: "success", message: "retire เครื่องของ " + p.shopCode + " (orphan)" };
    }
    return { status: "error", message: "ชนิดไม่รองรับ" };
  };
  API.applyAllAssetDrift = () => {
    const items = API.getAssetDrift().filter(i => i.kind === "NEW" || i.kind === "SWAP" || i.kind === "CASE" || i.kind === "CLOSED");
    let n = 0; items.forEach(i => { if (API.applyAssetDrift(i).status === "success") n++; });
    return { status: "success", applied: n, total: items.length };
  };

  /* Plan 2026 — proactive IT-device deployment plan (data/plan-2026.js).
   * getPlanWork() turns each planned branch into an actionable item, cross-checked
   * with the asset register + RD cases, so the work surfaces BEFORE it happens. */
  API.getPlan2026 = () => (store.plan2026 || []).slice();

  /* CMPOS Installation form — receives the filled delivery form and writes each
   * device straight into the asset register (store.assets), status Active.
   * getInitialData(shop) prefills branch + which devices to register. */
  API.getInitialData = (shopOrRef) => {
    const code = String(shopOrRef || "").trim();
    const b = (window.PC_BRANCH_MASTER || []).find(x => x.id === code) || {};
    const plan = (store.plan2026 || []).find(p => p.shopCode === code);
    const jobType = plan ? (/full/i.test(plan.action) ? "New Store" : plan.action) : "New Store";
    return { shopCode: code, branchName: b.name || code, jobType: jobType, items: "Standard Set" };
  };
  function ymdToThai(s) {
    s = String(s || ""); const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : (s || "-");
  }
  API.processForm = (payload) => {
    payload = payload || {};
    const shop = String(payload.shopCode || "").trim();
    if (!shop) return "Error: ไม่มีรหัสสาขา";
    const b = (window.PC_BRANCH_MASTER || []).find(x => x.id === shop) || {};
    store.assets = store.assets || []; store.deviceRdHistory = store.deviceRdHistory || [];
    let n = 0;
    (payload.devices || []).forEach(d => {
      if (!d.serial || !String(d.serial).trim()) return;
      const cat = /pos/i.test(d.type) ? "POS" : /printer/i.test(d.type) ? "Printer" : (d.type || "Other");
      const row = { id: nextAssetId(shop), shopCode: shop, shopName: payload.branchName || b.name || shop,
        company: b.company || "-", owner: b.type || "-", category: cat, brand: d.brand || "-", model: d.brand || "-",
        spec: d.spec || "-", serial: String(d.serial).trim(), hwsw: d.hwsw || "Hardware",
        waStart: ymdToThai(d.waStart), waEnd: ymdToThai(d.waEnd), maStart: "-", maEnd: "-",
        maFee: /pos/i.test(cat) ? 5900 : /printer/i.test(cat) ? 1400 : 0, maCharge: 0, status: "Active",
        source: "cmpos-form", doNumber: payload.doNumber || "", installDate: payload.installDate || "" };
      store.assets.push(row);
      store.deviceRdHistory.push({ assetId: row.id, shopCode: shop, serial: row.serial, action: "INSTALL", at: Date.now(), by: payload.staffName || "CMPOS", doNumber: payload.doNumber || "" });
      n++;
    });
    persist();
    return n ? "Success" : "Error: ไม่มี Serial ที่กรอก";
  };

  /* Maintenance / Audit request (pages/Maintenance.html) — stores a ticket. */
  API.processMaintenanceForm = (formObj, photos, quotation) => {
    formObj = formObj || {};
    const id = "PCTH" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    store.maintenanceLogs = store.maintenanceLogs || [];
    const types = [].concat(formObj["type[]"] || formObj["audit_type[]"] || []);
    store.maintenanceLogs.unshift({
      id, ticketNo: formObj.ticketNo || "", branchName: formObj.branchName || "",
      kind: formObj["audit_type[]"] ? "AUDIT" : "REPAIR",
      issueDetails: formObj.issueDetails || formObj.jobSummary || "",
      staffName: formObj.staffName || "", photos: (photos || []).length, quotation: quotation ? 1 : 0,
      status: "PENDING", at: Date.now(),
    });
    persist();
    try { if (window.PC_notify) window.PC_notify("equipment_request", { text: 'แจ้งงาน IT / อุปกรณ์' + (formObj.branchName ? ' — สาขา ' + formObj.branchName : '') + (formObj.issueDetails || formObj.jobSummary ? ' · ' + String(formObj.issueDetails || formObj.jobSummary).slice(0, 80) : '') + ' (' + id + ') — รอ IT รับเรื่อง' }); } catch (e) {}
    return id;
  };
  API.savePlanRow = (row) => {
    if (!row || !row.shopCode) return { status: "error", message: "ต้องระบุรหัสสาขา" };
    store.plan2026 = store.plan2026 || [];
    const i = store.plan2026.findIndex(p => p.shopCode === row.shopCode);
    if (i >= 0) store.plan2026[i] = Object.assign({}, store.plan2026[i], row);
    else store.plan2026.unshift(row);
    persist(); return { status: "success", message: "บันทึกแผน " + row.shopCode };
  };
  API.deletePlanRow = (shopCode) => {
    store.plan2026 = (store.plan2026 || []).filter(p => p.shopCode !== shopCode);
    persist(); return { status: "success", message: "ลบ " + shopCode };
  };
  // Smart suggestion for a Renovate/Relocate row: replace the POS if the active device
  // is out of warranty or aged; otherwise keep it. Reads the real asset register.
  API.suggestDevice = (shopCode) => {
    const rows = (store.assets || []).filter(a => a.shopCode === shopCode && String(a.category || "").toUpperCase().includes("POS") && String(a.status || "").toUpperCase() === "ACTIVE");
    if (!rows.length) return { pos: "Opening", reason: "ไม่มีเครื่องในทะเบียน — ติดตั้งใหม่" };
    const a = rows[0];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const waEnd = assetParseDate(a.waEnd);
    const waStart = assetParseDate(a.waStart);
    const expired = waEnd && waEnd < today;
    let years = 0; if (waStart) years = (today - waStart) / (365 * 86400000);
    if (expired || years >= 5) return { pos: "Replace", reason: (expired ? "หมดประกัน" : "อายุ " + Math.floor(years) + " ปี") + " → ควรเปลี่ยน" };
    return { pos: "Old", reason: "เครื่องยังใหม่/ในประกัน → ใช้เครื่องเดิม" };
  };
  API.getPlanWork = () => {
    const plan = store.plan2026 || [];
    const pos = activePosByShop();
    const cases = (window.RD && window.RD.getCases) ? (window.RD.getCases() || []) : [];
    const triggers = (window.RD && window.RD.getTriggers) ? (window.RD.getTriggers() || []) : [];
    return plan.map(p => {
      const hasPos = (pos[p.shopCode] || []).length > 0;
      const devs = [p.pos, p.printerCashier, p.printerKitchen].map(x => String(x || "").toLowerCase());
      const hasReplace = devs.some(d => d === "replace");
      const hasAdd = devs.some(d => d.includes("add"));
      const act = String(p.action || "").toLowerCase();
      let need, reason = "", label;
      if (act === "full") { need = "INSTALL"; reason = "new"; label = "เปิดสาขาใหม่ — ติดตั้งเครื่อง"; }
      else if (hasReplace) { need = "SWAP"; reason = act === "relocate" ? "relocate" : (act === "renovate" ? "renovate" : "transfer"); label = p.action + " — เปลี่ยนเครื่อง"; }
      else if (hasAdd) { need = "ADD"; reason = "renovate"; label = p.action + " — เพิ่มเครื่อง"; }
      else { need = "KEEP"; reason = ""; label = (p.action || "") + " — ใช้เครื่องเดิม"; }
      let status = "pending";
      const hasCase = cases.some(c => (c.shopCode || c.branchId || (c.branch && c.branch.id)) === p.shopCode);
      const hasTrig = triggers.some(t => t.branchId === p.shopCode && (t.status === "pending" || t.status === "handled"));
      if (need === "INSTALL") status = hasPos ? "done" : "pending";
      else if (need === "SWAP") status = (hasCase || hasTrig) ? "in-case" : "pending";
      else if (need === "ADD") status = "pending";
      else if (need === "KEEP") status = "ok";
      return { shopCode: p.shopCode, name: p.name || p.shopCode, type: p.type, action: p.action,
        need, reason, label, openingDate: p.openingDate, confirm: p.confirm, pic: p.pic, status,
        devices: { pos: p.pos, printerCashier: p.printerCashier, printerKitchen: p.printerKitchen } };
    });
  };

  // Ask CMPOS to fill device data for branches that have no machine in the register yet.
  // Mock: record the request + return a ready-to-send mailto (real Apps Script would MailApp.sendEmail).
  API.requestCmposAssetData = (shopCodes) => {
    const list = Array.isArray(shopCodes) ? shopCodes.filter(Boolean) : [];
    if (!list.length) return { status: "error", message: "ไม่มีสาขาที่เลือก" };
    const BM = liveBranches();
    const to = localStorage.getItem("pc_cmpos_email") || "cmpos.support@cmpos.co.th";
    const rows = list.map(sc => { const b = BM.find(x => x.id === sc) || {}; return { shopCode: sc, name: b.name || sc, company: b.company || "-", address: b.address || "-" }; });
    const subject = "[ROCKS PC] ขอข้อมูลเครื่อง POS เพื่อลงทะเบียน Asset — " + list.length + " สาขา";
    const lines = rows.map((r, i) => (i + 1) + ". " + r.shopCode + " " + r.name + " (" + r.company + ")");
    const body = "เรียน ทีม CMPOS\n\nรบกวนกรอกข้อมูลเครื่อง POS (Brand/Model, Serial Number, วันติดตั้ง/หมดประกัน) สำหรับสาขาต่อไปนี้ เพื่อบันทึกเข้าทะเบียนเครื่อง Asset:\n\n" + lines.join("\n") + "\n\nกรอกผ่านฟอร์ม CMPOS Delivery หรือตอบกลับอีเมลนี้\n\nขอบคุณครับ\nฝ่าย IT — Rocks PC";
    store.cmposAssetRequests = store.cmposAssetRequests || [];
    const rec = { id: "CRQ-" + Date.now().toString(36).toUpperCase(), shops: list, to, at: Date.now(), by: "IT", status: "SENT" };
    store.cmposAssetRequests.unshift(rec); persist();
    const mailto = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    return { status: "success", to, subject, body, mailto, count: list.length, requestId: rec.id };
  };

  API.checkLogin = (username, password) => {
    const u = allUsers().find(r =>
      r.username.toLowerCase() === String(username || "").trim().toLowerCase() &&
      r.password === String(password || "").trim());
    if (u) return { status: "success", username: u.username, role: u.role, name: u.name };
    return { status: "fail", message: "Username หรือ Password ไม่ถูกต้อง" };
  };

  /* ---- Microsoft (Entra) SSO: match the account email against a configured user.
   * Role/name come from the user record set up in the Users/Permissions page —
   * NOT hardcoded here. Unknown email → refused (ก). */
  API.checkLoginByEmail = (email) => {
    const em = String(email || "").trim().toLowerCase();
    if (!em) return { status: "fail", message: "ไม่พบอีเมลจากบัญชี Microsoft" };
    const u = allUsers().find(r =>
      String(r.email || "").trim().toLowerCase() === em ||
      String(r.username || "").trim().toLowerCase() === em);
    if (u) return { status: "success", username: u.username, role: u.role, name: u.name, email: em };
    return { status: "fail", message: "อีเมลนี้ยังไม่ได้รับสิทธิ์ กรุณาติดต่อ Admin เพื่อเพิ่มอีเมลและกำหนดสิทธิ์" };
  };

  /* ---- user management (Admin) ---- */
  API.getUsers = () => allUsers().map((u, i) => ({
    username: u.username, role: u.role, name: u.name,
    builtin: i < USERS.length, email: u.email || "",
  }));
  API.addUser = (payload) => {
    if (!store.users) store.users = [];
    const uname = String(payload.username || "").trim();
    if (!uname) return { status: "error", message: "กรุณาระบุ Username / Email" };
    if (allUsers().some(u => u.username.toLowerCase() === uname.toLowerCase()))
      return { status: "error", message: "มีผู้ใช้นี้อยู่แล้ว: " + uname };
    store.users.push({
      username: uname, password: String(payload.password || "").trim() || "1234",
      role: payload.role || "MKT", name: String(payload.name || uname).trim(),
      email: String(payload.email || "").trim(),
    });
    persist();
    return { status: "success", message: "เพิ่มผู้ใช้เรียบร้อย" };
  };
  API.deleteUser = (username) => {
    if (!store.users) store.users = [];
    store.users = store.users.filter(u => u.username.toLowerCase() !== String(username).toLowerCase());
    persist();
    return { status: "success", message: "ลบผู้ใช้เรียบร้อย" };
  };
  API.updateUser = (username, payload) => {
    if (!store.users) store.users = [];
    const added = store.users.find(x => x.username.toLowerCase() === String(username).toLowerCase());
    const builtin = USERS.find(x => x.username.toLowerCase() === String(username).toLowerCase());
    if (added) {
      if (payload.name !== undefined) added.name = String(payload.name).trim();
      if (payload.role !== undefined) added.role = payload.role;
      if (payload.email !== undefined) added.email = String(payload.email).trim();
      if (payload.password) added.password = String(payload.password).trim();
    } else if (builtin) {
      if (!store.userOverrides) store.userOverrides = {};
      const ov = store.userOverrides[builtin.username] || {};
      if (payload.name !== undefined) ov.name = String(payload.name).trim();
      if (payload.role !== undefined) ov.role = payload.role;
      if (payload.email !== undefined) ov.email = String(payload.email).trim();
      if (payload.password) ov.password = String(payload.password).trim();
      store.userOverrides[builtin.username] = ov;
    } else {
      return { status: "error", message: "ไม่พบผู้ใช้" };
    }
    persist();
    return { status: "success", message: "แก้ไขผู้ใช้เรียบร้อย" };
  };

  API.getMasterDataExtended = () => ({
    items: SEED.items.concat(store.npdProducts || []).map(i => Object.assign({}, i)),
    branches: SEED.branches.map(b => ({
      id: b.id, name: b.name, nameTH: b.nameTH, type: b.type, group: b.group, class: b.class,
    })),
  });

  /* Price Management linkage — per-product promo start/end derived straight from the
   * single-source month rows (item-grain). For a product code, returns the governing
   * promo window per branch (specific-store promo wins over an ALL-store promo; within
   * a scope a non-cancelled / latest-end row wins). Item Set / coupon / new-product
   * submissions all flow into store.months, so this auto-reflects MKT extend/reduce/
   * cancel without any extra wiring. */
  API.getProductPromoDates = (itemCode) => {
    const code = String(itemCode || "").trim();
    if (!code) return { all: null, byStore: {} };
    const prod = (SEED.items || []).find(i => String(i.itemCode).trim() === code) || {};
    const prodCat = String(prod.cateCode || prod.catCode || "").trim();
    // how specifically does a promo row target THIS product? higher = wins.
    //   3 = exact item code · 2 = its category · 1 = all-items / blank · 0 = no match
    const rank = (r) => {
      const ric = String(r.itemCode || "").trim();
      const rcs = String(r.codeItemSet || "").trim();
      if (ric === code || (rcs && rcs === code)) return 3;   // exact item code OR item-set code (107)
      if (prodCat && String(r.catCode || "").trim() === prodCat) return 2;
      if (ric === "" || /^all items$/i.test(ric)) return 1;
      return 0;
    };
    let allRec = null; const byStore = {};
    const better = (cur, rk, end, cancelled) => {
      if (!cur) return true;
      if (rk !== cur.rank) return rk > cur.rank;          // more specific match wins
      if (cur.cancelled !== cancelled) return cur.cancelled && !cancelled;
      return String(end || "") > String(cur.end || "");
    };
    Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => {
      const rk = rank(r); if (!rk) return;
      const cancelled = String(r.changeStatus || "").toUpperCase() === "CANCELLED";
      const rec = { start: r.start || "", end: r.end || "", status: String(r.changeStatus || "").toUpperCase(), campaign: r.campaign || "", cancelled, rank: rk };
      const ids = expandStoreIds(r.stores); // null = ALL stores
      if (ids === null) { if (better(allRec, rk, rec.end, cancelled)) allRec = rec; }
      else ids.forEach(id => { if (better(byStore[id], rk, rec.end, cancelled)) byStore[id] = rec; });
    }));
    // IT bill-close extension (โปรหลุด → IT ต่ออายุ) overrides the per-branch end date so the
    // Products Price table shows the new วันสิ้นสุด that IT granted.
    const bcc = loadBillClose()[code] || {};
    Object.keys(bcc).forEach(bid => {
      const e = bcc[bid]; if (!e) return;
      const cur = byStore[bid] || allRec;
      if (!cur || String(e) > String(cur.end || "")) {
        byStore[bid] = { start: (cur && cur.start) || "", end: String(e), status: "IT-EXTEND", campaign: (cur && cur.campaign) || "IT ต่ออายุ (โปรหลุด)", cancelled: false, rank: 4 };
      }
    });
    return { all: allRec, byStore };
  };

  /* Product lifecycle status derived from the start/end window that Item Set / NPD /
   * powder forms write into the month rows. Active = today within [start,end] and not
   * cancelled. Returns a map itemCode -> {start,end,cancelled,active} (exact-item only). */
  API.getProductStatusMap = () => {
    const t = new Date();
    const today = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
    const map = {};
    Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => {
      const code = String(r.itemCode || "").trim();
      if (!code || /^all items$/i.test(code)) return;
      const cancelled = String(r.changeStatus || "").toUpperCase() === "CANCELLED";
      const rec = { start: r.start || "", end: r.end || "", cancelled };
      const cur = map[code];
      if (!cur || (cur.cancelled && !cancelled) || (cur.cancelled === cancelled && String(rec.end) > String(cur.end))) map[code] = rec;
    }));
    Object.keys(map).forEach(code => { const w = map[code]; w.active = !w.cancelled && (!w.start || w.start <= today) && (!w.end || w.end >= today); });
    /* FX-P74 — สินค้าที่เกิดจากงาน NPD/ผง ต้องใช้ช่วงเวลาของงานตัวเอง
       (เดิมคิดจากแถวโปรเท่านั้น → โปรเก่าที่หมดอายุแล้ว หรือโปรของสินค้าตัวเก่าที่ใช้รหัสซ้ำ ดึงสินค้าใหม่เป็น Inactive) */
    const stampWin = (code, st, en, src) => {
      code = String(code || "").trim(); if (!code) return;
      if (!st && !en) { delete map[code]; return; }   /* ไม่มีช่วงเวลา → ใช้สถานะจากข้อมูลหลัก */
      map[code] = { start: st || "", end: en || "", cancelled: false, src: src,
        active: (!st || st <= today) && (!en || en >= today) };
    };
    (store.npd || []).forEach(n => {
      if (String(n.itStatus || "").toUpperCase() !== "COMPLETE") return;
      (n.items || []).forEach(it => {
        const code = String(it.code || "").trim(); if (!code) return;
        const pr = (store.npdProducts || []).find(p => String(p.itemCode) === code);
        stampWin(code, (pr && pr.fromDate) || n.itDoneDate || n.submittedDate || "", (pr && pr.toDate) || MASTER_NO_END, "npd:" + n.id);
      });
    });
    (store.flavor || []).forEach(n => {
      if (String(n.itStatus || "").toUpperCase() !== "COMPLETE") return;
      (n.groups || []).forEach(g => (g.flavors || []).forEach(f => {
        const code = String(f.cmpos || f.code || "").trim(); if (!code) return;
        const pr = (store.npdProducts || []).find(p => String(p.itemCode) === code);
        stampWin(code, (pr && pr.fromDate) || n.itDoneDate || n.submittedDate || "", (pr && pr.toDate) || MASTER_NO_END, "flv:" + n.id);
      }));
    });
    // IT manual "bill-close until" override (Price page End date OR auto promo-drop extend)
    // keeps a product Active until that date even if the promo expired/was cancelled.
    const bc = loadBillClose();
    Object.keys(bc).forEach(code => {
      const br = bc[code] || {}; let maxEnd = "";
      Object.keys(br).forEach(bid => { const e = br[bid]; if (e && e > maxEnd) maxEnd = e; });
      if (!maxEnd) return;
      const w = map[code] || (map[code] = { start: "", end: maxEnd, cancelled: false });
      if (maxEnd > String(w.end || "")) w.end = maxEnd;
      w.active = maxEnd >= today ? true : w.active;
      w.itOverride = true;
    });
    return map;
  };

  /* IT manual bill-close override per product+branch (from the Price page End date field).
   * endDate = "" clears it. Branch View / POS read store.billClose to keep the promo button
   * live so the branch can finish settling bills up to this date. */
  /* IT bill-close override per product+branch — shared localStorage key so the IT Ticket
   * Queue page (separate iframe doc) can write it too. {itemCode:{branchId:'YYYY-MM-DD'}} */
  function loadBillClose() { try { return JSON.parse(localStorage.getItem("pc_bill_close")) || {}; } catch (e) { return {}; } }
  function saveBillClose(m) { try { localStorage.setItem("pc_bill_close", JSON.stringify(m)); } catch (e) {} }
  // Promo-drop auto-extend settings (configurable). days = how long IT re-opens the button;
  // countWeekend=true counts Sat/Sun, false = working days only.
  function loadPromoDropSettings() { try { return Object.assign({ days: 3, countWeekend: true }, JSON.parse(localStorage.getItem("pc_promo_drop_settings")) || {}); } catch (e) { return { days: 3, countWeekend: true }; } }
  function addDaysFrom(dateStr, days, countWeekend) {
    const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    let added = 0;
    while (added < days) { d.setDate(d.getDate() + 1); const dow = d.getDay(); if (countWeekend || (dow !== 0 && dow !== 6)) added++; }
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  API.getPromoDropSettings = () => loadPromoDropSettings();
  API.savePromoDropSettings = (s) => { const cur = loadPromoDropSettings(); const next = Object.assign(cur, s || {}); try { localStorage.setItem("pc_promo_drop_settings", JSON.stringify(next)); } catch (e) {} return next; };
  API.setBillCloseEnd = (itemCode, branchId, endDate) => {
    const code = String(itemCode || "").trim(), bid = String(branchId || "").trim();
    if (!code || !bid) return { status: "error" };
    const bc = loadBillClose();
    bc[code] = bc[code] || {};
    if (endDate) bc[code][bid] = String(endDate);
    else { delete bc[code][bid]; if (!Object.keys(bc[code]).length) delete bc[code]; }
    saveBillClose(bc);
    return { status: "success" };
  };
  API.getBillClose = (itemCode) => {
    const bc = loadBillClose();
    if (itemCode) return bc[String(itemCode).trim()] || {};
    return bc;
  };
  /* Auto-extend on IT resolving a "โปรหลุด" ticket: re-open the item for the branch for N days
   * (from settings) so they can settle bills. Returns the granted end date. */
  API.resolvePromoDrop = (itemCode, branchId, fromDate) => {
    const s = loadPromoDropSettings();
    const endDate = addDaysFrom(fromDate || "", Number(s.days) || 3, s.countWeekend !== false);
    API.setBillCloseEnd(itemCode, branchId, endDate);
    return { status: "success", endDate, days: Number(s.days) || 3, countWeekend: s.countWeekend !== false };
  };

  API.getNextPromoCode = (offset) => {
    // Delegate to the central counter when present (single forward-only source). Falls back below.
    if (window.PC_COUNTER && PC_COUNTER.peekNumeric) {
      try { const v = PC_COUNTER.peekNumeric("itemset", (typeof offset === "number" ? offset : 0)); if (v) return v; } catch (e) {}
    }
    const START = 1070001;
    const off = (typeof offset === "number" && offset < 100000) ? offset : 0;
    const codes = store.working.map(r => parseInt(r.codeItemSet, 10))
      .filter(n => !isNaN(n) && String(n).startsWith("107"));
    if (!codes.length) return String(START + off);
    return String(Math.max.apply(null, codes) + 1 + off);
  };

  /* ==========================================================================
   *  CENTRAL CODE GUARD  (single source for duplicate + "low number" detection)
   *  type: "itemset" | "promo" | "npd" | "item"
   *   - block real duplicates (code already exists anywhere in the web system)
   *   - warn when a purely-numeric code is <= the highest number the system knows
   *     (baseline) → it is likely already issued in the real Backoffice
   *  checkCode(type, code, ignore?) — ignore = a "where" (campaign) to skip (self-edit)
   * ========================================================================== */
  function cgClean(v) { return String(v == null ? "" : v).trim(); }
  /* FX-P69 — คำที่ไม่ใช่เลขโค้ด (ช่องเก่าเคยเก็บช่องทาง Normal/Online ลงช่อง Code Promotion)
     ต้องไม่นับเป็นโค้ด — ไม่งั้นทุกใบที่เขียนว่า Normal จะเตือน "โค้ดซ้ำ" กันเอง */
  function cgPlaceholder(v) { return /^(ALL ITEMS|NORMAL|ONLINE|OFFLINE|N\/A|NA|-|—)$/i.test(cgClean(v)); }
  var CODE_SOURCES = [];
  function cgKnownCodes(type) {
    type = String(type || "").toLowerCase();
    const out = [];
    const push = (code, where) => {
      code = cgClean(code);
      if (!code || cgPlaceholder(code)) return;
      out.push({ code: code, where: cgClean(where) });
    };
    // → โค้ดที่ "จองไว้ในระบบ" (ตัวนับกลาง PC_COUNTER) — กันกรอกเลขที่ถูกจอง/ยืนยันที่อื่น
    const cgPushCounter = (t, p) => { try { if (window.PC_COUNTER && PC_COUNTER.list) PC_COUNTER.list({ type: t }).forEach(e => { if (e.status !== "RELEASED") p(e.code, e.where || "จองในระบบ"); }); } catch (x) {} };
    // → ตารางสินค้า (pc_product_promo) — โค้ดที่วิ่งเข้าหน้าสินค้าแล้ว
    const cgPushProductPromo = (re, p) => { try { var pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}"); Object.keys(pp).forEach(ic => { var arr = pp[ic]; (Array.isArray(arr) ? arr : [arr]).forEach(r => { if (!r) return; [r.prCode, r.code, r.promoCode, r.codePromotion].forEach(c => { if (c && re.test(String(c).trim())) p(c, "ตารางสินค้า · " + ic); }); }); }); } catch (x) {} };
    if (type === "itemset") {
      store.working.forEach(w => push(w.codeItemSet, w.campaign));
      Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => push(r.codeItemSet, r.campaign)));
      // real Promotion-Set codes already issued (category 107) live in the item master
      (SEED.items || []).forEach(it => { var c = String(it.itemCode == null ? "" : it.itemCode).trim(); if (c.indexOf("107") === 0) push(c, it.category || "Item Master"); });
      cgPushCounter("itemset", push); cgPushProductPromo(/^107\d+$/, push);
    } else if (type === "promo") {
      store.working.forEach(w => push(w.codePromotion, w.campaign));
      Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => push(r.codePromotion, r.campaign)));
      cgPushCounter("promo", push); cgPushProductPromo(/^P\d+$/i, push);
    } else if (type === "cmpos") { // category / CMPOS codes
      (SEED.items || []).forEach(i => push(i.catCode || i.cateCode, "Item Master"));
      store.working.forEach(w => push(w.catCode, w.campaign));
      (store.npd || []).forEach(n => { push(n.cateCode, n.id || "NPD"); (n.subsets || []).forEach(su => (su.powders || []).forEach(p => push(p.cmpos, n.id || "NPD"))); });
    } else if (type === "ss") { // subset (SS) codes
      (window.PC_SUBSET_MASTER || []).forEach(su => push(su.ssCode || su.code, "Subset Master"));
      (store.npd || []).forEach(n => (n.subsets || []).forEach(su => push(su.ssCode, n.id || "NPD")));
    } else if (type === "bill" || type === "coupon" || type === "voucher") {
      // Bill Discount (BD) / Item Coupon (IC) / Voucher (VC) — สแกนจากตารางโปร (working+months) + Backoffice list
      var _pre = type === "bill" ? "BD" : (type === "coupon" ? "IC" : "VC");
      var _reP = new RegExp('^' + _pre, 'i');
      var _pushPre = function (code, where) { if (_reP.test(cgClean(code))) push(code, where); };
      store.working.forEach(w => _pushPre(w.codePromotion, w.campaign));
      Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => _pushPre(r.codePromotion, r.campaign)));
      (window.PC_PROMO_CODES || []).forEach(c => { _pushPre(c.button, "Backoffice"); _pushPre(c.code, "Backoffice"); });
      if (type === "bill") (window.PC_BILL_DISCOUNT_CONFIRMED || []).forEach(b => _pushPre(b.code, "Bill Discount Confirmed"));
      cgPushCounter(type, push);
    } else { // "item" / "npd" — product/item codes
      (SEED.items || []).forEach(i => push(i.itemCode, "Item Master"));
      store.working.forEach(w => push(w.itemCode, w.campaign));
      (store.npd || []).forEach(n => (n.items || []).forEach(it => push(it.code, n.id || "NPD")));
    }
    // → แหล่งโค้ดที่ลงทะเบียนเพิ่ม (ตารางผูกบัตร/ส่วนลดพนักงาน/อื่นๆ) — เพิ่มตารางใหม่ได้โดยไม่ต้องแก้ฟังก์ชันนี้
    CODE_SOURCES.forEach(function (fn) { try { (fn(type) || []).forEach(function (x) { if (x && x.code) push(x.code, x.where || "ตารางผูกโค้ด"); }); } catch (e) {} });
    return out;
  }
  /* ===== extensible code sources (ตารางแยกที่ IT ใช้ผูกโค้ดนอกโปร) =====
   * หน้าผูกใหม่ → เรียก PC_API.registerCodeSource(function(type){ return [{code, where}] })
   * แล้ว dup-check จะเห็นโค้ดจากตารางนั้นทันที โดยไม่ต้องแก้ cgKnownCodes อีก */
  API.registerCodeSource = function (fn) { if (typeof fn === "function" && CODE_SOURCES.indexOf(fn) < 0) CODE_SOURCES.push(fn); };
  // built-in: ตารางแยกที่มีอยู่แล้ว (ผูกบัตรสมาชิก/ส่วนลดพนักงาน/คำขอโค้ด) — สแกนหาโค้ดแบบ generic
  (function () {
    function scanTable(key, whereLabel, out) {
      try {
        var raw = JSON.parse(localStorage.getItem(key) || "null"); if (!raw) return;
        /* FX-P90 — คลายช่วงโค้ดที่ถูกบีบก่อนสแกน */
        if (key === "pc_code_requests" && window.PC_CodePack) { try { raw = PC_CodePack.loadReqs(); } catch (e) {} }
        var recs = [];
        if (Array.isArray(raw)) raw.forEach(function (r) { recs.push({ r: r, k: "" }); });
        else Object.keys(raw).forEach(function (k) { var v = raw[k]; if (Array.isArray(v)) v.forEach(function (r) { recs.push({ r: r, k: k }); }); else recs.push({ r: v, k: k }); });
        recs.forEach(function (item) {
          var r = item.r, sub = item.k ? (whereLabel + " · " + item.k) : whereLabel;
          if (!r || typeof r !== "object") return;
          Object.keys(r).forEach(function (f) { var v = r[f]; if (typeof v === "string" && (/^(P|IC|BD|VC|SS)\d/i.test(v.trim()) || /^107\d/.test(v.trim()))) out.push({ code: v.trim(), where: sub }); });
        });
      } catch (e) {}
    }
    API.registerCodeSource(function () {
      var out = [];
      scanTable("pc_member_coupons", "ผูกบัตรสมาชิก", out);
      scanTable("pc_staff_discounts", "ส่วนลดพนักงาน", out);
      scanTable("pc_code_requests", "คำขอโค้ด (IT)", out);
      return out;
    });
  })();
  function cgBaseline(type) {
    const nums = cgKnownCodes(type)
      .map(x => x.code).filter(c => /^\d+$/.test(c)).map(c => parseInt(c, 10));
    if (String(type).toLowerCase() === "itemset") {
      store.working.forEach(r => {
        const n = parseInt(r.codeItemSet, 10); if (!isNaN(n) && String(n).startsWith("107")) nums.push(n);
        // ⭐ absorb builderCode ด้วย (แคมเปญ Price Promotion เก็บเลข 107xxxx ไว้ใน builderCode ไม่ใช่ codeItemSet) กัน counter แจกซ้ำ
        const bc = parseInt(r.builderCode, 10); if (!isNaN(bc) && /^10[5-9]/.test(String(bc))) nums.push(bc);
      });
    }
    if (String(type).toLowerCase() === "ss") {
      // SS code มี prefix "SS" (เช่น SS0167) — ตัด prefix แล้วเอาเลขมาหา max กันออกเลขชนของเดิม
      cgKnownCodes("ss").forEach(x => { const m = String(x.code || "").match(/^SS0*(\d+)$/i); if (m) nums.push(parseInt(m[1], 10)); });
    }
    if (String(type).toLowerCase() === "promo") {
      // Code Promotion = P+เลข (เช่น P3404) — ตัด prefix "P" แล้วหา max กัน autorun ชนของเดิม
      cgKnownCodes("promo").forEach(x => { const m = String(x.code || "").match(/^P0*(\d+)$/i); if (m) nums.push(parseInt(m[1], 10)); });
    }
    if (["bill", "coupon", "voucher"].indexOf(String(type).toLowerCase()) !== -1) {
      // BD/IC/VC — ตัด prefix แล้วเอาเลขมาหา max (กัน baseline ต่ำ/ชนของเดิม)
      var _preB = type === "bill" ? "BD" : (type === "coupon" ? "IC" : "VC");
      var _reB = new RegExp('^' + _preB + '0*(\\d+)$', 'i');
      cgKnownCodes(type).forEach(x => { const m = _reB.exec(String(x.code || "")); if (m) nums.push(parseInt(m[1], 10)); });
    }
    return nums.length ? Math.max.apply(null, nums) : 0;
  }
  function promoPrefix(prefix) {
    let max = 0;
    const re = new RegExp('^' + prefix + '0*(\\d+)$', 'i');
    const scan = (s) => { const m = re.exec(String(s == null ? '' : s).trim()); if (m) max = Math.max(max, +m[1]); };
    (window.PC_PROMO_CODES || []).forEach(function(c) { scan(c.button); scan(c.code); });
    // โค้ด Bill Discount Confirmed (seed list) — BD ที่ผ่าน workflow แล้ว (เช่น BD167) → baseline ต้องรู้จัก
    if (/^BD$/i.test(prefix)) (window.PC_BILL_DISCOUNT_CONFIRMED || []).forEach(function(b){ scan(b.code); });
    // โค้ดที่ "ใช้งานจริง" ในตาราง (store.months) — กันออกเลขชนกับโค้ดที่ inject/ขยายเข้ามาแล้ว
    Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => scan(r.codePromotion)));
    return max;
  }
  API.getCodeBaselines = () => ({
    itemset: cgBaseline("itemset"), promo: cgBaseline("promo"),
    item: cgBaseline("item"), npd: cgBaseline("item"),
    cmpos: cgBaseline("cmpos"), ss: cgBaseline("ss"),
    bill: promoPrefix("BD"), coupon: promoPrefix("IC"), voucher: promoPrefix("VC"),
  });
  /* getInUseCodes — โค้ดทุกตัวที่ "งานจริง" ในระบบยังอ้างถึง (campaigns + NPD + Flavor +
   * member coupons). ใช้คู่กับ PC_COUNTER.returnOrphans() เพื่อคืนเฉพาะโค้ด RESERVED ที่
   * ไม่มีงานอ้างถึงแล้ว (งานถูกลบ / ฟอร์มถูกทิ้ง) — ไม่แตะโค้ดที่ยังผูกกับงาน */
  API.getInUseCodes = () => {
    const set = {};
    const add = (c) => { c = String(c == null ? "" : c).trim(); if (c) set[c.toUpperCase()] = c; };
    // campaigns — promo / item set codes (จาก month rows = single source)
    Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(r => {
      add(r.codePromotion); add(r.codeItemSet); add(r.itemPromotion); add(r.itemCode);
    }));
    (store.working || []).forEach(w => { add(w.codePromotion); add(w.codeItemSet); });
    // NPD — subset (SS/CMPOS) + powder (CMPOS/item code) + product item code
    (store.npd || []).forEach(n => {
      (n.subsets || []).forEach(ss => {
        add(ss.ssCode); add(ss.cmpos);
        (ss.powders || []).forEach(p => { add(p.cmpos); add(p.code); });
      });
      (n.items || []).forEach(it => { add(it.code); add(it.itemCode); });
    });
    // Flavor — subset + powder codes
    (store.flavor || []).forEach(f => {
      add(f.ssCode); add(f.cmpos); add(f.code);
      (f.powders || f.flavors || []).forEach(p => { add(p.cmpos); add(p.code); });
    });
    // product master rows (NPD/flavor → products) item codes
    (store.npdProducts || []).forEach(p => add(p.itemCode));
    // member coupons (Backoffice refs)
    try {
      const mc = JSON.parse(localStorage.getItem("pc_member_coupons") || "{}") || {};
      Object.keys(mc).forEach(k => (mc[k] || []).forEach(x => add(x.code)));
    } catch (e) {}
    /* ── งานที่ "วิ่งเข้า IT / ตารางปลายทาง" แล้ว → ถือว่ายังใช้งาน ห้ามคืนโค้ด ──
     * (ผู้ใช้กำหนด: ปล่อยโค้ดเฉพาะฟอร์มที่กรอกแล้วหลุด/ไม่บันทึก · ถ้าถึงหน้า IT แล้วไม่ปล่อย)
     * สแกนตารางปลายทางแบบ generic หา string ที่หน้าตาเป็นโค้ด (P/IC/BD/VC/SS + item-set cate 105-109) */
    const CODE_RE = /^(?:P|IC|BD|VC|SS)\d|^10[5-9]\d/i;
    const scanForCodes = (key) => {
      try {
        let raw = JSON.parse(localStorage.getItem(key) || "null"); if (!raw) return;
        /* FX-P90 — คำขอโค้ดถูกบีบเป็นช่วง (codeSeq) → คลายก่อนสแกน ไม่งั้นมองไม่เห็นโค้ดในช่วง */
        if (key === "pc_code_requests" && window.PC_CodePack) { try { raw = PC_CodePack.loadReqs(); } catch (e) {} }
        const walk = (v) => {
          if (v == null) return;
          if (typeof v === "string") { const s = v.trim(); if (CODE_RE.test(s)) add(s); return; }
          if (Array.isArray(v)) { v.forEach(walk); return; }
          if (typeof v === "object") { Object.keys(v).forEach(kk => { if (CODE_RE.test(kk)) add(kk); walk(v[kk]); }); }
        };
        walk(raw);
      } catch (e) {}
    };
    scanForCodes("pc_code_requests");   // คำขอโค้ด / ไฟล์แนบ ที่ส่งเข้า IT แล้ว
    scanForCodes("pc_product_promo");   // โค้ดที่วิ่งเข้าตารางสินค้าแล้ว (prCode)
    scanForCodes("pc_itemset_comp");    // Item Set Builder (subset/รายการที่ผูกแล้ว)
    scanForCodes("pc_staff_discounts"); // ส่วนลดพนักงานที่ผูกโค้ดแล้ว
    return Object.keys(set).map(k => set[k]);
  };
  /* Per-category running baselines: { cateCode: maxSequence } where sequence =
   * the part of itemCode after its cateCode prefix. Used by the central counter
   * to issue the next item code WITHIN a category (cateCode + running). */
  API.getCatBaselines = () => {
    const out = {};
    const take = (cc, code) => {
      cc = String(cc == null ? "" : cc).trim();
      code = String(code == null ? "" : code).trim();
      /* FX-P77 — ไม่มี cateCode → เดาจาก 3 หลักหน้าของรหัส (กันตัวนับมองข้ามแล้วแจกเลขซ้ำ) */
      if (!cc && /^\d{6,}$/.test(code)) cc = code.slice(0, 3);
      if (!cc || !code || code.indexOf(cc) !== 0) return;
      const rest = code.slice(cc.length);
      if (!/^\d+$/.test(rest)) return;
      const seq = parseInt(rest, 10);
      if (!(cc in out) || seq > out[cc]) out[cc] = seq;
    };
    (SEED.items || []).concat(store.npdProducts || []).forEach(it => take(it.cateCode, it.itemCode));
    /* งานที่ยังไม่ขึ้นปุ่ม (NPD/ผง รอ IT) ก็ต้องนับเลขด้วย — ไม่งั้นงานใหม่จะได้เลขซ้ำ */
    (store.npd || []).forEach(n => (n.items || []).forEach(it => take(it.cateCode || n.cateCode, it.code)));
    (store.flavor || []).forEach(n => (n.groups || []).forEach(g => (g.flavors || []).forEach(f => take("", f.cmpos))));
    /* FX-P82 — เลข Code Item Set ที่ลงในแถวงานแล้ว (105/106/109 ต่อหมวด) ก็ต้องนับด้วย
       เดิมนับจากข้อมูลหลักสินค้าเท่านั้น → 109058-109067 ที่ใช้จริงในแถวงานถูกมองว่าว่าง แล้วแจกซ้ำ */
    const takeRow = (r) => {
      [r && r.codeItemSet, r && r.itemPromo, r && r.builderCode].forEach(v => {
        const c = String(v == null ? "" : v).trim();
        if (/^(105|106|109)\d{3,}$/.test(c)) take("", c);
      });
    };
    (store.working || []).forEach(takeRow);
    Object.keys(store.months || {}).forEach(m => (store.months[m] || []).forEach(takeRow));
    return out;
  };
  API.checkCode = (type, code, ignore) => {
    type = String(type || "").toLowerCase();
    code = cgClean(code);
    ignore = cgClean(ignore);
    if (!code) return { status: "empty", code: code, type: type };
    if (cgPlaceholder(code)) return { status: "empty", code: code, type: type, message: "ยังไม่ได้กรอกเลขโค้ด (ค่านี้เป็นช่องทางขาย ไม่ใช่เลขโค้ด)" };
    const norm = code.toUpperCase();
    const hit = cgKnownCodes(type).find(x => x.code.toUpperCase() === norm && (!ignore || x.where !== ignore));
    if (hit) return {
      status: "dup", code: code, type: type, where: hit.where,
      message: "โค้ด " + code + " มีอยู่แล้วในระบบ" + (hit.where ? " — " + hit.where : "") + " · ห้ามใช้ซ้ำ",
    };
    // central counter: a code reserved by another job is taken too (avoid two IT users grabbing the same number)
    if (window.PC_COUNTER && PC_COUNTER.reservedHit) {
      const rh = PC_COUNTER.reservedHit(type, code, ignore);
      if (rh) return {
        status: "dup", code: code, type: type, where: rh.where || "จองแล้ว",
        message: "โค้ด " + code + " ถูกจองไว้แล้ว (RESERVED" + (rh.where ? " — " + rh.where : "") + ") · รอ IT ยืนยัน",
      };
    }
    const baseline = cgBaseline(type);
    if (/^\d+$/.test(code) && baseline && parseInt(code, 10) <= baseline) return {
      status: "low", code: code, type: type, baseline: baseline,
      message: "เลขนี้ต่ำกว่าเลขล่าสุดในระบบ (" + baseline + ") — อาจถูกใช้ใน Backoffice/ระบบจริงแล้ว กรุณาตรวจสอบก่อน",
    };
    return { status: "ok", code: code, type: type, baseline: baseline, message: "ใช้ได้ — ไม่พบโค้ดซ้ำในระบบ" };
  };

  /* ---- POS Button Setup: persist Code Item Set + mark button POS-ready ----
     Writes codeItemSet to both the month rows and the working row so IT_Settlement
     (Code Item Set field) reflects it. posReady=true lets IT save & close the work. */
  API.getItemSetButtons = () => {
    return store.working
      .filter(w => String(w.typePromotion || w.promoType || "").toLowerCase().indexOf("item set") !== -1 || w._wasItemSet)
      .map(w => ({
        campaign: w.campaign, shortName: w.shortName, month: w.month,
        start: w.start || "", end: w.end || "",
        codeItemSet: w.codeItemSet || "", kitchen: w.kitchen || "", saleMode: w.saleMode || "",
        cateRemark: w.cateRemark || w.postCate || "",
        branchNote: w.branchNote || "",
        typeSel: w.typeSel || "",
        itStatus: String(w.itStatus || "PENDING").toUpperCase(), opStatus: String(w.opStatus || "WAITING").toUpperCase(), changeStatus: String(w.changeStatus || "").toUpperCase(), posReady: !!w.posReady,
      }));
  };
  API.savePosCampaign = (campaign, codeMap) => {
    // codeMap: { shortName: codeItemSet }  — set all buttons of a campaign at once
    let n = 0;
    const apply = (r) => {
      if (r.campaign === campaign && codeMap[r.shortName]) {
        r.codeItemSet = codeMap[r.shortName]; r.itemPromotion = codeMap[r.shortName]; r.posReady = true; r.updatedDate = NOW(); n++;
      }
    };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n };
  };
  API.savePosButton = (campaign, shortName, codeItemSet) => {
    let n = 0;
    const apply = (r) => {
      if (r.campaign === campaign && r.shortName === shortName) {
        r.codeItemSet = codeItemSet; r.itemPromotion = codeItemSet; r.posReady = true; r.updatedDate = NOW(); n++;
      }
    };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n, codeItemSet };
  };
  // ล้าง Code Item Set ของปุ่ม (คืนสถานะเป็น "ยังไม่ได้รับรหัส") — ไม่แตะเลขจองในตัวนับกลาง
  API.clearPosButtonCode = (campaign, shortName) => {
    let n = 0;
    const apply = (r) => {
      if (r.campaign === campaign && (!shortName || r.shortName === shortName)) {
        r.codeItemSet = ""; r.itemPromotion = ""; r.itemPromoCode = ""; r.posReady = false; r.updatedDate = NOW(); n++;
      }
    };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n };
  };
  // หมายเหตุเด่นหน้าสาขา (branchNote) — IT ใส่ที่หน้าทำปุ่ม → โชว์เป็นป้ายเด่นบนการ์ดสาขา
  API.savePosButtonNote = (campaign, shortName, note) => {
    const nv = String(note == null ? "" : note);
    let n = 0;
    const apply = (r) => { if (r.campaign === campaign && r.shortName === shortName) { r.branchNote = nv; r.updatedDate = NOW(); n++; } };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n };
  };
  // หมายเหตุเด่นระดับแคมเปญ — ป้ายเดียวใช้ทั้งแคมเปญ (ทุกปุ่ม) · เรียกจากหน้า IT Settlement
  API.savePosButtonNoteCampaign = (campaign, note) => {
    const nv = String(note == null ? "" : note);
    let n = 0;
    const apply = (r) => { if (r.campaign === campaign) { r.branchNote = nv; r.updatedDate = NOW(); n++; } };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n };
  };
  // Type Promo ที่ IT/Builder เลือก — เก็บเป็น typeSel (ไม่แตะ promoType/การ render Code Item Set) · เป็น default ของ dropdown ที่ IT Settlement
  API.savePosButtonType = (campaign, shortName, type) => {
    const tv = String(type == null ? "" : type).trim();
    let n = 0;
    const apply = (r) => { if (r.campaign === campaign && r.shortName === shortName) { r.typeSel = tv; r.updatedDate = NOW(); n++; } };
    store.working.forEach(apply);
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    persist();
    return { status: "success", updated: n };
  };

  /* ---- duplicate-name checks (all aliases route here) ---- */
  const allCampaignNames = () =>
    store.working.map(r => String(r.campaign || "").trim().toLowerCase()).filter(Boolean);
  const isDupName = (name) =>
    !!name && allCampaignNames().includes(String(name).replace(/\s+/g, " ").trim().toLowerCase());
  API.checkCampaignDuplicateInSheet = isDupName;
  API.checkCampaignName = isDupName;
  API.checkCampaignNameRealtime = isDupName;
  API.checkDuplicateName = isDupName;
  API.verifyCampaign = isDupName;
  API.checkBillDiscountDuplicateInSheet = isDupName;
  API.getExistingCampaignNames = () =>
    [...new Set(store.working.map(r => String(r.campaign || "").trim()).filter(Boolean))];
  const allShortNames = () =>
    store.working.map(r => String(r.shortName || "").trim().toLowerCase()).filter(Boolean);
  API.checkShortNameDuplicateInSheet = (sn) =>
    !!sn && allShortNames().includes(String(sn).trim().toLowerCase());

  /* ---- item-set button → channel price columns (copy Gross to selected sale-mode channels) ----
     All Channel = ทุกช่อง (รวม Take Away) · All Delivery = ทุก delivery (ไม่รวม Take Away)
     เลือกเจาะจง = เฉพาะช่องที่เลือก · ช่องที่ไม่เลือก = N/A (ว่าง) */
  function itemsetChannelPrices(saleMode, gross) {
    const g = (gross == null || gross === "") ? "" : String(gross);
    const sm = String(saleMode || "").toLowerCase();
    const on = {};
    const DLV = ["grab", "line", "panda", "shopee", "robin", "gokoo"];
    if (sm.indexOf("all channel") >= 0) { ["ta"].concat(DLV).forEach(k => on[k] = 1); }
    else if (sm.indexOf("all delivery") >= 0) { DLV.forEach(k => on[k] = 1); }
    else {
      if (sm.indexOf("take away") >= 0 || sm.indexOf("takeaway") >= 0) on.ta = 1;
      if (sm.indexOf("grab") >= 0) on.grab = 1;
      if (sm.indexOf("lineman") >= 0 || sm.indexOf("line man") >= 0) on.line = 1;
      if (sm.indexOf("shopee") >= 0) on.shopee = 1;
      if (sm.indexOf("robinhood") >= 0) on.robin = 1;
      if (sm.indexOf("gokoo") >= 0) on.gokoo = 1;
      // foodpanda ไม่มีในฟอร์ม → ไม่เติม
    }
    const anyDlv = DLV.some(k => on[k]);
    return {
      priceTA: on.ta ? g : "", priceDLV: anyDlv ? g : "",
      priceGrab: on.grab ? g : "", priceLineman: on.line ? g : "", pricePanda: on.panda ? g : "",
      priceShopee: on.shopee ? g : "", priceRobinhood: on.robin ? g : "", priceGokoo: on.gokoo ? g : "",
    };
  }

  /* หา cate จริงจากชื่อหมวด (bound มาจากฟอร์ม) → คืน {cateCode, category, department, depCode}
     match แบบ case-insensitive/trim กับ item master (เช่นฟอร์มส่ง "Promotion set" ↔ master "Promotion Set" = 107,
     "Specialty Fries" = 102). ไม่เจอ → คงชื่อเดิม cateCode ว่าง เพื่อไม่ให้ตกไปหมวดผิด */
  function resolveCateByName(name) {
    var want = String(name == null ? "" : name).trim().toLowerCase();
    if (!want) return null;
    var list = SEED.items || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var cn = String(it.category == null ? "" : it.category).trim();
      if (cn.toLowerCase() !== want) continue;
      var cc = String(it.cateCode == null ? (it.catCode == null ? "" : it.catCode) : it.cateCode).trim();
      return {
        category: cn, cateCode: cc,
        department: it.department || "Food", depCode: String(it.depCode == null ? "100" : it.depCode).trim() || "100",
      };
    }
    return null;
  }

  /* item-set button → product master row (Name EN=kitchen, Name TH=shortName, Gross, cate, Size=cate,
     Dept=Food, ชั่วคราว, ราคารายช่องทาง = Gross ก๊อปลงช่องที่ขาย). แถวเดียวต่อปุ่ม */
  /* ---- ตัวย่อที่เปลี่ยนไปแล้ว (store.abbrMap) ----
     ตัวย่อที่ IT อนุมัติให้เปลี่ยนแล้ว ต้องมีผลกับ "ของที่จะเกิดขึ้นทีหลัง" ด้วย —
     แถวโปรที่ยังรอ IT/OP จะถูกเขียนลงตารางข้อมูลหลักสินค้าเมื่อ IT กดบันทึก
     ถ้าไม่กรองผ่านแผนที่นี้ ชื่อสินค้าใหม่จะกลับไปใช้ตัวย่อเดิม (เปลี่ยนแล้วเหมือนไม่ได้เปลี่ยน) */
  const ABBR_SP = "SBLJMGT";
  const abbrRx = (o) => new RegExp("(^|[^A-Za-z0-9])([" + ABBR_SP + "]?)(" + String(o).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z0-9])", "gi");
  function abbrFix(text) {
    let s = String(text == null ? "" : text);
    if (!s) return s;
    (store.abbrMap || []).forEach(m => {
      if (!m || !m.old || !m.new) return;
      s = s.replace(abbrRx(m.old), (x, pre, size) => pre + size + m.new);
    });
    return s;
  }
  API.abbrMap = () => (store.abbrMap || []).slice();
  /* \u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e17\u0e35\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e19\u0e2d\u0e01\u0e08\u0e32\u0e01 item-master (IT \u0e01\u0e14\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01 / NPD / \u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1c\u0e07) \u2014 \u0e43\u0e0a\u0e49\u0e19\u0e31\u0e1a\u0e1c\u0e25\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e40\u0e27\u0e25\u0e32\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d */
  API.getNpdProducts = () => (store.npdProducts || []).map(p => ({ itemCode: p.itemCode, itemNameEN: p.itemNameEN, itemNameTH: p.itemNameTH, status: p.status, itemType: p.itemType, category: p.category }));

  /* แถวโปรทุกประเภทที่ IT บันทึก → ตารางข้อมูลหลักสินค้า (ไม่ใช่แค่ Item Set)
     เพื่อให้ของที่ IT ตั้งค่าแล้วมีตัวตนในข้อมูลหลักทันที (ค้นหา/เปลี่ยนตัวย่อ/รายงาน เห็นครบ) */
  function promoToProducts(info, code, kind) {
    if (!code) return 0;
    store.npdProducts = store.npdProducts || [];
    const cate = info.postCate || info.cateRemark || "Promotion";
    const _rc = resolveCateByName(cate);
    const k = String(kind || "").toLowerCase();
    const bind = k.indexOf("coupon") >= 0 ? "Item Coupon" : k.indexOf("voucher") >= 0 ? "Voucher"
      : k.indexOf("bill") >= 0 ? "Bill Discount" : "Price Promotion";
    const row = {
      itemCode: String(code),
      itemNameEN: abbrFix(info.kitchenName || info.shortName || ""),
      itemNameTH: abbrFix(info.shortName || ""),
      category: (_rc ? _rc.category : cate), cateCode: (_rc ? _rc.cateCode : ""),
      department: (_rc ? _rc.department : "Food"), depCode: (_rc ? _rc.depCode : "100"),
      itemType: kind || "Promotion", size: cate,
      gross: (info.gross == null ? "" : String(info.gross)),
      promoBind: bind, status: "Active", core: "ขายชั่วคราว", showInForm: "Hide",
      sellStores: info.storeSelection || "ALL",
      fromDate: info.start || "", toDate: info.end || "",
      postCate: cate, _fromPromo: (info.campaign || "") + "|" + (info.shortName || ""),
    };
    const i = store.npdProducts.findIndex(p => String(p.itemCode) === String(code));
    if (i >= 0) store.npdProducts[i] = Object.assign({}, store.npdProducts[i], row);
    else store.npdProducts.push(row);
    return 1;
  }

  function itemsetToProducts(info, code, totalGross, items) {
    if (!code) return;
    store.npdProducts = store.npdProducts || [];
    const cate = info.postCate || "Promotion set";
    const promoBind = (cate === "E-Voucher") ? "Item Coupon Online" : "Price Promotion";
    // ⭐ บันทึกตาม cate ที่ผูกมาจากฟอร์ม — resolve cateCode จริงจากชื่อหมวด (กันงาน 107 ตกไปหมวดผิด/หาย)
    const _rc = resolveCateByName(cate);
    const px = itemsetChannelPrices(info.saleMode, totalGross);
    const row = Object.assign({
      itemCode: String(code),
      itemNameEN: abbrFix(info.kitchenName || info.shortName || ""),
      itemNameTH: abbrFix(info.shortName || ""),
      category: (_rc ? _rc.category : cate), cateCode: (_rc ? _rc.cateCode : ""),
      department: (_rc ? _rc.department : "Food"), depCode: (_rc ? _rc.depCode : "100"),
      itemType: "Item Set", size: cate,
      gross: (totalGross == null ? "" : String(totalGross)),
      promoBind: promoBind,
      status: "Active", core: "ขายชั่วคราว", showInForm: "Hide",
      sellStores: info.storeSelection || "ALL",
      fromDate: info.start || "", toDate: info.end || "",
      postCate: cate, _fromItemSet: (info.campaign || "") + "|" + (info.shortName || ""),
    }, px);
    const i = store.npdProducts.findIndex(p => String(p.itemCode) === String(code));
    if (i >= 0) store.npdProducts[i] = Object.assign({}, store.npdProducts[i], row);
    else store.npdProducts.push(row);
    // เติมตาราง Price Promotion (pc_product_promo) — Type + Code Promotion + Net (ผูกกับโปในหน้าสินค้า) · เติมเฉพาะตอนว่าง/เคย auto — ไม่ทับที่ user แก้เอง
    try {
      var pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}"); if (!pp || typeof pp !== "object") pp = {};
      var typeP = (cate === "E-Voucher") ? "E-Voucher" : "Price Promotion";
      var prow = { typePromo: typeP, prCode: info.codePromotion || "", net: (info.netPrice == null ? "" : String(info.netPrice)), desc1: info.shortName || "", desc2: "", _fromItemSet: true };
      // 1 item (107) = แถวสินค้าเดียว · หลายแคมเปญยืมรหัส = append หลาย row Code Promotion (ดึง manual ไว้) · dedupe ตาม prCode
      var arr = Array.isArray(pp[String(code)]) ? pp[String(code)] : [];
      arr = arr.filter(function (r) { return !(r && r._fromItemSet && String(r.prCode || "") === String(prow.prCode || "")); });
      arr.push(prow);
      pp[String(code)] = arr;
      localStorage.setItem("pc_product_promo", JSON.stringify(pp));
    } catch (e) {}
    itemsetLinkSubsetComp(code, items, (info.campaign || "") + "|" + (info.shortName || ""));
  }

  /* Item Set components → Edit Product "Subset & Item List" (pc_itemset_comp)
     subset แถว (isSubset='Y' / รหัส SS) → min/max จาก chooseMin/Max · item ปกติ → min=max=qty
     seed เฉพาะตอนว่าง/เคย auto-seed — ไม่ทับที่ user แก้เอง */
  function itemsetLinkSubsetComp(code, items, tag) {
    try {
      if (!Array.isArray(items) || !items.length) return;
      var rows = [];
      items.forEach(function (it) {
        var c = String(it.itemCode || "").trim(); if (!c) return;
        if (rows.some(function (r) { return r.code === c; })) return;
        if (it.isSubset === "Y" || /^SS/i.test(c)) {
          var mn = parseInt(it.chooseMin, 10); if (!mn || mn < 1) mn = 1;
          var mx = parseInt(it.chooseMax, 10); if (!mx || mx < mn) mx = mn;
          rows.push({ code: c, min: mn, max: mx, _itemset: tag });
        } else {
          var q = parseInt(it.qty, 10); if (!q || q < 1) q = 1;
          rows.push({ code: c, min: q, max: q, _itemset: tag });
        }
      });
      if (!rows.length) return;
      var comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}");
      if (!comp || typeof comp !== "object") comp = {};
      var cur = comp[code];
      if (!cur || !cur.length || cur.every(function (r) { return r && (r._itemset || r._npd || r._auto); })) {
        comp[code] = rows;
        localStorage.setItem("pc_itemset_comp", JSON.stringify(comp));
      }
    } catch (e) {}
  }

  /* Item Set tracking dates — อ่านจาก working/months ตาม codeItemSet/itemCode = code */
  API.getItemSetTracking = (code) => {
    code = String(code || "").trim();
    var res = { itDate: "", opDate: "", endDate: "", start: "" };
    if (!code) return res;
    var match = function (r) { return String(r.codeItemSet || "").trim() === code || String(r.itemCode || "").trim() === code; };
    var scan = function (r) {
      if (!match(r)) return;
      if (r.itDoneDate && String(r.itDoneDate) > String(res.itDate)) res.itDate = r.itDoneDate;
      if (r.opDoneDate && String(r.opDoneDate) > String(res.opDate)) res.opDate = r.opDoneDate;
      if (r.end && String(r.end) > String(res.endDate)) res.endDate = r.end;
      if (r.start && (!res.start || String(r.start) < String(res.start))) res.start = r.start;
    };
    (store.working || []).forEach(scan);
    Object.keys(store.months || {}).forEach(function (m) { (store.months[m] || []).forEach(scan); });
    return res;
  };

  /* ⭐ FX-P85 — Coupon / Bill Discount / Voucher(E-Coupon) ต้องมีเลขโค้ดตั้งแต่ตอน MKT กดส่ง
     เดิมเก็บคำว่า "Online/Normal/Offline" ลงช่อง Code Promotion แล้วรอ IT เปิดหน้า IT Settlement
     ถึงจะจอง → งานเข้าคิว/ศูนย์ติดตามโดย "ไม่มีเลขจอง" (เหมือน FX-P68 ที่ทำให้ E-Voucher แล้ว)
     จองแบบ RESERVED ด้วย identity เดิมทุกครั้ง → ส่งซ้ำไม่ได้เลขใหม่ · IT แค่ตรวจ+ยืนยันตอนบันทึก
     ไม่มี PC_COUNTER (โหลดไม่ทัน) = คืนค่าเดิม (Online/Normal) ไม่ทำให้ฟอร์มพัง */
  function reserveFormCode(type, tag, campaign, shortName, fallback) {
    fallback = fallback == null ? "" : fallback;
    try {
      if (!window.PC_COUNTER || !PC_COUNTER.reserve) return fallback;
      var fld = tag + "|" + String(campaign || "") + "|" + String(shortName || "");
      var ex = PC_COUNTER.findReservedFor ? PC_COUNTER.findReservedFor(type, null, campaign, fld) : null;
      if (ex && ex.code) return ex.code;
      var e = PC_COUNTER.reserve(type, { where: campaign, field: fld, by: currentUser() });
      return (e && e.code) ? e.code : fallback;
    } catch (err) { return fallback; }
  }

  /* ---- SAVE: Item Set (saveBulkProposal) ---- */
  API.saveBulkProposal = (allData) => {
    if (!allData || !allData.length) return "❌ Error: ไม่มีข้อมูลส่งมา";
    const month = allData[0].monthYear;
    const groups = {};
    allData.forEach(d => {
      const key = d.campaign + "|" + d.shortName;
      if (!groups[key]) { groups[key] = { info: d, items: [] }; }
      groups[key].items.push(d);
    });
    Object.keys(groups).forEach(k => {
      const g = groups[k], info = g.info;
      // ⚠️ งานจากฟอร์ม Item Set = Type Promotion "Item Set" เสมอ (ต่างจาก Coupon/Bill/Voucher)
      //    → IT กรอกครบทุกช่อง · postCate (Promotion set/Combo/Value set/E-Voucher) เก็บใน cate
      //    ไว้บอก "หมวดที่ปุ่มไปขึ้น" เท่านั้น ไม่เปลี่ยนชนิดงาน
      const ptype = "Item Set";
      /* ⭐ FX-P68 — หมวด E-Voucher = ต้องมีเลข Item Coupon (IC) · จองให้ตั้งแต่ตอน MKT แจ้งโปร
         (เดิมรอ IT เปิดหน้า IT Settlement ถึงจะจอง → งานเข้าคิวโดยไม่มีเลข)
         จองแบบ RESERVED ด้วย identity เดียวกันทุกครั้ง → เรียกซ้ำ/ส่งซ้ำ ไม่ได้เลขใหม่ · IT แค่ตรวจ+ยืนยัน */
      const _isEV = /e[-\s]?voucher/i.test(String(info.postCate || info.cateRemark || ""));
      let _evCode = "";
      if (_isEV && window.PC_COUNTER) {
        const _fld = "ItemSet EV|" + String(info.campaign || "") + "|" + String(info.shortName || "");
        try {
          const _ex = PC_COUNTER.findReservedFor ? PC_COUNTER.findReservedFor("coupon", null, info.campaign, _fld) : null;
          if (_ex && _ex.code) _evCode = _ex.code;
          else { const _e = PC_COUNTER.reserve("coupon", { where: info.campaign, field: _fld, by: currentUser() }); if (_e && _e.code) _evCode = _e.code; }
        } catch (e) {}
      }
      const totalGross = g.items.reduce((a, it) => a + (parseFloat(it.originalPrice) || 0) * (parseInt(it.qty) || 1), 0);
      const net = Number(info.netPrice) || 0;
      addButtonGroup(store, {
        month, campaign: info.campaign, reporter: currentUser(), promoType: ptype, typePromotion: ptype,
        // ⛔ ไม่ pre-gen Code Item Set — ปล่อยว่างให้หน้า IT autorun (จอง 107 จาก PC_COUNTER + ป้าย "รอ IT ยืนยันเลข")
        codePromotion: _evCode, codeItemSet: "", itemPromotion: "",
        start: info.start, end: info.end, stores: info.storeSelection, saleMode: info.saleMode,
        itStatus: "PENDING", opStatus: "WAITING", kitchen: info.kitchenName, shortName: info.shortName,
        detail: info.promotionDetail, mechanic: info.mechanic, minAmount: Number(info.minSpendAmount) || 0,
        cateRemark: info.cateRemark || "", cate: info.postCate || "",
        customerGroup: info.customerGroup || "", crmTarget: info.crmTarget || "", crmTargetName: info.crmTargetName || "",
        items: g.items.map((it, i) => ({
          catCode: it.cateCode, itemCode: it.itemCode, itemNameEN: it.itemNameEN, qty: it.qty,
          gross: parseFloat(it.originalPrice) || 0, discount: i === 0 ? (totalGross - net).toFixed(2) : 0,
          netPrice: Number(it.netPrice).toFixed(2),
          // subset ที่เลือกในฟอร์ม (member เป็นกลุ่ม SS) → ส่งต่อให้หน้า Item Set Builder ผูกที่ปุ่ม
          isSubset: it.isSubset || "", chooseMin: it.chooseMin || "", chooseMax: it.chooseMax || "",
        })),
      });
      // ⛔ ปุ่มสินค้าในตารางสินค้า สร้างตอน IT ยืนยัน Code Item Set (saveSettlementBatch) — ไม่ใช่ตอน MKT ส่ง
    });
    if (!persist()) return "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม (ข้อมูลยังไม่เข้าระบบ) — กดสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง";
    try { if (window.PC_notify) { const cs=[...new Set(allData.map(d=>d.campaign).filter(Boolean))]; window.PC_notify("proposal_submitted", { text: 'ส่งโปรโมชัน (Item Set) เสนออนุมัติ: ' + cs.join(', ') + ' — รอ OP ตรวจสอบ' }); } } catch (e) {}
    return "SUCCESS";
  };

  /* ---- SAVE: Coupon (submitCouponProposal) ---- */
  API.submitCouponProposal = (payload) => {
    if (!payload || !payload.length) return { status: "error", message: "ไม่พบข้อมูลที่ส่งมา" };
    const month = payload[0].monthYear;
    const groups = {};
    payload.forEach(row => {
      const key = row.campaignName + "_" + row.shortNamePOS;
      if (!groups[key]) groups[key] = { info: row, items: [] };
      groups[key].items.push(row);
    });
    Object.keys(groups).forEach(k => {
      const g = groups[k], info = g.info;
      addButtonGroup(store, {
        month, campaign: info.campaignName, reporter: currentUser(), promoType: (String(info.couponType) === "Online" ? "Item Coupon Online" : "Item Coupon"),
        typePromotion: "Coupon", codePromotion: reserveFormCode("coupon", "CouponForm", info.campaignName, info.shortNamePOS, info.couponType),
        codeChannel: info.couponType || "",   /* FX-P85 — เก็บ Online/Normal/Offline ไว้ต่างหาก (ช่องโค้ดเป็นเลขจริงแล้ว) */
        start: info.startDate, end: info.endDate, stores: info.stores, saleMode: info.saleModes,
        itStatus: "PENDING", opStatus: "WAITING", kitchen: "", shortName: info.shortNamePOS,
        detail: info.promotionDetail, mechanic: info.promotionCondition,
        customerGroup: info.customerGroup || "", crmTarget: info.crmTarget || "", crmTargetName: info.crmTargetName || "",
        attachment: pcSaveUpload(info.fileInfo, "COUPON_" + info.shortNamePOS),
        items: g.items.map(it => ({
          catCode: it.cateCode, itemCode: it.itemCode, itemNameEN: it.itemName, qty: it.qty,
          gross: Number(it.grossValue), discount: fmtUnit(it.discountValue, "CUR"), netPrice: Number(it.netPrice),
        })),
      });
    });
    if (!persist()) return { status: "error", message: "พื้นที่เก็บข้อมูลในเครื่องเต็ม — ข้อมูลยังไม่เข้าระบบ กรุงาสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง" };
    try { if (window.PC_notify) { const cs=[...new Set(payload.map(r=>r.campaignName).filter(Boolean))]; window.PC_notify("proposal_submitted", { text: 'ส่งโปรโมชัน (Coupon) เสนออนุมัติ: ' + cs.join(', ') + ' — รอ OP ตรวจสอบ' }); } } catch (e) {}
    return { status: "success", message: "บันทึกข้อมูลคูปองเรียบร้อยแล้ว" };
  };

  /* ---- SAVE: Bill Discount (submitBillDiscountProposal) ---- */
  API.submitBillDiscountProposal = (payload) => {
    const month = payload.globalMonth;
    (payload.campaigns || []).forEach(camp => {
      (camp.buttons || []).forEach(btn => {
        const dUnit = btn.discountUnit === "PCT" ? " %" : " ฿";
        const discText = fmtUnit(btn.discountValue, btn.discountUnit);
        let items = (btn.items || []).map(it => ({
          catCode: it.selectionMode === "CATE" ? (it.itemCode || it.targetCode || "") : "",
          itemCode: it.selectionMode === "CATE" ? (it.itemCode || "ALL ITEMS") : (it.itemCode || it.targetCode || ""),
          itemNameEN: it.itemName || it.targetValue || "", qty: "All", gross: "All",
          discount: discText, netPrice: "",
        }));
        if (!items.length) items = [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: "All", discount: discText, netPrice: "" }];
        addButtonGroup(store, {
          month, campaign: camp.name, reporter: currentUser(), promoType: (String(btn.couponType) === "Online" ? "Bill Discount Online" : "Bill Discount"),
          typePromotion: "Bill Discount", codePromotion: reserveFormCode("bill", "BillForm", camp.name, btn.shortName, btn.couponType),
          codeChannel: btn.couponType || "",   /* FX-P85 */
          start: camp.start, end: camp.end, stores: camp.stores, saleMode: camp.saleModes,
          itStatus: "PENDING", opStatus: "WAITING", kitchen: "", shortName: btn.shortName,
          detail: camp.detail, mechanic: camp.condition, minAmount: Number(btn.minSpendAmount) || 0,
          customerGroup: payload.customerGroup || "", crmTarget: payload.crmTarget || "", crmTargetName: payload.crmTargetName || "",
          attachment: pcSaveUpload(btn.fileData, "BILL_" + btn.shortName),
          discountText: discText, items,
        });
      });
    });
    if (!persist()) return { status: "error", message: "พื้นที่เก็บข้อมูลในเครื่องเต็ม — ข้อมูลยังไม่เข้าระบบ กรุงาสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง" };
    try { if (window.PC_notify) { const cs=(payload.campaigns||[]).map(c=>c.name).filter(Boolean); window.PC_notify("proposal_submitted", { text: 'ส่งโปรโมชัน (Bill Discount) เสนออนุมัติ: ' + cs.join(', ') + ' — รอ OP ตรวจสอบ' }); } } catch (e) {}
    return { status: "success", message: "บันทึกข้อมูล Bill Discount เรียบร้อยแล้ว" };
  };
  API.processBillDiscount = (arr) => {
    const r = API.submitBillDiscountProposal({ globalMonth: arr.length ? arr[0].month : "", campaigns: arr });
    return r.status === "success" ? "Success" : r.message;
  };

  /* ---- SAVE: Voucher (submitVoucherProposal / processVoucher) ---- */
  API.submitVoucherProposal = (payload) => {
    const month = payload.globalMonth;
    if (!month) return { status: "error", message: "Missing Target Month Data" };
    (payload.campaigns || []).forEach(camp => {
      (camp.buttons || []).forEach(btn => {
        // Voucher: ค่า = มูลค่าหน้าบัตร → ลง Gross พร้อมหน่วย (฿/%) · discount เว้นว่าง
        const gv = fmtUnit(btn.discountValue, btn.discountUnit);
        let items = (btn.items || []).map(it => ({
          catCode: "", itemCode: it.itemCode || "ALL ITEMS", itemNameEN: it.itemName || "All Products",
          qty: it.qty || "All", gross: gv, discount: "", netPrice: "",
        }));
        if (!items.length) items = [{ catCode: "", itemCode: "ALL ITEMS", itemNameEN: "All products", qty: "All", gross: gv, discount: "", netPrice: "" }];
        addButtonGroup(store, {
          month, campaign: camp.name, reporter: currentUser(), promoType: (String(btn.voucherType) === "Online" ? "Voucher Online" : "Voucher"),
          typePromotion: "Voucher", codePromotion: reserveFormCode("voucher", "VoucherForm", camp.name, btn.shortName, btn.voucherType),
          codeChannel: btn.voucherType || "",   /* FX-P85 */
          proposalKind: camp.proposalKind || "voucher",   // 'voucher' | 'ecoupon' — ต่างแค่ป้ายหน้าสาขา (e)
          start: camp.start, end: camp.end, stores: camp.stores, saleMode: camp.saleModes,
          itStatus: "PENDING", opStatus: "WAITING", kitchen: "", shortName: btn.shortName,
          cateRemark: btn.cateRemark || "",
          detail: camp.detail, mechanic: camp.condition, minAmount: Number(btn.minSpendAmount) || 0,
          customerGroup: camp.customerGroup || "", crmTarget: camp.crmTarget || "", crmTargetName: camp.crmTargetName || "",
          attachment: pcSaveUpload(btn.fileData, "VOUCHER_" + btn.shortName),
          items,
        });
      });
    });
    if (!persist()) return { status: "error", message: "พื้นที่เก็บข้อมูลในเครื่องเต็ม — ข้อมูลยังไม่เข้าระบบ กรุงาสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง" };
    try { if (window.PC_notify) { const cs=(payload.campaigns||[]).map(c=>c.name).filter(Boolean); window.PC_notify("coupon_issued", { text: 'ออก Voucher/E-Coupon ใหม่: ' + cs.join(', ') + ' — รอ OP ตรวจสอบ' }); } } catch (e) {}
    return { status: "success", message: "Data Saved Successfully" };
  };
  API.processVoucher = (arr) => {
    if (!arr || !arr.length) return "No Data Selected";
    return API.submitVoucherProposal({ globalMonth: arr[0].month, campaigns: arr }).status === "success" ? "Success" : "Error";
  };

  /* ---- Discount Allocation Report (เกลี่ยส่วนลดต่อไอเทมในชุด: Item Set / Combo / Value / Price) ---- */
  API.getDiscountAllocationReport = (monthFilter) => {
    const out = [];
    Object.keys(store.months).forEach(month => {
      if (monthFilter && String(monthFilter).toUpperCase() !== "ALL" && month !== monthFilter) return;
      const groups = {};
      store.months[month].forEach(r => {
        if (!r.campaign) return;
        const type = String(r.typePromotion || r.promoType || "");
        if (!/item\s*set|combo|value|price/i.test(type)) return;   // bundles only
        const key = r.campaign + "||" + r.shortName;
        if (!groups[key]) groups[key] = { campaign: r.campaign, shortName: r.shortName, month, type, code: r.codeItemSet || r.codePromotion || "", cate: r.cateRemark || "", start: r.start, end: r.end, items: [] };
        groups[key].items.push(r);
      });
      Object.keys(groups).forEach(k => {
        const g = groups[k];
        let totalGross = 0, sumNet = 0;
        g.items.forEach(it => { totalGross += (parseFloat(it.gross) || 0) * (parseFloat(it.qty) || 1); sumNet += (parseFloat(it.netPrice) || 0); });
        /* FX-P48 — ราคาสุทธิของชุด: ข้อมูลจริงเก็บ "ราคาชุด" ซ้ำทุกแถวของปุ่มเดียวกัน
           เดิมบวกทุกแถว → net > gross → ส่วนลดถูก clamp เป็น 0 (พัง 183/262 ชุด)
           ใหม่: ถ้าค่า net ที่ไม่ใช่ 0 เท่ากันหมด = ราคาชุดค่าเดียว · ต่างกัน = บวกรวม
                 (ถ้าบวกแล้วเกินราคาปกติ ใช้ค่ามากสุดเป็นราคาชุด) */
        const netVals = g.items.map(it => parseFloat(it.netPrice) || 0).filter(n => n > 0);
        const netUniq = [...new Set(netVals)];
        let net = 0;
        if (netUniq.length === 1) net = netUniq[0];
        else if (netUniq.length > 1) net = (sumNet <= totalGross) ? sumNet : Math.max.apply(null, netVals);
        const bundleDiscount = Math.max(0, +(totalGross - net).toFixed(2));
        const lines = g.items.map(it => {
          const lg = +(((parseFloat(it.gross) || 0) * (parseFloat(it.qty) || 1))).toFixed(2);
          const alloc = totalGross > 0 ? +(bundleDiscount * lg / totalGross).toFixed(2) : 0;
          return { itemCode: it.itemCode || "", itemNameEN: (function (c, fb) { try { c = String(c || "").toUpperCase(); if (/^SS\d/.test(c)) { var m = JSON.parse(localStorage.getItem("pc_subset_meta") || "{}")[c]; if (m && (m.nameEN || m.nameTH)) return m.nameEN || m.nameTH; } } catch (e) {} return fb || ""; })(it.itemCode, it.itemNameEN), qty: it.qty || 1, gross: lg, allocDiscount: alloc, allocNet: +(lg - alloc).toFixed(2), discPct: lg > 0 ? +((alloc / lg) * 100).toFixed(1) : 0 };
        });
        /* ข้อมูลไม่ครบ = ไม่มีราคาปกติ หรือราคาชุดเกินราคาปกติ (ยังไม่ได้ลงรายการสินค้าในชุดครบ) → อย่าโชว์ 0% หลอกตา */
        const incomplete = !(totalGross > 0) || net > totalGross;
        out.push({ campaign: g.campaign, shortName: g.shortName, month, type: g.type, code: g.code, cate: g.cate, start: g.start, end: g.end, itemCount: g.items.length, totalGross: +totalGross.toFixed(2), net: +net.toFixed(2), bundleDiscount, incomplete, discPct: totalGross > 0 ? +((bundleDiscount / totalGross) * 100).toFixed(1) : 0, lines });
      });
    });
    return out.sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(a.campaign).localeCompare(String(b.campaign)));
  };

  /* ---- Full Promo Export (ทุกช่องที่ MKT กรอก — flat สำหรับ export Excel) ---- */
  const _CATE_MAP = {
    "101": "Fries", "102": "Specialty Fries", "103": "Flavors", "104": "Super Chicken Pop",
    "105": "Combo", "106": "Value Set", "107": "Promotion Set", "108": "Specialty Chicken",
    "109": "E-Voucher", "114": "Drinks", "118": "Sauce", "201": "Drinks",
  };
  const CATE_NAME = (code, remark) => {
    const c = String(code || "").trim();
    if (_CATE_MAP[c]) return _CATE_MAP[c];
    if (c.length >= 3 && _CATE_MAP[c.slice(0, 3)]) return _CATE_MAP[c.slice(0, 3)];
    return remark || "";
  };
  API.getFullPromoExport = (monthFilter) => {
    const rows = [];
    const _subMeta = (() => { try { return JSON.parse(localStorage.getItem("pc_subset_meta") || "{}") || {}; } catch (e) { return {}; } })();
    const _subName = (code, fb) => { const c = String(code || "").toUpperCase(); if (/^SS\d/.test(c) && _subMeta[c] && (_subMeta[c].nameEN || _subMeta[c].nameTH)) return _subMeta[c].nameEN || _subMeta[c].nameTH; return fb || ""; };
    Object.keys(store.months).forEach(month => {
      if (monthFilter && String(monthFilter).toUpperCase() !== "ALL" && month !== monthFilter) return;
      store.months[month].forEach(r => {
        if (!r.campaign) return;
        const _cc = String(r.catCode == null ? "" : r.catCode).trim();
        rows.push({
          month, campaign: r.campaign, typePromotion: r.typePromotion || r.promoType || "",
          codePromotion: r.codePromotion || "", codeItemSet: r.codeItemSet || r.itemPromotion || "",
          productCategoryPOS: r.cateRemark || "", shortName: r.shortName || "", kitchen: r.kitchen || "",
          start: r.start || "", end: r.end || "", saleMode: r.saleMode || "", stores: r.stores || "",
          catCode: _cc, category: CATE_NAME(_cc, r.cateRemark),
          itemCode: r.itemCode || "", itemNameEN: _subName(r.itemCode, r.itemNameEN), qty: r.qty || "",
          gross: r.gross || "", discount: r.discount || "", netPrice: r.netPrice || "", minAmount: r.minAmount || 0,
          addons: r.addons || "", branchNote: r.branchNote || "",
          detail: r.detail || "", mechanic: r.mechanic || "",
          itStatus: r.itStatus || "", opStatus: r.opStatus || "", changeStatus: r.changeStatus || "",
          submittedDate: r.submittedDate || "", itDoneDate: r.itDoneDate || "", opDoneDate: r.opDoneDate || "",
        });
      });
    });
    return rows.sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(a.campaign).localeCompare(String(b.campaign)));
  };

  /* ---- CO-PROMOTION (MKT แจ้ง ACC · IT ยืนยัน Interface ERP) ---- */
  const CO_KEY = "pc_co_promotions";
  const loadCoPromos = () => { try { return JSON.parse(localStorage.getItem(CO_KEY)) || []; } catch (e) { return []; } };
  const saveCoPromos = (a) => { try { localStorage.setItem(CO_KEY, JSON.stringify(a)); } catch (e) {} };
  const coExc = (inc) => { const p = parseFloat(inc) || 0; return p ? +(p / 1.07).toFixed(4) : ""; };
  /* เมื่อโปรถูกขยาย/ลด/ยกเลิกที่หน้าตาราง → อัปเดตวันที่ + สถานะ lifecycle ที่เรคคอร์ด co-promo ด้วย */
  const syncCoPromoDates = (campaignName, opts) => {
    opts = opts || {};
    // รวมโค้ดของแคมเปญนี้ (ผูกได้ทั้งชื่อ + โค้ด)
    const codes = {};
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (r.campaign !== campaignName) return;
      [r.codePromotion, r.codeItemSet, r.itemPromotion].forEach(c => { c = String(c || "").trim().toUpperCase(); if (c) codes[c] = 1; });
    }));
    const list = loadCoPromos(); let n = 0;
    list.forEach(r => {
      const cp = String(r.codePromotion || "").trim().toUpperCase();
      const ci = String(r.codeItemSet || "").trim().toUpperCase();
      const match = (r.campaign === campaignName) || (cp && codes[cp]) || (ci && codes[ci]);
      if (!match) return;
      if (opts.end !== undefined) r.end = opts.end;
      if (opts.start !== undefined) r.start = opts.start;
      if (opts.lifecycle) r.promoLifecycle = opts.lifecycle;
      r.periodText = (r.start || "") + " → " + (r.end || "");
      r.updatedAt = new Date().toISOString();
      n++;
    });
    if (n) saveCoPromos(list);
    return n;
  };
  API.syncCoPromoDates = syncCoPromoDates;

  /* ---- RD: แจ้งเปิด/ปิดปุ่มสินค้าเดิม (RD → IT ยืนยัน → อัปเดตตารางสินค้า) ---- */
  const PR_KEY = "pc_product_reopen";
  const loadReopen = () => { try { return JSON.parse(localStorage.getItem(PR_KEY)) || []; } catch (e) { return []; } };
  const saveReopen = (a) => { try { localStorage.setItem(PR_KEY, JSON.stringify(a)); } catch (e) {} };
  API.getProductReopen = () => loadReopen().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  API.saveProductReopen = (rec) => {
    rec = rec || {};
    const list = loadReopen();
    const row = Object.assign({ id: "PR" + Date.now().toString(36).toUpperCase(), status: "PENDING", at: new Date().toISOString() }, rec);
    list.unshift(row); saveReopen(list);
    try {
      if (window.PC_notify) {
        const isOpen = row.action === "OPEN";
        const act = isOpen ? "เปิดปุ่มขายอีกครั้ง" : "ปิดปุ่ม (สินค้าหมด/เลิกขาย)";
        window.PC_notify(isOpen ? "product_reopen" : "product_close", {
          text: "RD แจ้ง" + act + ": " + (row.itemName || "") + " (" + (row.itemCode || "") + ")" + (row.saleDate ? " · " + row.saleDate : ""),
          emailBody: "RD แจ้ง" + act + " — รอ IT ยืนยัน\n\nสินค้า: " + (row.itemName || "-") + "\nรหัส (Item Code): " + (row.itemCode || "-") +
            "\nหมวด: " + (row.category || "-") + "\nวันที่" + (isOpen ? "เริ่มขาย" : "สิ้นสุด") + ": " + (row.saleDate || "-") +
            "\nหมายเหตุ: " + (row.note || "-") + "\nโดย: " + (row.by || "-") + "\n\n— ระบบจัดการโปรโมชัน Potato Corner —"
        });
      }
    } catch (e) {}
    return { status: "success", id: row.id };
  };
  API.confirmProductReopen = (id, by) => {
    const list = loadReopen(); const i = list.findIndex(x => x.id === id);
    if (i < 0) return { status: "error", message: "ไม่พบรายการ" };
    const r = list[i]; r.status = "DONE"; r.confirmedBy = by || ""; r.confirmedAt = new Date().toISOString();
    saveReopen(list);
    // อัปเดตตารางสินค้า (pc_product_flags): OPEN→Active(1) · CLOSE→Inactive(0) + วันที่
    try {
      const f = JSON.parse(localStorage.getItem("pc_product_flags") || "{}") || {};
      const c = String(r.itemCode || "").trim();
      if (c) { f[c] = f[c] || {}; f[c].status = r.action === "OPEN" ? 1 : 0; f[c].statusDate = r.saleDate || new Date().toISOString().slice(0, 10); localStorage.setItem("pc_product_flags", JSON.stringify(f)); }
    } catch (e) {}
    try { if (window.PC_notify) window.PC_notify(r.action === "OPEN" ? "product_reopen_done" : "product_close_done", { text: "IT " + (r.action === "OPEN" ? "เปิดปุ่มขาย" : "ปิดปุ่ม") + "แล้ว: " + (r.itemName || "") + " (" + (r.itemCode || "") + ")" }); } catch (e) {}
    return { status: "success" };
  };
  API.deleteProductReopen = (id) => { saveReopen(loadReopen().filter(x => x.id !== id)); return { status: "success" }; };
  const coTokens = (r, by) => ({
    code: [r.codePromotion, r.codeItemSet].filter(Boolean).join(" / ") || "-",
    name: r.cmposName || r.buttonName || r.campaign || "",
    brand: r.brand || "-", billing: r.billingEntity || "-",
    payment: r.paymentType || "-", cond: r.paymentCondition || "",
    priceInc: r.priceIncVat || "-", priceExc: (r.priceExcVat != null && r.priceExcVat !== "") ? r.priceExcVat : coExc(r.priceIncVat) || "-",
    so: r.soNo || "-", quota: r.quota || "-",
    period: r.periodText || ((r.start || "") + " → " + (r.end || "")),
    detail: r.detail || "-", remark: r.remark || "-", by: by || r.interfaceBy || "",
  });
  const coText = (head, r) => head + ": " + ([r.codePromotion, r.codeItemSet].filter(Boolean).join("/") || "-") +
    " · " + (r.cmposName || r.buttonName || r.campaign || "") + (r.brand ? " · Brand " + r.brand : "");
  const coEmailBody = (head, r) => {
    const exc = (r.priceExcVat != null && r.priceExcVat !== "") ? r.priceExcVat : (coExc(r.priceIncVat) || "-");
    const L = [head, "",
      "โค้ด (CMPOS Code)      : " + ([r.codePromotion, r.codeItemSet].filter(Boolean).join(" / ") || "-"),
      "ชื่อโปรโมชัน (CMPOS)   : " + (r.cmposName || r.buttonName || r.campaign || "-"),
      "Type Promotion         : " + (r.promoType || "-"),
      "ประเภทการเรียกเก็บ     : " + (r.type || "Co-Promotion"),
      "Brand / พาร์ทเนอร์      : " + (r.brand || "-"),
      "เรียกเก็บในนาม (บริษัท) : " + (r.billingEntity || "-"),
      "Payment Type           : " + (r.paymentType || "-"),
      "เงื่อนไขการจ่าย         : " + (r.paymentCondition || "-"),
      "ราคา Inc. VAT          : " + (r.priceIncVat || "-"),
      "ราคา Exc. VAT          : " + exc,
      "SO No.                 : " + (r.soNo || "-"),
      "Quota                  : " + (r.quota || "-"),
      "ช่วงเวลา (Period)       : " + (r.periodText || ((r.start || "-") + " → " + (r.end || "-"))),
      "รายละเอียดโปรโมชัน     : " + (r.detail || "-"),
      "หมายเหตุ (Remark)       : " + (r.remark || "-")];
    if (r.interfaceBy) L.push("ยืนยัน Interface ERP โดย : " + r.interfaceBy);
    L.push("", "— ระบบจัดการโปรโมชัน Potato Corner —");
    return L.join("\n");
  };
  API.getCoPromotions = () => {
    const findByCode = (cp, ci) => {
      const a = String(cp == null ? "" : cp).trim().toUpperCase();
      const b = String(ci == null ? "" : ci).trim().toUpperCase();
      if (!a && !b) return null;
      let hit = null;
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (hit) return;
        const rp = String(r.codePromotion || "").trim().toUpperCase();
        const ri = String(r.codeItemSet || r.itemPromotion || "").trim().toUpperCase();
        if ((a && (rp === a || ri === a)) || (b && (rp === b || ri === b))) hit = r;
      }));
      return hit;
    };
    return loadCoPromos().slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(r => {
        const p = findByCode(r.codePromotion, r.codeItemSet);
        if (!p) return Object.assign({}, r, { linked: false });
        // sync วันที่/สถานะจากตารางโปร (ผูกด้วยโค้ด) — เพิ่มโปรทีหลังก็เชื่อมเอง
        const st = p.start || r.start || "", en = p.end || r.end || "";
        return Object.assign({}, r, {
          linked: true, linkedCampaign: p.campaign || "",
          start: st, end: en, periodText: (st || en) ? (st + " → " + en) : r.periodText,
          promoLifecycle: String(p.changeStatus || "").toUpperCase() || r.promoLifecycle || "",
        });
      });
  };
  API.getCoPromoCampaigns = () => Array.from(new Set(loadCoPromos().filter(r => !r.notCoPromo).map(r => r.campaign).filter(Boolean)));
  API.getCoPromoCodes = () => {
    const set = {};
    // เฉพาะรหัสโปรจริง — กันค่าขยะ (Normal/Online/ตัวเลขสั้น) ที่ทำให้ badge co-promo ติดผิดทุกโปรที่ code ซ้ำ
    const isRealCode = (c) => /^(P|IC|BD|VC|CO)\d{2,}$/i.test(c) || /^\d{6,}$/.test(c);
    loadCoPromos().filter(r => !r.notCoPromo).forEach(r => { [r.codePromotion, r.codeItemSet].forEach(c => { c = String(c == null ? "" : c).trim().toUpperCase(); if (c && isRealCode(c)) set[c] = 1; }); });
    return Object.keys(set);
  };
  /* MKT กดยกเลิก/คืนสถานะ "ไม่ใช่ Co-Promotion" — บันทึกวันที่ + ชื่อคนแก้ */
  API.setCoPromoNotCopro = (arg) => {
    arg = arg || {}; const id = arg.id; const val = arg.val;
    const list = loadCoPromos(); const i = list.findIndex(x => x.id === id);
    if (i < 0) return { status: "error", message: "ไม่พบรายการ" };
    const who = (function () { try { return localStorage.getItem('pc_userName') || localStorage.getItem('pc_role') || ''; } catch (e) { return ''; } })();
    const now = new Date().toISOString();
    list[i].notCoPromo = val ? 1 : 0;
    list[i].updatedAt = now; list[i].updatedBy = who;
    list[i].notCoPromoBy = val ? who : ""; list[i].notCoPromoAt = val ? now : "";
    saveCoPromos(list);
    return { status: "success", notCoPromo: list[i].notCoPromo };
  };
  API.getCoPromoByCampaign = (campaign) => loadCoPromos().filter(r => r.campaign === campaign);
  API.saveCoPromotion = (rec) => {
    rec = rec || {};
    const list = loadCoPromos();
    const now = new Date().toISOString();
    if (rec.id) {
      const i = list.findIndex(x => x.id === rec.id);
      if (i >= 0) {
        list[i] = Object.assign({}, list[i], rec, { updatedAt: now, updatedBy: (function(){try{return localStorage.getItem('pc_userName')||localStorage.getItem('pc_role')||'';}catch(e){return '';}})(), priceExcVat: coExc(rec.priceIncVat != null ? rec.priceIncVat : list[i].priceIncVat) });
        saveCoPromos(list);
        return { status: "success", id: rec.id, mode: "update" };
      }
    }
    const id = "CO" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    const row = Object.assign({ id, status: "PENDING_INTERFACE", interfaceSetup: 0, createdAt: now }, rec,
      { id, priceExcVat: coExc(rec.priceIncVat) });
    list.unshift(row);
    saveCoPromos(list);
    try { if (window.PC_notify) window.PC_notify("copro_submitted", { text: coText("Co-Promotion ใหม่", row), emailBody: coEmailBody("มี Co-Promotion ใหม่จาก MKT (รอ IT ยืนยัน Interface ERP)", row), emailHtml: (window.PC_EmailTpl ? PC_EmailTpl.build("copro", "copro_submitted", Object.assign({ promoType: row.promoType, campaign: row.campaign }, coTokens(row))) : ""), tokens: coTokens(row), cal: { key: "code_expire", title: "[Co-Promo] " + (row.cmposName || row.campaign || "") + " หมดเขต", date: row.end || "", desc: "โค้ด " + (row.codePromotion || row.codeItemSet || "") + " · Brand " + (row.brand || ""), file: "copromo-" + (row.codePromotion || "") } }); } catch (e) {}
    return { status: "success", id, mode: "create" };
  };
  API.updateCoPromotion = (id, patch) => {
    const list = loadCoPromos(); const i = list.findIndex(x => x.id === id);
    if (i < 0) return { status: "error", message: "ไม่พบรายการ" };
    list[i] = Object.assign({}, list[i], patch, { updatedAt: new Date().toISOString(), updatedBy: (function(){try{return localStorage.getItem('pc_userName')||localStorage.getItem('pc_role')||'';}catch(e){return '';}})() });
    if (patch && patch.priceIncVat != null) list[i].priceExcVat = coExc(patch.priceIncVat);
    saveCoPromos(list);
    return { status: "success" };
  };
  API.deleteCoPromotion = (id) => { saveCoPromos(loadCoPromos().filter(x => x.id !== id)); return { status: "success" }; };
  API.confirmErpInterface = (id, by) => {
    const list = loadCoPromos(); const i = list.findIndex(x => x.id === id);
    if (i < 0) return { status: "error", message: "ไม่พบรายการ" };
    list[i].interfaceSetup = 1; list[i].salesInterface = 1; list[i].status = "INTERFACED";
    list[i].interfaceBy = by || ""; list[i].interfaceAt = new Date().toISOString();
    saveCoPromos(list);
    try { if (window.PC_notify) window.PC_notify("copro_interfaced", { text: coText("Interface ERP เสร็จ", list[i]), emailBody: coEmailBody("IT ยืนยัน Interface ERP แล้ว — ทีมบัญชี (ACC) ตั้งค่าเรียกเก็บได้", list[i]), emailHtml: (window.PC_EmailTpl ? PC_EmailTpl.build("copro", "copro_interfaced", Object.assign({ promoType: list[i].promoType, campaign: list[i].campaign }, coTokens(list[i], by))) : ""), tokens: coTokens(list[i], by) }); } catch (e) {}
    return { status: "success" };
  };
  /* บริบทของแคมเปญ (ให้ฟอร์ม co-promo prefill โค้ด/ชื่อปุ่ม/รายละเอียด/ช่วงเวลา) */
  API.getCoPromoContext = (campaign) => {
    const rows = [];
    Object.keys(store.months).forEach(m => store.months[m].forEach(r => { if (r.campaign === campaign) rows.push(r); }));
    store.working.forEach(r => { if (r.campaign === campaign && !rows.some(x => x.shortName === r.shortName)) rows.push(r); });
    if (!rows.length) return { campaign, buttons: [] };
    const first = rows[0];
    const byBtn = {}, order = [];
    rows.forEach(r => { const k = r.shortName || ""; if (!byBtn[k]) { byBtn[k] = r; order.push(k); } });
    const buttons = order.map(k => {
      const r = byBtn[k];
      return {
        buttonName: r.shortName || "", kitchen: r.kitchen || "",
        codePromotion: r.codePromotion || "", codeItemSet: r.codeItemSet || r.itemPromotion || "",
        detail: r.detail || "", typePromotion: r.typePromotion || r.promoType || "",
        cateRemark: r.cateRemark || "", cate: r.cate || "",
      };
    });
    return {
      campaign, start: first.start || "", end: first.end || "",
      saleMode: first.saleMode || "", typePromotion: first.typePromotion || first.promoType || "",
      buttons,
    };
  };

  /* ---- IT SETTLEMENT list (getITTasks) — pending work, optionally one month ---- */
  API.getITTasks = (monthFilter) => {
    const tasks = [];
    Object.keys(store.months).forEach(month => {
      const isAll = !monthFilter || String(monthFilter).toUpperCase() === "ALL" || monthFilter === "";
      if (!isAll && month !== monthFilter) return;
      store.months[month].forEach((r, i) => {
        const status = String(r.itStatus || "PENDING").toUpperCase();
        const chg = String(r.changeStatus || "").toUpperCase();
        // show all non-complete work; tabs on the page split NEW/CANCELLED/CHANGED/EDITED
        const cancelJob = chg === "CANCELLED" && !r.removedFromPos && !r.cancelHandled;   // งานยกเลิกที่ IT ยังไม่ได้จัดการ ต้องเด้งเข้าหน้า IT แม้เคยปิดงานไปแล้ว
        if (!r.campaign) return;
        if ((status === "COMPLETE" || status === "DONE") && !cancelJob) return;
        tasks.push({
          sourceSheet: "Promotion " + month, month, rowIdx: i + 2, campaign: r.campaign,
          startDate: r.start, endDate: r.end, store: r.stores, storeData: resolveStores(r.stores),
          saleMode: r.saleMode, promoType: r.promoType || r.typePromotion, promoCode: r.codePromotion,
          typeSel: r.typeSel || "", _wasItemSet: r._wasItemSet || false,
          itemPromo: r.itemPromotion, kitchenName: r.kitchen, shortName: r.shortName,
          builderCode: String(r.codeItemSet || ""), posReady: !!r.posReady,
          /* เคยขึ้นปุ่มบน POS แล้วหรือยัง — ตัวตัดสินว่าคืนโค้ดได้ไหมเวลายกเลิก */
          wentLive: !!r.wentLive, everLive: (!!r.wentLive || !!r.posReady || status === "COMPLETE" || !!r.itDoneDate),
          cancelReason: r.cancelReason || "", cancelHandled: !!r.cancelHandled,
          removedFromPos: !!r.removedFromPos, codesReturned: r.codesReturned || [],
          catCode: r.catCode, itemCode: r.itemCode, itemNameEN: r.itemNameEN, qty: r.qty,
          price: r.gross, discount: r.discount, netPrice: r.netPrice, detail: r.detail,
          mechanic: r.mechanic, fileUrl: r.attachment || "", itStatus: status,
          changeStatus: chg, cateRemark: r.cateRemark || "", rejectReason: String(r.rejectReason || ""),
          extendCodeNote: r.extendCodeNote || "",
          addons: r.addons || "", addonSubset: r.addonSubset || "",
        });
      });
    });
    return tasks.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  };

  /* ---- DASHBOARD pending summary (getPendingSummary) ---- */
  API.getPendingSummary = () => {
    const out = [];
    Object.keys(store.months).forEach(month => {
      const count = store.months[month].filter(r =>
        r.campaign && !["COMPLETE", "DONE"].includes(String(r.itStatus || "").toUpperCase())).length;
      if (count > 0) out.push({ month, count });
    });
    return out;
  };

  /* ---- IT SETTLEMENT monthly workload dashboard (counts POS buttons per month) ---- */
  API.getMonthlySubmitSummary = () => {
    const out = [];
    const keyOf = (r) => r.campaign + "|" + r.shortName;
    Object.keys(store.months).sort().forEach(month => {
      const rows = store.months[month].filter(r => r.campaign);
      const all = new Set(), pending = new Set(), complete = new Set(), changed = new Set();
      rows.forEach(r => {
        const k = keyOf(r);
        all.add(k);
        const st = String(r.itStatus || "PENDING").toUpperCase();
        const chg = String(r.changeStatus || "").toUpperCase();
        if (st === "COMPLETE") complete.add(k);
        if (st !== "COMPLETE") pending.add(k);
        if (chg) changed.add(k);
      });
      out.push({ month, total: all.size, pending: pending.size, complete: complete.size, changed: changed.size });
    });
    return out;
  };

  /* ---- IT SETTLEMENT dashboard summary: pending per month + by type + changes ---- */
  API.getITWorkSummary = () => {
    const U = (s) => String(s || "").toUpperCase();
    const typeOf = (pt) => {
      pt = (pt || "").toLowerCase();
      if (pt.includes("item set")) return "Item Set";
      if (pt.includes("coupon")) return "Coupon";
      if (pt.includes("bill")) return "Bill Discount";
      if (pt.includes("voucher")) return "Voucher";
      return "Other";
    };
    const keyOf = (r) => r.campaign + "|" + r.shortName;
    const byMonth = [], byType = {}, changes = { EXTENDED: 0, REDUCED: 0, CANCELLED: 0 };
    let totalPending = 0;
    Object.keys(store.months).sort().forEach(month => {
      const rows = store.months[month].filter(r => r.campaign);
      const all = new Set(), pending = new Set(), complete = new Set();
      const seenBtn = {};
      rows.forEach(r => {
        const k = keyOf(r);
        all.add(k);
        const st = U(r.itStatus), chg = U(r.changeStatus);
        if (st === "COMPLETE") complete.add(k); else pending.add(k);
        if (!seenBtn[k]) {
          seenBtn[k] = 1;
          if (st !== "COMPLETE") {
            const t = typeOf(r.typePromotion); byType[t] = (byType[t] || 0) + 1;
            if (chg && changes[chg] !== undefined) changes[chg]++;
          }
        }
      });
      byMonth.push({ month, total: all.size, pending: pending.size, complete: complete.size });
      totalPending += pending.size;
    });
    return {
      totalPending,
      byMonth,
      byType: Object.keys(byType).map(k => ({ type: k, count: byType[k] })).sort((a, b) => b.count - a.count),
      changes,
    };
  };

  /* ---- DASHBOARD ops overview (department performance tracking) ---- */
  API.getOpsOverview = () => {
    const U = (s) => String(s || "").toUpperCase();
    const typeOf = (pt) => {
      pt = (pt || "").toLowerCase();
      if (pt.includes("item set")) return "Item Set";
      if (pt.includes("coupon")) return "Coupon";
      if (pt.includes("bill")) return "Bill Discount";
      if (pt.includes("voucher")) return "Voucher";
      return "Other";
    };
    const buttons = store.working;
    const dept = { mkt: { campaigns: 0, buttons: buttons.length }, it: { pending: 0, complete: 0 }, op: { waiting: 0, approved: 0, rejects: 0, cleanPass: 0 } };
    const byType = {}, byMonth = {}, changes = { EXTENDED: 0, REDUCED: 0, CANCELLED: 0 };
    const allCampaigns = new Set();
    const days = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;
    let itSum = 0, itN = 0, opSum = 0, opN = 0, leadSum = 0, leadN = 0;
    buttons.forEach(w => {
      const it = U(w.itStatus), op = U(w.opStatus), chg = U(w.changeStatus);
      if (it === "COMPLETE") dept.it.complete++; else dept.it.pending++;
      if (op === "CONFIRMED") dept.op.approved++; else if (chg !== "CANCELLED") dept.op.waiting++;
      dept.op.rejects += (w.rejectCount || 0);
      if (op === "CONFIRMED" && !(w.rejectCount > 0)) dept.op.cleanPass++;
      allCampaigns.add(w.campaign);
      const t = typeOf(w.promoType); byType[t] = (byType[t] || 0) + 1;
      const m = w.month || "-";
      if (!byMonth[m]) byMonth[m] = { buttons: 0, campaigns: new Set(), types: {}, changes: { EXTENDED: 0, REDUCED: 0, CANCELLED: 0 }, it: { complete: 0, pending: 0 }, op: { approved: 0, waiting: 0, rejects: 0, cleanPass: 0 }, _itSum: 0, _itN: 0, _opSum: 0, _opN: 0, _leadSum: 0, _leadN: 0 };
      byMonth[m].buttons++; byMonth[m].campaigns.add(w.campaign); byMonth[m].types[t] = (byMonth[m].types[t] || 0) + 1;
      if (it === "COMPLETE") byMonth[m].it.complete++; else byMonth[m].it.pending++;
      if (op === "CONFIRMED") byMonth[m].op.approved++; else if (chg !== "CANCELLED") byMonth[m].op.waiting++;
      byMonth[m].op.rejects += (w.rejectCount || 0);
      if (op === "CONFIRMED" && !(w.rejectCount > 0)) byMonth[m].op.cleanPass++;
      if (chg && changes[chg] !== undefined) changes[chg]++;
      if (chg && byMonth[m].changes[chg] !== undefined) byMonth[m].changes[chg]++;
      const sub = w.submittedDate ? String(w.submittedDate).slice(0, 10) : "";
      const di = days(sub, w.itDoneDate); if (di !== null && di >= 0) { itSum += di; itN++; byMonth[m]._itSum += di; byMonth[m]._itN++; }
      const dop = days(w.itDoneDate, w.opDoneDate); if (dop !== null && dop >= 0) { opSum += dop; opN++; byMonth[m]._opSum += dop; byMonth[m]._opN++; }
      const dl = days(sub, w.start); if (dl !== null && dl >= 0) { leadSum += dl; leadN++; byMonth[m]._leadSum += dl; byMonth[m]._leadN++; }
    });
    dept.mkt.campaigns = allCampaigns.size;
    return {
      kpi: { total: allCampaigns.size, pendingIT: dept.it.pending, complete: dept.it.complete, opApproved: dept.op.approved },
      totals: { campaigns: allCampaigns.size, buttons: buttons.length },
      dept,
      byType: Object.keys(byType).map(k => ({ type: k, count: byType[k] })).sort((a, b) => b.count - a.count),
      byMonth: Object.keys(byMonth).sort().map(m => ({ month: m, campaigns: byMonth[m].campaigns.size, buttons: byMonth[m].buttons, types: byMonth[m].types })),
      monthly: Object.keys(byMonth).sort().map(m => {
        const b = byMonth[m];
        return {
          month: m,
          mkt: { campaigns: b.campaigns.size, buttons: b.buttons },
          it: { complete: b.it.complete, pending: b.it.pending },
          op: { approved: b.op.approved, waiting: b.op.waiting, rejects: b.op.rejects, cleanPass: b.op.cleanPass },
          avgItDays: b._itN ? b._itSum / b._itN : null,
          avgOpDays: b._opN ? b._opSum / b._opN : null,
          avgLeadDays: b._leadN ? b._leadSum / b._leadN : null,
          byType: Object.keys(b.types).map(k => ({ type: k, count: b.types[k] })).sort((x, y) => y.count - x.count),
          changes: b.changes,
        };
      }),
      changes,
      avgItDays: itN ? itSum / itN : null,
      avgOpDays: opN ? opSum / opN : null,
      avgLeadDays: leadN ? leadSum / leadN : null,
      rejectIssues: Object.keys(store.rejectIssues || {}).map(k => ({ issue: k, count: store.rejectIssues[k] })).sort((a, b) => b.count - a.count),
    };
  };

  /* ---- workflow lead-time detail per campaign (Dashboard drill-down) ---- */
  API.getWorkflowTimings = () => {
    const U = (s) => String(s || "").toUpperCase();
    const days = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;
    const seen = {};
    store.working.forEach(w => { if (!seen[w.campaign]) seen[w.campaign] = w; });
    return Object.keys(seen).map(name => {
      const w = seen[name];
      const sub = w.submittedDate ? String(w.submittedDate).slice(0, 10) : "";
      return {
        campaign: w.campaign, type: w.promoType, month: w.month,
        submittedDate: sub, startDate: w.start || "", endDate: w.end || "",
        itDoneDate: w.itDoneDate || "", opDoneDate: w.opDoneDate || "",
        itStatus: U(w.itStatus), opStatus: U(w.opStatus), changeStatus: U(w.changeStatus),
        leadDays: days(sub, w.start),       // MKT — กรอกล่วงหน้ากี่วันก่อนเล่นจริง
        itDays: days(sub, w.itDoneDate),    // IT — รับแจ้ง → ขึ้นปุ่มเสร็จ
        opDays: days(w.itDoneDate, w.opDoneDate), // OP — IT เสร็จ → อนุมัติ
      };
    });
  };

  /* ---- MEMO data — campaigns + their POS buttons (for HQ memo + branch view) ---- */
  API.getMemoCampaigns = (month) => {
    const U = (s) => String(s || "").toUpperCase();
    const rows = store.working.filter(w => w.campaign && (!month || month === "ALL" || w.month === month));
    // net / normal-price lookup per (campaign|shortName) from month item rows
    const priceMap = {};
    Object.keys(store.months).forEach(mo => store.months[mo].forEach(r => {
      const key = r.campaign + "|" + r.shortName;
      if (!priceMap[key]) priceMap[key] = { gross: 0, net: 0 };
      priceMap[key].gross += (parseFloat(r.gross) || 0) * (parseFloat(r.qty) || 1);
      const n = parseFloat(r.netPrice) || 0;
      if (n > priceMap[key].net) priceMap[key].net = n; // header row carries the set net price
    }));
    const byCamp = {};
    const codeMap = {};
    Object.keys(store.months).forEach(mo => store.months[mo].forEach(r => {
      const key = r.campaign + "|" + r.shortName;
      (codeMap[key] = codeMap[key] || {})[String(r.itemCode || "").trim()] = 1;
    }));
    rows.forEach(w => {
      if (!byCamp[w.campaign]) byCamp[w.campaign] = {
        campaign: w.campaign, month: w.month, promoType: w.promoType, start: w.start, end: w.end,
        saleMode: w.saleMode, stores: w.stores, storeData: resolveStores(w.stores),
        detail: w.detail, mechanic: w.mechanic, attachment: w.attachment || "", memoUrl: w.memoUrl || "",
        cateRemark: w.cateRemark || "", promoTypeFull: w.promoType || w.typePromotion || "",
        proposalKind: w.proposalKind || "",
        submittedDate: w.submittedDate || "", timestamp: w.timestamp || "", updatedDate: w.updatedDate || "",
        customerGroup: w.customerGroup || "", crmTargetName: w.crmTargetName || "",
        branchNote: w.branchNote || "",
        wentLive: !!w.wentLive,
        itStatus: U(w.itStatus), opStatus: U(w.opStatus), changeStatus: U(w.changeStatus), buttons: [],
      };
      const pm = priceMap[w.campaign + "|" + w.shortName] || { gross: 0, net: 0 };
      // ราคาปกติ (gross): รวมจาก item rows > ค่าใน working > 0=ว่าง (ไม่โชว์ "0.00" หลอก ๆ)
      let grossN = (parseFloat(pm.gross) || 0) || (parseFloat(w.gross) || 0);
      // ราคาหลังลด (net): header netPrice > คำนวณจากส่วนลด (ราคาปกติ − ส่วนลด) ถ้ามีทั้งคู่
      let netN = parseFloat(pm.net) || 0;
      if (!netN) {
        const discN = parseFloat(String(w.discount || "").replace(/[^\d.]/g, "")) || 0;
        const isPct = /%/.test(String(w.discount || ""));
        if (grossN > 0 && discN > 0) netN = isPct ? +(grossN * (1 - discN / 100)).toFixed(2) : Math.max(0, grossN - discN);
      }
      const memoGross = grossN > 0 ? +grossN.toFixed(2) : "";
      const memoNet = netN > 0 ? +netN.toFixed(2) : "";
      byCamp[w.campaign].buttons.push({
        shortName: w.shortName, kitchen: w.kitchen, promoCode: w.codePromotion || w.codeItemSet || "",
        codePro: w.codePromotion || "", itemSetCode: w.codeItemSet || "",
        discount: w.discount, minAmount: w.minAmount,
        branchNote: w.branchNote || "",
        detail: w.detail || "", mechanic: w.mechanic || "", condition: w.condition || "",
        gross: memoGross, net: memoNet,
        itemCodes: Object.keys(codeMap[w.campaign + "|" + w.shortName] || {}).filter(Boolean),
      });
    });
    return Object.keys(byCamp).map(k => byCamp[k]);
  };

  /* ---- branch-facing: promos that apply to a given branch in a month ---- */
  API.getBranchPromotions = (branchId, month) => {
    const inStore = (storeStr) => {
      const ids = expandStoreIds(storeStr);
      if (ids === null) return true;
      return ids.includes(branchId);
    };
    // หน้าสาขาโชว์โปรที่ "เคย live แล้ว" (OP เคยยืนยัน = wentLive) หรือกำลัง CONFIRMED+COMPLETE
    // → โปรที่ขึ้นสาขาแล้วจะไม่หายระหว่างรอ OP ตรวจการ ขยาย/ลด/ยกเลิก (ป้ายค่อยขึ้นหลัง OP ยืนยัน)
    // (โปรใหม่ที่ยังไม่เคยผ่าน OP = ไม่ขึ้นหน้าสาขา)
    const branchReady = (c) => {
      const op = String(c.opStatus || "").toUpperCase();
      const it = String(c.itStatus || "").toUpperCase();
      return c.wentLive === true || (op === "CONFIRMED" && it === "COMPLETE");
    };
    return API.getMemoCampaigns(month).filter(c => branchReady(c) && inStore(c.stores));
  };

  /* ---- IT save settlement (saveSettlementBatch) ---- */
  API.saveSettlementBatch = (month, updates) => {
    if (!updates || !updates.length) return "NO_DATA";
    // cross-campaign duplicate check for Code Promotion / Code Item Set
    const campsInBatch = new Set(updates.map(u => u.campaign));
    const existPromo = {}, existItemSet = {}, existItemSetSig = {};
    store.working.forEach(w => {
      if (campsInBatch.has(w.campaign)) return; // skip the campaigns being saved now
      if (w.codePromotion) existPromo[String(w.codePromotion).trim().toUpperCase()] = w.campaign;
      if (w.codeItemSet) existItemSet[String(w.codeItemSet).trim().toUpperCase()] = w.campaign;
    });
    // ลายเซ็น item ต่อ Code Item Set (107) — item เดียวกัน = ยืมรหัสได้ (ไม่นับเป็น dup)
    Object.keys(store.months).forEach(m => store.months[m].forEach(r => {
      if (campsInBatch.has(r.campaign)) return;
      const c = String(r.codeItemSet || r.itemPromotion || "").trim().toUpperCase();
      if (!c) return;
      (existItemSetSig[c] = existItemSetSig[c] || new Set()).add(String(r.itemCode || "").trim());
    }));
    const sigOf = (set) => [...set].filter(Boolean).sort().join(",");
    /* โค้ดที่แคมเปญนี้ "ใช้อยู่เดิม" — กดบันทึกซ้ำเพื่ออัปเดต (เช่น งานขยาย/ลดเวลา) ไม่ใช่การออกโค้ดใหม่
       เดิมตรวจซ้ำแบบไม่แยกกรณีนี้ → IT บันทึกงานขยายไม่ได้ ขึ้น "Code Promotion ซ้ำ" ทั้งที่ไม่ได้แก้โค้ด */
    const prevCodes = new Set();
    const collectPrev = (r) => {
      if (!campsInBatch.has(r.campaign)) return;
      const a = String(r.codePromotion || "").trim().toUpperCase(); if (a) prevCodes.add(a);
      const b = String(r.promoCode || "").trim().toUpperCase(); if (b) prevCodes.add(b);
    };
    (store.working || []).forEach(collectPrev);
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(collectPrev));
    for (const u of updates) {
      const pc = String(u.promoCode || "").trim();
      if (!pc) continue;
      if (prevCodes.has(pc.toUpperCase())) continue;                 /* โค้ดเดิมของแคมเปญนี้ = อัปเดตข้อมูล ไม่ถือว่าซ้ำ */
      if (existPromo[pc.toUpperCase()]) return "DUP_PROMO|" + pc + "|" + existPromo[pc.toUpperCase()];
    }
    // Code Item Set: บล็อกเฉพาะรหัสซ้ำ + item ไม่ตรง (คนละของ) · item เดียวกัน = ยืมรหัส ผ่าน
    {
      const isCodes = new Set(updates.map(u => String(u.itemPromo || "").trim().toUpperCase()).filter(Boolean));
      for (const isU of isCodes) {
        if (!existItemSet[isU]) continue;
        const bSet = new Set(updates.filter(x => String(x.itemPromo || "").trim().toUpperCase() === isU).map(x => String(x.itemCode || "").trim()));
        if (sigOf(existItemSetSig[isU] || new Set()) !== sigOf(bSet)) {
          return "DUP_ITEMSET|" + isU + "|" + existItemSet[isU];
        }
      }
    }
    updates.forEach(upd => {
      const sheet = store.months[upd.month] || store.months[month];
      const idx = parseInt(upd.rowIdx, 10) - 2;
      if (sheet && sheet[idx]) {
        const row = sheet[idx];
        const _rowWasIS = /item set/i.test(String(row.typePromotion || row.promoType || "")) || !!row.codeItemSet || /^107/.test(String(row.itemPromotion || ""));
        if (upd.promoType) { row.promoType = upd.promoType; row.typePromotion = upd.promoType; row.typeSel = upd.promoType; if (_rowWasIS) row._wasItemSet = true; }
        row.codePromotion = upd.promoCode;
        row.itemPromotion = upd.itemPromo; row.kitchen = upd.kitchenName;
        row.shortName = upd.shortName; row.itStatus = "COMPLETE"; row.cateRemark = upd.cateRemark;
        row.itDoneDate = TODAY();
        // Item Set + Code Promotion = P-code (Pxxx จากฟอร์ม Item Set) → เปลี่ยน Type เป็น Price Promotion (ตามที่ผูกใน Backoffice) · เก็บ flag _wasItemSet ให้ Builder/Recipe ยังเห็น
        if (/item set/i.test(String(upd.promoType || "")) && /^P\s*\d/i.test(String(upd.promoCode || "").trim())) {
          row.promoType = "Price Promotion"; row.typePromotion = "Price Promotion"; row._wasItemSet = true;
        }
        // if this was rejected by OP, IT's save sends it back to OP for re-verification
        if (String(row.opStatus || "").toUpperCase() === "REJECTED") { row.opStatus = "WAITING"; row.rejectReason = ""; row.opDoneDate = ""; }
      }
      store.working.forEach(w => {
        if (w.campaign === upd.campaign) {
          const _wWasIS = /item set/i.test(String(w.typePromotion || w.promoType || "")) || !!w.codeItemSet || /^107/.test(String(w.itemPromotion || ""));
          w.itStatus = "COMPLETE"; if (upd.promoType) { w.promoType = upd.promoType; w.typePromotion = upd.promoType; w.typeSel = upd.promoType; if (_wWasIS) w._wasItemSet = true; } w.codePromotion = upd.promoCode;
          w.codeItemSet = upd.itemPromo; w.cateRemark = upd.cateRemark; w.updatedDate = NOW();
          w.itDoneDate = TODAY();
          if (/item set/i.test(String(upd.promoType || "")) && /^P\s*\d/i.test(String(upd.promoCode || "").trim())) {
            w.promoType = "Price Promotion"; w.typePromotion = "Price Promotion"; w._wasItemSet = true;
          }
          // loop back to OP: rejected → waiting re-check
          if (String(w.opStatus || "").toUpperCase() === "REJECTED") { w.opStatus = "WAITING"; w.rejectReason = ""; w.opDoneDate = ""; }
        }
      });
    });
    // Item Set: IT ยืนยัน Code Item Set แล้ว → สร้าง/อัปเดตปุ่มสินค้าในตารางสินค้า
    // (จังหวะที่ถูกต้อง — โค้ด 107 เพิ่งถูก autorun+ยืนยันตอนนี้ ไม่ใช่ตอน MKT ส่ง)
    const _isGroups = {};
    updates.forEach(u => {
      if (String(u.promoType || "").toUpperCase().indexOf("ITEM SET") < 0 && !/^107/.test(String(u.itemPromo || "").trim())) return;
      const code = String(u.itemPromo || "").trim();
      if (!code) return;
      const gk = u.campaign + "|" + u.shortName;
      if (!_isGroups[gk]) _isGroups[gk] = { code, campaign: u.campaign, shortName: u.shortName, promoCode: u.promoCode || "", netPrice: u.netPrice || "", items: [] };
      _isGroups[gk].items.push({ originalPrice: u.price, qty: u.qty, itemCode: u.itemCode, itemNameEN: u.itemNameEN });
    });
    Object.keys(_isGroups).forEach(gk => {
      const grp = _isGroups[gk];
      // header info จาก month rows (source of truth — มี cate/saleMode/stores ครบ)
      let hdr = null;
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (!hdr && String(r.campaign) === grp.campaign && String(r.shortName) === grp.shortName) hdr = r;
      }));
      hdr = hdr || {};
      const info = {
        campaign: grp.campaign, shortName: grp.shortName, kitchenName: hdr.kitchen,
        postCate: hdr.cate || hdr.cateRemark || "Promotion set", saleMode: hdr.saleMode,
        storeSelection: hdr.stores, start: hdr.start, end: hdr.end,
        codePromotion: grp.promoCode || "", netPrice: grp.netPrice || "",
      };
      const tg = grp.items.reduce((a, it) => a + (parseFloat(it.originalPrice) || 0) * (parseInt(it.qty) || 1), 0);
      itemsetToProducts(info, grp.code, tg, grp.items);
    });
    /* \u2b50 \u0e17\u0e38\u0e01\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e2d\u0e37\u0e48\u0e19 (Coupon · Bill Discount · Voucher · Price Promotion) \u2192 \u0e40\u0e02\u0e35\u0e22\u0e19\u0e25\u0e07\u0e15\u0e32\u0e23\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e25\u0e31\u0e01\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e40\u0e21\u0e37\u0e48\u0e2d IT \u0e01\u0e14\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e17\u0e38\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07
       (\u0e40\u0e14\u0e34\u0e21\u0e40\u0e02\u0e35\u0e22\u0e19\u0e40\u0e09\u0e1e\u0e32\u0e30 Item Set \u2192 \u0e07\u0e32\u0e19\u0e2d\u0e37\u0e48\u0e19\u0e44\u0e21\u0e48\u0e21\u0e35\u0e15\u0e31\u0e27\u0e15\u0e19\u0e43\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e25\u0e31\u0e01 \u0e15\u0e2d\u0e19\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d\u0e08\u0e36\u0e07\u0e2b\u0e32\u0e44\u0e21\u0e48\u0e40\u0e08\u0e2d) */
    let _promoProducts = 0;
    const _seenPromoKey = {};
    updates.forEach(u => {
      const pt = String(u.promoType || "");
      const isIS = pt.toUpperCase().indexOf("ITEM SET") >= 0 || /^107/.test(String(u.itemPromo || "").trim());
      if (isIS) return;
      const code = String(u.itemPromo || u.promoCode || "").trim();
      if (!code) return;
      const gk = code + "|" + (u.campaign || "") + "|" + (u.shortName || "");
      if (_seenPromoKey[gk]) return;
      _seenPromoKey[gk] = 1;
      let hdr = null;
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (!hdr && String(r.campaign) === String(u.campaign) && String(r.shortName) === String(u.shortName)) hdr = r;
      }));
      hdr = hdr || {};
      _promoProducts += promoToProducts({
        campaign: u.campaign, shortName: u.shortName || hdr.shortName, kitchenName: u.kitchenName || hdr.kitchen,
        postCate: u.cateRemark || hdr.cate || hdr.cateRemark || "", saleMode: hdr.saleMode, storeSelection: hdr.stores,
        start: hdr.start, end: hdr.end, gross: u.netPrice || u.price || hdr.gross || "",
      }, code, pt || hdr.typePromotion || hdr.promoType || "Promotion");
    });
    // ✅ ยืนยันเลข Code Item Set (107) ในตัวนับกลาง — เลขที่ IT ปิดงานแล้วถูกล็อกถาวร (ไม่แจกซ้ำ) · ปลอดภัยกับเลขที่พิมพ์เอง (ไม่เคย reserve → confirm no-op)
    try {
      if (window.PC_COUNTER && PC_COUNTER.confirm) {
        Object.keys(_isGroups).forEach(gk => {
          const code = String(_isGroups[gk].code || "").trim();
          // ล็อกเลข Code Item Set ตามหมวดที่จองมา: 107 = counter itemset · 105/106/109 = counter item (per-cate)
          if (/^107\d+$/.test(code)) { try { PC_COUNTER.confirm(code, "itemset", { campaign: _isGroups[gk].campaign }); } catch (e) {} }
          else if (/^(105|106|109)\d+$/.test(code)) { try { PC_COUNTER.confirm(code, "item", { campaign: _isGroups[gk].campaign }); } catch (e) {} }
        });
      }
    } catch (e) {}
    persist();
    try {
      if (window.PC_notify) {
        const cs = [...campsInBatch].filter(Boolean);
        window.PC_notify("it_settlement_done", { text: 'IT ตั้งค่า POS / ขึ้นปุ่มเสร็จ: ' + cs.join(', ') + ' — พร้อมใช้งานที่สาขา' });
        if (Object.keys(_isGroups).length) window.PC_notify("itemset_done", { text: 'Item Set ขึ้นปุ่มเสร็จ ' + Object.keys(_isGroups).length + ' ปุ่ม (' + cs.join(', ') + ') — ยืนยัน Code Item Set แล้ว' });
      }
    } catch (e) {}
    return "SUCCESS";
  };

  /* ---- extend / reduce (extendCampaign) — sets changeStatus marker, keeps IT completion ---- */
  API.extendCampaign = (campaignName, newEndDate, extendNote) => {
    let mode = "EXTENDED";
    store.working.forEach(w => {
      if (w.campaign === campaignName && new Date(newEndDate) < new Date(w.end)) mode = "REDUCED";
    });
    const note = String(extendNote || "").trim();
    Object.keys(store.months).forEach(m => store.months[m].forEach(r => {
      if (r.campaign === campaignName) { if (String(r.opStatus||"").toUpperCase()==="CONFIRMED") r.wentLive = true; r.end = newEndDate; r.changeStatus = mode; r.itStatus = "PENDING"; r.opStatus = "WAITING"; r.opDoneDate = ""; if (note) r.extendCodeNote = note; }
    }));
    store.working.forEach(w => {
      if (w.campaign === campaignName) { if (String(w.opStatus||"").toUpperCase()==="CONFIRMED") w.wentLive = true; w.end = newEndDate; w.changeStatus = mode; w.itStatus = "PENDING"; w.opStatus = "WAITING"; w.opDoneDate = ""; w.updatedDate = NOW(); if (note) w.extendCodeNote = note; }
    });
    persist();
    try { syncCoPromoDates(campaignName, { end: newEndDate, lifecycle: mode }); } catch (e) {}
    const label = mode === "REDUCED" ? "ลดระยะเวลา" : "ขยายระยะเวลา";
    sendMail("it@rocks-foods.com", "[" + label + "] " + campaignName, "MKT โปรดทราบ: แคมเปญ \"" + campaignName + "\" " + label + " เป็นวันที่ " + newEndDate + (note ? "\nหมายเหตุถึง IT: " + note : ""));
    try { if (window.PC_notify) window.PC_notify(mode === "REDUCED" ? "promo_reduced" : "promo_extended", { threadKey: campaignName, text: label + 'โปร “' + campaignName + '” — สิ้นสุดใหม่ ' + newEndDate + ' · รอ OP ยืนยัน' }); } catch (e) {}
    return { status: "success", message: "✅ " + label + "เรียบร้อย และส่งเมลแจ้ง MKT แล้ว (" + mode + ")" };
  };

  /* ---- cancel (cancelCampaign) — sets CANCELLED marker, keeps record visible ---- */
  API.cancelCampaign = (campaignName, reason) => {
    Object.keys(store.months).forEach(m => store.months[m].forEach(r => {
      if (r.campaign === campaignName) { if (String(r.opStatus||"").toUpperCase()==="CONFIRMED") r.wentLive = true; r.changeStatus = "CANCELLED"; r.cancelReason = reason || ""; r.opStatus = "WAITING"; r.opDoneDate = ""; }
    }));
    store.working.forEach(w => {
      if (w.campaign === campaignName) { if (String(w.opStatus||"").toUpperCase()==="CONFIRMED") w.wentLive = true; w.changeStatus = "CANCELLED"; w.cancelReason = reason || ""; w.reason = reason || ""; w.opStatus = "WAITING"; w.opDoneDate = ""; w.updatedDate = NOW(); }
    });
    sendMail("it@rocks-foods.com", "[ยกเลิกโปรโมชั่น] " + campaignName, "MKT โปรดทราบ: แคมเปญ \"" + campaignName + "\" ถูกยกเลิก\nเหตุผล: " + (reason || "-") + "\nปุ่มถูกนำออกจาก POS แล้ว (ข้อมูลยังคงอยู่ในระบบเพื่อการติดตาม)");
    persist();
    try { syncCoPromoDates(campaignName, { lifecycle: "CANCELLED" }); } catch (e) {}
    try { if (window.PC_notify) window.PC_notify("promo_cancelled", { threadKey: campaignName, text: 'ยกเลิกโปร “' + campaignName + '”' + (reason ? ' — ' + reason : '') + ' · โปรดนำปุ่มออกจาก POS · รอ OP ยืนยัน' }); } catch (e) {}
    return { status: "success", message: "✅ ยกเลิกแคมเปญเรียบร้อย · นำปุ่มออกจาก POS · ส่งเมลแจ้ง MKT แล้ว" };
  };

  /* ---- IT ปิดงานยกเลิก: ลบปุ่มออกจาก POS + คืนโค้ด (itRemoveCancelled) ----
     เรียกจากหน้า IT Settlement การ์ดที่ติดป้าย CANCELLED · ฝั่งหน้าเว็บคืนเลขเข้า pool (PC_COUNTER) ก่อน แล้วเรียกตัวนี้ปิดงาน */
  API.itRemoveCancelled = (campaignName, month, returnedCodes, onlyShort) => {
    const c = String(campaignName || "").trim();
    const codes = Array.isArray(returnedCodes) ? returnedCodes.filter(Boolean) : [];
    /* FX-P71 — ลบเฉพาะปุ่มที่อยู่บนการ์ดที่กด (หน้าเว็บส่งรายชื่อปุ่มมา) — กันลามไปปุ่มอื่น/เดือนอื่น */
    const onlySn = Array.isArray(onlyShort) ? onlyShort.map(x => String(x || "").trim()).filter(Boolean) : [];
    let n = 0;
    const apply = (r) => {
      if (String(r.campaign || "").trim() !== c) return;
      if (String(r.changeStatus || "").toUpperCase() !== "CANCELLED") return;
      if (onlySn.length && onlySn.indexOf(String(r.shortName || "").trim()) === -1) return;
      r.itStatus = "COMPLETE"; r.itDoneDate = NOW(); r.posReady = false;
      r.removedFromPos = true; r.codesReturned = codes.slice();
      r.cancelHandled = true; r.cancelAction = "REMOVED"; r.cancelHandledDate = NOW();
      r.opStatus = "WAITING"; r.opDoneDate = "";
      r.updatedDate = NOW(); n++;
    };
    Object.keys(store.months).forEach(m => { if (!month || month === "ALL" || m === month) (store.months[m] || []).forEach(apply); });
    (store.working || []).forEach(apply);
    /* คำขอโค้ดของแคมเปญนี้ในคิว MKT→IT ปิดเป็น "คืนแล้ว" กันงานค้าง */
    try {
      const reqs = JSON.parse(localStorage.getItem("pc_code_requests") || "[]");
      let touched = 0;
      reqs.forEach(q => { if (q && String(q.campaign || "").trim() === c && q.itStatus !== "DONE") { q.itStatus = "DONE"; q.cancelled = true; q.returnedAt = Date.now(); touched++; } });
      if (touched) localStorage.setItem("pc_code_requests", JSON.stringify(reqs));
    } catch (e) {}
    persist();
    sendMail("mkt@rocks-foods.com", "[ลบโปรออกจากระบบ] " + c,
      "IT นำปุ่มออกจาก POS แล้ว และคืนโค้ดเข้าคลัง" + (codes.length ? " (" + codes.join(", ") + ")" : "") + "\nแคมเปญ: " + c);
    try { if (window.PC_notify) window.PC_notify("promo_removed", { threadKey: c, text: 'IT ลบโปร “' + c + '” ออกจากระบบแล้ว' + (codes.length ? ' · คืนโค้ด ' + codes.join(", ") : '') }); } catch (e) {}
    return { status: "success", rows: n, codes, message: "✅ ลบออกจาก POS แล้ว " + n + " ปุ่ม" + (codes.length ? " · คืนโค้ด " + codes.length + " เลข" : "") };
  };

  /* ---- IT ปิดงานยกเลิกแบบ "เคยขึ้นปุ่มแล้ว" (itKeepCancelled) ----
     โปรที่เคยขึ้น POS จริงแล้ว: ยกเลิกได้แต่ลบออกจากระบบไม่ได้ และคืนโค้ดไม่ได้ (เลขถูกใช้ไปแล้ว)
     → คงปุ่มไว้ในระบบ ปิดการขาย บันทึกหมายเหตุว่าโค้ดถูกใช้ถาวร */
  API.itKeepCancelled = (campaignName, month, note, onlyShort) => {
    const c = String(campaignName || "").trim();
    const remark = String(note || "").trim();
    const onlySnK = Array.isArray(onlyShort) ? onlyShort.map(x => String(x || "").trim()).filter(Boolean) : [];
    let n = 0;
    const apply = (r) => {
      if (String(r.campaign || "").trim() !== c) return;
      if (String(r.changeStatus || "").toUpperCase() !== "CANCELLED") return;
      if (onlySnK.length && onlySnK.indexOf(String(r.shortName || "").trim()) === -1) return;
      r.itStatus = "COMPLETE"; r.itDoneDate = NOW();
      r.posReady = false;                    /* ปิดการขาย แต่ไม่ลบออกจากระบบ */
      r.removedFromPos = false;
      r.codeBurned = true;                   /* โค้ดถูกใช้ไปแล้ว คืนคลังไม่ได้ */
      r.cancelHandled = true; r.cancelAction = "KEPT"; r.cancelHandledDate = NOW();
      if (remark) r.itRemark = remark;
      r.opStatus = "WAITING"; r.opDoneDate = "";
      r.updatedDate = NOW(); n++;
    };
    Object.keys(store.months).forEach(m => { if (!month || month === "ALL" || m === month) (store.months[m] || []).forEach(apply); });
    (store.working || []).forEach(apply);
    persist();
    sendMail("mkt@rocks-foods.com", "[ยกเลิกโปร — คงไว้ในระบบ] " + c,
      "โปรนี้เคยขึ้นปุ่มบน POS แล้ว จึงปิดการขายแต่ไม่ลบออกจากระบบ และคืนโค้ดไม่ได้\nแคมเปญ: " + c + (remark ? "\nหมายเหตุ IT: " + remark : ""));
    try { if (window.PC_notify) window.PC_notify("promo_kept", { threadKey: c, text: 'IT ปิดการขาย “' + c + '” แล้ว (เคยขึ้นปุ่มแล้ว — คงไว้ในระบบ คืนโค้ดไม่ได้)' }); } catch (e) {}
    return { status: "success", rows: n, message: "✅ ปิดการขายแล้ว " + n + " ปุ่ม · คงไว้ในระบบ (คืนโค้ดไม่ได้)" };
  };

  /* ---- ยกเลิกคำสั่งขยาย/ลด/ยกเลิก ที่แจ้งผิด → คืนโปรกลับสถานะปกติ (revertChange) ----
     ใช้เมื่อ MKT แจ้งผิดคน/ผิดโปร หรือกดพลาด · คืนวันจบเดิมได้ถ้าระบุมา */
  API.revertChange = (campaignName, restoreEnd) => {
    const c = String(campaignName || "").trim();
    let n = 0;
    const apply = (r) => {
      if (String(r.campaign || "").trim() !== c) return;
      if (!String(r.changeStatus || "").trim() && !r.cancelHandled) return;
      r.changeStatus = ""; r.cancelReason = ""; r.reason = ""; r.extendCodeNote = "";
      r.cancelHandled = false; r.cancelAction = ""; r.cancelHandledDate = "";
      r.codeBurned = false; r.removedFromPos = false; r.codesReturned = [];
      r.itRemark = "";
      r.itStatus = "COMPLETE"; r.itDoneDate = r.itDoneDate || TODAY();
      r.opStatus = "CONFIRMED"; r.opDoneDate = r.opDoneDate || TODAY();
      r.posReady = true;
      if (restoreEnd) r.end = restoreEnd;
      r.updatedDate = NOW(); n++;
    };
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(apply));
    (store.working || []).forEach(apply);
    persist();
    return { status: "success", rows: n, message: "คืนสถานะปกติแล้ว " + n + " แถว" };
  };

  /* ---- เปลี่ยนตัวย่อในตารางโปรโมชั่น (renameAbbr) ----
     ใช้โดย js/abbr-rename.js · แก้ Kitchen Name (และ Short Name ถ้าเลือก) ทุกแถวที่มีตัวย่อนั้น
     ตัวย่ออาจมีอักษรไซซ์นำหน้า (MSCF+LCK → MCFSQ+LCK) จึงเก็บ prefix ไว้ */
  API.renameAbbr = (oldAbbr, newAbbr, opt) => {
    const o = String(oldAbbr || '').trim(), n = String(newAbbr || '').trim();
    opt = opt || {};
    if (!o || !n || o.toUpperCase() === n.toUpperCase()) return { status: "error", kitchen: 0, shortName: 0, message: "ตัวย่อไม่ถูกต้อง" };
    const SP = String(opt.sizePrefix || "SBLJMGT");
    const rxEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp("(^|[^A-Za-z0-9])([" + SP + "]?)(" + rxEsc(o) + ")(?![A-Za-z0-9])", "gi");
    const swap = (t) => String(t == null ? "" : t).replace(rx, (m, pre, size) => pre + size + n);
    const includeLive = opt.includeLive !== false;
    /* รายการที่ IT สั่งไม่ให้เปลี่ยน — ตัดตาม Item Code หรือข้อความเดิมทั้งค่า */
    const exC = {}, exT = {};
    (opt.exclude || []).forEach(c => { const k = String(c == null ? "" : c).trim(); if (k) exC[k] = 1; });
    (opt.excludeText || []).forEach(t => { const k = String(t == null ? "" : t).trim().toLowerCase(); if (k) exT[k] = 1; });
    const exCode = (c) => !!exC[String(c == null ? "" : c).trim()];
    const exTxt = (v) => !!exT[String(v == null ? "" : v).trim().toLowerCase()];
    let kitchen = 0, shortName = 0, itemNames = 0, products = 0, pending = 0;
    /* บันทึกค่าเก่าทุกจุดที่เปลี่ยน → undo คืนเฉพาะที่ครั้งนี้เปลี่ยน (กันการ swap กลับไปทับชื่อที่เป็นตัวย่อใหม่อยู่ก่อนแล้ว) */
    const changes = { rows: [], products: [], npd: [], flavor: [] };
    const ROW_F = ["kitchen", "shortName", "itemNameEN", "itemNameTH", "detail", "mechanic"];
    const touch = (r, bucket, idx) => {
      const live = String(r.itStatus || "").toUpperCase() === "COMPLETE" && String(r.opStatus || "").toUpperCase() === "CONFIRMED";
      if (!includeLive && live) return;
      if (exCode(r.itemCode)) return;
      const before = {};
      ROW_F.forEach(f => {
        if (f === "shortName" && !opt.withShortName) return;
        const v = String(r[f] || "");
        if (!v || swap(v) === v) return;
        if (exTxt(v)) return;
        before[f] = v; r[f] = swap(v);
        if (f === "kitchen") kitchen++;
        else if (f === "shortName") shortName++;
        else if (f === "itemNameEN" || f === "itemNameTH") itemNames++;
      });
      if (!Object.keys(before).length) return;
      changes.rows.push({ where: bucket, idx: idx, before: before });
      if (!live) pending++;
      r.updatedDate = NOW();
    };
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach((r, i) => touch(r, "m:" + m, i)));
    (store.working || []).forEach((r, i) => touch(r, "w", i));
    /* สินค้าที่ IT สร้างเข้าข้อมูลหลักแล้ว (store.npdProducts) */
    (store.npdProducts || []).forEach(p => {
      if (exCode(p.itemCode)) return;
      const before = {};
      ["itemNameEN", "itemNameTH"].forEach(f => {
        const v = String(p[f] || "");
        if (!v || swap(v) === v) return;
        if (exTxt(v)) return;
        before[f] = v; p[f] = swap(v); products++;
      });
      if (Object.keys(before).length) changes.products.push({ code: String(p.itemCode), before: before });
    });
    /* งาน NPD / เพิ่มผง ที่ IT ยังไม่ปิด — ชื่อในนั้นจะกลายเป็นสินค้าจริงตอนกด COMPLETE */
    (store.npd || []).forEach(nn => (nn.items || []).forEach((it, ii) => {
      const before = {};
      if (exCode(it.itemCode)) return;
      ["nameEN", "nameTH", "itemNameEN", "itemNameTH", "kitchenName", "shortName"].forEach(f => {
        const v = String(it[f] || "");
        if (!v || swap(v) === v) return;
        if (exTxt(v)) return;
        before[f] = v; it[f] = swap(v); pending++;
      });
      if (Object.keys(before).length) changes.npd.push({ id: nn.id, i: ii, before: before });
    }));
    (store.flavor || []).forEach(nn => (nn.groups || []).forEach((g, gi) => (g.flavors || []).forEach((f, fi) => {
      const before = {};
      if (exCode(f.itemCode)) return;
      ["nameEN", "eng", "nameTH", "short"].forEach(k2 => {
        const v = String(f[k2] || "");
        if (!v || swap(v) === v) return;
        if (exTxt(v)) return;
        before[k2] = v; f[k2] = swap(v); pending++;
      });
      if (Object.keys(before).length) changes.flavor.push({ id: nn.id, g: gi, f: fi, before: before });
    })));
    /* จดตัวย่อเก่า→ใหม่ไว้ → อะไรที่สร้างทีหลังจะบันทึกด้วยตัวย่อใหม่เสมอ (abbrFix) */
    store.abbrMap = (store.abbrMap || []).filter(x => !(x && String(x.old).toUpperCase() === o.toUpperCase() && String(x.new).toUpperCase() === n.toUpperCase()));
    /* กระบวนการ undo: ถ้านี่เป็นการเปลี่ยนกลับ (new→old ของรายการเดิม) → ถอดรายการเดิมออกจากแผน */
    const undoOf = store.abbrMap.findIndex(x => x && String(x.old).toUpperCase() === n.toUpperCase() && String(x.new).toUpperCase() === o.toUpperCase());
    if (undoOf >= 0) store.abbrMap.splice(undoOf, 1);
    else store.abbrMap.push({ old: o, new: n, at: NOW() });
    persist();
    return { status: "success", kitchen, shortName, itemNames, products, pending, changes, message: "เปลี่ยนตัวย่อในตารางโปรแล้ว (ปุ่มครัว " + kitchen + " · ชื่อปุ่ม " + shortName + " · ชื่อสินค้าในแถวโปร " + itemNames + " · สินค้าที่ IT สร้างไว้ " + products + ")" };
  };

  /* ---- คืนค่าเดิมเฉพาะจุดที่ renameAbbr เปลี่ยนจริง (ใช้ตอนกด "ย้อนกลับ") ---- */
  API.restoreAbbrChanges = (changes, pair) => {
    changes = changes || {};
    let n = 0;
    (changes.rows || []).forEach(c => {
      const arr = c.where === "w" ? store.working : (store.months[String(c.where).slice(2)] || []);
      const r = arr && arr[c.idx];
      if (!r) return;
      Object.keys(c.before || {}).forEach(f => { r[f] = c.before[f]; n++; });
      r.updatedDate = NOW();
    });
    (changes.products || []).forEach(c => {
      const p = (store.npdProducts || []).find(x => String(x.itemCode) === String(c.code));
      if (!p) return;
      Object.keys(c.before || {}).forEach(f => { p[f] = c.before[f]; n++; });
    });
    (changes.npd || []).forEach(c => {
      const nn = (store.npd || []).find(x => x.id === c.id); const it = nn && (nn.items || [])[c.i];
      if (!it) return;
      Object.keys(c.before || {}).forEach(f => { it[f] = c.before[f]; n++; });
    });
    (changes.flavor || []).forEach(c => {
      const nn = (store.flavor || []).find(x => x.id === c.id);
      const g = nn && (nn.groups || [])[c.g]; const f = g && (g.flavors || [])[c.f];
      if (!f) return;
      Object.keys(c.before || {}).forEach(k2 => { f[k2] = c.before[k2]; n++; });
    });
    /* ถอดตัวย่อคู่นี้ออกจากแผน → ของที่สร้างทีหลังกลับใช้ตัวย่อเดิม */
    if (pair && pair.old && pair.new) {
      store.abbrMap = (store.abbrMap || []).filter(x => !(x && String(x.old).toUpperCase() === String(pair.old).toUpperCase() && String(x.new).toUpperCase() === String(pair.new).toUpperCase()));
    }
    persist();
    return { status: "success", restored: n };
  };

  /* ---- สกานผลกระทบก่อนเปลี่ยน (abbrScan) — อ่านจากแถวปุ่มจริงใน store.months
     (getAllCampaignData เป็นระดับแคมเปญ ไม่มี kitchen/ชื่อสินค้า → preview เคยนับไม่ครบ) */
  API.abbrScan = (oldAbbr, newAbbr, opt) => {
    const o = String(oldAbbr || "").trim(), n2 = String(newAbbr || "").trim();
    opt = opt || {};
    const out = { kitchen: [], shortName: [], rowItems: [], itemStart: {}, itemEnd: {} };
    if (!o || !n2) return out;
    const SP = String(opt.sizePrefix || "SBLJMGT");
    const rxE = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx2 = new RegExp("(^|[^A-Za-z0-9])([" + SP + "]?)(" + rxE(o) + ")(?![A-Za-z0-9])", "gi");
    const sw = (t) => String(t == null ? "" : t).replace(rx2, (m, pre, size) => pre + size + n2);
    const seenK = {}, seenS = {};
    const scan = (r) => {
      const itSt = String(r.itStatus || "").toUpperCase(), opSt = String(r.opStatus || "").toUpperCase();
      const live = itSt === "COMPLETE" && opSt === "CONFIRMED";
      const k = String(r.kitchen || "");
      if (k && sw(k) !== k && !seenK[k]) { seenK[k] = 1; out.kitchen.push({ from: k, to: sw(k), campaign: r.campaign || "", live, start: r.start || "", end: r.end || "" }); }
      const sn = String(r.shortName || "");
      if (sn && sw(sn) !== sn && !seenS[sn]) { seenS[sn] = 1; out.shortName.push({ from: sn, to: sw(sn), campaign: r.campaign || "", start: r.start || "", end: r.end || "" }); }
      /* วันที่เริ่มของปุ่มที่สินค้าตัวนี้ถูกใช้ครั้งแรกสุด — ใช้เติมคอลัมน์ "วันที่เริ่ม" ให้ข้อมูลหลักสินค้า */
      const _ic = String(r.itemCode || "").trim(), _st = String(r.start || "").trim();
      if (_ic && _st && (!out.itemStart[_ic] || _st < out.itemStart[_ic])) out.itemStart[_ic] = _st;
      const _en2 = String(r.end || "").trim();
      if (_ic && _en2 && (!out.itemEnd[_ic] || _en2 > out.itemEnd[_ic])) out.itemEnd[_ic] = _en2;
      const en = String(r.itemNameEN || ""), th = String(r.itemNameTH || "");
      if ((en && sw(en) !== en) || (th && sw(th) !== th)) {
        out.rowItems.push({
          code: r.itemCode || "", from: en || th, to: sw(en || th), campaign: r.campaign || "", shortName: r.shortName || "", start: r.start || "", end: r.end || "",
          waiting: !live, stage: itSt !== "COMPLETE" ? "รอ IT ตั้งค่า" : (opSt !== "CONFIRMED" ? "รอ OP ตรวจ" : "ขึ้น POS แล้ว"),
        });
      }
    };
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(scan));
    (store.working || []).forEach(scan);
    return out;
  };

  /* ---- วันที่เริ่ม/สิ้นสุด ระดับสินค้า — เกณฑ์เดียวกับตาราง "ราคารายสาขา" ในข้อมูลหลักสินค้า
     (ค่าที่ตั้งรายสาขา → ถ้าไม่มีใช้ของสินค้าเอง fromDate/toDate) · คืน { code: {start,end} } */
  API.getItemDateRanges = () => {
    const out = {};
    const put = (code, st, en) => {
      const c = String(code || "").trim(); if (!c) return;
      const o = out[c] || (out[c] = { start: "", end: "" });
      const s2 = String(st || "").trim(), e2 = String(en || "").trim();
      if (s2 && (!o.start || s2 < o.start)) o.start = s2;
      if (e2 && (!o.end || e2 > o.end)) o.end = e2;
    };
    let edits = {};
    try { edits = JSON.parse(localStorage.getItem("pc_product_edits") || "{}") || {}; } catch (e) { edits = {}; }
    Object.keys(edits).forEach(code => {
      const ed = edits[code] || {};
      put(code, ed.fromDate || ed.start || "", ed.toDate || ed.end || "");
      const bp = ed.branchPrices && typeof ed.branchPrices === "object" ? ed.branchPrices : {};
      Object.keys(bp).forEach(bid => { const d = bp[bid] || {}; put(code, d.startDate, d.endDate); });
    });
    (store.npdProducts || []).forEach(p => put(p.itemCode, p.fromDate || p.start, p.toDate || p.end));
    /* FX-P41: ข้อมูลหลักสินค้าที่มาจากไฟล์ master (Item Set เก่า/Inactive) มีช่วงเวลาของตัวเองในคอลัมน์ start/end — เดิมไม่ถูกอ่าน ทำให้ตารางโชว์ "—" */
    try { (window.PC_ITEM_MASTER || []).forEach(p => put(p.itemCode, p.start || p.fromDate, p.end || p.toDate)); } catch (e) {}
    /* แถวโปรจริง — สินค้าที่ยังไม่มีค่าในข้อมูลหลักก็ได้ช่วงเวลาจากปุ่มที่ใช้อยู่ */
    const scanRow = (r) => put(r.itemCode, r.start, r.end);
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(scanRow));
    (store.working || []).forEach(scanRow);
    return out;
  };

  /* ---- คัดลอกแคมเปญทั้งชุด (cloneCampaign) ----
     ใช้เวลาโปรเดิมแตกไปอีกช่องทาง/อีกชุด: ก็อปทุกแถว+ทุกปุ่ม แล้วแก้เฉพาะที่ระบุ
     opts: { saleMode, start, end, stores, shortFrom, shortTo, keepItemSetCode(false=ให้ IT ออกใหม่), promoType, detail } */
  API.cloneCampaign = (srcName, newName, opts) => {
    const src = String(srcName || "").trim(), dst = String(newName || "").trim();
    opts = opts || {};
    if (!src || !dst) return { status: "error", message: "ต้องระบุชื่อแคมเปญต้นทางและชื่อใหม่" };
    const exists = (r) => String(r.campaign || "").trim() === dst;
    if ((store.working || []).some(exists) || Object.keys(store.months).some(m => (store.months[m] || []).some(exists)))
      return { status: "error", message: 'มีแคมเปญชื่อ "' + dst + '" อยู่แล้ว' };
    const pick = (r) => String(r.campaign || "").trim() === src;
    const conv = (r) => {
      const n = JSON.parse(JSON.stringify(r));
      n.campaign = dst;
      if (opts.saleMode) n.saleMode = opts.saleMode;
      if (opts.start) n.start = opts.start;
      if (opts.end) n.end = opts.end;
      if (opts.stores) n.stores = opts.stores;
      if (opts.detail) n.detail = opts.detail;
      if (opts.promoType) { n.promoType = opts.promoType; n.typePromotion = opts.promoType; }
      if (opts.shortFrom && opts.shortTo) n.shortName = String(n.shortName || "").split(opts.shortFrom).join(opts.shortTo);
      if (!opts.keepItemSetCode) { n.codeItemSet = ""; n.itemPromotion = ""; }   /* ให้ IT ออกเลขใหม่ กันรหัสซ้ำ */
      n.codePromotion = opts.keepPromoCode ? n.codePromotion : "";
      n.itStatus = "PENDING"; n.opStatus = "WAITING"; n.changeStatus = "";
      n.itDoneDate = ""; n.opDoneDate = ""; n.posReady = false; n.wentLive = false;
      n.rejectReason = ""; n.rejectCount = 0; n.cancelReason = ""; n.reason = "";
      n.cancelHandled = false; n.removedFromPos = false; n.codesReturned = [];
      n.memoUrl = ""; n.attachment = r.attachment || "";
      n.submittedDate = NOW(); n.updatedDate = NOW(); n.timestamp = NOW();
      n.clonedFrom = src;
      return n;
    };
    let nW = 0, nM = 0;
    const addW = (store.working || []).filter(pick).map(conv);
    addW.forEach(r => store.working.push(r)); nW = addW.length;
    Object.keys(store.months).forEach(m => {
      const add = (store.months[m] || []).filter(pick).map(conv);
      add.forEach(r => { if (opts.start) r.month = String(opts.start).slice(0, 7); store.months[r.month || m] = store.months[r.month || m] || []; store.months[r.month || m].push(r); });
      nM += add.length;
    });
    if (!nW && !nM) return { status: "error", message: 'ไม่พบแคมเปญ "' + src + '"' };
    persist();
    try { if (window.PC_notify) window.PC_notify("promo_new", { text: 'คัดลอกโปรใหม่ "' + dst + '" — รอ IT ตั้งค่า' }); } catch (e) {}
    return { status: "success", rows: nM, buttons: [...new Set(addW.map(r => r.shortName))].length, message: "คัดลอกแล้ว " + nM + " แถว → " + dst };
  };

  /* ---- แก้ค่าในแถวโปรตรง ๆ (patchRows) ----
     ใช้ตอนต้องแก้ราคา/ชื่อปุ่ม/ค่าอื่นในฐานจริง โดยเขียนผ่าน store ในหน่วยความจำ + persist
     (เขียน localStorage ตรง ๆ ไม่อยู่ เพราะตัวซิงค์/persist ทับกลับ)
     match: { campaign, shortName?, netPrice? } · set: { field: value } */
  API.patchRows = (match, set) => {
    match = match || {}; set = set || {};
    const c = String(match.campaign || "").trim();
    let n = 0;
    const hit = (r) => {
      if (c && String(r.campaign || "").trim() !== c) return false;
      if (match.shortName && String(r.shortName || "").trim() !== String(match.shortName).trim()) return false;
      if (match.netPrice != null && String(r.netPrice || "").trim() !== String(match.netPrice).trim()) return false;
      return true;
    };
    const apply = (r) => {
      if (!hit(r)) return;
      Object.keys(set).forEach(k => {
        const v = set[k];
        if (v && typeof v === "object" && v.replace) r[k] = String(r[k] == null ? "" : r[k]).split(v.replace).join(v.with);
        else r[k] = v;
      });
      r.updatedDate = NOW(); n++;
    };
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(apply));
    (store.working || []).forEach(apply);
    persist();
    return { status: "success", rows: n, message: "แก้ไขแล้ว " + n + " แถว" };
  };

  /* ---- เพิ่มแถวสินค้าเข้าไปในชุดโปร (ปุ่มเดิม) ----
     ใช้เมื่อแจ้งโปรมาแล้วลงรายการสินค้าในชุดไม่ครบ (รายงานส่วนลดคำนวณไม่ได้)
     คัดฟิลด์ระดับปุ่ม (แคมเปญ/ช่วงเวลา/โค้ด/ราคาชุด) จากแถวเดิม แล้วแทนที่เฉพาะข้อมูลสินค้า
     item: { itemCode, itemNameEN, itemNameTH?, qty?, gross?, discount?, catCode? } */
  API.addItemRowToButton = (campaign, shortName, item) => {
    const c = String(campaign || "").trim(), sn = String(shortName || "").trim();
    item = item || {};
    const code = String(item.itemCode || "").trim();
    if (!c || !sn) return { status: "error", message: "ต้องระบุแคมเปญและชื่อปุ่ม" };
    if (!code) return { status: "error", message: "ต้องระบุรหัสสินค้า" };
    const same = (r) => String(r.campaign || "").trim() === c && String(r.shortName || "").trim() === sn;
    let added = 0, dup = 0;
    Object.keys(store.months).forEach(m => {
      const rows = store.months[m] || [];
      const base = rows.find(same);
      if (!base) return;
      if (rows.some(r => same(r) && String(r.itemCode || "").trim() === code)) { dup++; return; }
      const row = JSON.parse(JSON.stringify(base));
      row.itemCode = code;
      row.itemNameEN = item.itemNameEN || code;
      row.itemNameTH = item.itemNameTH || item.itemNameEN || code;
      row.qty = item.qty == null ? 1 : item.qty;
      row.gross = item.gross == null ? "" : item.gross;
      row.price = row.gross;
      row.discount = item.discount == null ? 0 : item.discount;
      row.catCode = item.catCode || String(code).slice(0, 3);
      row.updatedBy = item.by || "system:add-item";
      row.updatedDate = NOW();
      rows.push(row); added++;
    });
    if (!added) return { status: "error", message: dup ? "มีสินค้านี้ในชุดอยู่แล้ว" : "ไม่พบปุ่มที่ระบุ" };
    persist();
    return { status: "success", rows: added, message: "เพิ่มสินค้า " + code + " เข้าชุด " + sn + " แล้ว " + added + " แถว" };
  };

  /* ---- PER-BUTTON lifecycle (ขยาย/ลด/ยกเลิก เฉพาะปุ่มที่เลือก) ----
     1 แคมเปญมีหลายปุ่ม → แก้เฉพาะ shortName ที่เลือก · route กลับ OP (WAITING) · ป้ายขึ้นหลัง OP ยืนยัน */
  API.getCampaignButtons = (campaignName) => {
    const c = String(campaignName || "").trim();
    const seen = {}, out = [];
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() !== c) return;
      const sn = String(r.shortName || "").trim() || "(ไม่มีชื่อปุ่ม)";
      if (seen[sn]) return; seen[sn] = 1;
      out.push({
        shortName: sn, start: r.start || "", end: r.end || "",
        changeStatus: String(r.changeStatus || "").toUpperCase(),
        opStatus: String(r.opStatus || "WAITING").toUpperCase(),
        itStatus: String(r.itStatus || "PENDING").toUpperCase(),
        wentLive: !!r.wentLive, kitchen: r.kitchen || "", netPrice: r.netPrice || "",
        promoType: r.promoType || r.typePromotion || "",
      });
    }));
    return out;
  };

  API.extendButtons = (campaignName, shortNames, newEndDate, extendNote) => {
    const snSet = {}; (shortNames || []).forEach(s => { const k = String(s || "").trim(); if (k) snSet[k] = 1; });
    if (!Object.keys(snSet).length) return { status: "error", message: "ไม่ได้เลือกปุ่ม" };
    const note = String(extendNote || "").trim();
    const modeSeen = {};
    const apply = (r) => {
      if (r.campaign !== campaignName || !snSet[String(r.shortName || "").trim()]) return;
      const mode = (r.end && new Date(newEndDate) < new Date(r.end)) ? "REDUCED" : "EXTENDED";
      modeSeen[mode] = 1;
      if (String(r.opStatus || "").toUpperCase() === "CONFIRMED") r.wentLive = true;
      r.end = newEndDate; r.changeStatus = mode; r.itStatus = "PENDING"; r.opStatus = "WAITING"; r.opDoneDate = "";
      if (note) r.extendCodeNote = note; r.updatedDate = NOW();
    };
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    store.working.forEach(apply);
    persist();
    const label = (modeSeen.REDUCED && !modeSeen.EXTENDED) ? "ลดระยะเวลา" : "ขยายระยะเวลา";
    try { syncCoPromoDates(campaignName, { end: newEndDate, lifecycle: (modeSeen.REDUCED && !modeSeen.EXTENDED) ? "REDUCED" : "EXTENDED" }); } catch (e) {}
    const n = Object.keys(snSet).length;
    sendMail("it@rocks-foods.com", "[" + label + " (รายปุ่ม)] " + campaignName,
      "ปุ่มที่ " + label + " (" + n + " ปุ่ม): " + Object.keys(snSet).join(", ") + "\nวันสิ้นสุดใหม่: " + newEndDate + (note ? "\nหมายเหตุถึง IT: " + note : ""));
    try { if (window.PC_notify) window.PC_notify((modeSeen.REDUCED && !modeSeen.EXTENDED) ? "promo_reduced" : "promo_extended", { text: label + ' “' + campaignName + '” ' + n + ' ปุ่ม (' + Object.keys(snSet).join(', ') + ') — สิ้นสุด ' + newEndDate + ' · รอ OP ยืนยัน' }); } catch (e) {}
    return { status: "success", message: "✅ " + label + " " + n + " ปุ่มเรียบร้อย (" + Object.keys(modeSeen).join("/") + ") · รอ OP ยืนยัน", buttons: Object.keys(snSet), mode: Object.keys(modeSeen).join("/") };
  };

  API.cancelButtons = (campaignName, shortNames, reason) => {
    const snSet = {}; (shortNames || []).forEach(s => { const k = String(s || "").trim(); if (k) snSet[k] = 1; });
    if (!Object.keys(snSet).length) return { status: "error", message: "ไม่ได้เลือกปุ่ม" };
    const apply = (r) => {
      if (r.campaign !== campaignName || !snSet[String(r.shortName || "").trim()]) return;
      if (String(r.opStatus || "").toUpperCase() === "CONFIRMED") r.wentLive = true;
      r.changeStatus = "CANCELLED"; r.cancelReason = reason || ""; r.reason = reason || ""; r.opStatus = "WAITING"; r.opDoneDate = ""; r.updatedDate = NOW();
    };
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    store.working.forEach(apply);
    persist();
    const n = Object.keys(snSet).length;
    try { syncCoPromoDates(campaignName, { lifecycle: "CANCELLED" }); } catch (e) {}
    sendMail("it@rocks-foods.com", "[ยกเลิก (รายปุ่ม)] " + campaignName, "ปุ่มที่ยกเลิก (" + n + "): " + Object.keys(snSet).join(", ") + "\nเหตุผล: " + (reason || "-"));
    try { if (window.PC_notify) window.PC_notify("promo_cancelled", { text: 'ยกเลิก ' + n + ' ปุ่มของ “' + campaignName + '” (' + Object.keys(snSet).join(', ') + ')' + (reason ? ' — ' + reason : '') + ' · รอ OP ยืนยัน' }); } catch (e) {}
    return { status: "success", message: "✅ ยกเลิก " + n + " ปุ่มเรียบร้อย · รอ OP ยืนยัน", buttons: Object.keys(snSet) };
  };

  /* ---- tracking table (getAllCampaignData) ---- */
  // รวมราคา (Gross) = ราคา "ต่อปุ่ม" ไม่ใช่ต่อแคมเปญ
  // ปุ่ม = shortName + itemPromotion (Code Item Set) · สรุป gross×qty ของบรรทัดในปุ่มนั้น
  // ถ้าระบุ shortName → เอาเฉพาะปุ่มนั้น · ถ้าไม่ระบุ → คืนยอดปุ่มที่มากที่สุด (ไม่บวกข้ามปุ่มทั้งแคมเปญ)
  function campGrossTotal(campaign, shortName) {
    const c = String(campaign || "").trim();
    if (!c) return 0;
    const sn = String(shortName == null ? "" : shortName).trim();
    const seen = {}; const btnTotals = {};
    Object.keys(store.months).forEach(mo => (store.months[mo] || []).forEach(r => {
      if (String(r.campaign || "").trim() !== c) return;
      const rSn = String(r.shortName || "").trim();
      if (sn && rSn !== sn) return;                       // จำกัดเฉพาะปุ่มที่เลือก
      const btnKey = (rSn || "-") + "||" + (r.itemPromotion || "");
      const lineKey = btnKey + "||" + (r.itemCode || ""); // ตัดซ้ำระดับบรรทัดในปุ่ม
      if (seen[lineKey]) return; seen[lineKey] = 1;
      btnTotals[btnKey] = (btnTotals[btnKey] || 0) + (parseFloat(r.gross) || 0) * (parseInt(r.qty) || 1);
    }));
    let max = 0;
    Object.keys(btnTotals).forEach(k => { if (btnTotals[k] > max) max = btnTotals[k]; });
    return max;
  }
  API.getAllCampaignData = () =>
    store.working.map((r, index) => ({
      rowIdx: index + 2, timestamp: fmtDate(r.timestamp), month: String(r.month || ""),
      campaign: String(r.campaign || "No Name"), promoType: String(r.promoType || ""),
      startDate: fmtDate(r.start), endDate: fmtDate(r.end), store: String(r.stores || "All Stores"),
      channel: String(r.saleMode || "-"), itStatus: String(r.itStatus || "PENDING").toUpperCase(),
      opStatus: String(r.opStatus || "WAITING").toUpperCase(), shortName: String(r.shortName || ""),
      itemPromoCode: String(r.codeItemSet || r.codePromotion || "-"), detail: String(r.detail || ""),
      codePromotion: String(r.codePromotion || ""), codeItemSet: String(r.codeItemSet || ""),
      mechanic: String(r.mechanic || ""), attachment: String(r.attachment || ""), memoUrl: String(r.memoUrl || ""),
      changeStatus: String(r.changeStatus || "").toUpperCase(), cancelReason: String(r.cancelReason || r.reason || ""),
      rejectReason: String(r.rejectReason || ""), extendCodeNote: String(r.extendCodeNote || ""),
      customerGroup: String(r.customerGroup || ""), crmTargetName: String(r.crmTargetName || ""),
      reporter: String(r.reporter || r.rd || ""),
      totalPrice: campGrossTotal(r.campaign, r.shortName),
    })).filter(x => x.campaign && x.campaign !== "No Name").reverse();

  /* ---- detail drill-down (getPromoDetails) ---- */
  API.getPromoDetails = (campaignName) => {
    const w = store.working.find(r => String(r.campaign || "").trim() === String(campaignName).trim());
    if (!w) return { status: "error", message: "ไม่พบแคมเปญ: " + campaignName };
    const fileUrl = w.attachment ? String(w.attachment).trim() : "";
    // gather buttons across ALL months for this campaign (grouped campaigns may span months)
    const monthRows = [];
    Object.keys(store.months).forEach(mo => (store.months[mo] || []).forEach(r => {
      if (String(r.campaign).trim() === String(campaignName).trim()) monthRows.push(r);
    }));
    const anyFile = fileUrl !== "" || monthRows.some(r => r.attachment && String(r.attachment).trim() !== "");
    // ตัดซ้ำ: แคมเปญที่จัดกลุ่มข้ามเดือน ต้องไม่โชว์ปุ่ม/บรรทัดสินค้าเดิมซ้ำตามจำนวนเดือน
    // key = shortName + itemCode + itemSet (ระบุตัวบรรทัด) · เก็บอันแรก · จัดกลุ่มให้ปุ่มเดียวกันอยู่ติดกัน
    const _seen = {}, _order = [], _bySN = {};
    monthRows.forEach(r => {
      const key = (r.shortName || "-") + "||" + (r.itemCode || "") + "||" + (r.itemPromotion || "");
      if (_seen[key]) return; _seen[key] = 1;
      const sn = r.shortName || "-";
      if (!_bySN[sn]) { _bySN[sn] = []; _order.push(sn); }
      _bySN[sn].push(r);
    });
    const detailRows = []; _order.forEach(sn => _bySN[sn].forEach(r => detailRows.push(r)));
    return {
      status: "success", campaign: campaignName, promoCode: w.codePromotion || "-", store: w.stores,
      storeData: resolveStores(w.stores), promotionDetail: w.detail || "-", condition: w.mechanic || "-",
      fileUrl, hasFile: anyFile && fileUrl !== "Error uploading file",
      memoUrl: w.memoUrl || "", hasMemo: !!w.memoUrl, cateRemark: w.cateRemark || "-",
      changeStatus: String(w.changeStatus || "").toUpperCase(), cancelReason: String(w.cancelReason || w.reason || ""),
      rejectReason: String(w.rejectReason || ""), extendCodeNote: String(w.extendCodeNote || ""),
      items: detailRows.map(r => ({
        itemSetCode: r.itemPromotion || "-", kitchen: r.kitchen || "-", shortName: r.shortName || "-",
        codePromotion: r.codePromotion || "", codeItemSet: r.codeItemSet || "",
        itemCode: r.itemCode || "N/A", itemNameEn: r.itemNameEN || "-", qty: r.qty || 0,
        price: r.gross || 0, discount: r.discount || 0, netPrice: r.netPrice || 0,
        detail: r.detail || "", condition: r.mechanic || "",
        isSubset: r.isSubset || "", chooseMin: r.chooseMin || "", chooseMax: r.chooseMax || "",
        itemRowUrl: (r.attachment && String(r.attachment).trim() !== "") ? String(r.attachment).trim() : fileUrl,
      })),
    };
  };

  /* ---- fill Gross from Item master (เติม Gross ราคาเต็มตามช่องทาง ให้ Price Promotion ที่ยังว่าง) ---- */
  function _priceChannelIdx(sale) {
    sale = String(sale || "").toLowerCase();
    if (/grab/.test(sale)) return 1;
    if (/line/.test(sale)) return 2;
    if (/panda/.test(sale)) return 3;
    if (/shopee/.test(sale)) return 4;
    if (/robin/.test(sale)) return 5;
    if (/gokoo|gookoo/.test(sale)) return 6;
    if (/all\s*deliver|deliver/.test(sale)) return 1; // delivery รวม → ใช้ GRAB เป็นฐาน
    return 0; // Take Away / All Channels → TAKE AWAY
  }
  API.fillPricePromoGross = (onlyEmpty) => {
    const PR = (typeof window !== "undefined" && window.PC_ITEM_PRICES) || {};
    if (!Object.keys(PR).length) return { status: "error", message: "ยังไม่ได้โหลดราคา Item master (PC_ITEM_PRICES)" };
    const _bracket = (s) => { const m = String(s || "").match(/\[(\d+(?:\.\d+)?)\]/); return m ? parseFloat(m[1]) : null; };
    let filled = 0, missing = 0, netSet = 0;
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      const t = String(r.promoType || r.typePromotion || "");
      if (!/price\s*promo/i.test(t)) return;
      // Net = เลขในวงเล็บชื่อปุ่ม (shortName ก่อน, ไม่มีค่อยใช้ชื่อแคมเปญ) — วงเล็บคือ Net ที่ถูกต้อง ใส่ทับเสมอ
      const nb = _bracket(r.shortName) != null ? _bracket(r.shortName) : _bracket(r.campaign);
      if (nb != null) { r.netPrice = nb; netSet++; }
      // Gross = ราคาเต็มตามช่องทางจาก Item master
      let gNow = parseFloat(r.gross) || 0;
      if (!(onlyEmpty && gNow > 0)) {
        const row = PR[String(r.itemCode || "").trim()];
        if (!row) { missing++; }
        else {
          const idx = _priceChannelIdx(r.saleMode);
          let g = parseFloat(row[idx]) || 0;
          if (!g) { for (let k = 0; k < row.length; k++) { if (parseFloat(row[k]) > 0) { g = parseFloat(row[k]); break; } } }
          if (g) { r.gross = g; r.price = g; gNow = g; filled++; } else { missing++; }
        }
      }
      // ส่วนลด = ระบบคำนวณ = Gross − Net (เมื่อรู้ทั้งคู่)
      const netNow = parseFloat(r.netPrice) || 0;
      if (gNow > 0 && netNow > 0) r.discount = Math.max(0, +(gNow - netNow).toFixed(2));
      r.updatedDate = NOW();
    }));
    persist();
    return { status: "success", message: `เติม Gross ${filled} · Net (จากวงเล็บ) ${netSet} · ส่วนลดคำนวณอัตโนมัติ` + (missing ? ` (ไม่พบราคา Gross ${missing} รายการ — กรอกเอง)` : ""), filled, missing, netSet };
  };

  /* ---- update rows (แก้ไขทุกช่องรายปุ่มในแคมเปญ: code/itemset/kitchen/short/itemCode/ชื่อ/qty/gross/discount/net) ---- */
  API.updateCampaignPrices = (campaignName, lines, cateRemark) => {
    campaignName = String(campaignName || "").trim();
    const idx = {};
    (lines || []).forEach(l => { idx[String(l.code || "") + "||" + String(l.item || "")] = l; });
    let count = 0; const setCate = (cateRemark != null);
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() !== campaignName) return;
      if (setCate) { r.cateRemark = String(cateRemark); r.updatedDate = NOW(); }
      const l = idx[String(r.codePromotion || "") + "||" + String(r.itemCode || "")];
      if (!l) return;
      l._matched = true;
      // ราคา
      if (l.gross !== "" && l.gross != null && !isNaN(parseFloat(l.gross))) { r.gross = parseFloat(l.gross); r.price = parseFloat(l.gross); }
      if (l.discount !== "" && l.discount != null) r.discount = isNaN(parseFloat(l.discount)) ? l.discount : parseFloat(l.discount);
      if (l.net !== "" && l.net != null && !isNaN(parseFloat(l.net))) r.netPrice = parseFloat(l.net);
      else if (l.net === "") r.netPrice = 0;
      // ช่องอื่น ๆ (อัปเดตเมื่อส่งค่ามา)
      if (l.kitchen != null) r.kitchen = l.kitchen;
      if (l.shortName != null) r.shortName = l.shortName;
      if (l.itemPromotion != null) { r.itemPromotion = l.itemPromotion; r.codeItemSet = l.itemPromotion; }
      if (l.itemNameEN != null) r.itemNameEN = l.itemNameEN;
      if (l.itemNameTH != null) r.itemNameTH = l.itemNameTH;
      if (l.qty != null && l.qty !== "" && !isNaN(parseFloat(l.qty))) r.qty = parseFloat(l.qty);
      if (l.codePromotion != null && String(l.codePromotion).trim() !== "") r.codePromotion = String(l.codePromotion).trim();
      if (l.itemCode != null && String(l.itemCode).trim() !== "") r.itemCode = String(l.itemCode).trim();
      r.updatedDate = NOW();
      count++;
    }));
    // เพิ่มสินค้าใหม่ / สร้างปุ่มใหม่: บรรทัดที่ยังไม่จับคู่ row เดิม
    //  • ปุ่มเดิม (เจอ shortName/code เดิม) → clone หัวปุ่มนั้น = เพิ่มไอเทมใต้ปุ่ม
    //  • ปุ่มใหม่ (ไม่เจอ shortName เดิม) → clone metadata แคมเปญ (วันที่/saleMode/promoType/สาขา) แล้วตั้ง identity ปุ่มใหม่ → โผล่ใน getCampaignButtons/จัดการรายปุ่ม
    const _mk = Object.keys(store.months);
    (lines || []).forEach(l => {
      if (l._matched) return;
      const ic = String(l.itemCode || "").trim();
      const sn = String(l.shortName || l._short || "").trim();
      const cp = String(l.code || l.codePromotion || "").trim();
      if (!ic && !sn) return;                              // ไม่มีทั้งไอเทมและชื่อปุ่ม → ข้าม
      let tmpl = null, tmk = null, campMeta = null, campMk = null;
      for (const m of _mk) { const arr = store.months[m] || []; for (const r of arr) {
        if (String(r.campaign || "").trim() !== campaignName) continue;
        if (!campMeta) campMeta = r;   // metadata ต้นแบบ = row แรกของแคมเปญ
        campMk = m;                    // ⭐ ติดตาม "เดือนสุดท้าย" ที่มีแคมเปญนี้ (ตามลำดับ iterate) → ปุ่มใหม่ต่อท้ายสุด (ไม่เด้งขึ้นบน)
        if ((sn && String(r.shortName || "") === sn) || (!sn && cp && String(r.codePromotion || "") === cp)) { tmpl = r; tmk = m; break; }
      } if (tmpl) break; }
      const isNewButton = !tmpl;
      if (isNewButton && !sn) return;   // ไม่มีปุ่มเดิมให้ match + ไม่มีชื่อปุ่มใหม่ → แถวต่อที่หลุด match/malformed → ข้าม (กันสร้างปุ่มชื่อว่าง)
      const base = tmpl || campMeta;
      let mk = tmpl ? tmk : (campMk || _mk[_mk.length - 1] || null);
      if (!mk) { mk = new Date().toISOString().slice(0, 7); if (!store.months[mk]) store.months[mk] = []; }
      const nr = base ? JSON.parse(JSON.stringify(base)) : { campaign: campaignName };
      nr.campaign = campaignName;
      if (isNewButton) {
        // ปุ่ม POS ใหม่ — ตั้ง identity + เคลียร์ code/สถานะที่ inherit มาจากปุ่มอื่น
        nr.shortName = sn || nr.shortName || "";
        nr.codePromotion = cp;
        nr.itemPromotion = (l.itemPromotion != null) ? l.itemPromotion : "";
        nr.codeItemSet = nr.itemPromotion;
        nr.kitchen = (l.kitchen != null) ? l.kitchen : "";
        nr.changeStatus = ""; nr.opStatus = "WAITING"; nr.itStatus = "PENDING"; nr.wentLive = false; nr.opDoneDate = "";
      } else {
        if (l.kitchen != null && l.kitchen !== "") nr.kitchen = l.kitchen;
        if (l.itemPromotion != null && String(l.itemPromotion).trim() !== "") { nr.itemPromotion = l.itemPromotion; nr.codeItemSet = l.itemPromotion; }
        if (cp) nr.codePromotion = cp;
      }
      nr.itemCode = ic;
      nr.itemNameEN = l.itemNameEN || ""; nr.itemNameTH = l.itemNameTH || "";
      nr.qty = (l.qty != null && l.qty !== "" && !isNaN(parseFloat(l.qty))) ? parseFloat(l.qty) : 1;
      nr.gross = (l.gross != null && l.gross !== "" && !isNaN(parseFloat(l.gross))) ? parseFloat(l.gross) : "";
      nr.price = nr.gross;
      nr.discount = (l.discount != null && l.discount !== "") ? (isNaN(parseFloat(l.discount)) ? l.discount : parseFloat(l.discount)) : 0;
      nr.netPrice = (l.net != null && l.net !== "" && !isNaN(parseFloat(l.net))) ? parseFloat(l.net) : 0;
      nr.updatedDate = NOW();
      store.months[mk].push(nr); count++;
    });
    if (!count && !setCate) return { status: "error", message: "ไม่พบรายการที่ตรงกัน" };
    // เขียนตารางสินค้า (pc_product_promo) ต่อ itemCode ที่ map แล้ว → ให้บันทึกแล้ววิ่งเข้าหน้าสินค้าเหมือนหน้าทำปุ่ม
    let ppWritten = 0;
    try {
      const pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}") || {};
      let ppCh = false; const seenPP = {};
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (String(r.campaign || "").trim() !== campaignName) return;
        const ic = String(r.itemCode || "").trim();
        if (!ic || ic.toUpperCase() === "ALL") return;
        const prCode = String(r.codePromotion || r.codeItemSet || "").trim();
        if (!prCode) return;
        const pk = ic + "||" + prCode.toUpperCase();
        if (seenPP[pk]) return; seenPP[pk] = 1;
        const ptU = String(r.promoType || r.typePromotion || "").toLowerCase();
        const typeP = ptU.indexOf("voucher") >= 0 ? "E-Voucher" : (ptU.indexOf("coupon") >= 0 ? "Item Coupon" : (ptU.indexOf("item set") >= 0 || String(r.codeItemSet || "").trim() ? "Price Promotion" : (r.promoType || "Price Promotion")));
        const prow = { typePromo: typeP, prCode: prCode, net: (r.netPrice == null ? "" : String(r.netPrice)), desc1: r.shortName || "", desc2: "", _fromCoupon: true };
        const arr = pp[ic] || [];
        const ei = arr.findIndex(x => String(x.prCode || "").trim().toUpperCase() === prCode.toUpperCase());
        if (ei >= 0) arr[ei] = Object.assign({}, arr[ei], prow); else arr.push(prow);
        pp[ic] = arr; ppCh = true; ppWritten++;
      }));
      if (ppCh) localStorage.setItem("pc_product_promo", JSON.stringify(pp));
    } catch (e) {}
    persist();
    return { status: "success", message: "บันทึกแล้ว " + count + " รายการ" + (setCate ? " + หมวด POS" : "") + (ppWritten ? " · เข้าตารางสินค้า " + ppWritten : "") };
  };

  /* ---- ลบ "แถวกำพร้า" — แถวที่ไม่มีชื่อแคมเปญ ----
     แถวแบบนี้หลุดจากทุกหน้า (ทุกหน้าจัดกลุ่มด้วยชื่อแคมเปญ) จึงลบผ่าน deleteCampaigns /
     deleteCampaignButton ไม่ได้เลย · เกิดจากฟอร์มที่ส่งค้างโดยยังไม่ได้ตั้งชื่อแคมเปญ
     dry = true → แค่รายงานว่าจะลบอะไรบ้าง ไม่ลบจริง */
  API.deleteOrphanRows = (dry) => {
    const found = [];
    Object.keys(store.months).forEach(m => {
      (store.months[m] || []).forEach(r => {
        if (!String(r.campaign || "").trim()) found.push({ month: m, shortName: r.shortName || "", itemCode: r.itemCode || "", reporter: r.reporter || r.updatedBy || "", timestamp: r.timestamp || "" });
      });
    });
    if (dry) return { status: "success", dryRun: true, count: found.length, rows: found };
    if (!found.length) return { status: "success", count: 0, message: "ไม่พบแถวกำพร้า" };
    Object.keys(store.months).forEach(m => {
      store.months[m] = (store.months[m] || []).filter(r => String(r.campaign || "").trim());
      if (!store.months[m].length) delete store.months[m];
    });
    store.working = (store.working || []).filter(r => String(r.campaign || "").trim());
    persist();
    return { status: "success", count: found.length, rows: found, message: "ลบแถวกำพร้า " + found.length + " แถว" };
  };

  /* ---- ลบรายการสินค้า/ปุ่ม ของแคมเปญ (ลบทุกที่: months → working rebuild → MKT/OP/สาขา · cascade ตารางสินค้า pc_product_promo) ----
     itemCode ระบุ = ลบเฉพาะสินค้านั้นในปุ่ม · ไม่ระบุ = ลบทั้งปุ่ม (shortName) */
  API.deleteCampaignButton = (campaign, shortName, itemCode) => {
    campaign = String(campaign || "").trim(); shortName = String(shortName || "").trim(); itemCode = String(itemCode || "").trim();
    if (!campaign || !shortName) return { status: "error", message: "ข้อมูลไม่ครบ" };
    const codes = new Set(), items = new Set(); let n = 0;
    Object.keys(store.months).forEach(m => {
      store.months[m] = (store.months[m] || []).filter(r => {
        const hit = String(r.campaign || "").trim() === campaign && String(r.shortName || "").trim() === shortName && (!itemCode || String(r.itemCode || "").trim() === itemCode);
        if (hit) { if (r.codePromotion) codes.add(String(r.codePromotion).trim().toUpperCase()); if (r.codeItemSet) codes.add(String(r.codeItemSet).trim().toUpperCase()); if (r.itemPromotion) codes.add(String(r.itemPromotion).trim().toUpperCase()); if (r.itemCode) items.add(String(r.itemCode).trim()); n++; return false; }
        return true;
      });
      if (!store.months[m].length) delete store.months[m];
    });
    if (!n) return { status: "error", message: "ไม่พบรายการที่จะลบ" };
    let ppRemoved = 0;
    try {
      const pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}") || {}; let ch = false;
      items.forEach(ic => {
        if (!pp[ic]) return;
        const keep = pp[ic].filter(row => !codes.has(String(row.prCode || "").trim().toUpperCase()));
        if (keep.length !== pp[ic].length) { ppRemoved += pp[ic].length - keep.length; if (keep.length) pp[ic] = keep; else delete pp[ic]; ch = true; }
      });
      if (ch) localStorage.setItem("pc_product_promo", JSON.stringify(pp));
    } catch (e) {}
    // คืนโค้ดทั้งหมดของปุ่มที่ลบกลับเข้า pool ของตัวนับกลาง (force — แม้ CONFIRMED)
    let codesReturned = 0;
    try {
      const C = window.PC_COUNTER;
      if (C && C.returnCode) codes.forEach(cc => { const r = C.returnCode(cc, null, "ลบปุ่มแคมเปญ: " + campaign, true); if (r && r.returned) codesReturned++; });
    } catch (e) {}
    persist();
    return { status: "success", message: "ลบ " + n + " รายการ" + (ppRemoved ? " · ตารางสินค้า " + ppRemoved + " แถว" : "") + (codesReturned ? " · คืนโค้ด " + codesReturned : ""), removed: n, codesReturned };
  };

  /* ---- ลบ "รายการเดียว" (1 แถว) ในแคมเปญ — ระบุด้วย identifier ที่ส่งมา (shortName/codePromotion/itemCode/itemSet)
     รองรับ sub-item ที่ shortName ว่าง (deleteCampaignButton เดิมต้องมี shortName → ลบ sub-item ไม่ได้)
     ลบ 1 แถวแรกที่ตรง "ทุก field ที่ส่งค่ามา" (ไม่กระทบแถวอื่น) + cascade pc_product_promo + คืนโค้ดที่ orphan */
  API.deleteCampaignItem = (campaign, sel) => {
    campaign = String(campaign || "").trim();
    sel = sel || {};
    const S = (v) => String(v == null ? "" : v).trim();
    const wantSN = S(sel.shortName), wantCP = S(sel.codePromotion), wantIC = S(sel.itemCode), wantIS = S(sel.itemSet);
    if (!campaign) return { status: "error", message: "ไม่พบแคมเปญ" };
    if (!wantSN && !wantCP && !wantIC && !wantIS) return { status: "error", message: "ไม่มีข้อมูลระบุแถวที่จะลบ" };
    const match = (r) => {
      if (S(r.campaign) !== campaign) return false;
      if (wantSN && S(r.shortName) !== wantSN) return false;
      if (wantCP && S(r.codePromotion) !== wantCP) return false;
      if (wantIC && S(r.itemCode) !== wantIC) return false;
      if (wantIS && S(r.itemPromotion) !== wantIS && S(r.codeItemSet) !== wantIS) return false;
      return true;
    };
    // ลบเฉพาะ 1 แถวแรกที่ตรง (เดินตามลำดับเดียวกับที่ getPromoDetails อ่าน month rows)
    const codes = new Set(); let removed = null;
    for (const m of Object.keys(store.months)) {
      const arr = store.months[m] || [];
      const i = arr.findIndex(match);
      if (i >= 0) {
        removed = arr[i];
        [removed.codePromotion, removed.codeItemSet, removed.itemPromotion].forEach(c => { c = String(c || "").trim(); if (c) codes.add(c.toUpperCase()); });
        arr.splice(i, 1);
        if (!arr.length) delete store.months[m];
        break;
      }
    }
    if (!removed) return { status: "error", message: "ไม่พบรายการที่จะลบ" };
    // cascade (1) pc_product_promo — ตัดแถว prCode ที่ตรงโค้ดที่ลบ ของ itemCode นั้น
    let ppRemoved = 0;
    try {
      const ic = String(removed.itemCode || "").trim();
      if (ic) {
        const pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}") || {};
        if (Array.isArray(pp[ic])) {
          const keep = pp[ic].filter(row => !codes.has(String(row.prCode || "").trim().toUpperCase()));
          ppRemoved = pp[ic].length - keep.length;
          if (ppRemoved) { if (keep.length) pp[ic] = keep; else delete pp[ic]; localStorage.setItem("pc_product_promo", JSON.stringify(pp)); }
        }
      }
    } catch (e) {}
    // cascade (2) คืนโค้ดที่กลายเป็น orphan (ไม่มีแถวอื่นในระบบอ้างถึงแล้ว) — ไม่ force (ไม่แตะ CONFIRMED)
    let codesReturned = 0;
    try {
      const C = window.PC_COUNTER;
      if (C && C.returnCode && codes.size) {
        const stillUsed = {};
        Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
          [r.codePromotion, r.codeItemSet, r.itemPromotion].forEach(c => { c = String(c || "").trim().toUpperCase(); if (c) stillUsed[c] = 1; });
        }));
        codes.forEach(c => { if (!stillUsed[c]) { const rr = C.returnCode(c, null, "ลบรายการในแคมเปญ: " + campaign, false); if (rr && rr.returned) codesReturned++; } });
      }
    } catch (e) {}
    persist();
    return { status: "success", message: "ลบ 1 รายการ" + (ppRemoved ? " · ตารางสินค้า " + ppRemoved + " แถว" : "") + (codesReturned ? " · คืนโค้ด " + codesReturned : ""), removed: 1, ppRemoved, codesReturned };
  };

  /* ---- rename campaign (เปลี่ยนชื่อแคมเปญ — อัปเดตทุก month row ของแคมเปญพร้อมกัน → working rebuild เอง) ---- */
  API.renameCampaign = (oldName, newName) => {
    oldName = String(oldName || "").trim(); newName = String(newName || "").trim();
    if (!newName) return { status: "error", message: "กรุณาใส่ชื่อแคมเปญใหม่" };
    if (newName === oldName) return { status: "error", message: "ชื่อใหม่เหมือนเดิม" };
    let count = 0;
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (String(r.campaign || "").trim() === oldName) { r.campaign = newName; r.updatedDate = NOW(); count++; }
    }));
    if (!count) return { status: "error", message: "ไม่พบแคมเปญ: " + oldName };
    persist();
    return { status: "success", message: `เปลี่ยนชื่อเป็น “${newName}” แล้ว (${count} รายการ)` };
  };

  /* ---- แก้ไขทุกช่องระดับแคมเปญในตาราง MKT (แอดมิน) — เขียนจริงลงทุก month row + working ----
     patch อาจมี: campaign(เปลี่ยนชื่อ) · promoType · start · end · saleMode · itStatus · opStatus
     อัปเดตทั้ง months และ working (บาง seed อยู่ working เท่านั้น) → persist → cloud sync ตาม workflow เดิม */
  API.updateCampaignMeta = (oldName, patch) => {
    oldName = String(oldName || "").trim();
    patch = patch || {};
    if (!oldName) return { status: "error", message: "ไม่พบแคมเปญ" };
    const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
    const newName = has("campaign") ? String(patch.campaign || "").trim() : oldName;
    if (has("campaign") && !newName) return { status: "error", message: "ชื่อแคมเปญห้ามว่าง" };
    const applyRow = (r) => {
      if (String(r.campaign || "").trim() !== oldName) return false;
      if (has("promoType")) { r.promoType = String(patch.promoType || ""); r.typePromotion = String(patch.promoType || ""); }
      if (has("start")) r.start = String(patch.start || "");
      if (has("end")) r.end = String(patch.end || "");
      if (has("saleMode")) r.saleMode = String(patch.saleMode || "");
      if (has("itStatus")) r.itStatus = String(patch.itStatus || "").toUpperCase();
      if (has("opStatus")) r.opStatus = String(patch.opStatus || "").toUpperCase();
      if (newName !== oldName) r.campaign = newName;
      r.updatedDate = NOW();
      return true;
    };
    let count = 0;
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => { if (applyRow(r)) count++; }));
    (store.working || []).forEach(r => { if (applyRow(r)) count++; });
    if (!count) return { status: "error", message: "ไม่พบแคมเปญ: " + oldName };
    persist();
    try { if (has("start") || has("end")) syncCoPromoDates(newName, { end: has("end") ? patch.end : undefined }); } catch (e) {}
    return { status: "success", message: `บันทึกการแก้ไขแคมเปญแล้ว (${count} รายการ)` };
  };

  /* ---- group/merge campaigns (จัดกลุ่ม: ย้ายทุกปุ่มของแคมเปญที่เลือกไปรวมใต้ชื่อเดียว) ---- */
  API.groupCampaigns = (names, targetName) => {
    targetName = String(targetName || "").trim();
    const set = {}; (names || []).forEach(n => { const k = String(n || "").trim(); if (k) set[k] = 1; });
    if (!targetName) return { status: "error", message: "กรุณาใส่ชื่อแคมเปญปลายทาง" };
    if (!Object.keys(set).length) return { status: "error", message: "ไม่ได้เลือกแคมเปญ" };
    let count = 0;
    // เปลี่ยนชื่อแคมเปญทั้งใน months และ working (บางโปร เช่น seed Bill Discount อยู่ใน working เท่านั้น)
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (set[String(r.campaign || "").trim()]) { r.campaign = targetName; r.updatedDate = NOW(); count++; }
    }));
    (store.working || []).forEach(r => {
      if (set[String(r.campaign || "").trim()]) { r.campaign = targetName; r.updatedDate = NOW(); count++; }
    });
    if (!count) return { status: "error", message: "ไม่พบแคมเปญที่เลือก" };
    persist();
    return { status: "success", message: `จัดกลุ่ม ${count} รายการเข้า “${targetName}” แล้ว`, count };
  };

  /* ---- delete campaigns (ลบแคมเปญที่เลือกออกจากตาราง — ลบทุก month row ของแคมเปญนั้น) ---- */
  /* ---- โปรที่ "ห้ามลบ" ออกจากตาราง MKT (ป้องกันทุกเส้นทางลบ) ----
     จับคู่แบบ normalize: ตัดช่องว่าง + ตัวพิมพ์เล็ก (ทน "Shopee Food" = "ShopeeFood") */
  const PROTECTED_CAMPAIGNS = [
    "โชว์สกุชชี่ รับฟรี Large fries",
    "Shopee Food - BOGO Mega FF",
  ];
  const normCampName = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").trim();
  const PROTECTED_SET = {}; PROTECTED_CAMPAIGNS.forEach(n => { PROTECTED_SET[normCampName(n)] = 1; });
  API.isProtectedCampaign = (name) => !!PROTECTED_SET[normCampName(name)];
  window.PC_isProtectedCampaign = API.isProtectedCampaign;
  window.PC_PROTECTED_CAMPAIGNS = PROTECTED_CAMPAIGNS.slice();

  API.deleteCampaigns = (names) => {
    const set = {}; const blocked = [];
    (names || []).forEach(n => {
      const k = String(n || "").trim();
      if (!k) return;
      if (PROTECTED_SET[normCampName(k)]) { blocked.push(k); return; }
      set[k] = 1;
    });
    if (!Object.keys(set).length) {
      if (blocked.length) return { status: "error", message: "โปรนี้ถูกล็อกห้ามลบ: " + blocked.join(", "), blocked };
      return { status: "error", message: "ไม่ได้เลือกแคมเปญ" };
    }
    // ===== SOFT DELETE: snapshot ทุกอย่างก่อนลบ → เก็บใน store.trash (กู้คืนได้ 60 วัน) =====
    const snap = {
      id: "TRASH" + Date.now().toString(36).toUpperCase(),
      deletedAt: NOW(),
      deletedBy: (function(){ try{ var u=JSON.parse(localStorage.getItem("pc_login")||"{}"); return u.email||u.name||""; }catch(e){ return ""; } })(),
      campaigns: Object.keys(set),
      months: {}, pp: {}, comp: {}, npd: [], cr: [], codes: []
    };
    let count = 0;
    // เก็บโค้ด/รหัสสินค้าของแคมเปญที่จะลบไว้ก่อน (ใช้ cascade ลบตารางที่ผูกกัน) — อ่านจาก month rows ก่อนลบ
    const codeSet = {}, itemCodeSet = {};
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      if (!set[String(r.campaign || "").trim()]) return;
      [r.codePromotion, r.codeItemSet, r.itemPromotion].forEach(c => { c = String(c || "").trim(); if (c) codeSet[c] = 1; });
      [r.codeItemSet, r.itemPromotion, r.itemCode].forEach(c => { c = String(c || "").trim(); if (c && c !== "N/A") itemCodeSet[c] = 1; });
    }));
    snap.codes = Object.keys(codeSet);
    Object.keys(store.months).forEach(m => {
      const removed = (store.months[m] || []).filter(r => set[String(r.campaign || "").trim()]);
      if (removed.length) snap.months[m] = JSON.parse(JSON.stringify(removed));   // snapshot ก่อนลบ
      store.months[m] = (store.months[m] || []).filter(r => !set[String(r.campaign || "").trim()]);
      count += removed.length;
      if (!store.months[m].length) delete store.months[m];
    });
    // cascade (1) ตาราง Price Promotion หน้าสินค้า (pc_product_promo) — ตัดแถวที่ prCode ตรงโค้ดของแคมเปญที่ลบ หรือแถว item set ของรหัส 107 ที่ลบ
    let ppRemoved = 0;
    try {
      const pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}") || {};
      let ch = false;
      Object.keys(pp).forEach(code => {
        const keyIsIS = !!itemCodeSet[String(code).trim()];
        const arr = Array.isArray(pp[code]) ? pp[code] : [];
        const removed = [], keep = [];
        arr.forEach(row => {
          const pc = String(row && row.prCode || "").trim();
          if ((pc && codeSet[pc]) || (keyIsIS && row && row._fromItemSet)) removed.push(row); else keep.push(row);
        });
        if (removed.length) { snap.pp[code] = (snap.pp[code] || []).concat(JSON.parse(JSON.stringify(removed))); ppRemoved += removed.length; ch = true; if (keep.length) pp[code] = keep; else delete pp[code]; }
      });
      if (ch) localStorage.setItem("pc_product_promo", JSON.stringify(pp));
    } catch (e) {}
    // cascade (2) ลิงก์ Subset↔ผง ของ Item Set (pc_itemset_comp) — ลบ key ที่เป็นรหัส item set ที่ลบ หรือแถว tag ด้วยแคมเปญที่ลบ
    try {
      const comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}") || {};
      let ch = false;
      Object.keys(comp).forEach(code => {
        const rows = Array.isArray(comp[code]) ? comp[code] : [];
        const belongs = itemCodeSet[String(code).trim()] || rows.some(r => { const t = String(r && r._itemset || "").split("|")[0].trim(); return t && set[t]; });
        if (belongs) { snap.comp[code] = JSON.parse(JSON.stringify(comp[code])); delete comp[code]; ch = true; }
      });
      if (ch) localStorage.setItem("pc_itemset_comp", JSON.stringify(comp));
    } catch (e) {}
    // cascade (2b) สินค้า Item Set ชั่วคราว (store.npdProducts) ที่สร้างจากแคมเปญที่ลบ
    let npdRemoved = 0;
    if (Array.isArray(store.npdProducts)) {
      const removed = store.npdProducts.filter(p => { const t = String(p && (p._fromItemSet || p._fromPromo) || "").split("|")[0].trim(); return t && set[t]; });
      if (removed.length) snap.npd = JSON.parse(JSON.stringify(removed));
      store.npdProducts = store.npdProducts.filter(p => { const t = String(p && (p._fromItemSet || p._fromPromo) || "").split("|")[0].trim(); return !(t && set[t]); });
      npdRemoved = removed.length;
    }
    // cascade (3) ไฟล์โค้ดที่แนบ (pc_code_requests) ของแคมเปญที่ลบ
    let crRemoved = 0;
    try {
      const cr = JSON.parse(localStorage.getItem("pc_code_requests") || "[]");
      if (Array.isArray(cr)) {
        const removed = cr.filter(x => set[String(x && x.campaign || "").trim()]);
        const kept = cr.filter(x => !set[String(x && x.campaign || "").trim()]);
        crRemoved = removed.length;
        if (crRemoved) { snap.cr = JSON.parse(JSON.stringify(removed)); localStorage.setItem("pc_code_requests", JSON.stringify(kept)); }
      }
    } catch (e) {}
    // เก็บ snapshot เข้าถังขยะ (เก็บ 60 วัน · สูงสุด 100 รายการ)
    if (!Array.isArray(store.trash)) store.trash = [];
    store.trash.unshift(snap);
    const _cut = Date.now() - 60 * 24 * 3600 * 1000;
    store.trash = store.trash.filter(t => (Date.parse(t.deletedAt || "") || 0) >= _cut).slice(0, 100);
    // คืนโค้ดทั้งหมดของแคมเปญที่ลบกลับเข้า pool (force — แม้ CONFIRMED) · snap.codes เก็บไว้ก่อนลบแล้ว
    let codesReturned = 0;
    try { const C = window.PC_COUNTER; if (C && C.returnCode) (snap.codes || []).forEach(cc => { const r = C.returnCode(cc, null, "ลบแคมเปญ", true); if (r && r.returned) codesReturned++; }); } catch (e) {}
    persist();
    let msg = `ย้าย ${count} รายการ (${Object.keys(set).length} แคมเปญ) เข้าถังขยะ — กู้คืนได้`;
    const extra = [];
    if (ppRemoved) extra.push(`Price Promotion ${ppRemoved} แถว`);
    if (npdRemoved) extra.push(`สินค้า Item Set ${npdRemoved}`);
    if (crRemoved) extra.push(`ไฟล์โค้ด ${crRemoved}`);
    if (codesReturned) extra.push(`คืนโค้ด ${codesReturned}`);
    if (extra.length) msg += " · เก็บข้อมูลผูกพันไว้กู้คืน: " + extra.join(" · ");
    if (blocked.length) msg += ` · ข้ามโปรที่ล็อกห้ามลบ ${blocked.length} รายการ`;
    return { status: "success", message: msg, count, blocked, ppRemoved, npdRemoved, crRemoved, codesReturned, trashId: snap.id };
  };

  /* ---- ถังขยะแคมเปญ: ดูรายการ / กู้คืน / ล้างถาวร ---- */
  API.listTrash = () => (Array.isArray(store.trash) ? store.trash : []).map(t => ({
    id: t.id, deletedAt: t.deletedAt, deletedBy: t.deletedBy || "", campaigns: t.campaigns || [],
    rowCount: Object.keys(t.months || {}).reduce((n, m) => n + (t.months[m] || []).length, 0),
    codes: t.codes || []
  }));
  API.restoreTrash = (trashId) => {
    if (!Array.isArray(store.trash)) return { status: "error", message: "ถังขยะว่าง" };
    const i = store.trash.findIndex(t => t.id === trashId);
    if (i < 0) return { status: "error", message: "ไม่พบรายการในถังขยะ (อาจถูกล้างหรือหมดอายุ)" };
    const snap = store.trash[i];
    // คืน month rows
    Object.keys(snap.months || {}).forEach(m => { if (!store.months[m]) store.months[m] = []; store.months[m] = store.months[m].concat(snap.months[m]); });
    // คืน pc_product_promo
    try { const pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}") || {}; Object.keys(snap.pp || {}).forEach(code => { pp[code] = (pp[code] || []).concat(snap.pp[code]); }); localStorage.setItem("pc_product_promo", JSON.stringify(pp)); } catch (e) {}
    // คืน pc_itemset_comp
    try { const comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}") || {}; Object.keys(snap.comp || {}).forEach(code => { comp[code] = snap.comp[code]; }); localStorage.setItem("pc_itemset_comp", JSON.stringify(comp)); } catch (e) {}
    // คืน npdProducts
    if ((snap.npd || []).length) { if (!Array.isArray(store.npdProducts)) store.npdProducts = []; store.npdProducts = store.npdProducts.concat(snap.npd); }
    // คืน pc_code_requests
    if ((snap.cr || []).length) { try { const cr = JSON.parse(localStorage.getItem("pc_code_requests") || "[]") || []; localStorage.setItem("pc_code_requests", JSON.stringify(snap.cr.concat(cr))); } catch (e) {} }
    store.trash.splice(i, 1);
    persist();
    return { status: "success", message: "กู้คืนแล้ว: " + (snap.campaigns || []).join(", "), campaigns: snap.campaigns || [] };
  };
  API.purgeTrash = (trashId) => {
    if (!Array.isArray(store.trash)) { store.trash = []; return { status: "success" }; }
    if (trashId) store.trash = store.trash.filter(t => t.id !== trashId); else store.trash = [];
    persist();
    return { status: "success" };
  };
  /* ---- guard: โค้ด CONFIRMED / RESERVED + สถานะ live ต่อแคมเปญ (ก่อนลบ) ---- */
  API.campaignCodeStatus = (names) => {
    const out = {}; const wanted = {};
    (names || []).forEach(n => { const k = String(n || "").trim(); if (k) wanted[k] = 1; });
    const today = TODAY();
    const SKIP = { "N/A": 1, "NORMAL": 1, "ONLINE": 1, "OFFLINE": 1 };
    Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
      const c = String(r.campaign || "").trim(); if (!wanted[c]) return;
      if (!out[c]) out[c] = { confirmed: [], reserved: [], codes: [], live: false, end: "" };
      [r.codePromotion, r.codeItemSet, r.itemPromotion].forEach(code => {
        code = String(code || "").trim(); if (!code || SKIP[code.toUpperCase()]) return;
        if (out[c].codes.indexOf(code) < 0) out[c].codes.push(code);
        try {
          if (window.PC_COUNTER && window.PC_COUNTER.statusOf) {
            const st = window.PC_COUNTER.statusOf(code);
            if (st === "CONFIRMED" && out[c].confirmed.indexOf(code) < 0) out[c].confirmed.push(code);
            else if (st === "RESERVED" && out[c].reserved.indexOf(code) < 0) out[c].reserved.push(code);
          }
        } catch (e) {}
      });
      const en = String(r.end || "").trim();
      if (en) { out[c].end = en; if (en >= today) out[c].live = true; }
    }));
    return out;
  };

  /* ---- seed a TEST campaign + reserved code (สำหรับทดสอบ flow ลบ→คืนโค้ด) ----
     สร้างการ์ดงาน PENDING 1 ใบในหน้า IT + จองโค้ด (RESERVED) ผูกด้วยชื่อแคมเปญ
     ให้กดลบแล้วเห็นป๊อปอัปถามคืนโค้ด → log วิ่งเข้าหน้า Code Counter */
  API.seedTestDeleteFlow = () => {
    const d = new Date();
    const month = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const tag = String(Date.now()).slice(-4);
    const campaign = "ทดสอบลบ-คืนโค้ด #" + tag;
    const start = month + "-01";
    const end = month + "-28";
    let reservedCode = "";
    try {
      if (window.PC_COUNTER && window.PC_COUNTER.reserve) {
        const e = window.PC_COUNTER.reserve("bill", { where: campaign, field: "ทดสอบ" });
        if (e && e.code) reservedCode = e.code;
      }
    } catch (err) {}
    addButtonGroup(store, {
      month, campaign, promoType: "Bill discount online", typePromotion: "Bill discount online",
      codePromotion: reservedCode, codeItemSet: "", start, end,
      stores: "ALL", saleMode: "Take Away", itStatus: "PENDING", opStatus: "WAITING",
      kitchen: "TEST", shortName: "TestDelete[" + tag + "]",
      detail: "งานทดสอบ flow ลบ → คืนโค้ดกลับ Code Counter",
      mechanic: "[TEST] การ์ดทดสอบ · มีโค้ดจอง " + (reservedCode || "(จองไม่สำเร็จ)") + " ผูกด้วยชื่อแคมเปญ",
      submittedDate: month + "-01",
      items: [{ catCode: "", itemCode: "", itemNameEN: "", qty: "", gross: "", discount: "50", netPrice: "" }],
    });
    persist();
    return { status: "success", message: "เพิ่มงานทดสอบแล้ว", campaign, code: reservedCode, month };
  };

  /* ---- edit + attach memo (processEditWithFile) ---- */
  API.processEditWithFile = (data, fileData) => {
    let count = 0;
    let url = "";
    if (fileData && fileData.base64) {
      // เก็บเอกสาร Memo จริง (HTML/PDF) ไว้ใน pc_memo_docs → memoUrl เป็น token ให้ pcViewMemo เปิดดูได้จริง (ไม่ใช่ลิงก์ Drive ปลอม)
      url = "memo:" + data.campaign;
      try {
        const docs = JSON.parse(localStorage.getItem("pc_memo_docs") || "{}");
        docs[data.campaign] = { base64: fileData.base64, mime: fileData.mimeType || "text/html", name: fileData.fileName || "Memo", savedAt: Date.now() };
        localStorage.setItem("pc_memo_docs", JSON.stringify(docs));
      } catch (e) {}
    }
    // อัปเดตทั้ง months และ working (เดิมแก้แค่ months → hasMemo ใน getPromoDetails ไม่ขึ้นเพราะอ่านจาก working)
    const apply = r => { if (r.campaign === data.campaign) { if (url) r.memoUrl = url; r.updatedDate = NOW(); count++; } };
    Object.keys(store.months).forEach(m => store.months[m].forEach(apply));
    (store.working || []).forEach(apply);
    persist();
    try { if (window.PC_notify && url) window.PC_notify("memo_sent", { text: 'ส่ง Memo “' + data.campaign + '” เข้าระบบแล้ว — เปิดดูได้ที่หน้าติดตามโปรโมชัน' }); } catch (e) {}
    return { status: "success", message: `✅ แนบ/บันทึก Memo สำเร็จ: ${count} รายการ` };
  };

  /* ---- ไฟล์แนบจริงของโปรโมชัน (Coupon / Bill Discount / Voucher) ----
     เก็บ base64 ลง localStorage "pc_promo_files" แล้วคืน token "file:<id>"
     (ของเดิมคืนลิงก์ Drive ปลอม https://drive.google.com/demo-... → กดเปิดไม่ได้ ไฟล์จริงหาย) */
  function pcSaveUpload(f, label) {
    if (!f || !f.base64) return "";
    var name = f.fileName || (label || "attachment");
    if (String(f.base64).length > 3600000) return "nofile:" + name;
    var id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      var box = JSON.parse(localStorage.getItem("pc_promo_files") || "{}");
      box[id] = { base64: f.base64, mime: f.mimeType || "application/octet-stream", name: name, savedAt: Date.now() };
      localStorage.setItem("pc_promo_files", JSON.stringify(box));
    } catch (e) { return "nofile:" + name; }
    return "file:" + id;
  }
  window.pcSaveUpload = pcSaveUpload;

  /* เปิดไฟล์แนบ — ใช้แทน window.open(url) ทุกที่ (รองรับ token file:/memo:/nofile: · data: · ลิงก์จริง · ลิงก์เดโม) */
  window.pcOpenAttach = function (url, name) {
    url = String(url == null ? "" : url).trim();
    var info = function (t, x) { if (window.Swal) Swal.fire({ icon: "info", title: t, text: x }); else alert(t + "\n" + x); };
    if (!url || url === "undefined" || url === "null") return info("ไม่มีไฟล์แนบ", "รายการนี้ยังไม่ได้แนบไฟล์");
    if (url.indexOf("memo:") === 0) return window.pcViewMemo(name || "", url);
    if (url.indexOf("nofile:") === 0) return info("ไฟล์ใหญ่เกินเก็บในโหมดทดลอง", url.slice(7) + " — ระบบจริงเก็บไฟล์ไว้บนเซิร์ฟเวอร์ เปิดได้ปกติ");
    if (url.indexOf("file:") === 0) {
      var box = {}; try { box = JSON.parse(localStorage.getItem("pc_promo_files") || "{}"); } catch (e) {}
      var d = box[url.slice(5)];
      if (!d || !d.base64) return info("ไม่พบไฟล์แนบ", "ไฟล์นี้ถูกลบออกจากเครื่องนี้ หรือแนบไว้จากเครื่องอื่น");
      try {
        var bin = atob(d.base64), by = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i);
        var href = URL.createObjectURL(new Blob([by], { type: d.mime || "application/octet-stream" }));
        var inline = /^(image\/|text\/|application\/pdf)/.test(d.mime || "");
        var a = document.createElement("a");
        a.href = href; a.target = "_blank"; if (!inline) a.download = d.name || "attachment";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) {} }, 60000);
        return;
      } catch (e) { return info("เปิดไฟล์ไม่ได้", String((e && e.message) || e)); }
    }
    if (/^data:/.test(url)) {
      var a2 = document.createElement("a"); a2.href = url; a2.target = "_blank"; a2.download = name || "attachment";
      document.body.appendChild(a2); a2.click(); a2.remove(); return;
    }
    if (/^https?:/.test(url)) {
      if (/demo-(coupon|bill|voucher|memo)/.test(url)) return info("ไฟล์ตัวอย่าง (ข้อมูลเดโม)", "รายการนี้เป็นข้อมูลตัวอย่างของระบบ ยังไม่มีไฟล์จริงให้เปิด");
      var w = window.open(url, "_blank");
      if (!w) info("เบราว์เซอร์บล็อกการเปิดหน้าต่างใหม่", url);
      return;
    }
    info("ลิงก์ไฟล์ไม่ถูกต้อง", url);
  };

  /* ---- เปิดดูเอกสาร Memo ที่แนบไว้ (token memo:<campaign> → อ่านจาก pc_memo_docs แล้วเปิดเป็นหน้าใหม่) ---- */
  window.pcViewMemo = function (campaign, url) {
    var docs = {};
    try { docs = JSON.parse(localStorage.getItem("pc_memo_docs") || "{}"); } catch (e) {}
    var key = (url && url.indexOf("memo:") === 0) ? url.slice(5) : campaign;
    var d = docs[key] || docs[campaign];
    if (d && d.base64) {
      try {
        var bin = atob(d.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        window.open(URL.createObjectURL(new Blob([bytes], { type: d.mime || "text/html" })), "_blank");
        return;
      } catch (e) {}
    }
    if (url && /^https?:/.test(url) && url.indexOf("demo-memo") < 0) { window.open(url, "_blank"); return; }
    if (window.Swal) Swal.fire({ icon: "info", title: "ยังไม่มีเอกสาร Memo", text: "แคมเปญนี้ยังไม่ได้แนบเอกสาร Memo — ไปที่หน้า Memo แล้วกด “ยืนยันส่ง Memo”" });
    else alert("ยังไม่มีเอกสาร Memo");
  };

  /* ---- OP approve / reject (for Op Tracking page) ---- */
  API.setOpStatus = (campaignName, opStatus, note) => {
    const stamp = opStatus === "CONFIRMED" ? TODAY() : "";
    const reject = opStatus === "REJECTED";
    // tally reject issues parsed from the "[a · b · c]\ndetail" note
    if (reject) {
      if (!store.rejectIssues) store.rejectIssues = {};
      const m = String(note || "").match(/^\[([^\]]*)\]/);
      if (m) m[1].split("·").map(s => s.trim()).filter(Boolean)
        .forEach(iss => { store.rejectIssues[iss] = (store.rejectIssues[iss] || 0) + 1; });
    }
    Object.keys(store.months).forEach(m => store.months[m].forEach(r => {
      if (r.campaign === campaignName) {
        r.opStatus = opStatus;
        if (stamp) { r.opDoneDate = stamp; r.wentLive = true; }
        if (reject) { r.itStatus = "PENDING"; r.rejectReason = note || ""; r.itDoneDate = ""; r.opDoneDate = ""; r.rejectCount = (r.rejectCount || 0) + 1; }
      }
    }));
    store.working.forEach(w => {
      if (w.campaign === campaignName) {
        w.opStatus = opStatus;
        if (stamp) { w.opDoneDate = stamp; w.wentLive = true; }
        if (reject) { w.itStatus = "PENDING"; w.rejectReason = note || ""; w.itDoneDate = ""; w.opDoneDate = ""; w.rejectCount = (w.rejectCount || 0) + 1; }
        w.updatedDate = NOW();
      }
    });
    persist();
    const msg = reject
      ? "ตีกลับเรียบร้อย — ส่งงานกลับไปที่ IT แล้ว"
      : "อัปเดตสถานะ OP เรียบร้อย: " + opStatus;
    try {
      if (window.PC_notify) {
        if (reject) window.PC_notify("proposal_rejected", { text: 'โปรโมชัน “' + campaignName + '” ถูกตีกลับจาก OP' + (note ? ' — ' + String(note).replace(/^\[[^\]]*\]\s*/, '') : '') });
        else if (opStatus === "CONFIRMED") window.PC_notify("proposal_approved", { text: 'โปรโมชัน “' + campaignName + '” ได้รับการยืนยันจาก OP แล้ว — พร้อมใช้งานที่สาขา' });
      }
    } catch (e) {}
    return { status: "success", message: msg };
  };

  /* ⭐ FX-P87 — ชื่อสินค้าห้ามเกิน 20 ตัวอักษร
     EN = ชื่อที่ไปโผล่บน "บิลครัว" · TH = ชื่อบน "ปุ่ม POS" — ยาวกว่านี้เครื่องตัดทิ้ง พนักงานอ่านไม่ออก
     ตรวจทั้งชื่อสินค้า (items) และชื่อผงใน Subset (powders/flavors) */
  var NAME_MAX = 20;
  function nameTooLong(payload) {
    var bad = [];
    var chk = function (v, label) {
      v = String(v == null ? "" : v).trim();
      if (v.length > NAME_MAX) bad.push(label + " \"" + v + "\" = " + v.length + " ตัว");
    };
    (payload.items || []).forEach(function (it) { chk(it.name, "ชื่อ (EN)"); chk(it.th, "ชื่อ (TH)"); chk(it.itemNameEN, "ชื่อ (EN)"); chk(it.itemNameTH, "ชื่อ (TH)"); });
    (payload.subsets || []).forEach(function (s) { (s.powders || []).forEach(function (p) { chk(p.eng, "ชื่อผง (EN)"); chk(p.th, "ชื่อผง (TH)"); }); });
    (payload.groups || []).forEach(function (g) { (g.flavors || []).forEach(function (f) { chk(f.eng, "ชื่อผง (EN)"); chk(f.th, "ชื่อผง (TH)"); }); });
    if (!bad.length) return "";
    return "ชื่อสินค้ายาวเกิน " + NAME_MAX + " ตัวอักษร (EN = บิลครัว · TH = ปุ่ม POS) — กรุณาย่อให้สั้นลง:\n• " +
      bad.slice(0, 6).join("\n• ") + (bad.length > 6 ? "\n…และอีก " + (bad.length - 6) + " รายการ" : "");
  }

  /* ---- NPD: new product development submissions ---- */
  API.submitNPD = (payload, submitKey) => {
    if (!store.npd) store.npd = [];
    // SHOULD: idempotency — if this exact submit already went through, return the original (no dup)
    const seen = idemSeen(submitKey);
    if (seen) return { status: "success", message: "ส่งแบบฟอร์ม NPD เรียบร้อย (รายการเดิม)", id: seen.id, duplicate: true };
    // MUST: subset names unique (within form + against existing)
    /* เก็บ snapshot ของฟอร์ม ณ เวลาส่ง ไม่อ้าง object ของหน้าเว็บโดยตรง เพื่อให้
       Project / สาขา / subset / ราคา / สูตร RM ทุกฟิลด์คงอยู่ในฐานข้อมูลใบงาน */
    let submittedPayload;
    try { submittedPayload = JSON.parse(JSON.stringify(payload || {})); }
    catch (e) { return { status: "error", message: "ข้อมูล NPD ไม่อยู่ในรูปแบบที่บันทึกได้" }; }
    const dupIn = dupSubsetName(submittedPayload);
    if (dupIn) return dupError("ชื่อ Subset ซ้ำในฟอร์ม: \"" + dupIn + "\"");
    const _long = nameTooLong(submittedPayload);   /* FX-P87 */
    if (_long) return dupError(_long);
    const existNames = (store.npd || []).reduce((a, n) => a.concat((n.subsets || []).map(s => String(s.name || "").trim().toLowerCase())), []);
    const clash = (submittedPayload.subsets || []).map(s => String(s.name || "").trim().toLowerCase()).find(nm => nm && existNames.indexOf(nm) !== -1);
    if (clash) return dupError("ชื่อ Subset \"" + clash + "\" มีอยู่ในระบบแล้ว");
    /* FX-P73 — รหัสสินค้าห้ามชนงาน NPD อื่น — เดิมซ้ำได้เงียบ แล้วตอน IT ขึ้นปุ่มจะเขียนทับสินค้าเดิมหายไปทั้งแถว */
    const codeOwner = {};
    (store.npd || []).forEach(n => {
      (n.items || []).forEach(it => { const cc = String(it.code || "").trim(); if (cc) codeOwner[cc] = n.id + (n.project ? " (" + n.project + ")" : ""); });
      /* รหัสผง (CMPOS) ก็ห้ามชนเช่นกัน — ชนแล้วแถวผงจะทับกันในข้อมูลหลัก */
      (n.subsets || []).forEach(s => (s.powders || []).forEach(p => { const pc = String(p.cmpos || "").trim(); if (pc) codeOwner[pc] = n.id + (n.project ? " (" + n.project + ")" : ""); }));
    });
    (store.flavor || []).forEach(n => (n.groups || []).forEach(g => (g.flavors || []).forEach(f => { const fc = String(f.cmpos || "").trim(); if (fc) codeOwner[fc] = n.id; })));
    const myCodes = (submittedPayload.items || []).map(it => String(it.code || "").trim())
      .concat((submittedPayload.subsets || []).reduce((a, s) => a.concat((s.powders || []).map(p => String(p.cmpos || "").trim())), []));
    const codeClash = myCodes.filter(cc => cc && codeOwner[cc]);
    if (codeClash.length) return dupError("รหัส " + codeClash.slice(0, 4).join(", ") + (codeClash.length > 4 ? " …(" + codeClash.length + " รายการ)" : "") + " ถูกใช้อยู่แล้วในงาน " + codeOwner[codeClash[0]] + " — กรุณากดรันเลขใหม่");
    // atomic, collision-safe running id
    store._npdSeq = (store._npdSeq || (store.npd.length)) + 1;
    const id = "NPD-" + new Date().getFullYear() + String(store._npdSeq).padStart(3, "0");
    const newRm = harvestRm(submittedPayload);   // MUST: new RM codes flow into rm_master
    const rec = stampVersion(Object.assign({ id, submittedDate: NOW(), status: "PENDING", itStatus: "PENDING", formVersion: 1 }, submittedPayload));
    store.npd.push(rec);
    /* FX-P67 (ส่วนที่ 2 — ฟอร์ม NPD/ผง): เขียนไม่ลงต้องเตือน ห้ามขึ้นสำเร็จลอย ๆ */
    if (!persist()) { store.npd.pop(); store._npdSeq--; return { status: "error", message: "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม (งานยังไม่เข้าระบบ) — กดสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง" }; }
    try { if (window.PC_notify) {
      const pn = submittedPayload.projectName || submittedPayload.project || (submittedPayload.items && submittedPayload.items[0] && submittedPayload.items[0].name) || id;
      const _its = (submittedPayload.items || []);
      const _eb = ['มีสินค้าใหม่ (NPD) จากทีม RD — รอ IT ตรวจสอบสูตร/Subset และขึ้นปุ่มบน POS', '',
        'รหัสงาน (NPD ID)  : ' + id,
        'โปรเจกต์          : ' + pn,
        'จำนวนรายการสินค้า : ' + _its.length + ' รายการ', '', 'รายการสินค้า:']
        .concat(_its.map(function (it, i) { return '  ' + (i + 1) + '. ' + (it.name || it.code || '-') + (it.code ? ' (' + it.code + ')' : '') + (it.category ? ' · หมวด ' + it.category : '') + (it.priceTakeaway ? ' · TA ' + it.priceTakeaway + '.-' : ''); }))
        .concat(['', '— ระบบจัดการโปรโมชัน Potato Corner —']).join('\n');
      window.PC_notify("npd_new", { text: 'สินค้าใหม่ (NPD): “' + pn + '” — รอ IT ขึ้นปุ่ม', emailBody: _eb });
    } } catch (e) {}
    const saved = {
      subsets: (rec.subsets || []).length,
      powders: (rec.subsets || []).reduce(function (n, s) { return n + ((s.powders || []).length); }, 0),
      items: (rec.items || []).length,
      recipeRows: (rec.items || []).reduce(function (n, it) { return n + ((it.recipes || []).length); }, 0)
    };
    return idemRemember(submitKey, { status: "success", message: "ส่งแบบฟอร์ม NPD เรียบร้อย", id, newRm, saved, version: rec.version });
  };
  /* ซ่อมข้อมูล NPD รุ่นก่อนที่ IT ปิดงานแล้ว แต่ยังไม่สร้าง Recipe RM / ตารางผูก
     สูตรสินค้า (เกิดได้จากเวอร์ชันก่อนเพิ่ม master-sync) โดยอ่านข้อมูลต้นทางจาก
     ใบ NPD เดิมเท่านั้น และไม่ทับสูตรที่มีผู้ใช้แก้เอง */
  function syncCompletedNpdMasters() {
    var repairedRecipes = 0, repairedFormulaMaps = 0;
    (store.npd || []).forEach(function (n) {
      if (String(n.itStatus || '').toUpperCase() !== 'COMPLETE') return;
      (n.items || []).forEach(function (it) {
        var code = String(it.code || '').trim(); if (!code) return;
        var expected = (it.recipes || []).filter(function (r) { return String(r.code || '').trim(); });
        var current = (store.recipeCustom || {})[code];
        var actual = current && current.modes ? Object.keys(current.modes).reduce(function (sum, k) { return sum + ((current.modes[k] || []).length); }, 0) : 0;
        /* เติมเมื่อไม่มีสูตร หรือเป็นสูตร NPD เดิมที่เขียนมาไม่ครบเท่านั้น */
        if (expected.length && (!current || (String(current._fromNpd || '') === String(n.id) && actual < expected.length))) {
          npdSaveRecipe(it, code, n.id); repairedRecipes++;
        }
        /* สูตร Subset (เช่น Churro + SAUCE & TOPPING) ต้องมีในแหล่งผูกกลางด้วย */
        try {
          var before = localStorage.getItem('pc_itemset_comp') || '{}';
          npdLinkSubsetComp(n, it, code);
          if ((localStorage.getItem('pc_itemset_comp') || '{}') !== before) repairedFormulaMaps++;
        } catch (e) {}
      });
    });
    if (repairedRecipes && !persist()) return { recipes: 0, formulaMaps: repairedFormulaMaps, failed: true };
    return { recipes: repairedRecipes, formulaMaps: repairedFormulaMaps, failed: false };
  }
  API.syncCompletedNpdMasters = syncCompletedNpdMasters;
  API.getNPDList = () => { syncCompletedNpdMasters(); return (store.npd || []).slice().reverse(); };

  /* วันที่ใน Product Master จาก NPD ใช้ช่วงวันที่ที่ RD ระบุ; งานเก่า/ข้อมูลที่ไม่มีวัน
     จึง fallback เป็นวันนี้ถึง 31/12/2050 เพื่อไม่ให้สถานะสินค้าหาย */
  var MASTER_NO_END = "2050-12-31";
  /* ตรวจข้อมูลก่อนย้ายใบงาน NPD ไปเป็น master จริง: เดิมถ้าข้อมูล Recipe
     กรอกไม่ครบ ระบบจะข้ามแถวนั้นแบบเงียบ ๆ แต่ยังเปลี่ยนงานเป็น COMPLETE */
  function npdMasterInputErrors(n) {
    var errors = [], itemCodes = {}, existing = {}, seededCodes = {};
    if (!n || !Array.isArray(n.items) || !n.items.length) return ["ไม่มีรายการสินค้า"];
    (store.npdProducts || []).forEach(function (p) {
      var c = String(p.itemCode || "").trim();
      if (c) existing[c] = p;
    });
    (SEED.items || []).forEach(function (p) { var c = String(p.itemCode || '').trim(); if (c) seededCodes[c] = 1; });
    (n.items || []).forEach(function (it, ii) {
      var label = 'สินค้า #' + (ii + 1) + ' (' + (it.name || '-') + ')';
      var code = String(it.code || '').trim();
      if (!code) { errors.push(label + ': ไม่มี Item Code'); return; }
      if (itemCodes[code]) errors.push(label + ': Item Code ซ้ำกับสินค้า #' + itemCodes[code]);
      itemCodes[code] = ii + 1;
      if (existing[code] && String(existing[code]._fromNpd || '') !== String(n.id || '')) {
        errors.push(label + ': Item Code ' + code + ' มีอยู่ใน Product Master แล้ว');
      }
      if (seededCodes[code]) errors.push(label + ': Item Code ' + code + ' มีอยู่ใน Product Master หลักแล้ว');
      (it.recipes || []).forEach(function (r, ri) {
        var vals = ['code', 'desc', 'qty', 'unit'].map(function (k) { return String(r[k] == null ? '' : r[k]).trim(); });
        if (!vals.some(Boolean)) return; // แถวว่างที่ UI ใส่ไว้เป็นค่าเริ่มต้น
        var missing = [];
        ['Code RM', 'Description', 'Qty', 'Unit'].forEach(function (label2, vi) { if (!vals[vi]) missing.push(label2); });
        if (missing.length) errors.push(label + ': Recipe RM แถว ' + (ri + 1) + ' ขาด ' + missing.join(', '));
      });
    });
    (n.subsets || []).forEach(function (s, si) {
      var hasPowder = (s.powders || []).some(function (p) { return !p.noFlavor && String(p.eng || p.th || p.cmpos || '').trim(); });
      if (hasPowder && !String(s.ssCode || '').trim()) errors.push('Subset #' + (si + 1) + ': ไม่มี SS Code');
      (s.powders || []).forEach(function (p, pi) {
        if (p.noFlavor || !String(p.eng || p.th || p.cmpos || '').trim()) return;
        if (!String(p.cmpos || '').trim()) errors.push('Subset #' + (si + 1) + ' ผง #' + (pi + 1) + ': ไม่มี CMPOS Code');
      });
    });
    return errors;
  }

  /* ยืนยันหลังเขียนว่า Product Master และ Recipe RM ถูกสร้างครบจริงก่อนตอบว่า COMPLETE */
  function npdMasterWriteErrors(n) {
    var errors = [];
    (n.items || []).forEach(function (it, ii) {
      var code = String(it.code || '').trim(); if (!code) return;
      var product = (store.npdProducts || []).find(function (p) { return String(p.itemCode || '') === code && String(p._fromNpd || '') === String(n.id || ''); });
      if (!product) errors.push('สินค้า #' + (ii + 1) + ' ยังไม่ถูกเขียนเข้า Product Master');
      var recipeRows = (it.recipes || []).filter(function (r) { return String(r.code || '').trim(); });
      if (recipeRows.length) {
        var recipe = (store.recipeCustom || {})[code];
        var actual = recipe && recipe.modes ? Object.keys(recipe.modes).reduce(function (sum, k) { return sum + ((recipe.modes[k] || []).length); }, 0) : 0;
        if (!recipe || actual < recipeRows.length) errors.push('สินค้า #' + (ii + 1) + ' เขียน Recipe RM ไม่ครบ');
      }
    });
    return errors;
  }

  /* NPD → product master: when IT completes an NPD button, create/refresh item rows + map prices per channel */
  function npdToProducts(n) {
    if (!n || !Array.isArray(n.items)) return;
    store.npdProducts = store.npdProducts || [];
    n.items.forEach(function (it) {
      var code = String(it.code || "").trim(); if (!code) return;
      var dlv = it.priceDelivery || "";
      var px = it.prices || {};
      function ch(name) { return (px[name] != null && px[name] !== "") ? px[name] : dlv; }
      var row = {
        itemCode: code, itemNameEN: abbrFix(it.name || ""), itemNameTH: abbrFix(it.th || ""),
        /* FX-P77 — cateCode ว่าง = ตัวนับเลขสินค้านับหมวดนี้ไม่เห็นของจริง → จ่ายเลขซ้ำทับงานเก่า · ไม่มีให้เดาจาก  3 หลักหน้าของรหัส */
        category: it.category || n.category || "", cateCode: it.cateCode || n.cateCode || (/^\d{6,}$/.test(code) ? code.slice(0, 3) : ""),
        department: it.department || n.department || "Food", depCode: it.depCode || n.depCode || "100",
        itemType: it.itemType || "Single Item",
        priceTA: it.priceTakeaway || "", priceDLV: dlv,
        priceGrab: ch("Grab"), priceLineman: ch("Lineman"), pricePanda: dlv,
        priceShopee: ch("ShopeeFood"), priceRobinhood: ch("Robinhood"), priceGokoo: ch("Gokoo"),
        prices: Object.assign({}, px), saleModes: (it.saleModes || []).slice(),
        status: "Active", core: "", showInForm: "Show", sellStores: it.sellStores || n.store || "ALL", storeConds: (it.storeConds || n.storeConds || []).slice(),
        fromDate: n.start || TODAY(), toDate: n.end || MASTER_NO_END,
        _fromNpd: n.id, updatedAt: NOW()   /* FX-P84 — ตราเวลาให้ตัวรวมข้อมูลข้ามเครื่องรู้ว่าแถวไหนใหม่กว่า */
      };
      /* บันทึกซ้ำทีหลัง — คงวันที่เริ่มเดิมที่เคยลงไว้ */
      var _prev = store.npdProducts.find(function (p) { return String(p.itemCode) === code; });
      if (_prev && _prev.fromDate) row.fromDate = _prev.fromDate;
      var i = store.npdProducts.findIndex(function (p) { return String(p.itemCode) === code; });
      if (i >= 0) store.npdProducts[i] = row; else store.npdProducts.push(row);
      // link NPD powder-formulas (Subset) into the product's "Subset & Item List" (pc_itemset_comp)
      npdLinkSubsetComp(n, it, code);
      // สูตร RM รายสินค้า (BOM) → store.recipeCustom (แยกช่องทาง) เพื่อให้ตาราง Recipe (ItemSet) ดึงมาโชว์ได้
      npdSaveRecipe(it, code, n.id);
    });
  }

  /* NPD recipe lines (items[].recipes[]) → store.recipeCustom[code] = {name, modes:{"Take Away":[{rm,d,q,u}],"Delivery":[...]}}
     channels ตัวอย่าง: "Take-Away","Grab","Lineman" — แยก Take Away vs Delivery (ช่องทางอื่นที่ไม่ใช่ Take Away = Delivery) */
  function npdSaveRecipe(it, code, npdId) {
    store.recipeCustom = store.recipeCustom || {};
    var modes = { "Take Away": [], "Delivery": [] };
    (it.recipes || []).forEach(function (r) {
      var rc = String(r.code || "").trim(); if (!rc) return;
      var line = { rm: rc, d: r.desc || "", q: r.qty || "", u: r.unit || "" };
      var chs = r.channels || [];
      var isTA = false, isDlv = false;
      chs.forEach(function (c) { if (/take[-\s]?away/i.test(String(c))) isTA = true; else isDlv = true; });
      if (!chs.length) { isTA = true; isDlv = true; }   // ไม่ติ๊กช่องทาง = ใช้ทุกช่องทาง
      if (isTA) modes["Take Away"].push(line);
      if (isDlv) modes["Delivery"].push(line);
    });
    if (!modes["Take Away"].length && !modes["Delivery"].length) { delete store.recipeCustom[code]; return; }
    store.recipeCustom[code] = { name: it.name || "", modes: modes, _fromNpd: npdId || "", updatedAt: NOW() };
  }

  /* NPD form "\u0e2a\u0e39\u0e15\u0e23\u0e1c\u0e07/Subset" \u2192 Edit Product "Subset & Item List" (pc_itemset_comp)
     formula = { ss:<subset name>, choose:<n> }; resolve name\u2192ssCode via n.subsets; also honor direct item.ssCode */
  function npdLinkSubsetComp(n, it, code) {
    try {
      var rows = [];
      function addRow(ssc, mn, mx) {
        ssc = String(ssc || "").trim(); if (!ssc) return;
        if (rows.some(function (r) { return r.code === ssc; })) return;
        mn = parseInt(mn, 10); if (!mn || mn < 1) mn = 1;
        mx = parseInt(mx, 10); if (!mx || mx < mn) mx = mn;
        rows.push({ code: ssc, min: mn, max: mx, _npd: n.id });
      }
      (it.formulas || []).forEach(function (f) {
        var ssc = String(f.ss || "").trim();
        if (!/^SS/i.test(ssc)) {  // f.ss อาจเป็นชื่อ (รูปแบบเก่า) → resolve เป็น ssCode
          var sub = (n.subsets || []).find(function (s) { return String(s.name || "") === String(f.ss || ""); });
          if (sub && sub.ssCode) ssc = sub.ssCode;
        }
        var mn = (f.chooseMin != null ? f.chooseMin : f.choose);
        var mx = (f.chooseMax != null ? f.chooseMax : f.choose);
        if (!/^SS\d/i.test(String(ssc || "").trim())) return;   /* FX-P72 — resolve ชื่อ→ssCode ไม่สำเร็จ = ข้าม ห้ามเขียนชื่อลงช่องรหัส */
        addRow(ssc, mn, mx);
      });
      if (it.ssCode) addRow(it.ssCode, 1, 1);
      if (!rows.length) return;
      var comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}");
      if (!comp || typeof comp !== "object") comp = {};
      var cur = comp[code];
      // seed only when empty or previously NPD-seeded \u2014 never clobber manual user edits
      if (!cur || !cur.length || cur.every(function (r) { return r && r._npd; })) {
        comp[code] = rows;
        localStorage.setItem("pc_itemset_comp", JSON.stringify(comp));
      }
    } catch (e) {}
  }

  /* FX-P80 — ผงใน Subset ที่ RD กรอกมากับงาน NPD → สร้างเป็นสินค้าหมวด Flavors ผูก ssCode
     เดิมเก็บไว้ในใบงานเท่านั้น → หน้า Subset Manager ขึ้น "ยังไม่มีผงในชุดนี้" และ POS ไม่มีปุ่มผง */
  function npdSubsetToProducts(n) {
    if (!n || !Array.isArray(n.subsets)) return 0;
    store.npdProducts = store.npdProducts || [];
    var made = 0;
    n.subsets.forEach(function (s) {
      var ss = String(s.ssCode || "").trim(); if (!/^SS\d/i.test(ss)) return;
      (s.powders || []).forEach(function (p, pi) {
        var code = String(p.cmpos || "").trim(); if (!code) return;
        var nm = abbrFix(String(p.eng || p.th || "").trim()); if (!nm) nm = ss + " " + (pi + 1);
        var addon = (p.addon !== undefined && p.addon !== null && p.addon !== '') ? p.addon : p.price;
        var price = (addon === 0 || addon) ? String(addon) : "";
        var row = {
          itemCode: code, itemNameEN: nm, itemNameTH: abbrFix(String(p.th || p.eng || "").trim()) || nm,
          category: "Flavors", cateCode: "103", department: "Food", depCode: "100",
          itemType: "Single Item", priceTA: price, priceDLV: price,
          status: "Active", core: (n.saleType === "seasonal") ? "ขายชั่วคราว" : "สินค้าหลักขายตลอด",
          showInForm: "Hide", sellStores: n.store || "ALL",
          ssCode: ss, posSeq: Number(p.seq) || (pi + 1),
          fromDate: TODAY(), toDate: MASTER_NO_END, _fromNpd: n.id, updatedAt: NOW()
        };
        var i = store.npdProducts.findIndex(function (x) { return String(x.itemCode) === code; });
        if (i >= 0) { if (store.npdProducts[i].fromDate) row.fromDate = store.npdProducts[i].fromDate; store.npdProducts[i] = row; }
        else store.npdProducts.push(row);
        made++;
      });
    });
    return made;
  }

  /* ⭐ FX-P86 — ขึ้นทะเบียนเลขที่ IT แจกจริงเข้าคลังเลขกลาง (PC_COUNTER) ตอนขึ้นปุ่ม NPD
     อาการที่เจอ: เลขสินค้า/ผงที่ใช้จริงไม่มีเรคคอร์ดในทะเบียนเลย (1031292-1031311 ของ NPD-2026001)
     → ตัวนับ/คลังเลขคืน (freed) มองว่าว่าง แล้วแจกซ้ำให้งานหลัง (Tamago ได้ชุดเดียวกัน)
     จึงลงทะเบียนเป็น CONFIRMED ทุกครั้งที่ขึ้นปุ่ม · เงียบ ไม่มี PC_COUNTER ก็ข้าม */
  function lockNpdCodes(n) {
    try {
      var C = window.PC_COUNTER; if (!C || !C.state || !C._save || !n) return 0;
      var st = C.state(); if (!st || !st.reservations) return 0;
      var who = n.id + (n.project ? " (" + n.project + ")" : ""), now = NOW(), got = 0;
      var add = function (code, field) {
        code = String(code || "").trim(); if (!/^\d{6,7}$/.test(code)) return;
        var key = "item::" + code; if (st.reservations[key]) return;
        st.reservations[key] = {
          code: code, type: "item", num: Number(code.slice(3)) || 0, status: "CONFIRMED",
          where: who, campaign: who, field: field || "", by: "IT",
          at: now, confirmedAt: now, releasedAt: ""
        };
        got++;
      };
      (n.items || []).forEach(function (it) { add(it.code, "NPD item"); add(it.cmpos, "NPD cmpos"); });
      (n.subsets || []).forEach(function (s) {
        (s.powders || []).forEach(function (p) { add(p.cmpos, "Flavor " + (s.ssCode || "")); });
      });
      (n.groups || []).forEach(function (g) {
        (g.flavors || []).forEach(function (f) { add(f.cmpos, "Flavor " + (g.ssCode || "")); });
      });
      if (got) C._save();
      return got;
    } catch (e) { return 0; }
  }

  /* ---- NPD: IT fills system codes (Item Code / CMPOS / SS Code) then marks COMPLETE ---- */
  API.setNpdItStatus = (id, itemCodes, status) => {
    const target = (store.npd || []).find(n => n.id === id);
    if (!target) return conflict("ไม่พบงาน NPD นี้แล้ว (อาจถูกลบ)");
    // MUST: don't let two people complete the same job twice
    if (String(target.itStatus || "").toUpperCase() === "COMPLETE") return conflict("งานนี้ถูกบันทึกขึ้นปุ่มไปแล้วโดยผู้ใช้อื่น — กรุณาโหลดใหม่");
    const oldCodes = (target.items || []).map(function (it) { return { code: it.code, cmpos: it.cmpos, ssCode: it.ssCode }; });
    (target.items || []).forEach((it, i) => {
      const c = (itemCodes || [])[i] || {};
      if (c.code !== undefined) it.code = c.code;
      if (c.cmpos !== undefined) it.cmpos = c.cmpos;
      if (c.ssCode !== undefined) it.ssCode = c.ssCode;
    });
    if (String(status || "COMPLETE").toUpperCase() === "COMPLETE") {
      const inputErrors = npdMasterInputErrors(target);
      if (inputErrors.length) {
        (target.items || []).forEach(function (it, i) { Object.assign(it, oldCodes[i] || {}); });
        return { status: "error", message: "ยังขึ้น Product Master ไม่ได้:\n• " + inputErrors.slice(0, 8).join("\n• ") };
      }
    }
    target.itStatus = status || "COMPLETE";
    target.itDoneDate = TODAY();
    if (String(target.itStatus).toUpperCase() === "COMPLETE") {
      npdToProducts(target); npdSubsetToProducts(target);
      const writeErrors = npdMasterWriteErrors(target);
      if (writeErrors.length) return { status: "error", message: "ตรวจสอบการเขียน Master ไม่ผ่าน:\n• " + writeErrors.join("\n• ") };
      (target.subsets || []).forEach(function (s) { subsetRegister(s.ssCode, s.name, s.name2 || s.short, "npd:" + target.id); }); lockNpdCodes(target); /* FX-P86 */
    }
    stampVersion(target);
    if (!persist()) return { status: "error", message: "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม — กดสำรองข้อมูล/รีเฟรช แล้วทำอีกครั้ง" };
    return { status: "success", message: "ขึ้นปุ่มสินค้าใหม่เรียบร้อย", version: target.version };
  };

  /* ---- NPD: IT edits the whole form (fully editable) then marks COMPLETE ---- */
  API.updateNpd = (id, data, expectedVersion) => {
    const idx = (store.npd || []).findIndex(n => n.id === id);
    if (idx === -1) return conflict("ไม่พบงาน NPD นี้แล้ว (อาจถูกลบ)");
    const _lg = nameTooLong(data || {});   /* FX-P87 */
    if (_lg) return dupError(_lg);
    const n = store.npd[idx];
    // MUST: optimistic lock — reject silent overwrite if someone saved in between
    if (expectedVersion != null && n.version != null && Number(expectedVersion) !== Number(n.version)) {
      return conflict("มีผู้อื่นแก้งานนี้ไปแล้ว — กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    }
    // แอดมินแก้ข้อมูลจากศูนย์ติดตามงาน = แก้ให้ถูกต้องเฉย ๆ ห้ามดันสถานะเป็น "IT ขึ้นปุ่มเสร็จ"
    const _adminEdit = !!(data && data._adminEdit);
    const _d = Object.assign({}, data || {}); delete _d._adminEdit;
    const next = stampVersion(Object.assign({}, n, _d, _adminEdit ? {
      id: n.id, submittedDate: n.submittedDate, status: n.status || "PENDING",
      itStatus: n.itStatus || "", itDoneDate: n.itDoneDate || ""
    } : {
      id: n.id, submittedDate: n.submittedDate, status: n.status || "PENDING",
      itStatus: "COMPLETE", itDoneDate: TODAY()
    }));
    const syncMaster = String(next.itStatus || "").toUpperCase() === "COMPLETE";
    if (syncMaster) {
      const inputErrors = npdMasterInputErrors(next);
      if (inputErrors.length) return { status: "error", message: "ยังขึ้น Product Master ไม่ได้:\n• " + inputErrors.slice(0, 8).join("\n• ") };
    }
    harvestRm(next);   // new RM from IT edits also flows into rm_master
    store.npd[idx] = next;
    if (syncMaster) {
      npdToProducts(next);
      npdSubsetToProducts(next);   /* FX-P80 — ผงใน Subset ของงานนี้ → สินค้าหมวด Flavors */
      const writeErrors = npdMasterWriteErrors(next);
      if (writeErrors.length) return { status: "error", message: "ตรวจสอบการเขียน Master ไม่ผ่าน:\n• " + writeErrors.join("\n• ") };
      lockNpdCodes(next);          /* FX-P86 — ล็อกเลขที่แจกแล้วกันแจกซ้ำ */
    }
    if (syncMaster) {
      // subset ที่ IT บันทึก → เก็บเข้าหน้าจัดการ Subset (pc_subset_custom)
      try { const _c = JSON.parse(localStorage.getItem("pc_subset_custom") || "[]"); (store.npd[idx].subsets || []).forEach(s => { const ss = s.ssCode || s.code; if (ss && !_c.find(x => x.ssCode === ss)) _c.push({ ssCode: ss, nameTH: s.name || ss, nameEN: s.name || ss }); }); localStorage.setItem("pc_subset_custom", JSON.stringify(_c)); } catch (e) {}
      /* FX-P72 — ขึ้นทะเบียน Subset จริง เพื่อให้หน้าแจ้งโปร/Item Set เลือกเป็นกลุ่มได้ */
      try { (store.npd[idx].subsets || []).forEach(s => subsetRegister(s.ssCode || s.code, s.name, s.name2 || s.short, "npd:" + store.npd[idx].id)); } catch (e) {}
    }
    if (!persist()) return { status: "error", message: "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม — กดสำรองข้อมูล/รีเฟรช แล้วทำอีกครั้ง" };
    return { status: "success", message: "บันทึก NPD เรียบร้อย", version: store.npd[idx].version };
  };

  function seedDemoNpd() {
    return []; // demo NPD cleared — รอ import ข้อมูลจริง
    return [
      {
        id: "NPD-2026001", project: "New Item - Chicken Joint", start: "2026-07-01", end: "2026-07-31",
        store: "PC1001, PC1002", remark: "", rd: "MKT Team",
        submittedDate: "2026-06-14", status: "PENDING",
        subsets: [],
        items: [{
          name: "Large Chicken Joint", th: "ลาร์จ ข้อไก่ทอด", code: "", category: "Specialty Chicken",
          saleModes: ["Take-Away", "Grab"], priceTakeaway: "79", priceDelivery: "85", prices: { "Grab": "85" },
          recipes: [
            { code: "3060", desc: "ข้อไก่ทอด", qty: "85", unit: "G", channels: ["Take-Away", "Grab"] },
            { code: "4001", desc: "ถ้วย Large", qty: "1", unit: "pcs", channels: ["Take-Away"] }
          ],
          formulas: []
        }]
      },
      {
        id: "NPD-2026002", project: "New Item - Duck Pop", start: "2026-07-05", end: "2026-08-05",
        store: "ALL", remark: "", rd: "MKT Team",
        submittedDate: "2026-06-12", status: "PENDING", itStatus: "COMPLETE", itDoneDate: "2026-06-13",
        subsets: [],
        items: [{
          name: "Mega Duck Pop", th: "เมก้า เป็ดป็อป", code: "108026", category: "Specialty Chicken",
          saleModes: ["Take-Away"], priceTakeaway: "149", priceDelivery: "", prices: {}, cmpos: "104210", ssCode: "SS0031",
          recipes: [{ code: "3070", desc: "เนื้อเป็ด", qty: "90", unit: "G", channels: ["Take-Away"] }],
          formulas: []
        }]
      },
      {
        id: "NPD-2026003", project: "New Item - Pizza Bag", start: "2026-06-01", end: "2026-06-30",
        store: "PC1006", remark: "", rd: "MKT Team",
        submittedDate: "2026-05-28", status: "CONFIRMED", itStatus: "COMPLETE", itDoneDate: "2026-05-29", confirmedDate: "2026-05-30",
        subsets: [],
        items: [{
          name: "Mega Pizza Bag", th: "เมก้า พิซซ่าแบ็ก", code: "110085", category: "Small Bites",
          saleModes: ["Take-Away", "Lineman"], priceTakeaway: "169", priceDelivery: "175", prices: { "Lineman": "175" }, cmpos: "110900", ssCode: "SS0040",
          recipes: [{ code: "4002", desc: "ถุง Mega", qty: "1", unit: "pcs", channels: ["Take-Away", "Lineman"] }],
          formulas: []
        }]
      },
      {
        id: "NPD-2026004", project: "New Item - Crispy Squid", start: "2026-07-10", end: "2026-08-10",
        store: "PC1003, PC1004", remark: "", rd: "MKT Team",
        submittedDate: "2026-06-10", status: "REJECTED", itStatus: "", rejectReason: "สูตรผง (qty/หน่วย) ไม่ครบ — กรุณาระบุปริมาณผงต่อถ้วยให้ชัดเจน", rejectCount: 1,
        subsets: [],
        items: [{
          name: "Large Crispy Squid", th: "ลาร์จ ปลาหมึกกรอบ", code: "", category: "Small Bites",
          saleModes: ["Take-Away"], priceTakeaway: "119", priceDelivery: "", prices: {},
          recipes: [{ code: "3165", desc: "ปลาหมึกชุบแป้ง", qty: "100", unit: "G", channels: ["Take-Away"] }],
          formulas: []
        }]
      }
    ];
  }
  function seedDemoFlavor() {
    return []; // demo Flavor cleared — รอ import ข้อมูลจริง
    return [
      {
        id: "FLV-2026001", project: "ผงรสใหม่ Q3 — Spicy Series", start: "2026-07-01", end: "2026-09-30",
        rd: "RD Nan", submittedDate: "2026-06-12", status: "PENDING", itStatus: "",
        groups: [{
          ssCode: "SS0018", name: "Flavored Fries Powder",
          flavors: [
            { cmpos: "", eng: "Spicy Tom Yum", code: "3141", desc: "ผงปรุงรส ต้มยำ 500G", qty: "1.91", unit: "g", spoon: "ช้อน 5 ml × 1", price: 0 },
            { cmpos: "", eng: "Larb", code: "3142", desc: "ผงปรุงรส ลาบ 500G", qty: "1.80", unit: "g", spoon: "ช้อน 5 ml × 1", price: 0 }
          ]
        }]
      },
      {
        id: "FLV-2026002", project: "ผงรสชีส Truffle", start: "2026-07-01", end: "2026-08-31",
        rd: "RD Max", submittedDate: "2026-06-08", status: "CONFIRMED", itStatus: "COMPLETE", itDoneDate: "2026-06-15",
        groups: [{
          ssCode: "SS0021", name: "Premium Cheese Powder",
          flavors: [
            { cmpos: "CM4801", eng: "Truffle Cheese", code: "3210", desc: "ผงชีสทรัฟเฟิล 500G", qty: "2.10", unit: "g", spoon: "ช้อน 5 ml × 1.5", price: 5 }
          ]
        }]
      },
      {
        id: "FLV-2026003", project: "ผงรส BBQ Smoke", start: "2026-07-01", end: "2026-08-31",
        rd: "RD Nan", submittedDate: "2026-06-09", status: "REJECTED", itStatus: "",
        rejectReason: "ชื่อรสซ้ำกับผงเดิมในระบบ — กรุณาเปลี่ยนชื่อก่อนส่งใหม่", rejectCount: 1,
        groups: [{
          ssCode: "SS0018", name: "Flavored Fries Powder",
          flavors: [
            { cmpos: "", eng: "BBQ Smoke", code: "3175", desc: "ผงปรุงรส BBQ 500G", qty: "1.85", unit: "g", spoon: "ช้อน 5 ml × 1", price: 0 }
          ]
        }]
      }
    ];
  }
  API.submitFlavor = (payload, submitKey) => {
    if (!store.flavor) store.flavor = [];
    const seen = idemSeen(submitKey);
    if (seen) return { status: "success", message: "ส่งแบบฟอร์มผงรสชาติเรียบร้อย (รายการเดิม)", id: seen.id, duplicate: true };
    const _lfv = nameTooLong(payload || {});   /* FX-P87 — ชื่อไม่เกิน 20 ตัวอักษร */
    if (_lfv) return dupError(_lfv);
    store._flvSeq = (store._flvSeq || store.flavor.length) + 1;
    const id = "FLV-" + new Date().getFullYear() + String(store._flvSeq).padStart(3, "0");
    // new RM in flavor groups → rm_master
    const added = [];
    (payload && payload.groups || []).forEach(g => (g.flavors || []).forEach(f => {
      const c = normCode(f.code); const d = normCode(f.desc); if (c && d && !findRm(c)) { rmMaster().push(stampVersion({ code: c, desc: d, unit: normCode(f.unit) || "g" })); added.push(c); }
    }));
    const rec = stampVersion(Object.assign({ id, submittedDate: NOW(), status: "PENDING" }, payload));
    store.flavor.push(rec);
    if (!persist()) { store.flavor.pop(); store._flvSeq--; return { status: "error", message: "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม (งานยังไม่เข้าระบบ) — กดสำรองข้อมูล/รีเฟรช แล้วส่งอีกครั้ง" }; }
    try { if (window.PC_notify) window.PC_notify("flavor_new", { text: 'แจ้งเพิ่มผงรสชาติใหม่ ' + id + (added.length ? ' (' + added.join(', ') + ')' : '') + ' — รอ IT ขึ้นปุ่มผงบน POS' }); } catch (e) {}
    return idemRemember(submitKey, { status: "success", message: "ส่งแบบฟอร์มผงรสชาติเรียบร้อย", id, newRm: added, version: rec.version });
  };
  API.getFlavorList = () => (store.flavor || []).slice().reverse();

  /* Flavor → product master: each flavor powder becomes a Flavors SKU (ผงตามฤดูกาล) */
  function flavorToProducts(n) {
    if (!n || !Array.isArray(n.groups)) return;
    store.npdProducts = store.npdProducts || [];
    var SM = window.PC_SUBSET_MASTER || [];
    function shortOf(ss){ var r = SM.find(function(s){ return s.ssCode === ss; }); var v = r ? (r.short || "") : "";
      /* \u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d\u0e0a\u0e38\u0e14\u0e1c\u0e07\u0e2d\u0e32\u0e08\u0e16\u0e39\u0e01\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e44\u0e1b\u0e41\u0e25\u0e49\u0e27 (pc_subset_edits) \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e43\u0e0a\u0e49\u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e25\u0e49\u0e27 */
      try { var ed = JSON.parse(localStorage.getItem("pc_subset_edits") || "{}") || {}; if (ed[ss] && ed[ss].short) v = ed[ss].short; } catch (e) {}
      return abbrFix(v); }
    n.groups.forEach(function (g) {
      var sh = shortOf(g.ssCode);
      // Sale Mode รายกลุ่ม (จากหน้าเพิ่มผง) → คุมว่าผงขึ้นขายช่องทางไหน · ไม่มี = ทุกช่อง (legacy)
      var hasSM = Array.isArray(g.saleModes) && g.saleModes.length;
      var nmf = function (s) { return String(s || "").toLowerCase().replace(/[\s_-]/g, ""); };
      var smset = {}; if (hasSM) g.saleModes.forEach(function (c) { smset[nmf(c)] = 1; });
      var onAny = function (arr) { if (!hasSM) return true; for (var i = 0; i < arr.length; i++) { if (smset[nmf(arr[i])]) return true; } return false; };
      (g.flavors || []).forEach(function (f, _fi) {
        var code = String(f.cmpos || f.code || "").trim(); if (!code) return;
        var nm = abbrFix((f.eng || "") + (sh ? (" " + sh) : ""));
        var p = f.price || "";
        var pTA = onAny(["Take Away", "Take-Away", "Dine In"]) ? p : "";
        var pGrab = onAny(["Grab"]) ? p : "", pLine = onAny(["Lineman"]) ? p : "", pPanda = onAny(["foodpanda", "panda"]) ? p : "";
        var pShopee = onAny(["ShopeeFood", "Shopee"]) ? p : "", pRobin = onAny(["Robinhood"]) ? p : "", pGokoo = onAny(["Gokoo"]) ? p : "";
        var anyDeliv = onAny(["Delivery"]) || pGrab || pLine || pPanda || pShopee || pRobin || pGokoo;
        var row = {
          itemCode: code, itemNameEN: nm, itemNameTH: nm,
          category: "Flavors", cateCode: "103", department: "Food", depCode: "100",
          itemType: "Single Item", priceTA: pTA, priceDLV: anyDeliv ? p : "",
          priceGrab: pGrab, priceLineman: pLine, pricePanda: pPanda, priceShopee: pShopee, priceRobinhood: pRobin, priceGokoo: pGokoo,
          saleModes: hasSM ? g.saleModes.slice() : undefined,
          status: "Active", core: (n.saleType === "seasonal") ? "ขายชั่วคราว" : "สินค้าหลักขายตลอด", showInForm: "Hide", sellStores: "ALL",
          fromDate: TODAY(), toDate: MASTER_NO_END,
          ssCode: g.ssCode, posSeq: Number(f.seq) || (_fi + 1), _fromFlavor: n.id, updatedAt: NOW()
        };
        var _pv = store.npdProducts.find(function (pp) { return String(pp.itemCode) === code; });
        if (_pv && _pv.fromDate) row.fromDate = _pv.fromDate;
        var i = store.npdProducts.findIndex(function (pp) { return String(pp.itemCode) === code; });
        if (i >= 0) store.npdProducts[i] = row; else store.npdProducts.push(row);
      });
    });
  }

  /* ---- Flavor: IT edits the whole flavor form (fill CMPOS/SS codes) then COMPLETE ---- */
  API.updateFlavor = (id, data) => {
    const _lf = nameTooLong(data || {});   /* FX-P87 */
    if (_lf) return dupError(_lf);
    (store.flavor || []).forEach((n, idx) => {
      if (n.id === id) {
        store.flavor[idx] = Object.assign({}, n, data || {}, {
          id: n.id, submittedDate: n.submittedDate, status: n.status || "PENDING",
          itStatus: "COMPLETE", itDoneDate: TODAY(), updatedDate: NOW()
        });
        flavorToProducts(store.flavor[idx]);
        lockNpdCodes(store.flavor[idx]);   /* FX-P86 — ล็อกเลขผงที่แจกแล้ว */
      }
    });
    persist();
    return { status: "success", message: "บันทึกผงรสชาติเรียบร้อย" };
  };
  /* ---- Flavor: OP confirm / reject ---- */
  API.setFlavorStatus = (id, status, note) => {
    (store.flavor || []).forEach(n => {
      if (n.id === id) {
        n.status = status;
        if (status === "REJECTED") { n.rejectReason = note || ""; n.rejectCount = (n.rejectCount || 0) + 1; }
        if (status === "CONFIRMED") { n.confirmedDate = TODAY(); }
        if (String(n.itStatus || "").toUpperCase() === "COMPLETE") flavorToProducts(n);   /* FX-P76 — กันผงตกหล่น ไม่ลงข้อมูลหลัก */
        n.updatedDate = NOW();
      }
    });
    if (!persist()) return { status: "error", message: "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลในเครื่องเต็ม — กดสำรองข้อมูล/รีเฟรช แล้วทำอีกครั้ง" };
    return { status: "success", message: status === "REJECTED" ? "ตีกลับผงรสชาติแล้ว" : "ยืนยันผงรสชาติแล้ว" };
  };

  /* ---- NPD + Flavor summary for dashboard ---- */
  API.getNpdFlavorSummary = () => {
    const tally = (arr) => {
      const t = { total: 0, pending: 0, confirmed: 0, rejected: 0 };
      (arr || []).forEach(n => {
        t.total++;
        const s = String(n.status || "PENDING").toUpperCase();
        if (s === "CONFIRMED") t.confirmed++;
        else if (s === "REJECTED") t.rejected++;
        else t.pending++;
      });
      return t;
    };
    const npd = store.npd || [], flv = store.flavor || [];
    return {
      npd: tally(npd),
      flavor: tally(flv),
      npdItems: npd.reduce((a, n) => a + ((n.items || []).length), 0),
      flavorGroups: flv.reduce((a, n) => a + ((n.groups || []).length), 0),
      recent: npd.concat(flv).sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate)).slice(0, 60)
        .map(n => ({ id: n.id, kind: n.id.startsWith("FLV") ? "ผงรสชาติ" : "สินค้าใหม่", project: n.project, status: String(n.status || "PENDING").toUpperCase(), month: String(n.submittedDate || "").slice(0, 7), date: String(n.submittedDate || "").slice(0, 10) })),
    };
  };
  API.setNpdStatus = (id, status, note) => {
    const target = (store.npd || []).find(n => n.id === id);
    if (!target) return conflict("ไม่พบงาน NPD นี้แล้ว (อาจถูกลบ)");
    // MUST: guard against stale double-action (someone already confirmed/rejected)
    const cur = String(target.status || "").toUpperCase();
    if (cur === "CONFIRMED" && status === "CONFIRMED") return conflict("งานนี้ถูกยืนยันไปแล้วโดยผู้ใช้อื่น");
    if (cur === "CONFIRMED" && status === "REJECTED") return conflict("งานนี้ถูกยืนยันไปแล้ว ตีกลับไม่ได้ — กรุณาโหลดใหม่");
    (store.npd || []).forEach(n => {
      if (n.id === id) {
        n.status = status;
        if (status === "REJECTED") { n.rejectReason = note || ""; n.rejectCount = (n.rejectCount || 0) + 1; }
        if (status === "CONFIRMED") { n.confirmedDate = TODAY(); }
        stampVersion(n);
      }
    });
    persist();
    return { status: "success", message: status === "REJECTED" ? "ตีกลับ NPD แล้ว" : "ยืนยัน NPD แล้ว" };
  };

  /* ---- export master report (exportMasterReport) ---- */
  API.exportMasterReport = () => {
    const headers = ["Campaign Name", "Type Promotion", "Start Date", "End Date", "Sale Mode",
      "Code Promotion", "Code Item Set", "Kitchen Name", "Short Name", "Item Code",
      "Item Name EN", "Qty", "Gross Value", "Discount", "Net Price"];
    const rows = store.working.map(r => [r.campaign, r.promoType, r.start, r.end, r.saleMode,
      r.codePromotion, r.codeItemSet, r.kitchen, r.shortName, r.itemCode, r.itemNameEN, r.qty,
      r.gross, r.discount, r.netPrice]);
    return { status: "success", data: [headers, ...rows] };
  };

  /* ===========================================================================
   * google.script.run  shim  (chainable, async via setTimeout)
   * ========================================================================== */
  function makeRunner() {
    const ctx = { _ok: null, _fail: null };
    const proxy = new Proxy(ctx, {
      get(target, prop) {
        if (prop === "withSuccessHandler") return (fn) => { target._ok = fn; return proxy; };
        if (prop === "withFailureHandler") return (fn) => { target._fail = fn; return proxy; };
        if (prop === "withUserObject") return () => proxy;
        if (typeof API[prop] === "function") {
          return function (...args) {
            const genAtCall = (window.__pageGen || 0); // capture page generation at call time
            setTimeout(() => {
              // drop callbacks whose page was navigated away (prevents null-DOM writes)
              if ((window.__pageGen || 0) !== genAtCall) return;
              let res, ok = false;
              // 1) run the server fn — real failures go to the failure handler
              try {
                res = API[prop].apply(null, args);
                ok = true;
              } catch (e) {
                if (target._fail) target._fail(e); else console.error("[mock] server fn failed:", prop, e);
                return;
              }
              if (!ok) return;
              // 2) deliver result — a throwing success handler is the PAGE's bug, surface it as-is
              if (res && typeof res.then === "function") {
                res.then(v => { if (target._ok) target._ok(v); })
                   .catch(e => { if (target._fail) target._fail(e); else console.error("[mock] server fn failed:", prop, e); });
              } else if (target._ok) {
                target._ok(res); // not wrapped — real handler errors throw to the console with correct stack
              }
            }, 140 + Math.random() * 160); // mimic network latency
            return proxy;
          };
        }
        // unknown server fn — return a no-op that warns
        return function () {
          console.warn("[mock] unimplemented server fn:", String(prop));
          setTimeout(() => { if (target._ok) target._ok(null); }, 60);
          return proxy;
        };
      },
    });
    return proxy;
  }

  /* ==========================================================================
   *  FX-P72 — Subset จากงาน NPD ต้องเข้าทะเบียน Subset จริง — ไม่งั้นหน้าแจ้งโปร/Item Set
   *  เลือกเป็น "เลือกสินค้าเป็นกลุ่ม" ไม่ได้ และ pc_itemset_comp จะชี้ไปที่ SS ที่ระบบไม่รู้จัก
   *  (เดิม pc_addon_subsets มีแต่เขียน ไม่มีใครอ่านกลับ → รีเฟรชทีเดียวหาย)
   * ========================================================================== */
  function subsetRegister(ss, name, short, src) {
    ss = String(ss || "").trim(); if (!/^SS\d/i.test(ss)) return false;
    name = String(name || ss).trim(); short = String(short || "").trim() || name;
    var added = false;
    try {
      var SM = window.PC_SUBSET_MASTER || (window.PC_SUBSET_MASTER = []);
      if (!SM.find(function (x) { return String(x.ssCode) === ss; })) {
        SM.push({ ssCode: ss, name: name, short: short, status: "Active", promoFormActive: "Show", _src: src || "npd" });
        added = true;
      }
    } catch (e) {}
    try {
      var reg = JSON.parse(localStorage.getItem("pc_addon_subsets") || "{}") || {};
      if (!reg[ss]) { reg[ss] = { ssCode: ss, name: name, short: short, status: "Active", _src: src || "npd" }; localStorage.setItem("pc_addon_subsets", JSON.stringify(reg)); }
    } catch (e) {}
    try {
      var cust = JSON.parse(localStorage.getItem("pc_subset_custom") || "[]") || [];
      if (!cust.find(function (x) { return String(x.ssCode) === ss; })) { cust.push({ ssCode: ss, nameTH: name, nameEN: name }); localStorage.setItem("pc_subset_custom", JSON.stringify(cust)); }
    } catch (e) {}
    return added;
  }
  API.registerSubset = subsetRegister;
  /* เติมทะเบียนตอนเปิดระบบ: addon ที่เคยสร้าง + subset ของงาน NPD ที่ IT ขึ้นปุ่มแล้ว */
  (function subsetBootMerge() {
    try {
      var reg = JSON.parse(localStorage.getItem("pc_addon_subsets") || "{}") || {};
      Object.keys(reg).forEach(function (k) { var r = reg[k] || {}; subsetRegister(r.ssCode || k, r.name, r.short, r._src || "addon"); });
    } catch (e) {}
    try {
      (store.npd || []).forEach(function (n) {
        if (String(n.itStatus || "").toUpperCase() !== "COMPLETE") return;
        (n.subsets || []).forEach(function (s) { subsetRegister(s.ssCode, s.name, s.name2 || s.short, "npd:" + n.id); });
      });
    } catch (e) {}
  })();
  /* FX-P75 backfill — แถวสินค้าจาก NPD/ผง ที่ลงไว้ก่อนมีกฎนี้ ยังไม่มีช่องวันที่ → เติมให้ (เริ่ม = วันที่ IT ขึ้นปุ่ม · จบ = 31/12/2050) */
  (function backfillMasterDates() {
    try {
      var jobs = {};
      (store.npd || []).forEach(function (n) { jobs[n.id] = n.itDoneDate || n.submittedDate || TODAY(); });
      (store.flavor || []).forEach(function (n) { jobs[n.id] = n.itDoneDate || n.submittedDate || TODAY(); });
      var ch = 0;
      (store.npdProducts || []).forEach(function (p) {
        var src = p._fromNpd || p._fromFlavor; if (!src) return;
        if (!p.fromDate) { p.fromDate = String(jobs[src] || TODAY()).slice(0, 10); ch++; }
        if (!p.toDate) { p.toDate = MASTER_NO_END; ch++; }
        /* FX-P84 — cateCode ว่าง → ฟอร์มแจ้งโปรกรองด้วย cateCode จึงไม่เห็นสินค้า NPD เลย
           เดาจาก 3 หลักหน้าของรหัสสินค้า (ผง = 103) */
        if (!String(p.cateCode || '').trim()) {
          var c = String(p.itemCode || '').trim();
          if (/^\d{6,}$/.test(c)) { p.cateCode = c.slice(0, 3); ch++; }
        }
      });
      if (ch) persist();
    } catch (e) {}
  })();
  /* FX-P76 — งานเพิ่มผงที่ IT ปิดเสร็จแล้ว แต่ผงยังไม่ลงข้อมูลหลักสินค้า
     (เดิม flavorToProducts รันเฉพาะตอน IT กดบันทึกฟอร์มผ่าน updateFlavor เท่านั้น) */
  (function backfillFlavorProducts() {
    try {
      var ch = 0;
      (store.flavor || []).forEach(function (n) {
        if (String(n.itStatus || "").toUpperCase() !== "COMPLETE") return;
        var miss = false;
        (n.groups || []).forEach(function (g) { (g.flavors || []).forEach(function (f) {
          var c = String(f.cmpos || f.code || "").trim(); if (!c) return;
          if (!(store.npdProducts || []).some(function (p) { return String(p.itemCode) === c; })) miss = true;
        }); });
        if (miss) { flavorToProducts(n); ch++; }
      });
      if (ch) persist();
    } catch (e) {}
  })();
  /* FX-P80 backfill — งาน NPD ที่ IT ปิดแล้วแต่ผงใน Subset ยังไม่เป็นสินค้า */
  (function backfillNpdSubsetProducts() {
    try {
      var ch = 0;
      (store.npd || []).forEach(function (n) {
        if (String(n.itStatus || "").toUpperCase() !== "COMPLETE") return;
        var miss = false;
        (n.subsets || []).forEach(function (s) { (s.powders || []).forEach(function (p) {
          var c = String(p.cmpos || "").trim(); if (!c) return;
          if (!(store.npdProducts || []).some(function (x) { return String(x.itemCode) === c; })) miss = true;
        }); });
        if (miss) { npdSubsetToProducts(n); ch++; }
      });
      if (ch) persist();
    } catch (e) {}
  })();

  window.google = window.google || {};
  Object.defineProperty(window.google, "script", {
    configurable: true,
    value: { run: { /* placeholder replaced by getter below */ } },
  });
  Object.defineProperty(window.google.script, "run", {
    configurable: true,
    get() { return makeRunner(); },
  });

  window.PC_API = API; // direct access for the Dashboard / custom pages
  console.log("[mock-backend] ready — users: One/Theone (Admin), mkt/mkt, it/it, op/op");
})();
