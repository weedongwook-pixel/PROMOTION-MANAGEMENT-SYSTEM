/* ===== PCLock — บังคับใช้ "ล็อกแจ้งล่วงหน้า" รายส่วน (อ่านค่าจาก pc_lock_settings) =====
 * ตั้งค่าได้ที่หน้า "ตั้งค่าล็อกการแจ้งล่วงหน้า" (Code Lock Settings.html)
 * areaId: codeAdd · codeRemove · memberCode · createPromo · coupon · billDiscount ·
 *         voucher · npd · flavor · memo · rdSticker · rdCancel
 *
 * วิธีใช้ในฟอร์ม:
 *   PCLock.apply('createPromo', document.getElementById('startDate'));  // set .min + clamp
 *   if (!PCLock.ok('createPromo', startVal)) { ...บล็อกการ submit... }
 *   PCLock.labelHTML('createPromo')  // ป้ายอธิบายไว้โชว์ใต้ช่อง
 */
(function () {
  var LKEY = 'pc_lock_settings';
  var CKEY = 'pc_code_settings';
  var TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  function def(id) { return { enabled: id === 'codeAdd', lead: 3, rec: 5, weekend: false }; }

  function get(areaId) {
    var d = def(areaId), s = null;
    try { s = JSON.parse(localStorage.getItem(LKEY)); } catch (e) {}
    if (s && typeof s === 'object' && s[areaId] && typeof s[areaId] === 'object') {
      var a = s[areaId];
      return {
        enabled: !!a.enabled,
        lead: typeof a.lead === 'number' ? a.lead : d.lead,
        rec: typeof a.rec === 'number' ? a.rec : d.rec,
        weekend: typeof a.weekend === 'boolean' ? a.weekend : d.weekend
      };
    }
    // backward-compat: ยังไม่เคยตั้งค่าใหม่ → codeAdd อ่านจาก pc_code_settings เดิม
    if (areaId === 'codeAdd') {
      var c = null; try { c = JSON.parse(localStorage.getItem(CKEY)); } catch (e) {}
      if (c && typeof c === 'object') {
        return {
          enabled: (typeof c.leadDays === 'number' ? c.leadDays : 3) > 0 ? true : true, // codeAdd ล็อกโดยปริยาย
          lead: typeof c.leadDays === 'number' ? c.leadDays : 3,
          rec: typeof c.recDays === 'number' ? c.recDays : 5,
          weekend: typeof c.countWeekend === 'boolean' ? c.countWeekend : false
        };
      }
    }
    return d;
  }

  function isWeekend(d) { var w = d.getDay(); return w === 0 || w === 6; }
  function toISO(d) { var z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); }

  function minDate(areaId) {
    var a = get(areaId);
    var d = new Date(); d.setHours(0, 0, 0, 0);
    if (!a.enabled) return d;
    var add = 0, lead = Math.max(0, a.lead | 0), guard = 0;
    while (add < lead && guard < 600) { d.setDate(d.getDate() + 1); if (a.weekend || !isWeekend(d)) add++; guard++; }
    return d;
  }
  function minStartISO(areaId) { var a = get(areaId); return a.enabled ? toISO(minDate(areaId)) : ''; }

  function fmtTH(d) { return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); }

  /* ตั้ง min ให้ <input type=date> + ดันค่าที่เร็วเกินไปขึ้นมาให้พอดี min · คืน ISO ของ min ('' = ไม่ล็อก) */
  function apply(areaId, inputEl) {
    if (!inputEl) return '';
    var iso = minStartISO(areaId);
    if (!iso) { inputEl.removeAttribute('min'); return ''; }
    inputEl.min = iso;
    if (inputEl.value && inputEl.value < iso) inputEl.value = iso;
    return iso;
  }
  /* ใช้ได้หรือไม่ (true = ผ่าน) — startISO ต้องไม่เร็วกว่า min */
  function ok(areaId, startISO) {
    var iso = minStartISO(areaId);
    if (!iso) return true;
    return !!startISO && String(startISO) >= iso;
  }
  function leadText(areaId) {
    var a = get(areaId);
    if (!a.enabled) return '';
    return 'ต้องแจ้งล่วงหน้าอย่างน้อย ' + Math.max(0, a.lead | 0) + ' วัน' + (a.weekend ? '' : 'ทำการ');
  }
  function labelHTML(areaId) {
    var a = get(areaId);
    if (!a.enabled) return '';
    var iso = minStartISO(areaId);
    var d = iso ? new Date(iso + 'T00:00:00') : new Date();
    return '<span style="display:inline-flex;align-items:center;gap:7px;background:#fff8ec;border:1px solid #f3d99a;border-radius:9px;padding:6px 12px;font-size:.84rem;color:#9a6700;font-weight:600">' +
      '<i class="fas fa-lock" style="color:#c9870a"></i>' + leadText(areaId) +
      ' · เร็วสุด <b style="color:#1a1d20">' + fmtTH(d) + '</b></span>';
  }

  window.PCLock = {
    get: get, minStartISO: minStartISO, minDate: minDate,
    apply: apply, ok: ok, leadText: leadText, labelHTML: labelHTML, fmtTH: fmtTH
  };
})();
