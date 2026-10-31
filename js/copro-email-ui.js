(function(window){
  'use strict';
  const en=()=>window.PC_LANG==='EN',word=(th,english)=>en()?english:th;
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const mailDialogStyle=`<style>
    .pc-mail-popup{padding:0!important;border-radius:16px!important;color:#243b2d!important;max-width:calc(100vw - 24px)!important;overflow:hidden}
    .pc-mail-popup .swal2-title{text-align:left;padding:24px 28px 16px!important;font-size:24px!important;line-height:1.4;color:#145c32;border-bottom:1px solid #dce4df}
    .pc-mail-popup .swal2-html-container{margin:0!important;padding:20px 28px!important;text-align:left;font-size:15px!important;line-height:1.65;font-weight:400;color:#243b2d;max-height:65vh;overflow:auto}
    .pc-mail-popup label{display:block;font-size:14px;font-weight:700;margin:16px 0 6px}
    .pc-mail-popup input,.pc-mail-popup textarea,.pc-mail-popup select{font:inherit!important;font-weight:400!important;border:1px solid #b9cabe!important;border-radius:8px!important;padding:10px 12px!important;background:#fff;min-height:44px;max-width:100%;box-sizing:border-box}
    .pc-mail-popup input::placeholder{color:#637369}
    .pc-mail-popup textarea{min-height:72px;resize:vertical}
    .pc-mail-popup :is(input,textarea,select,button):focus-visible{outline:3px solid #d3a710!important;outline-offset:2px}
    .pc-mail-popup .small{font-size:13px;line-height:1.6;color:#526258;font-weight:400;margin:8px 0 14px}
    .pc-mail-popup .btn{min-height:44px;padding:9px 16px;font-size:14px;border-radius:8px;font-weight:600}
    .pc-mail-popup .btn-outline-success{color:#155e35;border-color:#92b39d;background:#fff}
    .pc-mail-popup .btn-outline-success:hover{background:#edf7ef}
    .pc-mail-popup .btn-success{background:#1b6a3c;border-color:#1b6a3c;color:#fff}
    .pc-mail-popup .swal2-actions{margin:0!important;padding:16px 24px!important;width:100%;border-top:1px solid #dce4df;background:#f6f9f7;gap:10px;justify-content:flex-end;box-sizing:border-box}
    .pc-mail-popup .swal2-actions button{margin:0!important;min-height:44px;border-radius:8px;font-size:15px;padding:10px 20px}
    .pc-mail-popup .swal2-confirm{background:#1b6a3c!important;color:#fff}
    .pc-mail-popup .swal2-cancel{background:#fff!important;color:#344c3c!important;border:1px solid #bdcfc3!important}
    .pc-mail-popup #coproSelected:not(:empty){padding:12px 16px;background:#edf7ef;border:1px solid #92b39d;color:#155e35;font-size:14px;margin:14px 0}
    .pc-mail-popup #coproFound{max-height:300px;overflow:auto}
    .pc-mail-popup .pc-mail-result{border:1px solid #dce4df;border-radius:10px;padding:16px;margin:12px 0;background:#fff}
    .pc-mail-popup .pc-mail-result:has([aria-pressed="true"]){border-color:#247b43;background:#f2faf4}
    .pc-mail-popup .pc-mail-result strong{display:block;font-size:16px;margin-bottom:4px;color:#173d27;overflow-wrap:anywhere}
    .pc-mail-popup .pc-mail-result p{font-size:13px;color:#526258;overflow-wrap:anywhere;white-space:pre-line;margin:0 0 12px}
    .pc-mail-popup pre{background:#f6f9f7;border:1px solid #e0e8e2;padding:18px;border-radius:10px;font-size:14px!important;line-height:1.8;max-width:100%;margin-bottom:0}
    .pc-mail-popup pre strong{color:#173d27;font-weight:700}
    .pc-mail-popup .pc-mail-sender{margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid #dce4df;font-size:14px;overflow-wrap:anywhere}
    .pc-mail-popup .pc-mail-sender span{display:block;color:#526258;font-size:13px}
    .pc-mail-popup .pc-recipient-more{margin:8px 0 20px}
    .pc-mail-popup .pc-recipient-more summary{cursor:pointer;color:#155e35;font-size:14px;padding:8px 0;min-height:44px;box-sizing:border-box}
    .pc-mail-popup summary:focus-visible{outline:3px solid #d3a710;outline-offset:2px}
    .pc-mail-steps{font-size:12px;color:#526258;margin:0 0 18px;letter-spacing:.02em}
    .pc-mail-compose{width:1120px!important;max-height:calc(100dvh - 32px);display:flex!important;flex-direction:column}
    .pc-mail-compose .swal2-title{flex:none}
    .pc-mail-compose .swal2-html-container{max-height:none;min-height:0;flex:1;overflow:auto}
    .pc-mail-compose .swal2-actions{flex:none}
    .pc-mail-compose #coproApproved{display:none}
    .pc-compose-grid{display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,1fr);gap:32px;align-items:start}
    .pc-compose-message{border-left:1px solid #dce4df;padding-left:28px}
    .pc-compose-message h3{font-size:16px;margin:0 0 12px;font-weight:700;color:#145c32}
    .pc-mail-compose .pc-compose-intro{margin:0 0 20px;color:#526258;font-size:14px}
    @media(max-width:760px){.pc-compose-grid{grid-template-columns:1fr;gap:24px}.pc-compose-message{padding-left:0;border-left:0;border-top:1px solid #dce4df;padding-top:20px}.pc-mail-compose{max-height:calc(100dvh - 16px)}}
    @media(max-width:600px){.pc-mail-popup .swal2-title{font-size:20px!important;padding:18px!important}.pc-mail-popup .swal2-html-container{padding:16px!important;max-height:63vh}.pc-mail-popup .swal2-actions{padding:12px!important}.pc-mail-popup .swal2-actions button{flex:1;padding:10px}.pc-mail-popup .d-flex input{min-width:0}.pc-mail-popup pre{padding:12px}}
  </style>`;
  function mailDetailsHtml(text){
    const label=/^(หัวข้อ|Subject|To|CC|ชื่อแคมเปญ|วันที่เริ่ม - วันที่สิ้นสุด|วันที่สิ้นสุดเดิม → ใหม่|สถานะ|เหตุผลการยกเลิก|Type Promotion|Code Promotion|ผลตรวจสอบโค้ด|หมายเหตุ|ชื่อปุ่ม|รายละเอียดโปรฯ|เงื่อนไข|ข้อความเพิ่มเติม \/ Additional message|ไฟล์แนบ)\s*:/;
    return String(text||'').split('\n').map(line=>{const match=line.match(label);return match?'<strong>'+esc(match[0])+'</strong>'+esc(line.slice(match[0].length)):esc(line);}).join('\n');
  }
  const addresses=value=>String(value||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  function conversationRecipients(item){
    const seen=new Set(['it@rocks-foods.com']),result={to:[],cc:[]};
    for(const field of ['to','cc'])for(const match of String(item[field]||'').matchAll(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/ig)){
      const address=match[0].toLowerCase();
      if(!seen.has(address)){seen.add(address);result[field].push(address);}
    }
    return result;
  }
  const client=()=>window.PC_CoProEmail;
  function error(error){return Swal.fire({icon:'error',title:word('ยังดำเนินการอีเมลไม่ได้','Email not completed'),text:String(error?.message||error)});}
  function recipientAddControls(id,label){
    return '<details class="pc-recipient-more"><summary>เพิ่มผู้รับ '+label+'</summary><div class="d-flex gap-2 my-2"><input type="email" id="'+id+'Add" class="form-control" aria-label="อีเมลที่จะเพิ่มใน '+label+'" placeholder="อีเมลผู้รับเพิ่มเติม"><button type="button" id="'+id+'Button" class="btn btn-outline-success" style="white-space:nowrap">เพิ่ม '+label+'</button></div><p class="small">เพิ่มผู้รับในช่อง '+label+' ได้หลายคน คั่นด้วย , เช่น name1@example.com, name2@example.com</p></details>';

  }
  function bindRecipientAdd(id){
    const input=document.getElementById(id+'Add'),button=document.getElementById(id+'Button'),target=document.getElementById(id);
    const add=()=>{
      input.value=input.value.trim();input.required=true;
      if(!input.reportValidity())return;
      const values=addresses(target.value),address=input.value.toLowerCase();
      if(!values.some(value=>value.toLowerCase()===address))values.push(address);
      target.value=values.join(', ');input.value='';input.required=false;input.focus();
    };
    button.addEventListener('click',add);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add();}});
  }
  /* ค้นลูปไม่เจอ: ระบบค้นได้เฉพาะในกล่องเมลผู้ส่งกลาง → บอกสาเหตุที่พบบ่อยและทางเลือกให้ชัด */
  const NOT_FOUND_TEXT='ไม่พบเมลหัวข้อนี้ในกล่องเมล it@rocks-foods.com';
  function notFoundHtml(query){
    return '<div class="alert alert-warning text-start mb-2" role="alert"><strong>'+esc(NOT_FOUND_TEXT)+'</strong>'+
      '<p class="mb-1 mt-2">ระบบค้นหาลูปได้เฉพาะเมลที่อยู่ในกล่องเมล <b>it@rocks-foods.com</b> เท่านั้น สาเหตุที่พบบ่อย:</p><ul class="mb-1">'+
      '<li>ลูปเดิม<b>ไม่ได้ใส่ it@rocks-foods.com</b> ใน To หรือ CC จึงไม่มีเมลนี้ในกล่องเมลของระบบ</li>'+
      '<li>หัวข้อที่วางไม่ตรงกับเมลจริง (ลองวางเฉพาะคำสำคัญ เช่น ชื่อแคมเปญ)</li></ul>'+
      '<p class="mb-0">ทางแก้: ตอบกลับลูปเดิมจากเมลของคุณโดย <b>CC it@rocks-foods.com</b> 1 ครั้ง แล้วค้นหาใหม่ หรือกดปุ่ม <b>ส่งเมลใหม่แทน</b> ด้านล่าง</p>'+
      (query?'<p class="small text-muted mb-0 mt-1">คำที่ค้นหา: '+esc(query)+'</p>':'')+'</div>';
  }
  async function approveConversation(mode){
    let selected=null, generation=0;
    const result=await Swal.fire({title:'ค้นหาลูปเมลของโปรฯ',width:760,customClass:{popup:'pc-mail-popup'},
      html:mailDialogStyle+'<div style="text-align:left"><p class="pc-mail-steps">ค้นหาอีเมล → เลือกลูป → ตรวจผู้รับ</p><label for="coproFindSubject">หัวข้ออีเมลเดิมที่ต้องการตอบกลับ</label><input id="coproFindSubject" class="form-control" maxlength="200" aria-describedby="coproFindHelp" placeholder="คัดลอกหัวข้อจากอีเมลเดิมมาวางที่นี่"><p id="coproFindHelp" class="small mt-2">วางหัวข้อเมลเดิม กด “ค้นหาอีเมล” แล้วกด “เลือกลูปนี้” ระบบจะเติม To / CC ให้แก้ไขได้</p><button type="button" id="coproFind" class="btn btn-outline-success my-2">ค้นหาอีเมล</button><div id="coproFound" role="status"></div><p id="coproSelected"></p><label for="coproNewTo">To — ผู้รับที่ต้องการส่ง</label><textarea id="coproNewTo" class="form-control"></textarea>'+recipientAddControls('coproNewTo','To')+'<label for="coproNewCc">CC — เว้นว่างได้</label><textarea id="coproNewCc" class="form-control"></textarea>'+'<button type="button" id="coproRestoreCc" class="btn btn-outline-success my-2">ใช้ CC จากลูปเดิม</button>'+recipientAddControls('coproNewCc','CC')+'<p class="small">ตรวจผู้รับก่อนทำต่อ คุณจะได้ตรวจตัวอย่างเมลอีกครั้งก่อนส่ง</p></div>',
      showCancelButton:true,showDenyButton:true,confirmButtonText:'ใช้ลูปนี้และทำต่อ',denyButtonText:'ส่งเมลใหม่แทน',denyButtonColor:'#1b5e20',cancelButtonText:'กลับไปแก้ข้อมูล',showLoaderOnConfirm:true,
      didOpen(){
        document.getElementById('coproFindSubject').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();document.getElementById('coproFind').click();}});
        document.getElementById('coproRestoreCc').addEventListener('click',()=>{if(selected)document.getElementById('coproNewCc').value=conversationRecipients(selected).cc.join(', ');});
        bindRecipientAdd('coproNewTo');bindRecipientAdd('coproNewCc');
        document.getElementById('coproFind').addEventListener('click',async()=>{
          const query=document.getElementById('coproFindSubject').value.trim(),results=document.getElementById('coproFound'),n=++generation;
          selected=null;document.getElementById('coproSelected').textContent='';results.replaceChildren();
          if(!query){results.textContent='กรุณากรอกหัวข้อเมล';return;}
          results.textContent='กำลังค้นหา…';
          try{
            const found=await client().request('threads/search?q='+encodeURIComponent(query)+'&mode='+encodeURIComponent(mode),{interactive:true});
            if(n!==generation||!results.isConnected)return;results.replaceChildren();
            for(const item of found.items){
              const card=document.createElement('div');card.className='pc-mail-result';const subject=document.createElement('strong');subject.textContent=item.subject;
              const detail=document.createElement('p');detail.className='mb-2';detail.textContent=[item.from,item.date,'To: '+item.to,'CC: '+item.cc].filter(Boolean).join('\n');
              const button=document.createElement('button');button.type='button';button.className='btn btn-outline-success';button.textContent='เลือกลูปนี้';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','เลือกลูป '+item.subject);
              button.addEventListener('click',()=>{
                results.querySelectorAll('button').forEach(other=>{other.textContent='เลือกลูปนี้';other.setAttribute('aria-pressed','false');other.className='btn btn-outline-success';});
                button.textContent='✓ เลือกแล้ว';button.setAttribute('aria-pressed','true');button.className='btn btn-success';
                selected=item;document.getElementById('coproSelected').textContent='เลือกลูป: '+item.subject;
                const recipients=conversationRecipients(item);
                document.getElementById('coproNewTo').value=recipients.to.join(', ');
                document.getElementById('coproNewCc').value=recipients.cc.join(', ');
              });card.append(subject,detail,button);results.append(card);
            }
            if(!found.items.length)results.innerHTML=notFoundHtml(query);
          }catch(e){if(n===generation&&results.isConnected)results.textContent=String(e.message||e);}
        });
      },
      async preConfirm(){
        try{
          if(!selected)throw Error('กรุณาค้นหาและเลือกเมลในลูปเดิม');
          const recipients={to:addresses(document.getElementById('coproNewTo').value),cc:addresses(document.getElementById('coproNewCc').value)};
          if(!recipients.to.length)throw Error('กรุณาระบุผู้รับ To');
          const caps=await client().capabilities(),context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext();
          if(!context.identity?.tenantId||!context.identity?.objectId)throw Error('กรุณาเชื่อมบัญชีผู้ส่งอีกครั้ง');
          return await client().request('threads',{method:'POST',body:{mode,messageId:selected.messageId,recipients,audience:[context.identity]},interactive:true});
        }catch(e){Swal.showValidationMessage(String(e.message||e));return false;}
      }
    });
    generation++;return result.isConfirmed?result.value:result.isDenied?{switchToNew:true}:null;
  }
  /* ทุกเมลไม่บังคับ: ถามแบบเดียวกับตอนแจ้งโปรฯ — ตอบกลับลูปเดิม / ส่งเมลใหม่ / ไม่ส่งเมล (+ ข้อความเพิ่มเติม) */
  async function chooseDelivery(title,campaign,detail){
    const r=await Swal.fire({icon:'question',title,
      html:'<div style="font-size:.9rem;color:#48505a;line-height:1.6"><b style="color:#1a1d20">'+esc(campaign)+'</b>'+(detail?'<br>'+esc(detail):'')+'<br>ส่งจาก Potato Promotion Mail (it@rocks-foods.com) · ตรวจรายละเอียดก่อนยืนยันส่งทุกครั้ง</div><div style="margin-top:8px;padding:8px 10px;background:#fff8e1;border:1px solid #f3dd9b;border-radius:8px;font-size:.82rem;color:#5d4a00;text-align:left"><i class="fas fa-circle-info"></i> <b>ตอบกลับลูปเดิม</b> ได้เฉพาะลูปที่มี <b>it@rocks-foods.com</b> อยู่ใน To หรือ CC · ถ้าไม่มี ให้เลือก <b>ส่งเมลใหม่</b></div>',
      input:'textarea',inputLabel:'ข้อความเพิ่มเติมถึงผู้รับ (เว้นว่างได้)',inputAttributes:{maxlength:4000},returnInputValueOnDeny:true,
      showCancelButton:true,showDenyButton:true,allowOutsideClick:false,allowEscapeKey:false,
      confirmButtonText:'<i class="fas fa-reply"></i> ตอบกลับลูปเดิม',denyButtonText:'<i class="fas fa-envelope"></i> ส่งเมลใหม่',
      cancelButtonText:'ไม่ส่งเมล',confirmButtonColor:'#2e934a',denyButtonColor:'#1b5e20',cancelButtonColor:'#9aa0a6'});
    return {delivery:r.isConfirmed?'reply':r.isDenied?'new':'none',message:typeof r.value==='string'?r.value.trim():''};
  }
  /* ส่งเมลใหม่: สร้างลูปใหม่ (หัวข้อ แจ้งรายละเอียด <แคมเปญ>) พร้อมผู้รับที่ระบุ · server ตรวจสิทธิ์และผู้รับเอง */
  async function newLoop(campaignKey,month){
    const campaigns=(await client().list()).filter(c=>c.key===campaignKey&&(!month||c.month===month));
    if(!campaigns.length)throw Error('โปรฯ นี้ไม่ได้ลงทะเบียนกับระบบอีเมลตอนแจ้งโปรฯ จึงส่งเมลจากระบบไม่ได้');
    const form=await Swal.fire({title:'ส่งเมลใหม่ — ระบุผู้รับ',customClass:{popup:'pc-mail-popup'},width:640,
      html:mailDialogStyle+'<div style="text-align:left"><p class="small">หัวข้อเมล: แจ้งรายละเอียด '+esc(decodeURIComponent(campaignKey.slice(10)))+' · เมลถัดไปของโปรฯ นี้ (รวมเมลจาก IT) จะตอบกลับในเมลใหม่นี้</p><label for="coproNewLoopTo">To — ผู้รับ</label><textarea id="coproNewLoopTo" class="form-control" rows="2"></textarea><label for="coproNewLoopCc">CC — เว้นว่างได้</label><textarea id="coproNewLoopCc" class="form-control" rows="2"></textarea><p class="small">ใส่ได้หลายอีเมล คั่นด้วย , เช่น name1@example.com, name2@example.com</p></div>',
      showCancelButton:true,confirmButtonText:'ใช้ผู้รับนี้',cancelButtonText:'กลับ',allowOutsideClick:false,confirmButtonColor:'#1b5e20',showLoaderOnConfirm:true,
      async preConfirm(){
        const to=addresses(document.getElementById('coproNewLoopTo').value),cc=addresses(document.getElementById('coproNewLoopCc').value);
        if(!to.length){Swal.showValidationMessage('กรุณาระบุผู้รับ To');return false;}
        try{
          const caps=await client().capabilities(),context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext();
          return await client().request('threads',{method:'POST',body:{mode:'production',newMessage:true,campaignId:campaigns[0].id,recipients:{to,cc},audience:[context.identity]},interactive:true});
        }catch(e){Swal.showValidationMessage(String(e.message||e));return false;}
      }});
    return form.isConfirmed?form.value:null;
  }
  /* เมลแจ้งเหตุการณ์หลังบันทึกงานแล้ว (แก้ไข / ขยาย / ลด / ยกเลิก): เลือกลูป → ตรวจตัวอย่าง → ยืนยัน
     ไม่ส่ง = บันทึกสถานะ "ไม่ส่ง" · ส่งไม่สำเร็จไม่กระทบงานที่บันทึกแล้ว */
  async function eventMail(o){
    const decline=async()=>{
      try{if(window.PC_CLOUD?.saveMailDecision)await window.PC_CLOUD.saveMailDecision(o.campaign,o.decisionKind,o.decisionId,'not_sent');}
      catch(e){await Swal.fire({icon:'error',title:'บันทึกงานแล้ว แต่สถานะไม่ส่งเมลยังบันทึกไม่ได้',text:e.message});}
      return {mailStatus:'not_sent'};
    };
    try{if(client()?.capabilities){const caps=await client().capabilities();if(!caps.coproEnabled)return {mailStatus:'unavailable'};}}catch(_){return {mailStatus:'unavailable'};}
    const choice=await chooseDelivery(o.title,o.campaign,o.detail);
    if(choice.delivery==='none')return decline();
    try{
      if(window.PC_EmailAuth?.ownerSession&&(await client().capabilities()).authMode==='gmail_owner')await window.PC_EmailAuth.ownerSession({interactive:true});
      let policy=null;
      const pick=async()=>{const selected=await approveConversation('production');if(selected?.switchToNew)return newLoop(o.campaignKey,o.month);return selected;};
      if(choice.delivery==='new'){policy=await newLoop(o.campaignKey,o.month);if(!policy)return decline();}
      while(true){
        const body={...o.body,additionalMessage:choice.message,...(policy?{policyId:policy.id,policyVersion:policy.version,recipients:policy.recipients}:{})};
        Swal.fire({title:'กำลังเตรียมเมลจากข้อมูลล่าสุด…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
        let preview;
        try{preview=await client().request(o.preview,{method:'POST',body,interactive:true});}
        catch(e){
          // ยังไม่มีลูปผูกไว้ → ให้ค้นหาลูปเดิม (หรือส่งเมลใหม่) แทนการล้ม
          if(!policy&&e.code==='email_revision_loop_missing'){policy=await pick();if(!policy)return decline();continue;}
          throw e;
        }
        const text=['หัวข้อ: '+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text].join('\n\n');
        const confirm=await Swal.fire({title:o.reviewTitle,customClass:{popup:'pc-mail-popup'},width:740,allowOutsideClick:false,
          html:mailDialogStyle+'<p class="pc-compose-intro">'+esc(preview.newMessage?'ส่งเป็นเมลใหม่':'ตอบกลับในลูปเมลเดิม')+(preview.rebind?' · เมลถัดไปของโปรฯ นี้จะใช้ลูปนี้':'')+'</p><pre style="text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font:inherit;font-weight:400">'+mailDetailsHtml(text)+'</pre>',
          showCancelButton:true,showDenyButton:!preview.newMessage,confirmButtonText:'ยืนยันส่งเมล',denyButtonText:'ค้นหาลูปอื่น',denyButtonColor:'#1b5e20',cancelButtonText:'ไม่ส่ง',confirmButtonColor:'#1b5e20'});
        if(confirm.isDenied){const other=await pick();if(other)policy=other;continue;}
        if(!confirm.isConfirmed)return decline();
        Swal.fire({title:'กำลังบันทึกคำขอส่งเมล…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
        const result=await client().request(o.commit,{method:'POST',body:{...body,previewHash:preview.previewHash,confirmed:true}});
        await Swal.fire({icon:'success',title:result.mailStatus==='accepted'?'Gmail รับเมลแล้ว':'บันทึกคำขอส่งเมลแล้ว',text:'ส่งจาก it@rocks-foods.com · รายการนี้ไม่ถูกส่งซ้ำ'});
        return result;
      }
    }catch(e){
      await Swal.fire({icon:'error',title:'บันทึกงานแล้ว แต่ยังส่งเมลไม่ได้',text:String(e.message||e)});
      return {mailStatus:'failed',error:String(e.message||e)};
    }
  }
  window.PC_CoProEmailUI={
    async mountHistory(root,entries,options={}){
      const kinds={submitted:'แจ้งโปรฯ',promotion_edited:'แจ้งแก้ไข',it_interface_complete:'Interface',promotion_changed:'แจ้งขยาย/ลด/ยกเลิก',it_done:'IT แจ้งขึ้นปุ่ม'};
      const column=kind=>/^promotion_(extended|reduced|cancelled)$/.test(kind)?'promotion_changed':kind;
      const labels={not_recorded:'ไม่ได้ส่งเมล',none:'-',unknown:'ยังตรวจสถานะไม่ได้',unselected:'ยังไม่เลือก',not_sent:'ไม่ส่ง',queued:'รอส่ง',retry:'รอส่ง · กำลังลองใหม่',sending:'รอส่ง · กำลังส่ง',accepted:'ส่งสำเร็จ',failed:'ส่งไม่สำเร็จ',held:'ส่งไม่สำเร็จ',needs_verification:'ต้องตรวจผลส่งก่อนส่งซ้ำ',cancelled:'ยกเลิกการส่ง',waiting:'-',interface_partial:'-',interface_done:'Interfaced'};
      root.textContent='กำลังอ่านสถานะเมล…';
      try{
        const results=await Promise.allSettled([window.PC_CLOUD.readMailHistory?window.PC_CLOUD.readMailHistory():client().request('copro/mail-history'),window.PC_CLOUD.readCloudKey('pc_mail_decisions::'+encodeURIComponent(localStorage.getItem('pc_userName')||''))]);
        if(!root.isConnected)return;
        const events=(results[0].status==='fulfilled'?results[0].value.items:[]).map(e=>({...e,kind:column(e.kind)})),decision=results[1].status==='fulfilled'&&results[1].value?Object.values(JSON.parse(results[1].value.value)):[];
        const rows=events.filter(e=>!(e.status==='unselected'&&decision.some(d=>d.campaign===e.campaign&&d.kind===e.kind)));
        for(const d of decision)if(events.some(e=>e.campaign===d.campaign)&&!events.some(e=>e.campaign===d.campaign&&e.kind===d.kind&&(d.revisionId?String(e.eventKey||'').endsWith(':'+d.revisionId):e.status!=='unselected')))rows.push(d);
        const campaigns=new Set(rows.map(e=>e.campaign));
        for(const campaign of campaigns)for(const kind of Object.keys(kinds))if(!rows.some(e=>e.campaign===campaign&&e.kind===kind))rows.push({campaign,kind,status:results[0].status==='rejected'?'unknown':kind==='it_interface_complete'?'waiting':kind==='submitted'?'not_recorded':'none'});
        const reason={approval_or_source_changed:'ข้อมูลโปรฯ หรือสิทธิ์เปลี่ยนหลังยืนยัน',approval_or_target_changed:'ลูปเมลหรือสิทธิ์เปลี่ยน',connection_unavailable:'บัญชี Gmail ยังไม่พร้อม',provider_rejected:'Gmail ปฏิเสธการส่ง',provider_rate_limited:'Gmail จำกัดการส่งชั่วคราว',provider_outcome_unknown:'ยังยืนยันผลตอบกลับจาก Gmail ไม่ได้',lease_expired:'ระบบไม่ได้รับผลส่งภายในเวลาที่กำหนด',acknowledgement_not_saved:'บันทึกผลตอบกลับ Gmail ไม่สำเร็จ'};
        const time=r=>{const n=typeof r.at==='number'?r.at:Date.parse(r.at);return Number.isFinite(n)?n:0;};
        const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
        const grouped=Array.from(campaigns,campaign=>{
          const latest={};
          for(const r of rows.filter(r=>r.campaign===campaign))if(!latest[r.kind]||time(r)>time(latest[r.kind]))latest[r.kind]=r;
          const events=Object.values(latest),at=Math.max(0,...events.map(time));
          const errors=events.filter(r=>r.error).map(r=>(kinds[r.kind]||r.kind)+': '+(reason[r.error]||r.error));
          if(options.date&&(!at||day(at)!==options.date))return {at,html:''};
          return {at,html:'<tr><td>'+esc(campaign)+'</td>'+Object.keys(kinds).map(kind=>'<td>'+esc(kind==='it_interface_complete'?(latest[kind]?.interfaceStatus==='interface_done'||latest[kind]?.status==='interface_done'?'✓ Interfaced':'✕ Interface (ยังไม่เสร็จ)'):(labels[latest[kind]?.status]||latest[kind]?.status||'ยังตรวจสถานะไม่ได้'))+'</td>').join('')+'<td>'+esc(at?new Date(at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'—')+'</td><td>'+esc(errors.join(' · ')||'—')+'</td></tr>'};
        });
        root.innerHTML=(results[0].status==='rejected'?'<p role="alert">ยังอ่านประวัติส่งเมลจาก Cloud ไม่ได้: '+esc(results[0].reason.message)+'. รายการที่ไม่มีผลยืนยันจะไม่แสดงว่าส่งสำเร็จ</p>':'')+(results[1].status==='rejected'?'<p role="alert">ยังอ่านการเลือกไม่ส่งจาก Cloud ไม่ได้</p>':'')+'<div class="sl-table-wrap"><table><thead><tr><th>แคมเปญ</th>'+Object.values(kinds).map(kind=>'<th>'+esc(kind)+'</th>').join('')+'<th>เวลาล่าสุด</th><th>สาเหตุ</th></tr></thead><tbody>'+(grouped.sort((a,b)=>b.at-a.at).map(r=>r.html).join('')||'<tr><td colspan="'+(Object.keys(kinds).length+3)+'">ไม่พบรายการในวันที่เลือก กดดูทั้งหมดเพื่อดูประวัติ</td></tr>')+'</tbody></table></div>';

      }catch(e){root.textContent='อ่านสถานะเมลไม่สำเร็จ: '+e.message;}
    },
    async notifyEdit(context,receipt){
      const key='promo::c::'+encodeURIComponent(context.campaign);
      const result=await eventMail({campaign:context.campaign,campaignKey:key,month:context.month,title:'ส่งเมลแจ้งการแก้ไขโปรโมชั่นหรือไม่?',reviewTitle:'ตรวจเมลแจ้งแก้ไขโปรโมชั่น',
        preview:'copro/revision/preview',commit:'copro/revision',body:{campaignKey:key,month:context.month,editId:receipt.editId},decisionKind:'promotion_edited',decisionId:receipt.editId});
      return ['queued','accepted','sending','retry'].includes(result?.mailStatus);
    },
    /* หลังบันทึกขยาย / ลด / ยกเลิก สำเร็จบน Cloud: change.changeId มาจากการบันทึกเดียวกัน */
    async notifyChange(change){
      if(!change?.changeId||!change.campaign)return {mailStatus:'unavailable'};
      const status=String(change.changeStatus||'').toUpperCase(),label=status==='CANCELLED'?'การยกเลิกโปรโมชั่น':status==='REDUCED'?'การลดระยะเวลาโปรโมชั่น':'การขยายระยะเวลาโปรโมชั่น',key='promo::c::'+encodeURIComponent(change.campaign);
      return eventMail({campaign:change.campaign,campaignKey:key,title:'ส่งเมลแจ้ง'+label+'หรือไม่?',detail:change.detail||'',reviewTitle:'ตรวจเมลแจ้ง'+label,
        preview:'copro/change/preview',commit:'copro/change',body:{campaignKey:key,changeId:change.changeId},decisionKind:'promotion_changed',decisionId:change.changeId});
    },
    async save(record,options={}){
      if(window.PC_EmailAuth?.ownerSession&&(await client().capabilities()).authMode==='gmail_owner')await window.PC_EmailAuth.ownerSession({interactive:true});
      if(record.id)throw Error(word('รายการ CoPromo ที่บันทึกไว้แล้ว ส่งเมลซ้ำจากตรงนี้ไม่ได้','A saved Co-Promotion record cannot be emailed again from here'));
      let campaigns=(await client().list()).filter(c=>c.key==='promo::c::'+encodeURIComponent(record.campaign));
      if(!campaigns.length){
        const caps=await client().capabilities();
        if(caps.authMode!=='gmail_owner'||!window.PC_CLOUD?.readCloudKey)throw Error(word('ยังผูกงานกับบัญชีผู้ส่งไม่ได้ กรุณาเชื่อม Gmail ผู้ส่ง','Connect the sending Gmail account to link this job'));
        const key='promo::c::'+encodeURIComponent(record.campaign),source=await window.PC_CLOUD.readCloudKey(key);
        if(!source)throw Error('ไม่พบงานต้นฉบับบน Cloud');
        const block=JSON.parse(source.value),months=Object.keys(block.m||{}).filter(m=>block.m[m]?.length);
        if(!months.length)throw Error('ไม่พบปุ่มโปรฯ ต้นฉบับบน Cloud');
        const choice=await Swal.fire({icon:'question',title:'ผูกงานเดิมกับบัญชีผู้ส่ง',
          text:record.campaign+' — ใช้ข้อมูลล่าสุดที่บันทึกบน Cloud งาน IT ไม่ถูกสร้างซ้ำ ขั้นตอนนี้ยังไม่ส่งเมล',
          input:'select',inputOptions:Object.fromEntries(months.map(m=>[m,m])),showCancelButton:true,
          confirmButtonText:'ผูกงานและเลือกลูป',cancelButtonText:'กลับไปแก้ข้อมูล',confirmButtonColor:'#1b5e20'});
        if(!choice.isConfirmed)return null;
        await client().request('copro/adopt',{method:'POST',body:{campaignKey:key,month:choice.value,expectedSourceVersion:source.updatedAt,confirmed:true}});
        campaigns=(await client().list()).filter(c=>c.key===key);
        if(!campaigns.length)throw Error('ยังตรวจยืนยันการผูกงานไม่ได้ กรุณาเปิดงานเดิมอีกครั้ง ไม่ต้องส่งโปรฯ ซ้ำ');
      }
      // delivery ถูกเลือกมาแล้วตอนถามหลังบันทึก (reply/new) → ไม่ถามซ้ำ
      const delivery=options.delivery==='reply'||options.delivery==='new'?{isConfirmed:options.delivery==='reply',isDenied:options.delivery==='new'}:await Swal.fire({icon:'question',title:'ต้องการส่งอีเมลแบบไหน?',text:record.campaign,showDenyButton:true,showCancelButton:true,confirmButtonText:'ตอบกลับลูปเดิม',denyButtonText:'ส่งเมลใหม่',cancelButtonText:'กลับ',allowOutsideClick:false});
      if(!delivery.isConfirmed&&!delivery.isDenied)return null;
      let newMessage=delivery.isDenied;
      const newPolicy=()=>({id:'new',version:0,newMessage:true,subject:'แจ้งรายละเอียด '+record.campaign,recipients:{to:[],cc:[]},mode:'production'});
      let policies=newMessage?[newPolicy()]:(await client().request('threads')).items.filter(p=>!p.newMessage&&(!options.mode||p.mode===options.mode));
      if(!policies.length){
        const selected=await approveConversation(options.mode||'production');
        if(!selected)return null;
        if(selected.switchToNew){newMessage=true;policies=[newPolicy()];}else policies=[selected];
      }
      const fields=[['brand','พาร์ทเนอร์ / Brand'],['detail','รายละเอียด CoPromo (ไม่ส่งเมล) / Internal CoPromo details'],['billingEntity','บริษัทเรียกเก็บ / Billing entity'],['paymentType','ประเภทชำระ / Payment type'],['soNo','SO number'],['quota','Quota'],['priceIncVat','ราคารวม VAT / Price incl. VAT'],['paymentCondition','เงื่อนไขชำระ / Payment condition'],['remark','หมายเหตุภายใน (ไม่ส่งเมล) / Internal remark'],['periodText','ช่วงเวลา / Period'],['promoType','ประเภทโปรฯ / Promotion type']];
      const stored=await window.PC_CLOUD.readCloudKey('pc_co_promotions');
      const savedRecords=stored?JSON.parse(stored.value):[];
      const recordsFor=c=>options.notificationOnly?[]:c.buttons.map(b=>{
        const identity=JSON.parse(b.source_identity_json);
        const matches=r=>r.emailButtonId? r.emailButtonId===b.button_id : (r.cmposName||r.buttonName)===identity.shortName&&(!r.codePromotion||r.codePromotion===identity.codePromotion);
        const saved=matches(record)?record:savedRecords.find(r=>r.campaign===record.campaign&&matches(r))||(c.records||[]).find(matches)||{};
        const result={buttonId:b.button_id,cmposName:identity.shortName,buttonName:identity.shortName};
        for(const [key] of fields)result[key]=String(saved[key]??'').trim();
        return result;
      });
      let previewGeneration=0;
      const showDetails=async()=>{
        const generation=++previewGeneration,target=document.getElementById('coproMailDetails');
        target.textContent='กำลังโหลดรายละเอียดที่จะส่งเมล…';
        try{
          const campaign=campaigns.find(c=>c.id===document.getElementById('coproCampaign').value),policy=policies.find(p=>p.id===document.getElementById('coproLoop').value);
          if(policy.id==='new'){target.textContent='ระบุผู้รับ To แล้วกด “ตรวจตัวอย่างเมล” เพื่อดูรายละเอียดโปรฯ และไฟล์แนบก่อนยืนยันส่ง';return;}
          const preview=await client().request('copro/preview',{method:'POST',body:{notificationOnly:options.notificationOnly===true,campaignId:campaign.id,expectedVersion:campaign.version,policyId:policy.id,policyVersion:policy.version,recipients:policy.recipients,records:recordsFor(campaign)}});
          if(generation===previewGeneration&&target.isConnected)target.innerHTML=mailDetailsHtml(preview.text);
        }catch(e){if(generation===previewGeneration&&target.isConnected)target.textContent='โหลดรายละเอียดเมลไม่ได้: '+e.message;}
      };
      let previousDraft=null;
      while(true){
      let searchRequested=false;
      const choose=await Swal.fire({
        title:word(newMessage?'เตรียมส่งเมลใหม่':'เตรียมตอบกลับลูปอีเมล','Prepare promotion email'),customClass:{popup:'pc-mail-popup pc-mail-compose'},
        html:mailDialogStyle+'<div style="text-align:left"><p class="pc-compose-intro">เตรียมเมล → ตรวจรายละเอียด → ยืนยันส่ง</p><p class="pc-mail-sender">ผู้ส่ง <strong>Potato Promotion Mail</strong><span>it@rocks-foods.com</span></p><div class="pc-compose-grid"><div><p class="small">'+esc(word('รายละเอียดที่จะส่งเมลจากหน้าแจ้งโปรโมชั่น พร้อมไฟล์แนบต้นฉบับ','Email details from the promotion submission and original attachments.'))+'</p>'+
          '<label for="coproCampaign">'+esc(word('แคมเปญ / เดือน','Campaign / month'))+'</label><select id="coproCampaign" class="form-select mb-3">'+campaigns.map(c=>'<option value="'+esc(c.id)+'">'+esc(record.campaign+' / '+c.month)+'</option>').join('')+'</select>'+
          '<label for="coproLoop">'+esc(word(newMessage?'หัวข้อเมลใหม่':'ลูปอีเมลที่จะตอบกลับ',newMessage?'New email subject':'Email conversation to reply to'))+'</label><select id="coproLoop" class="form-select mb-3">'+policies.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.subject)+'</option>').join('')+'</select><button type="button" id="coproSearchLoop" class="btn btn-outline-success mb-3">ค้นหาลูปเมลจากหัวข้อเดิม</button><p class="small">เลือกลูปเดิม หรือค้นหาด้วยหัวข้ออีเมล แล้วตรวจรายชื่อ To / CC</p>'+
          '<p id="coproApproved" class="small"></p><label for="coproTestTo">To — '+esc(word('ผู้รับ','Recipients'))+'</label><textarea id="coproTestTo" class="form-control mb-3" rows="2" autocomplete="off"></textarea>'+recipientAddControls('coproTestTo','To')+''+
          '<label for="coproTestCc">CC — '+esc(word('เว้นว่างได้','Optional'))+'</label><textarea id="coproTestCc" class="form-control" rows="2" autocomplete="off"></textarea>'+recipientAddControls('coproTestCc','CC')+'<label for="coproAdditionalMessage" class="mt-3">ข้อความเพิ่มเติมถึงผู้รับ (เว้นว่างได้)</label><textarea id="coproAdditionalMessage" class="form-control" rows="3" maxlength="4000"></textarea></div><div class="pc-compose-message">'+'<h3>รายละเอียดที่จะส่งเมล</h3><pre id="coproMailDetails" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-weight:400"></pre></div></div></div>',
        showCancelButton:true,confirmButtonText:word('ตรวจตัวอย่างเมล','Preview email'),cancelButtonText:word('พักไว้ก่อน','Close'),allowOutsideClick:false,confirmButtonColor:'#1b5e20',width:1120,
        didOpen(){
          if(newMessage){document.querySelectorAll('.pc-mail-popup .small').forEach(el=>{if(el.textContent.includes('ลูปเดิม'))el.textContent=el.textContent.replaceAll('ในลูปเดิม','ตามรายชื่อที่ระบุ');});const search=document.getElementById('coproSearchLoop');search.hidden=true;if(search.nextElementSibling)search.nextElementSibling.hidden=true;document.getElementById('coproLoop').disabled=true;}
          bindRecipientAdd('coproTestTo');bindRecipientAdd('coproTestCc');
          const field=document.getElementById('coproLoop');
          if(previousDraft){document.getElementById('coproCampaign').value=previousDraft.campaignId;field.value=previousDraft.policyId;}
          const describe=()=>{const p=policies.find(x=>x.id===field.value);document.getElementById('coproApproved').textContent=word('ผู้รับเดิมของลูปนี้: ','Current recipients of this conversation: ')+[...p.recipients.to,...p.recipients.cc].join(', ');document.getElementById('coproTestTo').value=p.recipients.to.join(', ');document.getElementById('coproTestCc').value=p.recipients.cc.join(', ');};field.addEventListener('change',describe);describe();
          if(previousDraft){document.getElementById('coproTestTo').value=previousDraft.recipients.to.join(', ');document.getElementById('coproTestCc').value=previousDraft.recipients.cc.join(', ');document.getElementById('coproAdditionalMessage').value=previousDraft.additionalMessage;}
          document.getElementById('coproSearchLoop').addEventListener('click',()=>{
            previousDraft={campaignId:document.getElementById('coproCampaign').value,policyId:field.value,recipients:{to:addresses(document.getElementById('coproTestTo').value),cc:addresses(document.getElementById('coproTestCc').value)},additionalMessage:document.getElementById('coproAdditionalMessage').value};
            searchRequested=true;++previewGeneration;Swal.close();
          });
          document.getElementById('coproCampaign').addEventListener('change',showDetails);field.addEventListener('change',showDetails);showDetails();
        },
        showLoaderOnConfirm:true,
        async preConfirm(){
          const campaign=campaigns.find(c=>c.id===document.getElementById('coproCampaign').value),policy=policies.find(p=>p.id===document.getElementById('coproLoop').value),to=addresses(document.getElementById('coproTestTo').value),cc=addresses(document.getElementById('coproTestCc').value);
          if(!to.length){Swal.showValidationMessage(word('กรุณาระบุผู้รับ To','Enter at least one To recipient'));return false;}
          const records=recordsFor(campaign);
          let selectedPolicy=policy;
          if(policy.newMessage||JSON.stringify({to,cc})!==JSON.stringify(policy.recipients)){
            try{
              const caps=await client().capabilities(),context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext();
              selectedPolicy=await client().request('threads',{method:'POST',body:{mode:policy.mode,...(policy.newMessage?{newMessage:true,campaignId:campaign.id}:{policyId:policy.id}),recipients:{to,cc},audience:[context.identity]},interactive:true});
            }catch(e){Swal.showValidationMessage(String(e.message||e));return false;}
          }
          if(selectedPolicy!==policy){const index=policies.findIndex(p=>p.id===policy.id);policies[index]=selectedPolicy;}
          return {notificationOnly:options.notificationOnly===true,campaignId:campaign.id,expectedVersion:campaign.version,policyId:selectedPolicy.id,policyVersion:selectedPolicy.version,recipients:selectedPolicy.recipients,records,additionalMessage:document.getElementById('coproAdditionalMessage').value.trim()};
        }
      });
      if(searchRequested){
        const selected=await approveConversation(options.mode||'production');
        if(selected?.switchToNew){newMessage=true;policies=[newPolicy()];previousDraft.policyId='new';}
        else if(selected){policies=policies.filter(p=>p.id!==selected.id).concat(selected);previousDraft.policyId=selected.id;previousDraft.recipients=selected.recipients;}
        continue;
      }
      if(!choose.isConfirmed)return null;
      const draft=choose.value,preview=await client().request('copro/preview',{method:'POST',body:draft});
      previousDraft=draft;
      const rendered=[word('หัวข้อ: ','Subject: ')+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text].join('\n\n');
      const confirm=await Swal.fire({title:word('ตรวจสอบรายละเอียดก่อนส่งเมล','Review email before sending'),customClass:{popup:'pc-mail-popup'},html:mailDialogStyle+'<p class="pc-compose-intro">ตรวจผู้รับ รายละเอียด และไฟล์แนบ หากต้องการแก้ไข กด “กลับไปแก้ไข”</p><pre style="text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font:inherit;font-weight:400">'+mailDetailsHtml(rendered)+'</pre>',showCancelButton:true,confirmButtonText:word('ยืนยันส่งเมล','Confirm send'),cancelButtonText:word('กลับไปแก้ไข','Back to edit'),allowOutsideClick:false,allowEscapeKey:false,confirmButtonColor:'#1b5e20',width:740});
      if(!confirm.isConfirmed){if(confirm.dismiss==='cancel')continue;return null;}
      const result=await client().request('copro',{method:'POST',body:{...draft,previewHash:preview.previewHash,confirmed:true}});
      return {status:'success',...result};
      }
    },
    mountSettings(root){
      if(!root)return;
      root.innerHTML='<h2 data-th="อีเมล Co-Promotion" data-en="Co-Promotion email">อีเมล Co-Promotion</h2>'+
        '<p data-th="เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที" data-en="Choose the real conversation for each promotion and confirm recipients. Connecting does not send email.">เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที</p>'+
        '<p data-copro-note role="status" aria-live="polite"></p>'+
        '<details><summary data-th="ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ" data-en="Administrator: approve conversation and recipients">ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ</summary>'+
        '<label class="d-block mt-3" for="coproMode">ประเภทลูป / Conversation type</label><select id="coproMode" class="form-select"><option value="production">งานจริง / Production</option><option value="test">ทดสอบ / Test</option></select><label class="d-block mt-3" for="coproSearch">Subject / หัวข้อเมล</label><input id="coproSearch" class="form-control" placeholder="หัวข้อเมลของโปรฯ" maxlength="200"><button type="button" class="btn btn-outline-success my-3" data-copro-search>ค้นหาอีเมล / Search email</button><div data-copro-results></div>'+
        '<label class="d-block" for="coproPublishTo">To — ผู้รับ / Recipients</label><textarea id="coproPublishTo" class="form-control mb-3" rows="2"></textarea><label for="coproPublishCc">CC</label><textarea id="coproPublishCc" class="form-control mb-3" rows="2"></textarea>'+
        '<label for="coproAudience">Microsoft Object ID — ผู้แจ้งที่เห็นลูปนี้ (ว่าง = บัญชีนี้) / Allowed submitters (blank = this account)</label><textarea id="coproAudience" class="form-control mb-3" rows="2"></textarea>'+
        '<button type="button" class="btn btn-success" data-copro-publish disabled>อนุมัติลูปและผู้รับ / Approve conversation and recipients</button></details>'+
        '<button type="button" class="btn btn-outline-success my-3" data-copro-history>ตรวจคิวเมลของงาน / Check campaign mail status</button><div data-copro-history-list></div>';
      const get=name=>root.querySelector('[data-copro-'+name+']'),note=text=>{get('note').textContent=text;};let selected=null;
      root.querySelector('#coproMode').addEventListener('change',()=>{selected=null;get('publish').disabled=true;get('results').replaceChildren();});
      const action=(button,fn)=>button.addEventListener('click',async()=>{button.disabled=true;try{await fn();}catch(e){note(String(e.message||e));}finally{button.disabled=false;}});
      action(get('search'),async()=>{
        selected=null;get('publish').disabled=true;
        const result=await client().request('threads/search?q='+encodeURIComponent(root.querySelector('#coproSearch').value)+'&mode='+root.querySelector('#coproMode').value,{interactive:true});get('results').replaceChildren();
        for(const item of result.items){const b=document.createElement('button');b.type='button';b.className='btn btn-outline-success d-block mb-2';b.textContent=[item.subject,item.from,item.date,item.to,item.cc].join(' · ');b.style.whiteSpace='normal';b.addEventListener('click',()=>{selected={...item,mode:root.querySelector('#coproMode').value};get('publish').disabled=false;note(word('เลือกลูปแล้ว กรุณากรอก To/CC ที่ต้องการอนุมัติ','Conversation selected. Enter the To/CC to approve.'));});get('results').append(b);}
        if(!result.items.length){get('results').innerHTML=notFoundHtml(root.querySelector('#coproSearch').value.trim());note(word(NOT_FOUND_TEXT,'No matching conversation in it@rocks-foods.com'));}
      });
      action(get('publish'),async()=>{
        if(!selected)throw Error('Select a conversation');
        const caps=await client().capabilities();
        const context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext(),identity=context.identity;
        if(!identity?.tenantId||!identity?.objectId)throw Error('กรุณาเชื่อมบัญชีผู้ส่งอีกครั้ง / Verify email access again');
        const recipients={to:addresses(root.querySelector('#coproPublishTo').value),cc:addresses(root.querySelector('#coproPublishCc').value)},audienceInput=caps.authMode==='gmail_owner'?[]:addresses(root.querySelector('#coproAudience').value);
        const audience=audienceInput.length?audienceInput.map(objectId=>({tenantId:identity.tenantId,objectId})):[identity];
        if(!window.confirm(word('อนุมัติผู้รับเหล่านี้หรือไม่?\n','Approve these recipients?\n')+selected.subject+'\n'+selected.mode+'\n'+JSON.stringify(recipients)))return;
        await client().request('threads',{method:'POST',body:{mode:selected.mode,messageId:selected.messageId,recipients,audience},interactive:true});note(word('อนุมัติลูปแล้ว ยังไม่มีการส่งเมล','Conversation approved. No email has been sent.'));
      });
      action(get('history'),async()=>{
        const campaigns=await client().list();get('history-list').replaceChildren();
        for(const c of campaigns){const p=document.createElement('p');p.textContent=c.key.replace('promo::c::','')+' / '+c.month+' — '+c.history.map(h=>h.event_key.split(':').at(-1)+': '+h.status).join(' · ');get('history-list').append(p);}
        if(!campaigns.length)note(word('ยังไม่มีงานที่ส่งเมล','No emailed campaigns yet'));
      });
      client().capabilities().then(c=>{if(c.authMode==='gmail_owner'){root.querySelector('#coproAudience').hidden=true;root.querySelector('label[for="coproAudience"]').hidden=true;}note(c.coproEnabled?(c.sendingEnabled?word('ส่งเข้าลูปงานจริงหลังเชื่อม Gmail และยืนยันผู้รับ','Production email requires connected Gmail and confirmed recipients'):c.testSendingEnabled?word('ผู้ดูแลเปิดส่งทดสอบแล้ว','Test dispatch enabled by administrator'):word('สร้างคิวได้ แต่ผู้ดูแลยังปิดการส่งจริง','Queueing available; actual test dispatch is disabled')):word('ผู้ดูแลยังไม่เปิด Co-Promotion email หรือการตั้งค่ายังไม่ครบ','Co-Promotion email is disabled or setup is incomplete'));}).catch(e=>note(String(e.message||e)));
    }
  };
})(window);
