/* FX-P87 — ชื่อ TH (ปุ่ม POS) ไม่เกิน 20; ชื่อ EN (บิลครัว) ทั้ง NPD ชื่อผง และ IT Settlement ไม่เกิน 40
   ชื่อ (EN) = ที่ไปโผล่บน "บิลครัว" · ชื่อ (TH) = ที่ไปโผล่บน "ปุ่ม POS"
   บังคับที่ช่องกรอก: maxlength + ตัวนับ + ขอบแดงเมื่อเกิน
   ทำงานกับหน้าที่โหลดทีหลังด้วย (SPA) ผ่าน MutationObserver */
(function () {
  var MAX = 20;
  var MAX_SETTLEMENT_EN = 40;
  /* ช่องที่นับเป็น "ชื่อสินค้า/ชื่อผง" — ทั้งฟอร์ม RD (NPD/ผง) และหน้า IT */
  var SEL = [
    '.f-eng', '.f-th', '.f-itemname', '.f-name',
    '.n-name', '.n-th', '.flv-eng', '.flv-th',
    'input[data-name-limit]',
    'input[name="itemNameEN"]', 'input[name="itemNameTH"]',
    'input[name="productName"]', 'input[name="productNameTH"]'
  ].join(',');

  var EN_SEL = '.f-itemname,.f-eng,.n-name,.flv-eng,input[name="itemNameEN"],input[name="productName"]';
  function limitFor(el) {
    var explicit = Number(el.getAttribute('data-name-limit'));
    if (explicit === MAX_SETTLEMENT_EN || explicit === MAX) return explicit;
    return el.matches && el.matches(EN_SEL) ? MAX_SETTLEMENT_EN : MAX;
  }

  function count(el) {
    var n = String(el.value || '').length;
    var max = limitFor(el);
    var b = el.parentElement && el.parentElement.querySelector('.pc-nlm-c');
    if (b) { b.textContent = n + '/' + max; b.style.color = n > max ? '#c62828' : (n >= max - 3 ? '#ef6c00' : '#8a8a8a'); }
    el.style.borderColor = n > max ? '#c62828' : '';
  }

  function attach(el) {
    if (!el || el.__nlm || el.type === 'hidden') return;
    el.__nlm = 1;
    var max = limitFor(el);
    el.setAttribute('maxlength', String(max));
    if (!el.title) el.title = 'ไม่เกิน ' + max + ' ตัวอักษร' + (max === MAX_SETTLEMENT_EN ? ' (Item Name EN · งาน IT Settlement)' : '');
    /* ตัวนับเล็ก ๆ ใต้ช่อง — ใส่เฉพาะที่พ่อแม่รองรับ (ไม่ทำ layout พัง) */
    var p = el.parentElement;
    if (p && !p.querySelector('.pc-nlm-c') && !/input-group/.test(p.className || '')) {
      var s = document.createElement('span');
      s.className = 'pc-nlm-c';
      s.style.cssText = 'font-size:.62rem;line-height:1;display:block;text-align:right;margin-top:2px;color:#8a8a8a';
      p.appendChild(s);
    }
    el.addEventListener('input', function () { count(el); });
    count(el);
  }

  function scan(root) {
    try { [].forEach.call((root || document).querySelectorAll(SEL), attach); } catch (e) {}
  }

  function boot() {
    scan(document);
    try {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          [].forEach.call(m.addedNodes || [], function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches(SEL)) attach(n);
            scan(n);
          });
        });
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.PC_NameLimit = {
    MAX: MAX,
    MAX_EN: MAX_SETTLEMENT_EN,
    MAX_TH: MAX,
    MAX_SETTLEMENT_EN: MAX_SETTLEMENT_EN,
    /* ตรวจก่อนส่ง — คืนรายการที่ยาวเกิน */
    check: function (list, context) {
      var max = /^(SETTLEMENT_)?EN$/.test(String(context || '').toUpperCase()) ? MAX_SETTLEMENT_EN : MAX;
      return (list || []).filter(function (v) { return String(v == null ? '' : v).trim().length > max; });
    }
  };
})();
