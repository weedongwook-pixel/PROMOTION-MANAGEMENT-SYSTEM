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
    '.sm-wrap{max-width:1240px;margin:auto;padding:20px 16px 40px;color:#243b2d}'+
    '.sm-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px}'+
    '.sm-head h2{margin:0;font-size:1.45rem;color:#145c32}.sm-head .sm-sub{color:#526258;font-size:.92rem}'+
    '.sm-jobs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.sm-jobs button{border:1.5px solid #b9cabe;background:#fff;border-radius:999px;padding:6px 14px;font-size:.85rem;cursor:pointer}'+
    '.sm-jobs button[aria-current="true"]{background:#1b6a3c;border-color:#1b6a3c;color:#fff;font-weight:700}'+
    '.sm-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(340px,1.1fr);gap:20px;align-items:start}'+
    '.sm-card{background:#fff;border:1px solid #dce4df;border-radius:14px;padding:18px 20px;margin-bottom:16px}'+
    '.sm-card h3{font-size:1rem;font-weight:700;color:#145c32;margin:0 0 12px}.sm-card h3 .n{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#1b6a3c;color:#fff;font-size:.8rem;align-items:center;justify-content:center;margin-right:8px}'+
    '.sm-card label{display:block;font-weight:700;font-size:.88rem;margin:12px 0 6px}.sm-card textarea,.sm-card input[type=text],.sm-card input[type=search],.sm-card select{width:100%;border:1px solid #b9cabe;border-radius:8px;padding:9px 11px;font:inherit;min-height:42px;box-sizing:border-box}'+
    '.sm-card label.sm-opt{display:flex;gap:10px;margin:0 0 8px;font-weight:400;align-items:flex-start;border:1.5px solid #dce4df;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer}.sm-opt input{margin-top:4px}.sm-opt.on{border-color:#1b6a3c;background:#f1f8f3}'+
    '.sm-opt small{display:block;color:#526258}.sm-found{border:1px solid #9cc7a9;background:#f1f8f3;border-radius:10px;padding:12px;margin-bottom:10px}.sm-found.warn{border-color:#f3dd9b;background:#fff8e1}'+
    '.sm-result{border:1px solid #dce4df;border-radius:10px;padding:10px 12px;margin:8px 0}.sm-result p{white-space:pre-wrap;font-size:.82rem;color:#526258;margin:4px 0 8px}'+
    '.sm-preview{position:sticky;top:12px}.sm-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.9rem;line-height:1.6;background:#f7faf8;border:1px solid #dce4df;border-radius:10px;padding:14px;max-height:62vh;overflow:auto;margin:0}'+
    '.sm-preview pre strong{color:#173d27}.sm-stale{color:#8a6d00;background:#fff8e1;border-radius:8px;padding:6px 10px;font-size:.85rem;margin-bottom:8px}'+
    '.sm-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;border-top:1px solid #dce4df;padding-top:16px;margin-top:4px}'+
    '.sm-actions button{min-height:44px;border-radius:9px;padding:9px 18px;font-weight:700;cursor:pointer}'+
    '.sm-btn{border:1.6px solid #b9cabe;background:#fff;color:#243b2d}.sm-btn-go{border:none;background:#1b6a3c;color:#fff}.sm-btn-go:disabled{opacity:.5;cursor:not-allowed}'+
    '.sm-muted{color:#526258;font-size:.85rem}.sm-err{color:#b02a37;font-size:.88rem;margin-top:8px}'+
    '@media(max-width:860px){.sm-grid{grid-template-columns:1fr}.sm-preview{position:static}}'+
    '</style>';

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
    const st={delivery:'reply',loop:null,found:null,search:null,policy:null,policyKey:'',preview:null,previewKey:'',campaign:null,busy:false};
    wrap.innerHTML=
      '<div class="sm-head"><div><h2><i class="fas fa-envelope me-2"></i>ส่งเมลโปรโมชั่น</h2><div class="sm-sub"><b>'+esc(job.campaign)+'</b> · '+esc(KIND[job.kind]||job.kind)+(job.detail?' · '+esc(job.detail):'')+'</div></div>'+
      '<div class="sm-muted">ผู้ส่ง <b>Potato Promotion Mail</b> (it@rocks-foods.com)</div></div>'+
      (jobs.length>1?'<div class="sm-jobs" aria-label="งานรอส่งเมล">'+jobs.map(j=>'<button type="button" data-job="'+esc(j.id)+'"'+(j.id===job.id?' aria-current="true"':'')+'>'+esc(j.campaign)+' · '+esc(KIND[j.kind]||j.kind)+'</button>').join('')+'</div>':'')+
      '<div class="sm-grid"><div>'+
        '<div class="sm-card"><h3><span class="n">1</span>ส่งแบบไหน</h3>'+
          '<label class="sm-opt on"><input type="radio" name="smDelivery" value="reply" checked><span><b>ตอบกลับลูปเดิม</b><small>ระบบหาลูปที่โปรฯ นี้เคยส่งให้ก่อน ถ้าไม่เจอค้นด้วยหัวข้อเมลได้</small></span></label>'+
          '<label class="sm-opt"><input type="radio" name="smDelivery" value="new"><span><b>ส่งเมลใหม่</b><small>หัวข้อ "แจ้งรายละเอียด '+esc(job.campaign)+'" · เมลถัดไปของโปรฯ นี้ (รวมเมลจาก IT) จะตอบกลับในเมลใหม่นี้</small></span></label></div>'+
        '<div class="sm-card" id="smLoopCard"><h3><span class="n">2</span>ลูปเมลเดิม</h3><div id="smLoop" class="sm-muted">กำลังตรวจว่าโปรฯ นี้เคยส่งเมลหรือไม่…</div>'+
          '<label for="smQ">ค้นหาลูปด้วยหัวข้อเมล (Subject)</label><div style="display:flex;gap:8px"><input id="smQ" type="search" maxlength="200" placeholder="คัดลอกหัวข้อจากเมลเดิมมาวาง"><button type="button" id="smFind" class="sm-btn" style="border-radius:8px;padding:0 16px;white-space:nowrap">ค้นหา</button></div>'+
          '<p class="sm-muted mt-2 mb-0">ค้นได้เฉพาะลูปที่มี it@rocks-foods.com อยู่ใน To หรือ CC</p><div id="smResults" role="status"></div></div>'+
        '<div class="sm-card"><h3><span class="n" id="smN3">3</span>ผู้รับ</h3><label for="smTo">To</label><textarea id="smTo" rows="2" placeholder="name1@example.com, name2@example.com"></textarea>'+
          '<label for="smCc">CC (เว้นว่างได้)</label><textarea id="smCc" rows="2"></textarea><p class="sm-muted mt-2 mb-0">ใส่ได้หลายอีเมล คั่นด้วย , · it@rocks-foods.com เป็นผู้ส่งอยู่แล้ว ไม่ต้องใส่</p></div>'+
        '<div class="sm-card"><h3><span class="n" id="smN4">4</span>ข้อความเพิ่มเติมถึงผู้รับ</h3><textarea id="smMsg" rows="4" maxlength="4000" placeholder="พิมพ์เพิ่มเติมได้ (เว้นว่างได้) · จะแสดงในเมลต่อจากรายละเอียดโปรฯ"></textarea></div>'+
      '</div><div class="sm-preview"><div class="sm-card"><h3><i class="fas fa-eye me-2"></i>ตัวอย่างเมลที่จะส่ง (ข้อมูลจากเว็บ)</h3><div id="smStale" class="sm-stale" hidden>มีการแก้ไข กด "อัปเดตตัวอย่าง" ก่อนยืนยันส่ง</div><pre id="smPreview">เลือกลูปและผู้รับ แล้วกด "อัปเดตตัวอย่าง"</pre>'+
        '<div style="margin-top:10px"><button type="button" id="smRefresh" class="sm-btn" style="border-radius:8px;padding:8px 16px;font-weight:700">อัปเดตตัวอย่าง</button></div><div id="smErr" class="sm-err" role="alert"></div></div></div></div>'+
      '<div class="sm-actions"><button type="button" class="sm-btn" id="smLater">พักไว้ก่อน</button><button type="button" class="sm-btn" id="smSkip">ไม่ส่งเมล</button><button type="button" class="sm-btn-go" id="smSend" disabled>ยืนยันส่งเมล</button></div>';
    const $=id=>wrap.querySelector('#'+id);
    const h=H(),err=t=>{$('smErr').textContent=t||'';};
    const recipients=()=>({to:h.addresses($('smTo').value),cc:h.addresses($('smCc').value)});
    const draftKey=()=>JSON.stringify([st.delivery,st.delivery==='reply'?(st.search?'s:'+st.search.messageId:st.loop?.id||''):'new',recipients(),$('smMsg').value.trim()]);
    const markStale=()=>{const stale=!!st.preview&&st.previewKey!==draftKey();$('smStale').hidden=!stale;$('smSend').disabled=!st.preview||stale||st.busy;};
    const fill=r=>{const x=h.conversationRecipients({to:(r.to||[]).join(','),cc:(r.cc||[]).join(',')});$('smTo').value=x.to.join(', ');$('smCc').value=x.cc.join(', ');};
    wrap.querySelectorAll('[data-job]').forEach(b=>b.addEventListener('click',()=>{try{localStorage.setItem(CURRENT,b.dataset.job);}catch(e){}renderJob(root,wrap,jobs,jobs.find(j=>j.id===b.dataset.job));}));
    wrap.querySelectorAll('input[name=smDelivery]').forEach(r=>r.addEventListener('change',()=>{
      st.delivery=r.value;wrap.querySelectorAll('.sm-opt').forEach(o=>o.classList.toggle('on',o.querySelector('input').checked));
      $('smLoopCard').hidden=st.delivery==='new';$('smN3').textContent=st.delivery==='new'?'2':'3';$('smN4').textContent=st.delivery==='new'?'3':'4';
      if(st.delivery==='new'){$('smTo').value='';$('smCc').value='';st.preview=null;$('smPreview').textContent='ระบุผู้รับ To แล้วกด "อัปเดตตัวอย่าง"';}else if(st.search)fill(st.search.recipients);else if(st.loop)fill(st.loop.recipients);
      markStale();
    }));
    ['smTo','smCc','smMsg'].forEach(id=>$(id).addEventListener('input',markStale));

    /* ② ระบบหาลูปเดิมของโปรฯ นี้ก่อน */
    const loopBox=$('smLoop');
    (async()=>{
      try{
        const q='copro/loop?campaignKey='+encodeURIComponent(keyOf(job.campaign))+(job.month?'&month='+encodeURIComponent(job.month):'');
        const r=await client().request(q,{interactive:true});st.found=r;
        if(!r.registered){loopBox.innerHTML='<div class="sm-found warn">โปรฯ นี้ยังไม่ได้ลงทะเบียนกับระบบอีเมล จึงส่งเมลจากระบบไม่ได้ · ถ้าเป็นงานเก่า เปิดจากหน้า Co-Promotion เพื่อผูกงานก่อน</div>';$('smRefresh').disabled=true;return;}
        if(r.bound&&r.usable&&r.loop){
          st.loop=r.loop;
          loopBox.innerHTML='<div class="sm-found"><b><i class="fas fa-circle-check" style="color:#1b6a3c"></i> พบลูปที่โปรฯ นี้เคยส่ง</b><div style="margin-top:6px">'+esc(r.loop.subject)+'</div><div class="sm-muted">To: '+esc(r.loop.recipients.to.join(', ')||'-')+(r.loop.recipients.cc.length?'<br>CC: '+esc(r.loop.recipients.cc.join(', ')):'')+
            (r.lastMail?'<br>เมลล่าสุด: '+esc({queued:'รอส่ง',accepted:'ส่งสำเร็จ',failed:'ส่งไม่สำเร็จ',held:'ส่งไม่สำเร็จ',sending:'กำลังส่ง',retry:'กำลังลองใหม่'}[r.lastMail.status]||r.lastMail.status)+' · '+esc(new Date(r.lastMail.at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})):'')+'</div>'+
            '<button type="button" id="smUseLoop" class="sm-btn mt-2" style="border-radius:8px;padding:6px 14px">ใช้ลูปนี้</button></div>';
          $('smUseLoop').addEventListener('click',()=>{st.search=null;fill(st.loop.recipients);$('smResults').replaceChildren();markStale();refresh();});
          if(st.delivery==='reply'){fill(r.loop.recipients);refresh();}
        }else if(r.bound){loopBox.innerHTML='<div class="sm-found warn">ลูปที่โปรฯ นี้เคยใช้ถูกปิดหรือเปลี่ยนแล้ว กรุณาค้นหาลูปด้วยหัวข้อเมล หรือเลือกส่งเมลใหม่</div>';}
        else loopBox.innerHTML='<div class="sm-found warn">โปรฯ นี้<b>ยังไม่เคยส่งเมล</b>จากระบบ · ค้นหาลูปเดิมด้วยหัวข้อเมลด้านล่าง หรือเลือกส่งเมลใหม่</div>';
      }catch(e){loopBox.innerHTML='<div class="sm-found warn">ตรวจลูปเดิมไม่สำเร็จ: '+esc(e.message||e)+' · ค้นหาด้วยหัวข้อเมลได้</div>';}
    })();
    /* ค้นด้วยหัวข้อ */
    const find=async()=>{
      const q=$('smQ').value.trim(),out=$('smResults');if(!q){out.textContent='กรุณากรอกหัวข้อเมล';return;}
      out.textContent='กำลังค้นหา…';
      try{
        const found=await client().request('threads/search?q='+encodeURIComponent(q)+'&mode=production',{interactive:true});out.replaceChildren();
        if(!found.items.length){out.innerHTML=h.notFoundHtml(q);return;}
        for(const item of found.items){
          const card=document.createElement('div');card.className='sm-result';
          card.innerHTML='<strong></strong><p></p><button type="button" class="sm-btn" style="border-radius:8px;padding:6px 14px">เลือกลูปนี้</button>';
          card.querySelector('strong').textContent=item.subject;card.querySelector('p').textContent=[item.from,item.date,'To: '+item.to,'CC: '+item.cc].filter(Boolean).join('\n');
          card.querySelector('button').addEventListener('click',ev=>{
            out.querySelectorAll('button').forEach(b=>{b.textContent='เลือกลูปนี้';b.className='sm-btn';});ev.target.textContent='✓ เลือกแล้ว';ev.target.className='sm-btn-go';
            const rc=h.conversationRecipients(item);st.search={messageId:item.messageId,subject:item.subject,recipients:rc};fill(rc);markStale();refresh();
          });
          out.append(card);
        }
      }catch(e){out.textContent=String(e.message||e);}
    };
    $('smFind').addEventListener('click',find);$('smQ').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});

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
      if(st.delivery==='new'){const campaignId=st.found?.campaignId||(await emailCampaign()).id;body={mode:'production',newMessage:true,campaignId,recipients:rc};}
      else if(st.search)body={mode:'production',messageId:st.search.messageId,recipients:rc};
      else if(st.loop){if(same(rc,st.loop.recipients)){st.policyKey=sig;return st.policy={id:st.loop.id,version:st.loop.version,recipients:st.loop.recipients};}body={mode:st.loop.mode||'production',policyId:st.loop.id,recipients:rc};}
      else throw Error('กรุณาเลือกลูปเมลเดิม (หรือค้นหาด้วยหัวข้อ) หรือเลือกส่งเมลใหม่');
      const p=await client().request('threads',{method:'POST',body:{...body,audience:[await identity()]},interactive:true});
      st.policyKey=sig;return st.policy={id:p.id,version:p.version,recipients:p.recipients};
    }
    /* body ของแต่ละประเภทงาน → endpoint preview / commit เดิมของ server */
    async function request(){
      const p=await policy(),message=$('smMsg').value.trim(),target={policyId:p.id,policyVersion:p.version,recipients:p.recipients,additionalMessage:message};
      if(job.kind==='edit')return {preview:'copro/revision/preview',commit:'copro/revision',body:{campaignKey:keyOf(job.campaign),month:job.month,editId:job.editId,...target}};
      if(job.kind==='change')return {preview:'copro/change/preview',commit:'copro/change',body:{campaignKey:keyOf(job.campaign),changeId:job.changeId,...target}};
      const c=await emailCampaign();
      return {preview:'copro/preview',commit:'copro',body:{notificationOnly:job.kind!=='copro',campaignId:c.id,expectedVersion:c.version,records:job.kind==='copro'?await coproRecords(job,c):[],...target}};
    }
    async function refresh(){
      err('');const key=draftKey();st.busy=true;markStale();$('smPreview').textContent='กำลังเตรียมเมลจากข้อมูลล่าสุด…';
      try{
        const req=await request(),preview=await client().request(req.preview,{method:'POST',body:req.body,interactive:true});
        st.preview={req,preview};st.previewKey=key;
        const text=['หัวข้อ: '+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text].join('\n\n');
        $('smPreview').innerHTML=h.mailDetailsHtml(text)+((preview.attachments||[]).length?'\n\n<strong>ไฟล์แนบ:</strong> '+esc(preview.attachments.map(a=>a.fileName||a.name).join(', ')):'');
      }catch(e){st.preview=null;$('smPreview').textContent='ยังแสดงตัวอย่างไม่ได้';err(String(e.message||e));}
      finally{st.busy=false;markStale();}
    }
    $('smRefresh').addEventListener('click',refresh);

    const done=async()=>{
      await removeJob(job.id);
      const left=jobs.filter(j=>j.id!==job.id);
      if(left.length){try{localStorage.setItem(CURRENT,left[0].id);}catch(e){}return mount(root);}
      try{localStorage.removeItem(CURRENT);}catch(e){}
      const page=job.returnPage||'SubmissionLog';if(typeof window.loadPage==='function')window.loadPage(page,document.getElementById('nav-'+page));
    };
    $('smSend').addEventListener('click',async()=>{
      if(!st.preview||st.previewKey!==draftKey())return;
      const ok=await Swal.fire({icon:'question',title:'ยืนยันส่งเมล?',text:st.preview.preview.subject+' → '+st.preview.preview.recipients.to.join(', '),showCancelButton:true,confirmButtonText:'ยืนยันส่งเมล',cancelButtonText:'กลับไปตรวจ',confirmButtonColor:'#1b5e20'});
      if(!ok.isConfirmed)return;
      st.busy=true;markStale();err('');
      try{
        const result=await client().request(st.preview.req.commit,{method:'POST',body:{...st.preview.req.body,previewHash:st.preview.preview.previewHash,confirmed:true}});
        if(job.kind==='copro'){
          try{await window.PC_CoPromoDrafts.recordCoPromo(job.campaign,{},'queued');if(job.draft)await window.PC_CoPromoDrafts.remove(job.draft);}
          catch(e){await Swal.fire({icon:'warning',title:'บันทึกคำขอส่งเมลแล้ว',text:'ไม่ต้องส่งซ้ำ แต่สถานะ CoPromo ยังอัปเดตไม่สำเร็จ: '+e.message});}
        }
        await Swal.fire({icon:'success',title:result.mailStatus==='accepted'?'Gmail รับเมลแล้ว':'บันทึกคำขอส่งเมลแล้ว',text:'ส่งจาก it@rocks-foods.com ภายในประมาณ 1 นาที · รายการนี้ไม่ถูกส่งซ้ำ',timer:2200,showConfirmButton:false});
        await done();
      }catch(e){err('ส่งเมลไม่สำเร็จ: '+String(e.message||e)+' · งานที่บันทึกแล้วไม่ได้รับผลกระทบ');st.busy=false;markStale();}
    });
    $('smSkip').addEventListener('click',async()=>{
      const ok=await Swal.fire({icon:'question',title:'ไม่ส่งเมลงานนี้?',text:job.campaign+' · บันทึกว่าไม่ส่งเมล',showCancelButton:true,confirmButtonText:'ไม่ส่งเมล',cancelButtonText:'กลับ',confirmButtonColor:'#6c757d'});
      if(!ok.isConfirmed)return;
      try{await decline(job);await done();}catch(e){err(String(e.message||e));}
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
