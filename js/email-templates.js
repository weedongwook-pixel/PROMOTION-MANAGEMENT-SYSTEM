/* ============================================================================
 *  js/email-templates.js — เทมเพลตอีเมล HTML (ทางการ) สำหรับส่งจริงผ่าน Outlook
 *  window.PC_EmailTpl.build(kind, sub, data) -> HTML string
 *    kind='promo_change' sub=EXTENDED|REDUCED|CANCELLED
 *    kind='copro'        sub=copro_submitted|copro_interfaced
 * ========================================================================== */
window.PC_EmailTpl = (function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var BRAND = "#eb2c39";   // แดงบริษัท Rocks Group — ใช้เป็นสีหัวอีเมลแจ้งเตือนทุกเคส
  var THEME = {
    EXTENDED: { bg: BRAND, fg: "#fff", icon: "⏳", label: "ขยายระยะเวลาโปรโมชั่น", tag: BRAND, tagfg: "#fff" },
    REDUCED: { bg: BRAND, fg: "#fff", icon: "⚠️", label: "ลดระยะเวลาโปรโมชั่น", tag: BRAND, tagfg: "#fff" },
    CANCELLED: { bg: BRAND, fg: "#fff", icon: "🛑", label: "ยกเลิกโปรโมชั่น", tag: BRAND, tagfg: "#fff" },
    copro_submitted: { bg: BRAND, fg: "#fff", icon: "🤝", label: "แจ้ง Co-Promotion ใหม่ (รอ IT เชื่อม ERP)", tag: BRAND, tagfg: "#fff" },
    copro_interfaced: { bg: BRAND, fg: "#fff", icon: "✅", label: "ยืนยัน Interface ERP แล้ว", tag: BRAND, tagfg: "#fff" },
  };
  function shell(t, inner) {
    return '<div style="font-family:Kanit,Arial,sans-serif;background:#f4f6f9;padding:24px 12px">' +
      '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">' +
      '<div style="background:' + t.bg + ';color:' + t.fg + ';padding:24px 30px;text-align:center">' +
      '<div style="font-family:Montserrat,Arial,sans-serif;font-weight:900;font-size:22px;letter-spacing:-1px">POTATO CORNER</div>' +
      '<div style="display:inline-block;margin-top:12px;padding:8px 18px;border-radius:30px;font-weight:700;font-size:15px;background:rgba(255,255,255,.18)">' + t.icon + " " + esc(t.label) + "</div></div>" +
      '<div style="padding:26px 30px">' + inner + "</div>" +
      '<div style="background:#f8f9fa;padding:16px 30px;text-align:center;font-size:11px;color:#adb5bd;border-top:1px solid #eef1f4">อีเมลอัตโนมัติจากระบบ Promotion Management System · Potato Corner<br>กรุณาอย่าตอบกลับอีเมลนี้ — หากมีข้อสงสัยติดต่อทีม IT / MKT</div>' +
      "</div></div>";
  }
  function rowTbl(rows) {
    return '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 14px">' +
      rows.filter(function (r) { return r[1] != null && r[1] !== "" && r[1] !== "-"; }).map(function (r) {
        return '<tr><td style="padding:8px 10px;border-bottom:1px solid #eef1f4;color:#6c757d;font-weight:600;width:150px;vertical-align:top">' + esc(r[0]) + '</td><td style="padding:8px 10px;border-bottom:1px solid #eef1f4">' + esc(r[1]) + "</td></tr>";
      }).join("") + "</table>";
  }
  function campBox(name, tagLabel, t, inner) {
    return '<div style="border:2px solid #1a1d20;border-radius:12px;overflow:hidden;margin-bottom:16px">' +
      '<div style="background:#1a1d20;color:#fff;font-weight:700;padding:12px 16px;font-size:15px">' + esc(name) +
      '<span style="float:right;font-size:11px;background:' + t.tag + ";color:" + t.tagfg + ';padding:3px 10px;border-radius:20px">' + esc(tagLabel) + "</span></div>" + (inner || "") + "</div>";
  }
  function promoChange(sub, d) {
    var t = THEME[sub] || THEME.EXTENDED;
    var lead = sub === "CANCELLED" ? "ขอแจ้งว่าโปรโมชั่นต่อไปนี้ถูก<b>ยกเลิก</b> กรุณานำปุ่มออกจากการขายบน POS ทันที และหยุดประชาสัมพันธ์"
      : sub === "REDUCED" ? "ขอแจ้งว่าโปรโมชั่นต่อไปนี้ถูก<b>ลดระยะเวลา</b> กรุณาปรับวันสิ้นสุดของปุ่มบน POS ให้ตรงกับวันใหม่"
        : "ขอแจ้งว่าโปรโมชั่นต่อไปนี้ได้รับการ<b>ขยายระยะเวลา</b> กรุณาตรวจสอบการตั้งค่าปุ่มบน POS ให้สอดคล้อง";
    var dateBlk = sub === "CANCELLED"
      ? '<div style="padding:16px;text-align:center;background:#fbeaec"><div style="font-size:11px;color:#adb5bd;font-weight:600">สถานะรายการ</div><div style="font-weight:700;color:#dc3545;font-size:16px">🛑 ยกเลิกการจัดรายการ</div></div>'
      : '<table style="width:100%;border-collapse:collapse"><tr><td style="width:50%;padding:16px;text-align:center"><div style="font-size:11px;color:#adb5bd;font-weight:600">วันสิ้นสุดเดิม</div><div style="font-weight:700;color:#adb5bd;text-decoration:line-through;font-family:monospace;font-size:16px">' + esc(d.oldEnd || "-") + '</div></td><td style="width:50%;padding:16px;text-align:center;background:#f8fdff"><div style="font-size:11px;color:#adb5bd;font-weight:600">วันสิ้นสุดใหม่</div><div style="font-weight:700;color:' + (sub === "REDUCED" ? "#dc3545" : "#2e934a") + ';font-family:monospace;font-size:16px">' + esc(d.newEnd || "-") + "</div></td></tr></table>";
    var inner = '<p style="font-size:14px;color:#495057;line-height:1.65;margin:0 0 18px">' + lead + "</p>" +
      campBox(d.campaign || "-", sub, t, dateBlk) +
      rowTbl([["ประเภทโปรโมชั่น", d.type], ["ผู้ดำเนินการ", d.by], ["วันที่แจ้ง", d.when]]) +
      (d.reason && sub !== "EXTENDED" ? '<div style="background:#fff5f5;border:1px solid #f3c2c2;border-left:5px solid #dc3545;border-radius:8px;padding:12px 15px"><div style="font-size:11px;font-weight:700;color:#dc3545">เหตุผล / หมายเหตุ</div><div style="font-size:13px;margin-top:4px">' + esc(d.reason) + "</div></div>" : "");
    return shell(t, inner);
  }
  function copro(sub, d) {
    var t = THEME[sub] || THEME.copro_submitted;
    var lead = sub === "copro_interfaced"
      ? "IT ยืนยันการเชื่อม ERP เรียบร้อยแล้ว — ทีมบัญชี (ACC) สามารถดำเนินการตั้งค่า/เรียกเก็บได้"
      : "มีโปรโมชั่นร่วมพาร์ทเนอร์ (Co-Promotion) ใหม่จากทีม MKT — รอ IT ยืนยันการเชื่อม ERP · ทีมบัญชี (ACC) เตรียมข้อมูลเรียกเก็บ";
    var inner = '<p style="font-size:14px;color:#495057;line-height:1.65;margin:0 0 18px">' + lead + "</p>" +
      campBox(d.name || d.campaign || "-", "CO-PROMO", t, "") +
      rowTbl([["โค้ด (CMPOS Code)", d.code], ["Type Promotion", d.promoType], ["Brand / พาร์ทเนอร์", d.brand],
      ["เรียกเก็บในนาม", d.billing], ["Payment Type", d.payment], ["เงื่อนไขการจ่าย", d.cond],
      ["ราคา Inc. VAT", d.priceInc], ["ราคา Exc. VAT", d.priceExc], ["SO No.", d.so], ["Quota", d.quota],
      ["ช่วงเวลา", d.period], ["รายละเอียด", d.detail], ["หมายเหตุ", d.remark], ["ยืนยันโดย", d.by]]);
    return shell(t, inner);
  }
  function build(kind, sub, d) {
    d = d || {};
    if (kind === "promo_change") return promoChange(sub, d);
    if (kind === "copro") return copro(sub, d);
    return "";
  }
  return { build: build };
})();
