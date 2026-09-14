/* ============================================================================
 *  js/flavor-import.js — วางไฟล์ Excel ต้นฉบับ (New Item - xxx flavor) → กรอกฟอร์มผงให้เลย
 *  รองรับรูปแบบไฟล์ RD ที่ใช้จริง:
 *    Flavor Name  → ชื่อผงรสชาติ / Project
 *    Channels     → ช่องทางที่ขาย (Take-Away / Grab / Lineman / ShopeeFood / FoodPanda / Robinhood)
 *    ตารางผง      → Code(SS) · Product Category · ENG · Item Code · Description · Quantity · Unit · Spoon Size
 *  window.PC_FlavorImport.pick()  → เปิดตัวเลือกไฟล์
 *  window.PC_FlavorImport.parse(arrayBuffer) → { project, channels[], rows[] }
 * ========================================================================== */
(function () {
  'use strict';
  var CH_MAP = {
    'take-away': 'Take Away', 'takeaway': 'Take Away', 'take away': 'Take Away',
    'grab': 'Grab', 'lineman': 'Lineman', 'line man': 'Lineman',
    'shopeefood': 'ShopeeFood', 'shopee food': 'ShopeeFood',
    'foodpanda': 'foodpanda', 'food panda': 'foodpanda',
    'robinhood': 'Robinhood', 'gokoo': 'Gokoo', 'gookoo': 'Gokoo'
  };
  function S(v) { return String(v == null ? '' : v).trim(); }
  function isYes(v) { return /^(y|yes|true|1|✓)$/i.test(S(v)); }
  function norm(v) { return S(v).toLowerCase().replace(/\s+/g, ' '); }

  /* โหลดตัวอ่าน Excel เองครั้งเดียว (หน้า Flavor ไม่ได้โหลด xlsx ไว้) */
  function ensureXLSX() {
    if (typeof XLSX !== 'undefined') return Promise.resolve(true);
    if (window.__pcXlsxLoading) return window.__pcXlsxLoading;
    window.__pcXlsxLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = function () { res(true); };
      s.onerror = function () { rej(new Error('โหลดตัวอ่านไฟล์ Excel ไม่ได้ — ตรวจการเชื่อมต่ออินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
    return window.__pcXlsxLoading;
  }
  function parse(buf) {
    if (typeof XLSX === 'undefined') throw new Error('ตัวอ่านไฟล์ Excel ยังไม่โหลด');
    var wb = XLSX.read(buf, { type: 'array' });
    var out = { project: '', channels: [], rows: [], sheet: wb.SheetNames[0], warnings: [] };
    var grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

    /* 1) ชื่อผง — แถวที่มีคำว่า Flavor Name → เอาค่าถัดไปในแถวล่าง */
    for (var i = 0; i < grid.length; i++) {
      var row = grid[i];
      var hit = -1;
      for (var c = 0; c < row.length; c++) if (/flavor\s*name/i.test(S(row[c]))) { hit = c; break; }
      if (hit >= 0) {
        var below = grid[i + 1] || [];
        for (var c2 = hit; c2 < below.length; c2++) { if (S(below[c2])) { out.project = S(below[c2]); break; } }
        if (!out.project) for (var c3 = hit + 1; c3 < row.length; c3++) { if (S(row[c3]) && !/flavor\s*name/i.test(S(row[c3]))) { out.project = S(row[c3]); break; } }
        break;
      }
    }
    if (!out.project) out.project = S(out.sheet);

    /* 2) ช่องทางขาย — หัวแถว "Channels" แล้วอ่าน Yes/No แถวล่าง */
    for (var r2 = 0; r2 < grid.length; r2++) {
      if (!/channels?/i.test(S(grid[r2][0]))) continue;
      var head = grid[r2] || [], val = grid[r2 + 1] || [];
      for (var k = 1; k < head.length; k++) {
        var name = CH_MAP[norm(head[k])];
        if (name && isYes(val[k]) && out.channels.indexOf(name) < 0) out.channels.push(name);
      }
      break;
    }

    /* 3) ตารางผง — หาแถวหัวตารางที่มี Quantity + Unit */
    var hIdx = -1, col = {};
    for (var r3 = 0; r3 < grid.length; r3++) {
      var h = (grid[r3] || []).map(norm);
      if (h.indexOf('quantity') >= 0 && h.indexOf('unit') >= 0) {
        hIdx = r3;
        h.forEach(function (t, ci) {
          if (t === 'code' && col.ss == null) col.ss = ci;
          else if (/product\s*category/.test(t)) col.cat = ci;
          else if (t === 'cmpos code') col.cmpos = ci;
          else if (t === 'eng') col.eng = ci;
          else if (/item\s*code/.test(t)) col.item = ci;
          else if (/description/.test(t)) col.desc = ci;
          else if (t === 'quantity') col.qty = ci;
          else if (t === 'unit') col.unit = ci;
          else if (/spoon/.test(t)) col.spoon = ci;
        });
        break;
      }
    }
    if (hIdx < 0) { out.warnings.push('ไม่พบตารางผงในไฟล์ (ต้องมีคอลัมน์ Quantity และ Unit)'); return out; }

    for (var r4 = hIdx + 1; r4 < grid.length; r4++) {
      var g = grid[r4] || [];
      var ss = S(g[col.ss]), eng = S(g[col.eng]);
      if (!/^SS\d{3,5}$/i.test(ss) && !eng) continue;
      if (!/^SS\d{3,5}$/i.test(ss)) { out.warnings.push('แถว ' + (r4 + 1) + ': ไม่มีรหัส Subset (SSxxxx) — ข้ามไป'); continue; }
      out.rows.push({
        targetSS: ss.toUpperCase(), category: S(g[col.cat]),
        cmposFile: S(g[col.cmpos]), eng: eng, code: S(g[col.item]), desc: S(g[col.desc]),
        qty: S(g[col.qty]), unit: S(g[col.unit]) || 'g', spoon: S(g[col.spoon])
      });
    }
    if (!out.rows.length) out.warnings.push('อ่านไฟล์ได้ แต่ไม่พบรายการผงที่มีรหัส Subset');

    /* ---- ตรวจข้อมูลซ้ำ (กันกรอกเข้าระบบซ้ำ) ---- */
    out.dupInFile = [];
    var seenSS = {};
    out.rows.forEach(function (x, i) {
      var k = x.targetSS.toUpperCase();
      if (seenSS[k] != null) out.dupInFile.push({ ss: x.targetSS, eng: x.eng, firstAt: seenSS[k] + 1, at: i + 1 });
      else seenSS[k] = i;
    });
    if (out.dupInFile.length) out.warnings.push('⛔ ในไฟล์มีรหัส Subset ซ้ำ ' + out.dupInFile.length + ' รายการ: ' +
      out.dupInFile.map(function (d) { return d.ss + ' (แถว ' + d.firstAt + ' และ ' + d.at + ')'; }).join(' · ') + ' — ต้องแก้ไฟล์ก่อน');

    /* ซ้ำกับเอกสารที่เคยส่งเข้าระบบแล้ว */
    out.dupSubmitted = [];
    try {
      var st = JSON.parse(localStorage.getItem('pc_mock_store_v28') || '{}');
      var mine = String(out.project || '').trim().toLowerCase();
      (st.flavor || []).forEach(function (f) {
        var sameName = String(f.project || '').trim().toLowerCase() === mine && mine;
        var ssList = {}; (f.groups || []).forEach(function (g) { if (g.ssCode) ssList[String(g.ssCode).toUpperCase()] = 1; });
        var overlap = out.rows.filter(function (x) { return ssList[x.targetSS.toUpperCase()]; }).map(function (x) { return x.targetSS; });
        if (sameName || overlap.length) out.dupSubmitted.push({ id: f.id, project: f.project, sameName: !!sameName, overlap: overlap });
      });
    } catch (e) {}
    out.dupSubmitted.forEach(function (d) {
      out.warnings.push('⚠️ เคยส่งเข้าระบบแล้ว: <b>' + d.id + '</b> (' + d.project + ')' +
        (d.sameName ? ' — <b>ชื่อผงเดียวกัน</b>' : '') +
        (d.overlap.length ? ' — Subset ซ้ำ ' + d.overlap.length + ' ตัว: ' + d.overlap.slice(0, 8).join(' · ') + (d.overlap.length > 8 ? ' …' : '') : ''));
    });
    return out;
  }

  /* เปิดตัวเลือกไฟล์ → parse → ให้ผู้ใช้ยืนยันก่อนเติมลงฟอร์ม */
  function pick(onApply) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function (e) {
        var raw = new Uint8Array(e.target.result);
        if (window.Swal) Swal.fire({ title: 'กำลังอ่านไฟล์…', allowOutsideClick: false, didOpen: function () { Swal.showLoading(); } });
        ensureXLSX().then(function () {
          var d;
          try { d = parse(raw); }
          catch (err) { if (window.Swal) Swal.fire('อ่านไฟล์ไม่ได้', String(err.message || err), 'error'); return; }
          preview(d, f.name, onApply);
        }).catch(function (err) {
          if (window.Swal) Swal.fire('อ่านไฟล์ไม่ได้', String(err.message || err), 'error');
        });
      };
      rd.readAsArrayBuffer(f);
    };
    inp.click();
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function preview(d, fileName, onApply) {
    if (!window.Swal) { if (onApply) onApply(d); return; }
    var known = (window.PC_SUBSET_MASTER || []).reduce(function (m, s) { m[s.ssCode] = s.name; return m; }, {});
    var rows = d.rows.map(function (x, i) {
      var ok = !!known[x.targetSS];
      return '<tr>' +
        '<td style="padding:4px 7px;text-align:center">' + (i + 1) + '</td>' +
        '<td style="padding:4px 7px;font-family:JetBrains Mono,monospace">' + esc(x.targetSS) +
          (ok ? '' : ' <span style="color:#c0392b;font-size:.7rem">ไม่พบในระบบ</span>') + '</td>' +
        '<td style="padding:4px 7px">' + esc(known[x.targetSS] || x.category || '-') + '</td>' +
        '<td style="padding:4px 7px">' + esc(x.eng) + '</td>' +
        '<td style="padding:4px 7px;text-align:right">' + esc(x.qty) + '</td>' +
        '<td style="padding:4px 7px">' + esc(x.unit) + '</td>' +
        '<td style="padding:4px 7px">' + esc(x.spoon) + '</td></tr>';
    }).join('');
    var bad = d.rows.filter(function (x) { return !known[x.targetSS]; }).length;
    var hardBlock = (d.dupInFile || []).length > 0;          /* ซ้ำในไฟล์เอง = ห้ามกรอก */
    var softBlock = (d.dupSubmitted || []).length > 0;       /* ซ้ำกับที่ส่งแล้ว = ต้องติ๊กยืนยัน */
    var dupBox = hardBlock
      ? '<div style="padding:11px 13px;border-radius:9px;background:#fdecec;border:1.5px solid #c0392b;font-size:.85rem;margin-bottom:10px">' +
        '<b style="color:#c0392b"><i class="fas fa-ban me-1"></i>ไฟล์นี้มีรหัส Subset ซ้ำกันเอง — กรอกเข้าระบบไม่ได้</b>' +
        '<div class="mt-1">' + d.dupInFile.map(function (x) { return '• ' + esc(x.ss) + ' ซ้ำ (แถว ' + x.firstAt + ' และ ' + x.at + ') — ' + esc(x.eng); }).join('<br>') + '</div>' +
        '<div class="mt-1" style="color:#8a5a00">แก้ไฟล์ให้เหลือ Subset ละ 1 บรรทัด แล้ววางใหม่</div></div>'
      : (softBlock
        ? '<div style="padding:11px 13px;border-radius:9px;background:#fff4e5;border:1.5px solid #e0a800;font-size:.85rem;margin-bottom:10px">' +
          '<b style="color:#8a5a00"><i class="fas fa-triangle-exclamation me-1"></i>ข้อมูลนี้เคยส่งเข้าระบบแล้ว</b>' +
          '<div class="mt-1">' + d.dupSubmitted.map(function (x) {
            return '• <b>' + esc(x.id) + '</b> (' + esc(x.project) + ')' + (x.sameName ? ' — ชื่อผงเดียวกัน' : '') +
              (x.overlap.length ? ' — Subset ซ้ำ ' + x.overlap.length + ' ตัว' : '');
          }).join('<br>') + '</div>' +
          '<label style="display:flex;gap:8px;align-items:center;margin-top:9px;cursor:pointer;font-weight:700">' +
          '<input type="checkbox" id="abrDupOk"> ยืนยันว่าต้องการกรอกซ้ำ (จะเป็นเอกสารใบใหม่)</label></div>'
        : '');
    Swal.fire({
      title: 'ตรวจข้อมูลจากไฟล์ก่อนกรอกลงฟอร์ม', width: 860,
      html: '<div class="text-start">' +
        '<div class="small text-muted mb-2"><i class="fas fa-file-excel me-1" style="color:#1d7a4d"></i>' + esc(fileName) + ' · ชีต <b>' + esc(d.sheet) + '</b></div>' +
        '<div class="mb-2"><b>ชื่อผงรสชาติ:</b> ' + esc(d.project || '(ไม่พบ)') + '<br>' +
        '<b>ช่องทางขาย:</b> ' + (d.channels.length ? esc(d.channels.join(' · ')) : '<span style="color:#8a5a00">ไม่พบในไฟล์ — ใช้ค่าเริ่มต้นของฟอร์ม</span>') + '<br>' +
        '<b>จำนวนผง:</b> ' + d.rows.length + ' ตัว' + (bad ? ' <span style="color:#c0392b">(รหัส Subset ไม่พบในระบบ ' + bad + ' ตัว)</span>' : '') + '</div>' +
        dupBox +
        (function () {
          var w = (d.warnings || []).filter(function (x) { return !/^⛔|^⚠️ เคยส่ง/.test(x); });
          return w.length ? '<div style="padding:9px 12px;border-radius:9px;background:#fff4e5;border:1px solid #e0a800;font-size:.82rem;margin-bottom:10px">' + w.map(esc).join('<br>') + '</div>' : '';
        })() +
        (d.rows.length ? '<div style="max-height:280px;overflow:auto;border:1px solid #e7eaee;border-radius:9px"><table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
          '<thead style="position:sticky;top:0;background:#f6f8fa"><tr>' +
          '<th style="padding:6px 7px">No</th><th style="padding:6px 7px;text-align:left">Subset</th><th style="padding:6px 7px;text-align:left">ชื่อชุด</th>' +
          '<th style="padding:6px 7px;text-align:left">Name (EN)</th><th style="padding:6px 7px">ปริมาณ</th><th style="padding:6px 7px;text-align:left">หน่วย</th><th style="padding:6px 7px;text-align:left">ช้อน</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
        '</div>',
      showCancelButton: true,
      confirmButtonText: hardBlock ? 'แก้ไฟล์ก่อน' : '<i class="fas fa-wand-magic-sparkles me-1"></i>กรอกลงฟอร์ม',
      confirmButtonColor: hardBlock ? '#c0392b' : '#2e934a', cancelButtonText: 'ยกเลิก',
      didOpen: function () {
        if (hardBlock) { var b = Swal.getConfirmButton(); if (b) b.disabled = true; return; }
        if (!softBlock) return;
        var b = Swal.getConfirmButton(); if (b) b.disabled = true;
        var cb = document.getElementById('abrDupOk');
        if (cb) cb.addEventListener('change', function () { if (b) b.disabled = !cb.checked; });
      }
    }).then(function (r) { if (r.isConfirmed && !hardBlock && onApply) onApply(d); });
  }

  window.PC_FlavorImport = { pick: pick, parse: parse, preview: preview, ensureXLSX: ensureXLSX };
  /* อุ่นเครื่องตัวอ่านไฟล์ล่วงหน้าเบา ๆ เมื่อเปิดหน้าที่มีปุ่มนี้ */
  try { setTimeout(function () { if (document.querySelector('[onclick*="importExcel"]')) ensureXLSX().catch(function () {}); }, 1200); } catch (e) {}
})();
