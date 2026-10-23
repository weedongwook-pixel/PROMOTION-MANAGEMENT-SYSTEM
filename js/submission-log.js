/* Campaign submission receipts. The receipt lives on the campaign rows, so it
 * survives Cloud sync and is visible on other devices; failed attempts are
 * deliberately labelled as device-only and never counted as saved campaigns. */
(function () {
  'use strict';
  var ATTEMPTS = 'pc_submission_attempts_v1';
  var memoryAttempts = [];
  function uid() { return 'SUB-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 10).toUpperCase(); }
  function user() { try { return String(localStorage.getItem('pc_userName') || localStorage.getItem('pc_role') || '').trim(); } catch (e) { return ''; } }
  function canViewAll() { try { var role = localStorage.getItem('pc_role'); return role === 'Admin' || role === 'IT'; } catch (e) { return false; } }
  function norm(v) { return String(v == null ? '' : v).trim(); }
  function unique(values) { return Array.from(new Set(values.map(norm).filter(Boolean))); }
  function readAttempts() { try { var a = JSON.parse(localStorage.getItem(ATTEMPTS) || '[]'); return Array.isArray(a) ? a : memoryAttempts; } catch (e) { return memoryAttempts; } }
  function writeAttempts(value) { memoryAttempts = value.slice(0, 80); try { localStorage.setItem(ATTEMPTS, JSON.stringify(memoryAttempts)); } catch (e) {} }
  var dbPromise;
  function attemptDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (!dbPromise) dbPromise = new Promise(function (resolve) {
      try {
        var request = indexedDB.open('pc_submission_log_v1', 1);
        request.onupgradeneeded = function () { request.result.createObjectStore('attempts', { keyPath: 'id' }); };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }
  async function putAttempt(rec) {
    var db = await attemptDb(); if (!db) return;
    try { db.transaction('attempts', 'readwrite').objectStore('attempts').put(rec); } catch (e) {}
  }
  async function allAttempts() {
    var merged = new Map();
    readAttempts().forEach(function (rec) { merged.set(rec.id, rec); });
    var db = await attemptDb();
    if (db) {
      try {
        var stored = await new Promise(function (resolve) {
          var request = db.transaction('attempts', 'readonly').objectStore('attempts').getAll();
          request.onsuccess = function () { resolve(request.result || []); };
          request.onerror = function () { resolve([]); };
        });
        stored.forEach(function (rec) {
          var current = merged.get(rec.id);
          if (!current || Number(rec.updatedAt) > Number(current.updatedAt || 0)) merged.set(rec.id, rec);
        });
      } catch (e) {}
    }
    return Array.from(merged.values());
  }
  function setAttempt(entry, status, error, evidence) {
    var all = readAttempts().slice(), index = all.findIndex(function (x) { return x.id === entry.id; });
    var previous = index >= 0 ? all[index] : null;
    var rec = { id: entry.id, batchId: entry.batchId, campaign: entry.campaign, form: entry.form,
      at: entry.at, user: entry.user, expectedButtons: entry.expectedButtons, shortNames: entry.shortNames,
      status: status, error: norm(error).slice(0, 350), updatedAt: Date.now(),
      cloudSeenAt: evidence && evidence.cloudSaved ? Date.now() : previous && previous.cloudSeenAt || 0,
      successShownAt: evidence && evidence.successShown ? Date.now() : previous && previous.successShownAt || 0 };
    if (index >= 0) all.splice(index, 1);
    all.unshift(rec); writeAttempts(all); putAttempt(rec);
  }
  function prepare(form, payload) {
    var batchId = uid(), at = new Date().toISOString(), who = user(), groups = new Map();
    var rows = form === 'Bill Discount' || form === 'Voucher' ? (payload.campaigns || payload) : payload;
    if (!Array.isArray(rows)) return { batchId: batchId, entries: [] };
    rows.forEach(function (row) {
      var name = norm(row.campaign || row.campaignName || row.name);
      if (!name) return;
      if (!groups.has(name)) groups.set(name, { id: uid(), batchId: batchId, campaign: name, form: form,
        at: at, user: who, shortNames: [], expectedButtons: 0 });
      var entry = groups.get(name);
      var names = Array.isArray(row.buttons) ? row.buttons.map(function (b) { return b.shortName || b.shortNamePOS; })
        : [row.shortName || row.shortNamePOS];
      entry.shortNames = unique(entry.shortNames.concat(names));
    });
    rows.forEach(function (row) {
      var entry = groups.get(norm(row.campaign || row.campaignName || row.name));
      if (!entry) return;
      entry.expectedButtons = entry.shortNames.length;
      row.submissionId = entry.id;
      row.submissionBatchId = batchId;
      row.submissionForm = form;
      row.submissionExpectedButtons = entry.expectedButtons;
      row.submittedBy = who;
      row.txnDate = at;
    });
    var entries = Array.from(groups.values());
    entries.forEach(function (entry) { setAttempt(entry, 'sending'); });
    return { batchId: batchId, entries: entries };
  }
  function runTracking() {
    return new Promise(function (resolve, reject) {
      try { google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getAllCampaignData(); }
      catch (e) { reject(e); }
    });
  }
  function matching(rows, entry) {
    var found = receiptRows(rows, entry);
    var names = unique(found.map(function (r) { return r.shortName; }));
    var knownNames = unique(names.concat(found.filter(function(r){return r.editId;}).map(function(r){return r.editOriginalShortName;})));
    return entry.expectedButtons > 0 && entry.shortNames.every(function (n) { return knownNames.indexOf(n) !== -1; })
      && names.length >= entry.expectedButtons;
  }
  function receiptRows(rows, entry) {
    return (rows || []).filter(function (row) { return norm(row.submissionId) === entry.id && norm(row.campaign) === entry.campaign; });
  }
  function olderRows(rows, entry) {
    if (!norm(entry.at) || !norm(entry.user)) return [];
    return (rows || []).filter(function (row) {
      var at = norm(row.txnDate || row.submittedDate || row.timestamp);
      var sameTime = at === norm(entry.at);
      if (!sameTime && at && Date.parse(at) && Date.parse(entry.at)) sameTime = Date.parse(at) === Date.parse(entry.at);
      return norm(row.campaign) === norm(entry.campaign) && sameTime &&
        norm(row.submittedBy || row.reporter || row.rd) === norm(entry.user);
    });
  }
  function matchingOlderRows(rows, entry) {
    var expected = unique(entry.shortNames || []);
    if (!expected.length) return false;
    var found = olderRows(rows, entry);
    var names = unique(found.flatMap(function (row) { return row.editId ? [row.shortName,row.editOriginalShortName] : [row.shortName]; }));
    return expected.every(function (name) { return names.indexOf(name) !== -1; });
  }
  async function verifyEntry(entry, trackingRows) {
    var cloud = window.PC_CLOUD;
    if (!cloud || !cloud.enabled || !cloud.enabled() || !cloud.readCampaignRows) {
      return { ok: false, cloudChecked: false, reason: 'ยังตรวจ Cloud ไม่ได้' };
    }
    try {
      var remote = await cloud.readCampaignRows(entry.campaign);
      if (!matching(remote, entry)) return { ok: false, cloudChecked: true, cloudSaved: false, reason: 'ไม่พบข้อมูลรายการนี้ใน Cloud' };
      return matching(trackingRows, entry)
        ? { ok: true, cloudChecked: true, cloudSaved: true }
        : { ok: false, cloudChecked: true, cloudSaved: true, reason: 'บันทึกใน Cloud แล้ว แต่ยังไม่พบปุ่มครบในศูนย์ติดตามงาน' };
    } catch (e) {
      var detail = norm(e && e.message || e);
      if (/\(404\)|ถูกซ่อนด้วยทะเบียนลบ/.test(detail))
        return { ok: false, cloudChecked: true, cloudSaved: false, reason: 'ไม่พบข้อมูลรายการนี้ใน Cloud' };
      return { ok: false, cloudChecked: false, reason: 'ตรวจ Cloud ไม่ได้: ' + detail };
    }
  }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function verifyPlan(plan) {
    var results = [];
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var tracking = await runTracking();
        results = await Promise.all(plan.entries.map(function (entry) { return verifyEntry(entry, tracking); }));
        if (results.every(function (r) { return r.ok; })) return results;
      } catch (e) { results = plan.entries.map(function () { return { ok: false, reason: norm(e && e.message || e) }; }); }
      if (attempt < 2) await delay(500 * (attempt + 1));
    }
    return results;
  }
  // A rejected send is already reported by the form. Keep it locally for diagnostics,
  // but it is not a failed Cloud receipt in the submission history.
  function fail(plan, error) { (plan.entries || []).forEach(function (entry) { setAttempt(entry, 'rejected', error); }); }
  async function afterSave(plan, options) {
    options = options || {};
    (plan.entries || []).forEach(function (entry) { setAttempt(entry, 'cloud_acked'); });
    if (window.Swal) {
      Swal.fire({ title: 'กำลังตรวจ Cloud และศูนย์ติดตามงาน…', allowOutsideClick: false });
      Swal.showLoading();
    }
    var results = await verifyPlan(plan), ok = results.length > 0 && results.every(function (r) { return r.ok; });
    plan.entries.forEach(function (entry, i) {
      var result = results[i] || {};
      setAttempt(entry, result.cloudSaved ? 'verified' : result.cloudChecked ? 'rejected' : 'needs_check', result.reason,
        { cloudSaved: result.cloudSaved, successShown: ok });
    });
    if (typeof options.onDone === 'function') options.onDone(ok);
    var navigateToLog = false;
    if (window.Swal) {
      if (ok) await Swal.fire({ icon: 'success', title: 'ส่งและบันทึกข้อมูลสำเร็จ',
        text: plan.entries.length + ' แคมเปญ · Cloud บันทึกแล้ว และพบทุกปุ่มในศูนย์ติดตามงาน' + (options.successNote ? '\n' + options.successNote : ''),
        showConfirmButton: false, showCancelButton: false, timer: 1500, timerProgressBar: true,
        allowOutsideClick: false, allowEscapeKey: false
      });
      else await Swal.fire({ icon: 'warning', title: 'ยังตรวจผลการส่งไม่ครบ',
        text: 'มี ' + results.filter(function (r) { return !r.ok; }).length + ' แคมเปญที่ต้องตรวจเพิ่มเติม กรุณาเปิด “ประวัติการแจ้งโปรฯ” เพื่อตรวจสถานะ Cloud ก่อนกดส่งซ้ำ',
        confirmButtonText: 'เปิดประวัติการแจ้งโปรฯ', confirmButtonColor: '#2e934a'
      }).then(function () { navigateToLog = true; });
    }
    // Finish the post-save Co-Promo decision before leaving the submitted form.
    if (ok && typeof options.onAfter === 'function') {
      try {
        var followUp = await options.onAfter();
        if (followUp && ((followUp.coPromo === false && followUp.completed !== false) || followUp.completed === true) && window.Swal) {
          var next = await Swal.fire({ icon: 'success', title: 'ส่งและบันทึกข้อมูลสำเร็จ',
            text: followUp.coPromo ? 'บันทึก Co-Promotion แล้ว · อีเมลรายละเอียดอยู่ในคิวส่ง' : '',
            showCancelButton: true, confirmButtonText: 'ดูประวัติการแจ้งโปรฯ',
            cancelButtonText: 'ทำงานต่อ', confirmButtonColor: '#2e934a'
          });
          navigateToLog = !!next.isConfirmed;
        }
      }
      catch (error) {
        if (window.Swal) await Swal.fire({ icon:'warning', title:'บันทึกโปรฯ แล้ว แต่เปิดขั้นตอนถัดไปไม่สำเร็จ',
          text:'ไม่ต้องส่งโปรฯ ซ้ำ กรุณาเปิด Co-Promotion เพื่อตรวจข้อมูลเพิ่มเติม: ' + String(error && error.message || error) });
      }
    }
    if (navigateToLog) openLog();
    return ok;
  }
  function openLog() {
    if (typeof window.loadPage === 'function') window.loadPage('SubmissionLog', document.getElementById('nav-SubmissionLog'));
    else location.hash = 'SubmissionLog';
  }
  function bangkokDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var map = {}; parts.forEach(function (p) { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
  }
  function today() { return bangkokDate(new Date().toISOString()); }
  function createActivity(data) {
    var at = new Date().toISOString();
    return { id: uid().replace(/^SUB-/, 'ACT-'), date: bangkokDate(at), at: at, user: user(), kind: norm(data.kind),
      campaign: norm(data.campaign), scope: norm(data.scope || 'campaign'),
      buttons: unique(data.buttons || []), items: unique(data.items || []),
      before: norm(data.before), after: norm(data.after), note: norm(data.note).slice(0, 500) };
  }
  async function listActivity(date, options) {
    var cloud = window.PC_CLOUD;
    if (!cloud || !cloud.readActivity) throw new Error('ยังอ่านประวัติจาก Cloud ไม่ได้');
    var all = await cloud.readActivity(date), who = user();
    return all.filter(function (entry) {
      return canViewAll() && (!options || options.scope !== 'mine') || norm(entry.user) === who;
    }).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
  }
  function summarize(entries) {
    var result = { campaigns: 0, submissions: 0, verified: 0, pending: 0, failed: 0, deleted: 0, legacy: 0 };
    // Cloud-confirmed receipts are counted as saved; Tracking mismatches remain visible separately.
    // Failed attempts remain in the history but never inflate this number.
    var campaigns = new Set();
    (entries || []).forEach(function (entry) {
      var name = norm(entry.campaign);
      result.submissions++;
      if (entry.status === 'verified') { result.verified++; if (name) campaigns.add(name); }
      else if (entry.status === 'failed') result.failed++;
      else if (entry.status === 'deleted') result.deleted++;
      else if (entry.status === 'legacy') result.legacy++;
      else result.pending++;
    });
    result.campaigns = campaigns.size;
    return result;
  }
  async function list(date, options) {
    var who = user(), allSubmitters = canViewAll() && (!options || options.scope !== 'mine');
    var snapshot = window.PC_CLOUD?.readSubmissionSnapshot ? await window.PC_CLOUD.readSubmissionSnapshot() : null;
    if (!snapshot && window.PC_CLOUD?.pull) await window.PC_CLOUD.pull();
    var rows = await runTracking(), groups = new Map();
    (rows || []).concat(snapshot && snapshot.deletedRows || []).forEach(function (row) {
      var submitter = norm(row.submittedBy || row.reporter);
      if (!submitter || (!allSubmitters && submitter !== who) || (date && bangkokDate(row.txnDate) !== date)) return;
      var id = norm(row.submissionId), key = id || ['old', row.campaign, row.txnDate, row.submittedBy || row.reporter].join('|');
      if (!groups.has(key)) groups.set(key, { id: id, campaign: row.campaign, form: row.submissionForm || row.promoType || 'Promotion',
        at: row.txnDate, user: submitter, expectedButtons: Number(row.submissionExpectedButtons) || 0, shortNames: [], legacy: !id });
      var entry = groups.get(key);
      entry.shortNames = unique(entry.shortNames.concat(row.shortName));
      entry.foundButtons = entry.shortNames.length;
      if (Number(row.submissionExpectedButtons) > entry.expectedButtons) entry.expectedButtons = Number(row.submissionExpectedButtons);
    });
    var localAttempts = (await allAttempts()).filter(function (a) {
      return a.user === who && (!date || bangkokDate(a.at) === date);
    });
    var rejectedIds = new Set(localAttempts.filter(function (a) {
      return a.status === 'rejected' && !a.successShownAt;
    }).map(function (a) { return a.id; }));
    // Recheck even rejected attempts: a write may have reached Cloud before its
    // acknowledgment failed. Show those only when the Cloud read proves a save.
    localAttempts.forEach(function (a) {
      if (!groups.has(a.id)) groups.set(a.id, Object.assign({ foundButtons: 0 }, a));
      else {
        var entry = groups.get(a.id);
        if (a.expectedButtons) entry.expectedButtons = a.expectedButtons;
        if (a.shortNames && a.shortNames.length) entry.shortNames = a.shortNames;
        entry.cloudSeenAt = a.cloudSeenAt || 0;
        entry.successShownAt = a.successShownAt || 0;
      }
    });
    var entries = Array.from(groups.values());
    var cloudCache = new Map();
    function markMissing(entry) {
      var deletion=snapshot && snapshot.deletionFor && snapshot.deletionFor(entry);
      entry.status=deletion?'deleted':'needs_check';
      if(deletion){entry.deletedAt=deletion.at;entry.deletedBy=deletion.user;entry.error='งานถูกลบออกจากรายการใช้งาน'+(deletion.user?' โดย '+deletion.user:'')+(deletion.at?' · '+new Date(deletion.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'');}
      else entry.error=entry.successShownAt||entry.cloudSeenAt?'เคยบันทึกสำเร็จ แต่ยังยืนยันสถานะปัจจุบันไม่ได้ กรุณาตรวจอีกครั้ง ไม่ต้องส่งซ้ำ':'ไม่พบรายการใน Cloud และยังยืนยันผลการส่งเดิมไม่ได้ กรุณาตรวจอีกครั้ง';
    }
    async function checkEntry(entry) {
      if (!entry.legacy && !entry.id) { entry.status = 'needs_check'; return; }
      var promise = cloudCache.get(entry.campaign);
      if (!promise) {
        promise = snapshot ? Promise.resolve().then(function () { return snapshot(entry.campaign); }) : window.PC_CLOUD && window.PC_CLOUD.readCampaignRows ? window.PC_CLOUD.readCampaignRows(entry.campaign) : Promise.reject(new Error('Cloud ไม่พร้อม'));
        cloudCache.set(entry.campaign, promise);
      }
      try {
        var remote = await promise;
        var cloudRows = entry.legacy ? olderRows(remote, entry) : receiptRows(remote, entry);
        var found = entry.legacy ? matchingOlderRows(remote, entry) : matching(remote, entry);
        if (found) {
          var trackingRows = entry.legacy ? olderRows(rows, entry) : receiptRows(rows, entry);
          var cloudNames = unique(cloudRows.map(function (row) { return row.shortName; }));
          var trackingNames = unique(trackingRows.map(function (row) { return row.shortName; }));
          entry.cloudShortNames = cloudNames;
          entry.expectedButtons = Math.max(entry.expectedButtons, cloudNames.length);
          entry.foundButtons = trackingNames.length;
          entry.trackingComplete = cloudNames.every(function (name) { return trackingNames.indexOf(name) !== -1; });
          entry.trackingMismatch = !entry.trackingComplete;
          entry.status = 'verified';
          entry.error = '';
          if(entry.id){setAttempt(entry,'verified','',{cloudSaved:true});entry.cloudSeenAt=Date.now();}
        } else if (cloudRows.length) {
          entry.status = 'needs_check';
          entry.cloudPartial = true;
          entry.error = 'พบข้อมูลบางส่วนใน Cloud แต่ปุ่มยังไม่ครบ กรุณาแจ้ง IT ก่อนส่งซ้ำ';
        } else if (entry.status !== 'sending' || Date.now() - Date.parse(entry.at) >= 120000) {
          markMissing(entry);
        }
      } catch (e) {
        var detail = norm(e && e.message || e);
        var absent = /\(404\)|ถูกซ่อนด้วยทะเบียนลบ/.test(detail);
        if(absent)markMissing(entry);
        else {entry.status='needs_check';entry.error='ยังตรวจสอบสถานะไม่ได้ เนื่องจากติดต่อ Cloud ไม่สำเร็จ กรุณาตรวจอีกครั้ง ไม่ต้องส่งซ้ำ';}
      }
    }
    for (var i = 0; i < entries.length; i += 6) await Promise.all(entries.slice(i, i + 6).map(checkEntry));
    var successful = entries.filter(function (entry) { return entry.status === 'verified'; });
    entries = entries.filter(function (entry) {
      if (entry.status === 'verified' || entry.status === 'deleted') return true;
      if (rejectedIds.has(entry.id) && !entry.cloudPartial) return false;
      var requested = unique(entry.shortNames || []), attemptedAt = Date.parse(entry.at);
      if (!requested.length || !Number.isFinite(attemptedAt)) return true;
      return !successful.some(function (saved) {
        var savedAt = Date.parse(saved.at);
        return norm(saved.campaign) === norm(entry.campaign) && norm(saved.user) === norm(entry.user) &&
          Number.isFinite(savedAt) && savedAt >= attemptedAt &&
          requested.every(function (name) { return (saved.cloudShortNames || []).indexOf(name) !== -1; });
      });
    });
    return entries.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
  }
  window.PC_SubmissionLog = { prepare: prepare, fail: fail, afterSave: afterSave, verifyPlan: verifyPlan,
    list: list, listActivity: listActivity, createActivity: createActivity, summarize: summarize, today: today, user: user, canViewAll: canViewAll, openLog: openLog, readAttempts: readAttempts };
})();
