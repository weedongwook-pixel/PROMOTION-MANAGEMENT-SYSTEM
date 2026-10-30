/* NPD-only Excel preview UI. File contents stay in this page's memory. */
(function () {
  'use strict';
  var workbook = null, plan = null, fileName = '', ticket = 0, applying = false, library = null;
  function node(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s-]/g,''); }
  function status(message, failed) { var el = node('npExcelStatus'); if (el) { el.textContent = message; el.className = 'small mt-2 ' + (failed ? 'text-danger' : ''); } }
  function ensureLibrary() {
    if (window.XLSX && window.XLSX.version === '0.20.3') return Promise.resolve(window.XLSX);
    if (library) return library;
    library = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), timer = setTimeout(function () { finish(Error('โหลดตัวอ่าน Excel ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วเลือกไฟล์อีกครั้ง')); }, 15000);
      function finish(error) { clearTimeout(timer); script.onload = script.onerror = null; if (error) { script.remove(); library = null; reject(error); } else resolve(window.XLSX); }
      script.src = 'vendor/sheetjs/xlsx.full.min.js';
      script.onload = function () { finish(window.XLSX && window.XLSX.version === '0.20.3' ? null : Error('ตัวอ่าน Excel ไม่พร้อม กรุณาโหลดหน้าใหม่')); };
      script.onerror = function () { finish(Error('โหลดตัวอ่าน Excel ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่')); };
      document.body.appendChild(script);
    });
    return library;
  }
  async function read(input) {
    if (applying) return;
    var file = input.files && input.files[0], mine = ++ticket;
    workbook = null; plan = null;
    node('npExcelPreview').hidden = true;
    var picker = node('npExcelSheet'); picker.disabled = true; picker.innerHTML = '<option value="">เลือกไฟล์ก่อน</option>';
    if (!file) { status(''); return; }
    if (!/\.xlsx$/i.test(file.name) || file.size > 15 * 1024 * 1024) { status('กรุณาเลือกไฟล์ .xlsx ขนาดไม่เกิน 15 MB', true); return; }
    status('กำลังอ่านไฟล์… ยังไม่มีการจองรหัสหรือส่งงาน');
    try {
      var X = await ensureLibrary(), buffer = await file.arrayBuffer();
      if (mine !== ticket || !input.isConnected) return;
      workbook = X.read(buffer, { type: 'array', cellHTML: false, cellFormula: false, bookVBA: false }); fileName = file.name;
      var sheets = PC_NpdExcel.listSheets(workbook, X);
      if (!sheets.length) throw Error('ไม่พบชีต Approval Form สินค้า NPD ในไฟล์นี้ กรุณาตรวจรูปแบบหัวตาราง');
      picker.innerHTML = sheets.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      picker.disabled = false; preview();
    } catch (e) { workbook = null; status('อ่านไฟล์ไม่ได้: ' + e.message, true); }
  }
  function rulesHTML(rules) {
    return (rules || []).map(function (r) { return '<div class="mb-1"><b>' + esc(r.type) + ':</b> ' + r.values.map(function (v) { return esc(v.label) + ' = ' + (v.selected ? 'Yes' : 'No'); }).join(' · ') + '</div>'; }).join('');
  }
  // Refresh only the category control: rebuilding the preview would discard
  // the project name and the user's channel mappings.
  function refreshCategories(preferredCode) {
    var picker = node('npExcelCategory');
    if (!picker || !window.RD) return;
    var categories = RD.getExcelImportOptions().categories;
    var selected = preferredCode || picker.value;
    picker.innerHTML = '<option value="">— เลือกหมวดจริง —</option>' + categories.map(function (c) {
      return '<option value="' + esc(c.code) + '">' + esc(c.code + ' · ' + c.name) + '</option>';
    }).join('');
    picker.value = categories.some(function (c) { return c.code === selected; }) ? selected : '';
  }
  function preview() {
    if (!workbook || applying) return;
    try {
      plan = PC_NpdExcel.parse(workbook, node('npExcelSheet').value, window.XLSX);
      var options = RD.getExcelImportOptions(), sourceChannels = [], categories = [];
      plan.products.forEach(function (p) { if (categories.indexOf(p.category) < 0) categories.push(p.category); p.saleModes.forEach(function (ch) { if (sourceChannels.indexOf(ch) < 0) sourceChannels.push(ch); }); });
      var category = categories.length === 1 ? options.categories.find(function (c) { return norm(c.name) === norm(categories[0]); }) : null;
      // Categories named in the file that the system does not have yet. Never silently fall back
      // to another category for them: the user must add the category or pick one explicitly.
      var missingCats = categories.filter(function (n) { return n && !options.categories.some(function (c) { return norm(c.name) === norm(n); }); });
      if (!category && !missingCats.length) category = options.categories.find(function (c) { return c.code === options.selectedCategoryCode; });
      var errors = plan.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('');
      var warnings = plan.warnings.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('');
      var html = '<hr class="my-3"><p class="small mb-2">ช่วงวันที่ <b>' + esc(plan.start) + ' – ' + esc(plan.end) + '</b> · สินค้า <b>' + plan.products.length + '</b> รายการ · Subset ใหม่ <b>' + plan.subsets.length + '</b> กลุ่ม</p>';
      if (errors) html += '<div class="alert alert-danger" role="alert"><b>ต้องแก้ข้อมูลใน Excel ก่อนนำเข้า</b><ul class="mb-0 mt-1">' + errors + '</ul></div>';
      if (warnings) html += '<details open><summary>รายการที่ต้องตรวจและแก้ในฟอร์ม</summary><ul class="small mb-3">' + warnings + '</ul></details>';
      if (missingCats.length) html += '<div id="npExcelMissingCat" class="alert alert-warning" role="alert"><b>หมวดในไฟล์ยังไม่มีในระบบ</b><p class="mb-2 small">สินค้าทุกรายการในชีตนี้จะใช้หมวดเดียวกัน 1 หมวด — กดเพิ่มหมวดใหม่ด้านล่าง หรือเลือกหมวดที่มีอยู่แล้วในช่อง "หมวดที่จะใช้ในระบบ" หากเป็นหมวดเดียวกันแต่สะกดต่างกัน</p>' +
        missingCats.map(function (n) { return '<button type="button" class="btn btn-sm btn-outline-dark me-2 mb-1" data-new-cat="' + esc(n) + '" onclick="PC_NpdExcelUI.addMissingCategory(this.dataset.newCat)"><i class="fas fa-plus me-1"></i>เพิ่มหมวด “' + esc(n) + '”</button>'; }).join('') + '</div>';
      html += '<div class="row g-3 mb-3"><div class="col-md-7"><label for="npExcelProject" class="form-label">ชื่อ Project</label><input id="npExcelProject" class="form-control" value="' + esc(fileName.replace(/\.xlsx$/i,'') + ' · ' + plan.sheet) + '"></div>' +
        '<div class="col-md-5"><label for="npExcelCategory" class="form-label">หมวดที่จะใช้ในระบบ</label><select id="npExcelCategory" class="form-select"><option value="">— เลือกหมวดจริง —</option>' + options.categories.map(function (c) { return '<option value="' + esc(c.code) + '"' + (category && c.code === category.code ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>'; }).join('') + '</select><div class="form-text">หมวดในไฟล์: ' + esc(categories.join(' / ')) + '<br>หากยังไม่มีหมวด ให้เลือก Department และกดเพิ่มหมวดในฟอร์มด้านล่าง ระบบจะเลือกหมวดใหม่ที่นี่ให้</div></div></div>';
      html += '<div class="row g-3 mb-3">' + sourceChannels.map(function (ch, i) {
        var match = options.channels.find(function (c) { return norm(c) === norm(ch); });
        return '<div class="col-sm-6 col-lg-4"><label for="npExcelCh' + i + '" class="form-label">ช่องทาง Excel: ' + esc(ch) + '</label><select id="npExcelCh' + i + '" data-excel-channel="' + esc(ch) + '" class="form-select"><option value="">— เลือกช่องทางในระบบ —</option>' + options.channels.map(function (c) { return '<option value="' + esc(c) + '"' + (c === match ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '<option value="__skip__">ไม่นำเข้าช่องทางนี้</option></select></div>';
      }).join('') + '</div>';
      html += '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>ชื่อ EN ที่จะเติม</th><th>ชื่อ TH</th><th>ราคาตามช่องทาง</th><th>สูตร RM / Subset</th></tr></thead><tbody>' + plan.products.map(function (p) {
        return '<tr><td>' + esc(p.name) + '<div class="form-text">ต้นฉบับ: ' + esc(p.sourceName) + '</div></td><td>' + esc(p.th) + '</td><td>' + Object.keys(p.prices).map(function (ch) { return esc(ch) + ': ' + esc(p.prices[ch]); }).join('<br>') + '</td><td>' + p.recipes.length + ' แถว RM<br>' + p.formulas.map(function (f) { return esc(f.ssCode || 'แจก SS ใหม่') + ' · ' + esc(f.ssName) + ' × ' + f.chooseMax; }).join('<br>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      html += '<details><summary>ตรวจ Recipe RM แยกช่องทาง</summary>' + plan.products.map(function (p) {
        return '<b class="small">' + esc(p.sourceName) + '</b><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Code RM</th><th>รายละเอียด</th><th>จำนวน</th><th>หน่วย</th><th>ช่องทาง</th></tr></thead><tbody>' + p.recipes.map(function (r) { return '<tr><td>' + esc(r.code) + '</td><td>' + esc(r.desc) + '</td><td>' + esc(r.qty) + '</td><td>' + esc(r.unit) + '</td><td>' + esc(r.channels.join(', ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }).join('') + '</details>';
      if (plan.subsets.length) html += '<details><summary>ตรวจผงใน Subset ใหม่ (' + plan.subsets.reduce(function (n,s) { return n + s.powders.length; },0) + ' ตัวเลือก)</summary>' + plan.subsets.map(function (s) { return '<p class="small"><b>' + esc(s.name) + '</b><br>' + s.powders.map(function (w) { return esc(w.eng) + ' · RM ' + esc(w.code) + ' · ' + esc(w.qty + ' ' + w.unit) + ' · ' + esc(w.spoon); }).join('<br>') + '</p>'; }).join('') + '</details>';
      html += '<details><summary>เงื่อนไขสาขาจาก Excel — ต้องเลือกในฟอร์มอีกครั้ง</summary><div class="small">' + rulesHTML(plan.storeRules) + '</div></details>';
      html += '<div class="d-flex flex-wrap align-items-center gap-3 mt-3"><button id="npExcelApply" type="button" class="btn btn-success fw-bold" onclick="PC_NpdExcelUI.apply()"' + (errors ? ' disabled' : '') + '>เติมข้อมูลลงฟอร์ม NPD</button><span class="small">ขั้นตอนนี้จองรหัส แต่ยังไม่ส่งให้ IT</span></div>';
      var panel = node('npExcelPreview'); panel.innerHTML = html; panel.hidden = false;
      status(plan.errors.length ? 'พบข้อผิดพลาด ' + plan.errors.length + ' รายการ กรุณาแก้ไฟล์แล้วเลือกใหม่' : 'อ่านไฟล์แล้ว กรุณาตรวจตัวอย่างและเลือกหมวด / ช่องทางก่อนเติมฟอร์ม', !!plan.errors.length);
    } catch (e) { plan = null; node('npExcelPreview').hidden = true; status(e.message, true); }
  }
  async function apply() {
    if (!plan || applying || plan.errors.length) return;
    var mine = ticket, fileInput = node('npExcelFile'), selectedPlan = plan, options = RD.getExcelImportOptions();
    var category = options.categories.find(function (c) { return c.code === node('npExcelCategory').value; }), map = {}, project = node('npExcelProject').value.trim();
    document.querySelectorAll('[data-excel-channel]').forEach(function (el) { map[el.getAttribute('data-excel-channel')] = el.value; });
    if (!category || !project || Object.keys(map).some(function (ch) { return !map[ch]; })) { status('กรุณากรอกชื่อ Project และเลือกหมวด / ช่องทางให้ครบ', true); return; }
    applying = true; node('npExcelApply').disabled = true; node('npExcelFile').disabled = true; node('npExcelSheet').disabled = true;
    try {
      var result = await Swal.fire({ title: 'เติมข้อมูลลงฟอร์ม NPD?', icon: 'question',
        text: 'เพิ่มข้อมูลต่อจากรายการที่กรอกไว้ ไม่แทนที่รายการเดิม ' + 'ระบบจะจองรหัสสินค้า / SS / CMPOS ผ่านเลขกลาง แต่ยังไม่ส่งงานให้ IT',
        showCancelButton: true, confirmButtonText: 'เติมข้อมูลและจองรหัส', cancelButtonText: 'กลับไปตรวจ', confirmButtonColor: '#237840' });
      if (!result.isConfirmed || mine !== ticket || node('npExcelFile') !== fileInput) return;
      if (window.PC_CLOUD && PC_CLOUD.enabled && PC_CLOUD.enabled()) {
        status('กำลังตรวจเลขกลางล่าสุด…');
        await PC_CLOUD.syncNow(); await PC_CLOUD.pull(false);
        if (PC_API.reloadFromStorage) PC_API.reloadFromStorage();
      }
      if (PC_COUNTER.reloadFromStorage) PC_COUNTER.reloadFromStorage();
      if (node('npExcelFile') !== fileInput) return;
      var summary = RD.importExcelPlan(selectedPlan, { category: category, channelMap: map, project: project, fileName: fileName, append:!!window.PC_NpdWorkflow });
      if(!window.PC_NpdWorkflow) RD.clearDraft();
      node('npExcelPreview').hidden = true;
      status('เติมฟอร์มแล้ว: ' + summary.products + ' สินค้า / ' + summary.subsets + ' Subset ใหม่ — ยังไม่ได้ส่งงาน');
      await Swal.fire({ icon: 'success', title: 'เติมข้อมูลในฟอร์มแล้ว', text: window.PC_NpdWorkflow ? 'ตรวจสินค้า Recipe และ SUBSET ของแต่ละรายการ แก้ชื่อ EN/TH ให้ไม่เกิน 20 ตัวอักษร และยืนยันสาขาของกลุ่มที่นำเข้า' : 'ตรวจชื่อ EN/TH ตัวย่อ Subset และเลือกสาขาให้ครบ จากนั้นกดส่งให้ IT เพื่อบันทึกงานจริง', confirmButtonText: 'ดูรายการสินค้า', confirmButtonColor: '#237840' });
      if(window.PC_NpdWorkflow){PC_NpdWorkflow.go(3);node('productList').scrollIntoView({block:'start'});} else if (node('npProject')) node('npProject').focus();
    } catch (e) { status('เติมฟอร์มไม่ได้: ' + e.message, true); }
    finally { applying = false; if (node('npExcelApply')) node('npExcelApply').disabled = false; if (node('npExcelFile')) node('npExcelFile').disabled = false; if (node('npExcelSheet')) node('npExcelSheet').disabled = !workbook; }
  }
  function renderReview() {
    var el = node('npExcelReview'); if (!el || !window.RD) return;
    var source = RD.getExcelImportReview(); el.hidden = !source; if (!source) { el.innerHTML = ''; return; }
    el.innerHTML = '<hr><p class="small mb-2"><b>ข้อมูลจาก Excel:</b> ' + esc(source.file || '') + ' · ' + esc(source.sheet) + '<br>ข้อมูลอยู่ในฟอร์มแล้ว ยังไม่ใช่งานที่ส่งให้ IT</p>' +
      '<details><summary>อ้างอิงเงื่อนไขสาขาในไฟล์</summary><div class="small">' + rulesHTML(source.storeRules) + '</div></details>' +
      '<label class="d-flex align-items-start gap-2"><input type="checkbox" class="form-check-input mt-1" onchange="RD.reviewImportStores(this.checked)"' + (source.storesReviewed ? ' checked' : '') + '><span>ได้ตรวจเงื่อนไข Excel และเลือกสาขาที่ร่วมรายการในฟอร์มถูกต้องแล้ว</span></label>';
  }
  var ssWorkbook = null, ssPlan = null, ssFileName = '', ssTicket = 0;
  function ssStatus(message, failed) { var el = node('npSubsetExcelStatus'); if (el) { el.textContent = message; el.className = 'small mt-2 ' + (failed ? 'text-danger' : ''); } }
  async function readSubset(input) {
    if (applying) return;
    var file = input.files && input.files[0], mine = ++ssTicket;
    ssWorkbook = null; ssPlan = null; node('npSubsetExcelPreview').hidden = true;
    var picker = node('npSubsetExcelSheet'); picker.disabled = true; picker.innerHTML = '<option value="">เลือกไฟล์ก่อน</option>';
    if (!file) { ssStatus(''); return; }
    if (!/\.xlsx$/i.test(file.name) || file.size > 15 * 1024 * 1024) { ssStatus('กรุณาเลือกไฟล์ .xlsx ขนาดไม่เกิน 15 MB',true); return; }
    ssStatus('กำลังอ่านชีต Subset… ยังไม่มีการจองรหัส');
    try {
      var X = await ensureLibrary(), buffer = await file.arrayBuffer();
      if (mine !== ssTicket || !input.isConnected) return;
      ssWorkbook = X.read(buffer,{type:'array',cellHTML:false,cellFormula:false,bookVBA:false}); ssFileName = file.name;
      var sheets = PC_NpdExcel.listSubsetSheets(ssWorkbook,X);
      if (!sheets.length) throw Error('ไม่พบชีตตาราง Subset / CMPOS ในไฟล์นี้');
      picker.innerHTML = sheets.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
      if (sheets.some(function (s) { return norm(s) === 'ss'; })) picker.value = sheets.find(function (s) { return norm(s) === 'ss'; });
      picker.disabled = false; previewSubset();
    } catch (e) { ssWorkbook = null; ssStatus('อ่านไฟล์ไม่ได้: ' + e.message,true); }
  }
  function previewSubset() {
    if (!ssWorkbook || applying) return;
    try {
      ssPlan = PC_NpdExcel.parseSubsets(ssWorkbook,node('npSubsetExcelSheet').value,window.XLSX);
      var html = '<hr><p class="small"><b>' + ssPlan.subsets.length + ' กลุ่ม / ' + ssPlan.subsets.reduce(function (n,s) { return n + s.powders.length; },0) + ' ตัวเลือกผง</b> — จะเพิ่มต่อท้ายในฟอร์ม ไม่แก้รายการสินค้า</p>';
      if (ssPlan.errors.length) html += '<div class="alert alert-danger" role="alert"><b>กรุณาแก้ข้อมูลก่อนนำเข้า</b><ul class="mb-0">' + ssPlan.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul></div>';
      if (ssPlan.warnings.length) html += '<ul class="small">' + ssPlan.warnings.map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') + '</ul>';
      html += ssPlan.subsets.map(function (s) { return '<details class="mb-3" open><summary class="fw-bold">' + esc(s.name) + ' (' + s.powders.length + ' ผง)</summary><div class="table-responsive"><table class="table table-sm small"><thead><tr><th>ชื่อผง EN</th><th>RM</th><th>รายละเอียด</th><th>จำนวน</th><th>หน่วย</th><th>ขนาดช้อน</th><th>ราคาเพิ่ม</th></tr></thead><tbody>' + s.powders.map(function (w) { return '<tr><td>' + esc(w.eng) + '</td><td>' + esc(w.code) + '</td><td>' + esc(w.desc) + '</td><td>' + esc(w.qty) + '</td><td>' + esc(w.unit) + '</td><td>' + esc(w.spoon) + '</td><td>' + esc(w.addon === '' ? '—' : w.addon) + '</td></tr>'; }).join('') + '</tbody></table></div></details>'; }).join('');
      html += '<button id="npSubsetExcelApply" type="button" class="btn btn-success fw-bold" onclick="PC_NpdExcelUI.applySubset()"' + (ssPlan.errors.length ? ' disabled' : '') + '>เพิ่ม Subset ลงฟอร์มและจองรหัส</button>';
      var preview = node('npSubsetExcelPreview'); preview.innerHTML = html; preview.hidden = false;
      ssStatus(ssPlan.errors.length ? 'พบข้อมูลที่ต้องแก้ก่อนนำเข้า' : 'อ่านชีตแล้ว กรุณาตรวจรายการผงก่อนเพิ่มลงฟอร์ม',!!ssPlan.errors.length);
    } catch (e) { ssPlan = null; node('npSubsetExcelPreview').hidden = true; ssStatus(e.message,true); }
  }
  async function applySubset() {
    if (!ssPlan || ssPlan.errors.length || applying) return;
    var fileInput = node('npSubsetExcelFile'), selectedPlan = ssPlan, mine = ssTicket;
    applying = true; node('npSubsetExcelApply').disabled = true; fileInput.disabled = true; node('npSubsetExcelSheet').disabled = true;
    try {
      var result = await Swal.fire({title:'เพิ่ม Subset ลงฟอร์ม?',text:'จอง SS / CMPOS สำหรับกลุ่มใหม่ โดยเก็บสินค้าและ Subset เดิมไว้ทั้งหมด ยังไม่ส่งงานให้ IT',icon:'question',showCancelButton:true,confirmButtonText:'เพิ่มกลุ่มและจองรหัส',cancelButtonText:'กลับไปตรวจ',confirmButtonColor:'#237840'});
      if (!result.isConfirmed || mine !== ssTicket || node('npSubsetExcelFile') !== fileInput) return;
      if (window.PC_CLOUD && PC_CLOUD.enabled && PC_CLOUD.enabled()) {
        ssStatus('กำลังตรวจเลขกลางล่าสุด…'); await PC_CLOUD.syncNow(); await PC_CLOUD.pull(false);
        if (PC_API.reloadFromStorage) PC_API.reloadFromStorage();
      }
      if (PC_COUNTER.reloadFromStorage) PC_COUNTER.reloadFromStorage();
      if (node('npSubsetExcelFile') !== fileInput) return;
      var summary = RD.importExcelSubsetPlan(selectedPlan,{fileName:ssFileName,mergeExisting:!!window.PC_NpdWorkflow});
      node('npSubsetExcelPreview').hidden = true;
      ssStatus('เพิ่มในฟอร์มแล้ว ' + summary.subsets + ' กลุ่ม / ' + summary.powders + ' ผง — ยังไม่ได้ส่งงาน');
      await Swal.fire({icon:'success',title:'เพิ่ม Subset ในฟอร์มแล้ว',text:'ตรวจชื่อผง TH และกรอก Subset Name 2 จากนั้นบันทึกกลุ่มเพื่อเลือกผูกกับสินค้า',confirmButtonText:'ตรวจ Subset',confirmButtonColor:'#237840'});
      if (node('subsetSection')) node('subsetSection').scrollIntoView({block:'start'});
    } catch (e) { ssStatus('เพิ่ม Subset ไม่ได้: ' + e.message,true); }
    finally { applying = false; if (node('npSubsetExcelApply')) node('npSubsetExcelApply').disabled = false; if (node('npSubsetExcelFile')) node('npSubsetExcelFile').disabled = false; if (node('npSubsetExcelSheet')) node('npSubsetExcelSheet').disabled = !ssWorkbook; }
  }
  // Add a category named in the file, then refresh the preview so the new category is selected.
  function addMissingCategory(name) {
    var result = RD.addCategory(name);
    if (!result || !result.then) return;
    result.then(function (added) {
      if (!added) return;
      // Keep what the user already chose in the preview: project name and channel mapping.
      var project = node('npExcelProject') ? node('npExcelProject').value : '', channels = {};
      document.querySelectorAll('[data-excel-channel]').forEach(function (el) { channels[el.dataset.excelChannel] = el.value; });
      preview();
      if (project && node('npExcelProject')) node('npExcelProject').value = project;
      document.querySelectorAll('[data-excel-channel]').forEach(function (el) { if (channels[el.dataset.excelChannel] != null) el.value = channels[el.dataset.excelChannel]; });
      if (node('npExcelCategory')) node('npExcelCategory').value = added.code;
      status('เพิ่มหมวด ' + added.name + ' (' + added.code + ') แล้ว และเลือกให้ใช้กับการนำเข้านี้', false);
    });
  }
  window.PC_NpdExcelUI = { read: read, preview: preview, apply: apply, renderReview: renderReview, refreshCategories: refreshCategories, addMissingCategory: addMissingCategory,
    readSubset: readSubset, previewSubset: previewSubset, applySubset: applySubset };
})();
