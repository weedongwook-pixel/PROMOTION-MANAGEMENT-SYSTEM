/* ============================================================================
 *  CENTRAL CODE COUNTER + RESERVATION  (PC_COUNTER)
 *  ---------------------------------------------------------------------------
 *  ONE forward-only number issuer for every code IT assigns by hand:
 *     itemset (107…) · item · cmpos · ss · promo
 *
 *  Lifecycle of every issued number:
 *     🔖 RESERVED  — issued the moment IT reaches the field; counter advances NOW
 *     ✅ CONFIRMED — IT pressed save / done
 *     ♻️ RELEASED  — IT cancelled; the number is BURNED (gap stays, never re-issued)
 *
 *  forward-only: cursor only ever goes up. Released numbers are NOT reclaimed.
 *  Baselines are seeded from the highest real number already in the file
 *  (PC_API.getCodeBaselines) so we never collide with Backoffice history.
 *
 *  ────────────────────────────────────────────────────────────────────────
 *  CLOUDFLARE SWAP POINT — change ONLY `CounterStore` (read/write) to move the
 *  ledger from localStorage to KV/D1/Durable Object. Nothing else changes.
 *  (The public API is already promise-shaped so an async store drops straight in.)
 *  ========================================================================== */
(function () {
  "use strict";

  /* ---- per-type config -----------------------------------------------------
   * cursor = a running SEQUENCE number (not the whole code). The display code is
   * built as  prefix + zero-padded(seq, minW).  When seq overflows minW it simply
   * uses more digits — so 107 runs 107001…107999 then 1071000 automatically
   * (3 หลักเต็ม→ขยายหลักตามที่คุยไว้). prefix "" = โค้ดเลขล้วน (item/cmpos/promo). */
  var TYPES = {
    itemset: { label: "Item Set (107)", short: "107", prefix: "107", minW: 3, defStart: 3401, icon: "fa-layer-group" },
    promo:   { label: "Price Promotion (โปรราคา)", short: "PRICE", prefix: "P", minW: 0, defStart: 3507, icon: "fa-tags", note: "Code Promotion (P+เลข) — autorun ต่อจากเลขสูงสุดในระบบ" },
    item:    { label: "Item Code", short: "ITEM", prefix: "", minW: 3, defStart: 0, icon: "fa-box", perCat: true, hideCard: true },
    cmpos:   { label: "CMPOS / Category", short: "CMPOS", prefix: "", minW: 0, defStart: 0, icon: "fa-sitemap", hideCard: true },
    ss:      { label: "SS Code (Subset)", short: "SS", prefix: "SS", minW: 4, defStart: 0, icon: "fa-flask-vial" },
    bill:    { label: "Bill Discount (BD)", short: "BD", prefix: "BD", minW: 3, defStart: 0, icon: "fa-receipt" },
    coupon:  { label: "Item Coupon (IC)", short: "IC", prefix: "IC", minW: 4, defStart: 0, icon: "fa-ticket" },
    voucher: { label: "Voucher (VC)", short: "VC", prefix: "VC", minW: 4, defStart: 0, icon: "fa-gift" },
  };
  // build a display code from a sequence (+ optional runtime prefix for per-category item codes)
  function fmtCode(cfg, seq, prefix) {
    prefix = (prefix != null ? prefix : cfg.prefix) || "";
    if (prefix) return prefix + String(seq).padStart(cfg.minW || 3, "0");
    return String(seq);
  }
  // recover the sequence number from a full code (for baseline seeding)
  function codeToSeq(cfg, code, prefix) {
    code = String(code == null ? "" : code).trim();
    prefix = (prefix != null ? prefix : cfg.prefix) || "";
    if (prefix) {
      if (code.toUpperCase().indexOf(prefix.toUpperCase()) === 0) {
        var rest = code.slice(prefix.length);
        return /^\d+$/.test(rest) ? parseInt(rest, 10) : 0;
      }
      if (/^\d+$/.test(code)) return parseInt(code, 10);  // baseline ส่งมาเป็นเลขล้วน (เช่น ss=167) → ใช้เป็น sequence ตรง ๆ
      return 0;
    }
    return /^\d+$/.test(code) ? parseInt(code, 10) : 0;
  }
  function numOnly(c) { c = String(c == null ? "" : c).trim(); return /^\d+$/.test(c) ? parseInt(c, 10) : null; }

  var STATUS = { RESERVED: "RESERVED", CONFIRMED: "CONFIRMED", RELEASED: "RELEASED" };

  /* ========================================================================
   *  STORAGE ADAPTER  ← the ONLY thing to swap for Cloudflare
   * ====================================================================== */
  var STORE_KEY = "pc_code_counter_v1";
  var CounterStore = {
    read: function () {
      try { var raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
      return null;
    },
    write: function (state) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    },
  };

  /* ---- in-memory state -------------------------------------------------- */
  var state = CounterStore.read() || { v: 1, types: {}, reservations: {}, log: [] };
  if (!state.types) state.types = {};
  if (!state.reservations) state.reservations = {};
  if (!state.log) state.log = [];

  function save() { CounterStore.write(state); fire(); }

  /* seed each type's cursor from the highest real number in the file.
   * cursor = "highest number ever issued". It can only move UP. */
  function baselines() {
    var b = {};
    try {
      if (window.PC_API && PC_API.getCodeBaselines) b = PC_API.getCodeBaselines() || {};
    } catch (e) {}
    // Compute promo-type baselines directly from PC_PROMO_CODES (returns full code string e.g. "BD165")
    var pCodes = window.PC_PROMO_CODES || [];
    if (pCodes.length) {
      [['bill','BD'],['coupon','IC'],['voucher','VC']].forEach(function(pair) {
        var tp = pair[0], pre = pair[1];
        var re = new RegExp('^' + pre + '(\\d+)$', 'i');
        var max = 0, maxFull = '';
        pCodes.forEach(function(c) {
          var s = String(c.button || c.code || '');
          var m = re.exec(s);
          if (m && +m[1] > max) { max = +m[1]; maxFull = s; }
        });
        // อย่า downgrade: getCodeBaselines() รวม store.months + BD/IC/VC confirmed แล้ว (มักสูงกว่า)
        // → override ด้วยเลขจาก PC_PROMO_CODES เฉพาะเมื่อมันสูงกว่าเท่านั้น (กัน cursor ค้างต่ำกว่าโค้ดจริงในตาราง)
        if (max > 0) {
          var curSeq = codeToSeq(TYPES[tp], b[tp]);
          if (max > curSeq) b[tp] = maxFull;
        }
      });
    }
    return b;
  }
  function ensureType(type) {
    var cfg = TYPES[type]; if (!cfg) return null;
    var t = state.types[type];
    if (!t) { t = state.types[type] = { cursor: 0, seeded: false }; }
    t._type = type;
    if (!t.seeded) {
      var b = baselines();
      var fromFile = codeToSeq(cfg, b[type]);          // file max code → sequence
      var seed = Math.max(fromFile, cfg.defStart || 0, t.cursor || 0);
      t.cursor = seed; t.baseline = seed; t.seeded = true;
    } else {
      var bl = baselines(), live = codeToSeq(cfg, bl[type]);
      if (live > t.cursor) { t.cursor = live; t.baseline = Math.max(t.baseline || 0, live); }
    }
    // defStart = พื้นขั้นต่ำถาวร — บังคับทุกครั้งที่โหลด (แม้ state ถูก seed ค้างใน localStorage มาก่อน)
    if ((cfg.defStart || 0) > t.cursor) { t.cursor = cfg.defStart; t.baseline = Math.max(t.baseline || 0, cfg.defStart); }
    return t;
  }

  /* ---- peek (no advance) ------------------------------------------------
   * Free-list aware: returned numbers (e.g. a reservation cancelled before it
   * was used) go back into t.freed and are handed out again — lowest first —
   * before the cursor advances. Negative offsets stay cursor-based (history). */
  // recycle-first sequencing: returned numbers (t.freed) are handed out LOWEST-FIRST
  // before the cursor advances — numbers are never burned (เก็บไว้แจกงานใหม่).
  /* FX-P83 — เลขที่อยู่ในคลัง (freed) บางตัวอาจถูกใช้จริงไปแล้ว
     (เช่น โค้ดที่คืนเข้าคลังตอนลบงาน แต่มีแถวงานเก่าหรือข้อมูลหลักที่ยังอ้างอยู่)
     → ก่อนหยิบเลขจากคลังต้องเช็กกับระบบก่อน ชนแล้วตัดออกจากคลังถาวร */
  function codeInUse(code, type) {
    code = String(code || "").trim(); if (!code) return false;
    var tries = type ? [type] : [];
    /* เลขหมวดสินค้า (105/106/109/1xx) อาจอยู่ทั้งช่อง Code Item Set และข้อมูลหลักสินค้า → เช็กทั้ง 2 ทาง */
    if (type === "item" || !type) tries.push("itemset");
    for (var i = 0; i < tries.length; i++) {
      try {
        if (window.PC_API && PC_API.checkCode) {
          var r = PC_API.checkCode(tries[i], code);
          if (r && r.status === "dup") return true;
        }
      } catch (e) {}
    }
    return false;
  }
  function dropUsedFreed(t, mkCode, type) {
    if (!t || !t.freed || !t.freed.length) return;
    var keep = [], changed = false;
    t.freed.forEach(function (n) {
      var c = mkCode(n);
      if (c && codeInUse(c, type)) { changed = true; return; }   /* เลขนี้มีคนใช้อยู่ → เอาออกจากคลัง */
      keep.push(n);
    });
    if (changed) t.freed = keep;
  }
  function poolFreed(t) { return (t.freed || []).filter(function (x) { return x <= t.cursor; }).sort(function (a, b) { return a - b; }); }
  function takeNext(t) {
    if (!t.freed) t.freed = [];
    dropUsedFreed(t, function (n) { var cfg = TYPES[t._type] || null; return cfg ? fmtCode(cfg, n) : null; }, t._type);
    var f = poolFreed(t);
    if (f.length) { var n = f[0]; t.freed = t.freed.filter(function (x) { return x !== n; }); return n; }
    var m = t.cursor + 1; t.cursor = m; return m;
  }
  function availNum(t, offset) {
    offset = parseInt(offset, 10) || 0;
    if (offset < 0) return t.cursor + 1 + offset;      // history preview stays cursor-based
    dropUsedFreed(t, function (n) { var cfg = TYPES[t._type] || null; return cfg ? fmtCode(cfg, n) : null; }, t._type);
    var f = poolFreed(t);
    if (offset < f.length) return f[offset];           // แจกเลขที่ recycle ก่อน
    return t.cursor + 1 + (offset - f.length);         // แล้วค่อยเดินหน้า
  }
  function peekNum(type, offset) {
    var t = ensureType(type); if (!t) return null;
    return availNum(t, offset);
  }
  function peek(type, offset) {
    var cfg = TYPES[type]; if (!cfg) return "";
    var n = peekNum(type, offset); return n == null ? "" : fmtCode(cfg, n);
  }

  /* ---- reserve: advance cursor NOW, log a RESERVED entry ---------------- */
  function reserve(type, opts) {
    var cfg = TYPES[type]; if (!cfg) return null;
    opts = opts || {};
    var t = ensureType(type);
    var n = takeNext(t);                  // recycle เลขที่คืนก่อน (ต่ำสุด) แล้วค่อยเดินหน้า — ไม่เผาทิ้ง
    var code = fmtCode(cfg, n);
    var entry = {
      code: code, type: type, num: n, status: STATUS.RESERVED,
      where: opts.where || "", field: opts.field || "", by: opts.by || currentUser(),
      at: now(), confirmedAt: "", releasedAt: "",
    };
    state.reservations[key(type, code)] = entry;
    state.log.unshift({ t: now(), act: "RESERVE", type: type, code: code, where: entry.where, by: entry.by });
    trimLog();
    save();
    return entry;
  }

  /* ========================================================================
   *  PER-CATEGORY ITEM CODES  (item code = cateCode + running, per category)
   *  Each cateCode keeps its own forward-only sequence, seeded from the
   *  highest real item code in that category (PC_API.getCatBaselines).
   * ====================================================================== */
  function catBaselines() {
    try { if (window.PC_API && PC_API.getCatBaselines) return PC_API.getCatBaselines() || {}; } catch (e) {}
    return {};
  }
  if (!state.cats) state.cats = {};   // { cateCode: { cursor, baseline, seeded } }
  function ensureCat(cc) {
    cc = String(cc == null ? "" : cc).trim(); if (!cc) return null;
    if (!state.cats) state.cats = {};
    var c = state.cats[cc];
    if (!c) c = state.cats[cc] = { cursor: 0, seeded: false };
    c._cc = cc;
    var live = catBaselines()[cc] || 0;
    if (!c.seeded) { c.cursor = Math.max(live, c.cursor || 0); c.baseline = c.cursor; c.seeded = true; }
    else if (live > c.cursor) { c.cursor = live; c.baseline = Math.max(c.baseline || 0, live); }
    return c;
  }
  function catCode(cc, seq) { return String(cc) + String(seq).padStart(3, "0"); } // expands past 999 automatically
  function takeNextCat(c) {
    if (!c.freed) c.freed = [];
    dropUsedFreed(c, function (n) { return catCode(c._cc, n); }, "item");
    var f = (c.freed || []).filter(function (x) { return x <= c.cursor; }).sort(function (a, b) { return a - b; });
    if (f.length) { var n = f[0]; c.freed = c.freed.filter(function (x) { return x !== n; }); return n; }
    var m = c.cursor + 1; c.cursor = m; return m;
  }
  function availCat(c, offset) {
    offset = parseInt(offset, 10) || 0;
    if (offset < 0) return c.cursor + 1 + offset;
    dropUsedFreed(c, function (n) { return catCode(c._cc, n); }, "item");
    var f = (c.freed || []).filter(function (x) { return x <= c.cursor; }).sort(function (a, b) { return a - b; });
    if (offset < f.length) return f[offset];
    return c.cursor + 1 + (offset - f.length);
  }
  function peekCat(cc, offset) {
    var c = ensureCat(cc); if (!c) return "";
    return catCode(cc, availCat(c, offset));
  }
  function reserveCat(cc, opts) {
    var c = ensureCat(cc); if (!c) return null;
    opts = opts || {};
    var n = takeNextCat(c);   // recycle เลขที่คืนก่อน แล้วค่อยเดินหน้า — ไม่เผาทิ้ง
    var code = catCode(cc, n);
    var entry = {
      code: code, type: "item", num: n, cat: cc, status: STATUS.RESERVED,
      where: opts.where || "", field: opts.field || "", by: opts.by || currentUser(),
      at: now(), confirmedAt: "", releasedAt: "",
    };
    state.reservations[key("item", code)] = entry;
    state.log.unshift({ t: now(), act: "RESERVE", type: "item", code: code, where: entry.where, by: entry.by });
    trimLog(); save();
    return entry;
  }

  function findByCode(code, type) {
    code = String(code == null ? "" : code).trim(); if (!code) return null;
    if (type) return state.reservations[key(type, code)] || null;
    var up = code.toUpperCase();
    var ks = Object.keys(state.reservations);
    for (var i = 0; i < ks.length; i++) {
      var e = state.reservations[ks[i]];
      if (String(e.code).toUpperCase() === up) return e;
    }
    return null;
  }

  /* find an EXISTING RESERVED entry for the exact same field (type/cat + where + field id).
   * Used to keep a first reservation locked — the same field always gets its same number
   * back on re-render/reload instead of a fresh one. Returns null if field id is blank. */
  function findReservedFor(type, cat, where, field) {
    field = String(field == null ? "" : field).trim(); if (!field) return null;
    var ks = Object.keys(state.reservations);
    for (var i = 0; i < ks.length; i++) {
      var e = state.reservations[ks[i]];
      if (!e || e.status !== STATUS.RESERVED) continue;
      if (cat) { if (e.type !== "item" || String(e.cat) !== String(cat)) continue; }
      else { if (e.type !== type) continue; }
      if (String(e.where || "") !== String(where || "")) continue;
      if (String(e.field || "") !== field) continue;
      return e;
    }
    return null;
  }

  function confirm(code, type, details) {
    var e = findByCode(code, type); if (!e) return null;
    e.status = STATUS.CONFIRMED; e.confirmedAt = now();
    // optional campaign details captured at confirm time — these surface to
    // branches via Branch View's code lookup, and tag the ledger/log.
    if (details && typeof details === "object") {
      if (details.campaign != null && String(details.campaign).trim()) { e.campaign = String(details.campaign).trim(); if (!e.where) e.where = e.campaign; }
      if (details.button != null) e.button = String(details.button);
      if (details.detail != null) e.detail = String(details.detail);
      if (details.condition != null) e.condition = String(details.condition);
      if (details.start != null) e.start = String(details.start);
      if (details.end != null) e.end = String(details.end);
      if (details.channel != null) e.channel = String(details.channel);
      if (details.remark != null) e.remark = String(details.remark);
    }
    state.log.unshift({ t: now(), act: "CONFIRM", type: e.type, code: e.code, where: e.campaign || e.where, by: currentUser() });
    trimLog(); save();
    return e;
  }
  function release(code, type, src) {
    var e = findByCode(code, type); if (!e) return null;
    e.status = STATUS.RELEASED; e.releasedAt = now();
    // recycle the number back into the pool (do NOT burn) — unused numbers are kept & redistributed
    try {
      var t = e.cat ? ensureCat(e.cat) : ensureType(e.type);
      if (t) { if (e.num === t.cursor) { t.cursor = e.num - 1; } else { t.freed = t.freed || []; if (t.freed.indexOf(e.num) < 0) t.freed.push(e.num); } }
    } catch (x) {}
    state.log.unshift({ t: now(), act: "RELEASE", type: e.type, code: e.code, where: e.where, by: currentUser(), from: srcLabel(src) });
    trimLog(); save(); return e;
  }
  /* ---- returnCode: cancel a reservation that was NEVER used downstream ----
   * Puts the number back into circulation: rolls the cursor back if it was the
   * latest number, otherwise drops it into the free-list (reused lowest-first).
   * The reservation entry is removed entirely (code becomes blank in the work
   * system). REFUSES on CONFIRMED codes — those already touched POS/Backoffice
   * and must stay burned to avoid collisions. */
  function returnCode(code, type, src, force) {
    var e = findByCode(code, type); if (!e) return null;
    if (e.status === STATUS.RELEASED) return null;             // already burned
    if (e.status === STATUS.CONFIRMED && !force) return null;  // used → cannot reuse (unless explicitly forced)
    var seq = e.num;
    if (e.cat) {
      var c = ensureCat(e.cat);
      if (c) { if (seq === c.cursor) { c.cursor = seq - 1; } else { c.freed = c.freed || []; if (c.freed.indexOf(seq) < 0) c.freed.push(seq); } }
    } else {
      var t = ensureType(e.type);
      if (t) { if (seq === t.cursor) { t.cursor = seq - 1; } else { t.freed = t.freed || []; if (t.freed.indexOf(seq) < 0) t.freed.push(seq); } }
    }
    delete state.reservations[key(e.type, e.code)];            // free the code (blank in work system)
    state.log.unshift({ t: now(), act: "RETURN", type: e.type, code: e.code, where: e.where, by: currentUser(), from: srcLabel(src) });
    trimLog(); save();
    return { returned: true, code: e.code, num: seq, type: e.type };
  }

  /* ---- srcLabel: normalise the "where did this come from" tag ------------ */
  function srcLabel(src) {
    if (src == null) return "";
    if (typeof src === "string") return src.trim();
    if (typeof src === "object") return String(src.from || src.page || src.label || "").trim();
    return "";
  }

  /* ---- note: push a free-form activity-log entry (no code-state change) ---
   * Used when work pages do something worth logging but the reservation stays
   * as-is — e.g. a campaign was deleted but IT chose to KEEP the code. ------ */
  function note(opts) {
    opts = opts || {};
    state.log.unshift({
      t: now(), act: opts.act || "NOTE", type: opts.type || "",
      code: opts.code || "", where: opts.where || "",
      by: opts.by || currentUser(), from: srcLabel(opts.from || opts.src)
    });
    trimLog(); save();
    return true;
  }

  /* ---- returnOrphans: คืนโค้ด RESERVED ที่ไม่ผูกกับงานจริงแล้ว (orphan/test) ----
   * ปลอดภัย: แตะเฉพาะสถานะ RESERVED · CONFIRMED (ใช้งานจริง) และ RELEASED (เผาแล้ว)
   * ไม่ยุ่ง · inUse = รายการโค้ดที่ระบบงานยังอ้างถึง (จาก PC_API.getInUseCodes) — โค้ด
   * RESERVED ที่ไม่อยู่ใน inUse = งานถูกลบ/ฟอร์มถูกทิ้ง → คืนเลขกลับ (free-list/ถอย cursor). */
  function returnOrphans(inUse, opts) {
    opts = opts || {};
    var keep = {};
    (inUse || []).forEach(function (c) { var k = String(c == null ? "" : c).trim().toUpperCase(); if (k) keep[k] = 1; });
    var minAge = +opts.minAgeMs || 0;   // เว้นระยะปลอดภัย: ไม่คืนเลขที่เพิ่งจอง (IT อาจกำลังกรอกอยู่)
    var nowMs = Date.now();
    var freed = [], kept = [];
    Object.keys(state.reservations).slice().forEach(function (k) {
      var e = state.reservations[k];
      if (!e || e.status !== STATUS.RESERVED) return;                 // เฉพาะที่จองค้าง
      if (keep[String(e.code).toUpperCase()]) { kept.push(e.code); return; } // ยังถูกใช้งานจริง → คงไว้
      if (minAge) { var t = Date.parse(e.at || ""); if (t && (nowMs - t) < minAge) { kept.push(e.code); return; } } // เพิ่งจอง → ยังไม่คืน
      var r = returnCode(e.code, e.type, opts.src || "คืนโค้ดที่ค้าง (orphan)");
      if (r && r.returned) freed.push(e.code); else kept.push(e.code);
    });
    return { freed: freed, kept: kept, freedCount: freed.length };
  }
  function statusOf(code, type) { var e = findByCode(code, type); return e ? e.status : null; }
  function entryOf(code, type) { return findByCode(code, type); }

  // a code counts as "taken" if it is RESERVED or CONFIRMED by someone else
  function reservedHit(type, code, ignoreWhere) {
    var e = findByCode(code, type);
    if (!e) return null;
    if (e.status === STATUS.RELEASED) return null;
    if (ignoreWhere && e.where && e.where === ignoreWhere) return null;
    return e;
  }

  function list(filter) {
    filter = filter || {};
    return Object.keys(state.reservations).map(function (k) { return state.reservations[k]; })
      .filter(function (e) {
        if (filter.type && e.type !== filter.type) return false;
        if (filter.status && e.status !== filter.status) return false;
        return true;
      })
      .sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
  }

  /* ---- badge for OTHER departments — shows the reserved number but flags it
   * as not-yet-final so they don't act on it prematurely ------------------ */
  var BADGE = {
    RESERVED:  { txt: "⏳ รอ IT ยืนยันเลข", bg: "#fff7e6", bd: "#f3d98b", fg: "#9a6700", icon: "fa-hourglass-half" },
    CONFIRMED: { txt: "✅ ยืนยันแล้ว",       bg: "#eafaf1", bd: "#bfe6cf", fg: "#1d7a4d", icon: "fa-circle-check" },
    RELEASED:  { txt: "♻️ ยกเลิกเลขนี้",     bg: "#f1f3f5", bd: "#d6dbe0", fg: "#6c757d", icon: "fa-rotate-left" },
  };
  function badgeHTML(code, opts) {
    opts = opts || {};
    var e = findByCode(code, opts.type);
    if (!e) return "";
    var m = BADGE[e.status]; if (!m) return "";
    var withCode = opts.withCode !== false;
    return '<span class="cc-badge cc-' + e.status.toLowerCase() + '" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-family:\'Kanit\',sans-serif;font-size:.7rem;font-weight:600;' +
      'padding:2px 8px;border-radius:999px;background:' + m.bg + ';border:1px solid ' + m.bd + ';color:' + m.fg + ';line-height:1.4;" ' +
      'title="' + (e.where ? esc(e.where) : "") + (e.by ? " · " + esc(e.by) : "") + '">' +
      '<i class="fas ' + m.icon + '"></i>' + (withCode ? '<b class="mono">' + esc(e.code) + '</b>' : "") +
      '<span>' + m.txt + '</span></span>';
  }
  // returns just the state label (no code) — handy inline
  function chipHTML(status) {
    var m = BADGE[status]; if (!m) return "";
    return '<span style="display:inline-flex;align-items:center;gap:4px;font-family:\'Kanit\',sans-serif;font-size:.68rem;font-weight:600;' +
      'padding:1px 7px;border-radius:999px;background:' + m.bg + ';border:1px solid ' + m.bd + ';color:' + m.fg + ';">' +
      '<i class="fas ' + m.icon + '"></i>' + m.txt + '</span>';
  }

  /* ---- helpers ---------------------------------------------------------- */
  function key(type, code) { return type + "::" + String(code).toUpperCase(); }
  function now() { var d = new Date(); return d.toISOString(); }
  function trimLog() { if (state.log.length > 400) state.log.length = 400; }
  function currentUser() { try { return localStorage.getItem("pc_userName") || "IT"; } catch (e) { return "IT"; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---- change subscription (inspector / live badges) -------------------- */
  var subs = [];
  function fire() { subs.slice().forEach(function (fn) { try { fn(state); } catch (e) {} }); }
  function onChange(fn) { if (typeof fn === "function") subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }

  function reset() {
    state = { v: 1, types: {}, reservations: {}, log: [], cats: {} };
    save();
  }

  /* ========================================================================
   *  AUTO-RESERVE WIRING  (declarative — like code-guard's data-cg)
   *  Add  data-cc-reserve="TYPE"  to an IT input → it auto-fills the next
   *  number on focus and reserves it. data-cc-where="..." tags the job.
   *  Add  data-cc-confirm  to a button inside the same row/card → CONFIRM.
   * ====================================================================== */
  function fieldType(el) { return el && el.getAttribute && el.getAttribute("data-cc-reserve"); }
  function readCcPrefill() { try { return JSON.parse(localStorage.getItem("pc_codecounter_prefill") || "null"); } catch (e) { return null; } }
  function clearCcPrefill() { try { localStorage.removeItem("pc_codecounter_prefill"); } catch (e) {} }
  function placePrefill(el, pf) {
    el.value = pf.code; el.setAttribute("data-cc-code", pf.code);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    paintFieldBadge(el); clearCcPrefill();
  }
  // autorun a confirmed code into the first matching IT field present in `root`
  function applyCcPrefill(root) {
    var pf = readCcPrefill(); if (!pf || !pf.code) return;
    var scope = (root && root.querySelectorAll) ? root : document;
    var nodes = scope.querySelectorAll("[data-cc-reserve]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (fieldType(el) !== pf.type) continue;
      if (el.disabled || el.readOnly) continue;
      if ((el.value || "").trim()) continue;
      placePrefill(el, pf); return;
    }
  }
  function autoFill(el) {
    var type = fieldType(el); if (!type) return;
    if (el.disabled || el.readOnly) return;
    if ((el.value || "").trim()) return; // respect a value already there
    // a confirmed code is waiting? place it instead of reserving a new number
    var pf = readCcPrefill();
    if (pf && pf.code && pf.type === type) { placePrefill(el, pf); return; }
    var where = el.getAttribute("data-cc-where") || "";
    var cat = el.getAttribute("data-cc-cat");
    var fieldId = el.id || el.name || "";
    // จองครั้งแรกแล้ว "ล็อกเลขนั้นถาวร" — ถ้าช่องนี้ (คีย์เดียวกัน) เคยจองไว้แล้ว → ใช้เลขเดิม ไม่จองใหม่ (กันเลขเปลี่ยนตอน re-render/reload)
    var ex = findReservedFor(type, cat, where, fieldId);
    if (ex) {
      el.value = ex.code; el.setAttribute("data-cc-code", ex.code);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if ((el.getAttribute("data-cc-auto") || "") === "confirm") { confirm(ex.code, ex.type || type); }
      paintFieldBadge(el);
      return;
    }
    var e = (cat && typeof reserveCat === "function")
      ? reserveCat(String(cat), { where: where, field: fieldId, by: currentUser() })
      : reserve(type, { where: where, field: fieldId, by: currentUser() });
    if (e) {
      el.value = e.code;
      el.setAttribute("data-cc-code", e.code);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if ((el.getAttribute("data-cc-auto") || "") === "confirm") { confirm(e.code, e.type || type); }
      paintFieldBadge(el);
    }
  }
  function paintFieldBadge(el) {
    var code = el.getAttribute("data-cc-code") || (el.value || "").trim(); if (!code) return;
    var st = statusOf(code, fieldType(el)); if (!st) return;
    var id = "ccfb-" + (el.id || Math.random().toString(36).slice(2));
    var box = el.parentNode && el.parentNode.querySelector('[data-ccfb="' + id + '"]');
    if (!box) {
      box = document.createElement("div"); box.setAttribute("data-ccfb", id);
      box.style.cssText = "margin-top:3px;";
      var anchor = el.closest(".input-group") || el;
      if (anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    }
    box.innerHTML = chipHTML(st);
  }
  /* auto-reserve ทุกช่อง data-cc-reserve ที่ยังว่างในก้อน DOM นี้ "ทันทีตอน render" —
     เลขจองจะโชว์เลยโดยไม่ต้องรอโฟกัส · จองครั้งเดียวต่อช่อง (header เท่านั้น) ·
     ช่อง readonly/มีค่าแล้ว (เช่น โปรขยายเวลา) ถูกข้าม ไม่จองใหม่ */
  function autoReserveIn(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var nodes = scope.querySelectorAll("[data-cc-reserve]");
    for (var i = 0; i < nodes.length; i++) autoFill(nodes[i]);
  }
  document.addEventListener("focusin", function (e) {
    var t = e.target; if (t && t.matches && t.matches("[data-cc-reserve]")) autoFill(t);
  }, true);
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-cc-confirm]");
    if (!t) return;
    var scope = t.closest("[data-cc-scope]") || document;
    scope.querySelectorAll("[data-cc-reserve][data-cc-code]").forEach(function (el) {
      var code = el.getAttribute("data-cc-code"); if (code) { confirm(code, fieldType(el)); paintFieldBadge(el); }
    });
  }, true);
  // autorun a confirmed code into IT forms (workflow path). Lightweight: we hook
  // loadPage so the prefill is applied ONCE after a form page renders, plus the
  // focusin handler above places it when the code field is focused. (A subtree
  // MutationObserver here is too heavy — it rescans the whole DOM on every
  // mutation and can hang the page.)
  function hookLoadPageForPrefill() {
    if (typeof window.loadPage !== "function" || window.loadPage.__ccHooked) return !!(window.loadPage && window.loadPage.__ccHooked);
    var orig = window.loadPage;
    window.loadPage = function () {
      var r = orig.apply(this, arguments);
      if (readCcPrefill()) { setTimeout(function () { applyCcPrefill(document); }, 350); }
      return r;
    };
    window.loadPage.__ccHooked = true;
    return true;
  }
  if (!hookLoadPageForPrefill()) {
    var tries = 0, iv = setInterval(function () { tries++; if (hookLoadPageForPrefill() || tries > 40) clearInterval(iv); }, 150);
  }
  // also try once now in case a form is already on screen
  if (document.body) { if (readCcPrefill()) applyCcPrefill(document); }
  else document.addEventListener("DOMContentLoaded", function () { if (readCcPrefill()) applyCcPrefill(document); });

  /* ========================================================================
   *  ONE-TIME MIGRATION (ทุกเครื่อง) — เลข Item Set ซ้ำ/กระโดด → เรียงติดกันใหม่
   *  ลบเลขทดสอบซ้ำ (dedupe ต่อปุ่ม: where+field) แล้วรันเลขต่อเนื่องเริ่ม 1073402
   *  (แคมเปญที่ posReady จองก่อน = ปุ่มแรก = 1073402 แล้วไล่ 1073403…)
   *  รันครั้งเดียวต่อเครื่อง (guard: state.migItemset)
   * ====================================================================== */
  (function migrateItemsetV2() {
    try {
      if (state.migItemset === 2) return;
      var START = 3402;                       // 1073402 = ปุ่มแรก
      var res = state.reservations || {};
      var isKeys = Object.keys(res).filter(function (k) { return res[k] && res[k].type === "itemset"; });
      if (isKeys.length) {
        // dedupe ต่อปุ่ม (where+field ตัดช่องว่าง) — เก็บ num ต่ำสุด
        var byBtn = {};
        isKeys.forEach(function (k) {
          var e = res[k];
          var id = (String(e.where || "") + "::" + String(e.field || "")).replace(/\s+/g, "").toLowerCase();
          if (!byBtn[id] || (e.num || 0) < (byBtn[id].num || 0)) byBtn[id] = e;
        });
        var uniq = Object.keys(byBtn).map(function (id) { return byBtn[id]; });
        uniq.sort(function (a, b) { return (a.num || 0) - (b.num || 0); });   // คงลำดับเดิม
        // ลบ itemset reservation เก่าทั้งหมด แล้วสร้างใหม่เรียงติดกัน
        isKeys.forEach(function (k) { delete res[k]; });
        var seq = START;
        uniq.forEach(function (e) {
          var code = "107" + seq;
          e.code = code; e.num = seq; e.status = e.status || STATUS.RESERVED;
          res[key("itemset", code)] = e;
          seq++;
        });
        state.types = state.types || {};
        var t = state.types.itemset = state.types.itemset || { seeded: true };
        t.cursor = Math.max(seq - 1, START - 1);      // ตัวถัดไป = seq
        t.baseline = Math.max(t.baseline || 0, START - 1);
        t.seeded = true;
        t.freed = [];                                  // ล้าง free-list เก่ากันแจกเลขต่ำซ้ำ
      }
      state.migItemset = 2;
      CounterStore.write(state);
    } catch (e) {}
  })();

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */
  window.PC_COUNTER = {
    TYPES: TYPES, STATUS: STATUS, store: CounterStore,
    state: function () { return state; },
    config: function (type) { return TYPES[type]; },
    baseline: function (type) { var t = ensureType(type); return t ? t.baseline : 0; },
    cursor: function (type) { var t = ensureType(type); return t ? t.cursor : 0; },
    peek: peek, peekNum: peekNum,
    peekCat: peekCat, reserveCat: reserveCat,
    catBaseline: function (cc) { var c = ensureCat(cc); return c ? c.baseline : 0; },
    catCursor: function (cc) { var c = ensureCat(cc); return c ? c.cursor : 0; },
    peekNumeric: function (type, offset) { return peek(type, offset); },
    reserve: reserve, confirm: confirm, release: release, returnCode: returnCode, note: note,
    autoReserveIn: autoReserveIn,
    returnOrphans: returnOrphans,
    statusOf: statusOf, entryOf: entryOf, reservedHit: reservedHit, findReservedFor: findReservedFor,
    list: list, badgeHTML: badgeHTML, chipHTML: chipHTML,
    onChange: onChange, reset: reset,
    _save: save,
  };

  /* ---- bridge new ops onto PC_API so pages can use google.script.run too -- */
  if (window.PC_API) {
    var API = window.PC_API;
    API.peekCode = function (type, offset) { return peek(type, offset); };
    API.reserveCode = function (type, opts) { return reserve(type, opts || {}); };
    API.confirmCode = function (code, type) { return confirm(code, type); };
    API.releaseCode = function (code, type) { return release(code, type); };
    API.counterState = function () { return { types: state.types, reservations: list(), log: state.log }; };
    API.codeStatus = function (code, type) { return statusOf(code, type); };
    API.peekItemCode = function (cateCode) { return peekCat(cateCode); };
    API.reserveItemCode = function (cateCode, opts) { return reserveCat(cateCode, opts || {}); };
  }

  console.log("[code-counter] ready — central forward-only issuer + reservations");

  /* ---- background auto-return: คืนโค้ดค้างเองเป็นระยะทั่วทั้งระบบ ----------
   * RESERVED ที่ยังไม่ CONFIRMED และหลุดจากงานจริง (getInUseCodes) → คืนกลับตัวนับ
   * ทำงานเบื้องหลังทุก 10 นาที (ไม่ต้องเปิดหน้า Code Counter) · เว้นระยะปลอดภัย 30 นาที
   * (ไม่คืนเลขที่เพิ่งจอง กัน IT ที่กำลังกรอกฟอร์มค้างอยู่) */
  function backgroundSweep() {
    try {
      if (!window.PC_API || !PC_API.getInUseCodes) return;
      var inUse = PC_API.getInUseCodes() || [];
      returnOrphans(inUse, { minAgeMs: 30 * 60 * 1000, src: "คืนอัตโนมัติเบื้องหลัง — โค้ดค้างที่หลุดจากงาน (ยังไม่บันทึก)" });
    } catch (e) {}
  }
  if (!window.__pcCounterSweepTimer) {
    window.__pcCounterSweepTimer = setInterval(backgroundSweep, 10 * 60 * 1000);
    setTimeout(backgroundSweep, 45 * 1000);   // กวาดครั้งแรกหลังระบบโหลดเสร็จ (~45 วิ)
  }
})();
