(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PC_EditResources=api;})(globalThis,function(){
 'use strict';
 async function prepareEditResources(db,input){
  const {original,next,form,editId,actor,now,month}=input,writes=[];
  const old=globalThis.PC_PromotionEditModel.toForm(original,month),kind=old.form;
  let counter,files,counterRecord,filesRecord,usedCodes;
  const codeClaims=[];
  async function loadUsedCodes(){
   if(usedCodes)return usedCodes;
   usedCodes=new Set([...(globalThis.PC_Email?.settlementCatalog?.codes||[]),...(globalThis.PC_EditCodeCatalog||[])].map(String));
   const records=await db.prepare("SELECT k,v FROM promo_store WHERE k LIKE 'promo::c::%' OR k IN ('promo::meta','pc_product_promo','pc_itemset_comp','pc_co_promotions','pc_code_requests','pc_member_cards','pc_member_coupons','pc_bill_discount_confirmed')").all();
   const keys=new Set(['code','button','itemCode','codePromotion','codeItemSet','itemPromotion','builderCode','prCode','promoCode']);
   function scan(v){if(!v||typeof v!=='object')return;Object.entries(v).forEach(([k,x])=>{if(keys.has(k)&&typeof x!=='object'&&x!=null)usedCodes.add(String(x).trim().toUpperCase());if(/^(?:107\d+|P\d+|IC\d+|BD\d+|VC\d+)$/.test(k))usedCodes.add(k);if(x&&typeof x==='object')scan(x);});}
   for(const rec of records.results||[]){const parsed=JSON.parse(rec.v);if(rec.k.startsWith('promo::c::'))scan({m:parsed.m});else if(rec.k==='promo::meta'){scan({npd:parsed.npd,npdProducts:parsed.npdProducts,recipeCustom:parsed.recipeCustom});}else scan(parsed);}
   return usedCodes;
  }
  const kept=new Set(form.buttons.filter(b=>b.isNew!==true).map(b=>b.id));
  const removedCodes=[...new Set(old.buttons.filter(b=>!kept.has(b.id)).flatMap(b=>b.items.flatMap(r=>[r.codePromotion,r.codeItemSet,r.itemPromotion])).filter(Boolean))];
  if(removedCodes.length){
    counterRecord=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind('pc_code_counter_v1').first();
    if(!counterRecord)throw Error('ไม่พบทะเบียนรหัส จึงยังลบปุ่มที่มีรหัสไม่ได้ กรุณาติดต่อ IT');
    counter=JSON.parse(counterRecord.v);
    if(!counter.types||!counter.reservations)throw Error('ทะเบียนรหัสไม่ถูกต้อง');
    for(const code of removedCodes){
      const normalized=String(code).trim().toUpperCase();
      let entry=Object.values(counter.reservations).find(e=>e&&String(e.code).toUpperCase()===normalized);
      const match=normalized.match(/^(IC|BD|VC|P|107)(\d+)$/),type=entry?.type||({IC:'coupon',BD:'bill',VC:'voucher',P:'promo','107':'itemset'}[match?.[1]]);
      if(!type)continue;
      const num=Number(entry?.num??match?.[2]);if(!Number.isSafeInteger(num))throw Error('ตรวจสอบรหัสปุ่มที่ลบไม่ได้');
      if(!entry){entry={code:normalized,type,num,status:'RESERVED',where:form.fields.campaign,field:'RetainedEdit|'+editId,by:actor,at:new Date(now).toISOString()};counter.reservations[type+'::'+normalized]=entry;}
      entry.retainForHistory=true;entry.retainedByEditId=editId;if(entry.status==='RELEASED')entry.status='RESERVED';
      const t=counter.types[type]||(counter.types[type]={cursor:num,seeded:false});t.cursor=Math.max(Number(t.cursor)||0,num);if(Array.isArray(t.freed))t.freed=t.freed.filter(n=>Number(n)!==num);
    }
  }
  for(const [order,button] of form.buttons.entries()){
   const rows=next.m[month].filter(r=>r.buttonOrder===order);
   const type=kind==='Coupon'?'coupon':kind==='BillDiscountProposal'?'bill':kind==='VoucherProposal'?'voucher':form.fields.cate==='E-Voucher'?'coupon':null;
   if(button.isNew===true&&(type||button.codeAllocation)){
    if(!counter){counterRecord=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind('pc_code_counter_v1').first();if(!counterRecord)throw Error('ไม่พบทะเบียนจองรหัสบน Cloud');counter=JSON.parse(counterRecord.v);}
    const choices=button.codeAllocation||{};
    const fields=[['promotion',type||'promo','codePromotion']];
    if(kind==='Proposal'&&button.codeAllocation)fields.push(['itemset','itemset','codeItemSet']);
    if(Object.keys(choices).some(k=>!fields.some(f=>f[0]===k)))throw Error('ประเภทช่องรหัสไม่ถูกต้อง');
    const occupied=button.codeAllocation?await loadUsedCodes():undefined;
    for(const [name,codeType,column] of fields){
     const choice=choices[name]||{mode:'auto'};
     if(!choice||!['auto','manual'].includes(choice.mode))throw Error('กรุณาเลือกใส่รหัสเองหรือให้ระบบจอง');
     const result=globalThis.PC_FormCodeAllocation.reserveFormCode(counter,{type:codeType,tag:'CampaignEdit',campaign:form.fields.campaign,shortName:button.shortName,fieldId:'CampaignEdit|'+editId+'|'+button.id+'|'+column,actor,at:new Date(now).toISOString(),...(choice.mode==='manual'?{manualCode:choice.code??''}:{}),usedCodes:occupied});
     occupied?.add(result.code);codeClaims.push(result.code);
     rows.forEach(r=>{r[column]=result.code;if(column==='codeItemSet')r.itemPromotion=result.code;});
    }
   }
   const upload=button.fileData;
   if(upload){
    if(typeof upload.base64!=='string'||!upload.base64.length||upload.base64.length>3600000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.base64)||typeof upload.fileName!=='string'||upload.fileName.length>255||/[\r\n\0]/.test(upload.fileName))throw Error('ไฟล์แนบไม่ถูกต้องหรือใหญ่เกินไป');
    if(!files){filesRecord=await db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?1').bind('pc_promo_files').first();files=filesRecord?JSON.parse(filesRecord.v):{};if(!files||typeof files!=='object'||Array.isArray(files))throw Error('ทะเบียนไฟล์แนบไม่ถูกต้อง');}
    const id='f'+crypto.randomUUID().replace(/-/g,'');files[id]={base64:upload.base64,name:upload.fileName,mime:String(upload.mimeType||'application/octet-stream').slice(0,150),savedAt:now};rows.forEach(r=>r.attachment='file:'+id);
   }
   if(button.isNew===true&&button.couponType==='Online'&&['Coupon','BillDiscountProposal','VoucherProposal'].includes(kind)&&!upload)throw Error('กรุณาแนบไฟล์สำหรับปุ่ม Online ใหม่');
  }
  if(counter)writes.push({key:'pc_code_counter_v1',value:JSON.stringify(counter),expectedUpdatedAt:counterRecord.updated_at});
  if(files)writes.push({key:'pc_promo_files',value:JSON.stringify(files),expectedUpdatedAt:filesRecord?filesRecord.updated_at:null});
  next.w=next.w.map(w=>w.month!==month?w:({...w,...(next.m[month]||[]).find(r=>r.editButtonId===w.editButtonId),itemCode:'',itemNameEN:'',qty:'',gross:w.gross}));
  return {next,writes,codeClaims};
 }
 return {prepareEditResources};
});
