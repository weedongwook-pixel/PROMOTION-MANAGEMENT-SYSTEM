/* Existing Operate UI: Tracking -> original proposal form, with an explicit
   edit banner, Cloud-confirmed save and safe cancel; no new visual system. */
(function(){
  'use strict';
  let active=null,opening=false;
  const M=()=>window.PC_PromotionEditModel;
  const q=(host,s)=>host.querySelector(s),all=(host,s)=>Array.from(host.querySelectorAll(s));
  const val=(host,s)=>{const el=q(host,s);return el?el.value:'';};
  const put=(host,s,value)=>{const el=q(host,s);if(el)el.value=value==null?'':String(value);};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function open(campaign,month){
    if(opening)return;opening=true;const gen=window.__pageGen||0;
    try{
      if(!window.PC_CLOUD||!PC_CLOUD.loadCampaignEdit)throw Error('ระบบแก้ไขยังโหลดไม่ครบ กรุณารีเฟรช');
      const actor=String(localStorage.getItem('pc_userName')||'').trim();
      const context=await PC_CLOUD.loadCampaignEdit(campaign,month,actor);
      if((window.__pageGen||0)!==gen)return;
      active=context;localStorage.setItem('pc_createpromo_sub',context.form.form);
      window.loadPage('CreatePromotion',document.getElementById('nav-CreatePromotion'));
    }catch(e){if((window.__pageGen||0)===gen)await Swal.fire('ไม่สามารถเปิดแก้ไข',String(e.message||e),'warning');}
    finally{opening=false;}
  }
  function clear(){active=null;if(window.__leaveGuard&&window.__leaveGuard._promotionEdit)window.__leaveGuard=null;}
  function isDirty(){
    if(!active||active.saved||!active.mounted||!active.mounted.isConnected)return false;
    try{return JSON.stringify(collect())!==active.initialPayload;}catch(e){return true;}
  }
  async function switchForm(pg){
    if(isDirty()){const r=await Swal.fire({title:'ออกโดยไม่บันทึกการแก้ไข?',text:'ข้อมูลบน Cloud จะคงเดิม',icon:'warning',showCancelButton:true,confirmButtonText:'ออกโดยไม่บันทึก',cancelButtonText:'แก้ไขต่อ'});if(!r.isConfirmed)return;}
    clear();window.cp2Go(pg);
  }
  async function cancel(){
    if(isDirty()){const r=await Swal.fire({title:'ออกโดยไม่บันทึกการแก้ไข?',text:'ข้อมูลบน Cloud จะคงเดิม',icon:'warning',showCancelButton:true,confirmButtonText:'ออกโดยไม่บันทึก',cancelButtonText:'แก้ไขต่อ'});if(!r.isConfirmed)return;}
    clear();window.loadPage('Campaign_Tracking',document.getElementById('nav-Campaign_Tracking'));
  }
  function updateOrderControls(){
    if(!active?.mounted)return;
    const blocks=all(active.mounted,'.pos-button-block');
    blocks.forEach((block,i)=>{const up=q(block,'.promotion-edit-move-up'),down=q(block,'.promotion-edit-move-down');if(up)up.disabled=i===0;if(down)down.disabled=i===blocks.length-1;});
  }
  function moveButton(id,direction){
    const block=document.getElementById(id);if(!active?.structuralEdits||!active?.mounted?.contains(block))return;
    const other=direction<0?block.previousElementSibling:block.nextElementSibling;if(!other?.classList.contains('pos-button-block'))return;
    if(direction<0)other.before(block);else other.after(block);
    active.dirty=true;updateOrderControls();const control=q(block,direction<0?'.promotion-edit-move-up':'.promotion-edit-move-down');(control?.disabled?q(block,direction<0?'.promotion-edit-move-down':'.promotion-edit-move-up'):control)?.focus();
  }
  async function removeButton(id){
    const block=document.getElementById(id);if(!active?.structuralEdits||!active?.mounted?.contains(block))return;
    if(all(active.mounted,'.pos-button-block').length<=1){await Swal.fire('ต้องมีปุ่มอย่างน้อย 1 ปุ่ม','','warning');return;}
    const r=await Swal.fire({title:'ลบปุ่มนี้จากรายการ?',text:'รหัสที่เคยใช้งานจะไม่ถูกคืนอัตโนมัติ การเปลี่ยนแปลงมีผลเมื่อบันทึกสำเร็จ',icon:'warning',showCancelButton:true,confirmButtonText:'ลบปุ่ม',cancelButtonText:'ยกเลิก'});
    if(r.isConfirmed&&active?.mounted?.contains(block)){block.remove();active.dirty=true;updateOrderControls();}
  }
  function decorateButton(block){
    if(!active||!block||q(block,'.promotion-edit-order'))return;
    const supported=active.structuralEdits===true;
    all(block,'[onclick*=".remove()"]:not(tr *)').forEach(el=>el.hidden=true);
    all(block,'input[type=file]').forEach(el=>{el.disabled=!supported;el.title=supported?'เลือกไฟล์ใหม่เพื่อแทนไฟล์แนบเดิม':'ระบบ Cloud ยังไม่รองรับการแก้ไขไฟล์แนบ';});
    if(!supported)return;
    const bar=document.createElement('div');bar.className='promotion-edit-order d-flex flex-wrap justify-content-end gap-2 mb-3';
    const labels=[['promotion-edit-move-up','เลื่อนขึ้น','Move up',()=>moveButton(block.id,-1)],['promotion-edit-move-down','เลื่อนลง','Move down',()=>moveButton(block.id,1)],['promotion-edit-remove','ลบปุ่ม','Remove button',()=>removeButton(block.id)]];
    labels.forEach(([cls,th,en,fn])=>{const b=document.createElement('button');b.type='button';b.className='btn btn-sm '+(cls.includes('remove')?'btn-outline-danger':'btn-outline-secondary')+' '+cls;b.dataset.th=th;b.dataset.en=en;b.textContent=localStorage.getItem('pc_lang')==='EN'?en:th;b.onclick=fn;bar.append(b);});
    block.prepend(bar);
    if(block.dataset.editNew==='1'){
      const controls=document.createElement('div');controls.className='promotion-edit-code-controls row g-3 mb-3';
      const slots=[['promotion','Code Promotion']];if(active.form.form==='Proposal')slots.push(['itemset','Code Item Set']);
      const en=localStorage.getItem('pc_lang')==='EN';
      slots.forEach(([name,label])=>{
        const column=document.createElement('div');column.className='col-12 col-md-6';
        const id=block.id+'-edit-code-'+name;
        column.innerHTML='<label class="form-label fw-bold" for="'+escapeHTML(id)+'-mode">'+label+'</label><select id="'+escapeHTML(id)+'-mode" class="form-select promotion-edit-code-'+name+'-mode"><option value="auto" data-th="ให้ระบบจองโค้ด" data-en="Reserve automatically">'+(en?'Reserve automatically':'ให้ระบบจองโค้ด')+'</option><option value="manual" data-th="ใส่โค้ดเอง" data-en="Enter code manually">'+(en?'Enter code manually':'ใส่โค้ดเอง')+'</option></select><label class="visually-hidden" for="'+escapeHTML(id)+'">'+label+'</label><input id="'+escapeHTML(id)+'" type="text" maxlength="20" autocomplete="off" spellcheck="false" class="form-control mt-2 promotion-edit-code-'+name+'" aria-describedby="'+escapeHTML(id)+'-hint" hidden disabled><div id="'+escapeHTML(id)+'-hint" class="form-text" data-th="ตรวจรหัสซ้ำและจองบน Cloud เมื่อบันทึกสำเร็จ" data-en="Checked for duplicates and reserved on Cloud when saved.">'+(en?'Checked for duplicates and reserved on Cloud when saved.':'ตรวจรหัสซ้ำและจองบน Cloud เมื่อบันทึกสำเร็จ')+'</div>';
        const mode=q(column,'select'),input=q(column,'input');
        mode.onchange=()=>{const manual=mode.value==='manual';input.hidden=!manual;input.disabled=!manual;input.required=manual;if(manual)input.focus();active.dirty=true;};
        controls.append(column);
      });
      bar.after(controls);
    }
  }
  function mount(formName){
    if(!active||active.form.form!==formName)return false;
    if(active.mounted&&active.mounted.isConnected)return true;
    const list=document.getElementById('campaignList');if(!list)return false;
    const context=active,form=context.form;
    const baseAdd=window.addButton?window.addButton._pcOriginal||window.addButton:null;
    if(baseAdd)window.addButton=baseAdd;
    list.innerHTML='';window.campaignCount=0;window.addCampaign();
    const card=q(list,'.campaign-card');if(!card)throw Error('เปิดฟอร์มเดิมไม่สำเร็จ');
    ['name','start','end','detail'].forEach(k=>put(card,'.camp-'+k,form.fields[k==='name'?'campaign':k]));
    put(card,'.camp-mechanic, .camp-condition',form.fields.mechanic);put(card,'.camp-postcate',form.fields.cate==='Item Coupon'?'Promotion set':form.fields.cate||'Promotion set');
    const name=q(card,'.camp-name');name.readOnly=true;name.removeAttribute('oninput');name.removeAttribute('onchange');name.title='คงชื่อเดิมเพื่ออ้างอิงรหัส หากต้องการเปลี่ยนชื่อกรุณาติดต่อ IT';
    const month=document.getElementById('globalMonth');if(month){month.value=context.month;month.disabled=true;}
    all(card,'.camp-start,.camp-end').forEach(el=>el.removeAttribute('min'));
    put(document,'#txnDate',form.buttons[0].items[0].txnDate||'');put(document,'#submittedBy',form.buttons[0].items[0].submittedBy||context.actor);
    const sender=document.getElementById('submitterDisplay');if(sender)sender.textContent=context.actor;
    const date=document.getElementById('txnDateDisplay'),rawDate=form.buttons[0].items[0].txnDate||form.buttons[0].items[0].submittedDate||'';
    if(date)date.textContent=rawDate&&!isNaN(new Date(rawDate).getTime())?new Date(rawDate).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):rawDate||'—';
    const header=document.getElementById('mainContent')?.parentElement?.firstElementChild;if(header&&header.classList.contains('d-flex'))header.classList.add('flex-wrap','gap-3');
    if(window.PC_CustomerGroup){PC_CustomerGroup.render();if(PC_CustomerGroup.restore)PC_CustomerGroup.restore(form.fields);else PC_CustomerGroup._set(form.fields.customerGroup||'normal');}
    // The branch-tag helper is authoritative for the hidden store value.
    if(window.createBranchTag&&form.fields.stores)window.createBranchTag(card.id,escapeHTML(form.fields.stores),false,form.fields.stores);
    put(card,'.camp-store',form.fields.stores);
    const modes=String(form.fields.saleMode||'').split(',').map(s=>s.trim().toLowerCase().replace(/[\s-]/g,''));
    if(window.PC_SaleModes)PC_SaleModes.restoreChecks(card,String(form.fields.saleMode||'').split(','));
    else all(card,'.mode-check,.mode-check-all,.mode-check-delivery').forEach(el=>{el.checked=modes.includes(el.value.toLowerCase().replace(/[\s-]/g,''));if(el.checked){el.disabled=false;el.closest('.form-check')?.classList.remove('d-none');}});
    const bc=document.getElementById('btn-container-'+card.id);bc.innerHTML='';
    form.buttons.forEach(button=>{
      window.addButton(card.id);const block=bc.lastElementChild;block.dataset.editId=button.id;
      put(block,'.btn-sn',button.shortName);put(block,'.btn-kitchen',button.kitchen);put(block,'.btn-net',button.netPrice);
      put(block,'.btn-disc-input,.btn-disc-val',parseFloat(button.discount)||0);put(block,'.btn-disc-unit',button.discountUnit);
      put(block,'.min-val',button.minAmount);
      if(formName==='Proposal'){put(block,'.btn-promo-type',button.promoType||'Item Set');}
      if(['Coupon','Proposal','BillDiscountProposal','VoucherProposal'].includes(formName)){put(block,'.btn-crm-code',button.crmMappingCode??button.items[0]?.crmMappingCode??'');put(block,'.btn-crm-detail',button.crmMappingDetail??button.items[0]?.crmMappingDetail??'');}
      const minCheck=q(block,'.min-spend-check');if(minCheck){minCheck.checked=Number(button.minAmount)>0;const min=q(block,'.min-val');if(min)min.style.display=minCheck.checked?'':'none';}
      all(block,'input[name^="couponType"],input[name^="voucherType"],input[name^="type-"],.coupon-type').forEach(el=>{el.checked=el.value===button.couponType;el.disabled=true;});
      all(block,'input[type=file]').forEach(el=>{el.disabled=true;el.title='คงไฟล์แนบเดิม หากเปลี่ยนไฟล์กรุณาติดต่อ IT';});
      if(button.attachment){const notice=document.createElement('p');notice.className='small text-success mb-2';notice.textContent='มีไฟล์แนบเดิม — ระบบจะคงไฟล์ไว้เมื่อบันทึก';block.prepend(notice);}
      if(button.couponType==='Online')all(block,'[id^="file-section-"],[id^="upload-sec-"]').forEach(el=>el.style.display='block');
      const tbody=q(block,'.item-body');tbody.innerHTML='';
      const couponGroup=q(block,'.btn-group-mode');if(formName==='Coupon'&&couponGroup){couponGroup.checked=button.items.some(i=>i.couponGroupMode===true||i.selectionMode==='CATE');put(block,'.btn-group-target',button.items.some(i=>i.selectionMode==='CATE')?'CATE':'ITEM');}
      button.items.forEach(item=>{
        if(formName==='BillDiscountProposal'){
          // Bill's builder uses raw HTML internally; only hand it encoded text.
          window.addCommittedRow(block.id,{mode:item.selectionMode==='CATE'?'CATE':'ITEM',cat:escapeHTML(item.catCode||item.cate||''),code:escapeHTML(item.itemCode),name:escapeHTML(item.itemNameEN)});
        }else window.addItemRow(block.id,formName==='Proposal'?card.id:false);
        const tr=tbody.lastElementChild;tr.dataset.editRowId=item.id;
        put(tr,'.row-ic',item.itemCode);put(tr,'.row-search-input,.row-search,.row-in',item.itemNameEN||item.itemCode);put(tr,'.row-qty',/^all$/i.test(String(item.qty))?'':item.qty);put(tr,'.row-op',formName==='VoucherProposal'?parseFloat(String(item.gross))||0:item.gross);put(tr,'.row-net',Number(item.netPrice||0)/(Number(item.qty)||1));
        if(formName==='VoucherProposal'){const price=q(tr,'.row-op');if(price){price.readOnly=true;price.title='มูลค่า Voucher เดิม — เปลี่ยนได้ที่ช่อง Voucher Value';}}
        put(tr,'.row-catecode',item.catCode||item.cateCode||'');put(tr,'.row-issubset',item.isSubset||(/^SS/i.test(item.itemCode)?'1':''));put(tr,'.row-ssmin',item.chooseMin);put(tr,'.row-ssmax',item.chooseMax);
        const category=q(tr,'.row-cat-select,.row-cat');if(category&&/^SS/i.test(item.itemCode))category.value='__SUBSET__';
        if(formName==='Coupon'&&category&&!/^SS/i.test(item.itemCode)){
          const code=String(item.catCode||item.cateCode||'');
          const name=Object.keys(window.catCodeMap||{}).find(n=>String(window.catCodeMap[n])===code);
          const whole=item.selectionMode==='CATE'||(code&&code===String(item.itemCode));
          if(name) category.value=name;
          put(tr,'.row-scope',whole?'CATE':'ITEM');
          if(whole){const search=q(tr,'.row-search-input');if(search)search.readOnly=true;}
        }
        if(formName==='Coupon'){
          if(/^SS/i.test(item.itemCode))put(tr,'.row-scope','SUBSET');
          if(window.couponScopeView)window.couponScopeView(tr.id);
        }
      });
      const allProducts=button.items.every(i=>/^ALL(?: ITEMS)?$/i.test(i.itemCode));
      if(formName==='Coupon'&&window.couponGroupView)window.couponGroupView(block.id);
      if(['Coupon','Proposal'].includes(formName)&&window.PC_CustomerGroup?.syncCoupons)PC_CustomerGroup.syncCoupons();
      all(block,'.p-mode').forEach(el=>{el.checked=el.value===(allProducts?'All':'Spec');});
      // Keep stored per-item coupon prices exact on initial open. Subsequent
      // quantity/discount edits use the form's existing updateTotals handler.
      if(formName==='Proposal')window.updateTotals(block.id);
      // Button creation/removal and online-type changes alter code ownership.
      all(block,'[onclick*=".remove()"]:not(tr *)').forEach(el=>el.hidden=true);
    });
    // Hide only campaign/button creation/removal, not product editing controls.
    all(document,'[onclick="window.addCampaign()"]').forEach(el=>el.hidden=true);
    all(card,'[onclick^="window.addButton("]').forEach(el=>el.hidden=context.structuralEdits!==true);
    if(baseAdd){
      const wrapped=function(campId){
        if(!active||campId!==active.mounted?.id)return baseAdd(campId);
        if(!active.structuralEdits)return;
        baseAdd(campId);const block=document.getElementById('btn-container-'+campId).lastElementChild;
        block.dataset.editId='new:'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);block.dataset.editNew='1';decorateButton(block);active.dirty=true;updateOrderControls();
      };wrapped._pcOriginal=baseAdd;window.addButton=wrapped;
    }
    const removeCampaign=q(card,'.card-header [onclick]');if(removeCampaign)removeCampaign.hidden=true;
    const previousBanner=document.getElementById('promotionEditBanner');if(previousBanner)previousBanner.remove();
    const previousReason=document.getElementById('promotionEditReason');if(previousReason)context.form.editReason=previousReason.value;
    document.getElementById('promotionEditReasonPanel')?.remove();
    const banner=document.createElement('div');banner.id='promotionEditBanner';banner.className='alert alert-success d-flex flex-wrap align-items-center justify-content-between gap-2';banner.setAttribute('role','status');
    const message=document.createElement('div');message.textContent='กำลังแก้ไขรายการเดิม: '+context.campaign+' — คงผู้ส่งเดิม · เปลี่ยนเป็น Item Coupon จะใช้รหัส IC · บันทึกแทนงานเดิมบน Cloud';
    const policy=M().policy(context.original,context.actor,context.month);
    if(policy.requiresReason){
      const reasonBox=document.createElement('div');reasonBox.id='promotionEditReasonPanel';reasonBox.className='w-100 text-start my-3';
      const label=document.createElement('label');label.htmlFor='promotionEditReason';label.className='form-label fw-bold';label.textContent='เหตุผลและรายละเอียดที่แก้ไข';
      const reason=document.createElement('textarea');reason.id='promotionEditReason';reason.className='form-control';reason.rows=3;reason.maxLength=2000;reason.required=true;reason.value=context.form.editReason||'';
      const feedback=document.createElement('div');feedback.id='promotionEditReasonError';feedback.className='invalid-feedback';feedback.setAttribute('role','alert');feedback.textContent='กรุณาระบุเหตุผลและจุดที่แก้ไขในช่องนี้ เพื่อให้ IT ดำเนินการได้ถูกต้อง';
      const help=document.createElement('div');help.id='promotionEditReasonHelp';help.className='small mt-1';help.textContent='งานนี้ผ่าน IT แล้ว เมื่อบันทึกจะส่งกลับให้ IT ดำเนินการแก้ไข และให้ OP ตรวจซ้ำ คงรหัสเดิมเมื่อประเภทไม่เปลี่ยน หากเปลี่ยนเป็น Item Coupon ระบบจะจัดรหัส IC';
      reason.setAttribute('aria-describedby',help.id);
      reason.addEventListener('input',()=>{if(reason.value.trim()){reason.classList.remove('is-invalid');reason.removeAttribute('aria-invalid');reason.setAttribute('aria-describedby',help.id);}});
      reasonBox.append(label,reason,feedback,help);banner.append(reasonBox);
    }
    const back=document.createElement('button');back.type='button';back.className='btn btn-outline-secondary btn-sm';back.textContent='ยกเลิกการแก้ไข';back.onclick=cancel;banner.append(message,back);list.before(banner);
    const submit=document.getElementById('mainSubmitBtn');submit.textContent='บันทึกการแก้ไข';submit.style.minWidth='0';submit.style.maxWidth='100%';
    const oldCancel=document.getElementById('promotionEditCancel');if(oldCancel)oldCancel.remove();
    const cancelButton=document.createElement('button');cancelButton.id='promotionEditCancel';cancelButton.type='button';cancelButton.className='btn btn-outline-secondary m-2';cancelButton.textContent='ยกเลิกการแก้ไข';cancelButton.onclick=cancel;submit.before(cancelButton);
    const reasonPanel=document.getElementById('promotionEditReasonPanel');if(reasonPanel)cancelButton.before(reasonPanel);
    submit.onclick=function(e){e.preventDefault();save();};
    window.submitAllData=save;
    context.mounted=card;context.dirty=false;
    all(card,'.pos-button-block').forEach(decorateButton);updateOrderControls();
    card.addEventListener('input',()=>{context.dirty=true;});card.addEventListener('change',()=>{context.dirty=true;});
    try{context.initialPayload=JSON.stringify(collect());}catch(e){context.initialPayload=null;}
    window.__leaveGuard={_promotionEdit:true,page:'CreatePromotion',check:isDirty,title:'มีการแก้ไขที่ยังไม่บันทึก',html:'ต้องการออกโดยไม่บันทึกหรือไม่? ข้อมูลบน Cloud จะคงเดิม',onLeave:clear};
    return true;
  }
  function collect(){
    if(!active||!active.mounted)throw Error('ไม่พบฟอร์มแก้ไข');
    const form=clone(active.form),card=active.mounted;
    ['start','end','detail'].forEach(k=>form.fields[k]=val(card,'.camp-'+k));form.fields.mechanic=val(card,'.camp-mechanic,.camp-condition');form.fields.stores=val(card,'.camp-store');
    if(!form.fields.detail.trim()||!form.fields.mechanic.trim()||!form.fields.stores||!form.fields.start||!form.fields.end||form.fields.end<form.fields.start)throw Error('กรุณากรอกวันที่ สาขา รายละเอียด และเงื่อนไขให้ครบถ้วน');
    const modes=all(card,'.mode-check:checked,.mode-check-all:checked,.mode-check-delivery:checked').map(el=>el.value);if(!modes.length)throw Error('กรุณาเลือกช่องทางขาย');
    // Preserve exact legacy spelling until the selected channels actually change.
    const normalized=s=>s.toLowerCase().replace(/[\s-]/g,'');if(modes.map(normalized).sort().join(',')!==String(form.fields.saleMode).split(',').map(s=>normalized(s.trim())).sort().join(','))form.fields.saleMode=modes.join(', ');
    if(q(card,'.camp-postcate'))form.fields.cate=val(card,'.camp-postcate');
    if(window.PC_CustomerGroup){const result=PC_CustomerGroup.validate();if(!result.ok)throw Error(result.msg);Object.assign(form.fields,PC_CustomerGroup.value());}
    form.buttons=all(card,'.pos-button-block').map(block=>{
      const isNew=block.dataset.editNew==='1';
      const original=form.buttons.find(b=>b.id===block.dataset.editId)|| (isNew?{id:block.dataset.editId,isNew:true,items:[],netPrice:0,discount:0,discountUnit:'CUR',kitchen:'',couponType:'Normal',attachment:''}:null);if(!original)throw Error('ไม่พบการอ้างอิงปุ่มเดิม');
      const b={...original,shortName:val(block,'.btn-sn'),kitchen:q(block,'.btn-kitchen')?val(block,'.btn-kitchen'):original.kitchen,minAmount:val(block,'.min-val')||0};
      if(isNew){
        b.codeAllocation={};
        for(const name of ['promotion','itemset']){
          const mode=q(block,'.promotion-edit-code-'+name+'-mode');if(!mode)continue;
          const code=val(block,'.promotion-edit-code-'+name).trim().toUpperCase();
          if(mode.value==='manual'&&!code)throw Error('กรุณากรอก '+(name==='promotion'?'Code Promotion':'Code Item Set')+' ของปุ่ม '+b.shortName);
          if(mode.value==='manual'&&window.PC_API?.checkCode){
            const type=name==='itemset'?'itemset':({Coupon:'coupon',BillDiscountProposal:'bill',VoucherProposal:'voucher'}[form.form]||(val(block,'.btn-promo-type')==='Item Coupon'||form.fields.cate==='E-Voucher'?'coupon':'promo'));
            const result=PC_API.checkCode(type,code);if(result.status==='dup')throw Error(result.message);
          }
          b.codeAllocation[name]={mode:mode.value,...(mode.value==='manual'?{code}: {})};
        }
      }
      if(form.form==='Proposal')b.promoType=val(block,'.btn-promo-type')||original.promoType||'Item Set';
      if(['Coupon','Proposal','BillDiscountProposal','VoucherProposal'].includes(form.form)&&window.PC_CustomerGroup?.couponValue)Object.assign(b,PC_CustomerGroup.couponValue(block));
      const checked=q(block,'input[name^="couponType"]:checked,input[name^="voucherType"]:checked,input[name^="type-"]:checked,.coupon-type:checked');if(checked)b.couponType=checked.value;
      const file=q(block,'input[type=file]')?.files?.[0];if(file)b.fileSelection={name:file.name,size:file.size,lastModified:file.lastModified};
      b.netPrice=form.form==='Proposal'?val(block,'.btn-net'):(original.netPrice===''?0:original.netPrice);b.discount=val(block,'.btn-disc-input,.btn-disc-val')||original.discount;b.discountUnit=val(block,'.btn-disc-unit')||original.discountUnit;
      b.items=all(block,'.item-body tr').map(tr=>{
        const old=original.items.find(it=>it.id===tr.dataset.editRowId)||{};
        const item={...old,id:tr.dataset.editRowId||'',itemCode:val(tr,'.row-ic'),itemNameEN:val(tr,'.row-search-input,.row-search,.row-in')||old.itemNameEN,qty:q(tr,'.row-qty')?val(tr,'.row-qty'):(old.qty||1),gross:q(tr,'.row-op')?val(tr,'.row-op'):(old.gross||0)};
        if(item.itemCode!==old.itemCode){const master=(window.masterData||[]).find(it=>String(it.itemCode)===String(item.itemCode));if(master)item.itemNameTH=master.itemNameTH||master.itemNameEN||'';}
        if(q(tr,'.row-mode'))item.selectionMode=val(tr,'.row-mode');if(q(tr,'.row-catecode'))item.catCode=val(tr,'.row-catecode');
        if(form.form==='Coupon')item.selectionMode=val(tr,'.row-scope')==='CATE'?'CATE':'ITEM';
        if(form.form==='Coupon')item.couponGroupMode=!!q(block,'.btn-group-mode')?.checked;
        if(q(tr,'.row-ssmin'))item.chooseMin=val(tr,'.row-ssmin');if(q(tr,'.row-ssmax'))item.chooseMax=val(tr,'.row-ssmax');
        if(form.form==='Coupon'){const net=val(tr,'.row-net');item.netPrice=net===''?'':String(Number(net)*Number(item.qty));item.discount=net===''?'':String(Number(item.gross)-Number(net));}
        return item;
      });return b;
    });
    form.editReason=document.getElementById('promotionEditReason')?.value||'';
    M().applyRevision(active.original,form,{...active,editId:'validation-only',validateOnly:true});return form;
  }
  async function save(){
    if(active&&!active.saving&&M().policy(active.original,active.actor,active.month).requiresReason){
      const reason=document.getElementById('promotionEditReason');
      if(reason&&!reason.value.trim()){
        reason.classList.add('is-invalid');reason.setAttribute('aria-invalid','true');reason.setAttribute('aria-describedby','promotionEditReasonError promotionEditReasonHelp');
        reason.scrollIntoView({block:'center'});reason.focus({preventScroll:true});return;
      }
    }
    if(!active||active.saving)return;let form;try{form=collect();M().applyRevision(active.original,form,{...active,editId:'validation-only'});}catch(e){
      await Swal.fire({title:'ตรวจสอบข้อมูล',text:e.message,icon:'warning',returnFocus:false});
      if(/เหตุผล/.test(e.message||'')){const reason=document.getElementById('promotionEditReason');if(reason){reason.scrollIntoView({block:'center'});reason.focus({preventScroll:true});}}
      return;
    }
    const ask=await Swal.fire({title:'ยืนยันบันทึกการแก้ไขรายการนี้?',text:M().policy(active.original,active.actor,active.month).requiresReason?'บันทึกแล้วจะส่งกลับให้ IT ดำเนินการแก้ไข และให้ OP ตรวจซ้ำ โดยคงรหัสเดิม':'ข้อมูลจะอัปเดตในรายการเดิม ไม่สร้างงานใหม่',icon:'question',showCancelButton:true,confirmButtonText:'บันทึกการแก้ไข',cancelButtonText:'แก้ไขต่อ'});if(!ask.isConfirmed||!active)return;
    const context=active;context.saving=true;const button=document.getElementById('mainSubmitBtn');if(button)button.disabled=true;
    try{
      for(const [i,block] of all(context.mounted,'.pos-button-block').entries()){
        const file=q(block,'input[type=file]')?.files?.[0];if(!file)continue;
        if(file.size>2500000)throw Error('ไฟล์แนบใหญ่เกินไป กรุณาใช้ไฟล์ขนาดเล็กกว่า 2.5 MB');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('อ่านไฟล์แนบไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่'));reader.readAsDataURL(file);});
        form.buttons[i].fileData={fileName:file.name,mimeType:file.type,base64:data};delete form.buttons[i].fileSelection;
      }
      if(JSON.stringify(form).length>1900000)throw Error('ข้อมูลรวมไฟล์แนบใหญ่เกินไป กรุณาลดขนาดไฟล์แล้วลองใหม่ ข้อมูลในฟอร์มยังอยู่');
      const receipt=await PC_CLOUD.saveCampaignEdit(context,form);context.dirty=false;context.saved=true;
      // Refresh failure cannot invalidate an already durable edit receipt.
      try{await PC_CLOUD.pull({force:true});}catch(e){context.cacheWarning=String(e.message||e);}
      await Swal.fire('บันทึกการแก้ไขสำเร็จ',context.cacheWarning?'Cloud ยืนยันแล้ว แต่รีโหลดหน้าจอไม่สำเร็จ กรุณารีเฟรชเพื่อดูข้อมูลล่าสุด':'ข้อมูลรายการเดิมและประวัติการแก้ไขได้รับการบันทึกบน Cloud แล้ว','success');
      if(window.PC_CoProEmailUI?.notifyEdit)await window.PC_CoProEmailUI.notifyEdit(context,receipt);
      clear();window.loadPage('Campaign_Tracking',document.getElementById('nav-Campaign_Tracking'));
    }catch(e){await Swal.fire('ยังบันทึกการแก้ไขไม่สำเร็จ',e.message||String(e),'error');}
    finally{context.saving=false;if(button&&button.isConnected)button.disabled=false;}
  }
  window.PC_PromotionEdit={open,current:()=>active,clear,mount,collect,save,cancel,switchForm,moveButton,removeButton};
})();
