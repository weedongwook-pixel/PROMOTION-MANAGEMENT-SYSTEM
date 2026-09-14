/* ============================================================================
 *  EASY DATE PICKER (global)
 *  แทนปฏิทิน native ของ <input type="date"> ทั้งระบบ ด้วย popup ที่มี
 *  dropdown ปี + เดือน (เลือกปีได้ทันที) + แถบวัน.
 *  - ซ่อนไอคอนปฏิทิน native (CSS) เพื่อไม่ให้ปฏิทินเก่าเด้งซ้อน
 *  - ทำงานกับ input ที่โหลดมาทีหลัง (event delegation)
 *  - เขียนค่ากลับ ISO (yyyy-mm-dd) + dispatch input/change → handler เดิมทำงานปกติ
 *  - API: window.EasyDP.open(anchorEl, currentISO|display, function(isoOrEmpty){...})
 *  - ยกเว้น disabled / readonly / [data-no-easydp]
 *  รองรับ TH/EN ตาม window.PC_LANG หรือ <html data-lang>.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__easyDPLoaded) return; window.__easyDPLoaded = true;

  var MON_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var MON_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  var DOW_EN = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  var pop = null, active = null;   // active = { anchor, onPick }
  var st = { y: 0, mo: 0, d: 0 };

  function isEN() {
    var l = (window.PC_LANG || document.documentElement.getAttribute('data-lang') || '').toString().toLowerCase();
    return l.indexOf('en') === 0;
  }
  function pad(n) { return ('0' + n).slice(-2); }
  function toISO(y, mo, d) { return y + '-' + pad(mo + 1) + '-' + pad(d); }
  function parse(v) {
    v = String(v == null ? '' : v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
    var t = /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})$/.exec(v);
    if (t) { var y = t[3].length === 2 ? 2000 + (+t[3]) : +t[3]; return { y: y, mo: (+t[2]) - 1, d: +t[1] }; }
    var n = new Date();
    return { y: n.getFullYear(), mo: n.getMonth(), d: 0 };
  }

  function injectCSS() {
    if (document.getElementById('easy-dp-css')) return;
    var s = document.createElement('style'); s.id = 'easy-dp-css';
    s.textContent =
      /* คงไอคอนปฏิทิน native ไว้ (แบบเดิม) แต่กดไม่เปิด native — คลิกทะลุไปที่ input → เปิด picker ใหม่ */
      'input[type=date]::-webkit-calendar-picker-indicator{opacity:1;cursor:pointer;pointer-events:none}' +
      'input[type=date]::-webkit-inner-spin-button{display:none!important}' +
      'input[type=date]::-webkit-clear-button{display:none!important}' +
      'input[type=date]{cursor:pointer}' +
      /* popup */
      '.easy-dp{position:absolute;z-index:2147483000;display:none;background:#fff;border:1px solid #dde2e7;border-radius:13px;box-shadow:0 12px 34px rgba(0,0,0,.18);padding:11px;width:262px;font-family:inherit;-webkit-font-smoothing:antialiased}' +
      '.easy-dp *{box-sizing:border-box}' +
      '.easy-dp .edhead{display:flex;gap:6px;align-items:center;margin-bottom:9px}' +
      '.easy-dp .ednav{flex:0 0 auto;width:28px;height:32px;border:1.4px solid #dde2e7;background:#fff;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:800;color:#2e934a;line-height:1;padding:0}' +
      '.easy-dp .ednav:hover{background:#eafaf1;border-color:#bfe6cf}' +
      '.easy-dp select{flex:1;min-width:0;border:1.4px solid #dde2e7;border-radius:8px;padding:6px 7px;font-family:inherit;font-size:.83rem;font-weight:700;color:#1a1d20;background:#fff;cursor:pointer}' +
      '.easy-dp select.edy{flex:0 0 76px}' +
      '.easy-dp select:focus{outline:none;border-color:#2e934a}' +
      '.easy-dp .edgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}' +
      '.easy-dp .edw{text-align:center;font-size:.66rem;color:#9aa1aa;font-weight:800;padding:3px 0}' +
      '.easy-dp .edd{text-align:center;padding:7px 0;font-size:.82rem;border-radius:8px;cursor:pointer;color:#1a1d20;font-weight:600}' +
      '.easy-dp .edd:hover{background:#eafaf1}' +
      '.easy-dp .edd.today{box-shadow:inset 0 0 0 1.4px #bfe6cf}' +
      '.easy-dp .edd.on{background:#2e934a;color:#fff;font-weight:800}' +
      '.easy-dp .edfoot{display:flex;justify-content:space-between;gap:8px;margin-top:9px}' +
      '.easy-dp .edfoot button{flex:1;border:none;background:#f1f4f7;border-radius:8px;padding:6px 10px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;color:#5a616b}' +
      '.easy-dp .edfoot button:hover{background:#e2e7ec}' +
      '.easy-dp .edfoot button.edtoday{background:#eafaf1;color:#1d7a4d}';
    (document.head || document.documentElement).appendChild(s);
  }

  function ensure() {
    if (pop) return;
    injectCSS();
    pop = document.createElement('div');
    pop.className = 'easy-dp';
    document.body.appendChild(pop);
    pop.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  function render() {
    var en = isEN(), MON = en ? MON_EN : MON_TH, DOW = en ? DOW_EN : DOW_TH;
    var now = new Date(), yN = now.getFullYear();
    var tISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
    var ys = '';
    for (var y = yN - 25; y <= yN + 25; y++) ys += '<option value="' + y + '"' + (y === st.y ? ' selected' : '') + '>' + y + '</option>';
    var ms = MON.map(function (n, i) { return '<option value="' + i + '"' + (i === st.mo ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var first = new Date(st.y, st.mo, 1).getDay();
    var dim = new Date(st.y, st.mo + 1, 0).getDate();
    var cells = DOW.map(function (d) { return '<div class="edw">' + d + '</div>'; }).join('');
    var i;
    for (i = 0; i < first; i++) cells += '<div></div>';
    for (var dd = 1; dd <= dim; dd++) {
      var cur = toISO(st.y, st.mo, dd);
      var cls = 'edd' + (dd === st.d ? ' on' : '') + (cur === tISO ? ' today' : '');
      cells += '<div class="' + cls + '" data-d="' + dd + '">' + dd + '</div>';
    }
    pop.innerHTML =
      '<div class="edhead"><button type="button" class="ednav" data-nav="-1">\u2039</button>' +
      '<select class="edm">' + ms + '</select>' +
      '<select class="edy">' + ys + '</select>' +
      '<button type="button" class="ednav" data-nav="1">\u203a</button></div>' +
      '<div class="edgrid">' + cells + '</div>' +
      '<div class="edfoot"><button type="button" class="edtoday" data-act="today">' + (en ? 'Today' : 'วันนี้') + '</button>' +
      '<button type="button" data-act="clear">' + (en ? 'Clear' : 'ล้าง') + '</button></div>';
  }

  function place(anchor) {
    var r = anchor.getBoundingClientRect();
    pop.style.display = 'block';
    var pw = pop.offsetWidth || 262, ph = pop.offsetHeight || 300;
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var left = r.left + window.scrollX;
    if (left + pw > window.scrollX + vw - 8) left = window.scrollX + vw - pw - 8;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    var top = r.bottom + window.scrollY + 4;
    if (r.bottom + ph > vh - 8 && r.top > ph) top = r.top + window.scrollY - ph - 4;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  // public open — anchor near element, seed from iso/display, onPick(isoOrEmpty)
  function open(anchor, seed, onPick) {
    ensure();
    active = { anchor: anchor, onPick: onPick };
    var p = parse(seed);
    st.y = p.y; st.mo = p.mo; st.d = p.d;
    render(); place(anchor);
  }
  function close() { if (pop) pop.style.display = 'none'; active = null; }
  function commit(v) {
    if (!active) return;
    var cb = active.onPick;
    close();
    if (cb) { try { cb(v); } catch (e) {} }
  }

  // native <input type=date>: intercept click → open ours, write back on pick
  document.addEventListener('mousedown', function (e) {
    var inp = e.target.closest ? e.target.closest('input[type=date]') : null;
    if (inp && !inp.disabled && !inp.readOnly && !inp.hasAttribute('data-no-easydp')) {
      e.preventDefault();
      try { inp.blur(); } catch (x) {}
      open(inp, inp.value, function (v) {
        inp.value = v;
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) {}
        try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (x) {}
      });
      return;
    }
    if (pop && pop.style.display === 'block' && !pop.contains(e.target)) close();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (pop && pop.style.display === 'block' && e.key === 'Escape') close();
  });

  document.addEventListener('click', function (e) {
    if (!pop || pop.style.display !== 'block') return;
    var t = e.target;
    if (t.classList && t.classList.contains('edd') && t.dataset.d) {
      st.d = +t.dataset.d; commit(toISO(st.y, st.mo, st.d));
    } else if (t.classList && t.classList.contains('ednav')) {
      st.mo += (+t.dataset.nav);
      if (st.mo < 0) { st.mo = 11; st.y--; }
      if (st.mo > 11) { st.mo = 0; st.y++; }
      render();
    } else if (t.dataset && t.dataset.act === 'today') {
      var n = new Date(); commit(toISO(n.getFullYear(), n.getMonth(), n.getDate()));
    } else if (t.dataset && t.dataset.act === 'clear') {
      commit('');
    }
  });

  document.addEventListener('change', function (e) {
    if (!pop || pop.style.display !== 'block') return;
    if (e.target.classList && e.target.classList.contains('edy')) { st.y = +e.target.value; render(); }
    else if (e.target.classList && e.target.classList.contains('edm')) { st.mo = +e.target.value; render(); }
  });

  window.addEventListener('scroll', function () { if (active) close(); }, true);
  window.addEventListener('resize', function () { if (active) close(); });

  window.EasyDP = { open: open, close: close };

  // inject the native-picker-hiding CSS immediately (not lazily) so old pickers never show
  if (document.head || document.documentElement) injectCSS();
  else document.addEventListener('DOMContentLoaded', injectCSS);
})();
