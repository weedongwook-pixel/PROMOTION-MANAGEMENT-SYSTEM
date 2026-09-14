/* ===== CENTRAL FLAVOR (ผง) ORDER ============================================
   ลำดับกลางของ "ผง" ใช้ร่วมทุกหน้าที่แสดงรายการผง/สินค้า
   core product = ล็อกลำดับตามนี้ตลอด:
     Cheese → BBQ → Sour Cream → Chilli BBQ → Truffle +10 → Truffle 2
            → Sweet Corn → Salted
   - ผงที่เพิ่มใหม่ (ไม่ใช่ core) → ต่อท้ายหลัง Salted ตามลำดับที่เพิ่ม
   - "No Flavor" → อยู่ท้ายสุดเสมอ
   API:
     window.PC_FLAVOR_ORDER            → core list (display names, ordered)
     window.pcFlavorTier(name)         → {tier, idx}  (tier เล็ก = มาก่อน)
     window.pcFlavorSort(arr, getName) → คืน array ใหม่ที่เรียงแล้ว (stable)
     window.pcFlavorCmp(getName)       → comparator(a,b) สำหรับ .sort()
   ============================================================================ */
(function (w) {
  // core ผง ตามลำดับ (display)
  var CORE = ['Cheese', 'BBQ', 'Sour Cream', 'Chilli BBQ', 'Truffle +10', 'Truffle 2', 'Sweet Corn', 'Salted'];
  w.PC_FLAVOR_ORDER = CORE.slice();

  // normalize: lowercase, ตัดทุกอย่างที่ไม่ใช่ a-z/0-9 (รวม space, +) ออก
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* รูปแบบจับ core — เรียงจาก "เจาะจงสุด" ไปทั่วไป (chilli ก่อน bbq, truffle+10 ก่อน truffle2) */
  var PATTERNS = [
    { idx: 3, keys: ['chillibbq', 'chillbbq', 'chilibbq', 'chilbbq'] },   // Chilli BBQ
    { idx: 2, keys: ['sourcream'] },                                       // Sour Cream
    { idx: 6, keys: ['sweetcorn'] },                                       // Sweet Corn
    { idx: 4, keys: ['truffle10', 'truffleplus10'] },                      // Truffle +10
    { idx: 5, keys: ['truffle2'] },                                        // Truffle 2
    { idx: 0, keys: ['cheese'] },                                          // Cheese
    { idx: 7, keys: ['salted'] },                                          // Salted
    { idx: 1, keys: ['bbq'] }                                              // BBQ (generic — เช็คทีหลังสุด)
  ];
  function isNoFlavor(n) { return n.indexOf('noflavor') === 0 || n.indexOf('nofavor') === 0 || n === 'noflavour' || n.indexOf('plain') === 0; }

  // tier: 0..7 = core · 8 = ผงใหม่ (non-core) · 9 = No Flavor (ท้ายสุด)
  w.pcFlavorTier = function (name) {
    var n = norm(name);
    if (!n) return { tier: 8, idx: 8 };
    if (isNoFlavor(n)) return { tier: 9, idx: 9 };
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      for (var k = 0; k < p.keys.length; k++) {
        if (n.indexOf(p.keys[k]) !== -1) return { tier: p.idx, idx: p.idx };
      }
    }
    return { tier: 8, idx: 8 };  // ผงใหม่ → หลัง Salted, ก่อน No Flavor
  };

  // comparator: tier ก่อน, แล้ว stable ตามลำดับเดิม (index ที่ฝังไว้)
  w.pcFlavorCmp = function (getName) {
    getName = getName || function (x) { return x; };
    return function (a, b) {
      var ta = w.pcFlavorTier(getName(a)).tier, tb = w.pcFlavorTier(getName(b)).tier;
      if (ta !== tb) return ta - tb;
      return (a.__fo || 0) - (b.__fo || 0);  // คงลำดับเดิมใน tier เดียวกัน
    };
  };

  // เรียง array (ไม่แตะ original) — stable: ผงใหม่ใน tier 8 คงลำดับเดิมที่เพิ่มเข้ามา
  w.pcFlavorSort = function (arr, getName) {
    if (!Array.isArray(arr)) return arr;
    getName = getName || function (x) { return x; };
    var decorated = arr.map(function (x, i) {
      return { x: x, t: w.pcFlavorTier(getName(x)).tier, i: i };
    });
    decorated.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    return decorated.map(function (d) { return d.x; });
  };
})(window);
