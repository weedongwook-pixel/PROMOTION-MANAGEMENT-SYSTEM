/* ============================================================================
 *  js/save-verify.js — ยืนยันว่า "บันทึกจริง" ตั้งแต่ต้นทางที่กรอก
 *  ปัญหาเดิม: ฟอร์มขึ้น "ส่งเรียบร้อย + เลขที่เอกสาร" แต่ข้อมูลไม่เข้าระบบ
 *  (ตัวซิงค์ดึงของจากคลาวด์มาทับก่อน push ขึ้นทัน) → ผู้ใช้ไม่รู้ตัว
 *
 *  วิธีทำงาน: หลังบันทึก → อ่านกลับจากระบบว่ามีจริงไหม (retry สั้น ๆ)
 *    เจอ    → ขึ้น "บันทึกเข้าระบบแล้ว" ตามปกติ
 *    ไม่เจอ → เตือนแดงทันที + เก็บสำเนาไว้ในเครื่อง (pc_save_failed) ให้กู้/ส่งซ้ำได้
 * ========================================================================== */
(function () {
  'use strict';
  var FAILK = 'pc_save_failed';
  function ls(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function run(fn) {
    return new Promise(function (res) {
      try { google.script.run.withSuccessHandler(res).withFailureHandler(function () { res(null); })[fn](); }
      catch (e) { res(null); }
    });
  }

  /* ตัวตรวจต่อชนิดงาน — คืน true ถ้าเจอในระบบ */
  var CHECKERS = {
    flavor: async function (key) {
      var l = await run('getFlavorList') || [];
      return l.some(function (x) { return String(x.id) === String(key) || String(x.project || '') === String(key); });
    },
    npd: async function (key) {
      var l = await run('getNpdList') || [];
      return l.some(function (x) { return String(x.id) === String(key) || String(x.project || '') === String(key); });
    },
    campaign: async function (key) {
      var l = await run('getAllCampaignData') || [];
      return l.some(function (x) { return String(x.campaign || '').trim() === String(key).trim(); });
    }
  };

  /* ตรวจซ้ำ 3 รอบ (0.4s / 1.2s / 2.5s) — เผื่อ backend เขียนช้า */
  async function confirmSaved(kind, key) {
    var check = CHECKERS[kind]; if (!check) return true;
    var waits = [400, 800, 1300];
    for (var i = 0; i < waits.length; i++) {
      await new Promise(function (r) { setTimeout(r, waits[i]); });
      try { if (await check(key)) return true; } catch (e) {}
    }
    return false;
  }

  function keepCopy(kind, key, payload, docId) {
    var all = ls(FAILK, []);
    all.unshift({ at: new Date().toISOString(), kind: kind, key: String(key), docId: docId || '', payload: payload || null });
    save(FAILK, all.slice(0, 20));
  }

  /* ===== ตัวหลักที่ฟอร์มเรียกใช้ =====
     PC_SaveVerify.after({ kind, key, docId, payload, okTitle, okHtml, onDone, onRetry }) */
  async function after(o) {
    o = o || {};
    var okTitle = o.okTitle || 'บันทึกเข้าระบบแล้ว';
    var okHtml = o.okHtml || (o.docId ? 'เลขที่เอกสาร: <b>' + esc(o.docId) + '</b>' : '');
    if (window.Swal) Swal.fire({ title: 'กำลังตรวจสอบว่าบันทึกเข้าระบบ…', allowOutsideClick: false, didOpen: function () { Swal.showLoading(); } });
    var ok = await confirmSaved(o.kind, o.key);
    if (ok) {
      if (window.Swal) await Swal.fire({ icon: 'success', title: okTitle, html: okHtml + '<div class="small text-muted mt-2"><i class="fas fa-circle-check me-1"></i>ตรวจแล้วว่าข้อมูลอยู่ในระบบจริง</div>', confirmButtonColor: '#2e934a' });
      if (typeof o.onDone === 'function') o.onDone(true);
      return true;
    }
    keepCopy(o.kind, o.key, o.payload, o.docId);
    if (window.Swal) {
      var r = await Swal.fire({
        icon: 'error', title: 'ยังไม่ได้บันทึกเข้าระบบ', width: 560,
        html: '<div class="text-start">' +
          '<div class="mb-2">ระบบออกเลขเอกสารให้แล้ว' + (o.docId ? ' (<b>' + esc(o.docId) + '</b>)' : '') + ' แต่ <b>ตรวจไม่พบข้อมูลในระบบ</b> — ยังถือว่า<b>ส่งไม่สำเร็จ</b></div>' +
          '<div class="p-2 rounded border" style="background:#fff4e5;border-color:#e0a800!important">' +
          '<div class="small"><b>ระบบเก็บสำเนาที่คุณกรอกไว้ในเครื่องแล้ว</b><br>' +
          '• กด <b>ส่งอีกครั้ง</b> เพื่อลองบันทึกใหม่ทันที<br>' +
          '• หรือปิดไว้ก่อน แล้วกดส่งใหม่ภายหลัง (ข้อมูลจะยังอยู่ในฟอร์ม)<br>' +
          '• ถ้ายังไม่สำเร็จซ้ำ ๆ ให้แจ้ง IT พร้อมเลขเอกสารนี้</div></div></div>',
        showCancelButton: true, confirmButtonText: '<i class="fas fa-rotate-right me-1"></i>ส่งอีกครั้ง',
        confirmButtonColor: '#c0392b', cancelButtonText: 'ปิดไว้ก่อน'
      });
      if (r.isConfirmed && typeof o.onRetry === 'function') { o.onRetry(); return false; }
    }
    if (typeof o.onDone === 'function') o.onDone(false);
    return false;
  }

  function failedList() { return ls(FAILK, []); }
  function clearFailed(i) { var all = ls(FAILK, []); if (i == null) save(FAILK, []); else { all.splice(i, 1); save(FAILK, all); } }

  window.PC_SaveVerify = { after: after, confirmSaved: confirmSaved, failedList: failedList, clearFailed: clearFailed };
})();
