(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PC_PromotionEditModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const text=v=>String(v==null?'':v).trim();
  const LOCK_MESSAGE='งานนี้ดำเนินการโดย IT แล้ว กรุณาติดต่อ IT เพื่อแก้ไขข้อมูล';
  // Existing login identifies editors by display name. This is the built-in
  // username `mkt`, not a role-wide MKT exception. Keep IT locks above it.
  const isTestEditor=actor=>text(actor)==='MKT Team';
  function policy(block,actor,month){
    const rows=block&&block.m&&block.m[month]||[];
    if(!rows.length)return {allowed:false,reason:'ไม่พบรายการเดือนที่เลือก'};
    if(rows.some(r=>/CANCELLED/i.test(String(r.changeStatus||'')+' '+String(r.itStatus||'')+' '+String(r.opStatus||''))))return {allowed:false,reason:'งานนี้ยกเลิกแล้ว ไม่สามารถแก้ไขผ่านฟอร์มนี้ได้'};
    const owners=new Set(rows.map(r=>text(r.submittedBy||r.reporter)));
    if(!isTestEditor(actor)&&(!text(actor)||owners.size!==1||!owners.has(text(actor))))return {allowed:false,reason:'แก้ไขได้เฉพาะรายการที่คุณเป็นผู้ส่งงาน กรุณาติดต่อ IT หากไม่พบผู้ส่งเดิม'};
    const requiresReason=rows.some(r=>r.revisionId||r.itSettlementSavedAt||r.itDoneDate||r.wentLive||r.codeBurned||r.rejectCount||r.opDoneDate||/^(COMPLETE|DONE)$/i.test(r.itStatus||'')||/^(CONFIRMED|REJECTED|APPROVED|COMPLETE)$/i.test(r.opStatus||''));
    return {allowed:true,reason:'',requiresReason};
  }
  const fields=['campaign','start','end','stores','saleMode','detail','mechanic','cate','cateRemark','customerGroup','crmTarget','crmTargetName','crmMappingRequired','crmMappingCode','crmMappingDetail'];
  function toForm(block,month){
    const rows=block&&block.m&&block.m[month];if(!Array.isArray(rows)||!rows.length)throw Error('ไม่พบข้อมูลเดิม');
    const f=rows[0],groups=new Map();
    const kind=text(f.submissionForm||f.promoType||f.typePromotion).toLowerCase();
    const form=/voucher|e.?coupon/.test(kind)?'VoucherProposal':/bill/.test(kind)?'BillDiscountProposal':/coupon/.test(kind)?'Coupon':'Proposal';
    const amount=v=>parseFloat(String(v??'').replace(/,/g,''))||0;
    rows.forEach((r,index)=>{
      const key=text(r.editButtonId)||text(r.shortName);
      const discountSource=form==='VoucherProposal'?(r.discountText||r.gross):(r.discountText||r.discount);
      if(!groups.has(key))groups.set(key,{id:text(r.editButtonId)||'b'+groups.size,shortName:r.shortName||'',kitchen:r.kitchen||'',netPrice:['BillDiscountProposal','VoucherProposal'].includes(form)?0:(r.netPrice??r.net??''),discount:amount(discountSource),discountUnit:r.couponDiscountUnit||r.discountUnit||(/%/.test(String(discountSource))?'PCT':'CUR'),minAmount:r.minAmount||0,couponType:r.codeChannel||r.proStatus||r.couponType||r.voucherType||(/online/i.test(r.promoType||'')?'Online':'Normal'),attachment:r.attachment||'',items:[]});
      groups.get(key).items.push({...clone(r),selectionMode:r.selectionMode||(/^ALL(?: ITEMS)?$/i.test(r.itemCode)?'ALL':r.catCode&&String(r.catCode)===String(r.itemCode)?'CATE':'ITEM'),id:'r'+index});
      if(form==='Coupon'||form==='Proposal'){groups.get(key).promoType=r.typePromotion==='Item Coupon'?'Item Coupon':'Item Set';groups.get(key).crmMappingCode=r.crmMappingCode||'';groups.get(key).crmMappingDetail=r.crmMappingDetail||'';}
    });
    // Older Coupon rows retained the discount per item, not its original unit.
    // Recover a common percentage only where different amounts prove it;
    // otherwise show the stored currency discount and preserve row Net values.
    if(form==='Coupon')groups.forEach(b=>{
      const first=b.items[0];
      if(first.couponDiscountValue!=null){b.discount=Number(first.couponDiscountValue);return;}
      const eligible=b.items.filter(r=>Number(r.gross)>0),ratios=eligible.map(r=>amount(r.discount)/Number(r.gross));
      if(eligible.length>1&&ratios.every(r=>Math.abs(r-ratios[0])<0.00001)&&eligible.some(r=>Math.abs(amount(r.discount)-amount(first.discount))>0.001)){b.discountUnit='PCT';b.discount=Number((ratios[0]*100).toFixed(4));}
    });
    return {form,month,fields:Object.fromEntries(fields.map(k=>[k,f[k]??''])),buttons:[...groups.values()]};
  }
  function number(v,label,integer){if(text(v)===''||!Number.isFinite(Number(v))||Number(v)<0||(integer&&!Number.isInteger(Number(v))))throw Error('กรุณากรอก '+label+' ให้ถูกต้อง');return Number(v);}
  function applyRevision(original,form,context){
    const p=policy(original,context.actor,context.month);if(!p.allowed)throw Error(p.reason);
    if(p.requiresReason&&!context.validateOnly&&!text(form&&form.editReason))throw Error('กรุณาระบุเหตุผลและรายละเอียดที่แก้ไข');
    if(text(form&&form.editReason).length>2000)throw Error('เหตุผลการแก้ไขต้องไม่เกิน 2,000 ตัวอักษร');
    if(!form||!form.fields||!Array.isArray(form.buttons)||!form.buttons.length)throw Error('ต้องมีปุ่มโปรโมชั่นอย่างน้อย 1 ปุ่ม');
    const old=toForm(original,context.month),byId=new Map(old.buttons.map(b=>[b.id,b]));
    const name=text(form.fields.campaign);if(!name)throw Error('กรุณาระบุชื่อแคมเปญ');
    ['detail','mechanic','stores','saleMode'].forEach(k=>{if(!text(form.fields[k]))throw Error('กรุณากรอกรายละเอียด เงื่อนไข สาขา และช่องทางขายให้ครบ');});
    ['start','end'].forEach(k=>{const date=text(form.fields[k]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('วันที่ไม่ถูกต้อง');});
    if(form.fields.end<form.fields.start)throw Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    const used=new Set(),ids=new Set(),out=[];
    for(const [order,b] of form.buttons.entries()){
      const isNew=b.isNew===true&&/^new:[a-zA-Z0-9_-]{8,80}$/.test(text(b.id));
      let prev=byId.get(b.id);if((!prev&&!isNew)||(prev&&b.isNew===true)||ids.has(b.id))throw Error('ข้อมูลอ้างอิงปุ่มไม่ตรงกับงานเดิม กรุณาเปิดใหม่');ids.add(b.id);
      if(b.isNew!=null&&typeof b.isNew!=='boolean')throw Error('ข้อมูลปุ่มใหม่ไม่ถูกต้อง');
      if(isNew){
        const template=old.buttons[0].items[0],base={};
        [...fields,'month','promoType','typePromotion','proposalKind','submissionForm','submittedBy','reporter','txnDate','submittedDate','submissionId','submissionBatchId','customerGroup'].forEach(k=>{if(template[k]!=null)base[k]=template[k];});
        Object.assign(base,{codePromotion:'',codeItemSet:'',itemPromotion:'',attachment:'',itStatus:'PENDING',opStatus:'WAITING',posReady:false,codeChannel:b.couponType||'Normal'});
        if(old.form==='Coupon')base.promoType=b.couponType==='Online'?'Item Coupon Online':'Item Coupon';
        if(old.form==='BillDiscountProposal')base.promoType=b.couponType==='Online'?'Bill Discount Online':'Bill Discount';
        if(old.form==='VoucherProposal')base.promoType=b.couponType==='Online'?'Voucher Online':'Voucher';
        prev={items:[base],shortName:'',discount:0,discountUnit:b.discountUnit,attachment:''};
      }else if(b.couponType!==prev.couponType)throw Error('การเปลี่ยนประเภทคูปองหรือช่องทางรหัสเดิม กรุณาติดต่อ IT');
      const sn=text(b.shortName);if(!sn||used.has(sn.toLowerCase()))throw Error('กรุณาระบุชื่อปุ่มที่ไม่ซ้ำกัน');used.add(sn.toLowerCase());
      if(old.form==='Proposal'&&(isNew||text(prev.kitchen))&&!text(b.kitchen))throw Error('กรุณากรอก Kitchen Name');
      if(!Array.isArray(b.items)||!b.items.length)throw Error('กรุณาระบุสินค้าในทุกปุ่ม');
      if(old.form==='Coupon'&&b.items.some(i=>i.couponGroupMode===true||i.selectionMode==='CATE')&&b.items.some(i=>i.couponGroupMode!==true&&i.selectionMode!=='CATE'))throw Error('ไม่สามารถผสมรูปแบบกลุ่มกับสินค้าที่คำนวณราคาในปุ่มเดียวกัน');
      if(old.form==='Coupon'&&b.items.some(i=>i.selectionMode==='CATE')&&b.items.some(i=>i.selectionMode!=='CATE'))throw Error('ไม่สามารถเลือกหมวดสินค้าและสินค้ารายตัวในปุ่มเดียวกัน');
      const priceForm=['Proposal','Coupon'].includes(old.form);
      const net=priceForm?number(b.netPrice,'ราคา Net',old.form==='Proposal'):0,gross=priceForm?b.items.reduce((s,it)=>s+(old.form==='Coupon'&&(it.couponGroupMode===true||it.selectionMode==='CATE')?0:number(it.gross,'ราคา',false)*number(it.qty,'จำนวน',false)),0):0;
      const seenRows=new Set();
      b.items.forEach((item,index)=>{
        const match=prev.items.find(r=>r.id===item.id);if(item.id&&(!match||seenRows.has(item.id)))throw Error('รายการสินค้าอ้างอิงไม่ถูกต้อง');if(item.id)seenRows.add(item.id);
        const base=clone(match||prev.items[0]);delete base.id;
        const code=text(item.itemCode);if(!code)throw Error('กรุณาเลือกสินค้าจากรายการ');
        const row={...base};
        fields.forEach(k=>{if(['Coupon','Proposal'].includes(old.form)&&['crmMappingCode','crmMappingDetail'].includes(k))return;if(k.startsWith('crmMapping')&&!Object.hasOwn(form.fields,k))return;if(form.fields[k]!==old.fields[k])row[k]=String(form.fields[k]??'');});
        if(old.form==='Proposal'){
          const type=b.promoType||prev.items[0].typePromotion||'Item Set';
          if(!['Item Set','Item Coupon'].includes(type))throw Error('Type Promotion ไม่ถูกต้อง');
          if(!isNew&&prev.promoType==='Item Coupon'&&type!=='Item Coupon')throw Error('เปลี่ยน Item Coupon กลับเป็น Item Set กรุณาเพิ่มปุ่มใหม่');
          if(isNew||type==='Item Coupon'){row.typePromotion=type;row.promoType=type;}
          if(type!=='Item Coupon'){row.crmMappingRequired='no';row.crmMappingCode='';row.crmMappingDetail='';}
        }
        if((['Coupon','BillDiscountProposal','VoucherProposal'].includes(old.form)||old.form==='Proposal'&&row.typePromotion==='Item Coupon')&&row.customerGroup==='crm'&&row.crmMappingRequired==='yes'){
          if(isNew&&!Object.hasOwn(b,'crmMappingCode'))throw Error('กรุณาระบุ Mapping Code ของคูปองใหม่: '+sn);
          row.crmMappingCode=text(Object.hasOwn(b,'crmMappingCode')?b.crmMappingCode:prev.items[0].crmMappingCode||form.fields.crmMappingCode);
          row.crmMappingDetail=text(Object.hasOwn(b,'crmMappingDetail')?b.crmMappingDetail:prev.items[0].crmMappingDetail||form.fields.crmMappingDetail);
          if(!row.crmMappingCode||row.crmMappingCode.length>200||row.crmMappingDetail.length>2000)throw Error('กรุณาระบุ Mapping Code ให้ครบทุกคูปอง: '+sn);
        }
        if(row.customerGroup!=='crm'||row.crmMappingRequired!=='yes'){row.crmMappingCode='';row.crmMappingDetail='';}
        row.campaign=name;row.shortName=sn;row.editButtonId=isNew?'edit:'+context.editId+':'+order:b.id;row.buttonOrder=order;row.editOriginalShortName=isNew?sn:(prev.items[0].editOriginalShortName||prev.shortName);row.kitchen=text(b.kitchen);row.itemCode=code;row.itemNameEN=text(item.itemNameEN);
        if(priceForm){row.qty=number(item.qty,'จำนวน',false);row.gross=old.form==='Coupon'&&(item.couponGroupMode===true||item.selectionMode==='CATE')?'':number(item.gross,'ราคา',false);if(row.qty<=0)throw Error('จำนวนสินค้าต้องมากกว่า 0');}
        else if(old.form==='BillDiscountProposal'){row.qty='All';row.gross='All';row.netPrice='';}
        else {row.qty=/^ALL(?: ITEMS)?$/i.test(code)?'All':number(item.qty,'จำนวน',false);if(row.qty!=='All'&&row.qty<=0)throw Error('จำนวนสินค้าต้องมากกว่า 0');row.netPrice='';}
        ['isSubset','chooseMin','chooseMax','selectionMode','catCode','cateCode','itemNameTH'].forEach(k=>{if(item[k]!=null)row[k]=item[k];});
        if(/^SS/i.test(code))row.isSubset='1';else if(code!==base.itemCode)row.isSubset='';
        if(/^SS/i.test(code)&&old.form==='Proposal'){const min=number(row.chooseMin===''||row.chooseMin==null?1:row.chooseMin,'จำนวนเลือกขั้นต่ำ',true),max=number(row.chooseMax===''||row.chooseMax==null?min:row.chooseMax,'จำนวนเลือกสูงสุด',true);if(max<min||max<1)throw Error('จำนวนเลือก Subset ไม่ถูกต้อง');}
        // Workflow metadata and codes always come from the original button.
        ['codePromotion','codeItemSet','itemPromotion','attachment','itStatus','opStatus','submissionId','submissionBatchId','submittedBy','reporter','txnDate','submittedDate'].forEach(k=>{if(prev.items[0][k]!=null)row[k]=prev.items[0][k];});
        row.minAmount=number(b.minAmount||0,'ยอดขั้นต่ำ',false);
        if(old.form==='Proposal'){row.netPrice=String(net);row.net=String(net);row.discount=index===0?String(gross-net):0;}
        else if(old.form==='Coupon'){const category=item.selectionMode==='CATE',grouped=category||item.couponGroupMode===true;if(category&&(!text(item.catCode||item.cateCode)||code!==text(item.catCode||item.cateCode)))throw Error('กรุณาเลือกหมวดสินค้า');row.couponGroupMode=grouped;row.netPrice=grouped?'':String(number(item.netPrice??item.net,'ราคา Net สินค้า',false));row.net=row.netPrice;row.discount=grouped?String(number(b.discount,'ส่วนลด',false))+(b.discountUnit==='PCT'?' %':' ฿'):(item.discount??row.discount);row.couponDiscountUnit=b.discountUnit;row.couponDiscountValue=number(b.discount,'ส่วนลด',false);}
        else {const discount=number(b.discount,'ส่วนลด',true);if(discount<=0)throw Error('ส่วนลดต้องมากกว่า 0');row.discountUnit=b.discountUnit;
          if(old.form==='VoucherProposal'){row.gross=discount===Number(prev.discount)&&b.discountUnit===prev.discountUnit?base.gross:discount+' '+(b.discountUnit==='PCT'?'%':'฿');row.discount='';}
          else {row.discountText=String(discount)+(b.discountUnit==='PCT'?'%':'');row.discount=row.discountText;}
        }
        row.editedBy=context.actor;row.editedAt=context.now||new Date().toISOString();row.editId=context.editId;
        out.push(row);
      });
    }
    const structural=[];
    form.buttons.forEach(b=>{const prev=byId.get(b.id);if(prev&&b.promoType&&b.promoType!==prev.promoType)structural.push('เปลี่ยน Type: '+prev.shortName+' → '+b.promoType);});
    old.buttons.filter(b=>!ids.has(b.id)).forEach(b=>structural.push('ลบปุ่ม: '+b.shortName));
    form.buttons.forEach((b,i)=>{if(b.isNew)structural.push('เพิ่มปุ่ม: '+b.shortName);else if(old.buttons.findIndex(p=>p.id===b.id)!==i)structural.push('เลื่อนลำดับปุ่ม: '+b.shortName);});
    form.buttons.filter(b=>b.fileData||b.fileSelection).forEach(b=>structural.push('ไฟล์แนบ: '+b.shortName));
    if(p.requiresReason){
      const changes=[...structural],labels={start:'วันที่เริ่ม',end:'วันที่สิ้นสุด',stores:'สาขา',saleMode:'ช่องทางขาย',detail:'รายละเอียดโปรโมชั่น',mechanic:'เงื่อนไข',cate:'หมวดสินค้า',cateRemark:'หมายเหตุ',customerGroup:'กลุ่มลูกค้า',crmTarget:'กลุ่ม CRM',crmTargetName:'ชื่อกลุ่ม CRM'};
      Object.assign(labels,{crmMappingRequired:'การตั้งค่า Mapping CRM',crmMappingCode:'รหัส Mapping CRM / Value Design',crmMappingDetail:'รายละเอียด Mapping สำหรับ IT'});
      fields.forEach(k=>{if(k.startsWith('crmMapping')&&!Object.hasOwn(form.fields,k))return;if(String(form.fields[k]??'')!==String(old.fields[k]??''))changes.push(labels[k]||k);});
      form.buttons.forEach(b=>{const prev=byId.get(b.id);if(!prev)return;if(['shortName','kitchen','netPrice','discount','discountUnit','minAmount'].some(k=>String(b[k]??'')!==String(prev[k]??'')))changes.push('ปุ่ม / ราคา: '+prev.shortName);if(['crmMappingCode','crmMappingDetail'].some(k=>Object.hasOwn(b,k)&&String(b[k]??'')!==String(prev[k]??'')))changes.push('Mapping CRM: '+prev.shortName);if(JSON.stringify(b.items.map(i=>[i.itemCode,i.qty,i.gross,i.netPrice,i.chooseMin,i.chooseMax]))!==JSON.stringify(prev.items.map(i=>[i.itemCode,i.qty,i.gross,i.netPrice,i.chooseMin,i.chooseMax])))changes.push('สินค้า / จำนวน: '+prev.shortName);});
      out.forEach(r=>Object.assign(r,{revisionPending:true,revisionReason:text(form.editReason),revisionRequestedBy:context.actor,revisionRequestedAt:context.now||new Date().toISOString(),revisionId:context.editId,revisionChanges:changes,itStatus:'PENDING',opStatus:'WAITING',changeStatus:'EDITED',itDoneDate:'',itSettlementSavedAt:'',opDoneDate:'',posReady:false,rejectReason:''}));
    }
    if(!p.requiresReason)out.forEach(r=>r.revisionChanges=structural);
    const next=clone(original);next.m[context.month]=out;
    if(name!==context.campaign)Object.values(next.m).flat().forEach(r=>r.campaign=name);
    next.w=[];
    Object.entries(next.m).forEach(([month,rows])=>{
      const groups=new Map();rows.forEach(r=>{const key=text(r.shortName);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
      groups.forEach(items=>next.w.push({...clone(items[0]),month,itemCode:'',itemNameEN:'',qty:'',gross:items.reduce((sum,r)=>sum+(Number(r.gross)||0)*(Number(r.qty)||1),0).toFixed(2)}));
    });
    next._ts=Date.now();return next;
  }
  return {policy,toForm,applyRevision,LOCK_MESSAGE,isTestEditor};
});
