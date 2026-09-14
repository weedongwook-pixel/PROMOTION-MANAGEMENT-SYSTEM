/* ============================================================================
 *  js/notify.js — ตัวช่วยแจ้งเตือนกลาง (routing + log + bell inbox)
 *  ---------------------------------------------------------------------------
 *  window.PC_notify(eventKey, { text, ...tokens })
 *    - อ่าน routing จาก pc_notify_settings (ตั้งที่หน้า "ตั้งค่าการแจ้งเตือน")
 *    - บันทึกลง pc_notify_log (ซิงค์ข้ามเครื่องผ่าน cloud-store — key ถูก track)
 *    - เด้ง toast + อัปเดตกระดิ่งมุมขวาบน (ตัวเลขที่ยังไม่อ่าน)
 *  เงียบ/ปลอดภัย: เรียกจาก workflow ไหนก็ได้ ถ้าไม่มี settings จะใช้ค่า fallback
 * ========================================================================== */
(function () {
  'use strict';
  var LOG_KEY = 'pc_notify_log', SET_KEY = 'pc_notify_settings', TPL_KEY = 'pc_notify_templates';
  var CAP = 200;

  function cfg() { try { var s = JSON.parse(localStorage.getItem(SET_KEY)); if (s && s.events) return s; } catch (e) {} return null; }
  function tpls() { try { return JSON.parse(localStorage.getItem(TPL_KEY)) || {}; } catch (e) { return {}; } }
  function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { return []; } }
  function saveLog(a) { try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(0, CAP))); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // เติมค่า {token} ลงเทมเพลต
  function renderTpl(t, tokens) { return String(t == null ? '' : t).replace(/\{(\w+)\}/g, function (m, k) { return (tokens && tokens[k] != null && tokens[k] !== '') ? tokens[k] : ''; }).replace(/[ \t]*·[ \t]*(?=·|\n|$)/g, '').replace(/\n{3,}/g, '\n\n').trim(); }

  var FALLBACK = { it: { label: 'IT', group: 'PC • IT Support' }, marketing: { label: 'Marketing', group: 'PC • Delivery Price' }, operation: { label: 'Operation', group: 'PC • Operation' }, npd: { label: 'NPD / R&D', group: 'PC • NPD' }, account: { label: 'Accounting', group: 'PC • Accounting' } };
  var EV_FALLBACK = {
    proposal_submitted: ['operation'], proposal_approved: ['operation','marketing'], proposal_rejected: ['operation','marketing'],
    promo_cancelled: ['operation','marketing'], promo_extended: ['operation','marketing'], promo_reduced: ['operation'], promo_ending: ['operation'],
    memo_sent: ['operation','marketing'], npd_new: ['npd'], npd_approved: ['npd','it'], npd_rejected: ['npd'], flavor_new: ['it','npd'],
    it_settlement: ['it'], it_settlement_done: ['it','operation'], itemset_done: ['it','operation'], coupon_issued: ['account'],
    card_request: ['it'], card_approved: ['marketing'], staff_discount_request: ['it'], staff_discount_ready: ['operation'],
    tender_request: ['account'], tender_area: ['operation'], tender_done: ['it','operation'], billdiff_submitted: ['account','it'], billdiff_resolved: ['account'],
    ticket_urgent: ['it'], equipment_request: ['it'], equipment_done: ['it','operation'], sticker_add: ['account'], sticker_cancel: ['account'],
    code_add_request: ['it'], code_add_done: ['marketing'], code_remove_request: ['it'], code_remove_done: ['marketing'], code_not_found: ['it'],
    copro_submitted: ['account','it'], copro_interfaced: ['account','marketing','it'],
    report_general: ['it'], report_price_platform: ['marketing']
  };

  /* คืน routing ของเหตุการณ์: {label, channels, teams:[{team,group}]} */
  var CH_FALLBACK = {
    copro_submitted: { email: true, chat: true, line: true },
    copro_interfaced: { email: true, chat: true, line: true },
  };
  var LABEL_FALLBACK = {
    copro_submitted: 'แจ้ง Co-Promotion (MKT→ACC/IT)',
    copro_interfaced: 'ยืนยัน Interface ERP (IT→ACC/MKT)',
  };
  function route(key) {
    var c = cfg(), ev = c && c.events && c.events[key];
    var depts = (ev && ev.depts && ev.depts.length) ? ev.depts : (EV_FALLBACK[key] || ['it']);
    var chans = (ev && ev.channels) || CH_FALLBACK[key] || { email: true, chat: false, line: false };
    var label = (ev && ev.label) || LABEL_FALLBACK[key] || key;
    var meta = function (dk) { return (c && c.depts && c.depts[dk]) || FALLBACK[dk] || { label: dk, group: dk }; };
    var teams = depts.map(function (dk) { var d = meta(dk); return { team: d.label || dk, group: d.group || '', lineGroup: d.lineGroup || d.group || '' }; });
    return { key: key, label: label, channels: chans, teams: teams, deptKeys: depts, soloEmail: ev && ev.soloEmail || '' };
  }

  function chanList(ch) { var a = []; if (ch.email) a.push('Email'); if (ch.chat) a.push('Team Chat'); if (ch.line) a.push('LINE'); return a.length ? a : ['Email']; }

  /* บันทึก + เด้งเตือน — คืน route ที่ใช้ */
  function notify(key, data) {
    data = data || {};
    var r = route(key);
    var _tpl = tpls()[key] && tpls()[key].msg;
    var text = (_tpl && data.tokens) ? renderTpl(_tpl, data.tokens) : (data.text || _tpl || r.label);
    var entry = {
      id: 'N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      key: key, label: r.label, text: String(text),
      at: new Date().toISOString(),
      by: (function () { try { return localStorage.getItem('pc_userName') || localStorage.getItem('pc_role') || ''; } catch (e) { return ''; } })(),
      channels: r.channels, teams: r.teams.map(function (t) { return t.team; }), deptKeys: r.deptKeys || [],
      zone: (data.zone != null ? String(data.zone).trim() : ''), area: (data.area != null ? String(data.area).trim() : ''),
      cal: (data.cal && data.cal.date && window.PC_Calendar && PC_Calendar.enabledFor && data.cal.key && PC_Calendar.enabledFor(data.cal.key)) ? data.cal : null,
      read: false
    };
    var log = loadLog(); log.unshift(entry); saveLog(log);
    renderBadge();
    toast(entry, r);
    try { sendExternal(entry, r, data); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('pc-notify', { detail: entry })); } catch (e) {}
    return r;
  }

  /* ส่งจริงเข้า Team Chat / LINE / Email ผ่าน webhook ที่ตั้งไว้ (pc_notify_settings)
     - Team Chat: chat.webhook (Google Chat space / Slack incoming webhook · รับ {text})
     - LINE: line.webhook (ปลายทางที่รับ {text}) หรือผ่าน proxy/Worker
     - Email: email.webhook (endpoint ส่งเมล — เช่น Apps Script / Worker /notify)
     ยิงแบบ fire-and-forget · ถ้าไม่ตั้ง webhook = เงียบ (log/กระดิ่งเหมือนเดิม) */
  function postWebhook(url, payload) {
    if (!url) return;
    try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function () {}); } catch (e) {}
  }
  function sendExternal(entry, r, data) {
    var c = cfg() || {};
    var to = (r.teams || []).map(function (t) { return t.team; }).join(', ');
    var text = '[' + entry.label + ']\n' + entry.text + (to ? '\n→ ' + to : '');
    var emailText = (data && data.emailBody) ? data.emailBody : (entry.text + (to ? '\n\nถึง: ' + to : ''));
    var emailHtml = (data && data.emailHtml) ? data.emailHtml : '';
    // ⭐ ลูปเมลเดียวต่อ 1 งาน: request → IT ทำเสร็จ ใช้ threadKey เดียวกัน → subject เดียว + อ้างถึงกัน = เมลเข้า thread เดียว (ไม่แยกส่ง)
    var tok = (data && data.tokens) || {};
    var threadKey = (data && data.threadKey) || tok.code || tok.campaign || tok.ticket || tok.so || tok.name || '';
    // ⭐ ทุกเคสงานเข้าลูปเมลเดียว: ถ้ายังไม่มี threadKey ให้ดึงชื่องาน/แคมเปญในเครื่องหมายคำพูด “…”/"…" จากข้อความ
    //    → request กับ IT/OP ทำเสร็จ (ข้อความคนละบรรทัดแต่อ้างชื่อเดียวกัน) = subject เดียวกัน = thread เดียว
    if (!threadKey && entry && entry.text) { var _m = String(entry.text).match(/[“"']([^”"']{2,80})[”"']/); if (_m) threadKey = _m[1].trim(); }
    var subject = (data && data.subject) ? data.subject : (threadKey ? ('[Potato Corner] ' + threadKey) : ('[Potato Corner] ' + entry.label));
    var chatHook = (entry.channels && entry.channels.chat && c.chat && c.chat.webhook) || '';
    var emailHook = (entry.channels && entry.channels.email && c.email && c.email.webhook) || '';
    var lineHook = (entry.channels && entry.channels.line && c.line && c.line.webhook) || '';
    if (!chatHook && !emailHook && !lineHook) return;
    var cloud = (window.PC_CLOUD && window.PC_CLOUD.cfg) ? window.PC_CLOUD.cfg() : null;
    if (cloud && cloud.url && cloud.token && (chatHook || emailHook)) {
      try {
        fetch(String(cloud.url).replace(/\/+$/, '') + '/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cloud.token },
          body: JSON.stringify({ chatWebhook: chatHook, emailWebhook: emailHook, subject: subject, threadKey: threadKey, text: text, emailText: emailText, emailHtml: emailHtml, to: r.soloEmail ? [r.soloEmail] : [] })
        }).catch(function () {});
      } catch (e) {}
    } else {
      if (chatHook) postWebhook(chatHook, { text: text });
      if (emailHook) postWebhook(emailHook, { subject: subject, threadKey: threadKey, text: emailText, html: emailHtml });
    }
    if (lineHook) postWebhook(lineHook, { text: text });
  }

  function toast(entry, r) {
    if (!window.Swal || !Swal.fire) return;
    var to = r.teams.map(function (t) { return t.team; }).join(', ') || '-';
    Swal.fire({
      toast: true, position: 'top-end', timer: 4200, showConfirmButton: false, icon: 'info', iconColor: '#eb2c39',
      title: entry.label,
      html: '<div style="font-size:.82rem;text-align:left;max-width:320px">' + esc(entry.text) +
        '<div style="margin-top:6px;color:#6b7280;font-size:.72rem"><i class="fas fa-paper-plane"></i> ' + esc(chanList(entry.channels).join(' · ')) + ' → ' + esc(to) + '</div></div>'
    });
  }

  /* ============================ Bell inbox ============================ */
  var _bell = null, _panel = null;
  /* กระดิ่งกรองตาม role: เห็นเฉพาะแจ้งเตือนที่ route มาถึงแผนกของตัวเอง (Admin เห็นทั้งหมด) */
  function myDept() {
    var r = String(localStorage.getItem('pc_role') || 'Admin').trim();
    var M = { 'Admin': '*', 'Admin HQ': '*', 'MKT': 'marketing', 'IT': 'it', 'ACC': 'account', 'OP': 'operation', 'RD': 'npd', 'BD': 'marketing' };
    return (M[r] !== undefined) ? M[r] : '*';
  }
  /* โซนที่ผู้ใช้ OP/Area คนนี้รับผิดชอบ (จาก pc_op_zones — ผูกชื่อผู้ใช้กับเลขโซน) */
  function myZones() {
    try {
      var user = (localStorage.getItem('pc_userName') || '').trim().toLowerCase();
      var m = JSON.parse(localStorage.getItem('pc_op_zones')) || {};
      var zs = []; Object.keys(m).forEach(function (z) { if ((m[z] || []).some(function (u) { return String(u).trim().toLowerCase() === user; })) zs.push(String(z).trim()); });
      return { user: user, zones: zs };
    } catch (e) { return { user: '', zones: [] }; }
  }
  function canSee(e) {
    var d = myDept(); if (d === '*') return true;
    var keys = (e && e.deptKeys && e.deptKeys.length) ? e.deptKeys : (EV_FALLBACK[e && e.key] || []);
    if (!keys.length) return true;               // ไม่รู้ปลายทาง → โชว์ให้ทุกคน (กันตกหล่น)
    if (keys.indexOf(d) < 0) return false;
    // แจ้งเตือนที่ผูกโซน (เช่น tender_area) → ผู้ใช้ Operation/Area เห็นเฉพาะโซนที่ตัวเองรับผิดชอบ
    if (e && e.zone && d === 'operation') {
      var sc = myZones();
      if (sc.zones.indexOf('ALL') >= 0) return true;
      if (sc.zones.indexOf(String(e.zone).trim()) >= 0) return true;
      if (e.area && sc.user && String(e.area).trim().toLowerCase() === sc.user) return true;
      return false;
    }
    return true;
  }
  function visibleLog() { return loadLog().filter(canSee); }
  function unread() { return visibleLog().filter(function (e) { return !e.read; }).length; }
  function ensureBell() {
    if (_bell) return;
    _bell = document.createElement('button');
    _bell.id = 'pcNotifyBell';
    _bell.style.cssText = 'position:fixed;top:12px;right:112px;z-index:1101;width:40px;height:40px;border-radius:50%;border:0;background:#eb2c39;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.16);cursor:pointer;font-size:1.05rem;display:flex;align-items:center;justify-content:center';
    _bell.innerHTML = '<i class="fas fa-bell"></i><span id="pcNotifyBadge"></span>';
    _bell.onclick = togglePanel;
    document.body.appendChild(_bell);
    renderBadge();
  }
  function renderBadge() {
    ensureBell();
    var b = document.getElementById('pcNotifyBadge'); if (!b) return;
    var n = unread();
    b.style.cssText = n ? 'position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#e0322f;color:#fff;font-family:Kanit,sans-serif;font-size:.66rem;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)' : 'display:none';
    b.textContent = n > 99 ? '99+' : String(n);
  }
  function fmtTime(iso) { try { var d = new Date(iso); return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function togglePanel() {
    if (_panel) { _panel.remove(); _panel = null; return; }
    var log = visibleLog();
    _panel = document.createElement('div');
    _panel.id = 'pcNotifyPanel';
    _panel.style.cssText = 'position:fixed;top:58px;right:16px;z-index:1101;width:min(380px,92vw);max-height:72vh;background:#fff;border:1px solid #e5e8ec;border-radius:16px;box-shadow:0 16px 44px rgba(0,0,0,.22);font-family:Kanit,sans-serif;overflow:hidden;display:flex;flex-direction:column';
    var head = '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #eef1f4"><b style="font-size:1rem"><i class="fas fa-bell" style="color:#eb2c39;margin-right:7px"></i>การแจ้งเตือน</b><button id="pcNotifyRead" style="border:0;background:#fdeaec;color:#c81e29;border-radius:8px;padding:5px 10px;font-family:inherit;font-weight:700;font-size:.76rem;cursor:pointer">อ่านทั้งหมด</button></div>';
    var body = log.length ? log.map(function (e) {
      var chips = chanList(e.channels).map(function (c) { return '<span style="background:#f1f4f7;border-radius:6px;padding:1px 7px;font-size:.68rem;color:#5a616b">' + esc(c) + '</span>'; }).join(' ');
      var calBtn = e.cal ? '<button data-cal="' + esc(encodeURIComponent(JSON.stringify(e.cal))) + '" class="pcNotifyCal" style="border:0;background:#fdeaec;color:#c81e29;border-radius:6px;padding:2px 9px;font-family:inherit;font-size:.68rem;font-weight:700;cursor:pointer"><i class="fas fa-calendar-plus"></i> ปฏิทิน</button>' : '';
      return '<div style="padding:11px 15px;border-bottom:1px solid #f2f4f7;background:' + (e.read ? '#fff' : '#fff5f6') + '">' +
        '<div style="display:flex;gap:8px;align-items:baseline"><b style="font-size:.86rem;flex:1">' + esc(e.label) + '</b><span style="font-size:.68rem;color:#aab0b8">' + fmtTime(e.at) + '</span></div>' +
        '<div style="font-size:.8rem;color:#3a4047;margin:3px 0 6px;line-height:1.45;white-space:pre-line">' + esc(e.text) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center"><span style="font-size:.68rem;color:#8a9099"><i class="fas fa-users"></i> ' + esc((e.teams || []).join(', ') || '-') + '</span> ' + chips + ' ' + calBtn + '</div>' +
        '</div>';
    }).join('') : '<div style="padding:40px 16px;text-align:center;color:#aab0b8;font-size:.86rem"><i class="fas fa-inbox fa-2x" style="display:block;margin-bottom:10px;opacity:.5"></i>ยังไม่มีการแจ้งเตือน</div>';
    _panel.innerHTML = head + '<div style="overflow:auto">' + body + '</div>';
    document.body.appendChild(_panel);
    Array.prototype.forEach.call(_panel.querySelectorAll('.pcNotifyCal'), function (b) {
      b.onclick = function () { try { var ev = JSON.parse(decodeURIComponent(b.getAttribute('data-cal'))); if (window.PC_Calendar) PC_Calendar.download(ev); } catch (e) {} };
    });
    var rb = document.getElementById('pcNotifyRead');
    if (rb) rb.onclick = function () { var l = loadLog(); l.forEach(function (e) { if (canSee(e)) e.read = true; }); saveLog(l); renderBadge(); togglePanel(); };
    setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
  }
  function outside(ev) {
    if (!_panel) { document.removeEventListener('click', outside, true); return; }
    if (_panel.contains(ev.target) || (_bell && _bell.contains(ev.target))) return;
    _panel.remove(); _panel = null; document.removeEventListener('click', outside, true);
  }

  /* cross-tab / cloud pull → refresh badge */
  window.addEventListener('storage', function (e) { if (e.key === LOG_KEY) renderBadge(); });

  window.PC_notify = notify;
  window.PC_NOTIFY = { route: route, log: loadLog, markAllRead: function () { var l = loadLog(); l.forEach(function (e) { e.read = true; }); saveLog(l); renderBadge(); } };

  function boot() { ensureBell(); }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
