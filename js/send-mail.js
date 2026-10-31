/* หน้า "ส่งเมลโปรโมชั่น" (pages/SendMail.html) — แทนป๊อปอัปส่งเมลหลายชั้น
   บันทึกงาน → ถามสั้นๆ ว่าส่งเมลไหม → ถ้าส่ง เปิดหน้านี้: เลือกตอบกลับลูปเดิม / เมลใหม่ (ระบบหาลูปเดิมให้ก่อน ไม่เจอค่อยค้นด้วยหัวข้อ)
   → ผู้รับ To/CC → ข้อความเพิ่มเติม → ตัวอย่างเมลจริงจากข้อมูลเว็บ → ยืนยันส่ง
   งานที่ยังไม่ส่งเก็บบน Cloud (pc_mail_jobs::<ผู้ใช้>) ออกจากหน้าไปก่อนก็กลับมาทำต่อจาก "งานค้างของฉัน" ได้ */
(function(window){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const H=()=>window.PC_CoProEmailUI.helpers;
  const client=()=>window.PC_CoProEmail;
  const CURRENT='pc_mail_job_current';
  const KIND={submitted:'แจ้งโปรฯ ใหม่',copro:'Co-Promotion',edit:'แจ้งแก้ไขโปรฯ',change:'แจ้งขยาย / ลด / ยกเลิก'};
  const keyOf=campaign=>'promo::c::'+encodeURIComponent(campaign);

  /* ---------- งานรอส่งเมล (Cloud) ---------- */
  const owner=()=>{const v=localStorage.getItem('pc_userName');if(!v)throw Error('กรุณาเข้าสู่ระบบก่อนส่งเมล');return v;};
  async function readJobs(){
    const user=owner(),row=await window.PC_CLOUD.readCloudKey('pc_mail_jobs::'+encodeURIComponent(user));
    const data=row?JSON.parse(row.value):{items:{}};if(!data.items||typeof data.items!=='object')data.items={};
    return {user,data,version:row?row.updatedAt:null};
  }
  async function writeJobs(mutate){
    for(let attempt=0;attempt<2;attempt++){
      const state=await readJobs();mutate(state.data.items);
      try{await window.PC_CLOUD.saveMailJobs(state.user,JSON.stringify(state.data),state.version);return state.data.items;}
      catch(e){if(attempt)throw e;}
    }
  }
  async function listJobs(){const s=await readJobs();return Object.values(s.data.items).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));}
  const jobId=job=>job.kind+':'+job.campaign+':'+(job.editId||job.changeId||job.month||'');
  async function addJobs(jobs){
    const now=new Date().toISOString();
    await writeJobs(items=>jobs.forEach(j=>{const id=jobId(j);items[id]={...items[id],...j,id,createdAt:items[id]?.createdAt||now,updatedAt:now};}));
    return jobs.map(jobId);
  }
  const removeJob=id=>writeJobs(items=>{delete items[id];});

  /* เปิดหน้าส่งเมลสำหรับงานเหล่านี้ (งานแรกแสดงก่อน ที่เหลือรอในรายการ) */
  async function open(jobs){
    jobs=(jobs||[]).filter(Boolean);if(!jobs.length)return null;
    const ids=await addJobs(jobs);
    try{localStorage.setItem(CURRENT,ids[0]);}catch(e){}
    if(typeof window.loadPage==='function')window.loadPage('SendMail',document.getElementById('nav-SendMail'));
    return {mailPage:true,jobs:ids};
  }
  /* ถามสั้นๆ ก่อนเปิดหน้า: ส่ง / ไม่ส่ง (ลูปเดิมหรือเมลใหม่ เลือกในหน้าส่งเมล) */
  async function ask(title,campaign,detail){
    const r=await Swal.fire({icon:'question',title,
      html:'<div style="font-size:.9rem;color:#48505a;line-height:1.6"><b style="color:#1a1d20">'+esc(campaign)+'</b>'+(detail?'<br>'+esc(detail):'')+'<br>ส่งจาก Potato Promotion Mail (it@rocks-foods.com) · เลือกลูปเดิมหรือเมลใหม่ และตรวจรายละเอียดได้ในหน้าส่งเมล</div>',
      showCancelButton:true,allowOutsideClick:false,allowEscapeKey:false,confirmButtonText:'<i class="fas fa-envelope"></i> ส่งเมล',cancelButtonText:'ไม่ส่งเมล',confirmButtonColor:'#2e934a',cancelButtonColor:'#9aa0a6'});
    return r.isConfirmed;
  }
  /* เลือกไม่ส่ง = บันทึกสถานะ "ไม่ส่ง" ของงานนั้น */
  async function decline(job){
    if(job.kind==='copro'){await window.PC_CoPromoDrafts.recordCoPromo(job.campaign,{},'not_sent');return;}
    const kind={submitted:'submitted',edit:'promotion_edited',change:'promotion_changed'}[job.kind];
    if(window.PC_CLOUD?.saveMailDecision)await window.PC_CLOUD.saveMailDecision(job.campaign,kind,job.editId||job.changeId||'','not_sent');
  }

  /* ---------- หน้าส่งเมล ---------- */
  const STYLE='<style>'+
    '.sm-wrap{max-width:1180px;margin:auto;padding:20px 16px 40px;color:#243b2d}'+
    '.sm-head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:flex-end;justify-content:space-between;margin-bottom:16px}'+
    '.sm-head h2{margin:0 0 2px;font-size:1.4rem;color:#145c32}.sm-sub{color:#526258;font-size:.92rem}.sm-sub b{color:#1a1d20}'+
    '.sm-jobs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.sm-jobs button{border:1.5px solid #b9cabe;background:#fff;border-radius:999px;padding:5px 13px;font-size:.84rem;cursor:pointer}'+
    '.sm-jobs button[aria-current="true"]{background:#1b6a3c;border-color:#1b6a3c;color:#fff;font-weight:700}'+
    '.sm-grid{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(340px,1.1fr);gap:18px;align-items:start}'+
    '.sm-card{background:#fff;border:1px solid #dce4df;border-radius:14px;padding:18px 20px}'+
    '.sm-card h3{font-size:.98rem;font-weight:700;color:#145c32;margin:0 0 12px}'+
    '.sm-field{margin-top:14px}.sm-field>label,.sm-lbl{display:block;font-weight:700;font-size:.86rem;margin-bottom:6px}.sm-lbl small,.sm-field>label small{font-weight:400;color:#6b7a70}'+
    '.sm-card textarea,.sm-card input[type=search]{width:100%;border:1px solid #b9cabe;border-radius:8px;padding:9px 11px;font:inherit;min-height:42px;box-sizing:border-box;resize:vertical}'+
    '.sm-card textarea:focus,.sm-card input:focus{outline:2px solid #2e934a;outline-offset:1px;border-color:#2e934a}'+
    '.sm-seg{display:grid;grid-template-columns:1fr 1fr;border:1.5px solid #b9cabe;border-radius:10px;overflow:hidden}'+
    '.sm-seg button{border:0;background:#fff;padding:10px 8px;font:inherit;font-weight:600;color:#40524a;cursor:pointer;min-height:44px}.sm-seg button+button{border-left:1.5px solid #b9cabe}'+
    '.sm-seg button[aria-pressed="true"]{background:#1b6a3c;color:#fff}'+
    '.sm-note{margin-top:10px;font-size:.86rem;line-height:1.55;border-radius:10px;padding:10px 12px;background:#f4f7f5;color:#40524a}.sm-note.ok{background:#eef7f0}.sm-note.warn{background:#fff8e1;color:#6b5400}'+
    '.sm-link{border:0;background:none;padding:0;color:#1b6a3c;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}'+
    '.sm-result{border:1px solid #dce4df;border-radius:10px;padding:10px 12px;margin:8px 0}.sm-result p{white-space:pre-wrap;font-size:.8rem;color:#526258;margin:4px 0 8px}'+
    '.sm-preview{position:sticky;top:12px}.sm-state{font-size:.84rem;color:#526258;margin:-4px 0 10px;min-height:1.2em}.sm-state.err{color:#b02a37}'+
    '.sm-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:.88rem;margin:0 0 10px;padding:10px 12px;border-radius:10px;background:#f4f7f5}.sm-meta dt{color:#526258;font-weight:600}.sm-meta dd{margin:0;overflow-wrap:anywhere}'+
    '.sm-body{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.9rem;line-height:1.65;border:1px solid #dce4df;border-radius:10px;padding:14px;max-height:60vh;overflow:auto;margin:0;background:#fff}'+
    '.sm-body strong{color:#173d27}.sm-empty{color:#6b7a70;font-size:.9rem;padding:28px 12px;text-align:center;border:1px dashed #cdd8d0;border-radius:10px}'+
    '.sm-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;border-top:1px solid #dce4df;padding-top:16px;margin-top:18px}'+
    '.sm-actions button{min-height:44px;border-radius:9px;padding:9px 18px;font-weight:700;cursor:pointer}'+
    '.sm-btn{border:1.6px solid #b9cabe;background:#fff;color:#243b2d}.sm-btn-go{border:none;background:#1b6a3c;color:#fff}.sm-btn-go:disabled{opacity:.45;cursor:not-allowed}'+
    '.sm-muted{color:#6b7a70;font-size:.82rem;margin:6px 0 0}'+
    '@media(max-width:860px){.sm-grid{grid-template-columns:1fr}.sm-preview{position:static}.sm-actions button{flex:1}}'+
    '</style>';

  /* ประเภทงาน → ชื่อที่แสดง และ subjectKind ที่ server ใช้ตั้งหัวข้อ "ส่งเมลใหม่" (ต้องตรงกับ registry.js) */
  const CHANGE={EXTENDED:'extended',REDUCED:'reduced',CANCELLED:'cancelled'};
  const subjectKind=job=>job.kind==='change'?(CHANGE[String(job.changeStatus||'').toUpperCase()]||'change'):job.kind;
  const SUBJECT={submitted:'แจ้งรายละเอียดโปร',copro:'แจ้งรายละเอียดโปร',edit:'แจ้งแก้ไขโปร',extended:'แจ้งขยายโปร',reduced:'แจ้งลดระยะเวลาโปร',cancelled:'แจ้งยกเลิกโปร',change:'แจ้งเปลี่ยนแปลงโปร'};
  const kindLabel=job=>job.kind==='change'?SUBJECT[subjectKind(job)]:(KIND[job.kind]||job.kind);
  const ERRORS={email_policy_changed:'ลูปเมลหรือผู้รับเปลี่ยนระหว่างเตรียมเมล กรุณาลองอีกครั้ง',email_unapproved_recipients:'ผู้รับไม่ตรงกับที่เตรียมไว้ กรุณาลองอีกครั้ง',email_source_changed:'ข้อมูลโปรฯ เปลี่ยนระหว่างเตรียมเมล กรุณาโหลดหน้านี้ใหม่',email_version_conflict:'งานนี้ส่งเมลไปแล้ว หรือข้อมูลเปลี่ยน กรุณาโหลดหน้านี้ใหม่',email_reconnect_required:'บัญชี Gmail ผู้ส่งกลางยังไม่พร้อม กรุณาแจ้ง IT',email_request_failed:'ระบบอีเมลทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'};
  const errText=e=>ERRORS[e?.code]||String(e?.message||e);
  const EMAIL=/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;

  async function identity(){
    const caps=await client().capabilities();
    const ctx=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession({interactive:true}):await window.PC_EmailMsalContext();
    if(!ctx?.identity?.tenantId||!ctx?.identity?.objectId)throw Error('กรุณาเข้าสู่ระบบ Microsoft อีกครั้งก่อนส่งเมล');
    return ctx.identity;
  }
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

  async function mount(root){
    root.innerHTML=STYLE+'<div class="sm-wrap"><p role="status">กำลังโหลดงานรอส่งเมล…</p></div>';
    const wrap=root.querySelector('.sm-wrap');
    let jobs;
    try{jobs=await listJobs();}catch(e){wrap.innerHTML='<p role="alert">'+esc(e.message)+'</p>';return;}
    if(!jobs.length){
      wrap.innerHTML='<div class="sm-head"><h2><i class="fas fa-envelope me-2"></i>ส่งเมลโปรโมชั่น</h2></div><div class="sm-card"><p class="mb-2">ไม่มีงานรอส่งเมล</p><p class="sm-muted mb-0">งานที่เลือก "ส่งเมล" หลังบันทึก จะมาอยู่ที่หน้านี้</p></div>';
      return;
    }
    let cur=null;try{cur=localStorage.getItem(CURRENT);}catch(e){}
    const job=jobs.find(j=>j.id===cur)||jobs[0];
    try{localStorage.setItem(CURRENT,job.id);}catch(e){}
    renderJob(root,wrap,jobs,job);
  }

  function renderJob(root,wrap,jobs,job){
    const st={delivery:'reply',loop:null,found:null,search:null,policy:null,policyKey:'',preview:null,previewKey:'',campaign:null,busy:false,seq:0,timer:0};
    const newSubject=SUBJECT[subjectKind(job)]+' '+job.campaign;
    wrap.innerHTML=
      '<div class="sm-head"><div><h2><i class="fas fa-envelope me-2"></i>ส่งเมลโปรโมชั่น</h2><div class="sm-sub"><b>'+esc(job.campaign)+'</b> · '+esc(kindLabel(job))+(job.detail?' · '+esc(job.detail):'')+'</div></div>'+
      '<div class="sm-muted">ส่งจาก <b>it@rocks-foods.com</b> · ระบุชื่อคุณในเมลเป็นผู้แจ้ง</div></div>'+
      (jobs.length>1?'<div class="sm-jobs" aria-label="งานรอส่งเมล">'+jobs.map(j=>'<button type="button" data-job="'+esc(j.id)+'"'+(j.id===job.id?' aria-current="true"':'')+'>'+esc(j.campaign)+' · '+esc(kindLabel(j))+'</button>').join('')+'</div>':'')+
      '<div class="sm-grid"><div class="sm-card">'+
        '<span class="sm-lbl" id="smModeL">ส่งแบบ</span><div class="sm-seg" role="group" aria-labelledby="smModeL"><button type="button" data-mode="reply" aria-pressed="true">ตอบกลับลูปเดิม</button><button type="button" data-mode="new" aria-pressed="false">ส่งเมลใหม่</button></div>'+
        '<div id="smLoop" class="sm-note" role="status">กำลังหาลูปเมลเดิมของโปรฯ นี้…</div>'+
        '<div id="smSearch" hidden><div class="sm-field"><label for="smQ">ค้นหาลูปเดิมด้วยหัวข้อเมล <small>(ลูปที่มี it@rocks-foods.com ใน To/CC)</small></label><div style="display:flex;gap:8px"><input id="smQ" type="search" maxlength="200" placeholder="วางหัวข้อเมลเดิม หรือชื่อแคมเปญ"><button type="button" id="smFind" class="sm-btn" style="border-radius:8px;padding:0 16px;white-space:nowrap;min-height:42px">ค้นหา</button></div></div><div id="smResults" role="status"></div></div>'+
        '<div class="sm-field"><label for="smTo">ถึง (To)</label><textarea id="smTo" rows="1" placeholder="name@rocksgroup.com, ..."></textarea></div>'+
        '<div class="sm-field"><label for="smCc">สำเนา (CC) <small>· เว้นว่างได้</small></label><textarea id="smCc" rows="1"></textarea></div>'+
        '<div class="sm-field"><label for="smMsg">ข้อความเพิ่มเติม <small>· เว้นว่างได้</small></label><textarea id="smMsg" rows="3" maxlength="4000" placeholder="จะแสดงต่อจากรายละเอียดโปรฯ"></textarea></div>'+
        '<p class="sm-muted">คั่นหลายอีเมลด้วย , · ไม่ต้องใส่ it@rocks-foods.com</p>'+
      '</div><div class="sm-preview"><div class="sm-card"><h3><i class="fas fa-eye me-2"></i>ตรวจเมลก่อนส่ง</h3><div id="smState" class="sm-state" role="status" aria-live="polite"></div><div id="smPreview"></div></div></div></div>'+
      '<div class="sm-actions"><button type="button" class="sm-btn" id="smLater">พักไว้ก่อน</button><button type="button" class="sm-btn" id="smSkip">ไม่ส่งเมล</button><button type="button" class="sm-btn-go" id="smSend" disabled>ยืนยันส่งเมล</button></div>';
    const $=id=>wrap.querySelector('#'+id);
    const h=H();
    const recipients=()=>({to:h.addresses($('smTo').value).map(x=>x.toLowerCase()),cc:h.addresses($('smCc').value).map(x=>x.toLowerCase())});
    const draftKey=()=>JSON.stringify([st.delivery,st.delivery==='reply'?(st.search?'s:'+st.search.messageId:st.loop?.id||''):'new',recipients(),$('smMsg').value.trim()]);
    const state=(text,isErr)=>{$('smState').textContent=text||'';$('smState').classList.toggle('err',!!isErr);};
    const empty=text=>{$('smPreview').innerHTML='<div class="sm-empty">'+esc(text)+'</div>';};
    const markStale=()=>{$('smSend').disabled=!st.preview||st.previewKey!==draftKey()||st.busy;};
    const fill=r=>{const x=h.conversationRecipients({to:(r.to||[]).join(','),cc:(r.cc||[]).join(',')});$('smTo').value=x.to.join(', ');$('smCc').value=x.cc.join(', ');};
    /* ข้อมูลยังไม่ครบ → บอกสิ่งที่ขาด (ไม่เรียก server) */
    const missing=()=>{
      if(st.delivery==='reply'&&!st.search&&!st.loop)return 'เลือกลูปเมลเดิม (ค้นหาด้วยหัวข้อ) หรือกด "ส่งเมลใหม่"';
      const rc=recipients();if(!rc.to.length)return 'ใส่อีเมลผู้รับ (To) แล้วตัวอย่างเมลจะขึ้นที่นี่';
      const bad=[...rc.to,...rc.cc].filter(x=>!EMAIL.test(x));if(bad.length)return 'อีเมลไม่ถูกต้อง: '+bad.join(', ');
      return '';
    };
    const schedule=(ms=1000)=>{clearTimeout(st.timer);st.preview=null;markStale();const m=missing();if(m){st.seq++;state('');empty(m);return;}state('กำลังเตรียมตัวอย่าง…');st.timer=setTimeout(refresh,ms);};
    const setMode=mode=>{
      st.delivery=mode;wrap.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
      renderLoop();
      if(mode==='new'){if(st.loop&&same(recipients(),h.conversationRecipients({to:st.loop.recipients.to.join(','),cc:st.loop.recipients.cc.join(',')})))fill({to:[],cc:[]});}
      else if(st.search)fill(st.search.recipients);else if(st.loop)fill(st.loop.recipients);
      schedule(0);
    };
    /* กล่องลูป: แสดงเฉพาะสิ่งที่ต้องรู้ */
    function renderLoop(){
      const box=$('smLoop'),search=$('smSearch');
      if(st.delivery==='new'){box.className='sm-note';box.innerHTML='หัวข้อเมล: <b>'+esc(newSubject)+'</b><br><span class="sm-muted" style="margin:0">เมลครั้งถัดไปของโปรฯ นี้ (รวมเมลแจ้งจาก IT) จะตอบกลับในเมลนี้</span>';search.hidden=true;return;}
      if(st.search){box.className='sm-note ok';box.innerHTML='<i class="fas fa-circle-check" style="color:#1b6a3c"></i> ตอบกลับในลูป <b>'+esc(st.search.subject)+'</b> · <button type="button" class="sm-link" data-act="change">เปลี่ยน</button>';search.hidden=true;}
      else if(st.loop){box.className='sm-note ok';box.innerHTML='<i class="fas fa-circle-check" style="color:#1b6a3c"></i> ตอบกลับในลูปที่โปรฯ นี้เคยส่ง <b>'+esc(st.loop.subject)+'</b>'+(st.found?.lastMail?'<br><span class="sm-muted" style="margin:0">เมลล่าสุด: '+esc({queued:'รอส่ง',accepted:'ส่งสำเร็จ',failed:'ส่งไม่สำเร็จ',held:'ส่งไม่สำเร็จ',sending:'กำลังส่ง',retry:'กำลังลองใหม่'}[st.found.lastMail.status]||st.found.lastMail.status)+' · '+esc(new Date(st.found.lastMail.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))+'</span>':'')+' · <button type="button" class="sm-link" data-act="change">ใช้ลูปอื่น</button>';search.hidden=true;}
      else if(!st.found){box.className='sm-note';box.textContent='กำลังหาลูปเมลเดิมของโปรฯ นี้…';search.hidden=true;}
      else{box.className='sm-note warn';box.innerHTML=st.found.bound?'ลูปที่โปรฯ นี้เคยใช้ถูกปิดแล้ว ค้นหาลูปเดิมด้วยหัวข้อ หรือกด "ส่งเมลใหม่"':'โปรฯ นี้ยังไม่เคยส่งเมลจากระบบ ค้นหาลูปเดิมด้วยหัวข้อ หรือกด "ส่งเมลใหม่"';search.hidden=false;}
      const ch=box.querySelector('[data-act=change]');if(ch)ch.addEventListener('click',()=>{search.hidden=false;$('smQ').focus();});
    }
    wrap.querySelectorAll('[data-job]').forEach(b=>b.addEventListener('click',()=>{try{localStorage.setItem(CURRENT,b.dataset.job);}catch(e){}renderJob(root,wrap,jobs,jobs.find(j=>j.id===b.dataset.job));}));
    wrap.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(st.delivery!==b.dataset.mode)setMode(b.dataset.mode);}));
    ['smTo','smCc','smMsg'].forEach(id=>$(id).addEventListener('input',()=>schedule()));

    /* ระบบหาลูปเดิมของโปรฯ นี้ก่อน · ไม่เคยส่ง → เริ่มที่ "ส่งเมลใหม่" */
    const loopQuery=()=>'copro/loop?campaignKey='+encodeURIComponent(keyOf(job.campaign))+(job.month?'&month='+encodeURIComponent(job.month):'');
    empty('กำลังหาลูปเมลเดิม…');
    (async()=>{
      try{
        const r=await client().request(loopQuery(),{interactive:true});st.found=r;
        if(r.bound&&r.usable&&r.loop){st.loop=r.loop;fill(r.loop.recipients);setMode('reply');}
        else if(!r.bound)setMode('new');
        else{renderLoop();schedule(0);}
      }catch(e){st.found={registered:false,bound:false};renderLoop();state('ตรวจลูปเดิมไม่สำเร็จ: '+errText(e),true);}
    })();
    /* ค้นด้วยหัวข้อ */
    const find=async()=>{
      const q=$('smQ').value.trim(),out=$('smResults');if(!q){out.innerHTML='<p class="sm-muted">กรุณากรอกหัวข้อเมล</p>';return;}
      out.innerHTML='<p class="sm-muted">กำลังค้นหา…</p>';
      try{
        const found=await client().request('threads/search?q='+encodeURIComponent(q)+'&mode=production',{interactive:true});out.replaceChildren();
        if(!found.items.length){out.innerHTML=h.notFoundHtml(q);return;}
        for(const item of found.items){
          const card=document.createElement('div');card.className='sm-result';
          card.innerHTML='<strong></strong><p></p><button type="button" class="sm-btn" style="border-radius:8px;padding:6px 14px;min-height:36px">เลือกลูปนี้</button>';
          card.querySelector('strong').textContent=item.subject;card.querySelector('p').textContent=[item.from,item.date,'To: '+item.to,'CC: '+item.cc].filter(Boolean).join('\n');
          card.querySelector('button').addEventListener('click',()=>{
            const rc=h.conversationRecipients(item);st.search={messageId:item.messageId,subject:item.subject,recipients:rc};out.replaceChildren();$('smQ').value='';
            if(st.delivery!=='reply')setMode('reply');else{renderLoop();fill(rc);schedule(0);}
          });
          out.append(card);
        }
      }catch(e){out.innerHTML='<p class="sm-muted" style="color:#b02a37">'+esc(errText(e))+'</p>';}
    };
    $('smFind').addEventListener('click',find);$('smQ').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});

    /* โปรฯ ที่ยังไม่อยู่ในระบบอีเมล (แจ้งก่อนมีระบบเมล / เคยเลือกไม่ส่ง) → ลงทะเบียนให้ก่อนเตรียมเมล (ไม่ส่งอะไร) */
    async function ensureRegistered(){
      if(st.found?.registered)return;
      await client().request('copro/ensure',{method:'POST',body:{campaignKey:keyOf(job.campaign),month:job.month||''},interactive:true});
      st.found={...st.found,...await client().request(loopQuery(),{interactive:true})};st.campaign=null;
    }
    /* แคมเปญในระบบอีเมล (แจ้งโปรฯ / CoPromo ใช้ส่งครั้งแรก) */
    async function emailCampaign(){
      if(st.campaign)return st.campaign;
      const list=(await client().list()).filter(c=>c.key===keyOf(job.campaign)&&(!job.month||c.month===job.month));
      if(!list.length)throw Error('โปรฯ นี้ไม่ได้ลงทะเบียนกับระบบอีเมล จึงส่งเมลจากระบบไม่ได้');
      return st.campaign=list.find(c=>c.id===st.found?.campaignId)||list[0];
    }
    /* ลูป + ผู้รับที่เลือก → policy ที่ server อนุมัติ (สร้างใหม่เฉพาะตอนผู้รับเปลี่ยน) */
    async function policy(){
      const rc=recipients();if(!rc.to.length)throw Error('กรุณาระบุผู้รับ To');
      const sig=JSON.stringify([st.delivery,st.search?.messageId||st.loop?.id||'',rc]);
      if(st.policy&&st.policyKey===sig)return st.policy;
      let body;
      if(st.delivery==='new'){const campaignId=st.found?.campaignId||(await emailCampaign()).id;body={mode:'production',newMessage:true,subjectKind:subjectKind(job),campaignId,recipients:rc};}
      else if(st.search)body={mode:'production',messageId:st.search.messageId,recipients:rc};
      else if(st.loop){if(same(rc,st.loop.recipients)){st.policyKey=sig;return st.policy={id:st.loop.id,version:st.loop.version,recipients:st.loop.recipients};}body={mode:st.loop.mode||'production',policyId:st.loop.id,recipients:rc};}
      else throw Error('กรุณาเลือกลูปเมลเดิม (หรือค้นหาด้วยหัวข้อ) หรือเลือกส่งเมลใหม่');
      const p=await client().request('threads',{method:'POST',body:{...body,audience:[await identity()]},interactive:true});
      st.policyKey=sig;return st.policy={id:p.id,version:p.version,recipients:p.recipients};
    }
    /* body ของแต่ละประเภทงาน → endpoint preview / commit เดิมของ server */
    async function request(){
      await ensureRegistered();
      const p=await policy(),message=$('smMsg').value.trim(),target={policyId:p.id,policyVersion:p.version,recipients:p.recipients,additionalMessage:message};
      if(job.kind==='edit')return {preview:'copro/revision/preview',commit:'copro/revision',body:{campaignKey:keyOf(job.campaign),month:job.month,editId:job.editId,...target}};
      if(job.kind==='change')return {preview:'copro/change/preview',commit:'copro/change',body:{campaignKey:keyOf(job.campaign),changeId:job.changeId,...target}};
      const c=await emailCampaign();
      return {preview:'copro/preview',commit:'copro',body:{notificationOnly:job.kind!=='copro',campaignId:c.id,expectedVersion:c.version,records:job.kind==='copro'?await coproRecords(job,c):[],...target}};
    }
    /* ตัวอย่างจริงจาก server (ข้อมูลเว็บล่าสุด) — อัปเดตเองเมื่อแก้ผู้รับ/ข้อความ */
    async function refresh(){
      if(missing())return schedule(0);
      const key=draftKey(),seq=++st.seq;st.busy=true;markStale();state('กำลังเตรียมตัวอย่างจากข้อมูลล่าสุด…');
      try{
        const req=await request(),preview=await client().request(req.preview,{method:'POST',body:req.body,interactive:true});
        if(seq!==st.seq)return;
        st.preview={req,preview};st.previewKey=key;
        const files=(preview.attachments||[]).map(a=>a.fileName||a.name);
        $('smPreview').innerHTML='<dl class="sm-meta"><dt>หัวข้อ</dt><dd>'+esc(preview.subject)+'</dd><dt>ถึง</dt><dd>'+esc(preview.recipients.to.join(', '))+'</dd>'+(preview.recipients.cc.length?'<dt>CC</dt><dd>'+esc(preview.recipients.cc.join(', '))+'</dd>':'')+'<dt>ไฟล์แนบ</dt><dd>'+esc(files.join(', ')||'ไม่มี')+'</dd></dl>'+
          '<div class="sm-body">'+h.mailDetailsHtml(preview.text)+'</div>';
        state('ตรวจรายละเอียดให้ถูกต้อง แล้วกด "ยืนยันส่งเมล"');
      }catch(e){if(seq!==st.seq)return;st.preview=null;empty('ยังแสดงตัวอย่างไม่ได้');state(errText(e),true);}
      finally{if(seq===st.seq){st.busy=false;markStale();}}
    }

    const done=async()=>{
      await removeJob(job.id);
      const left=jobs.filter(j=>j.id!==job.id);
      if(left.length){try{localStorage.setItem(CURRENT,left[0].id);}catch(e){}return mount(root);}
      try{localStorage.removeItem(CURRENT);}catch(e){}
      const page=job.returnPage||'SubmissionLog';if(typeof window.loadPage==='function')window.loadPage(page,document.getElementById('nav-'+page));
    };
    $('smSend').addEventListener('click',async()=>{
      if(!st.preview||st.previewKey!==draftKey())return;
      const ok=await Swal.fire({icon:'question',title:'ยืนยันส่งเมล?',html:'<div style="font-size:.92rem;line-height:1.6"><b>'+esc(st.preview.preview.subject)+'</b><br>ถึง: '+esc(st.preview.preview.recipients.to.join(', '))+'</div>',showCancelButton:true,confirmButtonText:'ยืนยันส่งเมล',cancelButtonText:'กลับไปตรวจ',confirmButtonColor:'#1b5e20'});
      if(!ok.isConfirmed)return;
      st.busy=true;markStale();state('กำลังส่ง…');
      try{
        const result=await client().request(st.preview.req.commit,{method:'POST',body:{...st.preview.req.body,previewHash:st.preview.preview.previewHash,confirmed:true}});
        if(job.kind==='copro'){
          try{await window.PC_CoPromoDrafts.recordCoPromo(job.campaign,{},'queued');if(job.draft)await window.PC_CoPromoDrafts.remove(job.draft);}
          catch(e){await Swal.fire({icon:'warning',title:'บันทึกคำขอส่งเมลแล้ว',text:'ไม่ต้องส่งซ้ำ แต่สถานะ CoPromo ยังอัปเดตไม่สำเร็จ: '+e.message});}
        }
        await Swal.fire({icon:'success',title:result.mailStatus==='accepted'?'Gmail รับเมลแล้ว':'บันทึกคำขอส่งเมลแล้ว',text:'ส่งจาก it@rocks-foods.com ภายในประมาณ 1 นาที · รายการนี้ไม่ถูกส่งซ้ำ',timer:2200,showConfirmButton:false});
        await done();
      }catch(e){state('ส่งเมลไม่สำเร็จ: '+errText(e)+' · งานที่บันทึกแล้วไม่ได้รับผลกระทบ',true);st.busy=false;markStale();}
    });
    $('smSkip').addEventListener('click',async()=>{
      const ok=await Swal.fire({icon:'question',title:'ไม่ส่งเมลงานนี้?',text:job.campaign+' · บันทึกว่าไม่ส่งเมล',showCancelButton:true,confirmButtonText:'ไม่ส่งเมล',cancelButtonText:'กลับ',confirmButtonColor:'#6c757d'});
      if(!ok.isConfirmed)return;
      try{await decline(job);await done();}catch(e){state(errText(e),true);}
    });
    $('smLater').addEventListener('click',()=>{if(typeof window.loadPage==='function')window.loadPage('MyPending',document.getElementById('nav-MyPending'));});
  }

  /* CoPromo: รายละเอียดธุรกิจรายปุ่ม (ไม่ส่งในเมล ใช้บันทึกฝั่งระบบ) — ตรรกะเดียวกับหน้าเตรียมเมลเดิม */
  const FIELDS=['brand','detail','billingEntity','paymentType','soNo','quota','priceIncVat','paymentCondition','remark','periodText','promoType'];
  async function coproRecords(job,c){
    const stored=await window.PC_CLOUD.readCloudKey('pc_co_promotions'),saved=stored?JSON.parse(stored.value):[],record=job.record||{campaign:job.campaign};
    return c.buttons.map(b=>{
      const identity=JSON.parse(b.source_identity_json);
      const matches=r=>r.emailButtonId?r.emailButtonId===b.button_id:(r.cmposName||r.buttonName)===identity.shortName&&(!r.codePromotion||r.codePromotion===identity.codePromotion);
      const hit=matches(record)?record:saved.find(r=>r.campaign===job.campaign&&matches(r))||(c.records||[]).find(matches)||{};
      const out={buttonId:b.button_id,cmposName:identity.shortName,buttonName:identity.shortName};
      for(const k of FIELDS)out[k]=String(hit[k]??'').trim();
      return out;
    });
  }

  /* งานค้างของฉัน: การ์ดงานรอส่งเมล */
  async function mountPending(root){
    if(!root)return;
    try{
      const jobs=await listJobs();if(!jobs.length){root.innerHTML='';return;}
      root.innerHTML='<div class="border rounded p-3 mb-3 bg-white"><strong><i class="fas fa-envelope me-1"></i>งานรอส่งเมล '+jobs.length+' รายการ</strong><div class="small text-muted my-2">'+jobs.map(j=>esc(j.campaign)+' · '+esc(KIND[j.kind]||j.kind)).join('<br>')+'</div><button type="button" class="btn btn-success">เปิดหน้าส่งเมล</button></div>';
      root.querySelector('button').onclick=()=>window.loadPage('SendMail',document.getElementById('nav-SendMail'));
    }catch(e){root.textContent=e.message;}
  }

  window.PC_SendMail={open,ask,decline,mount,mountPending,listJobs,removeJob,_jobId:jobId};
})(window);
