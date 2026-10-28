/* One guided workspace; RD remains the owner of form data and reservations. */
(function(window){
  'use strict';
  var titles=['ข้อมูลงาน','ผงรสชาติ','SUBSET','สินค้า','ตรวจและส่ง'], root=null, workbook=null, flavorPlan=null, readTicket=0;
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var el=function(id){return document.getElementById(id);};
  function value(id){return el(id)?el(id).value.trim():'';}
  function fail(e){el('npWorkflowMessage').textContent=e.message||String(e);}
  function act(fn){try{el('npWorkflowMessage').textContent='';var result=fn();refresh();return result;}catch(e){fail(e);}}
  function init(){
    root=document.querySelector('.npd-scope');if(!root || root.dataset.guided)return;root.dataset.guided='true';
    var nav=root.querySelector('nav[aria-label="ขั้นตอนเพิ่มสินค้าใหม่"]');
    nav.id='npWorkflowNav';nav.className='np-workflow-nav';nav.innerHTML='';root.insertBefore(nav,root.querySelector('.np-excel'));
    var intro=document.createElement('div');intro.id='npWorkflowIntro';intro.className='np-workflow-intro';root.insertBefore(intro,nav.nextSibling);
    root.querySelector('.np-excel').dataset.npdStep='0';
    el('npProject').closest('.bg-white').dataset.npdStep='0';
    el('npSubsetStep').closest('.bg-white').dataset.npdStep='2';
    el('npCategoryStep').closest('.bg-white').dataset.npdStep='3';
    el('npCategoryStep').querySelector('span').textContent='หมวดเริ่มต้นสำหรับสินค้าที่เพิ่มใหม่';
    el('npCategoryStep').parentElement.querySelector('.hint').textContent='เลือกหมวดก่อนเพิ่มสินค้า เปลี่ยนหมวดของแต่ละสินค้าได้ในรายการ โดยไม่กระทบสินค้าอื่น';
    el('npProductStep').dataset.npdStep='3';el('npProductStep').textContent='รายการสินค้า';
    el('productList').dataset.npdStep='3';root.querySelector('[onclick="RD.addProduct()"]').dataset.npdStep='3';
    var powder=document.createElement('section');powder.id='npWorkflowPowders';powder.dataset.npdStep='1';powder.className='bg-white border rounded-3 p-3 mb-3';
    powder.innerHTML='<h4 class="h6 fw-bold">งานนี้มีผงรสชาติใหม่หรือไม่?</h4><p>มีผงใหม่ให้เตรียมข้อมูลครั้งเดียว แล้วเลือกเข้า SUBSET ในขั้นถัดไป หากใช้ผงเดิมหรือสินค้าไม่มีผง สามารถข้ามได้</p>'+ 
      '<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-outline-success" onclick="PC_NpdWorkflow.choice(\'powderChoice\',\'existing\')">ใช้ผงเดิม</button><button class="btn btn-outline-success" onclick="PC_NpdWorkflow.choice(\'powderChoice\',\'none\')">ไม่มีผงใหม่ ไปขั้น SUBSET</button></div>'+ 
      '<details open><summary class="fw-bold mb-3">เพิ่มผงใหม่ / เลือกวัตถุดิบเดิม</summary><div class="row g-3">'+
      field('npWorkName','ชื่อรสชาติ เช่น Mala')+field('npWorkRM','รหัสวัตถุดิบ RM','list="rmList"')+field('npWorkDesc','รายละเอียดวัตถุดิบ')+field('npWorkUnit','หน่วย เช่น g')+
      '</div><button class="btn btn-success mt-3" onclick="PC_NpdWorkflow.addPowder()">เพิ่มผงไว้ใช้ในงานนี้</button><p class="small mt-2">RM เป็นรหัสวัตถุดิบ ส่วน CMPOS จะจองตามสูตรเมื่อผูกเข้า SUBSET</p></details><div id="npWorkLibrary" class="mt-3"></div>'+ 
      '<hr><h4 class="h6 fw-bold">นำเข้าผงและ SUBSET ปลายทาง</h4><p class="small">รองรับชีต mala flavor และตารางผง ระบบเชื่อมรายการซ้ำในงานนี้และเก็บสูตรแต่ละขนาดแยกกัน</p>'+ 
      '<label for="npFlavorFile" class="form-label">ไฟล์ Excel</label><input id="npFlavorFile" type="file" accept=".xlsx" class="form-control" onchange="PC_NpdWorkflow.readFlavors(this)">'+
      '<label for="npFlavorSheet" class="form-label mt-2">ชีตผง</label><select id="npFlavorSheet" class="form-select" disabled onchange="PC_NpdWorkflow.previewFlavors()"></select><div id="npFlavorPreview" class="mt-3" aria-live="polite"></div>';
    el('tabNew').insertBefore(powder,el('npSubsetStep').closest('.bg-white'));
    var links=document.createElement('section');links.dataset.npdStep='2';links.className='bg-white border rounded-3 p-3 mb-3';links.innerHTML='<h4 class="h6 fw-bold">นำผงที่เตรียมไว้เข้า SUBSET</h4><p class="small">สร้าง SUBSET ใหม่ด้านบน หรือเลือก SUBSET เดิมด้านล่าง แล้วกำหนดสูตรสำหรับกลุ่มนั้น</p><div class="row g-3"><div class="col-md-6"><label for="npLibraryPick" class="form-label">ผงในงานนี้</label><select id="npLibraryPick" class="form-select"></select></div><div class="col-md-6"><label for="npTargetPick" class="form-label">SUBSET ปลายทาง</label><select id="npTargetPick" class="form-select"></select></div>'+field('npLinkQty','ปริมาณผง','type="number" min="0" step="any"')+field('npLinkSpoon','ขนาดช้อน')+field('npLinkSeq','ลำดับผงบน POS (ต้องระบุเมื่อเพิ่มเข้า SUBSET เดิม)','type="number" min="1"')+'</div><button class="btn btn-success mt-3" onclick="PC_NpdWorkflow.attach()">เพิ่มผงเข้า SUBSET ที่เลือก</button><button class="btn btn-link" onclick="PC_NpdWorkflow.go(1)">กลับไปเตรียมผง</button><button class="btn btn-outline-success ms-2" onclick="PC_NpdWorkflow.choice(\'subsetChoice\',\'none\')">สินค้าไม่ใช้ SUBSET ไปเพิ่มสินค้า</button>';
    el('tabNew').insertBefore(links,el('npCategoryStep').closest('.bg-white'));
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
    root.querySelectorAll('[data-npd-step]').forEach(function(n){n.hidden=Number(n.dataset.npdStep)!==step;});
    if(!el('npWorkflowNav').children.length) el('npWorkflowNav').innerHTML=titles.map(function(t,i){return '<button type="button" class="np-step" onclick="PC_NpdWorkflow.go('+i+')"><span>'+(i+1)+'. '+t+'</span><small></small></button>';}).join('');
    Array.from(el('npWorkflowNav').children).forEach(function(button,i){
      var pending=issues.filter(function(x){return x.step===i;}).length;
      var status=i===4?(issues.length?'รอตรวจ '+issues.length+' จุด':'พร้อมส่ง'):pending?'ต้องเติมข้อมูล':(i===1&&!d.workPowders.length?'ไม่มีผงใหม่':i===2&&!d.subsets.length?'ใช้ของเดิม / ข้ามได้':'พร้อมแล้ว');
      button.classList.toggle('active',i===step);if(i===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');button.querySelector('small').textContent=status;
    });
    var help=['เริ่มจากข้อมูลงาน กรอกเองหรือนำเข้า Excel ได้ และเพิ่มข้อมูลต่อภายหลังโดยไม่ล้างรายการเดิม','เตรียมรสชาติที่ต้องเพิ่ม หากไม่มีผงใหม่ไปขั้น SUBSET ได้เลย','เตรียมกลุ่มผงก่อนผูกกับสินค้า ใช้ SUBSET เดิมหรือสร้างกลุ่มใหม่ในงานนี้ได้','เลือก Category ให้แต่ละสินค้า แล้วเลือก SUBSET เฉพาะสินค้าที่ต้องใช้ผง','ตรวจข้อมูลและการเชื่อมโยงทั้งหมด จุดที่ยังไม่ครบกดกลับไปแก้ได้'];
    el('npWorkflowIntro').innerHTML='<h4 tabindex="-1" class="h5">'+titles[step]+'</h4><p>'+help[step]+'</p>';
    el('npStepBack').disabled=step===0;el('npStepNext').hidden=step===4;el('npStepSubmit').hidden=step!==4;el('npStepSubmit').disabled=!!issues.length;el('npStepLabel').textContent='ขั้น '+(step+1)+' จาก 5';
    el('npWorkLibrary').innerHTML=d.workPowders.length?'<ul>'+d.workPowders.map(function(p){return '<li>'+esc(p.eng)+' · RM '+esc(p.code||'ยังไม่ระบุ')+' <button class="btn btn-sm btn-link text-danger" onclick="PC_NpdWorkflow.removePowder(\''+p.id+'\')">นำออกจากรายการเตรียมผง</button></li>';}).join('')+'</ul>':'<p class="text-secondary">ยังไม่ได้เตรียมผงใหม่</p>';
    selectOptions('npLibraryPick',d.workPowders.map(function(p){return {id:p.id,name:p.eng+' · '+p.code};}));
    selectOptions('npTargetPick',d.subsets.map(function(s){return{id:s.id,name:s.name+' · '+s.ssCode};}).concat(RD.workflowSubsets().filter(function(s){return String(s.status||'Active').toLowerCase()!=='inactive'&&!d.subsets.some(function(x){return x.ssCode===s.ssCode;});}).map(function(s){return{id:'db:'+s.ssCode,name:s.name+' · '+s.ssCode};})));
    // Each imported group explicitly captures its own store selection.
    document.querySelectorAll('.np-import-stores').forEach(function(n){if(!d.products.some(function(p){return p.importGroup===n.dataset.group;}))n.remove();});
    var groups={};d.products.forEach(function(p){if(!p.importGroup||groups[p.importGroup])return;groups[p.importGroup]=true;var previous=Array.from(document.querySelectorAll('.np-import-stores')).find(function(n){return n.dataset.group===p.importGroup;});if(previous && previous.dataset.reviewed===String(p.storesReviewed))return;if(previous)previous.remove();var node=document.createElement('div');node.dataset.group=p.importGroup;node.dataset.reviewed=String(p.storesReviewed);node.className='np-import-stores border rounded p-3 mb-3';node.innerHTML='<b>สาขาสำหรับกลุ่ม '+esc(p.category)+' / '+esc(p.sourceName||p.name)+'</b><p class="small">'+esc((p.importRules||[]).map(function(r){return r.type+': '+r.values.filter(function(v){return v.selected;}).map(function(v){return v.label;}).join(', ');}).join(' · '))+'</p><p class="small">เลือกสาขาที่ขั้นข้อมูลงาน แล้วกดยืนยันเพื่อใช้กับกลุ่มนี้ การเลือกครั้งถัดไปจะไม่เปลี่ยนกลุ่มที่ยืนยันแล้ว</p><button class="btn btn-sm btn-outline-success" onclick="PC_NpdWorkflow.go(0)">เลือกสาขา</button> <button class="btn btn-sm btn-success" onclick="PC_NpdWorkflow.reviewStores(\''+p.importGroup+'\')">'+(p.storesReviewed?'ยืนยันสาขาอีกครั้ง':'ยืนยันใช้สาขาที่เลือกกับกลุ่มนี้')+'</button><span class="ms-2">'+(p.storesReviewed?'ยืนยันแล้ว':'ยังไม่ยืนยัน')+'</span>';el('productList').prepend(node);});
    if(step===4){el('npWorkflowReview').innerHTML='<h4 class="h6 fw-bold">'+esc(d.project||'ยังไม่ระบุชื่อโครงการ')+'</h4><p>'+d.products.length+' สินค้า · '+d.subsets.filter(function(s){return !s.existing;}).length+' SUBSET ใหม่ · '+d.subsets.filter(function(s){return s.existing;}).length+' SUBSET เดิมที่เพิ่มผง</p>'+ 
      (issues.length?'<div role="status"><p class="fw-bold">ตรวจให้ครบก่อนส่ง</p><ul>'+issues.map(function(x){return '<li><button class="btn btn-link text-start" onclick="PC_NpdWorkflow.go('+x.step+')">'+esc(x.message)+'</button></li>';}).join('')+'</ul></div>':'<p class="text-success">ข้อมูลพร้อมแล้ว ตรวจรายการด้านล่างและกดยืนยันส่งให้ IT</p>')+
      '<div class="table-responsive"><table class="table"><thead><tr><th>สินค้า</th><th>Category / รหัส</th><th>SUBSET ที่ใช้</th></tr></thead><tbody>'+d.products.map(function(p){return '<tr><td>'+esc(p.name)+'</td><td>'+esc(p.category)+'<br>'+esc(p.code)+'</td><td>'+((p.formulas||[]).map(function(f){var s=d.subsets.find(function(x){return x.id===f.subId;})||RD.workflowSubsets().find(function(x){return 'db:'+x.ssCode===f.subId;});return esc(s?s.name:'ยังไม่เลือก')+' ('+esc(f.chooseMin)+'–'+esc(f.chooseMax)+')';}).join('<br>')||'ไม่ใช้ SUBSET')+'</td></tr>';}).join('')+'</tbody></table></div>'+d.subsets.map(function(s){return '<details class="mb-2"><summary>'+esc(s.ssCode+' · '+s.name)+' ('+s.powders.length+' รายการ)</summary><ul>'+s.powders.map(function(w){return '<li>'+esc(w.eng)+' · CMPOS '+esc(w.cmpos)+' · RM '+esc(w.code||'—')+' · '+esc(w.qty||'—')+' '+esc(w.unit)+'</li>';}).join('')+'</ul></details>';}).join('');}
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
    var rows=flavorPlan.subsets.map(function(s,i){
      var unknown=s.ssCode && !masters.some(function(m){return m.ssCode===s.ssCode;});
      if(unknown)missing++;
      return '<li>'+esc(s.name)+' · '+esc(s.ssCode||'สร้างใหม่ในงานนี้')+' · '+s.powders.length+' สูตร'+(unknown?'<label class="d-block mt-2" for="npMapFlavor'+i+'">ไม่พบรหัสนี้ในระบบ เลือก SUBSET ปลายทาง</label><select id="npMapFlavor'+i+'" class="form-select mb-3" onchange="PC_NpdWorkflow.mapFlavor('+i+',this.value)"><option value="">กรุณาเลือก</option><option value="new">สร้าง SUBSET ใหม่ในงานนี้</option>'+masters.filter(function(m){return String(m.status||'Active').toLowerCase()!=='inactive';}).map(function(m){return '<option value="'+esc(m.ssCode)+'">'+esc(m.ssCode+' · '+m.name)+'</option>';}).join('')+'</select>':'')+'</li>';
    }).join('');
    el('npFlavorPreview').innerHTML='<p>'+flavorPlan.subsets.length+' SUBSET ปลายทาง</p><ul>'+rows+'</ul>'+flavorPlan.errors.map(function(e){return '<p class="text-danger">'+esc(e.message)+'</p>';}).join('')+'<button class="btn btn-success" '+(flavorPlan.errors.length||missing?'disabled':'')+' onclick="PC_NpdWorkflow.importFlavors()">เพิ่มผงและเชื่อม SUBSET ในงานนี้</button>';
  }
  function previewFlavors(){if(!workbook)return;flavorPlan=PC_NpdExcel.parseFlavorSheet(workbook,value('npFlavorSheet'),XLSX);flavorReview();}
  window.PC_NpdWorkflow={init:init,refresh:refresh,go:go,back:function(){go(RD.workflowSnapshot().workflow.step-1);},next:function(){go(RD.workflowSnapshot().workflow.step+1);},
    choice:function(k,v){RD.setWorkflowChoice(k,v);go(k==='powderChoice'?2:3);},
    addPowder:function(){act(function(){RD.addWorkPowder({eng:value('npWorkName'),code:value('npWorkRM'),desc:value('npWorkDesc'),unit:value('npWorkUnit')||'g'});['npWorkName','npWorkRM','npWorkDesc','npWorkUnit'].forEach(function(id){el(id).value='';});});},
    removePowder:function(id){act(function(){RD.removeWorkPowder(id);});},
    attach:function(){act(function(){if(!(Number(value('npLinkQty'))>0))throw Error('กรอกปริมาณผงมากกว่า 0');RD.attachWorkPowder(value('npLibraryPick'),value('npTargetPick'),{qty:value('npLinkQty'),spoon:value('npLinkSpoon'),seq:value('npLinkSeq')});});},
    readFlavors:readFlavors,previewFlavors:previewFlavors,
    mapFlavor:function(i,code){if(!code)return;var s=flavorPlan.subsets[i];if(code==='new')s.ssCode='';else{var m=RD.workflowSubsets().find(function(x){return x.ssCode===code;});if(!m)return;s.ssCode=m.ssCode;s.name=m.name;}flavorReview();},
    importFlavors:function(){act(function(){var count=RD.importWorkFlavors(flavorPlan);el('npFlavorPreview').textContent='เพิ่ม '+count+' สูตรแล้ว ตรวจ SUBSET และกรอกตัวย่อก่อนส่ง';go(2);});},
    reviewStores:function(group){act(function(){RD.reviewProductStores(group);});}
  };
  if(window.RD && document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',function(){if(window.RD)init();});
})(window);
