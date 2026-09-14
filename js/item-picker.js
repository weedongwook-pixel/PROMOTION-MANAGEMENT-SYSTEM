/* =============================================================
 *  ITEM PICKER — Universal datalist enhancer
 *  Automatically upgrades every <input list="…"> in the shell
 *  to a styled custom dropdown with code-pill + name layout.
 *  Works with dynamically-created elements via MutationObserver.
 *  No changes needed in individual pages.
 * ============================================================= */
(function () {
  "use strict";

  /* ---- inject CSS once ---- */
  if (!document.getElementById("__ip-style")) {
    var s = document.createElement("style");
    s.id = "__ip-style";
    s.textContent = [
      ".ip-wrap{position:relative;display:block;}",
      ".ip-drop{position:absolute;top:calc(100% + 3px);left:0;min-width:100%;max-width:420px;background:#fff;border:1px solid #d0d5dd;border-radius:10px;",
      "box-shadow:0 8px 28px rgba(0,0,0,.13);z-index:8000;max-height:280px;overflow-y:auto;display:none;}",
      ".ip-drop.ip-open{display:block;}",
      ".ip-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f2f4f6;transition:background .08s;}",
      ".ip-opt:last-child{border-bottom:0;}",
      ".ip-opt:hover,.ip-opt.ip-hi{background:#f0f7ff;}",
      ".ip-pill{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:.76rem;color:#1a1d20;background:#e8eaed;padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0;}",
      ".ip-main{font-size:.84rem;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}",
      ".ip-sub{font-size:.72rem;color:#9aa1ab;flex-shrink:0;white-space:nowrap;}",
      ".ip-empty{padding:14px;text-align:center;color:#bbb;font-size:.82rem;}",
      ".ip-more{padding:6px 12px;text-align:center;color:#bbb;font-size:.74rem;border-top:1px solid #f0f0f0;}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---- parse option text "CODE · SUB" or just text ---- */
  function parseOpt(o) {
    var val = o.value;
    var txt = (o.textContent || o.label || "").trim();
    var code = o.getAttribute("data-code") || "";
    var sub  = o.getAttribute("data-sub")  || "";
    if (!code && txt) {
      // common pattern: "101003 · Fries" or "101003 · name · category"
      var parts = txt.split(/\s*·\s*/);
      if (parts.length >= 2 && /^[A-Za-z0-9\-_]+$/.test(parts[0].trim())) {
        code = parts[0].trim();
        sub  = parts.slice(1).join(" · ");
      }
    }
    return { value: val, label: val, code: code, sub: sub };
  }

  /* ---- build + show dropdown ---- */
  function ipShow(inp) {
    var listId = inp.__ipListId;
    var dl = listId ? document.getElementById(listId) : null;
    if (!dl) return;
    var q = (inp.value || "").toLowerCase().trim();
    var raw = Array.from(dl.options).map(parseOpt);
    var filtered = raw.filter(function (o) {
      if (!q) return true;
      return (o.value + " " + o.code + " " + o.sub).toLowerCase().indexOf(q) >= 0;
    });
    var MAX = 80;
    var drop = inp.__ipDrop;
    if (!drop) return;
    var html = "";
    if (!filtered.length) {
      html = '<div class="ip-empty"><i class="fas fa-magnifying-glass me-1"></i>ไม่พบรายการที่ตรงกัน</div>';
    } else {
      filtered.slice(0, MAX).forEach(function (o) {
        var v = o.value.replace(/"/g, "&quot;");
        html += '<div class="ip-opt" data-val="' + v + '" onmousedown="window.__ipPick(this,event)">';
        if (o.code) html += '<span class="ip-pill">' + o.code + "</span>";
        html += '<span class="ip-main">' + (o.label || o.value) + "</span>";
        if (o.sub)  html += '<span class="ip-sub">' + o.sub + "</span>";
        html += "</div>";
      });
      if (filtered.length > MAX) {
        html += '<div class="ip-more">แสดง ' + MAX + " จาก " + filtered.length + " รายการ — พิมพ์เพื่อกรอง</div>";
      }
    }
    drop.innerHTML = html;
    drop.classList.add("ip-open");
    drop.__ipInp = inp;
  }

  window.__ipPick = function (el, e) {
    if (e) e.preventDefault();
    var val = el.getAttribute("data-val");
    var drop = el.closest(".ip-drop");
    var inp = drop && drop.__ipInp;
    if (!inp) return;
    inp.value = val;
    drop.classList.remove("ip-open");
    // fire events so oninput/onchange handlers still work
    inp.dispatchEvent(new Event("input",  { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /* ---- keyboard nav ---- */
  function ipKey(inp, e) {
    var drop = inp.__ipDrop;
    if (!drop || !drop.classList.contains("ip-open")) return;
    var items = drop.querySelectorAll(".ip-opt");
    if (!items.length) return;
    var hi = drop.querySelector(".ip-hi");
    var idx = hi ? Array.from(items).indexOf(hi) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      items.forEach(function (o, i) { o.classList.toggle("ip-hi", i === idx); });
      items[idx] && items[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      items.forEach(function (o, i) { o.classList.toggle("ip-hi", i === idx); });
      items[idx] && items[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && idx >= 0) {
      e.preventDefault();
      items[idx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    } else if (e.key === "Escape") {
      drop.classList.remove("ip-open");
    }
  }

  /* ---- enhance a single input ---- */
  function enhance(inp) {
    if (inp.__ipDone) return;
    var listId = inp.getAttribute("list");
    if (!listId) return;
    inp.__ipDone = true;
    inp.__ipListId = listId;
    inp.removeAttribute("list"); // detach native dropdown

    // wrap
    var parent = inp.parentNode;
    var wrap = document.createElement("div");
    wrap.className = "ip-wrap";
    parent.insertBefore(wrap, inp);
    wrap.appendChild(inp);

    // inherit width from original context
    wrap.style.cssText = "position:relative;";

    // drop
    var drop = document.createElement("div");
    drop.className = "ip-drop";
    wrap.appendChild(drop);
    inp.__ipDrop = drop;

    inp.addEventListener("input",   function () { ipShow(this); });
    inp.addEventListener("focus",   function () { ipShow(this); });
    inp.addEventListener("blur",    function () {
      var self = this;
      setTimeout(function () { self.__ipDrop && self.__ipDrop.classList.remove("ip-open"); }, 200);
    });
    inp.addEventListener("keydown", function (e) { ipKey(this, e); });
  }

  /* ---- scan root for inputs to enhance ---- */
  function scan(root) {
    (root || document).querySelectorAll("input[list]").forEach(enhance);
  }

  /* ---- MutationObserver for dynamic content ---- */
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches("input[list]")) { enhance(n); }
        else { scan(n); }
      });
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    scan();
    obs.observe(document.body, { childList: true, subtree: true });
  });
  // also run immediately in case body is already available
  if (document.body) {
    scan();
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.ItemPicker = { scan: scan, enhance: enhance };
  console.log("[item-picker] ready — universal datalist enhancer");
})();
