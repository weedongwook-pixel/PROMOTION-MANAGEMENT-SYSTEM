/* ============================================================================
 *  js/co-promo.js — Co-Promotion (MKT กรอกตอนแจ้งโปร → แจ้ง ACC · IT interface ERP)
 *  ---------------------------------------------------------------------------
 *  window.PC_CoPromo.promptAfterSubmit(campaigns, opts)   หลัง submit → ถาม → เปิดฟอร์ม
 *  window.PC_CoPromo.openForm(campaign, existing)         เปิดฟอร์มหน้าเต็ม (แก้/เพิ่ม)
 *  ฟอร์ม = หน้าเต็ม (full-page) กรอกง่าย · โค้ดผูกอัตโนมัติจากระบบ (ล็อก แก้ไม่ได้)
 *  วันที่/ช่วงเวลา = read-only (เปลี่ยนผ่านการขยาย/ยกเลิกโปรที่หน้าตาราง → sync มาที่นี่)
 * ========================================================================== */
(function () {
  "use strict";

  var TYPES = ["Co-Promotion", "คูปองใช้แทนเงินสด"];
  var PAYTYPES = ["Advance", "Pay per use"];

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function run(fn, arg) {
    return new Promise(function (resolve, reject) {
      try { google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](arg); }
      catch (e) { reject(e); }
    });
  }
  function role() { try { return localStorage.getItem("pc_role") || ""; } catch (e) { return ""; } }
  function userName() { try { return localStorage.getItem("pc_userName") || localStorage.getItem("pc_role") || ""; } catch (e) { return ""; } }
  function periodText(ctx) { var s = ctx.start || "", e = ctx.end || ""; return (!s && !e) ? "" : (s + " → " + e); }

  /* หลัง Cloud บันทึกสำเร็จ ทุกประเภทเลือก CoPromo และการส่งเมลได้ */
  function promptAfterSubmit(campaigns, opts) {
    opts = opts || {};
    campaigns = (campaigns || []).filter(Boolean);
    if (!campaigns.length || !window.Swal) return Promise.resolve();

    return Swal.fire({
      icon: "question", title: "เป็น Co-Promotion หรือไม่?",
      html: '<div style="font-size:.9rem;color:#48505a;line-height:1.6">โปรที่ร่วมกับพาร์ทเนอร์ (เช่น Samsung, KTC, Grab, Central ฯลฯ)<br>เลือกลูปอีเมลเดิมและตรวจรายละเอียดโปรฯ ก่อนยืนยันส่ง<br><b style="color:#1a1d20">' + esc(campaigns.join(", ")) + "</b></div>",
      showCancelButton: true, confirmButtonText: '<i class="fas fa-handshake"></i> ใช่ · เตรียมส่งเมลเข้าลูป',
      cancelButtonText: "ไม่ใช่", confirmButtonColor: "#2e934a", cancelButtonColor: "#9aa0a6", reverseButtons: true,
    }).then(async function (res) {
      if (!res.isConfirmed) {
        if(res.dismiss!==Swal.DismissReason.cancel)return;
        const send=await Swal.fire({icon:'question',title:'ต้องการส่งอีเมลแจ้งโปรโมชั่นหรือไม่?',text:campaigns.join(', '),showCancelButton:true,confirmButtonText:'ส่ง',cancelButtonText:'ไม่ส่ง',allowOutsideClick:false});
        if(send.isConfirmed){for(const campaign of campaigns){const result=await window.PC_CoProEmailUI.save({campaign},{notificationOnly:true});if(!result)return {coPromo:false,completed:false};}return {coPromo:false,completed:true};}
        if(window.PC_CLOUD?.saveMailDecision)for(const campaign of campaigns)await window.PC_CLOUD.saveMailDecision(campaign,'submitted','','not_sent');
        return {coPromo:false};
      }
      if(!window.PC_CoPromoDrafts?.recordCoPromo)throw Error('ระบบบันทึก CoPromo ยังไม่พร้อม กรุณาเปิดเว็บใหม่');
      for(const campaign of campaigns)await window.PC_CoPromoDrafts.recordCoPromo(campaign);
      return openFormsSequential(campaigns.slice()).then(function (completed) {
        return completed === true ? { coPromo: true, completed: true } : completed;
      });
    });
  }
  function openFormsSequential(list) {
    if (!list.length) return Promise.resolve(true);
    var c = list.shift();
    return openForm(c, null, { requireEmail: true }).then(async function (saved) {
      if (saved === true) return openFormsSequential(list);
      if (saved && saved.draftSaved && window.PC_CoPromoDrafts) {
        for (const pending of list) await window.PC_CoPromoDrafts.save(pending, {}, null);
      }
      return saved;
    });
  }

  async function openForm(campaign, existing, options) {
    options = options || {};
    var ctx;
    if (options.requireEmail && window.PC_CLOUD && window.PC_CLOUD.readCampaignRows) {
      const rows = options.cloudRows || await window.PC_CLOUD.readCampaignRows(campaign);
      if (!rows.length) throw Error('ไม่พบโปรฯ ต้นฉบับบน Cloud กรุณาตรวจประวัติ');
      const seen = new Set(), buttons = [];
      for (const row of rows) {
        const key = row.emailButtonId || row.shortName;
        if (seen.has(key)) continue; seen.add(key);
        buttons.push({buttonName:row.shortName, emailButtonId:row.emailButtonId, codePromotion:row.codePromotion,
          codeItemSet:row.codeItemSet||row.itemPromotion, detail:row.detail, typePromotion:row.typePromotion||row.promoType});
      }
      ctx = {campaign, start:rows[0].start, end:rows[0].end, typePromotion:rows[0].typePromotion||rows[0].promoType, buttons};
    } else ctx = await run("getCoPromoContext", campaign);
    return showFormPage(ctx || {campaign,buttons:[]}, existing || {}, options);
  }

  /* ---- ฟอร์มหน้าเต็ม ---- */
  function showFormPage(ctx, ex, options) {
    ex = ex || {};
    var requireEmail = !!options.requireEmail;
    var saveLabel = requireEmail ? 'เลือกลูปและตรวจเมล' : 'บันทึก & แจ้ง ACC';
    var editing = !!ex.id;
    var btns = ctx.buttons || [];
    var resumeIndex = 0;
    if ((options.draft || options.selection) && (ex.emailButtonId || ex.buttonName || ex.cmposName)) {
      const matches = btns.map((button,index)=>({button,index})).filter(x=>ex.emailButtonId
        ? x.button.emailButtonId===ex.emailButtonId : x.button.buttonName===(ex.buttonName||ex.cmposName));
      if(matches.length!==1)throw Error('ไม่พบปุ่มเดิมของฉบับร่าง หรือชื่อปุ่มซ้ำ กรุณาตรวจงานต้นฉบับก่อนส่งเมล');
      resumeIndex=matches[0].index;
    }

    // โหมดแก้ไข: ล็อกโค้ดของเรคคอร์ดเดิม · โหมดสร้าง: เลือกปุ่มจาก dropdown
    var codeBlock;
    if (editing) {
      codeBlock =
        '<div class="cpf-lock"><i class="fas fa-lock"></i> โค้ดผูกกับโปรโมชั่น — แก้ไขไม่ได้ (เปลี่ยนได้ที่หน้าตารางเวลาเท่านั้น)</div>' +
        '<div class="cpf-grid">' +
        '<div><label>Code Promotion</label><input id="cpCodeP" readonly value="' + esc(ex.codePromotion || "") + '"></div>' +
        '<div><label>Code Item Set</label><input id="cpCodeI" readonly value="' + esc(ex.codeItemSet || "") + '"></div>' +
        "</div>";
    } else {
      var btnOpts = btns.map(function (b, i) {
        var code = b.codePromotion || b.codeItemSet || "-";
        return '<option value="' + i + '">' + esc(code + " · " + (b.buttonName || "-")) + "</option>";
      }).join("");
      codeBlock =
        '<div class="cpf-auto"><i class="fas fa-link"></i> โค้ดผูกอัตโนมัติจากระบบ — MKT ไม่ต้องกรอกโค้ด</div>' +
        '<label>ปุ่ม / โค้ดโปรโมชั่น (CMPOS Code)</label>' +
        (btnOpts ? '<select id="cpBtn">' + btnOpts + "</select>" : '<input id="cpBtn" value="' + esc(ex.codePromotion || "") + '" placeholder="ไม่พบปุ่มในระบบ — กรอกโค้ด">') +
        '<div class="cpf-grid" style="margin-top:8px">' +
        '<div><label>Code Promotion</label><input id="cpCodeP" readonly></div>' +
        '<div><label>Code Item Set</label><input id="cpCodeI" readonly></div>' +
        "</div>";
    }

    var payOpts = PAYTYPES.map(function (p) { return '<option value="' + esc(p) + '"' + (ex.paymentType === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("");
    var per = ex.periodText || periodText(ctx);

    var host = document.createElement("div");
    host.id = "pcCoproPage";
    host.innerHTML = '' +
      '<style>' +
      'body:has(#pcCoproPage) > .swal2-container{z-index:3100}' +
      '#pcCoproPage{position:fixed;inset:0;z-index:3000;background:#eef1f4;font-family:Kanit,sans-serif;color:#2b333c;display:flex;flex-direction:column;overflow:hidden}' +
      '#pcCoproPage .cpf-top{background:#0e5c37;color:#fff;padding:16px 22px;display:flex;align-items:center;gap:14px;box-shadow:0 3px 14px rgba(14,92,55,.25);flex:none}' +
      '#pcCoproPage .cpf-top .bk{background:rgba(255,255,255,.16);border:0;color:#fff;width:40px;height:40px;border-radius:11px;cursor:pointer;font-size:1.05rem}' +
      '#pcCoproPage .cpf-top .bk:hover{background:rgba(255,255,255,.28)}' +
      '#pcCoproPage .cpf-top h2{margin:0;font-family:Montserrat,sans-serif;font-weight:800;font-size:1.3rem;line-height:1.15}' +
      '#pcCoproPage .cpf-top .sub{font-size:.8rem;opacity:.85;margin-top:2px}' +
      '#pcCoproPage .cpf-scroll{flex:1;overflow:auto;padding:26px 18px 120px}' +
      '#pcCoproPage .cpf-card{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e4e8ec;border-radius:18px;padding:24px 26px;box-shadow:0 2px 4px rgba(20,32,43,.05),0 10px 30px rgba(20,32,43,.05)}' +
      '#pcCoproPage label{display:block;font-size:.78rem;font-weight:700;color:#48505a;margin:14px 0 4px}' +
      '#pcCoproPage input,#pcCoproPage select,#pcCoproPage textarea{width:100%;border:1.5px solid #d3d8de;border-radius:10px;padding:10px 12px;font-family:inherit;font-size:.92rem;background:#fff;color:#222}' +
      '#pcCoproPage input:focus,#pcCoproPage select:focus,#pcCoproPage textarea:focus{outline:none;border-color:#2e934a}' +
      '#pcCoproPage input[readonly]{background:#f4f6f8;color:#5a626b}' +
      '#pcCoproPage textarea{resize:vertical;min-height:60px}' +
      '#pcCoproPage .cpf-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '#pcCoproPage .cpf-chip{display:inline-flex;align-items:center;gap:7px;background:#f1f4f7;border-radius:22px;padding:8px 16px;font-size:.86rem;font-weight:600;margin:0 8px 0 0;cursor:pointer}' +
      '#pcCoproPage .cpf-chip input{width:auto}' +
      '#pcCoproPage .cpf-auto{background:#eef7f1;border:1px dashed #9fd3b4;border-radius:11px;padding:10px 13px;font-size:.84rem;color:#1f6b40;margin-bottom:6px}' +
      '#pcCoproPage .cpf-lock{background:#fff4e6;border:1px dashed #f0c48a;border-radius:11px;padding:10px 13px;font-size:.84rem;color:#9a5b17;margin-bottom:6px}' +
      '#pcCoproPage .cpf-note{font-size:.74rem;color:#8a9099;margin-top:4px}' +
      '#pcCoproPage .cpf-exc{font-size:.76rem;color:#1f6b40;font-weight:700;margin-top:4px}' +
      '#pcCoproPage .cpf-sec{font-family:Montserrat,sans-serif;font-weight:700;font-size:.82rem;color:#0e5c37;letter-spacing:.5px;text-transform:uppercase;margin:22px 0 2px;padding-top:16px;border-top:1px solid #eef1f4}' +
      '#pcCoproPage .cpf-sec:first-of-type{border-top:0;padding-top:0;margin-top:4px}' +
      '#pcCoproPage .cpf-foot{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #e4e8ec;padding:14px 22px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;box-shadow:0 -4px 18px rgba(20,32,43,.06)}' +
      '#pcCoproPage .cpf-btn{border:0;border-radius:11px;padding:12px 26px;font-family:inherit;font-weight:800;font-size:.95rem;cursor:pointer}' +
      '#pcCoproPage .cpf-save{background:#2e934a;color:#fff}#pcCoproPage .cpf-save:hover{background:#237a3b}' +
      '#pcCoproPage .cpf-cancel{background:#fff;color:#5a616b;border:1.5px solid #d8dde2}#pcCoproPage .cpf-cancel:hover{background:#f4f6f8}' +
      '#pcCoproPage .cpf-err{color:#c0392b;font-size:.82rem;font-weight:700;margin-right:auto;align-self:center;display:none}' +
      '@media(max-width:600px){#pcCoproPage .cpf-grid{grid-template-columns:1fr}#pcCoproPage .cpf-card{padding:18px 15px}#pcCoproPage .cpf-scroll{padding:16px 10px 120px}}' +
      "</style>" +
      '<div class="cpf-top">' +
      '<button class="bk" id="cpfBack" title="ปิด"><i class="fas fa-arrow-left"></i></button>' +
      '<div><h2><i class="fas fa-handshake"></i> ' + (editing ? "แก้ไข " : "") + "Co-Promotion</h2>" +
      '<div class="sub">' + esc(ctx.campaign) + " · แจ้งทีมบัญชี (ACC) เพื่อตั้งค่า ERP</div></div></div>" +
      '<div class="cpf-scroll"><div class="cpf-card">' +
      '<div class="cpf-sec">โค้ด & ประเภท</div>' +
      codeBlock +
      '<label>Type Promotion (ผูกจากระบบ · แก้ไม่ได้)</label><input id="cpTypePromo" readonly value="' + esc(ex.promoType || ctx.typePromotion || "") + '">' +
      '<div class="cpf-note"><i class="fas fa-circle-info"></i> รายการนี้เป็น <b>Co-Promotion</b> — เรียกเก็บเงินจากพาร์ทเนอร์ที่มาร่วมโปร (บริษัทข้างนอก)</div>' +
      '<div class="cpf-sec">ข้อมูลพาร์ทเนอร์ (MKT กรอก)</div>' +
      '<label>CMPOS Name (ชื่อปุ่ม)</label><input id="cpName" value="' + esc(ex.cmposName || "") + '">' +
      '<div class="cpf-grid">' +
      '<div><label>Brand / พาร์ทเนอร์</label><input id="cpBrand" value="' + esc(ex.brand || "") + '" placeholder="เช่น Samsung, KTC"></div>' +
      '<div><label>เรียกเก็บในนาม (บริษัท)</label><input id="cpBill" value="' + esc(ex.billingEntity || "") + '" placeholder="ชื่อนิติบุคคล"></div>' +
      "</div>" +
      '<label>MKT Description (รายละเอียดโปรโมชั่น)</label><textarea id="cpDesc">' + esc(ex.detail || "") + "</textarea>" +
      '<label>Campaign Period (ช่วงเวลา)</label><input id="cpPeriod" readonly value="' + esc(per) + '">' +
      '<div class="cpf-note"><i class="fas fa-circle-info"></i> วันที่ดึงจากโปรฯ อัตโนมัติ — ต้องการเปลี่ยน ให้ไป "ขยาย/ยกเลิก" ที่หน้าศูนย์ติดตามงาน แล้วระบบจะอัปเดตที่นี่ให้เอง</div>' +
      '<div class="cpf-sec">การเรียกเก็บ / ERP</div>' +
      '<div class="cpf-grid">' +
      '<div><label>Payment Type</label><select id="cpPay">' + payOpts + "</select></div>" +
      '<div><label>SO No.</label><input id="cpSo" value="' + esc(ex.soNo || "") + '"></div>' +
      "</div>" +
      '<div class="cpf-grid">' +
      '<div><label>Quota</label><input id="cpQuota" type="number" value="' + esc(ex.quota || "") + '"></div>' +
      '<div><label>Price Inc. VAT (฿)</label><input id="cpPrice" type="number" step="0.01" value="' + esc(ex.priceIncVat || "") + '"><div class="cpf-exc" id="cpExc"></div></div>' +
      "</div>" +
      '<label>Payment condition (เงื่อนไขการจ่าย)</label><input id="cpCond" value="' + esc(ex.paymentCondition || "") + '">' +
      '<label>Remark (หมายเหตุ)</label><textarea id="cpRemark">' + esc(ex.remark || "") + "</textarea>" +
      "</div></div>" +
      '<div class="cpf-foot"><span class="cpf-err" id="cpfErr" role="alert"></span>' +
      (requireEmail ? '<button type="button" class="cpf-btn cpf-cancel" id="cpfDraft">บันทึกฉบับร่าง</button>' : '') +
      '<button class="cpf-btn cpf-cancel" id="cpfCancel">พัก / ปิด</button>' +
      '<button class="cpf-btn cpf-save" id="cpfSave"><i class="fas fa-paper-plane"></i> ' + saveLabel + '</button></div>';

    document.body.appendChild(host);

    return new Promise(function (resolve) {
      var draftState = options.draft || null, selectedButtonId = ex.emailButtonId || '';
      var dirty = false;
      function beforeLeave(event) { if (dirty) { event.preventDefault(); event.returnValue = ''; } }
      window.addEventListener('beforeunload', beforeLeave);
      host.addEventListener('input', function () { dirty = true; });
      function close(value) { window.removeEventListener('beforeunload', beforeLeave); try { host.remove(); } catch (e) {} resolve(value); }
      function collect() {
        var g = id => String(document.getElementById(id)?.value || '').trim();
        return {campaign:ctx.campaign, emailButtonId:selectedButtonId, cmposName:g('cpName'),buttonName:g('cpName'),
          brand:g('cpBrand'),billingEntity:g('cpBill'),detail:g('cpDesc'),paymentType:g('cpPay'),soNo:g('cpSo'),
          quota:g('cpQuota'),priceIncVat:g('cpPrice'),paymentCondition:g('cpCond'),remark:g('cpRemark')};
      }
      async function saveDraft() {
        const controls=Array.from(host.querySelectorAll('input,select,textarea,button')),disabled=controls.map(el=>el.disabled);
        const record=collect(); controls.forEach(el=>el.disabled=true);
        try {
          if(!window.PC_CoPromoDrafts)throw Error('ระบบฉบับร่างยังไม่พร้อม กรุณาเก็บข้อมูลก่อนเปิดเว็บใหม่');
          await window.PC_CoPromoDrafts.recordCoPromo(ctx.campaign,record);
          draftState=await window.PC_CoPromoDrafts.save(ctx.campaign,record,draftState); dirty=false;
          await Swal.fire({icon:'success',title:'บันทึกฉบับร่างแล้ว',text:'เปิดทำต่อได้ที่งานค้างของฉัน · ยังไม่ส่งเมล',timer:1800,showConfirmButton:false});
          close({draftSaved:true});
        } catch(e) { const error=document.getElementById('cpfErr');error.textContent=e.message;error.style.display='block'; }
        finally { controls.forEach((el,i)=>el.disabled=disabled[i]); }
      }
      async function requestClose() {
        if (!requireEmail) return close();
        const choice=await Swal.fire({icon:'question',title:'เก็บ CoPromo ไว้ทำต่อหรือไม่?',showCancelButton:true,showDenyButton:true,
          confirmButtonText:'บันทึกฉบับร่าง',denyButtonText:'ปิดโดยไม่บันทึกเพิ่ม',cancelButtonText:'กรอกต่อ'});
        if(choice.isConfirmed)return saveDraft();
        if(choice.isDenied)close();
      }
      if(requireEmail)document.getElementById('cpfDraft').onclick=saveDraft;
      // prefill codes
      var sel = document.getElementById("cpBtn");
      var cP = document.getElementById("cpCodeP"), cI = document.getElementById("cpCodeI");
      var nm = document.getElementById("cpName"), ds = document.getElementById("cpDesc");
      if (!editing && btns.length) {
        var fill = function () {
          var b = btns[sel && sel.tagName === "SELECT" ? (sel.value | 0) : 0]; if (!b) return;
          selectedButtonId = b.emailButtonId || '';
          cP.value = b.codePromotion || ""; cI.value = b.codeItemSet || "";
          var tp = document.getElementById("cpTypePromo"); if (tp) tp.value = b.typePromotion || ctx.typePromotion || "";
          if (!nm.value || requireEmail) nm.value = b.buttonName || "";
          if (!ds.value) ds.value = b.detail || "";
        };
        if (sel && sel.tagName === 'SELECT' && (options.draft||options.selection)) sel.value=String(resumeIndex);
        fill();
        if (sel && sel.tagName === "SELECT") sel.onchange = function () { nm.value = ""; ds.value = ""; fill(); };
      }
      var pr = document.getElementById("cpPrice"), exc = document.getElementById("cpExc");
      function calcExc() { var p = parseFloat(pr.value) || 0; exc.textContent = p ? "Exc. VAT ≈ " + (p / 1.07).toFixed(2) + " ฿" : ""; }
      pr.oninput = calcExc; calcExc();

      document.getElementById("cpfBack").onclick = requestClose;
      document.getElementById("cpfCancel").onclick = requestClose;
      document.getElementById("cpfSave").onclick = function () {
        var g = function (id) { var el = document.getElementById(id); return el ? String(el.value).trim() : ""; };
        var errEl = document.getElementById("cpfErr");
        if (!g("cpBrand")) { errEl.textContent = "กรอก Brand / พาร์ทเนอร์"; errEl.style.display = "block"; return; }
        errEl.style.display = "none";
        var rec = {
          emailButtonId:selectedButtonId, id: ex.id || undefined, campaign: ctx.campaign, type: ex.type || "Co-Promotion",
          codePromotion: editing ? ex.codePromotion : cP.value, codeItemSet: editing ? ex.codeItemSet : cI.value,
          cmposName: g("cpName"), buttonName: g("cpName"), brand: g("cpBrand"), billingEntity: g("cpBill"),
          detail: g("cpDesc"), periodText: g("cpPeriod"), start: ctx.start || ex.start || "", end: ctx.end || ex.end || "",
          paymentType: g("cpPay"), soNo: g("cpSo"), quota: g("cpQuota"), priceIncVat: g("cpPrice"),
          paymentCondition: g("cpCond"), remark: g("cpRemark"),
          promoType: g("cpTypePromo") || ctx.typePromotion || ex.promoType || "", createdBy: ex.createdBy || userName(), createdRole: ex.createdRole || role(), updatedBy: userName(),
        };
        var btn = document.getElementById("cpfSave"); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
        var useEmail=requireEmail || (window.PC_CoProEmail&&window.PC_CoProEmail.active());
        var operation=Promise.resolve().then(async function () {
          if (requireEmail) {
            await window.PC_CoPromoDrafts.recordCoPromo(ctx.campaign,rec);
            if (!window.PC_CoProEmail || !window.PC_CoProEmailUI) throw Error('ระบบอีเมลยังไม่พร้อม กรุณาติดต่อผู้ดูแล');
            var caps = await window.PC_CoProEmail.capabilities();
            if (!caps.coproEnabled || !caps.sendingEnabled) throw Error('ยังไม่ได้เปิดบริการส่งอีเมลหรือเชื่อมบัญชีผู้ส่ง กรุณาติดต่อผู้ดูแล');
            if (!window.PC_CoProEmail.active()) await window.PC_CoProEmail.enable();
          }
          return useEmail ? window.PC_CoProEmailUI.save(rec, requireEmail ? {mode:'production'} : {}) : run("saveCoPromotion", rec);
        });
        operation.then(async function (result) {
          if(!result){btn.disabled=false;btn.innerHTML='<i class="fas fa-paper-plane"></i> ' + saveLabel;return;}
          if(result.status==='error')throw new Error(result.message||'บันทึกไม่สำเร็จ');
          if(requireEmail && result.mailStatus!=='queued') throw Error('ยังไม่ได้รับการยืนยันว่าอีเมลเข้าคิวส่ง กรุณาให้ผู้ดูแลตรวจสถานะก่อนทำซ้ำ');
          if(requireEmail){
            try{await window.PC_CoPromoDrafts.recordCoPromo(ctx.campaign,rec,'queued');}
            catch(e){await Swal.fire({icon:'warning',title:'อีเมลเข้าคิวแล้ว',text:'ไม่ต้องส่งซ้ำ แต่สถานะในหน้า CoPromo ยังอัปเดตไม่สำเร็จ: '+e.message});}
          }
          if (draftState && window.PC_CoPromoDrafts) {
            try { await window.PC_CoPromoDrafts.remove(draftState); }
            catch(e) { await Swal.fire({icon:'warning',title:'อีเมลเข้าคิวแล้ว แต่ยังล้างฉบับร่างไม่สำเร็จ',text:'ไม่ต้องส่งซ้ำ: '+e.message}); }
          }
          dirty=false;
          window.removeEventListener('beforeunload', beforeLeave);
          host.remove();
          if (window.Swal) await Swal.fire({ icon: "success", title: (editing ? "อัปเดต" : "บันทึก") + " Co-Promotion แล้ว", text:useEmail?'บันทึกแล้ว · อีเมลรายละเอียดอยู่ในคิวส่ง':'บันทึกแล้ว · รอ IT ยืนยัน Interface ERP', timer: 2600, showConfirmButton: false });
          resolve(true);
        }).catch(function (e) {
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + saveLabel;
          errEl.textContent = (requireEmail ? 'ยังยืนยันการส่งอีเมลไม่ได้ — โปรฯ บันทึกแล้ว ไม่ต้องส่งข้อมูลโปรฯ ซ้ำ: ' : '') + String(e && e.message || e); errEl.style.display = "block";
          if(options.openEmail&&window.Swal)Swal.fire({icon:"error",title:"เปิดหน้าส่งเมลไม่สำเร็จ",text:String(e && e.message || e),confirmButtonText:"กลับไปแก้ไข / ลองใหม่"});
        });
      };
      if(options.openEmail){
        if(String(ex.brand||'').trim())queueMicrotask(()=>document.getElementById('cpfSave')?.click());
        else {const error=document.getElementById('cpfErr');error.textContent='กรอก Brand / พาร์ทเนอร์ แล้วกดเลือกลูปและตรวจเมล';error.style.display='block';document.getElementById('cpBrand').focus();}
      }
    });
  }

  window.PC_CoPromo = { promptAfterSubmit: promptAfterSubmit, openForm: openForm };
})();
