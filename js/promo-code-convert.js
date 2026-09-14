/* ============================================================================
 *  promo-code-convert.js — แปลง "ไฟล์ mapping code" ที่แนบจากฟอร์มแจ้งโปร
 *  (Coupon / Bill Discount / Voucher · ประเภท Online) ให้ครบวง:
 *    1) ingestFromInput()  — อ่านไฟล์ที่แนบ → แกะโค้ดรายตัว → ลงทะเบียนเข้า
 *                            pc_code_requests (status PENDING) ตอน MKT ส่งฟอร์ม
 *    2) downloadBackoffice()— ออกไฟล์ .xlsx รูปแบบ Backoffice (ProID/ProStatus/
 *                            ProExpire) ให้ IT ดาวน์โหลดที่หน้า IT Settlement
 *    3) confirmForCampaign()— ตอน IT กดบันทึกปิดงาน → โค้ดเป็น CONFIRMED →
 *                            สาขาค้นเจอที่หน้า Branch View (bvCodeSearch)
 *  ProStatus: Voucher/E-Coupon = "HS" · Item coupon / Bill discount = "Normal"
 *  เก็บโค้ดเป็น string ล้วน (กระชับ) เข้ากันได้กับ js/code-mgmt.js (cCode/cRedeem)
 *  โหลดใน shell CORE ต่อจาก form-subset.js
 * ========================================================================== */
(function () {
  'use strict';
  var REQ_KEY = 'pc_code_requests';
  var CODE_RE = /^[A-Za-z0-9._\-]{3,40}$/;
  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  /* ---- lazy-load SheetJS (ฟอร์มพวกนี้ไม่ได้โหลด XLSX ไว้) ---- */
  var _xlsxP = null;
  function ensureXLSX() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (_xlsxP) return _xlsxP;
    _xlsxP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = XLSX_SRC;
      s.onload = function () { res(); };
      s.onerror = function () { _xlsxP = null; rej(new Error('โหลดตัวแปลงไฟล์ (XLSX) ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
    return _xlsxP;
  }

  function readArrayBuffer(file) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function (e) { res(e.target.result); };
      rd.onerror = function () { rej(new Error('อ่านไฟล์ไม่สำเร็จ')); };
      rd.readAsArrayBuffer(file);
    });
  }

  /* ---- แกะโค้ดจากคอลัมน์แรกของไฟล์ (.xlsx/.xls/.csv/.txt) ---- */
  function rawFromBuffer(buf, fileName) {
    var raw = [];
    var name = String(fileName || '').toLowerCase();
    if (/\.(csv|txt)$/.test(name)) {
      var text = new TextDecoder().decode(new Uint8Array(buf));
      text.split(/\r?\n/).forEach(function (line) {
        var cell = line.split(/[,;\t]/)[0];
        if (cell != null) raw.push(String(cell).trim());
      });
    } else {
      var wb = XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      rows.forEach(function (r) { if (r && r.length) raw.push(String(r[0]).trim()); });
    }
    return raw;
  }

  /* ---- ตัด header / ซ้ำ / format ผิด ---- */
  function classify(raw) {
    var seen = {}, codes = [], dup = 0, invalid = 0;
    raw.forEach(function (c, i) {
      if (!c) return;
      if (i === 0 && /^(code|pro\s*id|proid|mapping|รหัส|coupon|barcode|voucher)$/i.test(c)) return; // header
      var up = c.toUpperCase();
      if (!CODE_RE.test(c)) { invalid++; return; }
      if (seen[up]) { dup++; return; }
      seen[up] = 1; codes.push(c);
    });
    return { codes: codes, dup: dup, invalid: invalid };
  }

  /* ---- storage (เข้ากันได้กับ code-mgmt.js — โค้ดเก็บเป็น string ล้วน) ---- */
  /* ---- storage (เข้ากันได้กับ code-mgmt.js — โค้ดเก็บเป็น string ล้วน)
         FX-P90: ผ่านตัวบีบอัด (js/code-pack.js) ถ้ามี ---- */
  function loadReqs() { if (window.PC_CodePack) return PC_CodePack.loadReqs();
    try { return JSON.parse(localStorage.getItem(REQ_KEY)) || []; } catch (e) { return []; } }
  function saveReqs(a) { if (window.PC_CodePack) return PC_CodePack.saveReqs(a);
    try { localStorage.setItem(REQ_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function nextId(all) {
    var m = 1000;
    all.forEach(function (r) { var k = parseInt(String(r.id || '').replace(/\D/g, '')); if (k > m) m = k; });
    return 'CR-' + (m + 1);
  }
  function cCode(c) { return (c && typeof c === 'object') ? (c.code || '') : (c || ''); }

  var KIND_LABEL = { bill: 'Bill discount online', coupon: 'Item coupon online', voucher: 'Voucher online' };
  var KIND_STATUS = { bill: 'Normal', coupon: 'Normal', voucher: 'HS' };

  /* ---- ลงทะเบียนโค้ดเข้า pc_code_requests (PENDING) — 1 request ต่อปุ่ม ---- */
  function registerCodes(codes, opts) {
    opts = opts || {};
    if (!codes || !codes.length) return null;
    var kindShort = opts.kindShort || '';
    var all = loadReqs();
    // กันซ้ำ: ถ้าเคยลงทะเบียนจากฟอร์มของปุ่มนี้แล้ว → แทนที่ (กรณีแก้/ส่งใหม่)
    all = all.filter(function (r) {
      return !(r.fromProposal && r.campaign === opts.campaign && r.button === opts.button && r.kindShort === kindShort);
    });
    var req = {
      id: nextId(all), type: 'ADD', kind: opts.kind || KIND_LABEL[kindShort] || '', kindShort: kindShort,
      proStatus: opts.proStatus || KIND_STATUS[kindShort] || 'Normal',
      campaign: opts.campaign || '', button: opts.button || '', promoCode: opts.promoCode || '',
      start: opts.start || '', end: opts.end || '', proExpire: opts.end || '',
      codes: codes.slice(), count: codes.length,
      reporter: opts.reporter || 'MKT · ฟอร์มแจ้งโปร', status: 'PENDING', itStatus: 'PENDING',
      createdAt: Date.now(), fromProposal: true
    };
    all.unshift(req);
    if (!saveReqs(all)) return { error: 'quota', count: codes.length };
    return req;
  }

  /* ---- โค้ดที่มีอยู่แล้วในระบบ (กันซ้ำข้ามโปร/บัตร) — ไม่รวมของปุ่มตัวเอง (จะถูกแทนที่) ---- */
  function existingCodeSet(opts) {
    opts = opts || {}; var set = {};
    function addc(c) { c = String(c == null ? '' : (c && c.code != null ? c.code : c)).trim().toUpperCase(); if (c) set[c] = 1; }
    loadReqs().forEach(function (r) {
      if (r.fromProposal && r.campaign === opts.campaign && r.button === opts.button && r.kindShort === (opts.kindShort || '')) return;
      (r.codes || []).forEach(addc);
    });
    try { var mc = JSON.parse(localStorage.getItem('pc_member_coupons') || '{}') || {}; Object.keys(mc).forEach(function (k) { (mc[k] || []).forEach(function (x) { addc(x && x.code); }); }); } catch (e) {}
    try { var sd = JSON.parse(localStorage.getItem('pc_staff_discounts') || '[]') || []; sd.forEach(function (x) { addc(x && (x.code || x.typeCode)); }); } catch (e) {}
    return set;
  }

  /* ---- อ่านไฟล์จาก <input type=file> → แกะ + กันซ้ำ (ในไฟล์ + ข้ามระบบ) + ลงทะเบียน ---- */
  function ingestFromInput(fileInput, opts) {
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return Promise.resolve(null);
    return ensureXLSX()
      .then(function () { return readArrayBuffer(file); })
      .then(function (buf) {
        var r = classify(rawFromBuffer(buf, file.name));
        if (!r.codes.length) return { codes: 0, dup: r.dup, invalid: r.invalid, dupSystem: 0 };
        var exist = existingCodeSet(opts);
        var fresh = [], dupSys = [];
        r.codes.forEach(function (c) { if (exist[String(c).trim().toUpperCase()]) dupSys.push(c); else fresh.push(c); });
        var reg = fresh.length ? registerCodes(fresh, opts) : null;
        if (dupSys.length && window.Swal) {
          Swal.fire({ toast: true, position: 'top-end', timer: 7000, showConfirmButton: false, icon: 'warning',
            title: 'ข้ามโค้ดซ้ำ ' + dupSys.length + ' รหัส', text: 'ซ้ำกับโปร/บัตรอื่นในระบบ — ไม่ลงทะเบียนซ้ำ (' + dupSys.slice(0, 5).map(function (x) { return String(x); }).join(', ') + (dupSys.length > 5 ? ' …' : '') + ')' });
        }
        return { codes: fresh.length, dup: r.dup, invalid: r.invalid, dupSystem: dupSys.length, dupSystemCodes: dupSys.slice(0, 20), req: reg };
      });
  }

  /* ---- requests ที่ผูกกับแคมเปญ (มาจากฟอร์ม) ---- */
  function requestsForCampaign(campaign) {
    campaign = String(campaign || '').trim();
    return loadReqs().filter(function (r) { return r.fromProposal && String(r.campaign || '').trim() === campaign; });
  }
  function codeCountForCampaign(campaign) {
    return requestsForCampaign(campaign).reduce(function (n, r) { return n + (r.count || (r.codes || []).length); }, 0);
  }

  /* ---- ดาวน์โหลดไฟล์ Backoffice (ProID/ProStatus/ProExpire) ของทั้งแคมเปญ ---- */
  function downloadBackofficeForCampaign(campaign) {
    var reqs = requestsForCampaign(campaign);
    if (!reqs.length) return Promise.reject(new Error('ไม่พบโค้ดที่แนบมากับแคมเปญนี้'));
    return ensureXLSX().then(function () {
      var aoa = [['ProID', 'ProStatus', 'ProExpire']];
      reqs.forEach(function (r) {
        var status = r.proStatus || (r.kindShort === 'voucher' ? 'HS' : 'Normal');
        var expire = r.proExpire || r.end || '';
        (r.codes || []).forEach(function (c) { aoa.push([cCode(c), status, expire]); });
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 14 }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Import_ID');
      var base = String(campaign || 'promo').replace(/[^\w\u0E00-\u0E7F\-]+/g, '_');
      XLSX.writeFile(wb, base + '_Backoffice_' + (aoa.length - 1) + '.xlsx');
      return aoa.length - 1;
    });
  }

  /* ---- requests ที่ผูกกับปุ่ม (campaign + button/shortName) ---- */
  function requestsForButton(campaign, button) {
    campaign = String(campaign || '').trim(); button = String(button || '').trim();
    return loadReqs().filter(function (r) {
      return r.fromProposal && String(r.campaign || '').trim() === campaign && String(r.button || '').trim() === button;
    });
  }
  function codeCountForButton(campaign, button) {
    return requestsForButton(campaign, button).reduce(function (n, r) { return n + (r.count || (r.codes || []).length); }, 0);
  }
  function sanitizeName(s) { return String(s || '').replace(/[^\w\u0E00-\u0E7F\-]+/g, '_').replace(/^_+|_+$/g, ''); }
  function buildBackofficeSheet(reqs) {
    /* FX-P91 — ตรงกับไฟล์จริงของ Backoffice: ชีต Import_ID · ProID = โค้ด · ProStatus (Voucher/E-Coupon = HS) · ProExpire = วันที่สิ้นสุด */
    var aoa = [['ProID', 'ProStatus', 'ProExpire']];
    reqs.forEach(function (r) {
      var status = r.proStatus || (r.kindShort === 'voucher' ? 'HS' : 'Normal');
      var expire = r.proExpire || r.end || '';
      (r.codes || []).forEach(function (c) { aoa.push([cCode(c), status, expire]); });
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 14 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import_ID');
    return { wb: wb, count: aoa.length - 1 };
  }
  /* ---- ตั้งชื่อไฟล์ตาม "codePromo_ชื่อปุ่ม" (ตกลงกับ user) ---- */
  function backofficeFileName(promoCode, button, campaign, count) {
    var parts = [];
    if (promoCode) parts.push(sanitizeName(promoCode));
    if (button) parts.push(sanitizeName(button));
    if (!parts.length) parts.push(sanitizeName(campaign) || 'promo');
    return parts.join('_') + '.xlsx';
  }
  /* ---- ดาวน์โหลด Backoffice ของ "ปุ่มเดียว" (1 campaign มีหลายปุ่มได้) ---- */
  function downloadBackofficeForButton(campaign, button, opts) {
    opts = opts || {};
    var reqs = requestsForButton(campaign, button);
    if (!reqs.length) return Promise.reject(new Error('ไม่พบโค้ดที่แนบมากับปุ่มนี้'));
    return ensureXLSX().then(function () {
      var built = buildBackofficeSheet(reqs);
      var promoCode = opts.promoCode || reqs.map(function (r) { return r.promoCode; }).filter(Boolean)[0] || '';
      XLSX.writeFile(built.wb, backofficeFileName(promoCode, button, campaign, built.count));
      return built.count;
    });
  }
  /* ---- ดาวน์โหลดครบทั้งแคมเปญ แต่แยกไฟล์ "รายปุ่ม" (ชื่อไฟล์ = codePromo_ชื่อปุ่ม) ---- */
  function downloadAllBackofficeForCampaign(campaign, codeMap) {
    codeMap = codeMap || {};
    var reqs = requestsForCampaign(campaign);
    if (!reqs.length) return Promise.reject(new Error('ไม่พบโค้ดที่แนบมากับแคมเปญนี้'));
    return ensureXLSX().then(function () {
      var byBtn = {};
      reqs.forEach(function (r) { var b = String(r.button || '').trim() || '(ปุ่ม)'; (byBtn[b] = byBtn[b] || []).push(r); });
      var total = 0;
      Object.keys(byBtn).forEach(function (b) {
        var rs = byBtn[b];
        var built = buildBackofficeSheet(rs);
        var promoCode = codeMap[b] || rs.map(function (r) { return r.promoCode; }).filter(Boolean)[0] || '';
        XLSX.writeFile(built.wb, backofficeFileName(promoCode, b, campaign, built.count));
        total += built.count;
      });
      return total;
    });
  }

  /* ---- IT บันทึกปิดงาน → โค้ด CONFIRMED → สาขาค้นเจอ ---- */
  function confirmForCampaign(campaign) {
    campaign = String(campaign || '').trim();
    var all = loadReqs(), n = 0;
    all.forEach(function (r) {
      if (r.fromProposal && String(r.campaign || '').trim() === campaign && r.status !== 'CONFIRMED') {
        r.status = 'CONFIRMED'; r.itStatus = 'DONE'; r.confirmedAt = Date.now(); n++;
      }
    });
    if (n) saveReqs(all);
    return n;
  }

  window.PC_CodeConvert = {
    ensureXLSX: ensureXLSX,
    classify: classify,
    ingestFromInput: ingestFromInput,
    registerCodes: registerCodes,
    requestsForCampaign: requestsForCampaign,
    codeCountForCampaign: codeCountForCampaign,
    requestsForButton: requestsForButton,
    codeCountForButton: codeCountForButton,
    downloadBackofficeForCampaign: downloadBackofficeForCampaign,
    downloadBackofficeForButton: downloadBackofficeForButton,
    downloadAllBackofficeForCampaign: downloadAllBackofficeForCampaign,
    confirmForCampaign: confirmForCampaign,
    KIND_STATUS: KIND_STATUS
  };
})();
