(function(window){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner=()=>{const value=localStorage.getItem('pc_userName');if(!value)throw Error('กรุณาเข้าสู่ระบบก่อนบันทึกฉบับร่าง');return value;};
  const cloud=()=>{if(!window.PC_CLOUD?.readCloudKey||!window.PC_CLOUD?.saveCoPromoDrafts)throw Error('ระบบฉบับร่างยังไม่พร้อม กรุณาเปิดเว็บใหม่');return window.PC_CLOUD;};
  async function read(){const user=owner(),row=await cloud().readCloudKey('pc_copro_drafts::'+encodeURIComponent(user));const data=row?JSON.parse(row.value):{items:{}};if(!data.items||typeof data.items!=='object')throw Error('ข้อมูลฉบับร่างไม่ถูกต้อง');return {user,data,version:row?.updatedAt??null};}
  const fields=['brand','billingEntity','detail','paymentType','soNo','quota','priceIncVat','paymentCondition','remark','buttonName','cmposName','emailButtonId'];
  async function current(campaign){
    const rows=await cloud().readCampaignRows(campaign);
    if(!rows.length||rows.some(r=>r.changeStatus==='CANCELLED'))throw Error('โปรฯ นี้ถูกยกเลิกหรือไม่พบข้อมูลบน Cloud');
    return rows;
  }
  function batch(rows){const ids=[...new Set(rows.map(r=>r.submissionBatchId).filter(Boolean))];if(ids.length!==1)throw Error('ยังระบุงานต้นฉบับไม่ได้ กรุณาตรวจประวัติการแจ้งโปรฯ');return ids[0];}
  function pageFor(rows){return ({'Item Set':'Proposal','Coupon':'Coupon','Item Coupon':'Coupon','Bill Discount':'BillDiscountProposal','Voucher':'VoucherProposal'})[rows[0].submissionForm]||'CreatePromotion';}
  async function recordCoPromo(campaign,record={},mailStatus){
    const rows=await current(campaign),submissionId=batch(rows),user=owner();
    const store=await cloud().readCloudKey('pc_co_promotions'),items=store?JSON.parse(store.value):[];
    if(!Array.isArray(items))throw Error('ข้อมูล CoPromo ไม่ถูกต้อง');
    const seen=new Set();
    for(const row of rows){
      const identity=row.emailButtonId||row.shortName;if(seen.has(identity))continue;seen.add(identity);
      const old=items.find(r=>r.emailIntake&&r.campaign===campaign&&r.submissionId===submissionId&&
        (row.emailButtonId&&r.emailButtonId?r.emailButtonId===row.emailButtonId:r.cmposName===row.shortName));
      const selected=record.emailButtonId?record.emailButtonId===row.emailButtonId:(record.buttonName||record.cmposName)===row.shortName;
      const business={};if(selected)for(const field of fields)if(record[field]!==undefined)business[field]=String(record[field]);
      const now=new Date().toISOString(),item={...old,...business,
        id:old?.id||'COI'+crypto.randomUUID().replace(/-/g,''),emailIntake:true,campaign,submissionId,
        emailButtonId:row.emailButtonId||'',emailCampaignId:row.emailCampaignId||'',
        cmposName:row.shortName,buttonName:row.shortName,codePromotion:row.codePromotion||'',codeItemSet:row.codeItemSet||row.itemPromotion||'',
        type:'Co-Promotion',promoType:row.typePromotion||row.promoType||'',start:row.start||'',end:row.end||'',
        periodText:(row.start||'')+' → '+(row.end||''),detail:selected&&record.detail!==undefined?record.detail:old?.detail||row.detail||'',
        emailPending:mailStatus==='queued'?false:old?.emailPending!==false,
        mailStatus:mailStatus||old?.mailStatus||'not_queued',status:mailStatus==='queued'?'PENDING_INTERFACE':old?.status||'PENDING_EMAIL',
        interfaceSetup:old?.interfaceSetup||0,createdAt:old?.createdAt||now,createdBy:old?.createdBy||user,updatedAt:now,updatedBy:user};
      if(old)items[items.indexOf(old)]=item;else items.push(item);
    }
    await cloud().saveCoPromoRecords(JSON.stringify(items),store?.updatedAt??null);
    return items.filter(r=>r.emailIntake&&r.campaign===campaign&&r.submissionId===submissionId);
  }
  async function save(campaign,record,existing){
    const rows=await current(campaign),submissionId=batch(rows),state=await read();
    const id=JSON.stringify([campaign,submissionId]);const prior=state.data.items[id];
    if(existing&&existing.id!==id)throw Error('งานต้นฉบับเปลี่ยนไป ไม่สามารถทับฉบับร่างเดิมได้');
    if((prior?.revision||0)!==(existing?.revision||0))throw Error('มีฉบับร่างใหม่กว่า กรุณาเปิดจากงานค้างของฉันก่อนแก้ไข');
    const saved={};for(const field of fields)saved[field]=String(record[field]||'');
    const selected=(!record.emailButtonId&&!record.buttonName)?rows[0]:rows.find(r=>record.emailButtonId?r.emailButtonId===record.emailButtonId:r.shortName===record.buttonName);
    if(selected?.emailButtonId)saved.emailButtonId=selected.emailButtonId;
    const item={id,campaign,submissionId,sourcePage:existing?.sourcePage||pageFor(rows),record:saved,revision:(prior?.revision||0)+1,updatedAt:new Date().toISOString(),owner:state.user};
    state.data.items[id]=item;
    await cloud().saveCoPromoDrafts(state.user,JSON.stringify(state.data),state.version);
    return item;
  }
  async function remove(item){
    const state=await read(),prior=state.data.items[item.id];if(!prior)return;
    if(prior.revision!==item.revision)throw Error('ฉบับร่างถูกแก้จากอีกหน้าต่าง กรุณาตรวจงานค้าง');
    delete state.data.items[item.id];await cloud().saveCoPromoDrafts(state.user,JSON.stringify(state.data),state.version);
  }
  async function list(){
    const state=await read(),shared=await cloud().readCloudKey('pc_co_promotions'),rows=shared?JSON.parse(shared.value):[];
    if(!Array.isArray(rows))throw Error('ข้อมูล CoPromo ไม่ถูกต้อง');
    const key=r=>JSON.stringify([r.campaign,r.submissionId]);
    const completed=new Set(rows.filter(r=>r.emailIntake&&r.emailPending===false).map(key));
    const items=new Map(Object.values(state.data.items).filter(d=>!completed.has(key(d))).map(d=>[key(d),d]));
    for(const row of rows){
      if(!row.emailIntake||!row.emailPending||row.createdBy!==state.user||!row.submissionId||completed.has(key(row))||items.has(key(row)))continue;
      const record={...row};delete record.id;
      items.set(key(row),{id:key(row),source:'intake',campaign:row.campaign,submissionId:row.submissionId,record,updatedAt:row.updatedAt||row.createdAt||'',owner:state.user});
    }
    return [...items.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async function chooseSend(item){
    const choice=await Swal.fire({icon:'question',title:'ต้องการส่งอีเมลแจ้งโปรฯ นี้หรือไม่?',text:item.campaign,showCancelButton:true,confirmButtonText:'ส่งเมล',cancelButtonText:'ยังไม่ส่ง เก็บไว้ในงานค้าง',confirmButtonColor:'#2e934a'});
    if(!choice.isConfirmed)return null;
    return resume(item);
  }
  async function resume(item){
    const rows=await current(item.campaign);if(batch(rows)!==item.submissionId)throw Error('โปรฯ ต้นฉบับเปลี่ยนไป ไม่สามารถใช้ฉบับร่างนี้ส่งเมลได้');
    const outcome=await window.PC_CoPromo.openForm(item.campaign,item.record,{requireEmail:true,...(item.source==='intake'?{selection:item.record}:{draft:item}),cloudRows:rows});
    if(outcome===true){
      const next=await Swal.fire({icon:'success',title:'ส่งและบันทึกข้อมูลสำเร็จ',text:'อีเมลรายละเอียดอยู่ในคิวส่ง',showCancelButton:true,confirmButtonText:'ดูประวัติการแจ้งโปรฯ',cancelButtonText:'ทำงานต่อ',confirmButtonColor:'#2e934a'});
      const page=next.isConfirmed?'SubmissionLog':(item.sourcePage||pageFor(rows));window.loadPage(page,document.getElementById('nav-'+page));
    }
    return outcome;
  }
  async function mount(root){
    root.innerHTML='<p role="status">กำลังโหลดงานรอส่งเมลจาก Cloud…</p>';
    try{
      const items=await list();root.innerHTML=items.length?'':'<p class="text-muted">ไม่มีงาน CoPromo ที่ค้างไว้</p>';
      for(const item of items){
        const card=document.createElement('div');card.className='border rounded p-3 mb-3 bg-white';
        card.innerHTML='<strong>'+esc(item.campaign)+'</strong><div class="small text-muted my-2">รอส่งเมล · โปรฯ บันทึกให้ IT แล้ว<br>บันทึกล่าสุด '+esc(new Date(item.updatedAt).toLocaleString('th-TH'))+'</div><button type="button" class="btn btn-success">ทำต่อ</button><span role="alert" class="text-danger ms-3"></span>';
        const button=card.querySelector('button');button.onclick=async()=>{button.disabled=true;try{await chooseSend(item);if(root.isConnected)await mount(root);}catch(e){card.querySelector('[role="alert"]').textContent=e.message;}finally{button.disabled=false;}};
        root.appendChild(card);
      }
    }catch(e){root.textContent=e.message;}
  }
  window.PC_CoPromoDrafts={save,remove,list,resume,chooseSend,mount,current,recordCoPromo};
})(window);
