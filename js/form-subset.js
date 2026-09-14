/* FORM SUBSET — โมดูลกลาง: ให้ฟอร์มกรอกโปรโมชั่น (Coupon / Bill / Voucher) เลือก "กลุ่มสินค้า (Subset)" ได้
   · คุมการแสดงผลจากหน้า Form Display (pc_subset_forms[ss][formKey])
   · ค่าเริ่มต้น = ปิด (OFF) สำหรับ coupon/bill/voucher → คงพฤติกรรมเดิม (ไม่มีตัวเลือก Subset) จนกว่าแอดมินจะเปิด
   · Proposal/NPD/Flavor ใช้ฟังก์ชันของตัวเอง (default แยก) — โมดูลนี้ไม่ไปยุ่ง
   โหลดใน shell CORE ต่อจาก voucher-tag.js */
(function () {
  function ls(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* subset `ss` เปิดให้แสดงในฟอร์ม `formKey` ไหม? (default = ปิด สำหรับฟอร์มกรอกโปรฯ) */
  function shown(ss, formKey) {
    var m = ls('pc_subset_forms', {}) || {};
    var o = m[ss];
    if (o && o[formKey] !== undefined) return !!o[formKey];
    return false;
  }
  /* รายการ subset ที่เปิดให้ฟอร์มนี้ (เฉพาะ Active + ติ๊กเปิด) */
  function list(formKey) {
    return (window.PC_SUBSET_MASTER || []).filter(function (s) {
      if (String(s.status || 'Active').toLowerCase() === 'inactive') return false;
      return shown(s.ssCode, formKey);
    });
  }
  function price(ss) {
    var m = ls('pc_subset_price', {}) || {}; var v = m[ss];
    if (v != null && v !== '') return Number(v) || 0;
    var s = (window.PC_SUBSET_MASTER || []).find(function (x) { return x.ssCode === ss; });
    return (s && s.price != null && s.price !== '') ? (Number(s.price) || 0) : 0;
  }
  function meta(ss) { return (window.PC_SUBSET_MASTER || []).find(function (x) { return x.ssCode === ss; }) || {}; }
  /* สมาชิกในชุด (ผง + สินค้าที่ผูก) */
  function members(ss) {
    var rec = (window.PC_SUBSET_FLAVORS || {})[ss] || {};
    var out = (rec.flavors || []).map(function (f) { return { code: f.code || '', name: f.flavor || f.name || '' }; });
    try {
      var SI = ls('pc_subset_items', {}) || {}; var codes = SI[ss] || []; var byCode = {};
      (window.PC_ITEM_MASTER || window.masterData || []).forEach(function (it) { byCode[String(it.itemCode)] = it; });
      var seen = {}; out.forEach(function (x) { seen[String(x.code)] = 1; });
      codes.forEach(function (c) { if (seen[String(c)]) return; var it = byCode[String(c)]; out.push({ code: c, name: it ? (it.itemNameEN || it.itemNameTH || '') : '' }); });
    } catch (e) { }
    return out;
  }
  function peek(ss) {
    var fl = members(ss); var nm = (meta(ss).name) || ss;
    var rows = fl.length
      ? fl.map(function (f, i) { return '<tr><td style="padding:5px 8px;color:#8a9099">' + (i + 1) + '</td><td style="padding:5px 8px;font-family:monospace;color:#2c4a82">' + esc(f.code || '-') + '</td><td style="padding:5px 8px;text-align:left">' + esc(f.name || '') + '</td></tr>'; }).join('')
      : '<tr><td colspan="3" style="padding:14px;color:#9aa1aa">— ยังไม่ได้ผูกสินค้าในชุดนี้ (ผูกได้ที่ Products → ผูกสินค้า) —</td></tr>';
    var html = '<div style="text-align:left"><div style="font-size:.82rem;color:#6c757d;margin-bottom:8px"><i class="fas fa-circle-info me-1"></i>รายการที่เลือกได้ในชุดนี้ (ดูอย่างเดียว)</div><div style="max-height:340px;overflow:auto;border:1px solid #e7eaee;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:.84rem"><thead style="background:#1a1d20;color:#fff;position:sticky;top:0"><tr><th style="padding:6px 8px;text-align:left;width:34px">#</th><th style="padding:6px 8px;text-align:left;width:90px">Code</th><th style="padding:6px 8px;text-align:left">รายการ</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    if (window.Swal) Swal.fire({ title: '<span style="font-size:1rem"><i class="fas fa-layer-group me-1" style="color:#2e934a"></i> ' + esc(ss) + ' · ' + esc(nm) + ' (' + fl.length + ')</span>', html: html, width: 560, confirmButtonText: 'ปิด', confirmButtonColor: '#1a1d20' });
  }

  /* <option> สำหรับ category <select> — โผล่เฉพาะเมื่อมี subset เปิดให้ฟอร์มนี้ (ไม่มี = ไม่โผล่ = พฤติกรรมเดิม) */
  function optionHTML(formKey) {
    return list(formKey).length ? '<option value="__SUBSET__">🧂 เลือกสินค้าเป็นกลุ่ม (Subset)</option>' : '';
  }
  /* <option>s สำหรับ datalist ค้นหา */
  function dlOptions(formKey) {
    return list(formKey).map(function (s) {
      var c = members(s.ssCode).length, p = price(s.ssCode);
      return '<option value="' + esc(s.name || s.ssCode) + '">' + esc(s.ssCode) + ' · ' + c + ' รายการ' + (p ? (' · ฿' + p) : '') + '</option>';
    }).join('');
  }
  /* แปลงค่าที่พิมพ์/เลือก → subset record */
  function resolve(formKey, val) {
    return list(formKey).find(function (s) { return String(s.name || '') === val || String(s.ssCode) === String(val); }) || null;
  }

  window.PC_FormSubset = {
    shown: shown, list: list, price: price, members: members, peek: peek,
    optionHTML: optionHTML, dlOptions: dlOptions, resolve: resolve, esc: esc
  };
})();
