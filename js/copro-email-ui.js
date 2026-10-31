(function(window){
  'use strict';
  const en=()=>window.PC_LANG==='EN',word=(th,english)=>en()?english:th;
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function mailDetailsHtml(text){
    const label=/^(หัวข้อ|Subject|To|CC|ชื่อแคมเปญ|วันที่เริ่ม - วันที่สิ้นสุด|วันที่สิ้นสุดเดิม → ใหม่|สถานะ|เหตุผลการยกเลิก|Type Promotion|Code Promotion|ผลตรวจสอบโค้ด|หมายเหตุ|ชื่อปุ่ม|รายละเอียดโปรฯ|เงื่อนไข|ข้อความเพิ่มเติม \/ Additional message|ไฟล์แนบ|แจ้งโดย|ดำเนินการโดย \(IT\))\s*:/;
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
  async function eventAsk(job,title,detail){
    try{if(client()?.capabilities){const caps=await client().capabilities();if(!caps.coproEnabled)return null;}}catch(_){return null;}
    if(!await window.PC_SendMail.ask(title,job.campaign,detail)){
      try{await window.PC_SendMail.decline(job);}catch(e){await Swal.fire({icon:'error',title:'บันทึกงานแล้ว แต่สถานะไม่ส่งเมลยังบันทึกไม่ได้',text:e.message});}
      return false;
    }
    try{await window.PC_SendMail.open([job]);return 'page';}
    catch(e){await Swal.fire({icon:'error',title:'บันทึกงานแล้ว แต่ยังเปิดหน้าส่งเมลไม่ได้',text:String(e.message||e)});return null;}
  }
  const helpers={mailDetailsHtml,addresses,conversationRecipients,notFoundHtml,NOT_FOUND_TEXT};
  window.PC_CoProEmailUI={
    helpers,
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
    /* แจ้งแก้ไข / ขยาย / ลด / ยกเลิก: ถาม ส่ง/ไม่ส่ง → ส่ง = เปิดหน้า "ส่งเมลโปรโมชั่น" · คืนค่า 'page' เมื่อเปิดหน้าแล้ว */
    async notifyEdit(context,receipt){
      return eventAsk({kind:'edit',campaign:context.campaign,month:context.month,editId:receipt.editId,returnPage:'Campaign_Tracking'},'ส่งเมลแจ้งการแก้ไขโปรโมชั่นหรือไม่?','');
    },
    async notifyChange(change){
      if(!change?.changeId||!change.campaign)return {mailStatus:'unavailable'};
      const status=String(change.changeStatus||'').toUpperCase(),label=status==='CANCELLED'?'การยกเลิกโปรโมชั่น':status==='REDUCED'?'การลดระยะเวลาโปรโมชั่น':'การขยายระยะเวลาโปรโมชั่น';
      const r=await eventAsk({kind:'change',campaign:change.campaign,changeId:change.changeId,changeStatus:status,detail:change.detail||'',returnPage:'Campaign_Tracking'},'ส่งเมลแจ้ง'+label+'หรือไม่?',change.detail||'');
      return {mailStatus:r==='page'?'page':r===false?'not_sent':'unavailable'};
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
