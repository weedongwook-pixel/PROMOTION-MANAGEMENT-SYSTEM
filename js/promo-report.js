/* ============================================================================
 * PC Promo Report — "รายงานแบบบล็อกต่อปุ่ม" (grouped block report) + เส้นตาราง
 * ----------------------------------------------------------------------------
 * โครงสร้าง: หัวแคมเปญ → ประเภทปุ่มโปรโมชั่น → แต่ละปุ่ม POS (+ สินค้าย่อย)
 * "รายละเอียด" และ "เงื่อนไข/เงื่อนไขพิเศษ" = คอลัมน์ท้ายสุด (X/Y/Z)
 * ใส่เส้นตาราง (border) + หัวสี ผ่าน xlsx-js-style (โหลดเสริมตอน export)
 *
 *   window.PC_PromoReport.exportExcel(rows, filename)  -> Promise
 *   window.PC_PromoReport.buildAOA(rows)               -> { aoa, kinds, cols }
 * rows = ผลจาก backend getFullPromoExport('ALL') (flat per-item)
 * ==========================================================================*/
(function () {
  "use strict";

  var HEADERS = [
    "Campaign name", "Start date", "End date", "Sale mode", "Type Promotion",
    "Code Promotion", "item (Promotion)", "Item Name EN\n(BAR & KITCHEN display)",
    "Short Name (POS)\nชื่อปุ่มโปรโมชั่น", "Cat Code", "Category",
    "Item Code (Master)", "Item Name EN", "Original Price", "QTY",
    "Gross Value\n(ราคาปกติ)", "Discount", "Net Price",
    "Truffle +10฿", "Gochujang", "Upsize +5฿", "Branch",
    "รายละเอียดโปรโมชั่น", "เงื่อนไข", "เงื่อนไขพิเศษ (หน้าสาขา)",
    "วันที่ทำรายการ", "ผู้ส่งงาน",
  ];
  var COL_W = [30, 12, 12, 18, 15, 13, 13, 20, 22, 8, 15, 14, 22, 11, 6, 11, 9, 9, 11, 11, 11, 26, 46, 46, 34, 18, 20];
  var NCOL = HEADERS.length; // 25 (A..Y)
  var IDX = { detail: 22, cond: 23, special: 24 };

  function num(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }
  function s(v) { return v == null ? "" : String(v); }

  function buttonType(tp, wasItemSet) {
    var t = (tp || "").toLowerCase();
    if (wasItemSet || /item\s*set/.test(t)) return "Item Set";
    if (/voucher/.test(t)) return "Voucher";
    if (/coupon/.test(t)) return "Coupon";
    if (/bill/.test(t)) return "Bill Discount";
    if (/price/.test(t)) return "Price Promotion";
    return tp || "-";
  }
  function blank() { return new Array(NCOL).fill(""); }

  /* จัดกลุ่ม rows -> [{campaign, meta, buttons:[...], conditions:[...]}] */
  function group(rows) {
    var byCamp = {}, order = [];
    rows.forEach(function (r) {
      var c = r.campaign || "-";
      if (!byCamp[c]) { byCamp[c] = []; order.push(c); }
      byCamp[c].push(r);
    });
    return order.map(function (c) {
      var list = byCamp[c];
      var first = list[0];
      var byBtn = {}, bOrder = [];
      list.forEach(function (r) {
        var k = (r.shortName || "") + "||" + (r.kitchen || "");
        if (!byBtn[k]) { byBtn[k] = []; bOrder.push(k); }
        byBtn[k].push(r);
      });
      var buttons = bOrder.map(function (k) {
        var items = byBtn[k];
        var f0 = items[0];
        var gross = 0, hasGross = false;
        items.forEach(function (it) {
          var g = num(it.gross), q = num(it.qty);
          if (g != null) { hasGross = true; gross += g * (q == null ? 1 : q); }
        });
        var net = num(f0.netPrice);
        var disc = (hasGross && net != null) ? (gross - net) : num(f0.discount);
        var addonTxt = items.map(function (it) { return s(it.addons); }).join(" ") + " " + s(f0.mechanic);
        return {
          codePromotion: f0.codePromotion || "",
          codeItemSet: f0.codeItemSet || "",
          kitchen: f0.kitchen || "", shortName: f0.shortName || "",
          detail: f0.detail || "", mechanic: f0.mechanic || "", count: items.length,
          gross: hasGross ? gross : (f0.gross === "All" ? "All" : null),
          discount: disc, net: net != null ? net : (f0.netPrice === "" ? "" : f0.netPrice),
          truffle: /ทรัฟเฟิล|truffle/i.test(addonTxt) ? "✔" : "",
          gochujang: /โกชู|gochujang/i.test(addonTxt) ? "✔" : "",
          upsize: /อัพไซ|upsize|upsized/i.test(addonTxt) ? "✔" : "",
          items: items.map(function (it) {
            return {
              catCode: it.catCode || "", category: it.category || "",
              itemCode: it.itemCode || "", itemNameEN: it.itemNameEN || "",
              original: it.gross === "All" ? "All" : (num(it.gross) != null ? num(it.gross) : ""),
              qty: it.qty === "All" ? "All" : (num(it.qty) != null ? num(it.qty) : (it.qty || "")),
            };
          }),
        };
      });
      // เงื่อนไขระดับแคมเปญ (รวมบรรทัด mechanic ทั้งหมด unique)
      var condSet = [], seen = {};
      list.forEach(function (r) {
        s(r.mechanic).split(/\r?\n/).forEach(function (ln) {
          ln = ln.trim(); if (ln && !seen[ln]) { seen[ln] = 1; condSet.push(ln.replace(/^[-•]\s*/, "")); }
        });
      });
      var branchNotes = [];
      list.forEach(function (r) { var b = s(r.branchNote).trim(); if (b && branchNotes.indexOf(b) < 0) branchNotes.push(b); });
      return {
        campaign: c, start: first.start || "", end: first.end || "",
        saleMode: first.saleMode || "", typePromotion: first.typePromotion || "",
        codePromotion: first.codePromotion || "", branch: first.stores || "",
        btnType: buttonType(first.typePromotion, false),
        buttons: buttons,
        conditions: condSet.map(function (l) { return "• " + l; }).join("\n"),
        special: branchNotes.map(function (l) { return "★ " + l; }).join("\n"),
        txnDate: first.txnDate || "", submitter: first.reporter || first.submittedBy || "",
      };
    });
  }

  /* สร้าง AOA + ประเภทของแต่ละแถว (kinds) เพื่อใช้ลงสไตล์ */
  function buildAOA(rows) {
    var aoa = [HEADERS.slice()];
    var kinds = ["header"];

    group(rows).forEach(function (camp) {
      // หัวแคมเปญ (เงื่อนไข/พิเศษ ระดับแคมเปญ ไปช่องท้าย)
      var head = blank();
      head[0] = camp.campaign;
      head[1] = camp.start; head[2] = camp.end; head[3] = camp.saleMode;
      head[4] = camp.typePromotion; head[21] = camp.branch;
      head[25] = camp.txnDate ? (function(s){ var d=new Date(s); return isNaN(d.getTime())?String(s):d.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); })(camp.txnDate) : "";
      head[26] = camp.submitter;
      head[IDX.cond] = camp.conditions; head[IDX.special] = camp.special;
      aoa.push(head); kinds.push("camp");

      var bt = blank(); bt[0] = "ประเภทปุ่มโปรโมชั่น : " + camp.btnType;
      aoa.push(bt); kinds.push("type");

      camp.buttons.forEach(function (b) {
        var hr = blank();
        hr[5] = b.codePromotion || ""; hr[6] = b.codeItemSet; hr[7] = b.kitchen; hr[8] = b.shortName;
        if (b.items[0]) { hr[9] = b.items[0].catCode; hr[10] = b.items[0].category; }
        hr[15] = b.gross == null ? "" : b.gross;
        hr[16] = b.discount == null ? "" : b.discount;
        hr[17] = b.net == null ? "" : b.net;
        hr[18] = b.truffle; hr[19] = b.gochujang; hr[20] = b.upsize;
        hr[IDX.detail] = b.detail; hr[IDX.cond] = b.mechanic;
        aoa.push(hr); kinds.push("btn");

        b.items.forEach(function (it) {
          var ir = blank();
          ir[9] = it.catCode; ir[10] = it.category;
          ir[11] = it.itemCode; ir[12] = it.itemNameEN;
          ir[13] = it.original; ir[14] = it.qty;
          aoa.push(ir); kinds.push("item");
        });
      });
      aoa.push(blank()); kinds.push("gap");
    });

    return { aoa: aoa, kinds: kinds, cols: COL_W.map(function (w) { return { wch: w }; }) };
  }

  /* โหลด xlsx-js-style (ใส่ border ได้) — คืน XLSX ที่รองรับ style */
  var _styledPromise = null;
  function ensureStyledXLSX() {
    if (window.XLSX && window.XLSX.__styled) return Promise.resolve(window.XLSX);
    if (_styledPromise) return _styledPromise;
    _styledPromise = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
      sc.onload = function () { if (window.XLSX) window.XLSX.__styled = true; resolve(window.XLSX); };
      sc.onerror = function () { resolve(window.XLSX); }; // fallback: ใช้ตัวเดิม (ไม่มี border)
      document.head.appendChild(sc);
    });
    return _styledPromise;
  }

  var BORDER = { style: "thin", color: { rgb: "FFC2C9D0" } };
  var ALLB = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  function styleFor(kind, col) {
    var base = { border: ALLB, alignment: { vertical: "top", wrapText: true } };
    if (kind === "header") return { border: ALLB, font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "FF1F8A4E" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true } };
    if (kind === "camp") return { border: ALLB, font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "FFDFF3E7" } }, alignment: { vertical: "center", wrapText: true } };
    if (kind === "type") return { border: ALLB, font: { bold: true, italic: true, color: { rgb: "FF1F8A4E" } }, fill: { fgColor: { rgb: "FFF3F7F4" } }, alignment: { vertical: "center", wrapText: true } };
    if (kind === "btn") return { border: ALLB, font: { bold: col <= 20 }, fill: { fgColor: { rgb: "FFF1F3F5" } }, alignment: { vertical: "top", wrapText: true } };
    return base;
  }

  function applyStyles(XLSX, ws, kinds) {
    var range = XLSX.utils.decode_range(ws["!ref"]);
    for (var r = range.s.r; r <= range.e.r; r++) {
      var kind = kinds[r] || "item";
      if (kind === "gap") continue; // เว้นแถวคั่น ไม่ใส่กรอบ
      for (var c = range.s.c; c <= range.e.c; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = styleFor(kind, c);
      }
    }
  }

  function exportExcel(rows, filename) {
    rows = rows || [];
    var built = buildAOA(rows);
    return ensureStyledXLSX().then(function (XLSX) {
      if (typeof XLSX === "undefined") throw new Error("XLSX library ยังไม่โหลด");
      var ws = XLSX.utils.aoa_to_sheet(built.aoa);
      ws["!cols"] = built.cols;
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!rows"] = [{ hpt: 30 }];
      try { applyStyles(XLSX, ws, built.kinds); } catch (e) { /* ไม่มี style ก็ยังได้ไฟล์ */ }
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Promo Report");
      XLSX.writeFile(wb, filename || ("Promo_Report_" + new Date().toISOString().slice(0, 10) + ".xlsx"));
      return built.aoa.length;
    });
  }

  window.PC_PromoReport = { buildAOA: buildAOA, exportExcel: exportExcel, group: group };
})();
