/* ============================================================================
 * เปลี่ยนตัวย่อทั้งระบบ (Abbreviation rename) — window.PC_Abbr
 * ตัวย่อ (เช่น CFS · SCF · MSCF+LCK) ฝังอยู่ 4 ที่ เปลี่ยนที่เดียวไม่พอ:
 *   1) ตัวย่อชุดผง  PC_SUBSET_MASTER[].short        → override: pc_subset_edits
 *   2) ชื่อสินค้า    itemNameEN / itemNameTH         → override: pc_product_edits
 *   3) ชื่อครัวของปุ่มโปร (Kitchen Name)             → ตารางโปรโมชั่น (API)
 *   4) ชื่อปุ่ม (Short Name) เช่น SPF-PLDLCSF         → ตารางโปรโมชั่น (API · เลือกได้)
 * ทำงาน 2 จังหวะ: preview (นับผลกระทบ ไม่แตะข้อมูล) → apply (เปลี่ยนพร้อมกันครั้งเดียว + เก็บประวัติ)
 * ========================================================================== */
(function () {
  var LOGK = 'pc_abbr_log', SSK = 'pc_subset_edits', EDITK = 'pc_product_edits';
  var SIZE_PREFIX = 'SBLJMGT';   /* Small/Baby/Large/Jumbo/Mega/Giga/Tera ติดหน้าตัวย่อ เช่น M+SCF */

  function ls(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function rxEsc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* แทนที่ตัวย่อแบบรู้ขอบคำ — เก็บอักษรไซซ์ที่นำหน้าไว้ (MSCF+LCK → MCFSQ+LCK)
     ไม่แตะกรณีตัวย่อเป็นส่วนของคำอื่น (เช่น SCFX / ABSCF) */
  function makeRx(oldA) {
    return new RegExp('(^|[^A-Za-z0-9])([' + SIZE_PREFIX + ']?)(' + rxEsc(oldA) + ')(?![A-Za-z0-9])', 'gi');
  }
  function swap(text, oldA, newA) {
    var s = String(text == null ? '' : text);
    if (!s) return s;
    return s.replace(makeRx(oldA), function (m, pre, size) { return pre + size + newA; });
  }
  function hits(text, oldA) {
    var s = String(text == null ? '' : text); if (!s) return 0;
    var m = s.match(makeRx(oldA)); return m ? m.length : 0;
  }
  PC_AbbrSwap = swap;

  /* ตัดชื่อให้พอดีโดย "คงตัวย่อไว้ครบ" — เดิม slice ตรง ๆ ทำให้ตัวย่อใหม่ขาด (CFSQ → CFS)
     ชื่อบิลครัว 40 · ชื่อปุ่ม POS 20 → ตัดหางก่อน แล้วค่อยตัดข้อความข้างหน้าตัวย่อ */
  function fitKeepAbbr(text, limit, abbr) {
    var s = String(text == null ? '' : text);
    if (s.length <= limit) return s;
    var a = String(abbr || '');
    var idx = a ? s.toUpperCase().lastIndexOf(a.toUpperCase()) : -1;
    if (idx < 0) return s.slice(0, limit);
    var head = s.slice(0, idx), tail = s.slice(idx + a.length);
    while ((head + a + tail).length > limit && tail.length) tail = tail.slice(0, -1);        /* \u0e15\u0e31\u0e14\u0e2b\u0e32\u0e07\u0e01\u0e48\u0e2d\u0e19 */
    while ((head + a + tail).length > limit && head.length) head = head.slice(0, -1);        /* \u0e04\u0e48\u0e2d\u0e22\u0e15\u0e31\u0e14\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e02\u0e49\u0e32\u0e07\u0e2b\u0e19\u0e49\u0e32 \u2014 \u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d\u0e04\u0e07\u0e04\u0e23\u0e1a\u0e40\u0e2a\u0e21\u0e2d */
    var out = (head + a + tail).replace(/\s{2,}/g, ' ');
    if (out.length > limit) out = out.slice(out.length - limit);                              /* \u0e01\u0e23\u0e30\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22: \u0e02\u0e2d\u0e07\u0e2a\u0e31\u0e49\u0e19\u0e01\u0e27\u0e48\u0e32\u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d */
    return out;
  }
  PC_AbbrFit = fitKeepAbbr;

  function items() {
    var list = (window.PC_ITEM_MASTER || []).slice();
    var ed = ls(EDITK, {});
    return list.map(function (it) {
      var o = ed[it.itemCode];
      if (!o) return it;
      var c = Object.assign({}, it);
      Object.keys(o).forEach(function (k) { if (o[k] !== '' && o[k] != null) c[k] = o[k]; });
      return c;
    });
  }
  function subsets() {
    var list = (window.PC_SUBSET_MASTER || []).slice();
    var ed = ls(SSK, {});
    return list.map(function (s) { var o = ed[s.ssCode]; return o ? Object.assign({}, s, o) : s; });
  }
  function api() { try { return window.PC_API || (window.parent && window.parent.PC_API) || null; } catch (e) { return null; } }

  /* ---- PREVIEW: กระทบอะไรบ้าง (ไม่แตะข้อมูล) ---- */
  function preview(oldA, newA, opt) {
    oldA = String(oldA || '').trim(); newA = String(newA || '').trim();
    opt = opt || {};
    var out = { oldA: oldA, newA: newA, subsets: [], items: [], promoKitchen: [], promoShort: [], rowItems: [], newProducts: [], warnings: [] };
    if (!oldA || !newA) { out.warnings.push('กรอกตัวย่อเดิมและตัวย่อใหม่ให้ครบ'); return out; }
    if (oldA.toUpperCase() === newA.toUpperCase()) { out.warnings.push('ตัวย่อเดิมและใหม่เหมือนกัน'); return out; }

    subsets().forEach(function (s) {
      if (hits(s.short, oldA) || hits(s.name, oldA)) {
        out.subsets.push({ code: s.ssCode, name: s.name, from: s.short || '', to: swap(s.short || '', oldA, newA), fromName: s.name || '', toName: swap(s.name || '', oldA, newA), status: s.status || '' });
      }
    });
    var fSt = String(opt.status || '').toUpperCase();        /* ACTIVE / INACTIVE / '' = ทั้งหมด */
    var fTy = String(opt.itemType || '').toUpperCase();      /* SINGLE ITEM / ITEM SET / … */
    var only = opt.only && opt.only.length ? (function () { var m = {}; opt.only.forEach(function (c) { m[String(c)] = 1; }); return m; })() : null;
    out.skipped = 0;
    items().forEach(function (it) {
      var en = String(it.itemNameEN || ''), th = String(it.itemNameTH || '');
      if (!hits(en, oldA) && !hits(th, oldA)) return;
      var st = String(it.status || ''), ty = String(it.itemType || '');
      if (fSt && st.toUpperCase() !== fSt) { out.skipped++; return; }
      if (fTy && ty.toUpperCase() !== fTy) { out.skipped++; return; }
      if (only && !only[String(it.itemCode)]) { out.skipped++; return; }
      var nEn = swap(en, oldA, newA), nTh = swap(th, oldA, newA);
      out.items.push({ code: it.itemCode, fromEn: en, toEn: nEn, fromTh: th, toTh: nTh, status: st, itemType: ty, category: it.category || '', over40: nEn.length > 40, over20: nTh.length > 20 });
    });

    var A = api();
    /* ⭐ อ่านจากแถวปุ่มจริงผ่าน abbrScan (getAllCampaignData เป็นระดับแคมเปญ ไม่มี kitchen/ชื่อสินค้า → เคยนับเป็น 0) */
    if (A && A.abbrScan) {
      var sc = A.abbrScan(oldA, newA, { sizePrefix: SIZE_PREFIX }) || {};
      out.itemStart = sc.itemStart || {};
      out.itemEnd = sc.itemEnd || {};
      (sc.kitchen || []).forEach(function (x) { if (opt.includeLive === false && x.live) return; out.promoKitchen.push(x); });
      (sc.shortName || []).forEach(function (x) { out.promoShort.push(x); });
      (sc.rowItems || []).forEach(function (x) { if (opt.includeLive === false && !x.waiting) return; out.rowItems.push(x); });
      if (A.getItemDateRanges) out.itemDates = A.getItemDateRanges() || {};
    } else if (A && A.getAllCampaignData) {
      var seenK = {}, seenS = {};
      (A.getAllCampaignData() || []).forEach(function (r) {
        var k = String(r.kitchen || '');
        if (hits(k, oldA) && !seenK[k]) {
          seenK[k] = 1;
          out.promoKitchen.push({ from: k, to: swap(k, oldA, newA), campaign: r.campaign || '', live: String(r.itStatus || '').toUpperCase() === 'COMPLETE' && String(r.opStatus || '').toUpperCase() === 'CONFIRMED' });
        }
        var sn = String(r.shortName || '');
        if (hits(sn, oldA) && !seenS[sn]) {
          seenS[sn] = 1;
          out.promoShort.push({ from: sn, to: swap(sn, oldA, newA), campaign: r.campaign || '' });
        }
        /* ⭐ ชื่อสินค้าบนแถวโปรที่ "ยังไม่มี item ในข้อมูลหลัก" — จะกลายเป็นสินค้าจริงเมื่อ IT กดบันทึก/OP ยืนยัน
           ถ้าไม่เปลี่ยนตอนนี้ ตัวย่อเก่าจะกลับเข้าระบบอีกทางงานที่ค้างอยู่ */
        var ren = String(r.itemNameEN || ''), rth = String(r.itemNameTH || '');
        if (hits(ren, oldA) || hits(rth, oldA)) {
          var itSt = String(r.itStatus || '').toUpperCase(), opSt = String(r.opStatus || '').toUpperCase();
          out.rowItems.push({
            code: r.itemCode || '', from: ren || rth, to: swap(ren || rth, oldA, newA),
            campaign: r.campaign || '', shortName: r.shortName || '',
            waiting: !(itSt === 'COMPLETE' && opSt === 'CONFIRMED'),
            stage: itSt !== 'COMPLETE' ? 'รอ IT ตั้งค่า' : (opSt !== 'CONFIRMED' ? 'รอ OP ตรวจ' : 'ขึ้น POS แล้ว')
          });
        }
      });
    } else out.warnings.push('อ่านตารางโปรโมชั่นไม่ได้ — ตัวเลขปุ่มโปรอาจไม่ครบ');

    /* ⭐ สินค้าที่ระบบสร้างเพิ่มเอง (IT กดบันทึก / NPD / เพิ่มผง) — ไม่อยู่ใน item-master จึงนับแยก */
    if (A && A.getNpdProducts) {
      (A.getNpdProducts() || []).forEach(function (p) {
        var en = String(p.itemNameEN || ''), th = String(p.itemNameTH || '');
        if (!hits(en, oldA) && !hits(th, oldA)) return;
        out.newProducts.push({ code: p.itemCode, fromEn: en, toEn: swap(en, oldA, newA), fromTh: th, toTh: swap(th, oldA, newA), status: p.status || '', itemType: p.itemType || '' });
      });
    }

    /* ---- ตัดรายการที่ IT สั่งไม่ให้เปลี่ยน (exclude ตาม Item Code หรือข้อความเดิม) ---- */
    var exC = {}, exT = {};
    (opt.exclude || []).forEach(function (c) { var k = String(c == null ? '' : c).trim(); if (k) exC[k] = 1; });
    (opt.excludeText || []).forEach(function (t) { var k = String(t == null ? '' : t).trim().toLowerCase(); if (k) exT[k] = 1; });
    if (Object.keys(exC).length || Object.keys(exT).length) {
      var isEx = function (code, txt) {
        if (code && exC[String(code).trim()]) return true;
        var t = String(txt == null ? '' : txt).trim().toLowerCase();
        return !!(t && exT[t]);
      };
      var nEx = 0;
      var keep = function (arr, fnCode, fnTxt) {
        return arr.filter(function (x) { if (isEx(fnCode(x), fnTxt(x))) { nEx++; return false; } return true; });
      };
      out.items = keep(out.items, function (x) { return x.code; }, function (x) { return x.fromEn; });
      out.newProducts = keep(out.newProducts, function (x) { return x.code; }, function (x) { return x.fromEn; });
      out.rowItems = keep(out.rowItems, function (x) { return x.code; }, function (x) { return x.from; });
      out.subsets = keep(out.subsets, function (x) { return x.code; }, function (x) { return x.from; });
      out.promoKitchen = keep(out.promoKitchen, function (x) { return ''; }, function (x) { return x.from; });
      out.promoShort = keep(out.promoShort, function (x) { return ''; }, function (x) { return x.from; });
      out.excluded = nEx;
      if (nEx) out.warnings.push('ตัดออกจากรายการเปลี่ยน ' + nEx + ' รายการ (IT เลือกไม่เปลี่ยน)');
    }

    /* ตัวย่อใหม่ชนของเดิมไหม */
    var clash = subsets().filter(function (s) { return String(s.short || '').toUpperCase().indexOf(newA.toUpperCase()) >= 0 && !hits(s.short, oldA); });
    if (clash.length) out.warnings.push('ตัวย่อใหม่ "' + newA + '" ใช้อยู่แล้วในชุด: ' + clash.slice(0, 3).map(function (s) { return s.ssCode + ' (' + s.short + ')'; }).join(' · '));
    var over = out.items.filter(function (x) { return x.over40 || x.over20; });
    if (over.length) out.warnings.push('มี ' + over.length + ' รายการที่ชื่อจะยาวเกินกำหนด (บิลครัว 40 · ปุ่ม POS 20) — ระบบจะตัดส่วนอื่นให้พอดี โดยคงตัวย่อใหม่ไว้ครบ');
    var liveN = out.promoKitchen.filter(function (x) { return x.live; }).length;
    if (liveN) out.warnings.push('มีปุ่มครัว ' + liveN + ' รายการอยู่ในโปรที่ขึ้น POS แล้ว' + (opt.includeLive === false ? ' — จะไม่ถูกเปลี่ยน (เลือกไว้ว่าเปลี่ยนเฉพาะของใหม่)' : ' — จะถูกเปลี่ยนตามด้วย'));
    var waitN = out.rowItems.filter(function (x) { return x.waiting; }).length;
    if (waitN) out.warnings.push('มีชื่อสินค้า ' + waitN + ' รายการในงานที่ยังรอ IT/OP (ยังไม่มีในข้อมูลหลักสินค้า) — ระบบเปลี่ยนให้ด้วย ตอน IT กดบันทึกจึงจะเข้าข้อมูลหลักเป็นตัวย่อใหม่');
    out.total = out.subsets.length + out.items.length + out.promoKitchen.length + out.rowItems.length + out.newProducts.length + (opt.withShortName ? out.promoShort.length : 0);
    return out;
  }

  /* ---- APPLY ---- */
  function apply(oldA, newA, opt) {
    opt = opt || {};
    var p = preview(oldA, newA, opt);
    if (!p.total) return { status: 'error', message: 'ไม่พบตัวย่อ "' + oldA + '" ในระบบ', preview: p };
    var done = { subsets: 0, items: 0, promoKitchen: 0, promoShort: 0, rowItems: 0, newProducts: 0 };

    var sEd = ls(SSK, {});
    p.subsets.forEach(function (s) {
      var patch = { short: s.to };
      if (s.toName && s.toName !== s.fromName) patch.name = s.toName;   /* ชื่อชุดผงก็อาจมีตัวย่อฝังอยู่ */
      sEd[s.code] = Object.assign({}, sEd[s.code] || {}, patch); done.subsets++;
    });
    save(SSK, sEd);

    var iEd = ls(EDITK, {});
    p.items.forEach(function (x) {
      iEd[x.code] = Object.assign({}, iEd[x.code] || {}, { itemNameEN: fitKeepAbbr(x.toEn, 40, newA), itemNameTH: fitKeepAbbr(x.toTh, 20, newA) });
      done.items++;
    });
    save(EDITK, iEd);

    var A = api();
    var promoChanges = null;
    if (A && A.renameAbbr) {
      var res = A.renameAbbr(oldA, newA, { withShortName: !!opt.withShortName, includeLive: opt.includeLive !== false, sizePrefix: SIZE_PREFIX,
        exclude: (opt.exclude || []).slice(), excludeText: (opt.excludeText || []).slice() });
      done.promoKitchen = (res && res.kitchen) || 0;
      done.promoShort = (res && res.shortName) || 0;
      done.rowItems = (res && res.itemNames) || 0;
      done.newProducts = (res && res.products) || 0;
      promoChanges = (res && res.changes) || null;
    }

    var log = ls(LOGK, []);
    log.unshift({
      at: new Date().toISOString(), by: (function () { try { return localStorage.getItem('pc_userName') || localStorage.getItem('pc_role') || ''; } catch (e) { return ''; } })(),
      oldA: p.oldA, newA: p.newA, done: done, reason: String(opt.reason || ''),
      filter: { status: opt.status || '', itemType: opt.itemType || '', only: (opt.only || []).length },
      withShortName: !!opt.withShortName, includeLive: opt.includeLive !== false,
      undo: { subsets: p.subsets.map(function (s) { return { code: s.code, short: s.from, name: s.fromName }; }), items: p.items.map(function (x) { return { code: x.code, en: x.fromEn, th: x.fromTh }; }), promo: promoChanges }
    });
    save(LOGK, log.slice(0, 50));
    return { status: 'success', done: done, preview: p, message: 'เปลี่ยนตัวย่อ ' + p.oldA + ' → ' + p.newA + ' แล้ว (ชุดผง ' + done.subsets + ' · สินค้า ' + done.items + ' · ปุ่มครัว ' + done.promoKitchen + (opt.withShortName ? ' · ชื่อปุ่ม ' + done.promoShort : '') + ' · ชื่อสินค้าในงานที่ยังไม่ปิด ' + done.rowItems + ' · สินค้าที่ IT สร้างไว้ ' + done.newProducts + ')' };
  }

  /* ---- UNDO: คืนค่าเดิมของรายการล่าสุด ---- */
  function undo(idx) {
    var log = ls(LOGK, []); var e = log[idx == null ? 0 : idx];
    if (!e) return { status: 'error', message: 'ไม่พบประวัติที่จะย้อนกลับ' };
    var sEd = ls(SSK, {});
    (e.undo.subsets || []).forEach(function (s) { sEd[s.code] = Object.assign({}, sEd[s.code] || {}, s.name != null ? { short: s.short, name: s.name } : { short: s.short }); });
    save(SSK, sEd);
    var iEd = ls(EDITK, {});
    (e.undo.items || []).forEach(function (x) { iEd[x.code] = Object.assign({}, iEd[x.code] || {}, { itemNameEN: x.en, itemNameTH: x.th }); });
    save(EDITK, iEd);
    var A = api();
    if (A && A.restoreAbbrChanges && e.undo && e.undo.promo) {
      A.restoreAbbrChanges(e.undo.promo, { old: e.oldA, new: e.newA });
    } else if (A && A.renameAbbr) A.renameAbbr(e.newA, e.oldA, { withShortName: !!e.withShortName, includeLive: true, sizePrefix: SIZE_PREFIX });
    log.splice(idx == null ? 0 : idx, 1); save(LOGK, log);
    return { status: 'success', message: 'ย้อนกลับเป็น ' + e.oldA + ' แล้ว' };
  }

  window.PC_Abbr = { preview: preview, apply: apply, undo: undo, swap: swap, log: function () { return ls(LOGK, []); } };
})();

/* ============ UI: ชีตเปลี่ยนตัวย่อ (เรียกจากหน้าข้อมูลหลัก สินค้า) ============ */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function ov() {
    var el = document.getElementById('abbrOv');
    if (el) return el;
    el = document.createElement('div'); el.id = 'abbrOv';
    el.style.cssText = 'position:fixed;inset:0;z-index:4200;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;padding:24px;overflow:auto;font-family:Kanit,sans-serif';
    el.onclick = function (e) { if (e.target === el) close(); };
    document.body.appendChild(el); return el;
  }
  function close() { var e = document.getElementById('abbrOv'); if (e) { e.style.display = 'none'; e.innerHTML = ''; } }
  function shell(inner) {
    var o = ov();
    o.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:900px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3)">' + inner + '</div>';
    o.style.display = 'flex';
  }
  function head(sub) {
    return '<div style="background:linear-gradient(100deg,#1a1d20,#2a2f34);color:#fff;padding:16px 22px;display:flex;align-items:center;gap:12px">' +
      '<i class="fas fa-font" style="font-size:1.1rem;color:#ffc107"></i>' +
      '<div style="flex:1"><div style="font-weight:800;letter-spacing:.3px;text-transform:uppercase">เปลี่ยนตัวย่อทั้งระบบ</div>' +
      '<div style="font-size:.78rem;opacity:.75">' + esc(sub || 'ชุดผง · ชื่อสินค้า (บิลครัว/ปุ่ม POS) · ชื่อครัวของปุ่มโปร') + '</div></div>' +
      '<button onclick="window.PC_Abbr.close()" style="background:#fff;color:#1a1d20;border:none;border-radius:9px;padding:8px 14px;font-family:inherit;font-weight:700;cursor:pointer">ปิด</button></div>';
  }

  function open() {
    var logs = window.PC_Abbr.log();
    shell(head() +
      '<div style="padding:20px 22px">' +
        '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:end;margin-bottom:14px">' +
          '<label style="font-size:.76rem;font-weight:700;text-transform:uppercase;color:#5a636b">ตัวย่อเดิม<input id="abOld" placeholder="เช่น SCF" style="width:100%;margin-top:4px;padding:11px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:JetBrains Mono,monospace;font-weight:700;font-size:1rem;text-transform:uppercase"></label>' +
          '<div style="padding-bottom:12px;color:#9aa1aa"><i class="fas fa-arrow-right"></i></div>' +
          '<label style="font-size:.76rem;font-weight:700;text-transform:uppercase;color:#5a636b">ตัวย่อใหม่<input id="abNew" placeholder="เช่น CFSQ" style="width:100%;margin-top:4px;padding:11px 12px;border:1.6px solid #2e934a;border-radius:10px;font-family:JetBrains Mono,monospace;font-weight:700;font-size:1rem;text-transform:uppercase"></label>' +
        '</div>' +
        '<label style="display:block;font-size:.76rem;font-weight:700;text-transform:uppercase;color:#5a636b;margin-bottom:12px">เหตุผล (ไม่บังคับ)<input id="abReason" placeholder="เช่น ตัวย่อสับสนกับกุ้งทอด" style="width:100%;margin-top:4px;padding:10px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:inherit;font-size:.9rem"></label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:14px">' +
          '<label style="font-size:.74rem;font-weight:700;text-transform:uppercase;color:#5a636b;flex:1;min-width:200px;max-width:320px">ชนิดสินค้าที่จะเปลี่ยน<select id="abType" style="width:100%;margin-top:4px;padding:10px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:inherit;font-size:.88rem"><option value="">ทั้งหมด (Item Set + Single Item)</option><option value="Item Set">Item Set เท่านั้น</option><option value="Single Item">Single Item เท่านั้น</option></select></label>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;font-size:.86rem">' +
          '<label style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" id="abLive" checked> เปลี่ยนโปรที่ขึ้น POS แล้วด้วย <span style="color:#8a9099">(ไม่ติ๊ก = เปลี่ยนเฉพาะของใหม่)</span></label>' +
          '<label style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" id="abShort"> เปลี่ยนชื่อปุ่ม (Short Name) ด้วย</label>' +
        '</div>' +
        '<button onclick="window.PC_Abbr.doPreview()" style="background:var(--pc-dark,#1a1d20);color:#fff;border:none;border-radius:10px;padding:12px 22px;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-magnifying-glass me-1"></i> ตรวจผลกระทบก่อนเปลี่ยน</button>' +
        '<div id="abResult" style="margin-top:16px"></div>' +
        (logs.length ? '<div style="margin-top:22px;border-top:1px solid #eef1f4;padding-top:14px">' +
          '<div style="font-weight:700;font-size:.85rem;margin-bottom:8px"><i class="fas fa-clock-rotate-left me-1" style="color:#8a9099"></i>ประวัติการเปลี่ยน</div>' +
          logs.slice(0, 6).map(function (l, i) {
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #eef1f4;border-radius:9px;margin-bottom:6px;font-size:.82rem">' +
              '<span style="font-family:JetBrains Mono,monospace;font-weight:700">' + esc(l.oldA) + ' → ' + esc(l.newA) + '</span>' +
              '<span style="color:#8a9099;flex:1">ชุดผง ' + l.done.subsets + ' · สินค้า ' + l.done.items + ' · ปุ่มครัว ' + l.done.promoKitchen + ' · ' + esc(String(l.at).slice(0, 10)) + (l.by ? ' · ' + esc(l.by) : '') + '</span>' +
              '<button onclick="window.PC_Abbr.doUndo(' + i + ')" style="background:#fff;border:1.4px solid #c0392b;color:#c0392b;border-radius:8px;padding:5px 12px;font-family:inherit;font-weight:700;font-size:.78rem;cursor:pointer">ย้อนกลับ</button></div>';
          }).join('') + '</div>' : '') +
      '</div>');
    (function () {
      var sel = null; if (!sel) return;   /* กรองเป็น Item Set / Single Item เท่านั้น — ไม่เติมจากข้อมูล */
      var seen = {};
      (window.PC_ITEM_MASTER || []).forEach(function (it) { var v = String(it.itemType || '').trim(); if (v && !seen[v]) seen[v] = 1; });
      Object.keys(seen).sort().forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    })();
    setTimeout(function () { var el = document.getElementById('abOld'); if (el) el.focus(); }, 80);
  }

  function doPreview() {
    var oldA = (document.getElementById('abOld').value || '').trim().toUpperCase();
    var newA = (document.getElementById('abNew').value || '').trim().toUpperCase();
    var withShortName = !!document.getElementById('abShort').checked;
    var includeLive = !!document.getElementById('abLive').checked;
    var status = (document.getElementById('abStatus') || {}).value || '';
    var itemType = (document.getElementById('abType') || {}).value || '';
    var opt = { withShortName: withShortName, includeLive: includeLive, status: status, itemType: itemType };
    var p = window.PC_Abbr.preview(oldA, newA, opt);
    var box = document.getElementById('abResult');
    if (!p.total) {
      box.innerHTML = '<div style="padding:14px;border-radius:10px;background:#fff4e5;border:1px solid #e0a800;font-size:.88rem">' +
        (p.warnings.length ? p.warnings.map(esc).join('<br>') : 'ไม่พบตัวย่อ "' + esc(oldA) + '" ในระบบ') + '</div>';
      return;
    }
    var card = function (t, n, rows) {
      return '<div style="border:1px solid #e7eaee;border-radius:11px;margin-bottom:10px;overflow:hidden">' +
        '<div style="background:#f6f8fa;padding:9px 13px;font-weight:700;font-size:.85rem">' + t + ' <span style="color:#2e934a">' + n + ' รายการ</span></div>' +
        (rows ? '<div style="max-height:180px;overflow:auto;font-size:.82rem">' + rows + '</div>' : '') + '</div>';
    };
    var row = function (a, b, note) {
      return '<div style="display:flex;gap:10px;align-items:center;padding:6px 13px;border-top:1px solid #f1f3f5">' +
        '<span style="color:#8a9099;text-decoration:line-through;flex:1">' + esc(a) + '</span>' +
        '<i class="fas fa-arrow-right" style="color:#cfd6dd;font-size:.7rem"></i>' +
        '<span style="font-weight:700;flex:1">' + esc(b) + '</span>' + (note || '') + '</div>';
    };
    var html = '';
    if (p.subsets.length) html += card('ตัวย่อชุดผง', p.subsets.length, p.subsets.map(function (s) { return row(s.code + ' · ' + s.from, s.to); }).join(''));
    if (p.items.length) {
      var stB = function (s) { var on = /active/i.test(s) && !/in/i.test(s); return '<span style="background:' + (on ? '#eaf6ee' : '#fdecec') + ';color:' + (on ? '#0b6b3a' : '#c0392b') + ';border-radius:20px;padding:1px 8px;font-size:.7rem;font-weight:700">' + esc(s || '-') + '</span>'; };
      html += '<div style="border:1px solid #e7eaee;border-radius:11px;margin-bottom:10px;overflow:hidden">' +
        '<div style="background:#f6f8fa;padding:9px 13px;font-weight:700;font-size:.85rem;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<span>ชื่อสินค้า (บิลครัว / ปุ่ม POS) <span style="color:#2e934a">' + p.items.length + ' รายการ</span></span>' +
          (p.skipped ? '<span style="color:#8a9099;font-weight:400;font-size:.78rem">ถูกกรองออก ' + p.skipped + '</span>' : '') +
          '<span style="flex:1"></span>' +
          '<button onclick="window.PC_Abbr.pickAllIT(true)" style="background:#fff;border:1.3px solid #cfd6dd;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer">เลือกทั้งหมด</button>' +
          '<button onclick="window.PC_Abbr.pickAllIT(false)" style="background:#fff;border:1.3px solid #cfd6dd;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer">ไม่เลือกเลย</button>' +
          '<span id="abPickN" style="font-size:.78rem;color:#2e934a;font-weight:700"></span></div>' +
        '<div style="max-height:250px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
          '<thead style="position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #eef1f4"><tr>' +
            '<th style="padding:6px 8px;width:34px"></th><th style="padding:6px 8px;text-align:left">รหัส</th>' +
            '<th style="padding:6px 8px;text-align:left">ชื่อเดิม</th><th style="padding:6px 8px;text-align:left">ชื่อใหม่</th>' +
            '<th style="padding:6px 8px;text-align:left">Type</th><th style="padding:6px 8px">Status</th></tr></thead><tbody>' +
          p.items.map(function (x) {
            return '<tr><td style="padding:5px 8px;text-align:center"><input type="checkbox" class="abPick" value="' + esc(x.code) + '" checked onchange="window.PC_Abbr.countIT()"></td>' +
              '<td style="padding:5px 8px;font-family:JetBrains Mono,monospace">' + esc(x.code) + '</td>' +
              '<td style="padding:5px 8px;color:#8a9099;text-decoration:line-through">' + esc(x.fromEn) + '</td>' +
              '<td style="padding:5px 8px;font-weight:700">' + esc(x.toEn) + (x.over40 ? ' <span style="color:#c0392b;font-size:.7rem">ยาวเกิน</span>' : '') + '</td>' +
              '<td style="padding:5px 8px">' + esc(x.itemType || '-') + '</td>' +
              '<td style="padding:5px 8px;text-align:center">' + stB(x.status) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
    }
    if (p.promoKitchen.length) html += card('ชื่อครัวของปุ่มโปร (Kitchen Name)', p.promoKitchen.length, p.promoKitchen.map(function (x) {
      return row(x.from, x.to, x.live ? '<span style="background:#fff4e5;color:#8a5a00;border:1px solid #e0a800;border-radius:6px;padding:1px 7px;font-size:.7rem">ขึ้น POS แล้ว</span>' : '');
    }).join(''));
    if (withShortName && p.promoShort.length) html += card('ชื่อปุ่ม (Short Name)', p.promoShort.length, p.promoShort.map(function (x) { return row(x.from, x.to); }).join(''));
    if (p.warnings.length) html = '<div style="padding:12px 14px;border-radius:10px;background:#fff4e5;border:1px solid #e0a800;font-size:.84rem;margin-bottom:12px"><b>ตรวจสอบก่อนยืนยัน</b><br>' + p.warnings.map(esc).join('<br>') + '</div>' + html;
    html += '<button onclick="window.PC_Abbr.doApply()" style="background:#2e934a;color:#fff;border:none;border-radius:10px;padding:13px 26px;font-family:inherit;font-weight:700;cursor:pointer;font-size:.95rem"><i class="fas fa-check me-1"></i> ยืนยันเปลี่ยนทั้งระบบ (' + p.total + ' รายการ)</button>';
    box.innerHTML = html;
    window.PC_Abbr.__pending = { oldA: oldA, newA: newA, withShortName: withShortName, includeLive: includeLive, status: status, itemType: itemType };
    countIT();
  }

  function pickAllIT(on) { [].forEach.call(document.querySelectorAll('.abPick'), function (c) { c.checked = !!on; }); countIT(); }
  function countIT() { var el = document.getElementById('abPickN'); if (el) el.textContent = 'เลือก ' + document.querySelectorAll('.abPick:checked').length + '/' + document.querySelectorAll('.abPick').length; }
  function doApply() {
    var q = window.PC_Abbr.__pending; if (!q) return;
    var reason = (document.getElementById('abReason') || {}).value || '';
    var picks = [].map.call(document.querySelectorAll('.abPick:checked'), function (c) { return c.value; });
    var total = document.querySelectorAll('.abPick').length;
    var only = (picks.length && picks.length < total) ? picks : null;
    var res = window.PC_Abbr.apply(q.oldA, q.newA, { withShortName: q.withShortName, includeLive: q.includeLive, status: q.status, itemType: q.itemType, only: only, reason: reason });
    if (window.Swal) {
      Swal.fire({ icon: res.status === 'success' ? 'success' : 'error', title: res.status === 'success' ? 'เปลี่ยนตัวย่อแล้ว' : 'ไม่สำเร็จ', text: res.message, confirmButtonColor: '#2e934a' })
        .then(function () { if (res.status === 'success') { close(); if (window.PM && window.PM.render) try { window.PM.render(); } catch (e) {} } });
    } else { alert(res.message); close(); }
  }
  function doUndo(i) {
    var go = function () { var r = window.PC_Abbr.undo(i); if (window.Swal) Swal.fire({ icon: 'success', title: 'ย้อนกลับแล้ว', text: r.message, confirmButtonColor: '#2e934a' }).then(open); else open(); };
    if (window.Swal) Swal.fire({ title: 'ย้อนกลับการเปลี่ยนตัวย่อ?', text: 'ระบบจะคืนตัวย่อเดิมให้ทุกรายการ', icon: 'warning', showCancelButton: true, confirmButtonColor: '#c0392b', confirmButtonText: 'ย้อนกลับ', cancelButtonText: 'ไม่' }).then(function (r) { if (r.isConfirmed) go(); });
    else go();
  }

  Object.assign(window.PC_Abbr, { open: open, close: close, doPreview: doPreview, doApply: doApply, doUndo: doUndo, pickAllIT: pickAllIT, countIT: countIT });
})();

/* ============ คำขอเปลี่ยนตัวย่อ (RD ยื่น → IT อนุมัติ) ============ */
(function () {
  var RQK = 'pc_abbr_requests';
  function ls(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function who() { try { return localStorage.getItem('pc_userName') || localStorage.getItem('pc_role') || ''; } catch (e) { return ''; } }

  function list(status) {
    var all = ls(RQK, []).filter(function (r) { return r && !r.deleted; });   // ข้าม tombstone (ใบที่ลบแล้ว)
    return status ? all.filter(function (r) { return String(r.status || 'PENDING').toUpperCase() === String(status).toUpperCase(); }) : all;
  }
  /* ---- กันแจ้งซ้ำ: ตรวจคำขอเดิมทุกสถานะก่อนรับใบใหม่ ----------------------
   * คืน null = ยื่นได้ · คืน {status:'error',message,ref} = ห้ามยื่น (พร้อมเลขใบเดิม) */
  function dupCheck(oldA, newA, opts) {
    opts = opts || {};
    oldA = String(oldA || '').trim().toUpperCase(); newA = String(newA || '').trim().toUpperCase();
    var all = ls(RQK, []).filter(function (r) { return r && !r.deleted; });   // ใบที่ลบแล้วไม่นับเป็นซ้ำ
    var d = function (s) { return String(s || '').slice(0, 10); };
    var pend = all.filter(function (r) { return String(r.status || 'PENDING').toUpperCase() === 'PENDING'; });
    var done = all.filter(function (r) { return String(r.status || '').toUpperCase() === 'DONE'; });
    var hit;
    /* 1) คู่เดิม–ใหม่ ตรงกันเป๊ะ และยังรออยู่ */
    hit = pend.filter(function (r) { return r.oldA === oldA && r.newA === newA; })[0];
    if (hit) return { status: 'error', ref: hit.id, message: 'แจ้งไปแล้ว — ใบ ' + hit.id + ' (' + oldA + ' → ' + newA + ') ยื่นเมื่อ ' + d(hit.at) + ' โดย ' + (hit.by || '-') + ' ยังรอ IT ยืนยัน ไม่ต้องยื่นซ้ำ' };
    /* 2) คู่เดิม–ใหม่ เคยเปลี่ยนสำเร็จแล้ว */
    hit = done.filter(function (r) { return r.oldA === oldA && r.newA === newA; })[0];
    if (hit) return { status: 'error', ref: hit.id, message: 'เคยเปลี่ยนไปแล้ว — ใบ ' + hit.id + ' (' + oldA + ' → ' + newA + ') ดำเนินการเมื่อ ' + d(hit.doneAt) + ' โดย ' + (hit.doneBy || '-') };
    /* 3) ตัวย่อเดิมมีใบค้างอยู่ แต่ปลายทางไม่เหมือนกัน */
    hit = pend.filter(function (r) { return r.oldA === oldA; })[0];
    if (hit) return { status: 'error', ref: hit.id, message: 'ตัวย่อ "' + oldA + '" มีคำขอค้างอยู่แล้ว — ใบ ' + hit.id + ' จะเปลี่ยนเป็น ' + hit.newA + ' (ยื่น ' + d(hit.at) + ') ให้ตีกลับใบเดิมก่อนยื่นใหม่' };
    /* 4) ปลายทางเดียวกันแต่มาจากตัวย่ออื่น — กรณีสะกดสลับ (JSCF/JCSF/JCFS) ต้องยื่นเพิ่มได้
     *    → ไม่บล็อกถ้าผู้ยื่นยืนยันว่าเป็นชุดเดียวกัน (mergeWith) */
    hit = pend.filter(function (r) { return r.newA === newA; })[0];
    if (hit && !opts.allowMerge) return { status: 'error', mergeable: true, ref: hit.id, message: 'ตัวย่อใหม่ "' + newA + '" มีคำขอค้างอยู่แล้ว — ใบ ' + hit.id + ' (' + hit.oldA + ' → ' + newA + ')\nถ้านี่คือตัวย่อที่สะกดสลับของเรื่องเดียวกัน กด "ยื่นเพิ่มเป็นชุดเดียวกัน" ได้เลย' };
    /* 5) เคยเปลี่ยนกลับทางแล้ว (ใหม่→เดิม) */
    hit = done.filter(function (r) { return r.oldA === newA && r.newA === oldA; })[0];
    if (hit) return { status: 'error', ref: hit.id, message: 'ทิศทางกลับกันกับใบ ' + hit.id + ' (' + hit.oldA + ' → ' + hit.newA + ' เมื่อ ' + d(hit.doneAt) + ') — ถ้าต้องการย้อนกลับ ให้ใช้ปุ่มย้อนกลับที่ประวัติแทน' };
    return null;
  }
  function submit(d) {
    var oldA = String(d.oldA || '').trim().toUpperCase(), newA = String(d.newA || '').trim().toUpperCase();
    if (!oldA || !newA) return { status: 'error', message: 'กรอกตัวย่อเดิมและตัวย่อใหม่ให้ครบ' };
    if (oldA === newA) return { status: 'error', message: 'ตัวย่อเดิมและใหม่เหมือนกัน' };
    var dup = dupCheck(oldA, newA, { allowMerge: !!d.allowMerge });
    if (dup) return dup;
    var p = window.PC_Abbr.preview(oldA, newA, { withShortName: !!d.withShortName, includeLive: d.includeLive !== false });
    if (!p.total) return { status: 'error', message: 'ไม่พบตัวย่อ "' + oldA + '" ในระบบ' };
    var all = ls(RQK, []);
    /* เลขใบเดินหน้าเสมอ (ห้ามใช้ความยาว list — ลบใบเดิมแล้วจะได้เลขซ้ำ) */
    var yr = new Date().getFullYear();
    var seq = all.reduce(function (mx, r) { var m = /^AB-(\d{4})(\d{3,})$/.exec(String(r.id || '')); return (m && Number(m[1]) === yr) ? Math.max(mx, Number(m[2])) : mx; }, 0);
    var id = 'AB-' + yr + String(seq + 1).padStart(3, '0');
    all.unshift({
      id: id, oldA: oldA, newA: newA, reason: String(d.reason || ''), by: who(), at: new Date().toISOString(),
      withShortName: !!d.withShortName, includeLive: d.includeLive !== false, status: 'PENDING',
      mergeGroup: d.allowMerge ? newA : '',
      counts: { subsets: p.subsets.length, items: p.items.length, kitchen: p.promoKitchen.length, shortName: p.promoShort.length, rowItems: p.rowItems.length, newProducts: p.newProducts.length, total: p.total },
      warnings: p.warnings
    });
    save(RQK, all);
    try { if (window.PC_notify) window.PC_notify('abbr_request', { text: 'RD ขอเปลี่ยนตัวย่อ ' + oldA + ' → ' + newA + ' (' + p.total + ' รายการ) — รอ IT ยืนยัน' }); } catch (e) {}
    return { status: 'success', id: id, message: 'ส่งคำขอ ' + id + ' แล้ว — รอ IT ยืนยัน (กระทบ ' + p.total + ' รายการ)' };
  }
  function approve(id) {
    var all = ls(RQK, []); var r = all.filter(function (x) { return x.id === id; })[0];
    if (!r) return { status: 'error', message: 'ไม่พบคำขอ' };
    if (String(r.status).toUpperCase() !== 'PENDING') return { status: 'error', message: 'คำขอนี้ปิดแล้ว' };
    var olds = reqOlds(r), done = {}, msgs = [];
    for (var oi = 0; oi < olds.length; oi++) {
      var one = window.PC_Abbr.apply(olds[oi], r.newA, { withShortName: r.withShortName, includeLive: r.includeLive, exclude: r.exclude || [], excludeText: r.excludeText || [], reason: '[' + r.id + '] ' + (r.reason || '') });
      if (one.status !== 'success') return one;
      Object.keys(one.done || {}).forEach(function (k) { done[k] = (done[k] || 0) + (one.done[k] || 0); });
      msgs.push(olds[oi] + ' → ' + r.newA);
    }
    var res = { status: 'success', message: 'เปลี่ยนตัวย่อแล้ว — ' + msgs.join(' · ') };
    r.status = 'DONE'; r.doneBy = who(); r.doneAt = new Date().toISOString(); r.done = done;
    save(RQK, all);
    try { if (window.PC_notify) window.PC_notify('abbr_done', { text: 'IT เปลี่ยนตัวย่อ ' + reqOlds(r).join(' + ') + ' → ' + r.newA + ' เรียบร้อย (' + r.id + ')' }); } catch (e) {}
    return { status: 'success', message: res.message };
  }
  function reject(id, note) {
    var all = ls(RQK, []); var r = all.filter(function (x) { return x.id === id; })[0];
    if (!r) return { status: 'error', message: 'ไม่พบคำขอ' };
    r.status = 'REJECTED'; r.rejectNote = String(note || ''); r.doneBy = who(); r.doneAt = new Date().toISOString();
    save(RQK, all);
    try { if (window.PC_notify) window.PC_notify('abbr_reject', { text: 'IT ตีกลับคำขอเปลี่ยนตัวย่อ ' + r.oldA + ' → ' + r.newA + (note ? ' — ' + note : '') }); } catch (e) {}
    return { status: 'success', message: 'ตีกลับคำขอแล้ว' };
  }
  /* ลบใบคำขอออกจากคิว (Admin/IT — ใช้เก็บกวาดใบทดสอบ/ใบที่ตีกลับแล้ว) */
  function del(id) {
    var all = ls(RQK, []); var hit = false;
    /* ลบแบบ tombstone — ถ้าลบแถวทิ้งเลย ตัวซิงค์จะ union กลับมาจากคลาวด์ (ใบที่ลบแล้วเด้งกลับ) */
    all.forEach(function (x) { if (x.id === id) { hit = true; x.deleted = true; x.deletedAt = new Date().toISOString(); x.deletedBy = who(); } });
    if (!hit) return { status: 'error', message: 'ไม่พบคำขอ ' + id };
    save(RQK, all);
    return { status: 'success', message: 'ลบคำขอ ' + id + ' แล้ว' };
  }
  /* ---- IT ตัดรายการออกจากคำขอ (ไม่เปลี่ยนตัวย่อของรายการนั้น) ---- */
  function setExclude(id, codes, texts) {
    var all = ls(RQK, []); var r = all.filter(function (x) { return x.id === id; })[0];
    if (!r) return { status: 'error', message: 'ไม่พบคำขอ ' + id };
    r.exclude = (codes || []).map(function (c) { return String(c).trim(); }).filter(Boolean);
    r.excludeText = (texts || []).map(function (t) { return String(t).trim(); }).filter(Boolean);
    r.excludeAt = new Date().toISOString(); r.excludeBy = who();
    save(RQK, all);
    return { status: 'success', n: r.exclude.length + r.excludeText.length };
  }
  function getExclude(id) {
    var r = ls(RQK, []).filter(function (x) { return x.id === id; })[0];
    return r ? { exclude: r.exclude || [], excludeText: r.excludeText || [] } : { exclude: [], excludeText: [] };
  }
  /* ---- ใบที่ยุบรวมหลายตัวย่อไว้ในใบเดียว (สะกดสลับ CFS/SCF/CSF → ปลายทางเดียวกัน) ---- */
  function reqOlds(r) { return r ? [r.oldA].concat(r.alsoOld || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean) : []; }
  /* preview รวมหลายตัวย่อ — ผลลัพธ์หน้าตาเหมือน preview() ปกติ (รวมกลุ่ม + ตัดรายการซ้ำ) */
  function previewMulti(olds, newA, opt) {
    olds = (olds || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (olds.length < 2) return window.PC_Abbr.preview(olds[0] || '', newA, opt);
    var out = { oldA: olds.join(' + '), olds: olds.slice(), newA: newA, subsets: [], items: [], promoKitchen: [], promoShort: [], rowItems: [], newProducts: [], warnings: [], itemStart: {}, itemEnd: {}, itemDates: {}, skipped: 0, excluded: 0 };
    var BK = ['subsets', 'items', 'promoKitchen', 'promoShort', 'rowItems', 'newProducts'], seen = {};
    olds.forEach(function (oldA) {
      var p = window.PC_Abbr.preview(oldA, newA, opt) || {};
      BK.forEach(function (k) {
        (p[k] || []).forEach(function (x) {
          var key = k + '|' + String(x.code || '') + '|' + String(x.from || x.fromEn || x.fromTh || '');
          if (seen[key]) return; seen[key] = 1; out[k].push(x);
        });
      });
      (p.warnings || []).forEach(function (w) { if (out.warnings.indexOf(w) < 0) out.warnings.push(w); });
      ['itemStart', 'itemEnd', 'itemDates'].forEach(function (k) {
        var src = p[k] || {}; Object.keys(src).forEach(function (kk) { if (out[k][kk] == null) out[k][kk] = src[kk]; });
      });
      out.skipped += (p.skipped || 0); out.excluded += (p.excluded || 0);
    });
    out.total = BK.reduce(function (n, k) { return n + out[k].length; }, 0);
    return out;
  }
  /* ยุบใบ fromId เข้าใบ intoId — ปลายทาง (newA) ต้องเดียวกัน · ใบเดิมถูกปิดแบบ tombstone */
  function mergeReq(intoId, fromId) {
    var all = ls(RQK, []);
    var a = all.filter(function (x) { return x.id === intoId && !x.deleted; })[0];
    var b = all.filter(function (x) { return x.id === fromId && !x.deleted; })[0];
    if (!a || !b) return { status: 'error', message: 'ไม่พบคำขอที่จะยุบรวม' };
    if (a.id === b.id) return { status: 'error', message: 'เป็นใบเดียวกัน' };
    if (String(a.newA).toUpperCase() !== String(b.newA).toUpperCase()) return { status: 'error', message: 'ตัวย่อปลายทางไม่เหมือนกัน (' + a.newA + ' / ' + b.newA + ') — ยุบรวมไม่ได้' };
    if (String(a.status || 'PENDING').toUpperCase() !== 'PENDING' || String(b.status || 'PENDING').toUpperCase() !== 'PENDING') return { status: 'error', message: 'ยุบรวมได้เฉพาะใบที่ยังรอยืนยัน' };
    var olds = reqOlds(a);
    reqOlds(b).forEach(function (x) { if (olds.map(function (y) { return y.toUpperCase(); }).indexOf(x.toUpperCase()) < 0) olds.push(x); });
    a.alsoOld = olds.slice(1);
    var uniq = function (arr) { var m = {}, r = []; (arr || []).forEach(function (v) { var k = String(v).trim(); if (k && !m[k]) { m[k] = 1; r.push(k); } }); return r; };
    a.exclude = uniq((a.exclude || []).concat(b.exclude || []));
    a.excludeText = uniq((a.excludeText || []).concat(b.excludeText || []));
    a.mergeGroup = a.newA;
    a.mergedFrom = (a.mergedFrom || []).concat([b.id]);
    a.mergedAt = new Date().toISOString(); a.mergedBy = who();
    if (b.reason && String(a.reason || '').indexOf(b.reason) < 0) a.reason = [a.reason, b.reason].filter(Boolean).join(' · ');
    var p = previewMulti(olds, a.newA, { withShortName: !!a.withShortName, includeLive: a.includeLive !== false, exclude: a.exclude, excludeText: a.excludeText });
    a.counts = { subsets: p.subsets.length, items: p.items.length, kitchen: p.promoKitchen.length, shortName: p.promoShort.length, rowItems: p.rowItems.length, newProducts: p.newProducts.length, total: p.total };
    a.warnings = p.warnings;
    b.deleted = true; b.deletedAt = new Date().toISOString(); b.deletedBy = who(); b.mergedInto = a.id;
    save(RQK, all);
    return { status: 'success', id: a.id, olds: olds, total: p.total, message: 'ยุบใบ ' + b.id + ' เข้า ' + a.id + ' แล้ว — ' + olds.join(' + ') + ' → ' + a.newA + ' (' + p.total + ' รายการ)' };
  }
  Object.assign(window.PC_Abbr, { reqList: list, reqSubmit: submit, reqApprove: approve, reqReject: reject, reqDelete: del, reqDupCheck: dupCheck, reqSetExclude: setExclude, reqGetExclude: getExclude, reqOlds: reqOlds, previewMulti: previewMulti, reqMerge: mergeReq });
})();

/* ============ UI ฝั่ง RD: ฟอร์มขอเปลี่ยนตัวย่อ (render ลง element ที่ส่งมา) ============ */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function badge(st) {
    var m = { PENDING: ['#fff4e5', '#8a5a00', 'รอ IT ยืนยัน'], DONE: ['#eaf6ee', '#0b6b3a', 'เปลี่ยนแล้ว'], REJECTED: ['#fdecec', '#c0392b', 'ตีกลับ'] }[String(st || 'PENDING').toUpperCase()] || ['#eef1f4', '#5a636b', st];
    return '<span style="background:' + m[0] + ';color:' + m[1] + ';border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:700">' + esc(m[2]) + '</span>';
  }
  function renderRD(main) {
    var reqs = window.PC_Abbr.reqList();
    main.innerHTML =
      '<div style="padding:18px 20px;font-family:Kanit,sans-serif">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><h3 style="margin:0;font-size:1.05rem;font-weight:800"><i class="fas fa-font me-2" style="color:#2e934a"></i>ขอเปลี่ยนตัวย่อสินค้า</h3></div>' +
        '<div style="font-size:.82rem;color:#8a9099;margin-bottom:16px">ตัวย่อใช้ทั้งชุดผง · ชื่อบิลครัว · ชื่อปุ่ม POS · ชื่อครัวของปุ่มโปร — ยื่นคำขอที่นี่ แล้ว IT จะกดเปลี่ยนให้ทุกที่พร้อมกัน</div>' +
        '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:end;max-width:620px;margin-bottom:12px">' +
          '<label style="font-size:.74rem;font-weight:700;text-transform:uppercase;color:#5a636b">ตัวย่อเดิม<input id="abrOld" placeholder="เช่น CFS" style="width:100%;margin-top:4px;padding:11px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:JetBrains Mono,monospace;font-weight:700;font-size:1rem;text-transform:uppercase"></label>' +
          '<div style="padding-bottom:12px;color:#9aa1aa"><i class="fas fa-arrow-right"></i></div>' +
          '<label style="font-size:.74rem;font-weight:700;text-transform:uppercase;color:#5a636b">ตัวย่อใหม่<input id="abrNew" placeholder="เช่น CFSQ" style="width:100%;margin-top:4px;padding:11px 12px;border:1.6px solid #2e934a;border-radius:10px;font-family:JetBrains Mono,monospace;font-weight:700;font-size:1rem;text-transform:uppercase"></label>' +
        '</div>' +
        '<label style="display:block;font-size:.74rem;font-weight:700;text-transform:uppercase;color:#5a636b;max-width:620px;margin-bottom:12px">เหตุผล<input id="abrReason" placeholder="เช่น ตัวย่อสับสนกับกุ้งทอด" style="width:100%;margin-top:4px;padding:10px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:inherit;font-size:.9rem"></label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;max-width:620px;margin-bottom:14px">' +
          '<label style="font-size:.74rem;font-weight:700;text-transform:uppercase;color:#5a636b;flex:1;min-width:200px;max-width:320px">ชนิดสินค้าที่จะเปลี่ยน<select id="abrType" style="width:100%;margin-top:4px;padding:10px 12px;border:1.6px solid #dde2e7;border-radius:10px;font-family:inherit;font-size:.88rem"><option value="">ทั้งหมด (Item Set + Single Item)</option><option value="Item Set">Item Set เท่านั้น</option><option value="Single Item">Single Item เท่านั้น</option></select></label>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem;margin-bottom:14px">' +
          '<label style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" id="abrLive" checked> เปลี่ยนโปรที่ขึ้น POS แล้วด้วย</label>' +
          '<label style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" id="abrShort"> เปลี่ยนชื่อปุ่ม (Short Name) ด้วย</label>' +
        '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button onclick="window.PC_Abbr.rdPreview()" style="background:#1a1d20;color:#fff;border:none;border-radius:10px;padding:11px 20px;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-magnifying-glass me-1"></i>ดูผลกระทบ</button>' +
          '<button onclick="window.PC_Abbr.rdSubmit()" style="background:#2e934a;color:#fff;border:none;border-radius:10px;padding:11px 20px;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-paper-plane me-1"></i>ส่งคำขอให้ IT</button>' +
        '</div>' +
        '<div id="abrPrev" style="margin-top:14px;max-width:820px"></div>' +
        '<div style="margin-top:24px;border-top:1px solid #eef1f4;padding-top:14px">' +
          '<div style="font-weight:700;font-size:.88rem;margin-bottom:10px"><i class="fas fa-list-check me-1" style="color:#8a9099"></i>คำขอของฉัน</div>' +
          (reqs.length ? reqs.slice(0, 12).map(function (r) {
            return '<div style="display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid #eef1f4;border-radius:10px;margin-bottom:7px;font-size:.84rem;flex-wrap:wrap">' +
              '<span style="font-family:JetBrains Mono,monospace;font-weight:700;color:#2e934a">' + esc(r.id) + '</span>' +
              '<span style="font-family:JetBrains Mono,monospace;font-weight:700">' + esc(r.oldA) + ' → ' + esc(r.newA) + '</span>' +
              '<span style="color:#8a9099;flex:1">' + r.counts.total + ' รายการ · ' + esc(String(r.at).slice(0, 10)) + (r.reason ? ' · ' + esc(r.reason) : '') + (r.rejectNote ? ' · เหตุผลตีกลับ: ' + esc(r.rejectNote) : '') + '</span>' +
              badge(r.status) + '</div>';
          }).join('') : '<div style="color:#9aa1aa;font-size:.85rem">ยังไม่มีคำขอ</div>') +
        '</div>' +
      '</div>';
    /* เติมตัวเลือก Type จากข้อมูลจริง */
    var sel = null;   /* กรองเป็น Item Set / Single Item เท่านั้น */
    if (sel) {
      var seen = {};
      (window.PC_ITEM_MASTER || []).forEach(function (it) { var v = String(it.itemType || '').trim(); if (v && !seen[v]) seen[v] = 1; });
      Object.keys(seen).sort().forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    }
    var box = document.getElementById('abrPrev');
    if (box) box.addEventListener('change', function (e) { if (e.target && e.target.classList.contains('abrPick')) countPicks(); });
  }
  function vals(withPicks) {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var v = {
      oldA: (g('abrOld') || '').trim().toUpperCase(),
      newA: (g('abrNew') || '').trim().toUpperCase(),
      reason: (g('abrReason') || '').trim(),
      includeLive: !!(document.getElementById('abrLive') || {}).checked,
      withShortName: !!(document.getElementById('abrShort') || {}).checked,
      status: g('abrStatus') || '', itemType: g('abrType') || ''
    };
    if (withPicks) {
      var picks = [].map.call(document.querySelectorAll('.abrPick:checked'), function (c) { return c.value; });
      var total = document.querySelectorAll('.abrPick').length;
      if (picks.length && picks.length < total) v.only = picks;
    }
    return v;
  }
  function pickAll(on) {
    [].forEach.call(document.querySelectorAll('.abrPick'), function (c) { c.checked = !!on; });
    countPicks();
  }
  function countPicks() {
    var el = document.getElementById('abrPickN'); if (!el) return;
    el.textContent = 'เลือก ' + document.querySelectorAll('.abrPick:checked').length + '/' + document.querySelectorAll('.abrPick').length;
  }
  function rdPreview() {
    var v = vals(); var box = document.getElementById('abrPrev');
    /* กันแจ้งซ้ำตั้งแต่ตอนดูผลกระทบ — บอกเลขใบเดิมทันที ไม่ต้องรอกดส่ง */
    var dup = window.PC_Abbr.reqDupCheck && window.PC_Abbr.reqDupCheck(v.oldA, v.newA);
    if (dup) { box.innerHTML = '<div style="padding:12px 14px;border-radius:10px;background:#fdecec;border:1px solid #f3c6c0;color:#c0392b;font-size:.86rem;font-weight:600"><i class="fas fa-ban" style="margin-right:7px"></i>' + esc(dup.message) + '</div>'; return; }
    var p = window.PC_Abbr.preview(v.oldA, v.newA, v);
    window.PC_Abbr.__lastPrev = p;
    if (!p.total) { box.innerHTML = '<div style="padding:12px 14px;border-radius:10px;background:#fff4e5;border:1px solid #e0a800;font-size:.86rem">' + (p.warnings.length ? p.warnings.map(esc).join('<br>') : 'ไม่พบตัวย่อ "' + esc(v.oldA) + '" ในระบบ') + '</div>'; return; }
    var grp = function (t, n, rows) { return '<div style="border:1px solid #e7eaee;border-radius:10px;margin-bottom:8px;overflow:hidden"><div style="background:#f6f8fa;padding:8px 12px;font-weight:700;font-size:.83rem">' + t + ' <span style="color:#2e934a">' + n + ' รายการ</span></div><div style="max-height:150px;overflow:auto;font-size:.8rem">' + rows + '</div></div>'; };
    var row = function (a, b) { return '<div style="display:flex;gap:8px;padding:5px 12px;border-top:1px solid #f1f3f5"><span style="color:#8a9099;text-decoration:line-through;flex:1">' + esc(a) + '</span><span style="font-weight:700;flex:1">' + esc(b) + '</span></div>'; };
    var h = '';
    if (p.warnings.length) h += '<div style="padding:11px 13px;border-radius:10px;background:#fff4e5;border:1px solid #e0a800;font-size:.83rem;margin-bottom:10px">' + p.warnings.map(esc).join('<br>') + '</div>';
    if (p.subsets.length) h += grp('ตัวย่อชุดผง', p.subsets.length, p.subsets.map(function (s) { return row(s.code + ' · ' + s.from, s.to); }).join(''));
    if (p.items.length) {
      var stB = function (s) { var on = /active/i.test(s) && !/in/i.test(s); return '<span style="background:' + (on ? '#eaf6ee' : '#fdecec') + ';color:' + (on ? '#0b6b3a' : '#c0392b') + ';border-radius:20px;padding:1px 8px;font-size:.7rem;font-weight:700">' + esc(s || '-') + '</span>'; };
      var rows = p.items.map(function (x) {
        return '<tr data-code="' + esc(x.code) + '">' +
          '<td style="padding:5px 8px;text-align:center"><input type="checkbox" class="abrPick" value="' + esc(x.code) + '" checked></td>' +
          '<td style="padding:5px 8px;font-family:JetBrains Mono,monospace">' + esc(x.code) + '</td>' +
          '<td style="padding:5px 8px;color:#8a9099;text-decoration:line-through">' + esc(x.fromEn) + '</td>' +
          '<td style="padding:5px 8px;font-weight:700">' + esc(x.toEn) + (x.over40 ? ' <span style="color:#c0392b;font-size:.7rem">ยาวเกิน</span>' : '') + '</td>' +
          '<td style="padding:5px 8px">' + esc(x.itemType || '-') + '</td>' +
          '<td style="padding:5px 8px;text-align:center">' + stB(x.status) + '</td></tr>';
      }).join('');
      h += '<div style="border:1px solid #e7eaee;border-radius:10px;margin-bottom:8px;overflow:hidden">' +
        '<div style="background:#f6f8fa;padding:8px 12px;font-weight:700;font-size:.83rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span>ชื่อสินค้า (บิลครัว / ปุ่ม POS) <span style="color:#2e934a">' + p.items.length + ' รายการ</span></span>' +
          (p.skipped ? '<span style="color:#8a9099;font-weight:400;font-size:.78rem">ถูกกรองออก ' + p.skipped + ' รายการ</span>' : '') +
          '<span style="flex:1"></span>' +
          '<button onclick="window.PC_Abbr.pickAll(true)" style="background:#fff;border:1.3px solid #cfd6dd;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer">เลือกทั้งหมด</button>' +
          '<button onclick="window.PC_Abbr.pickAll(false)" style="background:#fff;border:1.3px solid #cfd6dd;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer">ไม่เลือกเลย</button>' +
          '<span id="abrPickN" style="font-size:.78rem;color:#2e934a;font-weight:700"></span>' +
        '</div>' +
        '<div style="max-height:260px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
          '<thead style="position:sticky;top:0;background:#fff;box-shadow:0 1px 0 #eef1f4"><tr>' +
            '<th style="padding:6px 8px;width:34px"></th><th style="padding:6px 8px;text-align:left">รหัส</th>' +
            '<th style="padding:6px 8px;text-align:left">ชื่อเดิม</th><th style="padding:6px 8px;text-align:left">ชื่อใหม่</th>' +
            '<th style="padding:6px 8px;text-align:left">Type</th><th style="padding:6px 8px">Status</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }
    if (p.promoKitchen.length) h += grp('ชื่อครัวของปุ่มโปร', p.promoKitchen.length, p.promoKitchen.map(function (x) { return row(x.from, x.to); }).join(''));
    if (v.withShortName && p.promoShort.length) h += grp('ชื่อปุ่ม (Short Name)', p.promoShort.length, p.promoShort.map(function (x) { return row(x.from, x.to); }).join(''));
    box.innerHTML = h;
    countPicks();
  }
  function rdSubmit(allowMerge) {
    var v = vals(true);
    if (allowMerge) v.allowMerge = true;
    var res = window.PC_Abbr.reqSubmit(v);
    if (res && res.mergeable && window.Swal) {
      Swal.fire({
        icon: 'question', title: 'ยื่นเพิ่มเป็นชุดเดียวกัน?', text: res.message,
        showCancelButton: true, confirmButtonText: 'ยื่นเพิ่มเป็นชุดเดียวกัน', cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#1d7a4d'
      }).then(function (r) { if (r.isConfirmed) rdSubmit(true); });
      return;
    }
    if (window.Swal) Swal.fire({ icon: res.status === 'success' ? 'success' : 'error', title: res.status === 'success' ? 'ส่งคำขอแล้ว' : 'ไม่สำเร็จ', text: res.message, confirmButtonColor: '#2e934a' })
      .then(function () { if (res.status === 'success') { var m = document.getElementById('rdMain'); if (m) renderRD(m); } });
    else alert(res.message);
  }
  Object.assign(window.PC_Abbr, { renderRD: renderRD, rdPreview: rdPreview, rdSubmit: rdSubmit, pickAll: pickAll });
})();
