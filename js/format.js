/* ============================================================================
 * POTATO CORNER — central formatting helpers (Web Standards §10)
 * ONE source of truth for numbers / dates / money across every page.
 *   PCfmt.num(v)       1234.5      -> "1,234.5"
 *   PCfmt.int(v)       1234        -> "1,234"
 *   PCfmt.baht(v)      89          -> "฿89"   (no trailing .00 when whole)
 *   PCfmt.baht(v,true) 89          -> "฿89.00" (force 2 decimals)
 *   PCfmt.date(v)      2026-07-01  -> "01/07/2026"
 *   PCfmt.dateTime(v)  ISO         -> "01/07/2026 14:30"
 *   PCfmt.autoFormat(root)  format every [data-fmt] element under root
 * Empty / non-numeric / invalid values render as the dash "—" (or "" for inputs).
 * ==========================================================================*/
(function () {
  "use strict";
  var DASH = "—";

  function toNum(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = (typeof v === "number") ? v : parseFloat(String(v).replace(/,/g, "").trim());
    return isFinite(n) ? n : null;
  }
  function group(n, dec) {
    return n.toLocaleString("en-US", { minimumFractionDigits: dec == null ? 0 : dec,
                                       maximumFractionDigits: dec == null ? 2 : dec });
  }

  var PCfmt = {
    num: function (v) { var n = toNum(v); return n == null ? DASH : group(n); },
    int: function (v) { var n = toNum(v); return n == null ? DASH : group(Math.round(n), 0); },
    baht: function (v, force2) {
      var n = toNum(v); if (n == null) return DASH;
      var whole = Math.abs(n % 1) < 1e-9;
      return "฿" + group(n, force2 ? 2 : (whole ? 0 : 2));
    },
    // accepts "YYYY-MM-DD…", Date, or ISO string → DD/MM/YYYY
    date: function (v) {
      if (!v) return DASH;
      var s = String(v);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;   // already DD/MM/YYYY → leave as-is
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[3] + "/" + m[2] + "/" + m[1];
      var d = new Date(v);
      if (isNaN(d.getTime())) return s;            // already-formatted or unknown → leave as-is
      return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
    },
    dateTime: function (v) {
      if (!v) return DASH;
      var d = new Date(v);
      if (isNaN(d.getTime())) return PCfmt.date(v);
      return PCfmt.date(v) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    },
    // STANDARD adoption path: tag an element <span data-fmt="baht">89</span> and call autoFormat
    autoFormat: function (root) {
      (root || document).querySelectorAll("[data-fmt]").forEach(function (el) {
        if (el.dataset.fmtDone === "1") return;
        var raw = el.getAttribute("data-fmt-val");
        if (raw == null) raw = el.textContent;
        var kind = el.getAttribute("data-fmt");
        var fn = PCfmt[kind];
        if (typeof fn === "function") { el.textContent = fn(raw); el.dataset.fmtDone = "1"; }
      });
    }
  };
  function pad(x) { return (x < 10 ? "0" : "") + x; }

  window.PCfmt = PCfmt;
})();
