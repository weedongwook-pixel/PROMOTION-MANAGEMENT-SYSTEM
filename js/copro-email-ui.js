(function(window){
  'use strict';
  const en=()=>window.PC_LANG==='EN',word=(th,english)=>en()?english:th;
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const addresses=value=>String(value||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  const client=()=>window.PC_CoProEmail;
  function error(error){return Swal.fire({icon:'error',title:word('ยังดำเนินการอีเมลไม่ได้','Email not completed'),text:String(error?.message||error)});}
  window.PC_CoProEmailUI={
    async save(record,options={}){
      if(record.id)throw Error(word('รุ่นทดสอบยังไม่ส่งเมลแก้ไขงานเดิม','Revision emails are not enabled in this pilot'));
      const campaigns=(await client().list()).filter(c=>c.key==='promo::c::'+encodeURIComponent(record.campaign));
      if(!campaigns.length)throw Error(word('งานนี้ยังไม่มีหลักฐานสิทธิ์ส่งอีเมล กรุณาให้ผู้ดูแลตรวจสอบ ไม่ต้องส่งโปรฯ ซ้ำ','This job has no verified email ownership receipt. Ask an administrator to review it; do not resubmit.'));
      const policies=(await client().request('threads')).items.filter(p=>!options.mode||p.mode===options.mode);
      if(!policies.length)throw Error(word('ยังไม่มีลูปที่อนุมัติให้บัญชีนี้ กรุณาให้ผู้ดูแลตั้งค่าลูปอีเมล','No approved conversation is available to this account'));
      const fields=[['brand','พาร์ทเนอร์ / Brand'],['detail','รายละเอียดสำหรับเมล / Public details'],['billingEntity','บริษัทเรียกเก็บ / Billing entity'],['paymentType','ประเภทชำระ / Payment type'],['soNo','SO number'],['quota','Quota'],['priceIncVat','ราคารวม VAT / Price incl. VAT'],['paymentCondition','เงื่อนไขชำระ / Payment condition'],['remark','หมายเหตุภายใน (ไม่ส่งเมล) / Internal remark'],['periodText','ช่วงเวลา / Period'],['promoType','ประเภทโปรฯ / Promotion type']];
      const recordForms=campaigns.map(c=>{
        const matches=c.buttons.filter(b=>{const identity=JSON.parse(b.source_identity_json);return (record.cmposName||record.buttonName)?identity.shortName===(record.cmposName||record.buttonName)&&(!record.codePromotion||identity.codePromotion===record.codePromotion):c.buttons.length===1;});
        return '<section data-copro-records="'+esc(c.id)+'"'+(c.id!==campaigns[0].id?' hidden':'')+'>'+c.buttons.map((b,i)=>{
          const identity=JSON.parse(b.source_identity_json),prefill=matches.length===1&&matches[0].button_id===b.button_id?record:{};
          return '<fieldset class="border rounded p-3 my-3"><legend class="float-none w-auto fs-6 px-2">'+esc(identity.shortName+' · '+[identity.codePromotion,identity.codeItemSet].filter(Boolean).join(' / '))+'</legend>'+fields.map(([key,label])=>'<label class="d-block mb-1" for="coproRecord-'+c.id+'-'+i+'-'+key+'">'+esc(label)+(key==='brand'?' *':'')+'</label><textarea class="form-control mb-2" id="coproRecord-'+c.id+'-'+i+'-'+key+'" rows="'+(['detail','remark','paymentCondition'].includes(key)?2:1)+'" maxlength="8000">'+esc(prefill[key]||'')+'</textarea>').join('')+'</fieldset>';
        }).join('')+'</section>';
      }).join('');
      const choose=await Swal.fire({
        title:word('เลือกลูปอีเมล Co-Promotion','Choose a Co-Promotion conversation'),
        html:'<div style="text-align:left"><p>'+esc(word('ระบุข้อมูลแต่ละปุ่มและผู้รับให้ครบ ไม่คัดลอกข้อมูลข้ามปุ่มหรือเพิ่ม To/CC เดิมอัตโนมัติ','Complete each button and enter recipients. Data is not copied across buttons; there is no automatic Reply All.'))+'</p>'+
          '<label for="coproCampaign">'+esc(word('แคมเปญ / เดือน','Campaign / month'))+'</label><select id="coproCampaign" class="form-select mb-3">'+campaigns.map(c=>'<option value="'+esc(c.id)+'">'+esc(record.campaign+' / '+c.month)+'</option>').join('')+'</select>'+
          '<label for="coproLoop">'+esc(word('ลูปที่อนุมัติ','Approved conversation'))+'</label><select id="coproLoop" class="form-select mb-3">'+policies.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.subject)+'</option>').join('')+'</select>'+
          '<p id="coproApproved" class="small"></p><label for="coproTestTo">To — '+esc(word('ผู้รับ','Recipients'))+'</label><textarea id="coproTestTo" class="form-control mb-3" rows="2" autocomplete="off"></textarea>'+
          '<label for="coproTestCc">CC — '+esc(word('เว้นว่างได้','Optional'))+'</label><textarea id="coproTestCc" class="form-control" rows="2" autocomplete="off"></textarea>'+recordForms+'</div>',
        showCancelButton:true,confirmButtonText:word('ตรวจตัวอย่างเมล','Preview email'),cancelButtonText:word('กลับไปแก้ข้อมูล','Back to form'),confirmButtonColor:'#1b5e20',width:680,
        didOpen(){
          const field=document.getElementById('coproLoop'),describe=()=>{const p=policies.find(x=>x.id===field.value);document.getElementById('coproApproved').textContent=word('รายชื่อที่ผู้ดูแลอนุมัติ: ','Administrator-approved recipients: ')+[...p.recipients.to,...p.recipients.cc].join(', ');};field.addEventListener('change',describe);describe();
          document.getElementById('coproCampaign').addEventListener('change',event=>document.querySelectorAll('[data-copro-records]').forEach(section=>{section.hidden=section.dataset.coproRecords!==event.target.value;}));
        },
        preConfirm(){
          const campaign=campaigns.find(c=>c.id===document.getElementById('coproCampaign').value),policy=policies.find(p=>p.id===document.getElementById('coproLoop').value),to=addresses(document.getElementById('coproTestTo').value),cc=addresses(document.getElementById('coproTestCc').value);
          if(!to.length){Swal.showValidationMessage(word('กรุณาระบุผู้รับ To','Enter at least one To recipient'));return false;}
          const records=campaign.buttons.map((b,i)=>{const identity=JSON.parse(b.source_identity_json),saved={buttonId:b.button_id,cmposName:identity.shortName,buttonName:identity.shortName};for(const [key]of fields)saved[key]=document.getElementById('coproRecord-'+campaign.id+'-'+i+'-'+key).value.trim();return saved;});
          const invalid=records.findIndex(r=>!r.brand);if(invalid!==-1){const field=document.getElementById('coproRecord-'+campaign.id+'-'+invalid+'-brand');field.classList.add('is-invalid');field.focus();field.scrollIntoView({block:'center'});Swal.showValidationMessage(word('กรุณาระบุพาร์ทเนอร์ให้ครบทุกปุ่ม','Enter a partner for every button'));return false;}
          return {campaignId:campaign.id,expectedVersion:campaign.version,policyId:policy.id,policyVersion:policy.version,recipients:{to,cc},records};
        }
      });
      if(!choose.isConfirmed)return null;
      const draft=choose.value,preview=await client().request('copro/preview',{method:'POST',body:draft});
      const rendered=[word('หัวข้อ: ','Subject: ')+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text,word('ฉบับแรก: เมื่อบันทึก Co-Promotion สำเร็จ\nฉบับที่สอง: เมื่อขึ้นปุ่มและ Interface ครบ','First: after Co-Promotion save\nSecond: after POS setup and Interface are both complete')].join('\n\n');
      const confirm=await Swal.fire({title:word('ตรวจเนื้อหาและผู้รับก่อนบันทึก','Review content and recipients'),html:'<pre style="text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font:inherit">'+esc(rendered)+'</pre>',showCancelButton:true,confirmButtonText:word('ยืนยันบันทึกและเข้าคิวเมล','Confirm save and queue email'),cancelButtonText:word('ยกเลิก','Cancel'),confirmButtonColor:'#1b5e20',width:740});
      if(!confirm.isConfirmed)return null;
      const result=await client().request('copro',{method:'POST',body:{...draft,previewHash:preview.previewHash,confirmed:true}});
      return {status:'success',...result};
    },
    mountSettings(root){
      if(!root)return;
      root.innerHTML='<h2 data-th="อีเมล Co-Promotion" data-en="Co-Promotion email">อีเมล Co-Promotion</h2>'+
        '<p data-th="เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที" data-en="Choose the real conversation for each promotion and confirm recipients. Connecting does not send email.">เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที</p>'+
        '<p data-copro-note role="status" aria-live="polite"></p><button type="button" class="btn btn-outline-success mb-3" data-copro-enable>ยืนยัน Microsoft / เปิดใช้อีเมลในแท็บนี้</button>'+
        '<details><summary data-th="ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ" data-en="Administrator: approve conversation and recipients">ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ</summary>'+
        '<label class="d-block mt-3" for="coproMode">ประเภทลูป / Conversation type</label><select id="coproMode" class="form-select"><option value="production">งานจริง / Production</option><option value="test">ทดสอบ / Test</option></select><label class="d-block mt-3" for="coproSearch">Subject / หัวข้อเมล</label><input id="coproSearch" class="form-control" placeholder="หัวข้อเมลของโปรฯ" maxlength="200"><button type="button" class="btn btn-outline-success my-3" data-copro-search>ค้นหาใน Gmail / Search Gmail</button><div data-copro-results></div>'+
        '<label class="d-block" for="coproPublishTo">To — ผู้รับ / Recipients</label><textarea id="coproPublishTo" class="form-control mb-3" rows="2"></textarea><label for="coproPublishCc">CC</label><textarea id="coproPublishCc" class="form-control mb-3" rows="2"></textarea>'+
        '<label for="coproAudience">Microsoft Object ID — ผู้แจ้งที่เห็นลูปนี้ (ว่าง = บัญชีนี้) / Allowed submitters (blank = this account)</label><textarea id="coproAudience" class="form-control mb-3" rows="2"></textarea>'+
        '<button type="button" class="btn btn-success" data-copro-publish disabled>อนุมัติลูปและผู้รับ / Approve conversation and recipients</button></details>'+
        '<button type="button" class="btn btn-outline-success my-3" data-copro-history>ตรวจคิวเมลของงาน / Check campaign mail status</button><div data-copro-history-list></div>';
      const get=name=>root.querySelector('[data-copro-'+name+']'),note=text=>{get('note').textContent=text;};let selected=null;
      root.querySelector('#coproMode').addEventListener('change',()=>{selected=null;get('publish').disabled=true;get('results').replaceChildren();});
      const toggleLabel=()=>{get('enable').textContent=client().active()?word('ปิดใช้อีเมลในแท็บนี้','Disable email in this tab'):word('ยืนยัน Microsoft / เปิดใช้อีเมลในแท็บนี้','Verify Microsoft / Enable email in this tab');};toggleLabel();
      const action=(button,fn)=>button.addEventListener('click',async()=>{button.disabled=true;try{await fn();}catch(e){note(String(e.message||e));}finally{button.disabled=false;}});
      action(get('enable'),async()=>{
        if(client().active()){client().disable();toggleLabel();note(word('ปิดใช้อีเมลในแท็บนี้แล้ว','Pilot disabled in this tab'));return;}
        await client().enable();toggleLabel();note(word('เปิดใช้อีเมลแล้ว ให้สร้างโปรฯ ใหม่ แล้วกรอก Co-Promotion ต่อเพื่อเลือกลูปและผู้รับ','Pilot enabled. Submit a new promotion, then complete its Co-Promotion form to choose a conversation and recipients.'));
      });
      action(get('search'),async()=>{
        selected=null;get('publish').disabled=true;
        const result=await client().request('threads/search?q='+encodeURIComponent(root.querySelector('#coproSearch').value)+'&mode='+root.querySelector('#coproMode').value,{interactive:true});get('results').replaceChildren();
        for(const item of result.items){const b=document.createElement('button');b.type='button';b.className='btn btn-outline-success d-block mb-2';b.textContent=[item.subject,item.from,item.date,item.to,item.cc].join(' · ');b.style.whiteSpace='normal';b.addEventListener('click',()=>{selected={...item,mode:root.querySelector('#coproMode').value};get('publish').disabled=false;note(word('เลือกลูปแล้ว กรุณากรอก To/CC ที่ต้องการอนุมัติ','Conversation selected. Enter the To/CC to approve.'));});get('results').append(b);}
        if(!result.items.length)note(word('ไม่พบลูปอีเมลใน Gmail นี้','No matching conversation found'));
      });
      action(get('publish'),async()=>{
        if(!selected)throw Error('Select a conversation');
        const context=await window.PC_EmailMsalContext(),identity=context.identity;
        if(!identity?.tenantId||!identity?.objectId)throw Error('Sign in with Microsoft again');
        const recipients={to:addresses(root.querySelector('#coproPublishTo').value),cc:addresses(root.querySelector('#coproPublishCc').value)},audienceInput=addresses(root.querySelector('#coproAudience').value);
        const audience=audienceInput.length?audienceInput.map(objectId=>({tenantId:identity.tenantId,objectId})):[identity];
        if(!window.confirm(word('อนุมัติผู้รับเหล่านี้หรือไม่?\n','Approve these recipients?\n')+selected.subject+'\n'+selected.mode+'\n'+JSON.stringify(recipients)))return;
        await client().request('threads',{method:'POST',body:{mode:selected.mode,messageId:selected.messageId,recipients,audience},interactive:true});note(word('อนุมัติลูปแล้ว ยังไม่มีการส่งเมล','Conversation approved. No email has been sent.'));
      });
      action(get('history'),async()=>{
        const campaigns=await client().list();get('history-list').replaceChildren();
        for(const c of campaigns){const p=document.createElement('p');p.textContent=c.key.replace('promo::c::','')+' / '+c.month+' — '+c.history.map(h=>h.event_key.split(':').at(-1)+': '+h.status).join(' · ');get('history-list').append(p);}
        if(!campaigns.length)note(word('ยังไม่มีงานใหม่ในโหมดทดสอบ','No new pilot campaigns'));
      });
      client().capabilities().then(c=>{get('enable').disabled=!c.coproEnabled&&!client().active();note(c.coproEnabled?(c.testSendingEnabled?word('ผู้ดูแลเปิดส่งทดสอบแล้ว','Test dispatch enabled by administrator'):word('สร้างคิวได้ แต่ผู้ดูแลยังปิดการส่งจริง','Queueing available; actual test dispatch is disabled')):word('ผู้ดูแลยังไม่เปิด Co-Promotion email หรือการตั้งค่ายังไม่ครบ','Co-Promotion email is disabled or setup is incomplete'));}).catch(e=>note(String(e.message||e)));
    }
  };
})(window);
