/* Approval-form Excel -> NPD draft. Pure parsing: no storage, code reservation,
   formula execution, submission or network side effects. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PC_NpdExcel = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function text(v) { return String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim(); }
  function key(v) { return text(v).replace(/\s+/g, ' ').toLowerCase(); }
  function unit(v) { var t = text(v), k = t.toLowerCase().replace(/[\s.]+/g, ''); return /^(g|gm|gr|gram|grams|กรัม)$/.test(k) ? 'g' : /^(ml|mls|cc|มล|มิลลิลิตร)$/.test(k) ? 'ml' : /^(pc|pcs|piece|pieces|ชิ้น)$/.test(k) ? 'pcs' : /^(kg|kgs|กก|กิโลกรัม)$/.test(k) ? 'kg' : t; }
  function spoonKey(v) { return key(v).replace(/spoons?/g,'ช้อน').replace(/\s+/g,'').replace(/(\d)ช้อน$/, '$1'); }
  function rows(wb, sheet, X) {
    var ws = wb.Sheets[sheet];
    if (!ws || !ws['!ref']) throw Error('ไม่พบข้อมูลในชีต ' + sheet);
    var range = X.utils.decode_range(ws['!ref']);
    if (range.e.r > 10000 || range.e.c > 100) throw Error('ชีตมีขนาดเกินที่รองรับ (10,000 แถว / 100 คอลัมน์)');
    // Bound the scan and keep row numbers stable, including blank/merged cells.
    return X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
  }
  function productHeader(r) { return key(r[0]) === 'item name' && key(r[1]) === 'item name'; }
  function listSheets(wb, X) {
    return wb.SheetNames.filter(function (name) {
      try { return rows(wb, name, X).some(productHeader); } catch (e) { return false; }
    });
  }
  function issue(plan, kind, code, message) {
    if (!plan[kind].some(function (i) { return i.code === code && i.message === message; })) plan[kind].push({ code: code, message: message });
  }
  function period(value) {
    var m = text(value).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}|\d{4})\s*[-–—]\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}|\d{4})$/);
    if (!m) return null;
    var months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    function date(day, mon, year) {
      var mo = months.indexOf(mon.toLowerCase()) + 1, y = +year + (year.length === 2 ? 2000 : 0);
      var d = new Date(Date.UTC(y, mo - 1, +day));
      if (!mo || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== +day) return '';
      return y + '-' + String(mo).padStart(2, '0') + '-' + String(+day).padStart(2, '0');
    }
    var start = date(m[1],m[2],m[3]), end = date(m[4],m[5],m[6]);
    return start && end && start <= end ? { start: start, end: end } : null;
  }
  function addRule(plan, type, labels, values) {
    var pairs = [];
    labels.forEach(function (label, i) {
      if (!text(label) || i === 0 || /remark/i.test(text(label))) return;
      var v = key(values[i]);
      if (v === 'yes' || v === 'no') pairs.push({ label: text(label), selected: v === 'yes' });
    });
    if (pairs.length && !plan.storeRules.some(function (r) { return r.type === type && JSON.stringify(r.values) === JSON.stringify(pairs); })) plan.storeRules.push({ type: type, values: pairs });
  }
  function isNoFlavor(name) { return /^no\s+flavor(?:\s|$)/i.test(text(name)); }
  function completeStandardFlavors(s, plan) {
    var added = [];
    if (!s.powders.some(function (p) { return /^truffle\s+2(?:\s|$)/i.test(text(p.eng)); })) {
      s.powders.push({ _autoStandard:true, seq: 6, cmpos: '', eng: 'Truffle 2', th: 'Truffle 2', code: '3024', desc: 'ผงปรุงรส Truffle', qty: '', unit: 'g', spoon: '', addon: '' });
      added.push('Truffle 2');
    }
    if (!s.powders.some(function (p) { return isNoFlavor(p.eng); })) {
      s.powders.push({ seq: 99999, cmpos: '', eng: 'No flavor', th: 'No flavor', code: '', desc: '', qty: '', unit: '', spoon: '', addon: '', noFlavor: true });
      added.push('No flavor');
    }
    s.powders.forEach(function (p) { if (isNoFlavor(p.eng)) { p.noFlavor = true; p.seq = 99999; } });
    // Keep source order; the no-powder choice always appears last.
    s.powders = s.powders.filter(function (p) { return !p.noFlavor; }).concat(s.powders.filter(function (p) { return p.noFlavor; }));
    if (plan && added.length) issue(plan, 'warnings', 'STANDARD_FLAVORS', s.name + ': เติม ' + added.join(' และ ') + ' อัตโนมัติ — กรอกตัวย่อและตรวจปริมาณ / ขนาดช้อนก่อนส่ง');
  }
  function subsetCatalog(wb, X, plan) {
    var groups = new Map();
    wb.SheetNames.forEach(function (name) {
      var data;
      try { data = rows(wb, name, X); } catch (e) { return; }
      var active = false, carryCode = '', carryName = '';
      data.forEach(function (r, row) {
        if (key(r[3]) === 'cmpos code' && key(r[5]) === 'item code') { active = true; carryCode = ''; carryName = ''; return; }
        if (!active || !text(r[4]) || !Number.isFinite(Number(r[2])) || !text(r[2])) return;
        if (text(r[1]) && key(r[1]) !== key(carryName)) carryCode = '';
        if (text(r[0])) carryCode = text(r[0]);
        if (text(r[1])) carryName = text(r[1]);
        if (!carryName) return;
        var groupKey = key(carryName), code = /^SS\d+$/i.test(carryCode) ? carryCode.toUpperCase() : '';
        if (!groups.has(groupKey)) groups.set(groupKey, { name: carryName, ssCode: code, powders: [], conflicts: [] });
        var group = groups.get(groupKey);
        if (code && group.ssCode && group.ssCode !== code) group.conflicts.push(name + ':' + (row + 1));
        if (code) group.ssCode = code;
        // The file has no Thai column; the POS button name follows the English flavor name,
        // as for standard flavors and powders added in the form.
        var powder = { seq: Number(r[2]), cmpos: text(r[3]), eng: text(r[4]), th: text(r[4]), code: text(r[5]), desc: text(r[6]), qty: text(r[7]), unit: unit(r[8]), spoon: text(r[9]), addon: '' };
        if (isNoFlavor(powder.eng)) { powder.noFlavor = true; powder.seq = 99999; }
        var surcharge = powder.eng.match(/\+\s*(?:THB|฿)\s*(\d+(?:\.\d+)?)/i);
        if (surcharge) powder.addon = Number(surcharge[1]);
        var previous = group.powders.find(function (p) { return key(p.eng) === key(powder.eng); });
        if (previous) {
          if (previous.code !== powder.code || Number(previous.qty) !== Number(powder.qty) || previous.unit !== powder.unit ||
              (previous.cmpos && powder.cmpos && previous.cmpos !== powder.cmpos) ||
              (previous.desc && powder.desc && key(previous.desc) !== key(powder.desc)) ||
              (previous.spoon && powder.spoon && spoonKey(previous.spoon) !== spoonKey(powder.spoon))) group.conflicts.push(name + ':' + (row + 1));
          if (!previous.cmpos) previous.cmpos = powder.cmpos;
          if (!previous.desc) previous.desc = powder.desc;
          if (!previous.spoon) previous.spoon = powder.spoon;
        } else group.powders.push(powder);
      });
    });
    return groups;
  }
  function parse(wb, sheet, X) {
    var plan = { sheet: sheet, start: '', end: '', products: [], subsets: [], storeRules: [], errors: [], warnings: [] };
    if (listSheets(wb, X).indexOf(sheet) < 0) { issue(plan, 'errors', 'NOT_NPD', 'ชีตนี้ไม่ใช่แบบฟอร์มสินค้าใหม่ NPD'); return plan; }
    var data = rows(wb, sheet, X), groups = subsetCatalog(wb, X, plan), byName = new Map(), selectedSubsets = new Map();
    var channels = [], dates = null, current = null;
    function finish() {
      if (!current) return;
      var prod = byName.get(key(current.sourceName));
      if (!prod) {
        prod = { sourceName: current.sourceName, name: current.name, th: current.th, code: current.code, category: current.category, prices: {}, saleModes: [], recipes: [], formulas: [], _formulas: null };
        byName.set(key(current.sourceName), prod); plan.products.push(prod);
      } else if (prod.code !== current.code || prod.name !== current.name || prod.th !== current.th) {
        issue(plan, 'errors', 'PRODUCT_CONFLICT', current.sourceName + ': ชื่อ รหัส หรือหมวดต่างกันระหว่างช่องทาง กรุณาแก้ Excel ให้ตรงกัน');
      }
      if (key(prod.category) !== key(current.category)) issue(plan, 'warnings', 'CATEGORY_MAPPING', current.sourceName + ': หมวดในไฟล์สะกดต่างกัน (' + prod.category + ' / ' + current.category + ') กรุณาเลือกหมวดจริงก่อนเติมฟอร์ม');
      channels.forEach(function (ch) {
        if (Object.hasOwn(prod.prices, ch) && prod.prices[ch] !== current.price) issue(plan, 'errors', 'PRICE_CONFLICT', prod.sourceName + ': ราคาช่องทาง ' + ch + ' ซ้ำและไม่ตรงกัน');
        prod.prices[ch] = current.price;
        if (prod.saleModes.indexOf(ch) < 0) prod.saleModes.push(ch);
      });
      var formulas = [];
      current.rows.forEach(function (r) {
        if (/^SS/i.test(r.code)) {
          if (!Number.isInteger(Number(r.qty)) || Number(r.qty) < 1) issue(plan, 'errors', 'SUBSET_QUANTITY', current.sourceName + ': จำนวนสูตรผงต้องเป็นจำนวนเต็มมากกว่า 0');
          var group = groups.get(key(r.desc));
          var existing = /^SS\d+$/i.test(r.code);
          if (!existing && (!group || !group.powders.length)) { issue(plan, 'errors', 'SUBSET_MISSING', current.sourceName + ': ไม่พบชุดผงสำหรับ ' + r.desc); return; }
          if (group && group.conflicts.length) issue(plan, 'errors', 'POWDER_CONFLICT', r.desc + ': ข้อมูลผงซ้ำไม่ตรงกันที่ ' + group.conflicts.join(', '));
          var ssCode = existing ? r.code.toUpperCase() : (group.ssCode || '');
          if (!ssCode && !selectedSubsets.has(key(group.name))) { selectedSubsets.set(key(group.name), true); plan.subsets.push(group); }
          formulas.push({ ssCode: ssCode, ssName: r.desc, chooseMin: Number(r.qty), chooseMax: Number(r.qty) });
        } else {
          var old = prod.recipes.find(function (x) { return x.code === r.code && x.desc === r.desc && x.qty === r.qty && x.unit === r.unit; });
          if (!old) { old = Object.assign({}, r, { channels: [] }); prod.recipes.push(old); }
          channels.forEach(function (ch) { if (old.channels.indexOf(ch) < 0) old.channels.push(ch); });
        }
      });
      var signature = JSON.stringify(formulas.slice().sort(function (a,b) { return key(a.ssName).localeCompare(key(b.ssName)); }));
      if (prod._formulas !== null && prod._formulas !== signature) issue(plan, 'errors', 'FORMULA_CHANNEL_MISMATCH', prod.sourceName + ': Subset หรือจำนวนผงต่างกันระหว่างช่องทาง ฟอร์มปัจจุบันยังรองรับสูตรผงชุดเดียวต่อสินค้า');
      prod._formulas = signature; prod.formulas = formulas;
      current = null;
    }
    data.forEach(function (r, index) {
      if (key(r[0]) === 'period') {
        finish(); var next = period(r[1]);
        if (!next) issue(plan, 'errors', 'PERIOD', 'อ่านช่วงวันที่ไม่ได้ที่แถว ' + (index + 1));
        else if (dates && (dates.start !== next.start || dates.end !== next.end)) issue(plan, 'errors', 'PERIOD_CONFLICT', 'ช่วงวันที่ในชีตไม่ตรงกัน');
        else { dates = next; plan.start = next.start; plan.end = next.end; }
      }
      if (key(r[0]) === 'channels') {
        finish(); channels = [];
        r.forEach(function (ch, i) { if (i && key((data[index + 1] || [])[i]) === 'yes') channels.push(text(ch)); });
        if (!channels.length) issue(plan, 'errors', 'CHANNELS', 'ไม่มีช่องทางขายที่เลือก Yes ในแถว ' + (index + 1));
      }
      if (key(r[0]) === 'store type') addRule(plan, 'Store Type', r, data[index + 1] || []);
      if (key(r[1]) === 'coco' && key(r[2]) === 'doco') addRule(plan, 'Ownership', r, data[index + 1] || []);
      if (productHeader(r)) {
        finish(); var item = data[index + 1] || [], rawPrice = item[7];
        if (!text(item[1])) { issue(plan, 'errors', 'ITEM_NAME', 'ชื่อสินค้าไม่ครบที่แถว ' + (index + 2)); return; }
        if (!text(rawPrice) || !Number.isFinite(Number(rawPrice)) || Number(rawPrice) < 0) issue(plan, 'errors', 'PRICE_MISSING', text(item[1]) + ': ราคาขายไม่ถูกต้องหรือว่าง');
        if (!channels.length) issue(plan, 'errors', 'CHANNELS', text(item[1]) + ': ไม่พบช่องทางขาย');
        current = { sourceName: text(item[1]), name: text(item[2]) || text(item[1]), th: text(item[3]), code: text(item[4]), category: text(item[6]), price: Number(rawPrice), rows: [] };
      } else if (current && text(r[1]) && /^\d+$/.test(text(r[1]))) {
        var recipe = { code: text(r[2]), desc: text(r[3]), qty: text(r[4]), unit: unit(r[5]) };
        if (!recipe.code || !recipe.desc || !text(recipe.qty) || !Number.isFinite(Number(recipe.qty)) || Number(recipe.qty) <= 0 || !recipe.unit) issue(plan, 'errors', 'RECIPE', current.sourceName + ': สูตรไม่ครบหรือจำนวนไม่ถูกต้องที่แถว ' + (index + 1));
        current.rows.push(recipe);
      }
    });
    finish();
    if (!dates) issue(plan, 'errors', 'PERIOD', 'ไม่พบช่วงวันที่ในชีต');
    plan.products.forEach(function (p) {
      delete p._formulas;
      if (!p.recipes.length) issue(plan, 'errors', 'RECIPE', p.sourceName + ': ไม่พบ Recipe RM');
      ['name','th'].forEach(function (field) { if (p[field].length > 20) issue(plan, 'warnings', 'NAME_LENGTH', p.sourceName + ': ชื่อ ' + (field === 'name' ? 'EN' : 'TH') + ' ยาว ' + p[field].length + '/20 อักษร ต้องแก้ในฟอร์มก่อนส่ง'); });
    });
    plan.subsets.forEach(function (s) {
      s.powders.forEach(function (p) {
        if (!p.noFlavor && (!p.code || !p.desc || !text(p.qty) || !Number.isFinite(Number(p.qty)) || Number(p.qty) <= 0 || !p.unit)) issue(plan, 'errors', 'POWDER', s.name + ': สูตรผง ' + p.eng + ' ไม่ครบ');
        if (p.eng.length > 20) issue(plan, 'warnings', 'NAME_LENGTH', s.name + ': ชื่อผง ' + p.eng + ' เกิน 20 อักษร');
      });
    });
    plan.subsets.forEach(function (s) { completeStandardFlavors(s, plan); });
    if (plan.subsets.length) issue(plan, 'warnings', 'SUBSET_NAMES', 'กรอกตัวย่อ Subset Name 2 และตรวจชื่อผง TH ในฟอร์มก่อนส่ง');
    return plan;
  }
  function buildDraftSubsets(plan, reserve, prefix, existing) {
    return plan.subsets.map(function (s, i) {
        var old = existing.find(function (x) { return key(x.name) === key(s.name); });
        var sub = old ? JSON.parse(JSON.stringify(old)) : { id: prefix + '_s' + i, ssCode: reserve('ss'), name: s.name, name2: '', cat: '', registered: false, powders: [] };
        var source = Object.assign({}, s, {powders:s.powders.map(function (p) { return Object.assign({},p); })});
        completeStandardFlavors(source);
        function powderKey(p) {
          if (isNoFlavor(p.eng)) return 'no flavor';
          if (/^truffle\s+2(?:\s|$)/i.test(text(p.eng))) return 'truffle 2';
          var n=key(p.eng), suffix=key(sub.name2);
          return suffix && n.endsWith(' '+suffix) ? n.slice(0,-suffix.length-1) : n;
        }
        source.powders.forEach(function (p,j) {
          var prior=sub.powders.find(function (x) { return powderKey(x)===powderKey(p); });
          if (prior) {
            if(prior._autoStandard && p.qty){var keepId=prior.id,keepCode=prior.cmpos;Object.assign(prior,p,{id:keepId,cmpos:keepCode,_autoStandard:false});}
            if (!p.noFlavor && p.qty && prior.qty && (text(prior.code)!==text(p.code) || Number(prior.qty)!==Number(p.qty) || unit(prior.unit)!==unit(p.unit))) throw Error('สูตรผง '+p.eng+' ใน Subset '+s.name+' ต่างจากข้อมูลที่กรอกไว้ กรุณาตรวจสูตรก่อนนำเข้า');
          } else sub.powders.push(Object.assign({},p,{id:prefix+'_w'+i+'_'+j,cmpos:reserve('item','103')}));
        });
        return sub;
      });
  }
  function createDraft(plan, options) {
    var o = options || {}, category = o.category || {}, map = o.channelMap || {}, master = o.subsetMaster || [];
    if (!plan || plan.errors.length || !plan.products.length) throw Error('ข้อมูล Excel ยังมีข้อผิดพลาด กรุณาตรวจตัวอย่างก่อน');
    if (!category.name || !/^\d{3}$/.test(text(category.code))) throw Error('กรุณาเลือกหมวดสินค้าในระบบก่อน');
    var targets = new Map();
    plan.products.forEach(function (p) {
      if (p.code) throw Error('ไฟล์มีรหัสสินค้า ' + p.code + ' แล้ว: Import นี้ใช้สร้างสินค้าใหม่ กรุณาล้างรหัสในไฟล์เพื่อให้ระบบแจกเลข ไม่แก้ทับสินค้าที่มีอยู่');
      p.saleModes.forEach(function (source) {
        var ch = map[source];
        if (!ch) throw Error('กรุณาจับคู่ช่องทาง ' + source + ' หรือเลือกไม่นำเข้า');
        if (ch !== '__skip__') {
          if (targets.has(ch) && targets.get(ch) !== source) throw Error('ห้ามจับคู่หลายช่องทางเป็นช่องทางเดียวกัน: ' + ch);
          targets.set(ch, source);
        }
      });
      if (!p.saleModes.some(function (ch) { return map[ch] !== '__skip__'; })) throw Error('ต้องเลือกช่องทางขายอย่างน้อยหนึ่งช่องทางต่อสินค้า');
      p.formulas.forEach(function (f) {
        if (f.ssCode && !master.some(function (s) { return s.ssCode === f.ssCode && !/inactive/i.test(s.status || ''); })) throw Error('ไม่พบ Subset ' + f.ssCode + ' ที่เปิดใช้งานในระบบ');
      });
    });
    plan.subsets.forEach(function (s) {
      if (master.some(function (m) { return key(m.name || m.nameEN) === key(s.name); })) throw Error('ชื่อ Subset ' + s.name + ' มีในระบบแล้ว กรุณาระบุ SS จริงใน Excel แทน SSxxxx');
      if (s.powders.some(function (p) { return p.cmpos; })) throw Error('Subset ใหม่มีรหัส CMPOS ในไฟล์แล้ว กรุณาล้างรหัสเพื่อให้ระบบแจกเลขและไม่เขียนทับข้อมูลเดิม');
    });
    var existing = o.existingSubsets || [];
    var allocated = [], prefix = 'excel_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), bySubset = new Map();
    function reserve(type, cat) {
      var code = o.reserve(type, cat);
      if (!code) throw Error('จองรหัสไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและลองใหม่');
      allocated.push({ type: type, code: code }); return code;
    }
    function mapped(channels) { return channels.map(function (c) { return map[c]; }).filter(function (c) { return c && c !== '__skip__'; }); }
    try {
      var subsets = buildDraftSubsets(plan,reserve,prefix,existing);
      subsets.forEach(function(sub){bySubset.set(key(sub.name),sub);});
      var products = plan.products.map(function (p, i) {
        var prices = {};
        Object.keys(p.prices).forEach(function (ch) { if (map[ch] !== '__skip__') prices[map[ch]] = String(p.prices[ch]); });
        var modes = mapped(p.saleModes), ta = modes.find(function (ch) { return /takeaway|dinein/.test(key(ch).replace(/[\s-]/g,'')); });
        var delivery = modes.find(function (ch) { return ch !== ta; });
        return { id: prefix + '_p' + i, sourceName: p.sourceName, name: p.name, th: p.th, code: reserve('item', category.code), _codeCat: category.code,
          category: category.name, cateCode: category.code, prices: prices, saleModes: modes, splitOpen: true,
          priceTakeaway: ta ? prices[ta] : '', priceDelivery: delivery ? prices[delivery] : '',
          recipes: p.recipes.filter(function (r) { return mapped(r.channels).length; }).map(function (r) { return Object.assign({}, r, { channels: mapped(r.channels) }); }),
          formulas: p.formulas.map(function (f, j) { return { id: prefix + '_f' + i + '_' + j, subId: f.ssCode ? 'db:' + f.ssCode : bySubset.get(key(f.ssName)).id, chooseMin: f.chooseMin, chooseMax: f.chooseMax }; }) };
      });
      return { category: category.name, cateCode: category.code, dept: String(Math.floor(+category.code / 100) * 100), products: products, subsets: subsets,
        start: plan.start, end: plan.end, storeMode: 'SELECT', storeConds: [],
        importSource: { sheet: plan.sheet, storeRules: plan.storeRules, storesReviewed: false } };
    } catch (e) {
      allocated.reverse().forEach(function (a) { try { o.release(a.type, a.code); } catch (_) {} });
      throw e;
    }
  }
  function subsetHeader(r) { return key(r[3]) === 'cmpos code' && key(r[5]) === 'item code'; }
  function listSubsetSheets(wb, X) {
    return wb.SheetNames.filter(function (name) { try { return rows(wb,name,X).some(subsetHeader); } catch (_) { return false; } });
  }
  function parseSubsets(wb, sheet, X) {
    var plan = { sheet: sheet, products: [], subsets: [], errors: [], warnings: [] };
    if (listSubsetSheets(wb,X).indexOf(sheet) < 0) { issue(plan,'errors','NOT_SUBSET','ชีตนี้ไม่ใช่ตาราง Subset / CMPOS'); return plan; }
    var selected = { SheetNames: [sheet], Sheets: {} }; selected.Sheets[sheet] = wb.Sheets[sheet];
    var active = false, groupName = '';
    rows(wb,sheet,X).forEach(function (r, i) {
      if (subsetHeader(r)) { active = true; groupName = ''; return; }
      if (key(r[0]) === 'item name (cmpos)') { active = false; groupName = ''; return; }
      if (!active) return;
      var populated = r.slice(3,10).some(function (v) { return !!text(v); });
      if (!populated && !text(r[2])) return;
      if (!text(r[2]) || !Number.isInteger(Number(r[2])) || Number(r[2]) < 1) { issue(plan,'errors','POWDER_SEQUENCE','ลำดับ NO ของผงไม่ครบหรือไม่ใช่จำนวนเต็มบวกที่แถว ' + (i + 1)); return; }
      if (text(r[1])) groupName = text(r[1]);
      if (!groupName || !text(r[4]) || (!isNoFlavor(r[4]) && (!text(r[5]) || !text(r[6]) || !text(r[7]) || !Number.isFinite(Number(r[7])) || Number(r[7]) <= 0 || !text(r[8])))) issue(plan,'errors','POWDER','ข้อมูลกลุ่ม / ชื่อผง / สูตร RM ไม่ครบที่แถว ' + (i + 1));
    });
    subsetCatalog(selected,X,plan).forEach(function (s) {
      plan.subsets.push(s);
      if (s.ssCode) issue(plan,'errors','EXISTING_SS',s.name + ' มีรหัส ' + s.ssCode + ' แล้ว: ช่องนี้ใช้สร้าง Subset ใหม่ ไม่เพิ่มผงทับกลุ่มเดิม');
      if (s.conflicts.length) issue(plan,'errors','POWDER_CONFLICT',s.name + ': สูตรผงซ้ำไม่ตรงกันที่ ' + s.conflicts.join(', '));
      if (s.powders.some(function (p) { return !!p.cmpos; })) issue(plan,'errors','EXISTING_CMPOS',s.name + ': มีรหัส CMPOS แล้ว กรุณาตรวจว่าต้องการสร้างกลุ่มใหม่จริงก่อนล้างรหัสในไฟล์');
      s.powders.forEach(function (p) { if (p.eng.length > 20) issue(plan,'warnings','NAME_LENGTH','ชื่อผง ' + p.eng + ' เกิน 20 อักษร ต้องแก้ก่อนส่ง'); });
    });
    plan.subsets.forEach(function (s) { completeStandardFlavors(s, plan); });
    if (!plan.subsets.length) issue(plan,'errors','EMPTY_SUBSET','ไม่พบรายการผงในชีต');
    issue(plan,'warnings','SUBSET_NAMES','หลังเติมฟอร์ม กรุณาตรวจชื่อผง TH และกรอก Subset Name 2 ก่อนบันทึกกลุ่ม');
    return plan;
  }
  function createSubsetDraft(plan, options) {
    var o = options || {}, master = (o.subsetMaster || []).concat(o.mergeExisting ? [] : (o.existingSubsets || []));
    if (!plan || plan.errors.length || !plan.subsets.length) throw Error('ข้อมูล Subset ยังมีข้อผิดพลาด กรุณาตรวจตัวอย่างก่อน');
    plan.subsets.forEach(function (s) {
      if (master.some(function (m) { return key(m.name || m.nameEN) === key(s.name); })) throw Error('ชื่อ Subset ' + s.name + ' มีในฟอร์มหรือระบบแล้ว ไม่เพิ่มซ้ำ');
      if (s.ssCode || s.powders.some(function (p) { return p.cmpos; })) throw Error('การสร้าง Subset ใหม่ต้องให้ระบบแจก SS / CMPOS');
    });
    var allocated = [], prefix = 'ss_excel_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    function reserve(type, cat) { var code = o.reserve(type,cat); if (!code) throw Error('จองรหัสไม่สำเร็จ กรุณาลองใหม่'); allocated.push({type:type,code:code}); return code; }
    try {
      return { subsets: buildDraftSubsets(plan,reserve,prefix,o.existingSubsets || []) };
    } catch (e) { allocated.reverse().forEach(function (a) { try { o.release(a.type,a.code); } catch (_) {} }); throw e; }
  }
  function parseFlavorSheet(wb,sheet,X) {
    var plan={sheet:sheet,products:[],subsets:[],errors:[],warnings:[]};
    if(listSubsetSheets(wb,X).indexOf(sheet)<0){issue(plan,'errors','NOT_SUBSET','ไม่พบตารางผงในชีตนี้');return plan;}
    var selected={SheetNames:[sheet],Sheets:{}};selected.Sheets[sheet]=wb.Sheets[sheet];
    subsetCatalog(selected,X,plan).forEach(function(s){
      if(s.conflicts.length)issue(plan,'errors','POWDER_CONFLICT','สูตรซ้ำไม่ตรงกัน: '+s.name);
      s.powders.forEach(function(p){if(!p.noFlavor && (!p.code || !p.desc || !p.unit || !(Number(p.qty)>0)))issue(plan,'errors','POWDER','สูตรไม่ครบ: '+p.eng);});
      plan.subsets.push(s);
    });
    if(!plan.subsets.length)issue(plan,'errors','EMPTY_SUBSET','ไม่พบรายการผง');
    return plan;
  }
  return { completeStandardFlavors:completeStandardFlavors, parseFlavorSheet:parseFlavorSheet, listSheets: listSheets, parse: parse, createDraft: createDraft,
    listSubsetSheets: listSubsetSheets, parseSubsets: parseSubsets, createSubsetDraft: createSubsetDraft };
});
