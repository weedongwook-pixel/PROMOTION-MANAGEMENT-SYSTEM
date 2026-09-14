/* ============================================================================
   PROMO IMPORT/TEMPLATE — Potato Corner
   เครื่องมือกลางสำหรับหน้ากรอกโปรโมชั่นทั้ง 4 แบบ:
     - proposal      (Item Set / combo)
     - coupon        (Item coupon)
     - voucher       (Voucher)
     - billdiscount  (Bill discount)
   ให้ปุ่ม 2 ปุ่มต่อหน้า: "ดาวน์โหลด Template" + "Import จาก Excel"
   Template = ไฟล์ .xlsx แบบแบน (1 บรรทัด/สินค้า) + ชีตคำอธิบายช่อง
   Import   = อ่านไฟล์ แล้วเติมฟอร์มผ่านฟังก์ชัน add* เดิมของแต่ละหน้า
   ใช้ XLSX (โหลด CDN อัตโนมัติเมื่อต้องใช้)
============================================================================ */
(function () {
  'use strict';
  if (window.PromoIO) return;

  var XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  function ensureXLSX() {
    return new Promise(function (resolve, reject) {
      if (window.XLSX) return resolve(window.XLSX);
      var ex = document.querySelector('script[data-pcxlsx]');
      if (ex) { ex.addEventListener('load', function () { resolve(window.XLSX); }); return; }
      var s = document.createElement('script');
      s.src = XLSX_CDN; s.setAttribute('data-pcxlsx', '1');
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { reject(new Error('โหลดตัวอ่าน Excel ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- helpers ---------- */
  function S(v) { return v == null ? '' : String(v).trim(); }
  function fire(setVal, el) { /* trigger input/change so listeners run */
    try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
  }
  function setField(el, val) { if (!el) return; el.value = val; fire(val, el); }
  // Excel serial date → YYYY-MM-DD (handles already-formatted text too)
  function toISODate(v) {
    if (v == null || v === '') return '';
    var s = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) { var p = s.split(/[^\d]/); return p[0] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[2]).slice(-2); }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) { var q = s.split('/'); var y = q[2].length === 2 ? '20' + q[2] : q[2]; return y + '-' + ('0' + q[1]).slice(-2) + '-' + ('0' + q[0]).slice(-2); }
    var n = parseFloat(s);
    if (!isNaN(n) && n > 20000 && n < 80000) {
      var d = new Date(Math.round((n - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    return s;
  }
  function normMode(v) {
    var u = S(v).toUpperCase().replace(/\s+/g, ' ');
    var map = { 'ALL CHANNEL': 'All Channel', 'ALL DELIVERY': 'All Delivery', 'TAKE AWAY': 'Take Away', 'TAKEAWAY': 'Take Away',
      'GRAB': 'GRAB', 'LINEMAN': 'LINEMAN', 'SHOPEEFOOD': 'ShopeeFood', 'SHOPEE FOOD': 'ShopeeFood', 'SHOPEE': 'ShopeeFood',
      'ROBINHOOD': 'Robinhood', 'GOKOO': 'Gokoo' };
    return map[u] || v;
  }
  function unitTok(v) { var u = S(v).toUpperCase(); if (u === '%' || u === 'PCT' || u === 'PERCENT') return 'PCT'; return 'CUR'; }

  function lastEl(sel, root) { var ns = (root || document).querySelectorAll(sel); return ns.length ? ns[ns.length - 1] : null; }
  function buttonsIn(card) { return card.querySelectorAll('.pos-button-block'); }
  function rowsIn(btn) { return btn.querySelectorAll('.item-body tr'); }

  // set sale-mode checkboxes inside a campaign card by matching value
  function setSaleMode(card, modeStr) {
    var wanted = S(modeStr).split(/[,/|]/).map(function (x) { return normMode(x).toUpperCase(); }).filter(Boolean);
    if (!wanted.length) return;
    card.querySelectorAll('.mode-check, .mode-check-all, .mode-check-delivery').forEach(function (cb) {
      var v = S(cb.value).toUpperCase();
      cb.checked = wanted.indexOf(v) !== -1;
    });
  }

  // set store hidden value + visible chip; default ALL
  function setStore(card, branchStr) {
    var hidden = card.querySelector('.camp-store');
    var val = S(branchStr) || 'ALL';
    if (hidden) { hidden.value = val; }
    var tagBox = card.querySelector('[id^="tag-container-"]');
    if (tagBox) {
      // keep the manual input, drop old chips, add a summary chip
      tagBox.querySelectorAll('.pc-imp-chip').forEach(function (c) { c.remove(); });
      var chip = document.createElement('span');
      chip.className = 'pc-imp-chip badge bg-success';
      chip.style.cssText = 'font-weight:600';
      chip.innerHTML = '<i class="fas fa-store me-1"></i>' + (val.toUpperCase() === 'ALL' ? 'ทุกสาขา (ALL)' : val);
      tagBox.insertBefore(chip, tagBox.firstChild);
    }
  }

  function findItem(code, name) {
    var md = window.masterData || [];
    code = S(code); name = S(name);
    return md.find(function (d) { return code && String(d.itemCode) === code; })
        || md.find(function (d) { return name && d.itemNameEN === name; }) || null;
  }

  // fill one product row (Proposal/Coupon/Voucher share row-search-input/.row-search + handleFill)
  function fillItemRow(row, btnId, campId, item, qty, opOverride) {
    var search = row.querySelector('.row-search-input') || row.querySelector('.row-search');
    var name = item ? item.itemNameEN : '';
    if (search) {
      search.value = name;
      try {
        if (typeof window.handleFill === 'function') window.handleFill(row.id, name, btnId, campId);
        else fire(name, search);
      } catch (e) {}
    }
    var qEl = row.querySelector('.row-qty'); if (qEl) setField(qEl, qty || 1);
    if (opOverride != null && opOverride !== '') { var op = row.querySelector('.row-op'); if (op) setField(op, opOverride); }
  }

  /* ====================================================================
     TYPE CONFIGS
     each: { label, file, cols:[...], example:[[...]], notes:[[field,desc]],
             group key uses Campaign + button name; fill(rows) builds form }
  ==================================================================== */
  var TYPES = {
    proposal: {
      label: 'Promotion (Item Set)',
      file: 'Promotion_ItemSet_Template',
      cols: ['Campaign Name', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Sale Mode', 'Product Category', 'Branch',
             'Kitchen Name (Bill)', 'Short Name (POS)', 'Item Code', 'QTY', 'Item Price', 'Net Price', 'Promotion Detail', 'Promotion Mechanic'],
      example: [
        ['Grab Combo Cheese 199', '2026-07-01', '2026-07-31', 'GRAB', '', 'ALL', 'MISS+MFF', 'Grab-Cheese[199]', '1073073', '1', '89', '199', 'คอมโบชีส', 'เฉพาะ Grab · ครบ 199'],
        ['Grab Combo Cheese 199', '2026-07-01', '2026-07-31', 'GRAB', '', 'ALL', 'MISS+MFF', 'Grab-Cheese[199]', '1002612', '1', '129', '199', 'คอมโบชีส', 'เฉพาะ Grab · ครบ 199']
      ],
      notes: [
        ['Campaign Name', 'ชื่อแคมเปญ — บรรทัดที่ชื่อเดียวกัน = แคมเปญเดียวกัน'],
        ['Sale Mode', 'ช่องทางขาย: All Channel / All Delivery / Take Away / GRAB / LINEMAN / ShopeeFood / Robinhood / Gokoo (หลายช่องคั่นด้วย ,)'],
        ['Branch', 'ALL = ทุกสาขา · หรือ G:กลุ่ม, C:คลาส, T:ประเภท · หรือรหัสสาขาคั่น ,'],
        ['Short Name (POS)', 'ชื่อปุ่ม POS — บรรทัดที่ Short Name เดียวกันในแคมเปญเดียวกัน = ปุ่มเดียวกัน (ใส่หลายสินค้าได้)'],
        ['Item Code', 'รหัสสินค้าจาก Master (ระบบจะดึงชื่อให้อัตโนมัติ)'],
        ['Item Price', 'ราคาปกติต่อชิ้น — เว้นว่าง = ดึงจาก Master · ใส่ค่า = ใช้ค่านี้ (Gross รวมจากราคานี้)'],
        ['Net Price', 'ราคาโปรโมชั่นสุทธิของปุ่ม (เลขถ้วน)'],
        ['IT', 'Code Promotion / Code Item Set / Category Code — IT กรอกทีหลังในหน้า IT Settlement']
      ]
    },
    coupon: {
      label: 'Item Coupon',
      file: 'Promotion_Coupon_Template',
      cols: ['Campaign Name', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Sale Mode', 'Branch',
             'Coupon Name (POS)', 'Coupon Type', 'Discount', 'Unit', 'Item Code', 'QTY', 'Item Price', 'Promotion Detail', 'Promotion Mechanic'],
      example: [
        ['Free Large Fries 150', '2026-07-01', '2026-07-31', 'All Channel', 'ALL', 'รับฟรี LFF[150]', 'Normal', '69', '฿', '1073073', '1', '55', 'ซื้อครบ 150 รับฟรี', 'ครบ 150 บาท/ใบเสร็จ']
      ],
      notes: [
        ['Coupon Type', 'Normal หรือ Online (Online = ต้องแนบไฟล์โค้ดทีหลัง)'],
        ['Discount / Unit', 'มูลค่าส่วนลด + หน่วย ฿ หรือ % (ระบบคำนวณ Net ต่อสินค้าให้)'],
        ['Sale Mode', 'All Channel / All Delivery / Take Away / GRAB / LINEMAN / ShopeeFood / Robinhood / Gokoo'],
        ['Branch', 'ALL = ทุกสาขา · G:/C:/T: · หรือรหัสสาขาคั่น ,'],
        ['Item Code', 'รหัสสินค้าจาก Master · บรรทัด Coupon Name เดียวกัน = ปุ่มเดียวกัน']
      ]
    },
    voucher: {
      label: 'Voucher',
      file: 'Promotion_Voucher_Template',
      cols: ['Campaign Name', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Sale Mode', 'Branch',
             'Voucher Name (POS)', 'Voucher Type', 'Products', 'Voucher Value', 'Unit', 'Min Spend', 'Item Code', 'QTY', 'Item Price', 'Voucher Detail', 'Voucher Condition'],
      example: [
        ['Cash 50 Voucher', '2026-07-01', '2026-07-31', 'All Channel', 'ALL', 'Voucher 50', 'Normal', 'All', '50', '฿', '0', '', '', '', 'ส่วนลดแทนเงินสด 50', 'ใช้ได้ทุกสินค้า']
      ],
      notes: [
        ['Voucher Type', 'Normal (ลดทันที) หรือ Online (mapping code)'],
        ['Products', 'All = ทุกสินค้า · Selected = ระบุ Item Code (หลายบรรทัดต่อปุ่ม)'],
        ['Voucher Value / Unit', 'มูลค่า Voucher + หน่วย ฿ หรือ %'],
        ['Min Spend', 'ยอดขั้นต่ำในการใช้ (0 = ไม่กำหนด)'],
        ['Item Code', 'ใส่เฉพาะกรณี Products = Selected']
      ]
    },
    billdiscount: {
      label: 'Bill Discount',
      file: 'Promotion_BillDiscount_Template',
      cols: ['Campaign Name', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Sale Mode', 'Branch',
             'Bill Discount Name (POS)', 'Discount Type', 'Discount Value', 'Unit', 'Min Spend', 'Promotion Detail', 'Promotion Condition'],
      example: [
        ['Member Bill 10', '2026-07-01', '2026-07-31', 'All Channel', 'ALL', 'Member ลด 10', 'Normal', '10', '฿', '0', 'ลดท้ายบิล 10 บาท', 'เฉพาะสมาชิก'],
        ['Grab Bill 70', '2026-07-01', '2026-07-31', 'GRAB', 'ALL', 'Grab ลด 70', 'Normal', '70', '฿', '300', 'ลดท้ายบิล 70', 'ครบ 300 บาท']
      ],
      notes: [
        ['Discount Type', 'Normal (ลดทันที) หรือ Online (mapping code)'],
        ['Discount Value / Unit', 'มูลค่าส่วนลด + หน่วย ฿ หรือ %'],
        ['Min Spend', 'ยอดขั้นต่ำ (0 = ไม่กำหนด) · ส่วนลดคิดทั้งบิล (All products)'],
        ['Branch', 'ALL = ทุกสาขา · G:/C:/T: · หรือรหัสสาขาคั่น ,']
      ]
    }
  };

  /* ---------- TEMPLATE DOWNLOAD ---------- */
  function downloadTemplate(type) {
    var cfg = TYPES[type]; if (!cfg) return;
    ensureXLSX().then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      var aoa = [cfg.cols].concat(cfg.example);
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = cfg.cols.map(function (c) { return { wch: Math.max(12, Math.min(30, c.length + 4)) }; });
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      var notes = [['ช่อง (Field)', 'คำอธิบาย']].concat(cfg.notes);
      var wsN = XLSX.utils.aoa_to_sheet(notes);
      wsN['!cols'] = [{ wch: 24 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsN, 'คำอธิบาย');
      XLSX.writeFile(wb, cfg.file + '.xlsx');
    }).catch(function (e) {
      if (window.Swal) Swal.fire('ผิดพลาด', e.message || String(e), 'error');
    });
  }

  /* ---------- PARSE ---------- */
  function parseWorkbook(type, ab) {
    return ensureXLSX().then(function (XLSX) {
      var wb = XLSX.read(ab, { type: 'array' });
      var sh = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
      if (!rows.length) return [];
      // map header → index (tolerant: strip parentheses/spacing/case)
      var cfg = TYPES[type];
      function key(s) { return S(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, ''); }
      var hdr = rows[0].map(key);
      function col(name) { var k = key(name); var i = hdr.indexOf(k); return i; }
      var idx = {}; cfg.cols.forEach(function (c) { idx[c] = col(c); });
      var out = [];
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r]; if (!row || row.every(function (c) { return S(c) === ''; })) continue;
        var obj = {};
        cfg.cols.forEach(function (c) { var i = idx[c]; obj[c] = i >= 0 ? S(row[i]) : ''; });
        // need at least a campaign name
        if (!obj['Campaign Name']) continue;
        out.push(obj);
      }
      return out;
    });
  }

  /* ---------- FILLERS (per type) ---------- */
  function groupBy(rows, keyFn) {
    var order = [], map = {};
    rows.forEach(function (r) { var k = keyFn(r); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(r); });
    return order.map(function (k) { return map[k]; });
  }

  function newCampaign() { window.addCampaign(); return lastEl('#campaignList .campaign-card'); }
  function campButtons(card) { return buttonsIn(card); }
  function addBtn(card) {
    var before = campButtons(card).length;
    window.addButton(card.id);
    var after = campButtons(card);
    return after[after.length - 1];
  }
  function addRow(btn, campId) {
    var before = rowsIn(btn).length;
    try { window.addItemRow(btn.id, campId); } catch (e) { try { window.addItemRow(btn.id); } catch (e2) {} }
    var rs = rowsIn(btn);
    return rs[rs.length - 1];
  }

  function setRadioByValue(btn, val) {
    if (!val) return;
    var v = S(val).toLowerCase();
    btn.querySelectorAll('input[type="radio"]').forEach(function (rb) {
      if (S(rb.value).toLowerCase() === v) { rb.checked = true; fire(v, rb); }
    });
  }
  function setDisc(btn, value, unit, valSel) {
    var v = btn.querySelector(valSel);
    if (v) setField(v, S(value).replace(/[^0-9.]/g, '') || '0');
    var u = btn.querySelector('.btn-disc-unit'); if (u) { u.value = unitTok(unit); fire(u.value, u); }
  }
  function setMinSpend(btn, amount) {
    var a = parseFloat(S(amount).replace(/[^0-9.]/g, '')) || 0;
    var chk = btn.querySelector('.min-spend-check'), mv = btn.querySelector('.min-val');
    if (a > 0 && chk) { chk.checked = true; if (typeof window.toggleMinSpend === 'function') { try { window.toggleMinSpend(btn.id, chk); } catch (e) {} } if (mv) { mv.style.display = 'block'; setField(mv, a); } }
  }

  var FILL = {
    proposal: function (rows) {
      groupBy(rows, function (r) { return r['Campaign Name']; }).forEach(function (cgRows) {
        var card = newCampaign(); if (!card) return; var campId = card.id; var h = cgRows[0];
        setField(card.querySelector('.camp-name'), h['Campaign Name']);
        setField(card.querySelector('.camp-start'), toISODate(h['Start (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-end'), toISODate(h['End (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-cat'), h['Product Category']);
        if (h['Product Category'] && typeof window.campCatPick === 'function') { try { window.campCatPick(campId, h['Product Category']); } catch (e) {} }
        setField(card.querySelector('.camp-detail'), h['Promotion Detail']);
        setField(card.querySelector('.camp-mechanic'), h['Promotion Mechanic']);
        setSaleMode(card, h['Sale Mode']); setStore(card, h['Branch']);
        var firstBtn = true;
        groupBy(cgRows, function (r) { return r['Short Name (POS)'] || '(button)'; }).forEach(function (bRows) {
          var btn = firstBtn ? campButtons(card)[0] : addBtn(card); firstBtn = false; var bh = bRows[0];
          setField(btn.querySelector('.btn-kitchen'), bh['Kitchen Name (Bill)']);
          setField(btn.querySelector('.btn-sn'), bh['Short Name (POS)']);
          var firstRow = true;
          bRows.forEach(function (ir) {
            if (!ir['Item Code']) return;
            var row = firstRow ? rowsIn(btn)[0] : addRow(btn, campId); firstRow = false;
            fillItemRow(row, btn.id, campId, findItem(ir['Item Code']), ir['QTY'], ir['Item Price']);
          });
          var net = btn.querySelector('.btn-net'); if (net) setField(net, S(bh['Net Price']).replace(/[^0-9.]/g, ''));
          if (typeof window.updateTotals === 'function') { try { window.updateTotals(btn.id); } catch (e) {} }
        });
      });
    },
    coupon: function (rows) {
      groupBy(rows, function (r) { return r['Campaign Name']; }).forEach(function (cgRows) {
        var card = newCampaign(); if (!card) return; var campId = card.id; var h = cgRows[0];
        setField(card.querySelector('.camp-name'), h['Campaign Name']);
        setField(card.querySelector('.camp-start'), toISODate(h['Start (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-end'), toISODate(h['End (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-detail'), h['Promotion Detail']);
        setField(card.querySelector('.camp-mechanic'), h['Promotion Mechanic']);
        setSaleMode(card, h['Sale Mode']); setStore(card, h['Branch']);
        var firstBtn = true;
        groupBy(cgRows, function (r) { return r['Coupon Name (POS)'] || '(button)'; }).forEach(function (bRows) {
          var btn = firstBtn ? campButtons(card)[0] : addBtn(card); firstBtn = false; var bh = bRows[0];
          setField(btn.querySelector('.btn-sn'), bh['Coupon Name (POS)']);
          setRadioByValue(btn, bh['Coupon Type']);
          var firstRow = true;
          bRows.forEach(function (ir) {
            if (!ir['Item Code']) return;
            var row = firstRow ? rowsIn(btn)[0] : addRow(btn, campId); firstRow = false;
            fillItemRow(row, btn.id, campId, findItem(ir['Item Code']), ir['QTY'], ir['Item Price']);
          });
          setDisc(btn, bh['Discount'], bh['Unit'], '.btn-disc-input');
          if (typeof window.updateTotals === 'function') { try { window.updateTotals(btn.id); } catch (e) {} }
        });
      });
    },
    voucher: function (rows) {
      groupBy(rows, function (r) { return r['Campaign Name']; }).forEach(function (cgRows) {
        var card = newCampaign(); if (!card) return; var campId = card.id; var h = cgRows[0];
        setField(card.querySelector('.camp-name'), h['Campaign Name']);
        setField(card.querySelector('.camp-start'), toISODate(h['Start (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-end'), toISODate(h['End (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-detail'), h['Voucher Detail']);
        setField(card.querySelector('.camp-condition'), h['Voucher Condition']);
        setSaleMode(card, h['Sale Mode']); setStore(card, h['Branch']);
        var firstBtn = true;
        groupBy(cgRows, function (r) { return r['Voucher Name (POS)'] || '(button)'; }).forEach(function (bRows) {
          var btn = firstBtn ? campButtons(card)[0] : addBtn(card); firstBtn = false; var bh = bRows[0];
          setField(btn.querySelector('.btn-sn'), bh['Voucher Name (POS)']);
          // voucher type radio (name voucherType-*)
          btn.querySelectorAll('input[name^="voucherType-"]').forEach(function (rb) { if (S(rb.value).toLowerCase() === S(bh['Voucher Type']).toLowerCase()) { rb.checked = true; fire('', rb); } });
          var mode = S(bh['Products']).toLowerCase().indexOf('all') === 0 ? 'All' : 'Spec';
          var pm = btn.querySelector('input.p-mode[value="' + mode + '"]');
          if (pm) { pm.checked = true; if (typeof window.handleProductMode === 'function') { try { window.handleProductMode(btn.id, mode); } catch (e) {} } }
          if (mode === 'Spec') {
            var firstRow = true;
            bRows.forEach(function (ir) {
              if (!ir['Item Code']) return;
              var row = firstRow ? rowsIn(btn)[0] : addRow(btn, campId); firstRow = false;
              fillItemRow(row, btn.id, campId, findItem(ir['Item Code']), ir['QTY'], ir['Item Price']);
            });
          }
          setDisc(btn, bh['Voucher Value'], bh['Unit'], '.btn-disc-val');
          setMinSpend(btn, bh['Min Spend']);
          if (typeof window.updateTotals === 'function') { try { window.updateTotals(btn.id); } catch (e) {} }
        });
      });
    },
    billdiscount: function (rows) {
      groupBy(rows, function (r) { return r['Campaign Name']; }).forEach(function (cgRows) {
        var card = newCampaign(); if (!card) return; var h = cgRows[0];
        setField(card.querySelector('.camp-name'), h['Campaign Name']);
        setField(card.querySelector('.camp-start'), toISODate(h['Start (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-end'), toISODate(h['End (YYYY-MM-DD)']));
        setField(card.querySelector('.camp-detail'), h['Promotion Detail']);
        setField(card.querySelector('.camp-condition'), h['Promotion Condition']);
        setSaleMode(card, h['Sale Mode']); setStore(card, h['Branch']);
        var firstBtn = true;
        groupBy(cgRows, function (r) { return r['Bill Discount Name (POS)'] || '(button)'; }).forEach(function (bRows) {
          var btn = firstBtn ? campButtons(card)[0] : addBtn(card); firstBtn = false; var bh = bRows[0];
          setField(btn.querySelector('.btn-sn'), bh['Bill Discount Name (POS)']);
          btn.querySelectorAll('input[name^="couponType-"]').forEach(function (rb) { if (S(rb.value).toLowerCase() === S(bh['Discount Type']).toLowerCase()) { rb.checked = true; fire('', rb); } });
          // default to All products (bill-level) so no item rows needed
          var pm = btn.querySelector('input.p-mode[value="All"]');
          if (pm) { pm.checked = true; if (typeof window.handleProductMode === 'function') { try { window.handleProductMode(btn.id, 'All'); } catch (e) {} } }
          setDisc(btn, bh['Discount Value'], bh['Unit'], '.btn-disc-val');
          setMinSpend(btn, bh['Min Spend']);
        });
      });
    }
  };

  /* ---------- IMPORT FLOW ---------- */
  function doImport(type, file) {
    var cfg = TYPES[type];
    var reader = new FileReader();
    reader.onload = function (e) {
      parseWorkbook(type, e.target.result).then(function (rows) {
        if (!rows.length) { Swal.fire('ไม่พบข้อมูล', 'ไฟล์ว่างหรือหัวตารางไม่ตรง Template — กรุณาใช้ Template ของหน้านี้', 'warning'); return; }
        var nCamp = groupBy(rows, function (r) { return r['Campaign Name']; }).length;
        Swal.fire({
          icon: 'question', title: 'ยืนยันนำเข้า?',
          html: 'พบ <b>' + nCamp + '</b> แคมเปญ · <b>' + rows.length + '</b> แถว<br><span style="color:#c0392b">ข้อมูลที่กรอกค้างในหน้านี้จะถูกล้างก่อนนำเข้า</span>',
          showCancelButton: true, confirmButtonColor: '#2e934a', confirmButtonText: 'นำเข้า', cancelButtonText: 'ยกเลิก'
        }).then(function (res) {
          if (!res.isConfirmed) return;
          try {
            var list = document.getElementById('campaignList');
            if (list) list.innerHTML = '';
            window.campaignCount = 0;
            FILL[type](rows);
            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ', html: 'สร้าง <b>' + nCamp + '</b> แคมเปญแล้ว — ตรวจสอบและกดส่งได้เลย', timer: 2200, showConfirmButton: false });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (err) {
            console.error('[promo-import]', err);
            Swal.fire('ผิดพลาดระหว่างนำเข้า', String(err && err.message || err), 'error');
          }
        });
      }).catch(function (err) { Swal.fire('อ่านไฟล์ไม่สำเร็จ', String(err && err.message || err), 'error'); });
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------- TOOLBAR MOUNT ---------- */
  function mount(type) {
    var cfg = TYPES[type]; if (!cfg) return;
    // find the "ADD NEW ... CAMPAIGN" button to anchor the toolbar above it
    var addBtnEl = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
      return /addCampaign\(\)/.test(b.getAttribute('onclick') || '');
    });
    if (!addBtnEl) { return; }
    var anchor = addBtnEl.closest('.mb-4') || addBtnEl.parentElement;
    if (!anchor || anchor.parentElement.querySelector('.pc-promo-io')) return; // already mounted

    var bar = document.createElement('div');
    bar.className = 'pc-promo-io d-flex flex-wrap align-items-center gap-2 mb-3 p-2 rounded';
    bar.style.cssText = 'background:#fff7e0;border:1px dashed #d9a400;';
    bar.innerHTML =
      '<span class="fw-bold text-uppercase small me-1" style="color:#9a6700;letter-spacing:.5px"><i class="fas fa-file-import me-1"></i>นำเข้าจาก Excel</span>' +
      '<button type="button" class="btn btn-sm btn-outline-dark fw-bold pc-io-tpl"><i class="fas fa-download me-1"></i>ดาวน์โหลด Template</button>' +
      '<button type="button" class="btn btn-sm btn-success fw-bold pc-io-imp"><i class="fas fa-upload me-1"></i>Import จากไฟล์</button>' +
      '<input type="file" class="d-none pc-io-file" accept=".xlsx,.xls">' +
      '<span class="text-muted ms-auto" style="font-size:.74rem">' + cfg.label + ' · กรอกตาม Template แล้วอัปโหลด</span>';
    anchor.parentElement.insertBefore(bar, anchor);

    bar.querySelector('.pc-io-tpl').addEventListener('click', function () { downloadTemplate(type); });
    var fileInp = bar.querySelector('.pc-io-file');
    bar.querySelector('.pc-io-imp').addEventListener('click', function () { fileInp.value = ''; fileInp.click(); });
    fileInp.addEventListener('change', function () { if (fileInp.files && fileInp.files[0]) doImport(type, fileInp.files[0]); });
  }

  window.PromoIO = {
    mount: function (type) {
      // retry a few times in case the page script hasn't defined add* yet
      var tries = 0;
      (function attempt() {
        if (typeof window.addCampaign === 'function' && document.getElementById('campaignList')) { mount(type); return; }
        if (tries++ < 25) setTimeout(attempt, 120);
      })();
    },
    downloadTemplate: downloadTemplate,
    _types: TYPES
  };
})();
