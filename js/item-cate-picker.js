/* =============================================================
 *  ITEM CATE PICKER — popup เลือกสินค้าจาก item master + กรองตามหมวด (cate)
 *  เรียกใช้:  window.PCItemCatePicker.open(onPick, opts)
 *     onPick(item)  → item = { itemCode, nameEN, nameTH, category, itemType, status }
 *     opts = { cate:'หมวดตั้งต้น', title:'...', activeOnly:false }
 *  ใช้ item master จาก PC_API.getMasterDataExtended().items (fallback window.PC_ITEM_MASTER)
 * ============================================================= */
(function () {
  "use strict";

  function loadItems() {
    var items = [];
    try { if (window.PC_API && PC_API.getMasterDataExtended) { var md = PC_API.getMasterDataExtended(); items = (md && md.items) || []; } } catch (e) {}
    if (!items.length && window.PC_ITEM_MASTER) items = window.PC_ITEM_MASTER;
    return (items || []).map(function (it) {
      var _price = it.priceDLV; if (_price == null || _price === "") _price = it.price; if (_price == null || _price === "") _price = it.priceTA; if (_price == null || _price === "") _price = it.gross || it.grossPrice || it.sellPrice; 
      return {
        itemCode: String(it.itemCode == null ? "" : it.itemCode).trim(),
        nameEN: it.itemNameEN || it.nameEN || it.en || "",
        nameTH: it.itemNameTH || it.nameTH || it.th || "",
        category: it.category || it.cateName || it.categoryName || it.cate || "",
        cateCode: String(it.cateCode || it.catCode || it.postCate || "").trim(),
        itemType: it.itemType || it.type || "",
        price: (_price == null ? "" : _price),
        prices: {
          TA: it.priceTA || it.priceTakeaway || "", DLV: it.priceDLV || "",
          GRAB: it.priceGrab || "", LINEMAN: it.priceLineman || "", SHOPEE: it.priceShopee || "",
          ROBINHOOD: it.priceRobinhood || "", GOKOO: it.priceGokoo || "", PANDA: it.pricePanda || ""
        },
        status: (it.status || "").toLowerCase()
      };
    }).filter(function (x) { return x.itemCode; })
      .sort(function (a, b) { return String(a.itemCode).localeCompare(String(b.itemCode), undefined, { numeric: true }); });
  }

  function injectCSS() {
    if (document.getElementById("__icp-style")) return;
    var s = document.createElement("style");
    s.id = "__icp-style";
    s.textContent = [
      ".icp-ov{position:fixed;inset:0;background:rgba(20,24,28,.5);z-index:99990;display:flex;align-items:center;justify-content:center;padding:20px;}",
      ".icp-modal{background:#fff;border-radius:16px;width:min(680px,96vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden;font-family:inherit;}",
      ".icp-head{padding:16px 20px;background:#1a1d20;color:#fff;display:flex;align-items:center;justify-content:space-between;}",
      ".icp-head h3{margin:0;font-size:1.05rem;font-weight:800;}",
      ".icp-x{background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer;line-height:1;opacity:.8;}",
      ".icp-x:hover{opacity:1;}",
      ".icp-filters{padding:12px 16px;border-bottom:1px solid #eceff2;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fafbfc;}",
      ".icp-filters select,.icp-filters input{border:1px solid #d0d5dd;border-radius:9px;padding:8px 11px;font-size:.86rem;font-family:inherit;}",
      ".icp-filters select{min-width:190px;background:#fff;}",
      ".icp-filters input{flex:1;min-width:150px;}",
      ".icp-count{font-size:.76rem;color:#8a9099;padding:0 16px 8px;background:#fafbfc;}",
      ".icp-list{overflow-y:auto;flex:1;}",
      ".icp-row{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f2f4f6;cursor:pointer;}",
      ".icp-row:hover{background:#eef7ff;}",
      ".icp-code{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:.78rem;color:#1a1d20;background:#e8eaed;padding:3px 9px;border-radius:5px;white-space:nowrap;flex-shrink:0;}",
      ".icp-nm{flex:1;min-width:0;}",
      ".icp-nm b{display:block;font-size:.86rem;color:#20242a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".icp-nm span{font-size:.74rem;color:#9aa1ab;}",
      ".icp-cate{font-size:.72rem;color:#2e934a;background:#eafaf1;padding:3px 9px;border-radius:20px;white-space:nowrap;flex-shrink:0;}",
      ".icp-ina{opacity:.5;}",
      ".icp-empty{padding:34px;text-align:center;color:#b3b9c0;font-size:.9rem;}"
    ].join("");
    document.head.appendChild(s);
  }

  var state = { items: [], cate: "ALL", q: "", onPick: null, activeOnly: false, subsetForm: null, subsets: [] };

  /* แสดงรายการ "กลุ่มสินค้า (Subset)" — เหมือนหน้าฟอร์ม (เลือกเป็นกลุ่ม) */
  function renderSubsets(list, cnt, q, esc) {
    var FS = window.PC_FormSubset;
    var subs = (state.subsets || []).filter(function (s) {
      if (!q) return true;
      return ((s.ssCode || "") + " " + (s.name || "")).toLowerCase().indexOf(q) >= 0;
    });
    if (cnt) cnt.textContent = "พบ " + subs.length + " กลุ่มสินค้า (Subset)";
    if (!subs.length) { list.innerHTML = '<div class="icp-empty"><i class="fas fa-layer-group me-2"></i>ยังไม่มีกลุ่มสินค้าที่เปิดใช้ — เปิดที่ Form Display Settings</div>'; return; }
    list.innerHTML = subs.map(function (s, i) {
      var mem = (FS ? FS.members(s.ssCode) : []).length;
      var p = FS ? FS.price(s.ssCode) : 0;
      return '<div class="icp-row" data-si="' + i + '">' +
        '<span class="icp-code">' + esc(s.ssCode) + '</span>' +
        '<span class="icp-nm"><b>' + esc(s.name || s.ssCode) + '</b><span>' + mem + ' รายการในกลุ่ม</span></span>' +
        (p ? '<span style="font-size:.78rem;color:#e8590c;font-weight:700;white-space:nowrap">฿' + esc(p) + '</span>' : '') +
        '<span class="icp-cate" style="background:#eef3ff;color:#2c4a82">Subset</span>' +
        '</div>';
    }).join("");
    Array.from(list.querySelectorAll(".icp-row")).forEach(function (el) {
      el.addEventListener("click", function () {
        var s = subs[+el.getAttribute("data-si")];
        if (s && state.onPick) { try { state.onPick({ itemCode: s.ssCode, nameEN: s.name || s.ssCode, nameTH: s.name || s.ssCode, category: "Subset (กลุ่มสินค้า)", cateCode: "", price: (FS ? FS.price(s.ssCode) : ""), prices: {}, isSubset: true }); } catch (e) {} }
        close();
      });
    });
  }

  function render() {
    var list = document.getElementById("icpList");
    var cnt = document.getElementById("icpCount");
    if (!list) return;
    var q = state.q.toLowerCase().trim();
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    if (state.cate === "__SUBSET__") { renderSubsets(list, cnt, q, esc); return; }
    var rows = state.items.filter(function (it) {
      if (state.activeOnly && it.status === "inactive") return false;
      if (state.cate !== "ALL" && it.category !== state.cate) return false;
      if (q) return (it.itemCode + " " + it.nameEN + " " + it.nameTH + " " + it.category).toLowerCase().indexOf(q) >= 0;
      return true;
    });
    var MAX = 300;
    var _selCode = state.cate !== "ALL" ? ((state.items.filter(function (x) { return x.category === state.cate; })[0] || {}).cateCode || "") : "";
    if (cnt) cnt.textContent = "พบ " + rows.length + " รายการ" + (state.cate !== "ALL" ? " · หมวด " + (_selCode ? _selCode + " · " : "") + state.cate : "") + (rows.length > MAX ? " (แสดง " + MAX + " แรก — พิมพ์เพื่อกรอง)" : "");
    if (!rows.length) { list.innerHTML = '<div class="icp-empty"><i class="fas fa-magnifying-glass me-2"></i>ไม่พบสินค้าที่ตรงกับเงื่อนไข</div>'; return; }
    list.innerHTML = rows.slice(0, MAX).map(function (it, i) {
      return '<div class="icp-row' + (it.status === "inactive" ? " icp-ina" : "") + '" data-i="' + i + '">' +
        '<span class="icp-code">' + esc(it.itemCode) + '</span>' +
        '<span class="icp-nm"><b>' + esc(it.nameEN || it.nameTH || "-") + '</b>' + (it.nameTH && it.nameTH !== it.nameEN ? '<span>' + esc(it.nameTH) + '</span>' : '') + '</span>' +
        (it.price !== "" && it.price != null ? '<span style="font-size:.78rem;color:#e8590c;font-weight:700;white-space:nowrap">฿' + esc(it.price) + '</span>' : '') +
        ((it.category || it.cateCode) ? '<span class="icp-cate">' + esc((it.cateCode ? it.cateCode + ' · ' : '') + it.category) + '</span>' : '') +
        '</div>';
    }).join("");
    var shown = rows.slice(0, MAX);
    Array.from(list.querySelectorAll(".icp-row")).forEach(function (el) {
      el.addEventListener("click", function () {
        var it = shown[+el.getAttribute("data-i")];
        if (it && state.onPick) { try { state.onPick(it); } catch (e) {} }
        close();
      });
    });
  }

  function close() { var ov = document.getElementById("icpOverlay"); if (ov) ov.remove(); }

  function open(onPick, opts) {
    opts = opts || {};
    injectCSS();
    close();
    state.items = loadItems();
    state.cate = opts.cate || "ALL";
    state.q = "";
    state.onPick = onPick;
    state.activeOnly = !!opts.activeOnly;
    // subset (กลุ่มสินค้า) — ดึงจาก PC_FormSubset ตาม form key (สตริง หรือ array → union ดีดูปตาม ssCode)
    state.subsetForm = opts.subsetForm || null;
    state.subsets = [];
    if (opts.allSubsets && window.PC_SUBSET_MASTER) {
      // โหมดตาราง MKT (แอดมิน): ดึง subset ทั้งหมดที่ Active — ไม่กรองตาม Form Display Settings
      state.subsets = (window.PC_SUBSET_MASTER || []).filter(function (s) { return s && s.ssCode && String(s.status || "Active").toLowerCase() !== "inactive"; });
    } else if (state.subsetForm && window.PC_FormSubset && PC_FormSubset.list) {
      var _keys = Array.isArray(state.subsetForm) ? state.subsetForm : [state.subsetForm];
      var _seen = {};
      _keys.forEach(function (k) { (PC_FormSubset.list(k) || []).forEach(function (s) { if (!_seen[s.ssCode]) { _seen[s.ssCode] = 1; state.subsets.push(s); } }); });
    }
    // หมวด (cate): เรียงตามเลข cate code น้อย→มาก (fallback ชื่อ) · label = "<code> · <ชื่อหมวด>"
    var codeByCat = {};
    state.items.forEach(function (x) { if (x.category && !(x.category in codeByCat)) codeByCat[x.category] = x.cateCode || ""; });
    var cates = Array.from(new Set(state.items.map(function (x) { return x.category; }).filter(Boolean))).sort(function (a, b) {
      var na = parseInt(codeByCat[a], 10), nb = parseInt(codeByCat[b], 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return String(codeByCat[a] || a).localeCompare(String(codeByCat[b] || b), undefined, { numeric: true, sensitivity: "base" });
    });
    if (state.cate !== "ALL" && cates.indexOf(state.cate) < 0) state.cate = "ALL";
    var ov = document.createElement("div");
    ov.className = "icp-ov"; ov.id = "icpOverlay";
    ov.innerHTML =
      '<div class="icp-modal" onclick="event.stopPropagation()">' +
        '<div class="icp-head"><h3><i class="fas fa-box-open me-2"></i>' + (opts.title || "เลือกสินค้า") + '</h3><button class="icp-x" id="icpX">&times;</button></div>' +
        '<div class="icp-filters">' +
          '<select id="icpCate"><option value="ALL">ทุกหมวด (' + cates.length + ')</option>' +
            (state.subsets.length ? '<option value="__SUBSET__"' + (state.cate === "__SUBSET__" ? " selected" : "") + '>🧂 เลือกสินค้าเป็นกลุ่ม (Subset · ' + state.subsets.length + ')</option>' : "") +
            cates.map(function (c) { var cc = codeByCat[c]; return '<option value="' + c.replace(/"/g, "&quot;") + '"' + (c === state.cate ? " selected" : "") + '>' + (cc ? cc + ' · ' : '') + c + '</option>'; }).join("") +
          '</select>' +
          '<input id="icpQ" type="text" placeholder="ค้นหา รหัส / ชื่อสินค้า…" autocomplete="off">' +
        '</div>' +
        '<div class="icp-count" id="icpCount"></div>' +
        '<div class="icp-list" id="icpList"></div>' +
      '</div>';
    ov.addEventListener("click", close);
    document.body.appendChild(ov);
    document.getElementById("icpX").addEventListener("click", close);
    document.getElementById("icpCate").addEventListener("change", function () { state.cate = this.value; render(); });
    var qi = document.getElementById("icpQ");
    qi.addEventListener("input", function () { state.q = this.value; render(); });
    setTimeout(function () { qi.focus(); }, 50);
    render();
  }

  window.PCItemCatePicker = { open: open, close: close };
  console.log("[item-cate-picker] ready");
})();
