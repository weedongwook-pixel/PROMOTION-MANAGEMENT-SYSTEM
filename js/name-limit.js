/* FX-P87 — ชื่อสินค้า/ชื่อผง ไม่เกิน 20 ตัวอักษร
   ชื่อ (EN) = ที่ไปโผล่บน "บิลครัว" · ชื่อ (TH) = ที่ไปโผล่บน "ปุ่ม POS"
   ยาวเกินนี้ระบบปลายทางตัดทิ้ง → บังคับที่ช่องกรอกเลย: maxlength + ตัวนับ + ขอบแดงเมื่อเต็ม
   ทำงานกับหน้าที่โหลดทีหลังด้วย (SPA) ผ่าน MutationObserver */
(function () {
  var MAX = 20;
  /* ช่องที่นับเป็น "ชื่อสินค้า/ชื่อผง" — ทั้งฟอร์ม RD (NPD/ผง) และหน้า IT */
  var SEL = [
    '.f-eng', '.f-th', '.f-itemname', '.f-name',
    '.n-name', '.n-th', '.flv-eng', '.flv-th',
    'input[data-name-limit]',
    'input[name="itemNameEN"]', 'input[name="itemNameTH"]',
    'input[name="productName"]', 'input[name="productNameTH"]'
  ].join(',');

  function count(el) {
    var n = String(el.value || '').length;
    var b = el.parentElement && el.parentElement.querySelector('.pc-nlm-c');
    if (b) { b.textContent = n + '/' + MAX; b.style.color = n >= MAX ? '#c62828' : (n >= MAX - 3 ? '#ef6c00' : '#8a8a8a'); }
    el.style.borderColor = n >= MAX ? '#c62828' : '';
  }

  function attach(el) {
    if (!el || el.__nlm || el.type === 'hidden') return;
    el.__nlm = 1;
    el.setAttribute('maxlength', String(MAX));
    el.title = 'ไม่เกิน ' + MAX + ' ตัวอักษร (EN = บิลครัว · TH = ปุ่ม POS)';
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
    /* ตรวจก่อนส่ง — คืนรายการที่ยาวเกิน */
    check: function (list) {
      return (list || []).filter(function (v) { return String(v == null ? '' : v).trim().length > MAX; });
    }
  };
})();
