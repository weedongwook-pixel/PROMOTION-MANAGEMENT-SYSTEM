/* =====================================================================
   MonthPicker — upgrades every <input type="month"> into a
   [Year ▾] [Month ▾] dropdown pair (year selectable from a dropdown),
   while keeping the original element's id, .value ("YYYY-MM") and
   change/onchange behaviour fully intact. Drop-in: no page logic changes.

   - Reading el.value  -> still "YYYY-MM" (or "" when nothing picked)
   - Setting el.value  -> reflects into the dropdowns (programmatic sets work)
   - Respects min / max attrs (incl. ones set AFTER load) to disable options
   - Auto-upgrades inputs injected by the page loader (MutationObserver)
   ===================================================================== */
(function () {
  if (window.MonthPicker) return;

  var TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  // shared style (injected once)
  if (!document.getElementById('mp-style')) {
    var st = document.createElement('style');
    st.id = 'mp-style';
    st.textContent =
      '.mp-wrap{display:inline-flex;gap:6px;align-items:stretch;vertical-align:top;}' +
      '.mp-wrap select{min-width:0;}' +
      '.mp-wrap .mp-year{flex:0 0 auto;width:90px;}' +
      '.mp-wrap .mp-month{flex:1 1 auto;min-width:120px;}';
    document.head.appendChild(st);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function yOf(v) { var m = /^(\d{4})-(\d{2})$/.exec(v || ''); return m ? m[1] : ''; }
  function mOf(v) { var m = /^(\d{4})-(\d{2})$/.exec(v || ''); return m ? m[2] : ''; }

  function upgrade(input) {
    if (!input || input.__mp || input.type !== 'month') return;
    input.__mp = true;

    var now = new Date();
    var curY = now.getFullYear();

    // ---- backing store for the value (so programmatic .value still works) ----
    var _val = input.getAttribute('value') || input.value || '';

    // ---- build dropdowns; copy base classes so styling matches the page ----
    var baseCls = (input.className || '').replace(/form-control|form-select/g, '').trim();
    var wrap = document.createElement('span');
    wrap.className = 'mp-wrap';

    var ySel = document.createElement('select');
    ySel.className = ('form-select mp-year ' + baseCls).trim();
    var mSel = document.createElement('select');
    mSel.className = ('form-select mp-month ' + baseCls).trim();

    // optional vs required: a required field (min attr or `required`) skips the blank "all" row
    function optional() { return !(input.required || input.hasAttribute('required')); }

    function yearBounds() {
      var min = input.getAttribute('min'), max = input.getAttribute('max');
      var minY = min ? +min.slice(0, 4) : curY - 2;
      var maxY = max ? +max.slice(0, 4) : curY + 2;
      var vy = +yOf(_val);
      if (vy) { minY = Math.min(minY, vy); maxY = Math.max(maxY, vy); }
      if (minY > maxY) maxY = minY;
      return [minY, maxY];
    }

    function buildYears() {
      var b = yearBounds(), html = optional() ? '<option value="">ปี</option>' : '';
      for (var y = b[0]; y <= b[1]; y++) html += '<option value="' + y + '">' + (y + 543) + '</option>';
      ySel.innerHTML = html;
    }

    function buildMonths() {
      var html = optional() ? '<option value="">เดือน</option>' : '';
      var min = input.getAttribute('min'), max = input.getAttribute('max');
      var y = ySel.value;
      for (var i = 1; i <= 12; i++) {
        var mm = pad2(i), ym = y + '-' + mm, dis = '';
        if (y && min && ym < min) dis = ' disabled';
        if (y && max && ym > max) dis = ' disabled';
        html += '<option value="' + mm + '"' + dis + '>' + TH[i - 1] + '</option>';
      }
      mSel.innerHTML = html;
    }

    function reflect() {            // dropdowns <- _val
      buildYears();
      ySel.value = yOf(_val);
      buildMonths();
      mSel.value = mOf(_val);
    }

    function commit() {             // _val <- dropdowns, then notify the page
      var y = ySel.value, m = mSel.value;
      _val = (y && m) ? (y + '-' + m) : '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    ySel.addEventListener('change', function () { buildMonths(); mSel.value = mOf(_val) || ''; commit(); });
    mSel.addEventListener('change', commit);

    // intercept .value so existing code keeps working unchanged
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return _val; },
      set: function (v) { _val = v || ''; reflect(); }
    });

    // place dropdowns, hide native input (kept in DOM for id + value + handlers)
    input.style.display = 'none';
    if (input.parentNode) input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(ySel);
    wrap.appendChild(mSel);

    reflect();

    // re-evaluate option ranges if the page changes min/max after load
    new MutationObserver(reflect).observe(input, { attributes: true, attributeFilter: ['min', 'max'] });
  }

  function init(root) {
    (root || document).querySelectorAll('input[type="month"]').forEach(upgrade);
  }

  // auto-upgrade inputs that pages inject later
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.matches && n.matches('input[type="month"]')) upgrade(n);
        if (n.querySelectorAll) n.querySelectorAll('input[type="month"]').forEach(upgrade);
      }
    }
  });
  function start() { mo.observe(document.body, { childList: true, subtree: true }); init(); }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  window.MonthPicker = { init: init, upgrade: upgrade };
})();
