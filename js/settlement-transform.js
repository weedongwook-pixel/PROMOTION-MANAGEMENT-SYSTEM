// Shared, staged form of the existing IT settlement transformation. No I/O.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PC_Settlement=api;})(globalThis,function(){
'use strict';
function applySettlement(input,month,updates){
 const store=JSON.parse(JSON.stringify(input.store)),SEED={items:input.master||[]};
 const values={...(input.values||{})},confirmations=[],notifications=[];
 const localStorage={getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v);}};
 const TODAY=()=>input.day,NOW=()=>input.now,persist=()=>true;
 const rebuildWorking=()=>{throw Error('settlement_staging_failed');};
 const API={isPosReuseConfirmed:input.isReuseConfirmed||(()=>false)};
 const PC_COUNTER={confirm:(code,type,opts)=>confirmations.push({code,type,...opts})};
 const window={PC_COUNTER,PC_notify:(event,payload)=>notifications.push({event,payload})};
  const legacyItemSetCode = row => {
    if (!row || String(row.codeItemSet || '').trim()) return '';
    if (!/price promotion/i.test(String(row.typePromotion || row.promoType || ''))) return '';
    if (String(row.itStatus || '').toUpperCase() !== 'COMPLETE') return '';
    // The derived `working` view has no itemCode. Read its month item rows,
    // and only accept an unambiguous 107 product from that exact button.
    const codes = new Set();
    const take = r => {
      const code = String(r && r.itemCode || '').trim();
      if (/^107\d{3,}$/.test(code)) codes.add(code);
    };
    take(row);
    (store.months[row.month] || []).forEach(r => {
      if (r.campaign === row.campaign && r.shortName === row.shortName) take(r);
    });
    return codes.size === 1 ? [...codes][0] : '';
  };
  const reusableItemSetCode = row => String(row && row.codeItemSet || '').trim() || legacyItemSetCode(row);

  function itemsetChannelPrices(saleMode, gross) {
    const g = (gross == null || gross === "") ? "" : String(gross);
    const sm = String(saleMode || "").toLowerCase();
    const on = {};
    const DLV = ["grab", "line", "panda", "shopee", "robin", "gokoo"];
    if (sm.indexOf("all channel") >= 0) { ["ta"].concat(DLV).forEach(k => on[k] = 1); }
    else if (sm.indexOf("all delivery") >= 0) { DLV.forEach(k => on[k] = 1); }
    else {
      if (sm.indexOf("take away") >= 0 || sm.indexOf("takeaway") >= 0) on.ta = 1;
      if (sm.indexOf("grab") >= 0) on.grab = 1;
      if (sm.indexOf("lineman") >= 0 || sm.indexOf("line man") >= 0) on.line = 1;
      if (sm.indexOf("shopee") >= 0) on.shopee = 1;
      if (sm.indexOf("robinhood") >= 0) on.robin = 1;
      if (sm.indexOf("gokoo") >= 0) on.gokoo = 1;
      // foodpanda ไม่มีในฟอร์ม → ไม่เติม
    }
    const anyDlv = DLV.some(k => on[k]);
    return {
      priceTA: on.ta ? g : "", priceDLV: anyDlv ? g : "",
      priceGrab: on.grab ? g : "", priceLineman: on.line ? g : "", pricePanda: on.panda ? g : "",
      priceShopee: on.shopee ? g : "", priceRobinhood: on.robin ? g : "", priceGokoo: on.gokoo ? g : "",
    };
  }

  /* หา cate จริงจากชื่อหมวด (bound มาจากฟอร์ม) → คืน {cateCode, category, department, depCode}
     match แบบ case-insensitive/trim กับ item master (เช่นฟอร์มส่ง "Promotion set" ↔ master "Promotion Set" = 107,
     "Specialty Fries" = 102). ไม่เจอ → คงชื่อเดิม cateCode ว่าง เพื่อไม่ให้ตกไปหมวดผิด */
  function resolveCateByName(name) {
    var want = String(name == null ? "" : name).trim().toLowerCase();
    if (!want) return null;
    var list = SEED.items || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var cn = String(it.category == null ? "" : it.category).trim();
      if (cn.toLowerCase() !== want) continue;
      var cc = String(it.cateCode == null ? (it.catCode == null ? "" : it.catCode) : it.cateCode).trim();
      return {
        category: cn, cateCode: cc,
        department: it.department || "Food", depCode: String(it.depCode == null ? "100" : it.depCode).trim() || "100",
      };
    }
    return null;
  }

  /* item-set button → product master row (Name EN=kitchen, Name TH=shortName, Gross, cate, Size=cate,
     Dept=Food, ชั่วคราว, ราคารายช่องทาง = Gross ก๊อปลงช่องที่ขาย). แถวเดียวต่อปุ่ม */
  /* ---- ตัวย่อที่เปลี่ยนไปแล้ว (store.abbrMap) ----
     ตัวย่อที่ IT อนุมัติให้เปลี่ยนแล้ว ต้องมีผลกับ "ของที่จะเกิดขึ้นทีหลัง" ด้วย —
     แถวโปรที่ยังรอ IT/OP จะถูกเขียนลงตารางข้อมูลหลักสินค้าเมื่อ IT กดบันทึก
     ถ้าไม่กรองผ่านแผนที่นี้ ชื่อสินค้าใหม่จะกลับไปใช้ตัวย่อเดิม (เปลี่ยนแล้วเหมือนไม่ได้เปลี่ยน) */
  const ABBR_SP = "SBLJMGT";
  const abbrRx = (o) => new RegExp("(^|[^A-Za-z0-9])([" + ABBR_SP + "]?)(" + String(o).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z0-9])", "gi");
  function abbrFix(text) {
    let s = String(text == null ? "" : text);
    if (!s) return s;
    (store.abbrMap || []).forEach(m => {
      if (!m || !m.old || !m.new) return;
      s = s.replace(abbrRx(m.old), (x, pre, size) => pre + size + m.new);
    });
    return s;
  }
  /* \u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e17\u0e35\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e19\u0e2d\u0e01\u0e08\u0e32\u0e01 item-master (IT \u0e01\u0e14\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01 / NPD / \u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1c\u0e07) \u2014 \u0e43\u0e0a\u0e49\u0e19\u0e31\u0e1a\u0e1c\u0e25\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e40\u0e27\u0e25\u0e32\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d */

  /* แถวโปรทุกประเภทที่ IT บันทึก → ตารางข้อมูลหลักสินค้า (ไม่ใช่แค่ Item Set)
     เพื่อให้ของที่ IT ตั้งค่าแล้วมีตัวตนในข้อมูลหลักทันที (ค้นหา/เปลี่ยนตัวย่อ/รายงาน เห็นครบ) */
  function promoToProducts(info, code, kind) {
    if (!code) return 0;
    store.npdProducts = store.npdProducts || [];
    const cate = info.postCate || info.cateRemark || "Promotion";
    const _rc = resolveCateByName(cate);
    const k = String(kind || "").toLowerCase();
    const bind = k.indexOf("coupon") >= 0 ? "Item Coupon" : k.indexOf("voucher") >= 0 ? "Voucher"
      : k.indexOf("bill") >= 0 ? "Bill Discount" : "Price Promotion";
    const row = {
      itemCode: String(code),
      itemNameEN: abbrFix(info.kitchenName || info.shortName || ""),
      itemNameTH: abbrFix(info.shortName || ""),
      category: (_rc ? _rc.category : cate), cateCode: (_rc ? _rc.cateCode : ""),
      department: (_rc ? _rc.department : "Food"), depCode: (_rc ? _rc.depCode : "100"),
      itemType: kind || "Promotion", size: cate,
      gross: (info.gross == null ? "" : String(info.gross)),
      promoBind: bind, status: "Active", core: "ขายชั่วคราว", showInForm: "Hide",
      sellStores: info.storeSelection || "ALL",
      fromDate: info.start || "", toDate: info.end || "",
      postCate: cate, _fromPromo: (info.campaign || "") + "|" + (info.shortName || ""),
    };
    const i = store.npdProducts.findIndex(p => String(p.itemCode) === String(code));
    if (i >= 0) store.npdProducts[i] = Object.assign({}, store.npdProducts[i], row);
    else store.npdProducts.push(row);
    return 1;
  }

  function itemsetToProducts(info, code, totalGross, items, reused) {
    if (!code) return;
    store.npdProducts = store.npdProducts || [];
    const cate = info.postCate || "Promotion set";
    const promoBind = (cate === "E-Voucher") ? "Item Coupon Online" : "Price Promotion";
    // ⭐ บันทึกตาม cate ที่ผูกมาจากฟอร์ม — resolve cateCode จริงจากชื่อหมวด (กันงาน 107 ตกไปหมวดผิด/หาย)
    const _rc = resolveCateByName(cate);
    const px = itemsetChannelPrices(info.saleMode, totalGross);
    const row = Object.assign({
      itemCode: String(code),
      itemNameEN: abbrFix(info.kitchenName || info.shortName || ""),
      itemNameTH: abbrFix(info.shortName || ""),
      category: (_rc ? _rc.category : cate), cateCode: (_rc ? _rc.cateCode : ""),
      department: (_rc ? _rc.department : "Food"), depCode: (_rc ? _rc.depCode : "100"),
      itemType: "Item Set", size: cate,
      gross: (totalGross == null ? "" : String(totalGross)),
      promoBind: promoBind,
      status: "Active", core: "ขายชั่วคราว", showInForm: "Hide",
      sellStores: info.storeSelection || "ALL",
      fromDate: info.start || "", toDate: info.end || "",
      postCate: cate, _fromItemSet: (info.campaign || "") + "|" + (info.shortName || ""),
    }, px);
    // A borrowed 107 is the same product as the source campaign. Only its
    // promotion/price binding is new; never overwrite an existing master/recipe.
    const hasMaster = store.npdProducts.some(p => String(p.itemCode) === String(code)) || (SEED.items || []).some(p => String(p.itemCode) === String(code));
    if (!reused || !hasMaster) {
      const i = store.npdProducts.findIndex(p => String(p.itemCode) === String(code));
      if (i >= 0) store.npdProducts[i] = Object.assign({}, store.npdProducts[i], row);
      else store.npdProducts.push(row);
    }
    // เติมตาราง Price Promotion (pc_product_promo) — Type + Code Promotion + Net (ผูกกับโปในหน้าสินค้า) · เติมเฉพาะตอนว่าง/เคย auto — ไม่ทับที่ user แก้เอง
    try {
      var pp = JSON.parse(localStorage.getItem("pc_product_promo") || "{}"); if (!pp || typeof pp !== "object") pp = {};
      var typeP = (cate === "E-Voucher") ? "E-Voucher" : "Price Promotion";
      var bindingKey = (info.campaign || "") + "||" + (info.shortName || "");
      var prow = { typePromo: typeP, prCode: info.codePromotion || "", net: (info.netPrice == null ? "" : String(info.netPrice)), desc1: info.shortName || "", desc2: "", saleMode: info.saleMode || "", _fromItemSet: true, _fromItemSetKey: bindingKey };
      // Same 107 and Promotion code can have separate Sale Mode bindings. Replace
      // only this button's auto row; never erase another campaign's binding.
      var arr = Array.isArray(pp[String(code)]) ? pp[String(code)] : [];
      arr = arr.filter(function (r) { return !(r && r._fromItemSet && r._fromItemSetKey === bindingKey); });
      arr.push(prow);
      pp[String(code)] = arr;
      localStorage.setItem("pc_product_promo", JSON.stringify(pp));
    } catch (e) {}
    if (!reused || !hasMaster) itemsetLinkSubsetComp(code, items, (info.campaign || "") + "|" + (info.shortName || ""));
  }

  /* Item Set components → Edit Product "Subset & Item List" (pc_itemset_comp)
     subset แถว (isSubset='Y' / รหัส SS) → min/max จาก chooseMin/Max · item ปกติ → min=max=qty
     seed เฉพาะตอนว่าง/เคย auto-seed — ไม่ทับที่ user แก้เอง */
  function itemsetLinkSubsetComp(code, items, tag) {
    try {
      if (!Array.isArray(items) || !items.length) return;
      var rows = [];
      items.forEach(function (it) {
        var c = String(it.itemCode || "").trim(); if (!c) return;
        var q = parseInt(it.qty, 10); if (!q || q < 1) q = 1;
        var existing = rows.find(function (r) { return r.code === c; });
        if (it.isSubset === "Y" || /^SS/i.test(c)) {
          var mn = parseInt(it.chooseMin, 10); if (!mn || mn < 1) mn = 1;
          var mx = parseInt(it.chooseMax, 10); if (!mx || mx < mn) mx = mn;
          if (existing) { existing.min += mn * q; existing.max += mx * q; }
          else rows.push({ code: c, min: mn * q, max: mx * q, _itemset: tag });
        } else {
          if (existing) { existing.min += q; existing.max += q; }
          else rows.push({ code: c, min: q, max: q, _itemset: tag });
        }
      });
      if (!rows.length) return;
      var comp = JSON.parse(localStorage.getItem("pc_itemset_comp") || "{}");
      if (!comp || typeof comp !== "object") comp = {};
      var cur = comp[code];
      if (!cur || !cur.length || cur.every(function (r) { return r && (r._itemset || r._npd || r._auto); })) {
        comp[code] = rows;
        localStorage.setItem("pc_itemset_comp", JSON.stringify(comp));
      }
    } catch (e) {}
  }


  function run(month, updates) {
    if (!updates || !updates.length) return "NO_DATA";
    const revisionUpdates=new Set();
    for(const u of updates){
      const r=(store.months[u.month||month]||[])[parseInt(u.rowIdx,10)-2];
      if((u.revisionId||r?.revisionId)&&(!r||String(u.revisionId||'')!==String(r.revisionId||'')||String(u.itemCode||'')!==String(r.itemCode||'')))return 'REVISION_CODE_CONFLICT';
      if(!r||!r.revisionPending)continue;
      if(r.campaign!==u.campaign||String(r.shortName||'')!==String(u.sourceShortName||u.shortName||'')||String(r.codePromotion||'')!==String(u.promoCode||'')||String(r.codeItemSet||r.itemPromotion||'')!==String(u.itemPromo||''))return 'REVISION_CODE_CONFLICT';
      revisionUpdates.add(u);
    }
    // An EXTENDED/REDUCED task is an IT acknowledgement of a POS date change,
    // never a new promotion or Item Set setup. Preserve every existing field
    // except the IT completion/audit fields; do not touch code counters/products.
    if (updates.some(u => u.changeOnly)) {
      if (!updates.every(u => u.changeOnly)) return "CHANGE_CONFLICT";
      const targets = [];
      const seen = new Set();
      for (const u of updates) {
        if (String(u.month || '') !== String(month || '')) return "CHANGE_CONFLICT";
        const sheet = store.months[month];
        const index = parseInt(u.rowIdx, 10) - 2;
        const row = sheet && sheet[index];
        const identity = String(month) + '|' + index;
        if (seen.has(identity) || !row || row.campaign !== u.campaign || String(row.shortName || '') !== String(u.sourceShortName || '')
          || !['EXTENDED', 'REDUCED'].includes(String(row.changeStatus || '').toUpperCase())
          || ['COMPLETE', 'DONE'].includes(String(row.itStatus || '').toUpperCase())
          || String(row.end || '') !== String(u.originalEndDate || '')
          || String(row.codePromotion || '') !== String(u.originalPromoCode || '')
          || String(row.codeItemSet || '') !== String(u.originalCodeItemSet || '')
          || String(row.itemPromotion || '') !== String(u.originalItemPromotion || '')
          || String(row.itemCode || '') !== String(u.originalItemCode || '')) return "CHANGE_CONFLICT";
        seen.add(identity);
        targets.push(row);
      }
      const prior = targets.map(row => ({ itStatus: row.itStatus, itDoneDate: row.itDoneDate, itSettlementSavedAt: row.itSettlementSavedAt, updatedDate: row.updatedDate }));
      targets.forEach(row => {
        row.itStatus = 'COMPLETE'; row.itDoneDate = TODAY(); row.itSettlementSavedAt = row.itSettlementSavedAt || NOW(); row.updatedDate = NOW();
      });
      if (persist()) return 'SUCCESS';
      targets.forEach((row, i) => {
        row.itStatus = prior[i].itStatus;
        row.itDoneDate = prior[i].itDoneDate;
        row.itSettlementSavedAt = prior[i].itSettlementSavedAt;
        row.updatedDate = prior[i].updatedDate;
      });
      rebuildWorking(store);
      return 'STORAGE_ERROR';
    }
    // cross-campaign duplicate check for Code Promotion / Code Item Set
    const campsInBatch = new Set(updates.map(u => u.campaign));
    const existPromo = {}, existItemSet = {};
    store.working.forEach(w => {
      if (campsInBatch.has(w.campaign)) return; // skip the campaigns being saved now
      if (w.codePromotion) {
        const code = String(w.codePromotion).trim().toUpperCase();
        (existPromo[code] = existPromo[code] || []).push({ campaign: w.campaign, itemSet: reusableItemSetCode(w).toUpperCase() });
      }
      const occupiedItemSet = reusableItemSetCode(w);
      if (occupiedItemSet) existItemSet[occupiedItemSet.toUpperCase()] = w.campaign;
    });
    const completedButtons = new Map();
    store.working.forEach(w => {
      if ((w.itDoneDate || w.revisionPending) && w.codeItemSet) completedButtons.set(w.campaign + "||" + w.shortName + "||" + String(w.codeItemSet).trim().toUpperCase(), String(w.codePromotion || "").trim().toUpperCase());
    });
    const completedCode = (u, code) => completedButtons.has(u.campaign + "||" + (u.sourceShortName || u.shortName) + "||" + code);
    for (const u of updates) {
      if(revisionUpdates.has(u))continue;
      const pc = String(u.promoCode || "").trim();
      if (!pc) continue;
      // Owners from this same campaign are already excluded above, so an
      // existing code here remains safe to re-save. Do not skip a different
      // campaign's owner merely because MKT prefilled this code on the target.
      const owners = existPromo[pc.toUpperCase()] || [];
      if (owners.length) {
        const itemSet = String(u.itemPromo || "").trim().toUpperCase();
        // One real POS item/Item Set can carry the same promotion code in
        // different Sale Modes. Permit that pair only after IT confirmed the
        // explicit "use existing Item Set" selection on this button. A button
        // completed earlier with this exact pair may also be re-saved.
        const sharedPair = /^107\d{3,}$/.test(itemSet) &&
          (API.isPosReuseConfirmed(u.campaign, u.sourceShortName || u.shortName, itemSet) ||
            (completedCode(u, itemSet) && completedButtons.get(u.campaign + "||" + (u.sourceShortName || u.shortName) + "||" + itemSet) === pc.toUpperCase())) &&
          owners.every(owner => owner.itemSet === itemSet);
        if (!sharedPair) return "DUP_PROMO|" + pc + "|" + owners[0].campaign + "|" + owners[0].itemSet;
      }
    }
    // An identical list of items is not permission to reuse a 107. IT must
    // confirm the explicit reuse, except when re-saving a button already
    // completed with that exact code (e.g. an extended promotion).
    {
      const isCodes = new Set(updates.map(u => String(u.itemPromo || "").trim().toUpperCase()).filter(Boolean));
      for (const isU of isCodes) {
        if (!existItemSet[isU]) continue;
        const buttons = new Map();
        updates.filter(x => String(x.itemPromo || "").trim().toUpperCase() === isU)
          .forEach(x => buttons.set(String(x.campaign) + "||" + String(x.sourceShortName || x.shortName), x));
        if ([...buttons.values()].some(x => {
          const sourceName = x.sourceShortName || x.shortName;
          if (API.isPosReuseConfirmed(x.campaign, sourceName, isU)) return false;
          return !completedCode(x, isU);
        })) {
          return "DUP_ITEMSET|" + isU + "|" + existItemSet[isU];
        }
      }
    }
    updates.forEach(upd => {
      const sheet = store.months[upd.month] || store.months[month];
      const idx = parseInt(upd.rowIdx, 10) - 2;
      if (sheet && sheet[idx]) {
        const row = sheet[idx];
        const _rowWasIS = /item set/i.test(String(row.typePromotion || row.promoType || "")) || !!row.codeItemSet || /^107/.test(String(row.itemPromotion || ""));
        if (upd.promoType) { row.promoType = upd.promoType; row.typePromotion = upd.promoType; row.typeSel = upd.promoType; if (_rowWasIS) row._wasItemSet = true; }
        row.codePromotion = upd.promoCode;
        row.itemPromotion = upd.itemPromo; row.kitchen = upd.kitchenName;
        row.shortName = upd.shortName; row.itStatus = "COMPLETE"; row.cateRemark = upd.cateRemark;
        row.itDoneDate = TODAY();
        row.itSettlementSavedAt = row.itSettlementSavedAt || NOW();
        if(revisionUpdates.has(upd)){row.revisionPending=false;row.itSettlementSavedAt=NOW();row.opStatus='WAITING';row.opDoneDate='';}
        // Item Set + Code Promotion = P-code (Pxxx จากฟอร์ม Item Set) → เปลี่ยน Type เป็น Price Promotion (ตามที่ผูกใน Backoffice) · เก็บ flag _wasItemSet ให้ Builder/Recipe ยังเห็น
        if (/item set/i.test(String(upd.promoType || "")) && /^P\s*\d/i.test(String(upd.promoCode || "").trim())) {
          row.promoType = "Price Promotion"; row.typePromotion = "Price Promotion"; row._wasItemSet = true;
        }
        // if this was rejected by OP, IT's save sends it back to OP for re-verification
        if (String(row.opStatus || "").toUpperCase() === "REJECTED") { row.opStatus = "WAITING"; row.rejectReason = ""; row.opDoneDate = ""; }
      }
      store.working.forEach(w => {
        // A campaign can contain several POS buttons with different Item Set
        // codes. Update only the button represented by this settlement row.
        if (w.campaign === upd.campaign && w.shortName === (upd.sourceShortName || upd.shortName) && (!revisionUpdates.has(upd)||String(w.month||'')===String(upd.month||month))) {
          const _wWasIS = /item set/i.test(String(w.typePromotion || w.promoType || "")) || !!w.codeItemSet || /^107/.test(String(w.itemPromotion || ""));
          w.itStatus = "COMPLETE"; if (upd.promoType) { w.promoType = upd.promoType; w.typePromotion = upd.promoType; w.typeSel = upd.promoType; if (_wWasIS) w._wasItemSet = true; } w.codePromotion = upd.promoCode;
          w.codeItemSet = upd.itemPromo; w.cateRemark = upd.cateRemark; w.updatedDate = NOW();
          w.itDoneDate = TODAY();
          w.itSettlementSavedAt = w.itSettlementSavedAt || NOW();
          if(revisionUpdates.has(upd)){w.revisionPending=false;w.itSettlementSavedAt=NOW();w.opStatus='WAITING';w.opDoneDate='';}
          if (/item set/i.test(String(upd.promoType || "")) && /^P\s*\d/i.test(String(upd.promoCode || "").trim())) {
            w.promoType = "Price Promotion"; w.typePromotion = "Price Promotion"; w._wasItemSet = true;
          }
          // loop back to OP: rejected → waiting re-check
          if (String(w.opStatus || "").toUpperCase() === "REJECTED") { w.opStatus = "WAITING"; w.rejectReason = ""; w.opDoneDate = ""; }
        }
      });
    });
    // Item Set: IT ยืนยัน Code Item Set แล้ว → สร้าง/อัปเดตปุ่มสินค้าในตารางสินค้า
    // (จังหวะที่ถูกต้อง — โค้ด 107 เพิ่งถูก autorun+ยืนยันตอนนี้ ไม่ใช่ตอน MKT ส่ง)
    const _isGroups = {};
    updates.forEach(u => {
      if (String(u.promoType || "").toUpperCase().indexOf("ITEM SET") < 0 && !/^107/.test(String(u.itemPromo || "").trim())) return;
      const code = String(u.itemPromo || "").trim();
      if (!code) return;
      const gk = u.campaign + "|" + u.shortName;
      if (!_isGroups[gk]) _isGroups[gk] = { code, campaign: u.campaign, shortName: u.shortName, month:u.month||month, promoCode: u.promoCode || "", netPrice: u.netPrice || "", reused: API.isPosReuseConfirmed(u.campaign, u.sourceShortName || u.shortName, code) || (!revisionUpdates.has(u)&&completedCode(u, code.toUpperCase())), items: [] };
      // The IT form does not send Subset choice limits. Read them from the
      // original proposal row before linking this button to product data.
      const proposalSheet = store.months[u.month] || store.months[month] || [];
      const proposalRow = proposalSheet[parseInt(u.rowIdx, 10) - 2] || {};
      _isGroups[gk].items.push({ originalPrice: u.price, qty: u.qty, itemCode: u.itemCode, itemNameEN: u.itemNameEN,
        isSubset: proposalRow.isSubset || "", chooseMin: proposalRow.chooseMin || "", chooseMax: proposalRow.chooseMax || "" });
    });
    Object.keys(_isGroups).forEach(gk => {
      const grp = _isGroups[gk];
      // header info จาก month rows (source of truth — มี cate/saleMode/stores ครบ)
      let hdr = null;
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (!hdr && m===grp.month && String(r.campaign) === grp.campaign && String(r.shortName) === grp.shortName) hdr = r;
      }));
      hdr = hdr || {};
      const info = {
        campaign: grp.campaign, shortName: grp.shortName, kitchenName: hdr.kitchen,
        postCate: hdr.cate || hdr.cateRemark || "Promotion set", saleMode: hdr.saleMode,
        storeSelection: hdr.stores, start: hdr.start, end: hdr.end,
        codePromotion: grp.promoCode || "", netPrice: grp.netPrice || "",
      };
      const tg = grp.items.reduce((a, it) => a + (parseFloat(it.originalPrice) || 0) * (parseInt(it.qty) || 1), 0);
      itemsetToProducts(info, grp.code, tg, grp.items, grp.reused);
    });
    /* \u2b50 \u0e17\u0e38\u0e01\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e2d\u0e37\u0e48\u0e19 (Coupon · Bill Discount · Voucher · Price Promotion) \u2192 \u0e40\u0e02\u0e35\u0e22\u0e19\u0e25\u0e07\u0e15\u0e32\u0e23\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e25\u0e31\u0e01\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e40\u0e21\u0e37\u0e48\u0e2d IT \u0e01\u0e14\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e17\u0e38\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07
       (\u0e40\u0e14\u0e34\u0e21\u0e40\u0e02\u0e35\u0e22\u0e19\u0e40\u0e09\u0e1e\u0e32\u0e30 Item Set \u2192 \u0e07\u0e32\u0e19\u0e2d\u0e37\u0e48\u0e19\u0e44\u0e21\u0e48\u0e21\u0e35\u0e15\u0e31\u0e27\u0e15\u0e19\u0e43\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e25\u0e31\u0e01 \u0e15\u0e2d\u0e19\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e31\u0e27\u0e22\u0e48\u0e2d\u0e08\u0e36\u0e07\u0e2b\u0e32\u0e44\u0e21\u0e48\u0e40\u0e08\u0e2d) */
    let _promoProducts = 0;
    const _seenPromoKey = {};
    updates.forEach(u => {
      const pt = String(u.promoType || "");
      const isIS = pt.toUpperCase().indexOf("ITEM SET") >= 0 || /^107/.test(String(u.itemPromo || "").trim());
      if (isIS) return;
      const code = String(u.itemPromo || u.promoCode || "").trim();
      if (!code) return;
      const gk = code + "|" + (u.campaign || "") + "|" + (u.shortName || "");
      if (_seenPromoKey[gk]) return;
      _seenPromoKey[gk] = 1;
      let hdr = null;
      Object.keys(store.months).forEach(m => (store.months[m] || []).forEach(r => {
        if (!hdr && String(r.campaign) === String(u.campaign) && String(r.shortName) === String(u.shortName)) hdr = r;
      }));
      hdr = hdr || {};
      _promoProducts += promoToProducts({
        campaign: u.campaign, shortName: u.shortName || hdr.shortName, kitchenName: u.kitchenName || hdr.kitchen,
        postCate: u.cateRemark || hdr.cate || hdr.cateRemark || "", saleMode: hdr.saleMode, storeSelection: hdr.stores,
        start: hdr.start, end: hdr.end, gross: u.netPrice || u.price || hdr.gross || "",
      }, code, pt || hdr.typePromotion || hdr.promoType || "Promotion");
    });
    if (!persist()) return "STORAGE_ERROR";
    // ✅ ยืนยันเลข Code Item Set (107) ในตัวนับกลาง — เลขที่ IT ปิดงานแล้วถูกล็อกถาวร (ไม่แจกซ้ำ) · ปลอดภัยกับเลขที่พิมพ์เอง (ไม่เคย reserve → confirm no-op)
    try {
      if (window.PC_COUNTER && PC_COUNTER.confirm) {
        Object.keys(_isGroups).forEach(gk => {
          const code = String(_isGroups[gk].code || "").trim();
          // ล็อกเลข Code Item Set ตามหมวดที่จองมา: 107 = counter itemset · 105/106/109 = counter item (per-cate)
          if (/^107\d+$/.test(code)) { try { PC_COUNTER.confirm(code, "itemset", { campaign: _isGroups[gk].campaign }); } catch (e) {} }
          else if (/^(105|106|109)\d+$/.test(code)) { try { PC_COUNTER.confirm(code, "item", { campaign: _isGroups[gk].campaign }); } catch (e) {} }
        });
      }
    } catch (e) {}
    try {
      if (window.PC_notify) {
        const cs = [...campsInBatch].filter(Boolean);
        window.PC_notify("it_settlement_done", { text: 'IT ตั้งค่า POS / ขึ้นปุ่มเสร็จ: ' + cs.join(', ') + ' — พร้อมใช้งานที่สาขา' });
        if (Object.keys(_isGroups).length) window.PC_notify("itemset_done", { text: 'Item Set ขึ้นปุ่มเสร็จ ' + Object.keys(_isGroups).length + ' ปุ่ม (' + cs.join(', ') + ') — ยืนยัน Code Item Set แล้ว' });
      }
    } catch (e) {}
    return "SUCCESS";
  };


 const status=run(month,updates);
 return {status,store,values,confirmations,notifications};
}
return {applySettlement};
});

