/* ===== FX-P90 — บีบอัดรายการโค้ดของใบแจ้งเพิ่มโค้ด (pc_code_requests) =====
   ปัญหา: ใบโค้ดจำนวนมาก (Lazada 5,000-6,000 · Voucher 9,710) เก็บเป็นสตริงเรียงตัว
   → คีย์เดียว 1.1MB · localStorage เครื่องละ 5MB เต็ม 84% → เครื่องที่พื้นที่ไม่พอ
     "เขียนคีย์ลงไม่ได้" = เปิดหน้าแล้วข้อมูลไม่ขึ้น (หน้าโล่ง)
   วิธี: โค้ดที่เป็น "คำนำหน้า + เลขวิ่ง" (27818DBA0001…27818DBA5000) เก็บเป็นช่วงเดียว
         codeSeq = [[prefix, from, to, padLen], …] แทนที่จะเก็บทุกตัว
   สำคัญ: ข้อมูลไม่หาย — unpack() คืนรายการเดิมครบทุกตัว ทุกที่ที่อ่านผ่าน helper นี้
   โค้ดสุ่ม (Comp/E-Coupon) บีบไม่ได้ = เก็บเหมือนเดิม */
(function () {
  'use strict';
  var KEY = 'pc_code_requests';
  var MIN_RUN = 20;          // ช่วงสั้นกว่านี้ไม่คุ้มบีบ

  function cCode(c) { return (c && typeof c === 'object') ? (c.code || '') : (c == null ? '' : c); }

  /* แยกโค้ดเป็น คำนำหน้า + เลขท้าย (คงจำนวนหลัก) */
  function split(code) {
    var m = /^(.*?)(\d+)$/.exec(String(code));
    if (!m) return null;
    return { p: m[1], n: parseInt(m[2], 10), pad: m[2].length };
  }
  function make(p, n, pad) { var s = String(n); while (s.length < pad) s = '0' + s; return p + s; }

  /* pack: หาช่วงเลขวิ่งต่อเนื่องที่ยาวพอ → เก็บเป็น seq · ที่เหลือคงเป็น codes */
  function pack(req) {
    if (!req || req.codeSeq) return req;
    var list = req.codes || [];
    if (list.length < MIN_RUN) return req;
    if (list.some(function (c) { return c && typeof c === 'object'; })) return req;  // object (บัตร/comp) ไม่แตะ
    var runs = [], rest = [], i = 0;
    while (i < list.length) {
      var a = split(list[i]);
      if (!a) { rest.push(list[i]); i++; continue; }
      var j = i + 1;
      while (j < list.length) {
        var b = split(list[j]);
        if (!b || b.p !== a.p || b.pad !== a.pad || b.n !== a.n + (j - i)) break;
        j++;
      }
      var len = j - i;
      if (len >= MIN_RUN) { runs.push([a.p, a.n, a.n + len - 1, a.pad]); i = j; }
      else { rest.push(list[i]); i++; }
    }
    if (!runs.length) return req;
    req.codeSeq = runs;
    req.codes = rest;
    return req;
  }

  /* unpack: คืนรายการโค้ดครบทุกตัว (เรียงตามเดิม: ช่วงก่อน แล้วต่อด้วยตัวที่บีบไม่ได้) */
  function unpack(req) {
    if (!req || !req.codeSeq) return req;
    var out = [];
    (req.codeSeq || []).forEach(function (r) {
      for (var n = r[1]; n <= r[2]; n++) out.push(make(r[0], n, r[3]));
    });
    req.codes = out.concat(req.codes || []);
    delete req.codeSeq;
    return req;
  }

  function loadReqs() {
    var a; try { a = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { a = []; }
    a.forEach(unpack);
    return a;
  }
  function saveReqs(list) {
    var copy = JSON.parse(JSON.stringify(list || []));
    copy.forEach(pack);
    try { localStorage.setItem(KEY, JSON.stringify(copy)); return true; } catch (e) { return false; }
  }
  /* บีบของที่มีอยู่ตอนนี้ทีเดียว (เรียกตอนบูต) — คืนจำนวน KB ที่ประหยัดได้ */
  function compactNow() {
    var raw = localStorage.getItem(KEY); if (!raw) return 0;
    var before = raw.length;
    var list; try { list = JSON.parse(raw) || []; } catch (e) { return 0; }
    list.forEach(unpack);            // เผื่อบางใบบีบแล้ว → คลายก่อนเพื่อบีบใหม่ให้ครบ
    list.forEach(pack);
    var out = JSON.stringify(list);
    if (out.length >= before) return 0;
    try { localStorage.setItem(KEY, out); } catch (e) { return 0; }
    return Math.round((before - out.length) / 1024);
  }

  window.PC_CodePack = { pack: pack, unpack: unpack, loadReqs: loadReqs, saveReqs: saveReqs, compactNow: compactNow, cCode: cCode, KEY: KEY };

  /* บีบอัตโนมัติตอนโหลดหน้า (เงียบ ๆ) */
  try {
    var freed = compactNow();
    if (freed > 20) {
      console.log('[code-pack] บีบรายการโค้ดประหยัด ' + freed + 'KB');
      if (window.PC_CLOUD && PC_CLOUD.queuePush) PC_CLOUD.queuePush(KEY);
    }
  } catch (e) {}
})();
