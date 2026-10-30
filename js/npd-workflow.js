/* One guided workspace; RD remains the owner of form data and reservations. */
(function(window){
  'use strict';
  var titles=['เลือกวิธีการทำงาน','เพิ่มผงรสชาติใหม่','SUBSET','เพิ่มสินค้า','ตรวจและส่ง'], root=null, workbook=null, flavorPlan=null, readTicket=0;
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var el=function(id){return document.getElementById(id);};
  function value(id){return el(id)?el(id).value.trim():'';}
  function fail(e){el('npWorkflowMessage').textContent=e.message||String(e);}
  function act(fn){try{el('npWorkflowMessage').textContent='';var result=fn();refresh();return result;}catch(e){fail(e);}}
  function init(){
    root=document.querySelector('.npd-scope');if(!root || root.dataset.guided)return;root.dataset.guided='true';
    var nav=root.querySelector('nav[aria-label="ขั้นตอนเพิ่มสินค้าใหม่"]');
    nav.id='npWorkflowNav';nav.className='np-workflow-nav';nav.innerHTML='';root.insertBefore(nav,el('tabNew'));
    var guide=document.createElement('details');guide.id='npWorkflowGuide';guide.className='np-guide';
    var guideClosed=false;try{guideClosed=localStorage.getItem('pc_npd_guide_closed')==='1';}catch(_){}
    guide.open=!guideClosed;
    guide.innerHTML='<summary>คู่มือการกรอก — ทำอะไรก่อนหลัง</summary><div class="np-guide-cols">'+
      '<div data-guide="excel"><b>มีไฟล์ Excel — เลือกไฟล์ในแต่ละขั้น</b><ol>'+
        '<li><b>ขั้น 1</b> เลือก “นำเข้าไฟล์ Excel” แล้วกรอกชื่อชุดสินค้า วันที่ และสาขา</li>'+
        '<li><b>ขั้น 2</b> มีผงรสชาติใหม่ เลือกไฟล์และชีตผง (เช่น mala flavor) เพื่อเพิ่มผงเข้า SUBSET เดิม — ไม่มีกด “ไม่มีผงใหม่ ข้ามขั้นนี้”</li>'+
        '<li><b>ขั้น 3</b> เลือกไฟล์และชีต SUBSET (ss) แล้วกรอกตัวย่อ (Subset Name 2) และตรวจปริมาณผง</li>'+
        '<li><b>ขั้น 4</b> เลือกไฟล์และชีตสินค้า (Approval Form) ถ้าหมวดยังไม่มีกด “เพิ่มหมวด” แล้วตรวจชื่อ EN/TH ไม่เกิน 20 ตัวอักษร</li>'+
        '<li><b>ขั้น 5</b> แก้ทุกจุดที่ระบบแจ้ง แล้วกด “ยืนยันส่งให้ IT”</li></ol></div>'+
      '<div data-guide="manual"><b>กรอกเอง</b><ol>'+
        '<li><b>ขั้น 1</b> ชื่อชุดสินค้า วันที่ และสาขา</li>'+
        '<li><b>ขั้น 2</b> มีผงรสชาติใหม่ เพิ่มผง แล้วเพิ่มเข้า SUBSET เดิม — ไม่มีกด “ไม่มีผงใหม่ ข้ามขั้นนี้”</li>'+
        '<li><b>ขั้น 3</b> สร้าง SUBSET ใหม่และใส่รายการผง (สินค้าไม่มีผง ข้ามได้)</li>'+
        '<li><b>ขั้น 4</b> เพิ่มสินค้า เลือก Category (ยังไม่มีให้กด “เพิ่มหมวด”) ช่องทางขาย ราคา และ Recipe — สินค้าที่ใช้ผงเลือก SUBSET ที่สร้างในขั้น 3</li>'+
        '<li><b>ขั้น 5</b> ตรวจและกด “ยืนยันส่งให้ IT”</li></ol></div></div>'+
      '<p class="small mb-0 mt-2">ทุกขั้นเปิดกลับมาตรวจและแก้ไขได้ ยกเว้นรหัสที่ระบบจองให้ (Item Code, SS Code, CMPOS) · กด “บันทึกร่าง” ได้ทุกขั้น ระบบจองรหัสไว้ให้ แต่ยังไม่ส่งงานให้ IT จนกว่าจะกดยืนยันในขั้น 5</p>';
    guide.addEventListener('toggle',function(){try{localStorage.setItem('pc_npd_guide_closed',guide.open?'0':'1');}catch(_){}});
    root.insertBefore(guide,nav);
    var intro=document.createElement('div');intro.id='npWorkflowIntro';intro.className='np-workflow-intro';root.insertBefore(intro,nav.nextSibling);
    // Step 1 starts with an explicit choice so only the relevant inputs are shown.
    var entry=document.createElement('section');entry.id='npEntryChoice';entry.dataset.npdStep='0';entry.className='bg-white border rounded-3 p-3 mb-3';
    entry.innerHTML='<h4 class="h6 fw-bold">เลือกวิธีการทำงาน</h4><p class="small mb-3">เลือกวิธีที่ใช้ ระบบจะแสดงเฉพาะส่วนที่ต้องกรอก เปลี่ยนวิธีภายหลังได้ ข้อมูลที่กรอกไว้ไม่หาย</p><p class="small mb-3"><b>ลำดับงาน:</b> เลือกวิธีการทำงาน → เพิ่มผงรสชาติใหม่ (ไม่มีกดข้าม) → SUBSET → เพิ่มสินค้า (เลือก SUBSET ที่สร้างไว้) → ตรวจและส่ง</p><div class="np-entry-options">'+
      '<button type="button" class="np-entry" data-entry="excel" onclick="PC_NpdWorkflow.entry(\'excel\')"><b>นำเข้าไฟล์ Excel</b><small>มีไฟล์ — เลือกไฟล์ในแต่ละขั้น: ผงรสชาติ, SUBSET และสินค้า</small></button>'+
      '<button type="button" class="np-entry" data-entry="manual" onclick="PC_NpdWorkflow.entry(\'manual\')"><b>กรอกเอง</b><small>ไม่มีไฟล์ — กรอกข้อมูลงานและสินค้าทีละรายการ</small></button></div>';
    root.insertBefore(entry,el('tabNew'));
    // Excel mode: each step has its own file picker — powders (2), SUBSET (3), products (4).
    var productImport=root.querySelector('.np-excel');productImport.dataset.npdStep='3';productImport.dataset.excelOnly='1';
    el('tabNew').insertBefore(productImport,el('npCategoryStep').closest('.bg-white'));
    el('npSubsetExcelFile').closest('.p-3').dataset.excelOnly='1';
    el('npProject').closest('.bg-white').dataset.npdStep='0';
    el('npSubsetStep').closest('.bg-white').dataset.npdStep='2';
    el('npCategoryStep').closest('.bg-white').dataset.npdStep='3';
    el('npCategoryStep').querySelector('span').textContent='หมวดเริ่มต้นสำหรับสินค้าที่เพิ่มใหม่';
    el('npCategoryStep').parentElement.querySelector('.hint').textContent='เลือกหมวดก่อนเพิ่มสินค้า เปลี่ยนหมวดของแต่ละสินค้าได้ในรายการ โดยไม่กระทบสินค้าอื่น';
    el('npProductStep').dataset.npdStep='3';el('npProductStep').textContent='รายการสินค้า';
    el('productList').dataset.npdStep='3';root.querySelector('[onclick="RD.addProduct()"]').dataset.npdStep='3';
    var powder=document.createElement('section');powder.id='npWorkflowPowders';powder.dataset.npdStep='1';powder.className='bg-white border rounded-3 p-3 mb-3';
    powder.innerHTML='<h4 class="h6 fw-bold">งานนี้มีผงรสชาติใหม่หรือไม่?</h4><p>ขั้นนี้มีหรือไม่มีก็ได้ · <b>มีผงใหม่</b> เพิ่มผง แล้วเพิ่มเข้า SUBSET เดิม (SUBSET ใหม่ทำในขั้น 3) · <b>ไม่มีผงใหม่</b> (ใช้ผงเดิม หรือสินค้าไม่มีผง) กดข้ามได้เลย</p><p id="npPowderFromFile" class="small text-success"></p>'+ 
      '<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-outline-success" onclick="PC_NpdWorkflow.choice(\'powderChoice\',\'none\')">ไม่มีผงใหม่ ข้ามขั้นนี้</button></div>'+
      '<div id="npFlavorImport" data-excel-only="1" class="mb-3"><h4 class="h6 fw-bold">นำเข้าผงจากไฟล์ Excel</h4><p class="small">รองรับชีต mala flavor และตารางผง ระบบเชื่อมรายการซ้ำในงานนี้และเก็บสูตรแต่ละขนาดแยกกัน</p>'+ 
      '<label for="npFlavorFile" class="form-label">ไฟล์ Excel</label><input id="npFlavorFile" type="file" accept=".xlsx" class="form-control" onchange="PC_NpdWorkflow.readFlavors(this)">'+
      '<label for="npFlavorSheet" class="form-label mt-2">ชีตผง</label><select id="npFlavorSheet" class="form-select" disabled onchange="PC_NpdWorkflow.previewFlavors()"></select><div id="npFlavorPreview" class="mt-3" aria-live="polite"></div>'+'</div>'+
      '<details open><summary class="fw-bold mb-3">เพิ่มผงใหม่ทีละรายการ / เลือกวัตถุดิบเดิม</summary><div class="row g-3">'+
      field('npWorkName','ชื่อรสชาติ เช่น Mala')+field('npWorkRM','รหัสวัตถุดิบ RM','list="rmList"')+field('npWorkDesc','รายละเอียดวัตถุดิบ')+field('npWorkUnit','หน่วย เช่น g')+
      '</div><button class="btn btn-success mt-3" onclick="PC_NpdWorkflow.addPowder()">เพิ่มผงไว้ใช้ในงานนี้</button><p class="small mt-2">RM เป็นรหัสวัตถุดิบ ส่วน CMPOS จะจองตามสูตรเมื่อผูกเข้า SUBSET</p></details><div id="npWorkLibrary" class="mt-3"></div>';
    el('tabNew').insertBefore(powder,el('npSubsetStep').closest('.bg-white'));
    var links=document.createElement('section');links.id='npAttachSection';links.dataset.npdStep='1';links.className='bg-white border rounded-3 p-3 mb-3';links.innerHTML='<h4 class="h6 fw-bold">เพิ่มผงใหม่เข้า SUBSET เดิม</h4><p class="small">เลือกผงที่เพิ่มไว้ด้านบน แล้วเลือก SUBSET เดิมในระบบ ระบุปริมาณ ขนาดช้อน และลำดับบน POS — ทำซ้ำได้ทีละ SUBSET</p><p id="npAttachEmpty" class="small text-secondary">ยังไม่มีผงใหม่ — เพิ่มผงด้านบนก่อน</p><div id="npAttachForm"><div class="row g-3"><div class="col-md-6"><label for="npLibraryPick" class="form-label">ผงในงานนี้</label><select id="npLibraryPick" class="form-select"></select></div><div class="col-md-6"><label for="npTargetPick" class="form-label">SUBSET ปลายทาง</label><select id="npTargetPick" class="form-select"></select></div>'+field('npLinkQty','ปริมาณผง','type="number" min="0" step="any"')+field('npLinkSpoon','ขนาดช้อน')+field('npLinkSeq','ลำดับผงบน POS (ต้องระบุเมื่อเพิ่มเข้า SUBSET เดิม)','type="number" min="1"')+'</div><button class="btn btn-success mt-3" onclick="PC_NpdWorkflow.attach()">เพิ่มผงเข้า SUBSET ที่เลือก</button></div><div id="npPowderSheet" class="mt-3"></div>';
    el('tabNew').insertBefore(links,el('npSubsetStep').closest('.bg-white'));
    var review=document.createElement('section');review.id='npWorkflowReview';review.dataset.npdStep='4';review.className='bg-white border rounded-3 p-3 mb-3';el('tabNew').appendChild(review);
    var footer=root.querySelector('[onclick="RD.submit(\'new\')"]').parentElement;footer.className='np-workflow-footer';footer.innerHTML='<button id="npStepBack" class="btn btn-outline-dark" onclick="PC_NpdWorkflow.back()">ย้อนกลับ</button><button class="btn btn-outline-success" onclick="RD.saveDraft()">บันทึกร่าง</button><span id="npStepLabel" class="small"></span><button id="npStepNext" class="btn btn-success" onclick="PC_NpdWorkflow.next()">ถัดไป</button><button id="npStepSubmit" class="btn btn-success" onclick="RD.submit(\'new\')">ยืนยันส่งให้ IT</button>';el('tabNew').appendChild(footer);
    var msg=document.createElement('p');msg.id='npWorkflowMessage';msg.className='text-danger';msg.setAttribute('role','alert');el('tabNew').insertBefore(msg,footer);
    root.addEventListener('change',refresh);root.addEventListener('input',function(){clearTimeout(init.timer);init.timer=setTimeout(refresh,250);});
    refresh();
  }
  function field(id,label,attrs){return '<div class="col-md-6"><label for="'+id+'" class="form-label">'+label+'</label><input id="'+id+'" class="form-control" '+(attrs||'')+'></div>';}
  function selectOptions(id,items){var node=el(id);if(!node)return;var old=node.value;node.innerHTML='<option value="">เลือกข้อมูล</option>'+items.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>';}).join('');node.value=old;}
  function refresh(){
    if(!root || !el('npWorkflowMessage'))return;
    var d=RD.workflowSnapshot(),step=d.workflow.step,issues=RD.workflowIssues();
    var mode=d.workflow.entryMode||(d.products.some(function(p){return p.importGroup;})?'excel':(d.project||d.products.some(function(p){return p.name;})?'manual':''));
    root.querySelectorAll('[data-npd-step]').forEach(function(n){n.hidden=Number(n.dataset.npdStep)!==step;});
    if(step===0)el('npProject').closest('.bg-white').hidden=!mode;
    root.querySelectorAll('[data-excel-only]').forEach(function(n){if(Number((n.closest('[data-npd-step]')||{dataset:{}}).dataset.npdStep)===step)n.hidden=mode!=='excel';});
    var filePowders=d.subsets.filter(function(s){return s.importSource||d.products.some(function(p){return p.importGroup&&(p.formulas||[]).some(function(f){return f.subId===s.id;});});}).reduce(function(n,s){return n+s.powders.filter(function(w){return !w.noFlavor;}).length;},0);
    el('npPowderFromFile').textContent=filePowders?'ผงจากไฟล์ที่นำเข้า '+filePowders+' รายการ อยู่ใน SUBSET แล้ว ตรวจและแก้ไขได้ในขั้น 3 — ที่นี่เพิ่มเฉพาะผงใหม่ที่ไม่มีในไฟล์':'';
    root.querySelectorAll('.np-entry').forEach(function(b){var on=b.dataset.entry===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    root.querySelectorAll('#npWorkflowGuide [data-guide]').forEach(function(c){c.hidden=!!mode && c.dataset.guide!==mode;});
    if(!el('npWorkflowNav').children.length) el('npWorkflowNav').innerHTML=titles.map(function(t,i){return '<button type="button" class="np-step" onclick="PC_NpdWorkflow.go('+i+')"><span>'+(i+1)+'. '+t+'</span><small></small></button>';}).join('');
    Array.from(el('npWorkflowNav').children).forEach(function(button,i){
      var pending=issues.filter(function(x){return x.step===i;}).length;
      var status=i===0&&!mode?'เลือกวิธีการทำงาน':i===4?(issues.length?'รอตรวจ '+issues.length+' จุด':'พร้อมส่ง'):pending?'ต้องเติมข้อมูล':(i===1&&!d.workPowders.length?'ไม่บังคับ / ข้ามได้':i===2&&!d.subsets.length?'ใช้ของเดิม / ข้ามได้':'พร้อมแล้ว');
      button.classList.toggle('active',i===step);if(i===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');button.querySelector('small').textContent=status;
    });
    var help=['กรอกชื่อชุดสินค้า วันที่ และสาขา หรือนำเข้า Excel (Approval Form) เพื่อเติมข้อมูลให้อัตโนมัติ — นำเข้าเพิ่มภายหลังได้โดยไม่ล้างรายการเดิม','มีผงรสชาติใหม่: เพิ่มผง แล้วเพิ่มเข้า SUBSET เดิมทีละ SUBSET (ตารางด้านล่างแสดงแบบชีตผง) · ไม่มีผงใหม่ กด “ไม่มีผงใหม่ ข้ามขั้นนี้”','สร้าง SUBSET ใหม่ ใส่รายการผง แล้วกรอกตัวย่อ (Subset Name 2) · สินค้าที่ไม่มีผง เช่น เครื่องดื่ม / ซอส ข้ามขั้นนี้ได้','แต่ละสินค้าแสดงแบบเดียวกับไฟล์ Excel: ชื่อ / Code / Category ด้านบน ช่องทางขายและราคา แล้วตาราง Recipe Details — สินค้าที่ใช้ผงกด “SUBSET (สูตรผง)” เพื่อเลือก SUBSET ที่สร้างในขั้น 3','ตรวจข้อมูลทั้งหมด จุดที่ยังไม่ครบกดที่ข้อความเพื่อกลับไปแก้ได้ เมื่อครบแล้วกด “ยืนยันส่งให้ IT”'];
    if(step===0)help[0]=!mode?'เลือกวิธีการทำงานด้านล่างก่อน: นำเข้าไฟล์ Excel หรือกรอกเอง':mode==='excel'?'กรอกชื่อชุดสินค้า วันที่ และสาขา แล้วกด “ถัดไป” — ไฟล์ Excel จะให้เลือกในแต่ละขั้น: ผงรสชาติ (ขั้น 2), SUBSET (ขั้น 3) และสินค้า (ขั้น 4)':'กรอกชื่อชุดสินค้า วันที่ และสาขา แล้วกด “ถัดไป”';
    if(mode==='excel'){help[1]='มีผงรสชาติใหม่ เลือกไฟล์และชีตผง (เช่น mala flavor) ระบบเพิ่มผงเข้า SUBSET เดิมตามไฟล์ หรือเพิ่มเองทีละรายการ · ไม่มีผงใหม่ กด “ไม่มีผงใหม่ ข้ามขั้นนี้”';help[2]='SUBSET ใหม่: เลือกไฟล์และชีต ss ด้านล่าง แล้วกรอกตัวย่อ (Subset Name 2) และตรวจปริมาณผง · สินค้าที่ไม่มีผงข้ามขั้นนี้ได้';help[3]='เลือกไฟล์และชีตสินค้า (Approval Form) ด้านล่าง ระบบเติมสินค้า ราคา Recipe และผูก SUBSET ที่สร้างในขั้น 3 ให้ แล้วตรวจและแก้ไขแต่ละสินค้า';}
    el('npWorkflowIntro').innerHTML='<h4 tabindex="-1" class="h5">'+titles[step]+'</h4><p>'+help[step]+'</p>';
    el('npStepBack').disabled=step===0;el('npStepNext').hidden=step===4;el('npStepSubmit').hidden=step!==4;el('npStepSubmit').disabled=!!issues.length;el('npStepLabel').textContent='ขั้น '+(step+1)+' จาก 5';
    el('npWorkLibrary').innerHTML=d.workPowders.length?'<ul>'+d.workPowders.map(function(p){return '<li>'+esc(p.eng)+' · RM '+esc(p.code||'ยังไม่ระบุ')+' <button class="btn btn-sm btn-link text-danger" onclick="PC_NpdWorkflow.removePowder(\''+p.id+'\')">นำออกจากรายการเตรียมผง</button></li>';}).join('')+'</ul>':'<p class="text-secondary">ยังไม่ได้เตรียมผงใหม่</p>';
    renderPowderSheet(d);
    el('npAttachForm').hidden=!d.workPowders.length;el('npAttachEmpty').hidden=!!d.workPowders.length;
    selectOptions('npLibraryPick',d.workPowders.map(function(p){return {id:p.id,name:p.eng+' · '+p.code};}));
    selectOptions('npTargetPick',d.subsets.filter(function(s){return s.existing;}).map(function(s){return{id:s.id,name:s.ssCode+' · '+s.name};}).concat(RD.workflowSubsets().filter(function(s){return String(s.status||'Active').toLowerCase()!=='inactive'&&!d.subsets.some(function(x){return x.ssCode===s.ssCode;});}).map(function(s){return{id:'db:'+s.ssCode,name:s.ssCode+' · '+s.name};})).concat(d.subsets.filter(function(s){return !s.existing;}).map(function(s){return{id:s.id,name:s.ssCode+' · '+s.name+' (ใหม่ในงานนี้)'};})));
    if(step===4){el('npWorkflowReview').innerHTML='<h4 class="h6 fw-bold">'+esc(d.project||'ยังไม่ระบุชื่อชุดสินค้า')+'</h4><p>'+d.products.length+' สินค้า · '+d.subsets.filter(function(s){return !s.existing;}).length+' SUBSET ใหม่ · '+d.subsets.filter(function(s){return s.existing;}).length+' SUBSET เดิมที่เพิ่มผง</p>'+ 
      (issues.length?'<div role="status"><p class="fw-bold">ตรวจให้ครบก่อนส่ง</p><ul>'+issues.map(function(x){return '<li><button class="btn btn-link text-start" onclick="PC_NpdWorkflow.go('+x.step+')">'+esc(x.message)+'</button></li>';}).join('')+'</ul></div>':'<p class="text-success">ข้อมูลพร้อมแล้ว ตรวจรายการด้านล่างและกดยืนยันส่งให้ IT</p>')+
      '<div class="table-responsive"><table class="table"><thead><tr><th>สินค้า</th><th>Category / รหัส</th><th>SUBSET ที่ใช้</th></tr></thead><tbody>'+d.products.map(function(p){return '<tr><td>'+(p.name?esc(p.name):'<span class="text-secondary">(ยังไม่มีชื่อ)</span>')+'</td><td>'+esc(p.category)+'<br>'+esc(p.code)+'</td><td>'+((p.formulas||[]).map(function(f){var s=d.subsets.find(function(x){return x.id===f.subId;})||RD.workflowSubsets().find(function(x){return 'db:'+x.ssCode===f.subId;});return esc(s?s.name:'ยังไม่เลือก')+' ('+esc(f.chooseMin)+'–'+esc(f.chooseMax)+')';}).join('<br>')||'ไม่ใช้ SUBSET')+'</td></tr>';}).join('')+'</tbody></table></div>'+d.subsets.map(function(s){return '<details class="mb-2"><summary>'+esc(s.ssCode+' · '+s.name)+' ('+s.powders.length+' รายการ)</summary><ul>'+s.powders.map(function(w){return '<li>'+esc(w.eng)+' · CMPOS '+esc(w.cmpos)+' · RM '+esc(w.code||'—')+' · '+esc(w.qty||'—')+' '+esc(w.unit)+'</li>';}).join('')+'</ul></details>';}).join('');}
  }
  // Mirrors the flavor sheet: Code | SUBSET | NO | CMPOS | ENG | Item Code | Description | Quantity | Unit | Spoon Size.
  function renderPowderSheet(d){
    var rows=[];d.subsets.forEach(function(s){s.powders.forEach(function(w){if(w.libraryId)rows.push({s:s,w:w});});});
    var inp=function(r,k,attrs){return '<input class="form-control form-control-sm" '+(attrs||'')+' value="'+esc(r.w[k])+'" oninput="RD.setW(\''+r.s.id+'\',\''+r.w.id+'\',\''+k+'\',this.value)" aria-label="'+k+'">';};
    el('npPowderSheet').innerHTML=rows.length?'<h4 class="h6 fw-bold">ผงใหม่ใน SUBSET ('+rows.length+' รายการ)</h4><p class="small">แสดงแบบเดียวกับชีตผงในไฟล์ แก้ไขได้ทุกช่อง ยกเว้น SS Code และ CMPOS ที่ระบบจองไว้</p><div class="table-responsive"><table class="table table-sm align-middle recipe-tbl"><thead><tr><th>Code</th><th>SUBSET</th><th>NO</th><th>CMPOS CODE</th><th>ENG</th><th>รหัส RM</th><th>Description</th><th>Quantity</th><th>Unit</th><th>Spoon Size</th><th></th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td class="mono">'+esc(r.s.ssCode)+(r.s.existing?'':' <span class="badge bg-success">ใหม่</span>')+'</td><td>'+esc(r.s.name)+'</td><td style="width:70px">'+inp(r,'seq','type="number" min="1"')+'</td><td><input class="form-control form-control-sm mono it-field" readonly value="'+esc(r.w.cmpos)+'" aria-label="CMPOS"></td><td>'+inp(r,'eng','maxlength="20"')+'</td><td style="width:90px">'+inp(r,'code','list="rmList"')+'</td><td>'+inp(r,'desc')+'</td><td style="width:80px">'+inp(r,'qty','type="number" step="any"')+'</td><td style="width:70px">'+inp(r,'unit')+'</td><td>'+inp(r,'spoon')+'</td><td><button type="button" class="btn btn-sm btn-link text-danger" onclick="RD.delW(\''+r.s.id+'\',\''+r.w.id+'\')" aria-label="ลบ">×</button></td></tr>';}).join('')+'</tbody></table></div>':'';
  }
  function go(n){RD.setWorkflowStep(n);refresh();var active=root.querySelector('.np-step.active');if(active)el('npWorkflowNav').scrollLeft=Math.max(0,active.offsetLeft-el('npWorkflowNav').offsetLeft-20);var heading=el('npWorkflowIntro');if(heading){heading.scrollIntoView({block:'start'});heading.querySelector('h4').focus();}}
  async function readFlavors(input){
    var ticket=++readTicket;flavorPlan=null;workbook=null;el('npFlavorPreview').textContent='กำลังอ่านไฟล์…';el('npFlavorSheet').disabled=true;
    try{var f=input.files&&input.files[0];if(!f)return;if(!/\.xlsx$/i.test(f.name)||f.size>15*1024*1024)throw Error('ใช้ไฟล์ .xlsx ไม่เกิน 15 MB');
      if(!window.XLSX)await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='vendor/sheetjs/xlsx.full.min.js';s.onload=resolve;s.onerror=function(){reject(Error('โหลดตัวอ่าน Excel ไม่สำเร็จ'));};document.head.appendChild(s);});
      var bytes=await f.arrayBuffer();if(ticket!==readTicket||!root.isConnected)return;workbook=XLSX.read(bytes,{type:'array'});
      var names=PC_NpdExcel.listSubsetSheets(workbook,XLSX);if(!names.length)throw Error('ไม่พบชีตสูตรผง');el('npFlavorSheet').innerHTML=names.map(function(n){return '<option>'+esc(n)+'</option>';}).join('');el('npFlavorSheet').value=names.find(function(n){return /flavor/i.test(n);})||names[0];el('npFlavorSheet').disabled=false;previewFlavors();
    }catch(e){el('npFlavorPreview').textContent=e.message;}
  }
  function flavorReview(){
    if(!flavorPlan)return;
    var masters=RD.workflowSubsets(),missing=0;
    // Preview laid out like the flavor sheet: one row per powder, with its SUBSET code and name.
    var rows=flavorPlan.subsets.map(function(s,i){
      var unknown=s.ssCode && !masters.some(function(m){return m.ssCode===s.ssCode;});
      if(unknown)missing++;
      var code=unknown?'<label class="visually-hidden" for="npMapFlavor'+i+'">ไม่พบ '+esc(s.ssCode)+' ในระบบ เลือก SUBSET ปลายทาง</label><span class="text-danger small">ไม่พบ '+esc(s.ssCode)+'</span><select id="npMapFlavor'+i+'" class="form-select form-select-sm" style="min-width:180px" onchange="PC_NpdWorkflow.mapFlavor('+i+',this.value)"><option value="">เลือก SUBSET</option><option value="new">สร้าง SUBSET ใหม่ในงานนี้</option>'+masters.filter(function(m){return String(m.status||'Active').toLowerCase()!=='inactive';}).map(function(m){return '<option value="'+esc(m.ssCode)+'">'+esc(m.ssCode+' · '+m.name)+'</option>';}).join('')+'</select>':(s.ssCode?'<span class="mono">'+esc(s.ssCode)+'</span>':'<span class="badge bg-success">SUBSET ใหม่</span>');
      return s.powders.map(function(w,j){return '<tr><td>'+(j?'':code)+'</td><td>'+(j?'':esc(s.name))+'</td><td>'+esc(w.seq)+'</td><td>'+esc(w.eng)+'</td><td class="mono">'+esc(w.code)+'</td><td>'+esc(w.desc)+'</td><td>'+esc(w.qty)+'</td><td>'+esc(w.unit)+'</td><td>'+esc(w.spoon)+'</td></tr>';}).join('');
    }).join('');
    el('npFlavorPreview').innerHTML='<p class="small mb-2">ตัวอย่างจากชีต '+esc(flavorPlan.sheet)+' · '+flavorPlan.subsets.length+' SUBSET'+(missing?' · <span class="text-danger">เลือก SUBSET ปลายทางให้รหัสที่ไม่พบในระบบก่อน</span>':'')+'</p><div class="table-responsive"><table class="table table-sm align-middle recipe-tbl"><thead><tr><th>Code</th><th>SUBSET</th><th>NO</th><th>ENG</th><th>รหัส RM</th><th>Description</th><th>Quantity</th><th>Unit</th><th>Spoon Size</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+flavorPlan.errors.map(function(e){return '<p class="text-danger">'+esc(e.message)+'</p>';}).join('')+'<button class="btn btn-success" '+(flavorPlan.errors.length||missing?'disabled':'')+' onclick="PC_NpdWorkflow.importFlavors()">เพิ่มผงเข้า SUBSET ตามไฟล์</button>';
  }
  function previewFlavors(){if(!workbook)return;flavorPlan=PC_NpdExcel.parseFlavorSheet(workbook,value('npFlavorSheet'),XLSX);flavorReview();}
  window.PC_NpdWorkflow={init:init,refresh:refresh,go:go,back:function(){go(RD.workflowSnapshot().workflow.step-1);},next:function(){go(RD.workflowSnapshot().workflow.step+1);},
    choice:function(k,v){RD.setWorkflowChoice(k,v);go(k==='powderChoice'?2:3);},
    entry:function(v){RD.setWorkflowChoice('entryMode',v);refresh();var f=el('npProject');if(f)f.focus();},
    addPowder:function(){act(function(){RD.addWorkPowder({eng:value('npWorkName'),code:value('npWorkRM'),desc:value('npWorkDesc'),unit:value('npWorkUnit')||'g'});['npWorkName','npWorkRM','npWorkDesc','npWorkUnit'].forEach(function(id){el(id).value='';});});},
    removePowder:function(id){act(function(){RD.removeWorkPowder(id);});},
    attach:function(){act(function(){if(!(Number(value('npLinkQty'))>0))throw Error('กรอกปริมาณผงมากกว่า 0');RD.attachWorkPowder(value('npLibraryPick'),value('npTargetPick'),{qty:value('npLinkQty'),spoon:value('npLinkSpoon'),seq:value('npLinkSeq')});});},
    readFlavors:readFlavors,previewFlavors:previewFlavors,
    mapFlavor:function(i,code){if(!code)return;var s=flavorPlan.subsets[i];if(code==='new')s.ssCode='';else{var m=RD.workflowSubsets().find(function(x){return x.ssCode===code;});if(!m)return;s.ssCode=m.ssCode;s.name=m.name;}flavorReview();},
    importFlavors:function(){act(function(){var count=RD.importWorkFlavors(flavorPlan);el('npFlavorPreview').textContent='เพิ่ม '+count+' สูตรแล้ว ตรวจตารางผงใหม่ใน SUBSET ด้านล่าง';refresh();el('npPowderSheet').scrollIntoView({block:'start'});});},
    reviewStores:function(group){act(function(){RD.reviewProductStores(group);});}
  };
  if(window.RD && document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',function(){if(window.RD)init();});
})(window);
