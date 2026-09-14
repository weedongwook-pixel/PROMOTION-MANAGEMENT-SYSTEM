/* voucher-tag.js — ป้ายบอกประเภท Voucher (B2B / B2C / Complain) บนหน้า IT + ติดตามงาน
   จับคู่แคมเปญกับ Voucher master (pc_vouchers) ด้วยชื่อ หรือ prefix/typeCode
   ใช้: window.PC_voucherTag(campaignObjOrName) → HTML badge (คืน '' ถ้าไม่ใช่ voucher) */
(function () {
  'use strict';
  var LABEL = { b2b: 'B2B', b2c: 'B2C', complain: 'Complain', comp: 'Comp', koi: 'KOI' };
  var COLOR = { b2b: '#7b3fb5', b2c: '#0a7d3c', complain: '#b03048', comp: '#6a4fb3', koi: '#5b3a1a' };

  function vouchers() { try { return JSON.parse(localStorage.getItem('pc_vouchers')) || []; } catch (e) { return []; } }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  function catOf(c) {
    var vs = vouchers(); if (!vs.length) return '';
    var name = norm(typeof c === 'string' ? c : (c && (c.campaign || c.name)));
    if (!name) return '';
    var codes = [];
    if (c && c.buttons) c.buttons.forEach(function (b) { codes.push(norm(b.promoCode || b.codePro || b.itemSetCode || b.shortName)); });
    var hit = vs.find(function (v) {
      if (!v) return false;
      var vn = norm(v.name);
      if (vn && vn === name) return true;
      var pf = norm(v.prefix || v.typeCode);
      if (pf && (name.indexOf(pf) > -1 || codes.indexOf(pf) > -1)) return true;
      return false;
    });
    return hit ? norm(hit.cat) : '';
  }

  window.PC_voucherCat = catOf;
  window.PC_voucherTag = function (c, opts) {
    opts = opts || {};
    var cat = catOf(c);
    if (!cat || !LABEL[cat]) return '';
    var st = 'display:inline-block;background:' + COLOR[cat] + ';color:#fff;font-weight:700;font-size:.66rem;line-height:1.45;border-radius:6px;padding:1px 8px;letter-spacing:.3px;white-space:nowrap;vertical-align:middle;' + (opts.style || '');
    return '<span class="pc-vtag" title="Voucher ' + LABEL[cat] + '" style="' + st + '"><i class="fas fa-gift" style="margin-right:4px"></i>Voucher ' + LABEL[cat] + '</span>';
  };
})();
