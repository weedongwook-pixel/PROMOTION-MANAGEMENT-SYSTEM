/* ==========================================================================
 *  CODE GUARD (client) — inline duplicate/low-number feedback while typing
 *  --------------------------------------------------------------------------
 *  Backend single-source: PC_API.checkCode(type, code, ignore)
 *    type: "itemset" | "promo" | "item" | "npd"
 *    returns { status:"ok"|"dup"|"low"|"empty", message, baseline, where }
 *
 *  USAGE — pages only add attributes, no per-page wiring:
 *    <input data-cg="itemset" data-cg-ignore="CampaignName">
 *  One delegated listener watches every [data-cg] input on every page,
 *  debounces, checks, and paints an inline hint below the field.
 *
 *  Submit gating:
 *    CodeGuard.validate(rootEl).then(function(r){ r.blocking / r.warnings })
 *    CodeGuard.checkValue(type, code, ignore) -> Promise(result)
 * ========================================================================== */
(function () {
  "use strict";

  var SEQ = 0;
  var TIMERS = {};

  function run(type, code, ignore) {
    return new Promise(function (res) {
      try {
        if (window.PC_API && PC_API.checkCode) { res(PC_API.checkCode(type, code, ignore)); return; }
        if (window.google && google.script && google.script.run) {
          google.script.run.withSuccessHandler(res).withFailureHandler(function () { res({ status: "ok" }); })
            .checkCode(type, code, ignore);
          return;
        }
      } catch (e) {}
      res({ status: "ok" });
    });
  }

  var META = {
    dup: { icon: "fa-ban", color: "#c0392b", bg: "#fdecea", bd: "#f3c6c0" },
    low: { icon: "fa-triangle-exclamation", color: "#9a6700", bg: "#fff7e6", bd: "#f3e0b8" },
    ok: { icon: "fa-circle-check", color: "#1d7a4d", bg: "#eafaf1", bd: "#bfe6cf" },
  };

  function msgEl(input) {
    var id = input.getAttribute("data-cg-msg");
    var el = id && document.getElementById(id);
    if (!el) {
      id = "cgmsg-" + (++SEQ);
      el = document.createElement("div");
      el.id = id;
      el.className = "cg-msg";
      el.style.cssText = "font-family:'Kanit',sans-serif;font-size:.72rem;font-weight:600;margin-top:3px;display:none;align-items:center;gap:5px;line-height:1.3;border-radius:6px;padding:3px 8px;";
      var anchor = input.closest(".input-group") || input;
      if (anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
      input.setAttribute("data-cg-msg", id);
    }
    return el;
  }

  function paint(input, r) {
    var el = msgEl(input);
    input.style.removeProperty("box-shadow");
    if (!r || r.status === "empty") {
      el.style.display = "none"; el.textContent = "";
      input.removeAttribute("data-cg-status");
      return;
    }
    var m = META[r.status] || META.ok;
    el.style.display = "flex";
    el.style.color = m.color; el.style.background = m.bg; el.style.border = "1px solid " + m.bd;
    el.innerHTML = '<i class="fas ' + m.icon + '"></i><span>' + (r.message || "") + "</span>";
    if (r.status !== "ok") input.style.boxShadow = "0 0 0 2px " + m.bd;
    input.setAttribute("data-cg-status", r.status);
  }

  function check(input) {
    if (!input || !input.getAttribute) return Promise.resolve(null);
    var type = input.getAttribute("data-cg");
    if (!type) return Promise.resolve(null);
    var ignore = input.getAttribute("data-cg-ignore") || "";
    return run(type, (input.value || "").trim(), ignore).then(function (r) { paint(input, r); return r; });
  }

  function schedule(input) {
    if (!input.__cgid) input.__cgid = ++SEQ;
    clearTimeout(TIMERS[input.__cgid]);
    TIMERS[input.__cgid] = setTimeout(function () { check(input); }, 280);
  }

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches("[data-cg]")) schedule(t);
  }, true);
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches("[data-cg]")) check(t);
  }, true);

  window.CodeGuard = {
    check: check,
    checkValue: run,
    // Force-check every [data-cg] field under root; resolve to blocking dups + low warnings
    validate: function (root) {
      root = root || document;
      var inputs = Array.prototype.slice.call(root.querySelectorAll("[data-cg]"))
        .filter(function (i) { return !i.disabled && (i.value || "").trim(); });
      return Promise.all(inputs.map(function (inp) {
        return check(inp).then(function (r) { return { input: inp, r: r || {} }; });
      })).then(function (arr) {
        return {
          blocking: arr.filter(function (x) { return x.r.status === "dup"; }),
          warnings: arr.filter(function (x) { return x.r.status === "low"; }),
        };
      });
    },
  };
})();
