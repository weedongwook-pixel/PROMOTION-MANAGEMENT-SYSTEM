/* ============================================================================
 *  js/calendar-reminder.js — แจ้งเตือนเข้าปฏิทิน (ใช้ค่าจาก pc_calendar_settings จริง)
 *  ---------------------------------------------------------------------------
 *  window.PC_Calendar
 *    .enabled()            เปิดใช้ไหม
 *    .enabledFor(key)      เหตุการณ์นี้เปิดลงปฏิทินไหม (promo_start/promo_end/code_expire/...)
 *    .ics(ev)              สร้างสตริง .ics (ใส่เตือนล่วงหน้า + เวลา จาก settings)
 *    .download(ev)         โหลดไฟล์ .ics (เปิด Outlook/Apple ได้)
 *    .googleLink(ev)       ลิงก์เพิ่มเข้า Google Calendar
 *  ev = { title, date:'YYYY-MM-DD'|'DD/MM/YYYY', time?, desc?, leads?, key?, file? }
 * ========================================================================== */
(function () {
  "use strict";
  var KEY = "pc_calendar_settings";
  function settings() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.events) return s; } catch (e) {} return null; }
  function enabled() { var s = settings(); return s ? s.enabled !== false : true; }
  function enabledFor(k) { var s = settings(); if (!s) return false; return s.enabled !== false && !!(s.events && s.events[k]); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function icsDate(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }
  function toISO(dt) {
    dt = String(dt == null ? "" : dt).trim();
    var m = dt.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = dt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
    return "";
  }
  function ics(ev) {
    var s = settings() || {}; var iso = toISO(ev.date); if (!iso) return "";
    var time = ev.time || s.time || "09:00";
    var start = new Date(iso + "T" + time + ":00"); var end = new Date(start.getTime() + 30 * 60000);
    var leads = ev.leads || s.leads || [1];
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Potato Corner//Promotion//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:pc-" + Date.now() + Math.random().toString(36).slice(2, 6) + "@promo", "DTSTAMP:" + icsDate(new Date()),
      "DTSTART:" + icsDate(start), "DTEND:" + icsDate(end), "SUMMARY:" + (ev.title || "Potato Corner"),
      "DESCRIPTION:" + String(ev.desc || "").replace(/\n/g, "\\n")];
    (leads || []).filter(function (x) { return x > 0; }).forEach(function (d) { lines.push("BEGIN:VALARM", "TRIGGER:-P" + d + "D", "ACTION:DISPLAY", "DESCRIPTION:" + (ev.title || ""), "END:VALARM"); });
    lines.push("END:VEVENT", "END:VCALENDAR"); return lines.join("\r\n");
  }
  function download(ev) {
    var s = ics(ev); if (!s) { if (window.Swal) Swal.fire("ไม่มีวันที่", "รายการนี้ไม่มีวันที่สำหรับลงปฏิทิน", "info"); return; }
    var blob = new Blob([s], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (ev.file || "promo-reminder") + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
  }
  function googleLink(ev) {
    var iso = toISO(ev.date); if (!iso) return ""; var s = settings() || {};
    var d = iso.replace(/-/g, ""); var t = (ev.time || s.time || "09:00").replace(":", "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(ev.title || "") +
      "&dates=" + d + "T" + t + "00/" + d + "T" + t + "00&details=" + encodeURIComponent(ev.desc || "");
  }
  window.PC_Calendar = { settings: settings, enabled: enabled, enabledFor: enabledFor, ics: ics, download: download, googleLink: googleLink };
})();
