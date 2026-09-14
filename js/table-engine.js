/* ================================================================
 *  PC TABLE ENGINE — Potato Corner Promotion System
 *  มาตรฐานตารางกลาง · ใช้คู่กับ css/table-std.css
 * ================================================================
 *  วิธีใช้:
 *    const t = PCTable.create(containerEl, {
 *      columns: [
 *        { key:'id',   label:'รหัส',  fit:true, filter:'text',  sortable:true },
 *        { key:'name', label:'ชื่อ',  flex:true, filter:'text',  sortable:true },
 *        { key:'cat',  label:'หมวด',           filter:'select', sortable:true },
 *        { key:'act',  label:'จัดการ', fit:true, render:(row)=>'<button>…</button>' }
 *      ],
 *      rows: [...],            // array ของ object
 *      perPage: 25,            // ค่าเริ่มต้น (เลือกได้ 10/25/50/100/ทั้งหมด)
 *      search: true,          // ช่องค้นหารวมมุมขวาบน
 *      pageSizes: [10,25,50,100],
 *      emptyText: 'ไม่พบข้อมูล',
 *      rowClass: (row)=> row.inactive ? 'pct-off' : '',
 *      onReady: (api)=>{}
 *    });
 *    t.setRows(newArray)      // อัปเดตข้อมูล (คง filter/sort/page)
 *    t.refresh()              // re-render
 *    t.getFiltered()          // แถวหลัง filter+sort (ทุกหน้า)
 *
 *  column options:
 *    key       ชื่อ field ใน row (หรือใช้ value() แทน)
 *    label     หัวคอลัมน์
 *    fit       true = คอลัมน์หดตามเนื้อหา (width:1%, nowrap)
 *    flex      true = คอลัมน์ยืด (ข้อความยาว เช่นชื่อ)
 *    wrap      true = ตัดบรรทัดได้
 *    filter    'text' | 'select' | false   (รายคอลัมน์)
 *    sortable  true/false
 *    align     'left'|'center'|'right'
 *    value     (row)=>any   ใช้สำหรับ sort/filter/search (ถ้าไม่ใช่ row[key])
 *    render    (row,idx)=>html   แสดงผลเซลล์ (ถ้าไม่ใส่ = escape(row[key]))
 *    th        attrs เพิ่มเติมของ <th>
 * ================================================================ */
(function () {
  "use strict";

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;";
    });
  }

  function cellValue(col, row) {
    if (typeof col.value === "function") return col.value(row);
    return col.key ? row[col.key] : "";
  }
  function cellText(col, row) {
    var v = cellValue(col, row);
    return v === null || v === undefined ? "" : String(v);
  }

  function PCTable(container, cfg) {
    this.el = typeof container === "string" ? document.querySelector(container) : container;
    this.cfg = cfg || {};
    this.columns = this.cfg.columns || [];
    this.allRows = this.cfg.rows || [];
    this.pageSizes = this.cfg.pageSizes || [10, 25, 50, 100];
    this.perPage = this.cfg.perPage || this.pageSizes[1] || 25;
    this.page = 1;
    this.sortKey = this.cfg.sortKey || null;
    this.sortDir = this.cfg.sortDir || "asc";
    this.q = "";
    this.colFilters = {};
    this._uid = "pct" + Math.random().toString(36).slice(2, 8);
    this._build();
    if (typeof this.cfg.onReady === "function") this.cfg.onReady(this);
  }

  PCTable.prototype._build = function () {
    var c = this.cfg;
    var top = "";
    if (c.search !== false || c.pageSizer !== false) {
      top += '<div class="pct-top">';
      if (c.pageSizer !== false) {
        top += '<span class="pct-show-lbl">แสดง</span><select class="pct-per">';
        this.pageSizes.forEach(function (n) {
          top += '<option value="' + n + '">' + n + "</option>";
        });
        top += '<option value="all">ทั้งหมด</option></select><span class="pct-show-lbl">แถว</span>';
      }
      if (c.search !== false) {
        top += '<div class="pct-search-wrap"><i class="fas fa-magnifying-glass"></i>' +
               '<input type="text" class="pct-search" placeholder="' + esc(c.searchPlaceholder || "ค้นหา…") + '"></div>';
      }
      top += "</div>";
    }

    // header rows
    var hasFilter = this.columns.some(function (col) { return col.filter; });
    var filterRow = "";
    if (hasFilter) {
      filterRow = '<tr class="pct-f">';
      this.columns.forEach(function (col, i) {
        if (col.filter === "text") {
          filterRow += '<th><input class="pct-fi" data-fc="' + i + '" placeholder="กรอง…"></th>';
        } else if (col.filter === "select") {
          filterRow += '<th><select class="pct-fi" data-fc="' + i + '"><option value="">ทั้งหมด</option></select></th>';
        } else {
          filterRow += "<th></th>";
        }
      });
      filterRow += "</tr>";
    }

    var headRow = '<tr class="pct-h">';
    this.columns.forEach(function (col, i) {
      var cls = [];
      if (col.fit) cls.push("cfit");
      if (col.flex) cls.push("cflex");
      if (col.sortable) cls.push("sortable");
      var align = col.align ? "text-align:" + col.align + ";" : "";
      headRow += '<th data-col="' + i + '" class="' + cls.join(" ") + '" style="' + align + '" ' + (col.th || "") + ">" +
                 esc(col.label || "") +
                 (col.sortable ? '<i class="fas fa-sort sort-icon"></i>' : "") + "</th>";
    });
    headRow += "</tr>";

    this.el.innerHTML =
      '<div class="pct-shell">' + top +
      '<div class="pct-wrap"><table class="pct"><thead>' + filterRow + headRow +
      '</thead><tbody class="pct-body"></tbody></table></div>' +
      '<div class="pct-bot"><div class="pct-info"></div><div class="pct-pages"></div></div>' +
      "</div>";

    this._body = this.el.querySelector(".pct-body");
    this._info = this.el.querySelector(".pct-info");
    this._pages = this.el.querySelector(".pct-pages");

    var self = this;

    // per-page
    var perSel = this.el.querySelector(".pct-per");
    if (perSel) {
      perSel.value = String(this.perPage);
      perSel.addEventListener("change", function () {
        self.perPage = this.value === "all" ? Infinity : +this.value;
        self.page = 1;
        self.refresh();
      });
    }
    // search
    var search = this.el.querySelector(".pct-search");
    if (search) {
      search.addEventListener("input", function () {
        self.q = this.value.toLowerCase().trim();
        self.page = 1;
        self.refresh();
      });
    }
    // column filters
    this.el.querySelectorAll("[data-fc]").forEach(function (inp) {
      var ev = inp.tagName === "SELECT" ? "change" : "input";
      inp.addEventListener(ev, function () {
        var idx = +this.getAttribute("data-fc");
        self.colFilters[idx] = this.value.toLowerCase().trim();
        self.page = 1;
        self.refresh();
      });
    });
    // sort
    this.el.querySelectorAll(".pct-h th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var idx = +this.getAttribute("data-col");
        if (self.sortKey === idx) {
          self.sortDir = self.sortDir === "asc" ? "desc" : "asc";
        } else {
          self.sortKey = idx;
          self.sortDir = "asc";
        }
        self.refresh();
      });
    });

    this._populateSelects();
    this.refresh();
  };

  PCTable.prototype._populateSelects = function () {
    var self = this;
    this.columns.forEach(function (col, i) {
      if (col.filter !== "select") return;
      var sel = self.el.querySelector('select[data-fc="' + i + '"]');
      if (!sel) return;
      var cur = sel.value;
      var vals = {};
      self.allRows.forEach(function (r) {
        var v = cellText(col, r).trim();
        if (v) vals[v] = 1;
      });
      var opts = Object.keys(vals).sort();
      sel.innerHTML = '<option value="">ทั้งหมด</option>' +
        opts.map(function (v) { return '<option value="' + esc(v.toLowerCase()) + '">' + esc(v) + "</option>"; }).join("");
      sel.value = cur;
    });
  };

  PCTable.prototype.getFiltered = function () {
    var self = this;
    var rows = this.allRows.filter(function (r) {
      // global search
      if (self.q) {
        var hay = self.columns.map(function (col) { return cellText(col, r); }).join(" ").toLowerCase();
        if (hay.indexOf(self.q) < 0) return false;
      }
      // per-column
      for (var idx in self.colFilters) {
        var f = self.colFilters[idx];
        if (!f) continue;
        var col = self.columns[idx];
        if (!col) continue;
        if (cellText(col, r).toLowerCase().indexOf(f) < 0) return false;
      }
      return true;
    });
    // sort
    if (this.sortKey !== null && this.columns[this.sortKey]) {
      var col = this.columns[this.sortKey];
      var dir = this.sortDir === "asc" ? 1 : -1;
      rows.sort(function (a, b) {
        var va = cellValue(col, a), vb = cellValue(col, b);
        var na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb) && /^[\d.,\-]+$/.test(String(va)) && /^[\d.,\-]+$/.test(String(vb))) {
          return (na - nb) * dir;
        }
        return String(va == null ? "" : va).localeCompare(String(vb == null ? "" : vb), "th") * dir;
      });
    }
    return rows;
  };

  PCTable.prototype.refresh = function () {
    var self = this;
    var rows = this.getFiltered();
    var total = rows.length;
    var per = this.perPage;
    var pages = per === Infinity ? 1 : Math.max(1, Math.ceil(total / per));
    if (this.page > pages) this.page = pages;
    var start = per === Infinity ? 0 : (this.page - 1) * per;
    var pageRows = per === Infinity ? rows : rows.slice(start, start + per);

    // sort icons
    this.el.querySelectorAll(".pct-h th").forEach(function (th) {
      var idx = +th.getAttribute("data-col");
      th.classList.remove("sort-asc", "sort-desc");
      var ic = th.querySelector(".sort-icon");
      if (ic) ic.className = "fas fa-sort sort-icon";
      if (self.sortKey === idx) {
        th.classList.add(self.sortDir === "asc" ? "sort-asc" : "sort-desc");
        if (ic) ic.className = "fas fa-sort-" + (self.sortDir === "asc" ? "up" : "down") + " sort-icon";
      }
    });

    // body
    if (!pageRows.length) {
      this._body.innerHTML = '<tr><td colspan="' + this.columns.length + '"><div class="pct-empty">' +
        '<i class="fas fa-inbox"></i>' + esc(this.cfg.emptyText || "ไม่พบข้อมูล") + "</div></td></tr>";
    } else {
      var html = "";
      pageRows.forEach(function (r, ri) {
        var rc = self.cfg.rowClass ? self.cfg.rowClass(r) : "";
        html += '<tr class="' + (rc || "") + '">';
        self.columns.forEach(function (col) {
          var cls = [];
          if (col.fit) cls.push("cfit");
          if (col.wrap) cls.push("wrap");
          var align = col.align ? "text-align:" + col.align + ";" : "";
          var content = col.render ? col.render(r, start + ri) : esc(cellText(col, r));
          html += '<td class="' + cls.join(" ") + '" style="' + align + '">' + content + "</td>";
        });
        html += "</tr>";
      });
      this._body.innerHTML = html;
    }

    // info
    if (total === 0) {
      this._info.textContent = "ไม่มีข้อมูล";
    } else if (per === Infinity) {
      this._info.textContent = "แสดงทั้งหมด " + total.toLocaleString() + " รายการ";
    } else {
      this._info.textContent = "แสดง " + (start + 1).toLocaleString() + "–" +
        Math.min(start + per, total).toLocaleString() + " จาก " + total.toLocaleString() + " รายการ";
    }

    this._renderPager(pages);
  };

  PCTable.prototype._renderPager = function (pages) {
    var self = this;
    if (pages <= 1) { this._pages.innerHTML = ""; return; }
    var cur = this.page;
    var nums = [];
    var add = function (n) { nums.push(n); };
    add(1);
    var lo = Math.max(2, cur - 1), hi = Math.min(pages - 1, cur + 1);
    if (lo > 2) nums.push("…");
    for (var i = lo; i <= hi; i++) add(i);
    if (hi < pages - 1) nums.push("…");
    if (pages > 1) add(pages);

    var html = '<button class="pct-pg" data-pg="prev"' + (cur === 1 ? " disabled" : "") + '><i class="fas fa-chevron-left"></i></button>';
    nums.forEach(function (n) {
      if (n === "…") html += '<span class="pct-pg gap">…</span>';
      else html += '<button class="pct-pg' + (n === cur ? " on" : "") + '" data-pg="' + n + '">' + n + "</button>";
    });
    html += '<button class="pct-pg" data-pg="next"' + (cur === pages ? " disabled" : "") + '><i class="fas fa-chevron-right"></i></button>';
    this._pages.innerHTML = html;

    this._pages.querySelectorAll(".pct-pg[data-pg]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = this.getAttribute("data-pg");
        if (v === "prev") self.page = Math.max(1, self.page - 1);
        else if (v === "next") self.page = Math.min(pages, self.page + 1);
        else self.page = +v;
        self.refresh();
        var w = self.el.querySelector(".pct-wrap");
        if (w) w.scrollTop = 0;
      });
    });
  };

  PCTable.prototype.setRows = function (rows) {
    this.allRows = rows || [];
    this._populateSelects();
    this.refresh();
  };

  window.PCTable = {
    create: function (container, cfg) { return new PCTable(container, cfg); },
    esc: esc
  };
  console.log("[table-engine] ready — PCTable.create()");
})();
